-- Migration: weekly Telegram job digest for linked, published candidates.
--
-- /telegram-digest sends each linked, published, channel-joined candidate a
-- personal DM with the newest roles that match their profile skills — at most
-- once per week. This column is the stamp that makes that idempotent: a row is
-- written only after Telegram confirms the send, and the next poll skips anyone
-- whose stamp is less than six days old.
--
-- The scheduler calls the route every two hours (it already calls /notify and
-- /channel-post on the same cadence), and the cooldown column is what turns
-- that into a weekly message — no second cron trigger needed.

alter table public.candidates
  add column if not exists telegram_digest_sent_at timestamptz;

-- The route's read is "linked, joined, published, not messaged recently". This
-- keeps that scan cheap regardless of how many profiles accumulate.
create index if not exists candidates_telegram_digest_eligible_idx
  on public.candidates (telegram_digest_sent_at)
  where telegram_id is not null
    and channel_joined_at is not null
    and profile_status = 'published';

comment on column public.candidates.telegram_digest_sent_at is
  'When the candidate last received the weekly Telegram job digest. Null means they have never been sent one; the route skips anyone messaged within the last six days.';