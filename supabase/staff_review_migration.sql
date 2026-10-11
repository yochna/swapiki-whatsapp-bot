-- =====================================================================
-- Swapiki — Trust & Anti-Fraud: staff review flag
-- ---------------------------------------------------------------------
-- Adds a "Reviewed by the Swapiki team" flag to candidate profiles.
-- When an admin marks a profile as reviewed (during manual human
-- screening), the public profile shows a real, data-backed "Swapiki-
-- reviewed" badge. This powers trust badges WITHOUT faking anything:
-- the badge only ever appears after an actual human put eyes on the
-- profile.
--
-- Run this in the Supabase SQL Editor (prod DB used by the pilot),
-- then run the tests. Additive only — safe to run twice.
-- =====================================================================

alter table public.candidates
  add column if not exists staff_reviewed_at timestamptz null;
