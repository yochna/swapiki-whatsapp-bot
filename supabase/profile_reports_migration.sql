-- Swapiki Profile Reports
-- The visitor-facing "Report this profile" path. Run once in Supabase
-- (SQL Editor > Run).
--
-- Why this exists: profiles publish themselves, and the admin panel can already
-- unpublish or delete one - but only if someone notices it. This table is the
-- discovery layer: a visitor flags a scam and the report shows up in the admin
-- queue (and pings the team's Telegram) so a takedown can happen in minutes.
--
-- Write path: the browser calls POST /api/report-profile, a Pages Function that
-- inserts here with the SERVICE ROLE and then alerts Telegram. The service role
-- bypasses RLS, so there is deliberately NO public insert policy - the browser
-- never writes this table directly.
--
-- Read path: admins read, update (resolve) and delete via their existing admin
-- RLS pattern, the same one every other admin surface uses.

create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  -- candidates.id is text (the auth user id), not uuid - match it exactly or
  -- the foreign key cannot be created.
  candidate_id text references public.candidates(id) on delete cascade,
  reason text not null default 'other',
  details text,
  reporter_email text,
  page_url text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- The admin queue reads only the open reports, newest first.
create index if not exists profile_reports_status_created_idx
  on public.profile_reports (status, created_at desc);
create index if not exists profile_reports_candidate_idx
  on public.profile_reports (candidate_id);

alter table public.profile_reports enable row level security;

-- No insert policy: the Pages Function writes with the service role, which
-- bypasses RLS. A logged-out visitor still files a report; a logged-in one does
-- not get a direct path to the table.

drop policy if exists "Admins can read profile reports" on public.profile_reports;
create policy "Admins can read profile reports"
  on public.profile_reports for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can update profile reports" on public.profile_reports;
create policy "Admins can update profile reports"
  on public.profile_reports for update
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
