-- -----------------------------------------------------------------------------
-- Swapiki — Featured jobs (Swaniki's own openings pinned to the top)
--
--   Applies to: swapiki-test, then swapiki (prod) Supabase instances.
--   Run in the Supabase SQL editor, AFTER jobs_board_migration.sql.
--   Idempotent - safe to re-run.
--
-- WHAT THIS IS FOR
-- Swaniki (swapiki's parent studio) keeps its own openings on
-- https://swaniki.com/careers. Those roles are hiring from the same talent pool
-- the board exists for, so they belong on the board - and they are ours, so they
-- are pinned to the top of it rather than competing on arrival time with the feed.
--
-- `featured` is a plain boolean rather than a check for source = 'swaniki',
-- because "sticky at the top" is a property of a listing, not of where it came
-- from. A hand-typed role that should also sit at the top can be featured; the
-- admin can also unfeature a Swaniki row the moment the role is filled, without
-- a deploy.
--
-- NOTHING BREAKS BEFORE THIS RUNS
-- PostgREST rejects an entire request for one unknown column, and a select naming
-- an unknown column returns 400 - which is how an earlier version of the public
-- board rendered empty for a deploy. So every reader of this column (the board,
-- the digest email, the nudge worker) asks for `featured` and retries without it
-- when the schema is older, exactly as they already do for salary_min/salary_max.
-- The function below is likewise replaced only once the column is confirmed to
-- exist, so a partial run cannot leave the app calling a function that does not
-- compile.
--
-- The 4 seeded roles come from https://swaniki.com/careers as of 2026-10-01 and
-- are re-synced by re-running supabase/swaniki_seed_jobs.sql after editing that
-- file. They are published here rather than queued for review on purpose: they
-- are the studio's own listings, cross-checked against its own public page, and
-- there is nobody at Swapiki to review them.
-- -----------------------------------------------------------------------------

alter table public.jobs add column if not exists featured boolean not null default false;

comment on column public.jobs.featured is
  'Pinned above every other listing on the board, in the digest email and in the nudge emails. Set for the studio''s own openings; clear it when a role is filled. Not a ranking signal - it is a fixed pin.';

comment on column public.jobs.source is
  'whatsapp-forward | direct-post | other | adzuna | user-submission | swaniki';

-- The board orders by this, so it needs its own index. A partial index over the
-- published rows only: the board never sorts anything else by it, and the pinned
-- rows are a handful, so this stays tiny however large the table grows.
create index if not exists jobs_featured_idx
  on public.jobs (featured desc, created_at desc)
  where status = 'published';

-- -----------------------------------------------------------------------------
-- get_published_jobs() with the pin in the sort.
--
-- Featured rows lead, then newest first, then id - the same total order as before
-- with one key in front, so paging can never serve a row twice or skip another.
-- `featured` is also in the projection: a card cannot be styled as pinned
-- without being told it is pinned.
--
-- The same projection as before otherwise. A column dropped from this list is a
-- column the board can never see, and this function is the app's only read path.
--
-- Guarded, because `create or replace function` compiles its body at creation
-- time: run against a schema without the column and the statement fails, taking
-- the replacement with it. The guard makes a partial run a no-op instead.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'featured'
  ) then
    execute $fn$
      create or replace function public.get_published_jobs()
      returns jsonb
      language sql
      security definer
      set search_path = public
      as $body$
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
              'featured', j.featured,
              'created_at', j.created_at
            )
            order by j.featured desc, j.created_at desc, j.id asc
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
      $body$;
    $fn$;
  else
    raise notice 'jobs.featured is missing; get_published_jobs() left unchanged.';
  end if;
end
$$;

-- What the board will now lead with.
select title, company, featured, status
from public.jobs
where featured or status = 'published'
order by featured desc, created_at desc, id asc
limit 20;
