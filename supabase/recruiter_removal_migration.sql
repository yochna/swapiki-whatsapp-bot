-- =============================================================================
-- Swapiki — Recruiter system removal
--
-- The front-end no longer has any recruiter surface: no Recruit directory, no
-- recruiter workspace / pipeline panel, no recruiter signup/verification, and
-- no admin "Recruiters" table. This cleanup migration removes the DB layer
-- those features were built on and fixes the admin stats function that counted
-- them.
--
-- Run ONCE in Supabase Dashboard > SQL Editor AFTER the new build is deployed.
-- Ordering matters here (see notes below); the file is safe to re-run.
-- =============================================================================

-- 1. Drop the server function that gated the Recruit directory. This MUST run
--    before dropping the tables below, otherwise the function body would be
--    left referencing tables that no longer exist.
drop function if exists public.search_candidates();

-- 2. Drop the pipeline + recruiter tables entirely. `cascade` removes their
--    RLS policies, indexes, and the foreign keys automatically. After this no
--    SQL in this file may reference these tables again (get_admin_stats below
--    intentionally does not).
drop table if exists public.candidate_pipeline cascade;
drop table if exists public.recruiters cascade;

-- 3. Recreate get_admin_stats() WITHOUT the recruiter metrics. The original
--    counted `total_recruiters` and treated a user as "login only" when they
--    had neither a candidate row NOR a recruiter row. Now that recruiters are
--    gone, "login only" simply means "signed up but never created a candidate".
--    Same security posture as before: SECURITY DEFINER + an in-function admin
--    check (see public.is_admin()), callable by any authenticated client.
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
    -- a candidate row, i.e. never touched onboarding.
    'login_only_count', (
      select count(*) from auth.users u
      where not exists (select 1 from public.candidates c where c.user_id = u.id)
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

-- Same grant as before: the function's own admin check is the gate.
grant execute on function public.get_admin_stats() to authenticated;