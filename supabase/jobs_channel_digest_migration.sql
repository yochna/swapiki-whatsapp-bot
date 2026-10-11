-- Migration: one daily digest post to the public Telegram channel.
--
-- The /channel-post route used to broadcast one message per job, every two
-- hours. That is a lot of channel traffic, and a channel that posts loudly
-- every two hours is a channel people mute. The route now collapses every job
-- into ONE post per day; this table is what makes that idempotent.
--
-- channel_digests has one row per UTC day. A row existing for today is the
-- route's signal that today's digest has already been sent, so a re-run (the
-- scheduler fires every two hours) cannot post a second one. job_ids records
-- which jobs that day's post covered, so a later glance can tell whether an
-- unstamped job was already announced once.

create table if not exists public.channel_digests (
  day date primary key,
  posted_at timestamptz not null default now(),
  job_ids uuid[] not null default '{}'
);

comment on table public.channel_digests is
  'One row per UTC day: whether /channel-post already posted its daily digest, and which jobs it covered.';
comment on column public.channel_digests.day is
  'The UTC date this digest belongs to. The primary key, because posting twice in one day is the exact bug this table exists to stop.';
comment on column public.channel_digests.job_ids is
  'The jobs that day''s post announced (and stamped channel_posted_at).';