-- =============================================================================
-- Swapiki — link the `candidates` table to Supabase Auth and lock it down.
-- Run this once in Supabase Dashboard > SQL Editor (on your project).
--
-- Adjust the table/column names below if your existing `candidates` table
-- uses different casing than what's assumed here (id, username, name, title,
-- experience, location, bio, linkedin, updated_at — all already used by
-- js/store.js today).
-- =============================================================================

-- 1. Add a user_id column that ties each profile row to a real Supabase Auth
--    user, plus a profile_status column (draft/published) that the RLS
--    policy below needs.
alter table public.candidates
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists profile_status text default 'draft';

create index if not exists candidates_user_id_idx on public.candidates(user_id);

-- 2. Enable Row Level Security. Without this, RLS is off and anyone with the
--    publishable key can read/write any row — fine for a demo, not for a
--    real product where users have accounts.
alter table public.candidates enable row level security;

-- 3. Anyone (including logged-out visitors) can view PUBLISHED profiles —
--    this is what lets recruiters browse public candidate pages. Owners can
--    also see their own draft (unpublished) profile.
drop policy if exists "Public can view published profiles" on public.candidates;
create policy "Public can view published profiles"
  on public.candidates for select
  using (profile_status = 'published' or auth.uid() = user_id);

-- 4. Only a signed-in user can create a profile row, and only for themselves.
drop policy if exists "Users can insert own profile" on public.candidates;
create policy "Users can insert own profile"
  on public.candidates for insert
  with check (auth.uid() = user_id);

-- 5. Only the owner can edit their own profile row.
drop policy if exists "Users can update own profile" on public.candidates;
create policy "Users can update own profile"
  on public.candidates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 6. Only the owner can delete their own profile row.
drop policy if exists "Users can delete own profile" on public.candidates;
create policy "Users can delete own profile"
  on public.candidates for delete
  using (auth.uid() = user_id);

-- =============================================================================
-- Enable the Google provider for Supabase Auth (do this in the Dashboard, not
-- SQL): Authentication > Providers > Google > toggle on, and paste in the
-- same OAuth Client ID + Client Secret you create in Google Cloud Console.
-- This is required for supabase.auth.signInWithIdToken({ provider: 'google' })
-- to work — the frontend code alone is not enough.
-- =============================================================================
