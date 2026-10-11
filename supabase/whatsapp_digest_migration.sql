-- Migration: one daily digest post to a WhatsApp group, mirroring the Telegram channel.
--
-- Three pieces, each with the same purpose as its Telegram counterpart:
--
--   jobs.whatsapp_posted_at  — the marker that makes the daily post idempotent.
--                              The whatsapp-bot service reads jobs that are
--                              published but not yet broadcast
--                              (whatsapp_posted_at IS NULL), sends ONE digest to
--                              the group, then stamps the column. A row is
--                              stamped only after WhatsApp confirms the send, so
--                              a transient failure retries next run instead of
--                              double-posting.
--
--   whatsapp_digests         — one row per UTC day. A row existing for today is
--                              the service's signal that today's digest has
--                              already been sent, so a re-run (the scheduler
--                              fires every two hours) cannot post a second one.
--                              job_ids records which jobs that day's post
--                              covered.
--
--   whatsapp_session         — the Baileys pairing/session blob. The service runs
--                              on a host with an ephemeral disk (Render free), so
--                              the WhatsApp Web multi-device credentials are
--                              persisted here instead of to a local file. When
--                              this row is empty the bot prints a fresh QR code.
--
-- The backfill at the end is deliberate, and matches channel_posted_at: every job
-- that is ALREADY published is marked as posted, so turning this on does not dump
-- the whole back catalogue into the group. Only jobs that reach 'published' after
-- this migration are broadcast.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS whatsapp_posted_at TIMESTAMPTZ;

COMMENT ON COLUMN jobs.whatsapp_posted_at IS
  'When this published job was posted to the WhatsApp group digest. NULL means it has not been broadcast yet.';

-- Existing published rows are marked as already broadcast (see note above).
UPDATE jobs
  SET whatsapp_posted_at = NOW()
  WHERE status = 'published'
    AND whatsapp_posted_at IS NULL;

-- The service's read is "published and not yet broadcast, oldest first". This
-- partial index keeps that read cheap no matter how large the board grows.
CREATE INDEX IF NOT EXISTS jobs_whatsapp_posted_at_null_idx
  ON jobs (first_seen_at)
  WHERE status = 'published' AND whatsapp_posted_at IS NULL;

create table if not exists public.whatsapp_digests (
  day date primary key,
  posted_at timestamptz not null default now(),
  job_ids uuid[] not null default '{}'
);

comment on table public.whatsapp_digests is
  'One row per UTC day: whether the WhatsApp digest was already sent today, and which jobs it covered.';
comment on column public.whatsapp_digests.day is
  'The UTC date this digest belongs to. The primary key, because posting twice in one day is the exact bug this table exists to stop.';
comment on column public.whatsapp_digests.job_ids is
  'The jobs that day''s post announced (and stamped whatsapp_posted_at).';

create table if not exists public.whatsapp_session (
  id smallint primary key default 1,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

comment on table public.whatsapp_session is
  'The persisted Baileys (WhatsApp Web) multi-device credentials for the digest bot, so the service can run on an ephemeral-disk host.';
comment on column public.whatsapp_session.payload is
  'The serialised { creds, keys } Baileys auth state as jsonb.';