-- =============================================================================
-- Swapiki — Full database redesign
-- Run this once in Supabase Dashboard > SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. CANDIDATES — add the extra profile fields the app now reads/writes
--    (avatar, resume, stats, expertise tags) that weren't in the original table
-- -----------------------------------------------------------------------------
alter table public.candidates
  add column if not exists avatar text,
  add column if not exists resume_url text,
  add column if not exists education text,
  add column if not exists status text,
  add column if not exists expertise text[] default '{}',
  add column if not exists completion_score int default 30,
  add column if not exists views int default 0,
  add column if not exists shares int default 0,
  add column if not exists audio_listen_rate int default 0,
  add column if not exists email text,
  add column if not exists phone text;

-- -----------------------------------------------------------------------------
-- 1. PROJECTS — moves candidate project/portfolio entries out of localStorage
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id text primary key,
  candidate_id text references public.candidates(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  role text,
  impact text,
  tags text[] default '{}',
  github_url text,
  live_url text,
  takeaways text[] default '{}',
  audio_url text,
  audio_duration text,
  recorded_at text,
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists projects_candidate_id_idx on public.projects(candidate_id);
create index if not exists projects_user_id_idx on public.projects(user_id);

alter table public.projects enable row level security;

drop policy if exists "Public can view projects of published profiles" on public.projects;
create policy "Public can view projects of published profiles"
  on public.projects for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.candidates c
      where c.id = projects.candidate_id and c.profile_status = 'published'
    )
  );

drop policy if exists "Owners can insert own projects" on public.projects;
create policy "Owners can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owners can update own projects" on public.projects;
create policy "Owners can update own projects"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners can delete own projects" on public.projects;
create policy "Owners can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 2. SHARE EVENTS — analytics log (profile views/shares), replaces localStorage array
-- -----------------------------------------------------------------------------
create table if not exists public.share_events (
  id bigint generated always as identity primary key,
  candidate_id text references public.candidates(id) on delete cascade,
  type text,
  referrer text,
  created_at timestamptz default now()
);

create index if not exists share_events_candidate_id_idx on public.share_events(candidate_id);

alter table public.share_events enable row level security;

-- Anyone (including logged-out visitors) can log a share/view event —
-- this is write-only analytics, not sensitive data.
drop policy if exists "Anyone can log a share event" on public.share_events;
create policy "Anyone can log a share event"
  on public.share_events for insert
  with check (true);

-- Only the candidate who owns the profile can read their own analytics.
drop policy if exists "Owners can view own share events" on public.share_events;
create policy "Owners can view own share events"
  on public.share_events for select
  using (
    exists (
      select 1 from public.candidates c
      where c.id = share_events.candidate_id and c.user_id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 3. RECRUITERS — real recruiter accounts (self-registration on top of Supabase Auth)
-- -----------------------------------------------------------------------------
create table if not exists public.recruiters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  company text,
  created_at timestamptz default now()
);

alter table public.recruiters enable row level security;

-- A logged-in user can register themselves as a recruiter (self-serve signup).
drop policy if exists "Users can register themselves as a recruiter" on public.recruiters;
create policy "Users can register themselves as a recruiter"
  on public.recruiters for insert
  with check (auth.uid() = user_id);

-- A recruiter can read/update their own row. Candidates can also look up a
-- recruiter's public name/company (e.g. to show "Note from Acme Corp").
drop policy if exists "Recruiters visible to authenticated users" on public.recruiters;
create policy "Recruiters visible to authenticated users"
  on public.recruiters for select
  using (auth.role() = 'authenticated');

drop policy if exists "Recruiters can update own row" on public.recruiters;
create policy "Recruiters can update own row"
  on public.recruiters for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 4. CANDIDATE PIPELINE — per-recruiter private notes/status on a candidate
--    (each recruiter has their own row per candidate; candidates can see who
--    has taken an interest in them, but not edit these notes)
-- -----------------------------------------------------------------------------
create table if not exists public.candidate_pipeline (
  candidate_id text references public.candidates(id) on delete cascade,
  recruiter_id uuid references public.recruiters(user_id) on delete cascade,
  status text default 'reviewing',
  notes text,
  updated_at timestamptz default now(),
  primary key (candidate_id, recruiter_id)
);

alter table public.candidate_pipeline enable row level security;

-- A recruiter can see their own notes on any candidate. A candidate can see
-- ALL pipeline rows written about them (so they know who's shortlisted them)
-- but cannot edit these — they're the recruiter's private evaluation.
drop policy if exists "Recruiters see own notes, candidates see notes about them" on public.candidate_pipeline;
create policy "Recruiters see own notes, candidates see notes about them"
  on public.candidate_pipeline for select
  using (
    auth.uid() = recruiter_id
    or exists (
      select 1 from public.candidates c
      where c.id = candidate_pipeline.candidate_id and c.user_id = auth.uid()
    )
  );

-- Only a registered recruiter can write a pipeline note, and only under their own recruiter_id.
drop policy if exists "Recruiters can insert own notes" on public.candidate_pipeline;
create policy "Recruiters can insert own notes"
  on public.candidate_pipeline for insert
  with check (
    auth.uid() = recruiter_id
    and exists (select 1 from public.recruiters r where r.user_id = auth.uid())
  );

drop policy if exists "Recruiters can update own notes" on public.candidate_pipeline;
create policy "Recruiters can update own notes"
  on public.candidate_pipeline for update
  using (auth.uid() = recruiter_id)
  with check (auth.uid() = recruiter_id);


-- -----------------------------------------------------------------------------
-- 6. ADMINS — manually-granted, full view + manage access across everything.
--    Initial admin rows can only be added by you directly in Supabase (see
--    below); after that, existing admins can promote further admins from
--    inside the app itself via a secure server-side lookup (see
--    functions/api/admin-promote.js) — nobody can grant themselves admin.
-- -----------------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

alter table public.admins enable row level security;

-- SECURITY DEFINER helper: checks admin status while bypassing RLS on the
-- admins table itself, avoiding self-referential recursion in policies below.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- A logged-in user may check whether THEY are an admin (needed so the app
-- can show/hide the admin dashboard).
drop policy if exists "Users can check their own admin status" on public.admins;
create policy "Users can check their own admin status"
  on public.admins for select
  using (auth.uid() = user_id);

-- Any existing admin can see the full admin list (to manage/remove others).
drop policy if exists "Admins can view all admins" on public.admins;
create policy "Admins can view all admins"
  on public.admins for select
  using (public.is_admin());

-- Any existing admin can remove another admin's access.
drop policy if exists "Admins can remove other admins" on public.admins;
create policy "Admins can remove other admins"
  on public.admins for delete
  using (public.is_admin());

-- Deliberately no INSERT policy for regular client requests — new admins can
-- only be added either by you directly in the Supabase dashboard (which runs
-- as a privileged role that bypasses RLS), or via the admin-promote server
-- function below, which uses the service role key and verifies the caller
-- is already an admin before inserting.


-- -----------------------------------------------------------------------------
-- 7. ADMIN OVERRIDE POLICIES — let an admin view + manage every row on every
--    table, bypassing the normal "only the owner" restriction.
-- -----------------------------------------------------------------------------

-- candidates: admin can view all profiles (not just published ones), and can
-- update (e.g. force-publish/unpublish) or delete any profile.
drop policy if exists "Admins can view all candidates" on public.candidates;
create policy "Admins can view all candidates"
  on public.candidates for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can update any candidate" on public.candidates;
create policy "Admins can update any candidate"
  on public.candidates for update
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can delete any candidate" on public.candidates;
create policy "Admins can delete any candidate"
  on public.candidates for delete
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- projects: admin can view/delete any project (e.g. cleaning up a removed profile).
drop policy if exists "Admins can view all projects" on public.projects;
create policy "Admins can view all projects"
  on public.projects for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can delete any project" on public.projects;
create policy "Admins can delete any project"
  on public.projects for delete
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- recruiters: admin can view the full recruiter list.
drop policy if exists "Admins can view all recruiters" on public.recruiters;
create policy "Admins can view all recruiters"
  on public.recruiters for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can delete any recruiter" on public.recruiters;
create policy "Admins can delete any recruiter"
  on public.recruiters for delete
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- candidate_pipeline: admin can view every recruiter's notes on every candidate.
drop policy if exists "Admins can view all pipeline notes" on public.candidate_pipeline;
create policy "Admins can view all pipeline notes"
  on public.candidate_pipeline for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- share_events: admin can view all analytics, not just their own profile's.
drop policy if exists "Admins can view all share events" on public.share_events;
create policy "Admins can view all share events"
  on public.share_events for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('candidate-files', 'candidate-files', true)
on conflict (id) do nothing;

-- Public read access — profile photos/resumes/audio need to be viewable by
-- anyone visiting a published candidate page, including logged-out recruiters.
drop policy if exists "Public can view candidate media" on storage.objects;
create policy "Public can view candidate media"
  on storage.objects for select
  using (bucket_id = 'candidate-files');

-- A user may only upload into a folder named after their own user ID
-- (e.g. "3fa2.../avatar.png"), enforced by checking the first path segment.
drop policy if exists "Users can upload to own folder" on storage.objects;
create policy "Users can upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'candidate-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own files" on storage.objects;
create policy "Users can update own files"
  on storage.objects for update
  using (
    bucket_id = 'candidate-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own files" on storage.objects;
create policy "Users can delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'candidate-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
