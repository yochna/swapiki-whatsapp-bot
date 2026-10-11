-- -----------------------------------------------------------------------------
-- Swapiki - Jobs Ingest (Adzuna)
-- Makes the `jobs` table safe to fill from an external feed.
--
-- The manual admin form (adminSubmitJob -> adminCreateJob) still works
-- unchanged. This migration only ADDS the columns an automated importer needs:
--
--   dedupe_key   the identity of a listing, so re-running the importer does not
--                create a second copy of the same job. Unique, so the database
--                itself refuses duplicates even if two ingest runs overlap.
--   apply_url    where the candidate actually applies. The importer has this
--                (Adzuna gives it per listing); hand-typed jobs often do not.
--   source       gains 'adzuna' alongside the existing
--                whatsapp-forward | direct-post | other. Not a constraint, just
--                a documented vocabulary, so a job's provenance stays visible.
--   first_seen_at / last_seen_at
--                a listing that vanishes from the feed is not the same as one
--                that was never there. last_seen_at lets a future sweep tell
--                "closed" apart from "imported", and lets stale drafts age out.
--
-- Nothing here changes RLS: ingestion goes through the service role key in the
-- Pages Function, exactly like GET /jobs already does, so no anon/authenticated
-- key can write to this table.
--
--   Apply to: swapiki-test, then swapiki (prod).
--   Idempotent - safe to re-run.
-- -----------------------------------------------------------------------------

alter table public.jobs add column if not exists dedupe_key  text;
alter table public.jobs add column if not exists apply_url   text;
alter table public.jobs add column if not exists first_seen_at timestamptz;
alter table public.jobs add column if not exists last_seen_at  timestamptz;

-- Numeric salary bounds, for structured salary data.
--
-- The formatted `salary` string is display-ready but useless as structured data:
-- schema.org MonetaryAmount/QuantitativeValue need numbers, and re-parsing
-- "₹12,00,000 - ₹18,00,000" back into numbers would be guessing. Null when the
-- employer stated no salary - never an estimate (see salaryBounds in
-- functions/lib/adzuna.js, which drops Adzuna's predicted figures).
--
-- These two statements are the ONLY change from the version of this file that
-- was already applied. The file is idempotent, so re-running it is safe: the
-- five `add column if not exists` above are no-ops and the two below add what is
-- missing.
--
-- Nothing breaks if you have not run it. Both the insert in functions/ingest.js
-- and the select in functions/jobs.js probe for these columns and fall back to
-- the old shape when they are absent, because PostgREST rejects an entire batch
-- for one unknown column - and a select naming an unknown column returns 400,
-- which is how an earlier version of the public board went blank for a deploy.
alter table public.jobs add column if not exists salary_min numeric;
alter table public.jobs add column if not exists salary_max numeric;

comment on column public.jobs.salary_min is
  'Annual INR lower bound as stated by the employer. Null when unstated or when the figure is Adzuna-predicted.';
comment on column public.jobs.salary_max is
  'Annual INR upper bound as stated by the employer. Null when unstated or when the figure is Adzuna-predicted.';

comment on column public.jobs.dedupe_key is
  'Stable identity for a listing across importer runs. Unique. Null for hand-typed jobs, which is why the unique index is partial.';
comment on column public.jobs.apply_url is
  'Canonical apply/redirect URL from the source feed.';
comment on column public.jobs.source is
  'whatsapp-forward | direct-post | other | adzuna';
comment on column public.jobs.first_seen_at is
  'When this listing first appeared in a feed. Never overwritten.';
comment on column public.jobs.last_seen_at is
  'Most recent time a feed still offered this listing. Bumped on every re-run.';

-- Partial unique index: hand-typed jobs keep a NULL dedupe_key and must not
-- collide with each other, so the uniqueness only applies where a key exists.
-- Without the WHERE clause, Postgres would allow many NULLs anyway, but being
-- explicit documents the intent and keeps the index small.
create unique index if not exists jobs_dedupe_key_uniq
  on public.jobs (dedupe_key)
  where dedupe_key is not null;

-- Lets the feed query "give me every listing I have for this dedupe key"
-- without a sequential scan, and supports the staleness sweep.
create index if not exists jobs_last_seen_idx
  on public.jobs (last_seen_at desc);

-- The importer lists unpublished-but-imported rows for the admin queue, which
-- filters on status + recency. The existing jobs_status_idx covers status.
create index if not exists jobs_source_idx on public.jobs (source);

-- -----------------------------------------------------------------------------
-- Imported jobs are DRAFTS, always.
--
-- This is the single most important line in this file. get_published_jobs() and
-- GET /jobs both read status = 'published', and GET /jobs emits JobPosting
-- JSON-LD straight into Google's index. An automated feed is unvetted by
-- definition, so the importer's insert path uses a fixed value of 'draft' and
-- there is deliberately no policy, function, or default that can flip it.
-- A human publishes.
-- -----------------------------------------------------------------------------
