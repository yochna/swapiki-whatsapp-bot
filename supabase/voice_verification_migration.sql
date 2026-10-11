-- =============================================================================
-- Swapiki - live-recording confirmation columns for the `candidates` table.
-- Run this once in Supabase Dashboard > SQL Editor (on your project).
--
-- Adds the anti-fraud / anti-spam signal the audio engine (js/audioEngine.js)
-- and profile badges depend on:
--   voice_verified             whether the candidate's recording was captured live
--                              in one session, with this attempt's random spoken
--                              code heard in the audio.
--   voice_verified_at          when the most recent successful check happened.
--   voice_signature            NO LONGER USED. Kept only so the table shape does
--                              not change for anyone who already ran this. The
--                              app never reads or writes it any more (see below).
--   voice_verification_count   how many verification attempts have been made -
--                              a high count-with-failures is a spam signal.
--
-- What these columns do NOT mean: they are not an identity check. A previous
-- version of the app wrote MFCC "voiceprint" signatures here and showed
-- recruiters a "Voice verified" badge. MFCC means describe the phonetics of the
-- sentence far more than the speaker, and the 0.80 cosine threshold it compared
-- against was never calibrated against a real impostor, so the badge overstated
-- what was actually being measured. The badge is now "Live recording confirmed",
-- which is exactly what the check proves: the audio is not a replay.
--
-- No RLS changes are needed: the existing "Users can update own profile"
-- policy (auth_migration.sql) already covers these columns, and public select
-- still returns them for the badge on public profiles.
-- =============================================================================

alter table public.candidates
  add column if not exists voice_verified boolean not null default false,
  add column if not exists voice_verified_at timestamptz,
  add column if not exists voice_signature numeric[],
  add column if not exists voice_verification_count integer not null default 0;

comment on column public.candidates.voice_verified is
  'True once the candidate passed the live-recording check (live mic + this attempt''s random spoken code heard by the browser speech recogniser). Not an identity check.';
comment on column public.candidates.voice_verified_at is
  'ISO timestamp of the most recent successful live-recording check.';
comment on column public.candidates.voice_signature is
  'Unused legacy column. Was an MFCC mean/std "voiceprint" (26 floats) that the app no longer reads or writes, and which could not distinguish speakers. Left in place so the table shape is unchanged.';
comment on column public.candidates.voice_verification_count is
  'Total live-recording check attempts. A high count with voice_verified=false is a spam/fraud flag for admin review.';

-- Optional cleanup, run manually once you are sure no rollback is needed.
-- This permanently deletes biometric data, so it is left commented out on
-- purpose: leave it to you.
--
-- update public.candidates set voice_signature = null where voice_signature is not null;
-- alter table public.candidates drop column voice_signature;
