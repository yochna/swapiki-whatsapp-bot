-- =============================================================================
-- Swapiki — Admin dashboard statistics
-- Run this once in Supabase Dashboard > SQL Editor (after full_redesign_migration.sql).
-- Safe to re-run.
--
-- Adds ONE Postgres function, get_admin_stats(), that returns every DB-backed
-- admin stat in a single round trip: total users, total recruiters, total
-- candidates, published/unpublished counts, and storage space used. It is
-- SECURITY DEFINER so it can read auth.users and storage.objects (schemas the
-- client can't query directly), but it checks admin status itself before
-- returning anything — same "everybody has RLS, this function double-checks"
-- pattern already used by public.is_admin().
--
-- "Time spent" is NOT in here — that's a behavioral/session metric, which
-- Postgres has no concept of. It's fetched separately from PostHog via
-- functions/api/admin-time-stats.js. Keeping the two paths separate means the
-- five numbers below always work even if PostHog is down or not configured yet.
-- =============================================================================

create or replace function public.get_admin_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Admin access required';
  end if;

  select json_build_object(
    'total_users', (select count(*) from auth.users),
    'total_candidates', (select count(*) from public.candidates),
    'total_recruiters', (select count(*) from public.recruiters),
    'published_count', (select count(*) from public.candidates where profile_status = 'published'),
    'unpublished_count', (select count(*) from public.candidates where profile_status is distinct from 'published'),
    'space_utilized_bytes', (
      select coalesce(sum((metadata->>'size')::bigint), 0)
      from storage.objects
      where bucket_id = 'candidate-files'
    ),
    'file_count', (
      select count(*)
      from storage.objects
      where bucket_id = 'candidate-files'
    ),

    -- "Just logged in" — signed up (exists in auth.users) but never created
    -- a candidate OR recruiter row, i.e. never picked a role / touched onboarding.
    'login_only_count', (
      select count(*) from auth.users u
      where not exists (select 1 from public.candidates c where c.user_id = u.id)
        and not exists (select 1 from public.recruiters r where r.user_id = u.id)
    ),

    -- Profile completion buckets, driven by the same completion_score the
    -- candidate-facing progress bar uses (30 base / +20 name+title / +25 has
    -- a project / +25 has a voice recording — see recalculateScore() in store.js).
    'profile_not_started_count', (
      select count(*) from public.candidates where coalesce(completion_score, 30) <= 30
    ),
    'profile_partial_count', (
      select count(*) from public.candidates where coalesce(completion_score, 30) between 31 and 69
    ),
    'profile_near_complete_count', (
      select count(*) from public.candidates where coalesce(completion_score, 30) between 70 and 99
    ),
    'profile_complete_count', (
      select count(*) from public.candidates where coalesce(completion_score, 30) >= 100
    ),

    -- Voice recording — a candidate "has recorded a voice" if ANY of their
    -- projects has a non-empty audio_url.
    'voice_recorded_count', (
      select count(distinct candidate_id) from public.projects
      where audio_url is not null and audio_url <> ''
    ),
    'voice_missing_count', (
      select count(*) from public.candidates c
      where not exists (
        select 1 from public.projects p
        where p.candidate_id = c.id and p.audio_url is not null and p.audio_url <> ''
      )
    )
  ) into result;

  return result;
end;
$$;

-- Let any authenticated client call it — the function's own admin check
-- (above) is what actually gates access, same as the is_admin() pattern.
grant execute on function public.get_admin_stats() to authenticated;
