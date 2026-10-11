// Cloudflare Pages Function — Route: POST /notify
//
// Pushes the *undecided* jobs to the admin's Telegram so a curation judgement
// that the rules could not make can be made from a phone.
//
//   POST /notify
//   x-ingest-secret: <INGEST_SECRET>       (required)
//   -> { sent, failed, remaining, errors }
//
// WHAT GETS SENT
//   Curation (functions/lib/curate.js) triages every imported draft on each run
//   and leaves behind exactly one thing it cannot judge: drafts. Those rows are
//   the whole point of this route. source=eq.adzuna matches applyCuration's
//   scope, so a hand-typed draft in the admin form is never messaged — that is a
//   human's own unfinished thought, not queue work.
//
// SEND ONCE, NOT EVERY RUN
//   A row is only eligible while review_sent_at is null, and it is stamped the
//   moment the send succeeds. So a draft the admin deliberately leaves alone is
//   asked about exactly once; the next run moves on to the jobs that arrived
//   since. An ignored queue that re-nagged every two hours would get the bot
//   muted, and a muted bot is worse than no bot.
//
// IDEMPOTENT
//   Re-running sends nothing twice. A row is stamped after a successful send, and
//   a failed send is left unstamped so the next run retries it — the one case
//   that can double-send is two overlapping runs, which the sequential scheduler
//   does not produce.
//
// ENV
//   INGEST_SECRET           same secret the ingest route uses
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   service role, writes review_sent_at
//   TELEGRAM_BOT_TOKEN      from @BotFather
//   TELEGRAM_ADMIN_CHAT_ID  your chat; nobody else can be messaged or decide
//
// MIGRATION
//   Needs supabase/jobs_review_migration.sql. If review_sent_at is missing the
//   route answers 503 and says so, rather than quietly reporting success having
//   sent nothing — a silent no-op here looks identical to "no new jobs".

import { rest, isMissingColumnError } from "./lib/postgrest.js";
import { json, secretMatches } from "./lib/http.js";
import { sendJobForReview } from "./lib/telegram.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";
const CARD_COLUMNS = "id,title,company,location,category,salary,skills,apply_url,first_seen_at";

// Per-run ceiling, sized by Cloudflare's subrequest budget rather than by
// impatience: a Pages Function gets 50 subrequests per invocation and every
// card spends two — the Telegram send, then the review_sent_at stamp. 20 cards
// plus the queue read fits with headroom; the old 100 silently capped out at
// ~24 sends and burned the rest of the queue on "Too many subrequests by
// single Worker invocation". The backlog drains across runs, and a steady state
// is a handful of rows every two hours anyway.
const MAX_PER_RUN = 20;
const CONCURRENCY = 4;

/** Runs `worker` over `items`, at most `limit` at a time, preserving result order. */
async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!secretMatches(request.headers.get("x-ingest-secret"), env.INGEST_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) {
    return json(
      { error: "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID." },
      503
    );
  }

  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, 503);

  let rows;
  try {
    rows = await rest(
      supabaseUrl,
      serviceKey,
      "jobs" +
        `?select=${CARD_COLUMNS}` +
        "&status=eq.draft&source=eq.adzuna&review_sent_at=is.null" +
        "&order=first_seen_at.asc"
    );
  } catch (err) {
    if (isMissingColumnError(err)) {
      return json(
        {
          error:
            "jobs.review_sent_at is missing. Run supabase/jobs_review_migration.sql in the Supabase SQL editor.",
          detail: String(err.message || err)
        },
        503
      );
    }
    return json({ error: "could not read the review queue", detail: String(err.message || err) }, 500);
  }

  const pending = (rows || []).slice(0, MAX_PER_RUN);
  const errors = [];

  const results = await mapLimit(pending, CONCURRENCY, async (job) => {
    try {
      const messageId = await sendJobForReview(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_ADMIN_CHAT_ID,
        job,
        // How many other drafts are waiting, so the card can say so and offer a
        // one-tap publish-all. "Other" because the row being asked about is not
        // itself part of what the admin is piling up.
        Math.max(0, rows.length - 1)
      );
      // Stamped only after Telegram confirmed the send, so a transient failure
      // retries next run instead of silently dropping a job out of the queue.
      await rest(supabaseUrl, serviceKey, `jobs?id=eq.${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          review_sent_at: new Date().toISOString(),
          review_message_id: messageId == null ? null : String(messageId)
        })
      });
      return { ok: true };
    } catch (err) {
      errors.push(`${job.id}: ${String(err.message || err)}`);
      return { ok: false };
    }
  });

  const sent = results.filter(r => r.ok).length;
  const failed = results.length - sent;
  const remaining = Math.max(0, (rows || []).length - pending.length);

  if (sent || failed) {
    console.log(`jobs-notify: sent=${sent} failed=${failed} remaining=${remaining}`);
  }
  for (const e of errors) console.error(`jobs-notify error: ${e}`);

  return json({ sent, failed, remaining, errors });
}
