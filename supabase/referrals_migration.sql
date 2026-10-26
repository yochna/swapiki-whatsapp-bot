-- Swapiki Referral Loop
-- Run once in Supabase (SQL Editor > Run). Idempotent - safe to re-run.
--
-- WHAT THIS IS FOR
-- Candidates invite other candidates. A personal invite link
-- (https://swapiki.com/?ref=<username>) is copied from the dashboard's
-- "Profile readiness" card. When someone signs up through that link and later
-- PUBLISHES their profile, the referrer is credited and unlocks extra
-- proof-project slots (see getMaxProjects() in js/store.js).
--
-- WHY A TABLE AND NOT A COUNTER
-- A bare integer on candidates cannot answer "who did I refer, and did they
-- actually publish?" - and it gives an attacker a single field to inflate. One
-- row per referred account is the audit trail, and the unique key on
-- referred_user_id makes "one account, one referral" a database guarantee.
--
-- WHY THE CLIENT CANNOT CHEAT
-- Rows are written only by record_referral(), which is SECURITY DEFINER and
-- takes the referred id from auth.uid() rather than from the caller - so you can
-- only ever record yourself as the referred party, never as someone else, and
-- never as your own referrer. Status is flipped to 'credited' only by the
-- publish trigger (also SECURITY DEFINER), so a candidate cannot mark their own
-- referral as complete. anon/authenticated have INSERT/UPDATE/DELETE revoked;
-- the only direct read is their own rows.
--
-- NOTHING BREAKS BEFORE THIS RUNS
-- The client calls the RPCs and treats "function does not exist" as "not
-- migrated yet": referrals are simply not tracked, the console names this file,
-- and the dashboard keeps working with the base slot count.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  -- Both sides are auth users. candidates.user_id is the same uuid, so the
  -- publish trigger can find the referred row by user_id.
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  -- The username captured at invite time, kept for display/audit even if the
  -- referrer later changes their handle.
  referrer_username text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  credited_at timestamptz,
  constraint referrals_status_check check (status in ('pending', 'credited')),
  constraint referrals_no_self check (referrer_id <> referred_user_id),
  -- One account can only ever be referred once, no matter how many invite
  -- links it opens.
  constraint referrals_referred_unique unique (referred_user_id)
);

comment on table public.referrals is
  'One row per referred account. Written only by record_referral(); credited only by the candidates publish trigger.';
comment on column public.referrals.status is
  'pending until the referred candidate publishes their profile, then credited.';

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_id, status);

alter table public.referrals enable row level security;

-- You can read the referrals you are part of (as referrer, to see your count, or
-- as the referred account). Nobody writes the table directly.
drop policy if exists "people read referrals they are part of" on public.referrals;
create policy "people read referrals they are part of"
  on public.referrals for select
  to authenticated
  using (auth.uid() = referrer_id or auth.uid() = referred_user_id);

revoke insert, update, delete on public.referrals from anon, authenticated;
grant select on public.referrals to authenticated;

-- ---------------------------------------------------------------------------
-- Record a referral
-- ---------------------------------------------------------------------------
-- Called by the referred, newly-created account, passing the username from the
-- ?ref= link it arrived through. Idempotent: a second call for the same account
-- is a no-op and reports reason 'already'. If the account is already published
-- when the referral is recorded, it is credited immediately; otherwise the
-- publish trigger below credits it later.
create or replace function public.record_referral(p_referrer_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referrer public.candidates%rowtype;
  v_published boolean := false;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_slug := lower(btrim(coalesce(p_referrer_username, '')));
  if length(v_slug) = 0 then
    return jsonb_build_object('recorded', false, 'reason', 'missing-referrer');
  end if;

  -- The referrer's own candidates row. Ordering by updated_at keeps this
  -- deterministic if a handle was ever duplicated, the same defensive choice
  -- loadProfileForUser makes.
  select * into v_referrer
    from public.candidates c
   where lower(c.username) = v_slug
   order by c.updated_at desc
   limit 1;

  if not found then
    return jsonb_build_object('recorded', false, 'reason', 'referrer-not-found');
  end if;
  if v_referrer.user_id = v_uid then
    return jsonb_build_object('recorded', false, 'reason', 'self');
  end if;

  select (profile_status = 'published') into v_published
    from public.candidates
   where user_id = v_uid
   order by updated_at desc
   limit 1;
  v_published := coalesce(v_published, false);

  insert into public.referrals
    (referrer_id, referred_user_id, referrer_username, status, credited_at)
  values (
    v_referrer.user_id,
    v_uid,
    v_referrer.username,
    case when v_published then 'credited' else 'pending' end,
    case when v_published then now() else null end
  )
  on conflict (referred_user_id) do nothing;

  -- ON CONFLICT DO NOTHING leaves FOUND false when nothing was inserted.
  if not found then
    return jsonb_build_object('recorded', false, 'reason', 'already');
  end if;

  return jsonb_build_object('recorded', true, 'credited', v_published);
end;
$$;

-- ---------------------------------------------------------------------------
-- Credit on publish
-- ---------------------------------------------------------------------------
-- The moment a referred candidate's profile moves into 'published', every
-- pending referral pointing at them is credited. SECURITY DEFINER so it can
-- write a table the publishing user has no direct access to; a candidate
-- therefore cannot credit their own referral by hand.
create or replace function public.credit_referral_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_status = 'published'
     and (old.profile_status is distinct from 'published') then
    update public.referrals
       set status = 'credited', credited_at = now()
     where referred_user_id = new.user_id
       and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_credit_referral on public.candidates;
create trigger candidates_credit_referral
  after update of profile_status on public.candidates
  for each row
  execute function public.credit_referral_on_publish();

-- ---------------------------------------------------------------------------
-- Read my counts
-- ---------------------------------------------------------------------------
-- total = people I invited; credited = how many have published. The dashboard
-- turns credited into unlocked project slots.
create or replace function public.my_referral_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total int;
  v_credited int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select count(*), count(*) filter (where status = 'credited')
    into v_total, v_credited
    from public.referrals
   where referrer_id = v_uid;

  return jsonb_build_object('total', v_total, 'credited', v_credited);
end;
$$;

-- Only signed-in users may call these. Explicit revoke first removes the
-- default execute privilege public functions get.
revoke all on function public.record_referral(text) from public;
revoke all on function public.my_referral_stats() from public;
grant execute on function public.record_referral(text) to authenticated;
grant execute on function public.my_referral_stats() to authenticated;

-- What the referral loop looks like right now, for whoever is running this.
select count(*) as referrals_recorded,
       count(*) filter (where status = 'credited') as referrals_credited
  from public.referrals;
