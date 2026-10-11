-- =============================================================================
-- Swapiki jobs — Telegram review queue
-- =============================================================================
--
-- The ingest feed is triaged by rules (functions/lib/curate.js): obvious roles
-- are published, obvious junk is rejected, and the titles the rules cannot judge
-- are left as drafts. Those leftovers are the only thing a human ever has to
-- look at, and this migration adds the two columns that let a Telegram bot put
-- them in front of that human and record the decision.
--
--   review_sent_at     when this draft was last sent to the admin's Telegram.
--                      The notify route only sends rows where this is null, so a
--                      draft is messaged exactly once instead of every run.
--   review_message_id  the Telegram message id, for editing the card in place
--                      and for tracing a button press back to its message.
--
-- Idempotent - safe to re-run.
--
-- WHY STORE "SENT" AND NOT "REVIEWED": the status column already records the
-- decision ('published' / 'rejected'). This column records that we ASKED, which
-- is a different fact. Without it a draft the admin deliberately ignored would
-- be re-sent on every scheduled run, and an ignored queue would nag forever.
-- =============================================================================

alter table public.jobs add column if not exists review_sent_at    timestamptz;
alter table public.jobs add column if not exists review_message_id text;

comment on column public.jobs.review_sent_at is
  'When this draft was last sent to the admin Telegram chat for a decision. Null = never asked. The notify route only sends rows where this is null.';
comment on column public.jobs.review_message_id is
  'Telegram message id of the review card, so a button press can be matched back to it.';

-- Supports the notify query: "undecided imported drafts that have not been sent
-- yet, oldest first". Partial, because the only rows that matter are the small
-- pending slice, not the hundreds of published or rejected ones.
create index if not exists jobs_review_pending_idx
  on public.jobs (first_seen_at)
  where status = 'draft' and review_sent_at is null;
