-- -----------------------------------------------------------------------------
-- Swapiki — Daily job-post allowance for the resume-draft and interview-prep tools
--
--   Applies to: swapiki-test, then swapiki (prod) Supabase instances.
--   Run in the Supabase SQL editor. Idempotent - safe to re-run.
--
-- WHAT THIS IS FOR
-- Resume draft and interview prep are the two accelerators that turn a listing
-- into something a candidate can actually send. They are also the two places a
-- single account could sit all day, burning the studio's goodwill (and, later,
-- any per-call model cost) on the same board. So each account gets a small
-- daily allowance: five distinct job posts a day, shared across both tools.
--
-- "Distinct job posts", not "five button presses": re-opening the resume draft
-- for a job you already used today is free, because it is the same listing. The
-- unique key below is (user_id, usage_day, job_id), which is what makes that
-- true without a second piece of state to keep in sync.
--
-- WHY A TABLE AND NOT A COUNTER
-- A bare integer on candidates cannot answer "which job posts did I already use
-- today?", so re-opening a job would silently charge again and the candidate
-- would be cut off after five *views* rather than five listings. One row per
-- job also gives us an audit trail if an account is ever disputed.
--
-- WHY THE CLIENT CANNOT CHEAT
-- The row is written only by claim_tool_usage(), which is SECURITY DEFINER and
-- takes the user id from auth.uid() rather than from the caller. anon and
-- authenticated have INSERT/UPDATE/DELETE revoked, so there is no direct write
-- path from the browser, and the count-and-insert happens under a per-user
-- advisory lock so two tabs cannot both pass the "under five" check. This is
-- enforcement, not a suggestion.
--
-- NOTHING BREAKS BEFORE THIS RUNS
-- The client calls the RPC and treats a "function does not exist" answer as
-- "not migrated yet": the tools keep working and the console names this file.
-- Once the functions exist, the limit applies immediately, no client deploy.
--
-- RESET
-- The day is (now() at time zone 'Asia/Kolkata')::date - the board's audience is
-- India, so "come back tomorrow" means after local midnight, not 05:30 IST.
-- -----------------------------------------------------------------------------

-- One row per account, per day, per distinct job post. `tool` records which of
-- the two tools last claimed the row; opening the same job with the other tool
-- updates it rather than adding a row, so the allowance stays "per job post".
create table if not exists public.tool_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  job_id text not null,
  tool text not null,
  created_at timestamptz not null default now(),
  constraint tool_usage_tool_check check (tool in ('resume', 'interview')),
  constraint tool_usage_user_day_job_key unique (user_id, usage_day, job_id)
);

comment on table public.tool_usage is
  'One row per account per day per distinct job post that used resume draft or interview prep. Written only by claim_tool_usage(); read-only to its owner.';
comment on column public.tool_usage.usage_day is
  'The Asia/Kolkata calendar day the job post was claimed on. The daily allowance resets at local midnight.';

-- The status function counts today's rows for one user, so (user_id, usage_day)
-- is the index it needs. The unique key above already covers it for a single
-- user, but this one is explicit and survives a change to that key.
create index if not exists tool_usage_user_day_idx
  on public.tool_usage (user_id, usage_day);

alter table public.tool_usage enable row level security;

-- Owners can read their own rows (the UI shows what is left); nobody can write
-- them directly. The security-definer functions bypass this for the write.
drop policy if exists "people read their own tool usage" on public.tool_usage;
create policy "people read their own tool usage"
  on public.tool_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Supabase's default privileges hand anon/authenticated broad table access, so
-- revoke the write paths explicitly; without this, the policy above would still
-- be the only thing stopping a direct insert.
revoke insert, update, delete on public.tool_usage from anon, authenticated;
grant select on public.tool_usage to authenticated;

-- The one definition of "today" for the allowance, so the status and claim
-- functions can never disagree about which day it is.
create or replace function public.swapiki_usage_day()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

-- Today's allowance without spending any of it. Returns null-ish JSON that the
-- client renders as "you have N left"; the claim function below is what spends.
create or replace function public.tool_usage_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := public.swapiki_usage_day();
  v_limit int := 5;
  v_used int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select count(*) into v_used
    from public.tool_usage
   where user_id = v_uid
     and usage_day = v_day;

  return jsonb_build_object(
    'allowed', v_used < v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'limit', v_limit,
    'reset_at', ((v_day + 1)::timestamp at time zone 'Asia/Kolkata')
  );
end;
$$;

-- Claim a job post for one of the tools. Idempotent per (user, day, job): calling
-- it again for a job already used today returns allowed=true without spending a
-- second allowance. A *new* job when today's five are gone returns allowed=false.
create or replace function public.claim_tool_usage(p_job_id text, p_tool text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := public.swapiki_usage_day();
  v_limit int := 5;
  v_used int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_tool not in ('resume', 'interview') then
    raise exception 'unknown tool %', p_tool using errcode = '22023';
  end if;
  if p_job_id is null or length(btrim(p_job_id)) = 0 then
    raise exception 'a job id is required' using errcode = '22023';
  end if;

  -- Serialise this account's claims. Without it, two tabs claiming two
  -- different jobs at count 4 would both read 4 and both insert, reaching 6.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- Count today's OTHER job posts. Excluding this job is what makes a repeat
  -- open free: a job already counted does not push the account over.
  select count(*) into v_used
    from public.tool_usage
   where user_id = v_uid
     and usage_day = v_day
     and job_id <> p_job_id;

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'remaining', 0,
      'limit', v_limit,
      'reset_at', ((v_day + 1)::timestamp at time zone 'Asia/Kolkata')
    );
  end if;

  insert into public.tool_usage (user_id, usage_day, job_id, tool)
  values (v_uid, v_day, p_job_id, p_tool)
  on conflict (user_id, usage_day, job_id)
  do update set tool = excluded.tool;

  v_used := v_used + 1;
  return jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'limit', v_limit,
    'reset_at', ((v_day + 1)::timestamp at time zone 'Asia/Kolkata')
  );
end;
$$;

-- Only signed-in users may call either function. The explicit revoke first
-- removes the execute privilege that public functions get by default.
revoke all on function public.swapiki_usage_day() from public;
revoke all on function public.tool_usage_status() from public;
revoke all on function public.claim_tool_usage(text, text) from public;
grant execute on function public.tool_usage_status() to authenticated;
grant execute on function public.claim_tool_usage(text, text) to authenticated;

-- What the allowance looks like right now, for whoever is running this.
select public.swapiki_usage_day() as today_ist;
