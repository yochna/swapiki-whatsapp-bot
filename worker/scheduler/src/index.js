/**
 * Scheduled ingest + curation + review notification.
 *
 * Cloudflare Pages has no cron, so this is a separate scheduled Worker whose only
 * job is to call the secret-gated routes on swapiki.com. It holds INGEST_SECRET
 * plus DIGEST_CRON_SECRET (the email route's shared secret) and no Adzuna,
 * Supabase or Telegram credentials - all of that stays behind the routes' own
 * authentication.
 *
* Six steps, in order:
 *   1. POST /ingest?curate=1  fetch the feed, then triage the draft queue
 *   2. POST /notify          message the jobs triage could not decide
 *   3. POST /channel-post    broadcast the jobs that got published to the channel
 *   4. POST /telegram-digest send the weekly matched-jobs DMs where due
 *   5. POST /api/cron-send-digest  email the fortnightly jobs drop
 *   6. POST <bot>/send-digest      post the daily digest to a WhatsApp group
 *
 * The order matters: notify reads the drafts curation leaves behind, so running
 * it first would message jobs the rules were about to publish or reject. The
 * channel-post step runs after step 1 so a job published by curation is broadcast
 * in the same run. A failure in any later step is logged rather than raised -
 * the ingest already succeeded, and a half-failed run should not read as a lost
 * ingest.
 *
 * The digest step is idempotent by design: candidates are stamped on the row
 * (candidates.telegram_digest_sent_at) and skipped until their stamp is six
 * days old, so calling it on every two-hour run is what makes it weekly — the
 * route never needs its own cron.
 *
 * The failure modes this exists to avoid:
 *  - a silent 0-row run. Every run is logged with its counts, and a non-2xx
 *    response is logged as an error so a broken schedule is visible in the
 *    dashboard rather than showing up as "no new jobs today" weeks later.
 *  - a 200 that means "refused". The routes answer 401/503 with an error body, so
 *    the status is checked rather than trusting that a response arrived.
 *  - a run where ingest worked but the admin was never told. The two steps are
 *    logged separately so "0 sent" is visible as its own fact.
 */

const SITE = "https://swapiki.com";
const INGEST_URL = `${SITE}/ingest?curate=1`;
const NOTIFY_URL = `${SITE}/notify`;
const CHANNEL_URL = `${SITE}/channel-post`;
const DIGEST_URL = `${SITE}/telegram-digest`;
const EMAIL_DIGEST_URL = `${SITE}/api/cron-send-digest`;
const SECRET_HEADER = "x-ingest-secret";

export default {
  async scheduled(event, env, ctx) {
    const started = Date.now();
    ctx.waitUntil(run(env, started).catch((err) => {
      console.error(JSON.stringify({
        event: "jobs-ingest-failed",
        at: new Date().toISOString(),
        error: String((err && err.message) || err),
      }));
    }));

    // Nothing else to do on the trigger itself; kept explicit for the log line.
    console.log(JSON.stringify({
      event: "jobs-ingest-triggered",
      at: new Date(started).toISOString(),
      cron: (event && event.cron) || null,
    }));
  },
};

/** POSTs to one of the site routes with a shared secret, returning parsed JSON. */
async function callRoute(url, env, header = SECRET_HEADER, secret = env.INGEST_SECRET) {
  const res = await fetch(url, {
    method: "POST",
    headers: { [header]: secret, Accept: "application/json" },
  });

  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Left as null on purpose - a non-JSON body means something in front of the
    // route answered instead, and that is worth seeing verbatim.
  }

  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return body;
}

async function run(env, started) {
  if (!env || !env.INGEST_SECRET) {
    // Throwing is the point: a Worker with no secret cannot do the job, and a
    // quiet no-op would look exactly like a healthy run that found nothing.
    throw new Error("INGEST_SECRET is not set on this Worker.");
  }

  const body = await callRoute(INGEST_URL, env);
  const curation = (body && body.curation) || {};
  console.log(JSON.stringify({
    event: "jobs-ingest-ok",
    at: new Date().toISOString(),
    durationMs: Date.now() - started,
    inserted: body && body.inserted,
    refreshed: body && body.refreshed,
    published: curation.published,
    rejected: curation.rejected,
    leftAsDraft: curation.leftAsDraft,
    errors: (body && body.errors) || [],
  }));

  // Reported even when zero, because "nothing needed deciding" and "the notifier
  // never ran" look identical from the dashboard otherwise. The route's errors
  // ride along (capped) because "77 failed" without a reason is an answer that
  // costs another round trip to act on - the first few messages name the cause.
  try {
    const notify = (await callRoute(NOTIFY_URL, env)) || {};
    console.log(JSON.stringify({
      event: "jobs-notify-ok",
      at: new Date().toISOString(),
      sent: notify.sent,
      failed: notify.failed,
      remaining: notify.remaining,
      errors: (notify.errors || []).slice(0, 5),
    }));
  } catch (err) {
    console.error(JSON.stringify({
      event: "jobs-notify-failed",
      at: new Date().toISOString(),
      error: String((err && err.message) || err),
    }));
  }

  // Third step: broadcast newly published jobs to the public channel. Runs after
  // step 1 so a job published by /ingest this run is included. A failure here is
  // logged and swallowed for the same reason as notify - ingest already succeeded.
  try {
    const channel = (await callRoute(CHANNEL_URL, env)) || {};
    console.log(JSON.stringify({
      event: "jobs-channel-ok",
      at: new Date().toISOString(),
      posted: channel.posted,
      failed: channel.failed,
      remaining: channel.remaining,
      errors: (channel.errors || []).slice(0, 5),
    }));
  } catch (err) {
    console.error(JSON.stringify({
      event: "jobs-channel-failed",
      at: new Date().toISOString(),
      error: String((err && err.message) || err),
    }));
  }

  // Fourth step: the weekly matched-jobs DMs. Idempotent on its own stamp, so
  // running it every two hours just means whichever candidate is due gets their
  // one message. Failure is logged and swallowed - the channel already posted.
  try {
    const digest = (await callRoute(DIGEST_URL, env)) || {};
    console.log(JSON.stringify({
      event: "jobs-digest-ok",
      at: new Date().toISOString(),
      sent: digest.sent,
      skipped: digest.skipped,
      failed: digest.failed,
      remaining: digest.remaining,
      errors: (digest.errors || []).slice(0, 5),
    }));
  } catch (err) {
    console.error(JSON.stringify({
      event: "jobs-digest-failed",
      at: new Date().toISOString(),
      error: String((err && err.message) || err),
    }));
  }

  // Fifth step: the fortnightly jobs-drop email. The route enforces its own
  // 14-day per-user cooldown from the digest_sends log, so calling it on every
  // two-hour run is what makes it fortnightly - the same stamp pattern as the
  // Telegram digest above. A missing secret is logged rather than thrown: the
  // other four steps already succeeded, and the email can be enabled later.
  if (!env.DIGEST_CRON_SECRET) {
    console.error(JSON.stringify({
      event: "jobs-email-digest-failed",
      at: new Date().toISOString(),
      error: "DIGEST_CRON_SECRET is not set on this Worker.",
    }));
  } else {
    try {
      const email = (await callRoute(EMAIL_DIGEST_URL, env, "x-cron-secret", env.DIGEST_CRON_SECRET)) || {};
      console.log(JSON.stringify({
        event: "jobs-email-digest-ok",
        at: new Date().toISOString(),
        sent: email.sent,
        skipped: email.skipped,
        failed: email.failed,
        remaining: email.remaining,
        recipients: email.recipients,
      }));
    } catch (err) {
      console.error(JSON.stringify({
        event: "jobs-email-digest-failed",
        at: new Date().toISOString(),
        error: String((err && err.message) || err),
      }));
    }
  }

  // Sixth step: the daily WhatsApp digest, sent by the standalone whatsapp-bot
  // service. The route enforces the once-per-day rule from whatsapp_digests, so
  // calling it every two hours is what makes it daily - the same stamp pattern
  // as the channel post above. Gated on its own env pair: until the bot is
  // deployed and WHATSAPP_SEND_URL/WHATSAPP_SECRET are set, the step is logged
  // as skipped (not failed), so the other five steps stay quiet and green.
  if (!env.WHATSAPP_SEND_URL || !env.WHATSAPP_SECRET) {
    console.log(JSON.stringify({
      event: "jobs-whatsapp-digest-skipped",
      at: new Date().toISOString(),
      reason: "WHATSAPP_SEND_URL/WHATSAPP_SECRET is not set on this Worker.",
    }));
  } else {
    try {
      const wa = (await callRoute(env.WHATSAPP_SEND_URL + "/send-digest", env, "x-send-secret", env.WHATSAPP_SECRET)) || {};
      console.log(JSON.stringify({
        event: "jobs-whatsapp-digest-ok",
        at: new Date().toISOString(),
        posted: wa.posted,
        failed: wa.failed,
        remaining: wa.remaining,
        alreadyPosted: wa.alreadyPosted,
        errors: (wa.errors || []).slice(0, 5),
      }));
    } catch (err) {
      console.error(JSON.stringify({
        event: "jobs-whatsapp-digest-failed",
        at: new Date().toISOString(),
        error: String((err && err.message) || err),
      }));
    }
  }

  return body;
}
