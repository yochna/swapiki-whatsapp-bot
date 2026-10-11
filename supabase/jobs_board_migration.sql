-- -----------------------------------------------------------------------------
-- Swapiki — Jobs Board (pilot MVP)
-- Creates the `jobs` table with admin-only RLS and a read RPC that enforces the
-- 80%-profile gate server-side (same defense-in-depth pattern as the recruiter
-- directory's search_candidates()).
--
--   Applies to: swapiki-test (and later swapiki prod) Supabase instances.
--   Run in the Supabase SQL editor, in order after the other migrations.
-- -----------------------------------------------------------------------------

create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  raw_text    text not null default '',
  title       text not null default '',
  company     text not null default '',
  location    text,
  category    text not null default 'it',          -- it | bfsi | any
  salary      text,
  contact     text,                                 -- email / WhatsApp / apply link from the post
  source      text not null default 'whatsapp-forward', -- whatsapp-forward | direct-post | other
  skills      text[] not null default '{}',
  description text not null default '',
  status      text not null default 'draft',        -- draft | published
  posted_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_created_idx on public.jobs(created_at desc);

alter table public.jobs enable row level security;

-- Admins-only management. No public/anon read of the table at all: published
-- jobs are served exclusively through get_published_jobs() (which enforces the
-- 80% completion gate), so the gate can't be bypassed by direct queries.
drop policy if exists "Admins can view all jobs" on public.jobs;
create policy "Admins can view all jobs"
  on public.jobs for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can insert jobs" on public.jobs;
create policy "Admins can insert jobs"
  on public.jobs for insert
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can update jobs" on public.jobs;
create policy "Admins can update jobs"
  on public.jobs for update
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can delete jobs" on public.jobs;
create policy "Admins can delete jobs"
  on public.jobs for delete
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- get_published_jobs() — the ONLY way the app lists jobs for end users.
-- Server-side gate: returns published jobs only for a logged-in candidate whose
-- profile is >= 80% complete, OR for admins. Everyone else gets [].
--
-- RUN ORDER: apply supabase/jobs_ingest_migration.sql FIRST. This function reads
-- apply_url, first_seen_at, salary_min and salary_max, which that migration adds;
-- against an older schema the create fails outright and the in-app board breaks.
--
-- apply_url is what makes a card clickable. Without it in this projection every
-- imported listing arrives with no link, so Apply silently does nothing on the
-- majority of the board — the RPC is the app's only read path, so a column left
-- out here is a column the board can never see.
-- -----------------------------------------------------------------------------
create or replace function public.get_published_jobs()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'title', j.title,
        'company', j.company,
        'location', j.location,
        'category', j.category,
        'salary', j.salary,
        'contact', j.contact,
        'apply_url', j.apply_url,
        'first_seen_at', j.first_seen_at,
        'salary_min', j.salary_min,
        'salary_max', j.salary_max,
        'source', j.source,
        'skills', j.skills,
        'description', j.description,
        'raw_text', j.raw_text,
        'created_at', j.created_at
      )
      order by j.created_at desc
    ),
    '[]'::jsonb
  )
  from public.jobs j
  where j.status = 'published'
    and (
      exists (
        select 1 from public.candidates c
        where c.user_id = auth.uid() and c.completion_score >= 80
      )
      or exists (
        select 1 from public.admins a where a.user_id = auth.uid()
      )
    );
$$;

revoke execute on function public.get_published_jobs() from public, anon;
grant execute on function public.get_published_jobs() to authenticated;