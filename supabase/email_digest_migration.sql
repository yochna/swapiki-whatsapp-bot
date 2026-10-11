-- -----------------------------------------------------------------------------
-- Email digest system for the Swapiki jobs board.
-- Runs a weekly "Top jobs & internships" email to every user. The card at the
-- top ranks openings by real candidate interest (recorded clicks on the
-- "Apply on the job site" button), then re-ranks per user by skill overlap
-- with their profile.
--
-- Safe to re-run (create table if not exists).
-- -----------------------------------------------------------------------------

-- 1. Interest tracking: every real click on a job's apply link, de-duplicated
--    to one click per candidate per job per DAY (so a hammering candidate
--    can't inflate a listing's rank).
create table if not exists public.job_clicks (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null default current_date,
  device     text,
  created_at timestamptz not null default now()
);

create unique index if not exists job_clicks_one_per_day
  on public.job_clicks (job_id, user_id, day);

create index if not exists job_clicks_recent
  on public.job_clicks (created_at desc);

alter table public.job_clicks enable row level security;

-- A candidate may read and insert their own click rows only.
drop policy if exists "candidate reads own clicks" on public.job_clicks;
create policy "candidate reads own clicks" on public.job_clicks
  for select using (auth.uid() = user_id);

drop policy if exists "candidate records own click" on public.job_clicks;
create policy "candidate records own click" on public.job_clicks
  for insert with check (auth.uid() = user_id);

grant select, insert on public.job_clicks to authenticated;

-- 2. Send log: every digest email the cron worker sends (for admin review /
--    debugging). Written by the server with the service role (bypasses RLS);
--    admins read via their existing admin RLS pattern.
create table if not exists public.digest_sends (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  email      text not null,
  job_count  int not null default 0,
  status     text not null,               -- sent | failed | skipped
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists digest_sends_recent
  on public.digest_sends (created_at desc);

alter table public.digest_sends enable row level security;

drop policy if exists "admins manage digest sends" on public.digest_sends;
create policy "admins manage digest sends" on public.digest_sends
  for all using (
    exists (select 1 from public.admins a where a.user_id = auth.uid())
  );

grant select on public.digest_sends to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Weekly schedule (run these AFTER the deployment has the secrets set).
--
--    NOTE: the scheduler worker now calls /api/cron-send-digest as its step 5
--    and the route enforces a 14-day per-user cooldown from digest_sends, so
--    this pg_cron block is OPTIONAL. Use it only if you want a Supabase-side
--    trigger instead of (or in addition to) the worker - the cooldown makes a
--    second trigger harmless, never a duplicate email.
--
--    a. Enable the two extensions (Supabase Dashboard -> Database -> Extensions,
--       or run): create extension if not exists pg_cron; create extension if
--       not exists pg_net;
--
--    b. Schedule the job. Replace the URL and secret below:
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('swapiki-weekly-digest') where exists (
  select 1 from cron.job where jobname = 'swapiki-weekly-digest'
);

select cron.schedule(
  'swapiki-weekly-digest',
  '0 9 * * 1 Asia/Kolkata',          -- Mondays, 9am IST
  $$ select net.http_post(
       url    := 'https://PREVIEW_ALIAS.api.pages.dev/api/cron-send-digest',
       headers := '{"Content-Type":"application/json","x-cron-secret":"REPLACE_WITH_DIGEST_CRON_SECRET"}'::jsonb,
       body   := '{}'::jsonb
     ) $$
);

--    c. To stop it later: select cron.unschedule('swapiki-weekly-digest');
-- -----------------------------------------------------------------------------