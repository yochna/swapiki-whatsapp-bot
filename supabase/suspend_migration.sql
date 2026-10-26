-- Swapiki — suspended profile status
--
-- The fraud takedown state, the "freeze" half of the report pipeline. A reported
-- profile is frozen by setting profile_status = 'suspended'. The public site
-- already refuses anything that is not 'published' — the profile SSR, the
-- "Public can view published profiles" RLS policy and the sitemap all key off
-- 'published' — so a suspended profile disappears exactly like a draft. The
-- value is kept distinct, though, so the admin list can show a takedown rather
-- than an unfinished draft.
--
-- profile_status is already a plain `text` column (auth_migration.sql), so
-- 'suspended' needs no column change. This migration closes the one real hole:
-- the candidate owns their own row, and the "Users can update own profile"
-- policy would let a suspended candidate simply flip profile_status back to
-- 'published' and reappear. This trigger reverts that move. Once a row is
-- 'suspended', only an admin (or the service role) can take it off 'suspended'.
-- A candidate can still edit every other field; only the status is held.
--
-- Safe to re-run. Run once in the Supabase SQL editor.

create or replace function public.protect_suspended_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guard only a move OUT of 'suspended'. Every other transition (draft ->
  -- published, published -> draft, plain edits) is untouched, so the ordinary
  -- publish flow behaves exactly as before.
  if old.profile_status = 'suspended'
     and new.profile_status is distinct from 'suspended'
     and coalesce(auth.role(), '') <> 'service_role'
     and not exists (select 1 from public.admins a where a.user_id = auth.uid())
  then
    new.profile_status := 'suspended';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_suspended_profile on public.candidates;
create trigger protect_suspended_profile
  before update on public.candidates
  for each row
  execute function public.protect_suspended_profile();
