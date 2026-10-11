-- Swapiki In-App Feedback
-- Collects feedback from anyone (even logged-out visitors) via the in-app
-- feedback widget. Run once in Supabase (SQL Editor > Run).
--
-- Client path: js/store.js submitFeedback() writes locally first, then inserts
-- to this table in an isolated call (like login_reminder_count), so a missing
-- migration degrades to local-only instead of breaking the app.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  category text not null default 'general',
  message text not null,
  url text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Anyone may submit feedback (logged-in or not). No public read path, so
-- spam pressure here is just storage bloat the admin queue handles.
drop policy if exists "Anyone can leave feedback" on public.feedback;
create policy "Anyone can leave feedback"
  on public.feedback for insert
  with check (true);

-- Admins read + delete feedback (same pattern as every other admin policy).
drop policy if exists "Admins can read feedback" on public.feedback;
create policy "Admins can read feedback"
  on public.feedback for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can delete feedback" on public.feedback;
create policy "Admins can delete feedback"
  on public.feedback for delete
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));