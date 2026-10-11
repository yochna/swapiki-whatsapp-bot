-- -----------------------------------------------------------------------------
-- Email preferences for the jobs-drop email (the "unsubscribe" of the PDF:
-- "email frequency or completely unsubscribe option").
--
-- One row per user, keyed by user_id. The digest route reads it to decide how
-- often a person hears from us, and the /unsubscribe page writes it. A missing
-- row means the default: the standard fortnightly drop.
--
-- Safe to re-run (create table if not exists).
-- -----------------------------------------------------------------------------

create table if not exists public.email_preferences (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  -- 'fortnightly' = the normal drop every 2 weeks
  -- 'monthly'     = at most once a month
  -- 'off'         = no jobs-drop emails at all
  digest_frequency text not null default 'fortnightly'
    check (digest_frequency in ('fortnightly', 'monthly', 'off')),
  updated_at       timestamptz not null default now()
);

alter table public.email_preferences enable row level security;

-- A signed-in candidate may read and update their own preference row. The
-- /unsubscribe page and the digest route use the service role (bypasses RLS),
-- so this policy only matters if the SPA ever exposes an in-app toggle.
drop policy if exists "users manage own email preferences" on public.email_preferences;
create policy "users manage own email preferences" on public.email_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.email_preferences to authenticated;
