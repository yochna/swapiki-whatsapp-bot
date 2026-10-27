-- =============================================================================
-- Swapiki — pilot: any profile link (draft OR published) is publicly viewable.
-- Safe to re-run: every policy it creates is dropped first.
-- Revert: restore the "published only" policies from auth_migration.sql and
--         full_redesign_migration.sql.
-- =============================================================================

-- 1. Anyone (logged in or not) can view ANY candidate's profile, draft included.
drop policy if exists "Public can view published profiles" on public.candidates;
drop policy if exists "Authenticated can view all candidate profiles" on public.candidates;
drop policy if exists "Anyone can view all candidate profiles" on public.candidates;
create policy "Anyone can view all candidate profiles"
  on public.candidates for select
  using (true);

-- 2. Draft profiles need their projects visible too for the full page to load.
drop policy if exists "Public can view projects of published profiles" on public.projects;
drop policy if exists "Authenticated can view all projects" on public.projects;
drop policy if exists "Anyone can view all projects" on public.projects;
create policy "Anyone can view all projects"
  on public.projects for select
  using (true);