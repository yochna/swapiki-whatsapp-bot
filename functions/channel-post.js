// Cloudflare Pages Function — Route: POST /channel-post
//
// Broadcasts everything published since the last post to the public Telegram
// channel as ONE digest message per day.
//
//   POST /channel-post
//   x-ingest-secret: <INGEST_SECRET>       (required)
//   -> { posted, failed, remaining, alreadyPosted, day, errors }
//
// WHY A ROUTE AND NOT AN INLINE HOOK
//   A job can reach 'published' from three places: the Telegram review button,
//   the curation rules in /ingest, and the admin UI writing straight to Supabase
//   from the browser. Two of those are server-side and one is not, so a hook at
//   the write site would miss the third. Polling for "published but not yet
//   posted" catches all three, and it is idempotent: a row is stamped only after
//   Telegram confirms the send, so a retry cannot double-post.
//
// ONE POST A DAY, NOT ONE PER JOB
//   The scheduler fires every two hours; posting every job on every run buries
//   the channel. A digest row in channel_digests records the UTC day the post
//   was made, and a row for today means today's digest is done — whatever is
//   still un-stamped waits for tomorrow. A job is only eligible while
//   channel_posted_at is null, and it is stamped when the digest that lists it
//   is confirmed sent, so a retry cannot post the same day twice.
//
// ENV
//   INGEST_SECRET           same secret the ingest route uses
//   TELEGRAM_BOT_TOKEN      from @BotFather (the bot must be a channel admin)
//   TELEGRAM_CHANNEL_ID     @handle or -100... id of the channel
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   service role, writes channel_posted_at
//
// MIGRATIONS
//   Needs supabase/jobs_channel_post_migration.sql (channel_posted_at) and
//   supabase/jobs_channel_digest_migration.sql (channel_digests). If either is
//   missing the route answers 503 and names it, rather than quietly reporting
//   success having posted nothing.

import { rest, isMissingColumnError } from "./lib/postgrest.js";
import { json, secretMatches } from "./lib/http.js";
import { sendChannelDigest } from "./lib/telegram.js";
import { jobSlug } from "./lib/jobs-feed.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";
const SITE = "https://swapiki.com";
const POST_COLUMNS = "id,title,company,location,category,salary,skills,apply_url,first_seen_at";

// The digest is one message, so it cannot list a whole backfill day at once.
// The cap keeps the message comfortably inside Telegram's 4096-char limit, and
// anything cut here is still un-stamped, so the NEXT day's digest picks it up.
// Oldest-first means the channel reads in the order the jobs arrived.
const MAX_DIGEST_JOBS = 8;

/** The UTC date key for "which digest is today's". */
const todayKey = () => new Date().toISOString().slice(0, 10);

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!secretMatches(request.headers.get("x-ingest-secret"), env.INGEST_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    return json(
      { error: "Telegram channel is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID." },
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
        `?select=${POST_COLUMNS}` +
        "&status=eq.published&channel_posted_at=is.null" +
        "&order=first_seen_at.asc"
    );
  } catch (err) {
    if (isMissingColumnError(err)) {
      return json(
        {
          error:
            "jobs.channel_posted_at is missing. Run supabase/jobs_channel_post_migration.sql in the Supabase SQL editor.",
          detail: String(err.message || err)
        },
        503
      );
    }
    return json({ error: "could not read the publish queue", detail: String(err.message || err) }, 500);
  }

  const pending = rows || [];

  // One digest per UTC day. A row for today means the day is done — whatever is
  // pending now waits for tomorrow's post, which is the whole point of
  // collapsing the two-hourly schedule into a single daily message.
  const day = todayKey();
  let dayExists = false;
  try {
    const found = await rest(supabaseUrl, serviceKey, `channel_digests?select=day&day=eq.${day}`);
    dayExists = Boolean(found && found.length);
  } catch (err) {
    if (isMissingDigestTableError(err)) {
      return json(
        {
          error:
            "channel_digests is missing. Run supabase/jobs_channel_digest_migration.sql in the Supabase SQL editor.",
          detail: String(err.message || err)
        },
        503
      );
    }
    return json({ error: "could not read the daily digest marker", detail: String(err.message || err) }, 500);
  }

  if (dayExists) {
    return json({ posted: 0, failed: 0, remaining: pending.length, alreadyPosted: true, day });
  }
  if (!pending.length) {
    return json({ posted: 0, failed: 0, remaining: 0, alreadyPosted: false, day });
  }

  const included = pending.slice(0, MAX_DIGEST_JOBS);
  const restCount = Math.max(0, pending.length - included.length);
  const items = included.map(job => ({ job, url: `${SITE}/jobs/${jobSlug(job)}` }));

  try {
    await sendChannelDigest(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHANNEL_ID, items);
  } catch (err) {
    console.error(`jobs-channel digest send failed: ${err.message || err}`);
    return json({ posted: 0, failed: included.length, remaining: restCount, alreadyPosted: false, day });
  }

  // Stamped only after Telegram confirmed the send. The day row is written even
  // if an individual stamp fails, so a partial stamp can never re-post the same
  // batch later in the day; an unstamped job simply surfaces in a later digest.
  const stamp = new Date().toISOString();
  const errors = [];
  let stamped = 0;
  for (const job of included) {
    try {
      await rest(supabaseUrl, serviceKey, `jobs?id=eq.${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ channel_posted_at: stamp })
      });
      stamped++;
    } catch (err) {
      errors.push(`${job.id}: ${String(err.message || err)}`);
    }
  }
  try {
    await rest(supabaseUrl, serviceKey, "channel_digests", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        day,
        posted_at: stamp,
        job_ids: included.map(j => j.id)
      })
    });
  } catch (err) {
    console.error(`jobs-channel digest marker write failed: ${err.message || err}`);
  }

  const failed = included.length - stamped;
  const remaining = restCount + failed;
  if (included.length) console.log(`jobs-channel: digest day=${day} posted=${stamped} failed=${failed} remaining=${remaining}`);
  for (const e of errors) console.error(`jobs-channel error: ${e}`);

  return json({ posted: stamped, failed, remaining, alreadyPosted: false, day });
}

/** Does this error mean the channel_digests table itself is missing? */
function isMissingDigestTableError(err) {
  const msg = String((err && err.message) || err || "");
  return /channel_digests/.test(msg) && /(42P01|PGRST205|does not exist|could not find the table)/i.test(msg);
}