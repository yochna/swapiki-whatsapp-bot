-- =============================================================================
-- Swapiki - profile truth attestation columns for the `candidates` table.
-- Run this once in Supabase Dashboard > SQL Editor (on your project).
--
-- Records the Edit Profile form's "everything I write here is true and is my
-- own work" agreement:
--   profile_attested_at    when the candidate last saved the profile while
--                          ticking that box.
--   profile_attested_name  the full name as typed at that moment, so the record
--                          still makes sense if the profile name changes later.
--
-- Every save through the Edit Profile form requires the tick, so these columns
-- always describe the profile as it stood at the last save. They are evidence
-- for a specific save, not a standing quality claim about the person: anyone
-- can tick a box, so this is deliberately NOT surfaced as a trust badge and
-- should never be read as "a human verified this work".
--
-- The columns are nullable, so a profile that has never been attested simply
-- has no value and the UI shows nothing.
--
-- No RLS changes are needed: the existing "Users can update own profile" policy
-- in auth_migration.sql already covers these columns, and public select returns
-- them for the quiet "attested on <date>" line on a public profile.
-- =============================================================================

alter table public.candidates
  add column if not exists profile_attested_at timestamptz,
  add column if not exists profile_attested_name text;

comment on column public.candidates.profile_attested_at is
  'When the candidate last saved their profile while confirming that its contents are true and their own work. Not a human review of the work itself.';
comment on column public.candidates.profile_attested_name is
  'The candidate''s full name as typed at the moment of that attestation.';
