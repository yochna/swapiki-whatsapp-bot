// Cloudflare Pages Function — Route: POST /telegram-digest
//
// Sends each linked, published, channel-joined candidate a personal DM with the
// newest roles that match their profile — at most once a week.
//
//   POST /telegram-digest
//   x-ingest-secret: <INGEST_SECRET>       (required)
//   -> { sent, skipped, failed, remaining, eligible, errors }
//
// WHY A ROUTE AND NOT ANOTHER WORKER
//   The scheduler already calls /notify and /channel-post on its fixed two-hour
//   cron, and the cooldown column turns any cadence into a weekly message: a
//   candidate is skipped until their telegram_digest_sent_at is at least six
//   days old, so every poll is idempotent and no second cron trigger is needed.
//   Keeping jobs + Telegram credentials behind the route means the scheduler
//   keeps holding only INGEST_SECRET, exactly like the steps before it.
//
// WHO GETS MESSAGED
//   Only candidates we can actually DM with a useful reply: telegram_id is how
//   we reach them (set when they pressed Start on the bot), channel_joined_at
//   proves they really follow the channel, profile_status='published' means the
//   digest has skills to match against, and dummy profiles are skipped.
//
// MATCHING
//   A candidate's expertise is compared to each job's skills; jobs rank by
//   overlap, then by freshness. No overlap at all means no message — a digest
//   of irrelevant roles is how a bot gets blocked.
//
// ENV
//   INGEST_SECRET           same secret the ingest route uses
//   TELEGRAM_BOT_TOKEN      from @BotFather
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   service role, writes the stamp
//
// MIGRATION
//   Needs supabase/telegram_digest_migration.sql (candidates.telegram_digest_sent_at).
//   If it is missing the route answers 503 and names it.

import { rest, isMissingColumnError } from "./lib/postgrest.js";
import { json, secretMatches } from "./lib/http.js";
import { sendMessage, formatCandidateDigest } from "./lib/telegram.js";
import { jobSlug } from "./lib/jobs-feed.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";
const SITE = "https://swapiki.com";
const CANDIDATE_COLUMNS = "id,name,expertise,profile_status,telegram_id,channel_joined_at,telegram_digest_sent_at,is_dummy";
const JOB_COLUMNS = "id,title,company,location,salary,skills,created_at";

// Same 50-subrequest Pages budget as /notify: a DM costs two subrequests (send
// + stamp), so 20 candidates plus the two reads fits while 40 would die at ~24
// with "Too many subrequests by single Worker invocation". Eligible candidates
// are rare and weekly-stamped, so draining in batches loses nothing.
const MAX_PER_RUN = 20;
const DIGEST_COOLDOWN_DAYS = 6;  // "weekly" enforced as a floor on telegram_digest_sent_at.
const PICKS_PER_CANDIDATE = 4;
const JOB_WINDOW_DAYS = 10;      // only roles fresh enough to feel like news.

function daysSince(dateString) {
  if (!dateString) return Infinity;
  return (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24);
}

function isDummy(candidate) {
  return Boolean(candidate && (candidate.is_dummy || /^dummy-/.test(String(candidate.id || ""))));
}

export function firstNameOf(candidate) {
  const name = String((candidate && candidate.name) || "").trim();
  return name ? name.split(/\s+/)[0] : "";
}

/**
 * Ranks published jobs for one candidate: skill overlap first, then freshness.
 *
 * Pure and exported so the tests can assert the match without a network. A
 * higher overlap wins; ties fall back to newest role — the "most relevant" and
 * "most current" ordering in one sort.
 */
export function rankDigestJobs(jobs, candidate) {
  return [...(jobs || [])].sort(
    (a, b) => overlapWith(candidate, b) - overlapWith(candidate, a) || new Date(b && b.created_at || 0) - new Date(a && a.created_at || 0)
  );
}

/**
 * How many of the candidate's expertises a job's skills match. Shared between
 * the ranking (a tie-break input) and the reach decision (an all-zero answer
 * means the candidate gets no digest at all).
 */
export function overlapWith(candidate, job) {
  const candSkills = ((candidate && candidate.expertise) || []).map(s => String(s).toLowerCase());
  const jobSkills = (job && job.skills) || [];
  if (!Array.isArray(jobSkills)) return 0;
  return jobSkills
    .map(s => String(s).toLowerCase())
    .filter(s => candSkills.includes(s)).length;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!secretMatches(request.headers.get("x-ingest-secret"), env.INGEST_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    return json({ error: "Telegram is not configured. Set TELEGRAM_BOT_TOKEN." }, 503);
  }

  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, 503);

  let candidates;
  try {
    candidates =
      (await rest(
        supabaseUrl,
        serviceKey,
        "candidates" +
          `?select=${CANDIDATE_COLUMNS}` +
          "&telegram_id=not.is.null&channel_joined_at=not.is.null" +
          "&profile_status=eq.published&order=channel_joined_at.asc"
      )) || [];
  } catch (err) {
    if (isMissingColumnError(err)) {
      return json(
        {
          error:
            "candidates.telegram_digest_sent_at is missing. Run supabase/telegram_digest_migration.sql in the Supabase SQL editor.",
          detail: String(err.message || err)
        },
        503
      );
    }
    return json({ error: "could not read the digest audience", detail: String(err.message || err) }, 500);
  }

  let jobs;
  try {
    const since = new Date(Date.now() - JOB_WINDOW_DAYS * 86400000).toISOString();
    jobs =
      (await rest(
        supabaseUrl,
        serviceKey,
        "jobs" +
          `?select=${JOB_COLUMNS}` +
          `&status=eq.published&created_at=gte.${encodeURIComponent(since)}` +
          "&order=created_at.desc&limit=300"
      )) || [];
  } catch (err) {
    if (isMissingColumnError(err)) {
      return json({ error: "jobs table is missing a column: " + String(err.message || err) }, 503);
    }
    return json({ error: "could not read the matching jobs", detail: String(err.message || err) }, 500);
  }

  // The query carries the audience filter; the JS re-checks the same three
  // eligibility signals so a row that slips past a looser schema still cannot
  // be messaged to a chat we cannot reach.
  const eligible = candidates.filter(
    c => !isDummy(c) && c.telegram_id != null && c.channel_joined_at != null && c.profile_status === "published"
  );
  const take = eligible.slice(0, MAX_PER_RUN);
  let sent = 0, skipped = 0, failed = 0;
  const errors = [];

  for (const cand of take) {
    if (daysSince(cand.telegram_digest_sent_at) < DIGEST_COOLDOWN_DAYS) {
      skipped++;
      continue;
    }
    const picks = rankDigestJobs(jobs, cand).slice(0, PICKS_PER_CANDIDATE);
    const matched = picks.filter(job => overlapWith(cand, job) > 0);
    if (!matched.length) {
      // No skills matched at all: a digest of irrelevant roles is how a bot
      // gets blocked.
      skipped++;
      continue;
    }
    const items = matched.map(job => ({ job, url: `${SITE}/jobs/${jobSlug(job)}` }));
    try {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, cand.telegram_id, formatCandidateDigest(firstNameOf(cand), items), {
        parse_mode: "HTML"
      });
      await rest(supabaseUrl, serviceKey, `candidates?id=eq.${encodeURIComponent(cand.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ telegram_digest_sent_at: new Date().toISOString() })
      });
      sent++;
    } catch (err) {
      failed++;
      errors.push(`${cand.id}: ${String(err.message || err)}`);
    }
  }

  const remaining = Math.max(0, eligible.length - take.length);
  if (sent || failed) {
    console.log(`jobs-digest: sent=${sent} skipped=${skipped} failed=${failed} remaining=${remaining}`);
  }
  for (const e of errors) console.error(`jobs-digest error: ${e}`);

  return json({ sent, skipped, failed, remaining, eligible: take.length, errors });
}