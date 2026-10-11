const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'worker', 'scheduler');
const indexUrl = pathToFileURL(path.join(DIR, 'src', 'index.js')).href;

const worker = () => import(indexUrl);

/** Captures what the worker logged, and what it sent. */
function harness(responder) {
  const logs = [];
  const realLog = console.log;
  const realErr = console.error;
  const realFetch = globalThis.fetch;
  const requests = [];
  const waited = [];

  console.log = (...a) => logs.push({ level: 'log', text: a.join(' ') });
  console.error = (...a) => logs.push({ level: 'error', text: a.join(' ') });
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return responder(String(input), init);
  };

  return {
    requests,
    logs,
    waited,
    // Waits for the waitUntil promise the way the runtime would.
    async fire(env, event = { cron: "17 6 * * *" }) {
      const mod = (await worker()).default;
      const ctx = { waitUntil: (p) => waited.push(p) };
      await mod.scheduled(event, env, ctx);
      for (const p of waited) await p.catch(() => {});
      return { logs, requests, errors: logs.filter((l) => l.level === 'error') };
    },
    restore() {
      console.log = realLog;
      console.error = realErr;
      globalThis.fetch = realFetch;
    }
  };
}

const SECRET = 'f'.repeat(64);
const okBody = {
  inserted: 0,
  refreshed: 423,
  errors: [],
  curation: { published: 12, rejected: 3, leftAsDraft: 2 }
};
const notifyBody = { sent: 2, failed: 0, remaining: 0, errors: [] };
const channelBody = { posted: 3, failed: 0, remaining: 0, errors: [] };
const digestBody = { sent: 1, skipped: 2, failed: 0, remaining: 0 };
const emailBody = { sent: 4, skipped: 4, failed: 0, recipients: 8 };
const whatsappBody = { posted: 3, failed: 0, remaining: 0, alreadyPosted: false, errors: [] };

/** Answers each route by path, so the steps can be stubbed separately. */
function byRoute({ ingest = okBody, notify = notifyBody, channel = channelBody, digest = digestBody, email = emailBody, whatsapp = whatsappBody } = {}) {
  return (url) => {
    const body = url.includes('/send-digest') ? whatsapp
      : url.includes('/channel-post') ? channel
      : url.includes('/notify') ? notify
      : url.includes('/telegram-digest') ? digest
      : url.includes('/api/cron-send-digest') ? email
      : ingest;
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

test('the scheduler asks the ingest route to curate, then tells the admin, then broadcasts and digests', async () => {
  const h = harness(byRoute({ ingest: okBody, notify: notifyBody }));
  try {
    await h.fire({ INGEST_SECRET: SECRET });
    assert.equal(h.requests.length, 4);
    const [ingest, notify, channel, digest] = h.requests;
    assert.match(ingest.url, /\/ingest\?curate=1/);
    assert.equal(ingest.init.method, 'POST', 'a GET would be refused by the route');
    assert.equal(ingest.init.headers['x-ingest-secret'], SECRET);
    // Notify only ever runs after curation, because it reads the drafts curation
    // left behind. Running it first would message jobs about to be published.
    assert.match(notify.url, /\/notify/);
    assert.equal(notify.init.method, 'POST');
    assert.equal(notify.init.headers['x-ingest-secret'], SECRET);
    // The channel broadcast runs after curation, so a job published by curation
    // this run is included in the same pass.
    assert.match(channel.url, /\/channel-post/);
    assert.equal(channel.init.method, 'POST');
    assert.equal(channel.init.headers['x-ingest-secret'], SECRET);
    // The weekly digest step runs last and is gated by its own per-candidate
    // stamp, so a poll every two hours is what makes it weekly.
    assert.match(digest.url, /\/telegram-digest/);
    assert.equal(digest.init.method, 'POST');
    assert.equal(digest.init.headers['x-ingest-secret'], SECRET);
  } finally {
    h.restore();
  }
});

test('the notifier result is logged, including when nothing was sent', async () => {
  // "0 sent" and "the notifier never ran" look identical from the dashboard
  // otherwise, which is exactly the failure nobody notices.
  for (const notify of [notifyBody, { sent: 0, failed: 0, remaining: 0, errors: [] }]) {
    const h = harness(byRoute({ ingest: okBody, notify }));
    try {
      const { logs } = await h.fire({ INGEST_SECRET: SECRET });
      const line = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-notify-ok');
      assert.ok(line, 'expected a notify result line even for an empty queue');
      assert.equal(line.sent, notify.sent);
      assert.equal(line.failed, 0);
    } finally {
      h.restore();
    }
  }
});

test('the route-reported errors ride along in the log, capped', async () => {
  // "77 failed" without a reason costs another round trip to act on. The first
  // few messages name the cause (429, blocked bot, bad chat id) in the log we
  // already collect.
  const errors = Array.from({ length: 12 }, (_, i) => `3f8a1c2e-9d4b-4a1f-8c7d-2e6b5a4d3c21: Telegram sendMessage failed (429): Too Many Requests ${i}`);
  const h = harness(byRoute({ notify: { sent: 3, failed: 12, remaining: 0, errors } }));
  try {
    const { logs } = await h.fire({ INGEST_SECRET: SECRET });
    const line = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-notify-ok');
    assert.equal(line.errors.length, 5, 'a bounded slice, not the whole backlog');
    assert.match(line.errors[0], /429/, 'the reason itself is what we are after');
  } finally {
    h.restore();
  }
});

test('a notify failure is logged without losing the ingest that already succeeded', async () => {
  // The feed was fetched and curated; failing the whole run over the second step
  // would report a good ingest as broken, and the retry would re-run the feed.
  const h = harness((url) => url.includes('/notify')
    ? new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    : new Response(JSON.stringify(okBody), { status: 200 }));
  try {
    const { logs, errors } = await h.fire({ INGEST_SECRET: SECRET });
    const ok = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-ingest-ok');
    assert.equal(ok.refreshed, 423, 'the ingest result is still reported');
    const failure = errors.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-notify-failed');
    assert.ok(failure, 'the notify failure must be visible, not swallowed');
    assert.match(failure.error, /401/);
  } finally {
    h.restore();
  }
});

test('the channel result is logged, including when nothing was posted', async () => {
  // Same reason as notify: "0 posted" and "the channel step never ran" are
  // indistinguishable from the dashboard otherwise.
  for (const channel of [channelBody, { posted: 0, failed: 0, remaining: 0, errors: [] }]) {
    const h = harness(byRoute({ channel }));
    try {
      const { logs } = await h.fire({ INGEST_SECRET: SECRET });
      const line = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-channel-ok');
      assert.ok(line, 'expected a channel result line even for an empty queue');
      assert.equal(line.posted, channel.posted);
      assert.equal(line.failed, 0);
    } finally {
      h.restore();
    }
  }
});

test('a channel-post failure is logged without losing the ingest that already succeeded', async () => {
  const h = harness((url) => url.includes('/channel-post')
    ? new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    : byRoute({})(url));
  try {
    const { logs, errors } = await h.fire({ INGEST_SECRET: SECRET });
    const ok = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-ingest-ok');
    assert.equal(ok.refreshed, 423, 'the ingest result is still reported');
    const failure = errors.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-channel-failed');
    assert.ok(failure, 'the channel failure must be visible, not swallowed');
    assert.match(failure.error, /401/);
  } finally {
    h.restore();
  }
});

test('the digest result is logged, including when nothing was sent', async () => {
  // Same reason as notify and channel: "0 sent" and "the digest step never ran"
  // are indistinguishable from the dashboard otherwise.
  for (const digest of [digestBody, { sent: 0, skipped: 5, failed: 0, remaining: 0 }]) {
    const h = harness(byRoute({ digest }));
    try {
      const { logs } = await h.fire({ INGEST_SECRET: SECRET });
      const line = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-digest-ok');
      assert.ok(line, 'expected a digest result line even for an empty run');
      assert.equal(line.sent, digest.sent);
      assert.equal(line.skipped, digest.skipped);
    } finally {
      h.restore();
    }
  }
});

test('a digest failure is logged without losing the ingest that already succeeded', async () => {
  const h = harness((url) => url.includes('/telegram-digest')
    ? new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    : byRoute({})(url));
  try {
    const { logs, errors } = await h.fire({ INGEST_SECRET: SECRET });
    const ok = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-ingest-ok');
    assert.equal(ok.refreshed, 423, 'the ingest result is still reported');
    const failure = errors.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-digest-failed');
    assert.ok(failure, 'the digest failure must be visible, not swallowed');
    assert.match(failure.error, /401/);
  } finally {
    h.restore();
  }
});

test('a failed ingest means notify is never called', async () => {
  // Messaging the queue after a failed ingest would re-send nothing new, but it
  // would report a healthy-looking notify run next to a broken ingest.
  const h = harness(() => new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401 }));
  try {
    await h.fire({ INGEST_SECRET: SECRET });
    assert.equal(h.requests.length, 1, 'notify must not run after a failed ingest');
    assert.ok(!h.requests[0].url.includes('/notify'));
  } finally {
    h.restore();
  }
});

test('the scheduler never puts the secret in the URL or a log line', async () => {
  const h = harness(byRoute({ ingest: okBody, notify: notifyBody }));
  try {
    await h.fire({ INGEST_SECRET: SECRET });
    for (const r of h.requests) {
      assert.ok(!r.url.includes(SECRET), 'the secret must be a header, not a query param');
    }
    for (const l of h.logs) {
      assert.ok(!l.text.includes(SECRET), `a log line leaked the secret: ${l.text}`);
    }
  } finally {
    h.restore();
  }
});

test('a successful run is logged with real counts, not just "ok"', async () => {
  const h = harness(byRoute({ ingest: okBody, notify: notifyBody }));
  try {
    const { logs } = await h.fire({ INGEST_SECRET: SECRET });
    const ok = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-ingest-ok');
    assert.ok(ok, 'expected a structured result line');
    assert.equal(ok.refreshed, 423);
    assert.equal(ok.published, 12);
    assert.equal(ok.rejected, 3);
    assert.equal(ok.leftAsDraft, 2);
    assert.equal(typeof ok.durationMs, 'number');
    assert.ok(ok.durationMs >= 0);
    assert.deepEqual(ok.errors, []);
  } finally {
    h.restore();
  }
});

test('a missing secret is a loud failure, not a silent no-op', async () => {
  const h = harness(byRoute({ ingest: okBody, notify: notifyBody }));
  try {
    const { errors } = await h.fire({});
    assert.equal(errors.length, 1, 'a Worker with no secret must report an error');
    assert.match(JSON.parse(errors[0].text).error, /INGEST_SECRET/);
    assert.equal(h.requests.length, 0, 'and must not send an unauthenticated request');
  } finally {
    h.restore();
  }
});

test('a rejected request is reported as a failure, not logged as success', async () => {
  // 401/503 come back as a 2xx-shaped body from a naive check. A schedule that
  // quietly stopped authenticating would otherwise look like a healthy run.
  for (const status of [401, 500, 503]) {
    const h = harness(() => new Response(JSON.stringify({ error: 'Unauthorized.' }), { status }));
    try {
      const { errors } = await h.fire({ INGEST_SECRET: SECRET });
      assert.equal(errors.length, 1, `HTTP ${status} must raise an error`);
      const e = JSON.parse(errors[0].text);
      assert.equal(e.event, 'jobs-ingest-failed');
      assert.match(e.error, new RegExp(String(status)));
    } finally {
      h.restore();
    }
  }
});

test('a non-JSON response is surfaced rather than parsed as success', async () => {
  const h = harness(() => new Response('<html>maintenance</html>', { status: 200 }));
  try {
    // The email secret is supplied so step 5 does not add its own unrelated
    // "secret missing" error - this test is about the non-JSON ingest body.
    const { errors } = await h.fire({ INGEST_SECRET: SECRET, DIGEST_CRON_SECRET: 'e'.repeat(40) });
    assert.equal(errors.length, 0, 'a 200 is not itself an error');
    const ok = h.logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-ingest-ok');
    // Every count reads as undefined rather than a fabricated 0, because a null
    // body must not look like a confirmed zero.
    assert.equal(ok.inserted, undefined);
    assert.equal(ok.published, undefined);
  } finally {
    h.restore();
  }
});

test('per-query errors from the route are carried into the log', async () => {
  const h = harness(byRoute({
    ingest: { inserted: 0, refreshed: 10, errors: ['Adzuna rate limit hit (429).'], curation: {} },
    notify: notifyBody
  }));
  try {
    const { logs } = await h.fire({ INGEST_SECRET: SECRET });
    const ok = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-ingest-ok');
    assert.deepEqual(ok.errors, ['Adzuna rate limit hit (429).'], 'a partial failure must not read as clean');
  } finally {
    h.restore();
  }
});

test('the schedule runs often enough for a review bot, and off the hour', () => {
  const toml = fs.readFileSync(path.join(DIR, 'wrangler.toml'), 'utf8');
  const crons = [...toml.matchAll(/"([^"]+)"/g)].map((m) => m[1])
    .filter((c) => /^[\d*/]+\s+[\d*/]+\s+\S+\s+\S+\s+\S+$/.test(c));
  assert.equal(crons.length, 1, 'expected exactly one cron trigger');
  const [min, hour, dom, mon, dow] = crons[0].split(/\s+/);
  assert.equal(dom, '*');
  assert.equal(mon, '*');
  assert.equal(dow, '*', 'a recurring run must not be limited to particular weekdays');
  assert.ok(Number(min) % 15 !== 0, 'minute 0/15/30/45 piles onto everyone else\'s schedule');
  // Every two hours: a draft queued at 09:00 is messaged by 09:05, while the role
  // is still open. Once a day was already a day stale before anyone looked.
  assert.match(hour, /^\*\/(\d+)$/, `expected an every-N-hours field, got "${hour}"`);
  const every = Number(hour.match(/^\*\/(\d+)$/)[1]);
  assert.ok(every >= 1 && every <= 6, `every ${every}h is too slow or too frequent`);
});

test('the scheduler holds no feed, database or bot credentials', () => {
  // Everything privileged lives behind the routes' own authentication. If this
  // Worker ever needs the Adzuna key, the service-role key or the bot token, the
  // boundary has moved and the auth story needs redoing.
  const src = fs.readFileSync(path.join(DIR, 'src', 'index.js'), 'utf8');
  for (const leaked of ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_BOT_TOKEN']) {
    assert.ok(!src.includes(leaked), `${leaked} must not appear in the scheduler`);
  }
  assert.match(src, /ingest_secret/i, 'the shared secret is still expected');
});

test('the email drop step runs last, with its own secret', async () => {
  // The email route is gated by DIGEST_CRON_SECRET, not the ingest secret, so a
  // Worker that leaked the wrong header would simply get a 401 it never saw.
  const emailSecret = 'e'.repeat(40);
  const h = harness(byRoute({ email: { sent: 6, skipped: 8, failed: 0, recipients: 14 } }));
  try {
    const { logs, errors } = await h.fire({ INGEST_SECRET: SECRET, DIGEST_CRON_SECRET: emailSecret });
    assert.equal(errors.length, 0);
    assert.equal(h.requests.length, 5, 'all five steps must fire');
    const email = h.requests[4];
    assert.match(email.url, /\/api\/cron-send-digest/);
    assert.equal(email.init.method, 'POST');
    assert.equal(email.init.headers['x-cron-secret'], emailSecret);
    assert.equal(email.init.headers['x-ingest-secret'], undefined, 'the email route must not see the ingest secret');
    const line = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-email-digest-ok');
    assert.ok(line, 'expected an email drop result line');
    assert.equal(line.sent, 6);
    assert.equal(line.skipped, 8, 'the per-user cooldown count must be visible in the log');
  } finally {
    h.restore();
  }
});

test('a missing email secret is reported without failing the run', async () => {
  // Same rule as the other steps: a disabled feature must be visible in the log
  // rather than indistinguishable from a healthy zero-email run.
  const h = harness(byRoute());
  try {
    const { errors } = await h.fire({ INGEST_SECRET: SECRET });
    assert.equal(h.requests.length, 4, 'the other four steps must still run');
    assert.equal(errors.length, 1);
    const e = JSON.parse(errors[0].text);
    assert.equal(e.event, 'jobs-email-digest-failed');
    assert.match(e.error, /DIGEST_CRON_SECRET/);
  } finally {
    h.restore();
  }
});

test('the whatsapp digest step runs last, with its own send secret', async () => {
  // The whatsapp-bot service is gated by WHATSAPP_SECRET sent as x-send-secret,
  // neither the ingest secret nor the email cron secret.
  const sendSecret = 'w'.repeat(40);
  const h = harness(byRoute({ whatsapp: { posted: 2, failed: 0, remaining: 0, alreadyPosted: false, errors: [] } }));
  try {
    const { logs, errors } = await h.fire({
      INGEST_SECRET: SECRET,
      DIGEST_CRON_SECRET: 'e'.repeat(40),
      WHATSAPP_SEND_URL: 'https://wa.example',
      WHATSAPP_SECRET: sendSecret
    });
    assert.equal(errors.length, 0);
    assert.equal(h.requests.length, 6, 'all six steps must fire');
    const wa = h.requests[5];
    assert.match(wa.url, /wa\.example\/send-digest/);
    assert.equal(wa.init.method, 'POST');
    assert.equal(wa.init.headers['x-send-secret'], sendSecret);
    assert.equal(wa.init.headers['x-ingest-secret'], undefined, 'the service must not see the ingest secret');
    const line = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-whatsapp-digest-ok');
    assert.ok(line, 'expected a whatsapp digest result line');
    assert.equal(line.posted, 2);
    assert.equal(line.alreadyPosted, false);
  } finally {
    h.restore();
  }
});

test('a whatsapp step without its env is logged as skipped, not as a failure', async () => {
  // The bot is not always deployed; until WHATSAPP_SEND_URL/WHATSAPP_SECRET are
  // set the run must stay green (the email step above already reports its own
  // missing secret on the same run).
  const h = harness(byRoute());
  try {
    const { logs, errors } = await h.fire({ INGEST_SECRET: SECRET, DIGEST_CRON_SECRET: 'e'.repeat(40) });
    assert.equal(h.requests.length, 5, 'the five non-whatsapp steps must still run');
    assert.equal(errors.length, 0, 'a skipped step is not an error');
    const line = logs.map((l) => JSON.parse(l.text)).find((e) => e.event === 'jobs-whatsapp-digest-skipped');
    assert.ok(line, 'the skip must be visible, not silent');
    assert.match(line.reason, /WHATSAPP_SEND_URL/);
  } finally {
    h.restore();
  }
});
