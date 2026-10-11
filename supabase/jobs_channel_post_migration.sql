-- Migration: broadcast published jobs to the public Telegram channel.
--
-- Adds jobs.channel_posted_at, the marker that makes channel broadcasting
-- idempotent. The /channel-post route reads jobs that are published but not yet
-- broadcast (channel_posted_at IS NULL), posts each one to the channel, then
-- stamps the column. A row is only stamped after Telegram confirms the send, so
-- a transient failure retries next run instead of dropping the job.
--
-- The backfill at the end is deliberate: every job that is ALREADY published is
-- marked as posted, so turning this on does not dump the whole back catalogue
-- into the channel. Only jobs that reach 'published' after this migration are
-- broadcast. To re-broadcast one, clear its channel_posted_at:
--
--   UPDATE jobs SET channel_posted_at = NULL WHERE id = '<uuid>';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS channel_posted_at TIMESTAMPTZ;

COMMENT ON COLUMN jobs.channel_posted_at IS
  'When this published job was posted to the public Telegram channel. NULL means it has not been broadcast yet.';

-- Existing published rows are marked as already broadcast (see note above).
UPDATE jobs
  SET channel_posted_at = NOW()
  WHERE status = 'published'
    AND channel_posted_at IS NULL;

-- The route's read is "published and not yet broadcast, oldest first". This
-- partial index keeps that read cheap no matter how large the board grows.
CREATE INDEX IF NOT EXISTS jobs_channel_posted_at_null_idx
  ON jobs (first_seen_at)
  WHERE status = 'published' AND channel_posted_at IS NULL;