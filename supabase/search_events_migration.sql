-- Search-events tracking for the "Trending searches" card in nudge emails.
-- The jobs board records every real search term (see js/store.js
-- recordSearchEvent, throttled client-side) into this table. The nudge
-- worker tallies the last 7 days and shows the top terms in the no_login /
-- no_project / no_voice emails.
--
-- RLS: ANYONE may INSERT a search event row (the job board is public), but
-- only admins (and the service role the worker uses, which bypasses RLS)
-- may read the rows — search history is internal analytics.

create table if not exists public.search_events (
  id bigint generated always as identity primary key,
  query text not null check (length(trim(query)) >= 2),
  created_at timestamptz not null default now()
);

comment on table public.search_events is
  'Job-board search keywords, one row per recorded search. Feeds the "Trending searches" card in nudge emails.';

alter table public.search_events enable row level security;

drop policy if exists "Anyone can record a search" on public.search_events;
create policy "Anyone can record a search"
  on public.search_events
  for insert
  with check (query is not null and length(trim(query)) >= 2);

drop policy if exists "Admins can read search activity" on public.search_events;
create policy "Admins can read search activity"
  on public.search_events
  for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create index if not exists search_events_created_at_idx on public.search_events (created_at);