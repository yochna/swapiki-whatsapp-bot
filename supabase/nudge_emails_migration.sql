-- Run this in the Supabase SQL editor once.
-- Tracks the last "nudge" email sent to each candidate so the automated
-- reminder worker never emails the same person more than once a week for
-- the same reason (see worker_setup/nudge-emails-worker.js).

alter table candidates
  add column if not exists last_nudge_type text,
  add column if not exists last_nudge_sent_at timestamptz;

comment on column candidates.last_nudge_type is
  'One of: no_login, no_voice, no_project — whichever reminder email was sent most recently.';
comment on column candidates.last_nudge_sent_at is
  'When the last reminder email (of any type) was sent to this candidate.';
