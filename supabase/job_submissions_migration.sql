-- -----------------------------------------------------------------------------
-- Swapiki — Public Job Submissions
--
-- Anyone can post an opening from the public /jobs page. It lands in the admin's
-- Awaiting approval list as a draft, and only an admin decision can publish it.
--
-- NO NEW COLUMNS AND NO NEW POLICIES, and that is the point of this migration.
-- The write path is POST /api/submit-job, a Pages Function that uses the service
-- role key and therefore bypasses RLS. Loosening the table's INSERT policy to
-- "anyone" would hand the public anon key — which ships inside the JS bundle —
-- write access to the same table GET /jobs renders as JobPosting JSON-LD into
-- Google's index. One narrow service-role door is safer than an open table.
--
-- Because the route bypasses RLS, the guarantees this table previously relied on
-- for free no longer apply to it, so they are restated in comments and enforced in
-- code (functions/api/submit-job.js):
--   * status is hardcoded to 'draft' and is never read from the request body.
--   * source is hardcoded to 'user-submission' and is never read from the body,
--     which keeps submissions out of every automated path: /curate and the sweep
--     both scope to source = 'adzuna', and /notify only messages adzuna drafts.
--   * dedupe_key is left NULL, so a submission can never collide with, or be
--     swept against, a real feed listing.
--
-- Applies to: swapiki-test and swapiki prod.
-- Run in the Supabase SQL editor. Safe to re-run.
-- -----------------------------------------------------------------------------

-- 1. Record the new provenance value on the column that already carries them.
--    adzuna came from the ingest migration; user-submission comes from the public
--    form. Both matter downstream, so both are documented in one place now.
comment on column public.jobs.source is
'Provenance of a listing: adzuna (machine feed, auto-curated), user-submission (typed by an employer or recruiter on the public /jobs form), direct-post, whatsapp-forward, other. Only adzuna rows are auto-published or auto-retracted; a user-submission is a human decision from insert to verdict.';

-- 2. Queue reads. adminListJobs() selects every row ordered by created_at desc and
--    splits it in JS, so the existing created_at index already serves it. This
--    index exists for the narrower question the review queue actually asks — "what
--    has this employer submitted that nobody has looked at yet" — without pulling
--    the whole table back through the service role key.
create index if not exists jobs_submission_queue_idx
on public.jobs (created_at desc)
where source = 'user-submission' and status = 'draft';

-- 3. The comment on first_seen_at said "arrived in a feed", which is now only half
--    true: the public form stamps it too, so a submitted listing gets a truthful
--    datePosted on the board the same day it arrives rather than no date at all.
comment on column public.jobs.first_seen_at is
'When this listing first arrived on Swapiki - via a feed (adzuna) or the public submission form. Null only for rows inserted before this column existed. Used for stable pagination and as datePosted in JobPosting JSON-LD.';
