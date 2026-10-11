-- -----------------------------------------------------------------------------
-- Recruiter directory RPC — the ONLY way the app lists published candidates.
-- Enforces (server-side) that only VERIFIED recruiters may see the directory.
-- Returns a JSON array of safe, public-ish directory fields only — no email,
-- phone, resume URLs, projects, etc. Those remain behind per-profile RLS on the
-- shared-link pages.
--
--   Applies to: swapiki-test (and later swapiki prod) Supabase instances.
--   Run in the Supabase SQL editor.
-- -----------------------------------------------------------------------------

create or replace function public.search_candidates()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'username', c.username,
        'name', c.name,
        'title', c.title,
        'experience', c.experience,
        'location', c.location,
        'expertise', c.expertise,
        'status', c.status,
        'profile_status', c.profile_status,
        'voice_verified', c.voice_verified,
        'staff_reviewed_at', c.staff_reviewed_at,
        'completion_score', c.completion_score,
        'updated_at', c.updated_at
      )
      order by c.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.candidates c
  where c.profile_status = 'published'
    and exists (
      select 1
      from public.recruiters r
      where r.user_id = auth.uid()
        and r.verification_status = 'verified'
    );
$$;

-- Only signed-in users may call it at all; the function itself refuses anyone
-- who is not a VERIFIED recruiter (returns []). Guests and candidates get an
-- empty list, not an error, so the locked UI handles them gracefully.
revoke execute on function public.search_candidates() from public, anon;

grant execute on function public.search_candidates() to authenticated;