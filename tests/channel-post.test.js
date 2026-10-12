// Tests for the public-channel broadcast: POST /channel-post and its helpers.
//
// What these hold in place:
//   1. A crafted job title cannot inject markup into the channel digest. The
//      channel is public, so an injected link is seen by everyone, not just us.
//   2. The digest links to our own job page, never straight off-site.
//   3. There is exactly ONE digest post per UTC day (channel_digests row), and
//      jobs are stamped channel_posted_at only after the send is confirmed, so a
//      failure retries instead of silently dropping a job or double-posting.
//   4. The route refuses an unauthenticated caller and answers a loud 503 naming
//      the migration when channel_posted_at or channel_digests is missing.
//
// functions/*.js and functions/lib/*.js are ESM, so they are pulled in with a
// dynamic import from these CommonJS tests, as the other route tests do.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const urlOf = p => pathToFileURL(p).href;
const LIB = urlOf(path.join(ROOT, 'functions', 'lib', 'telegram.js'));
const ROUTE = urlOf(path.join(ROOT, 'functions', 'channel-post.js'));

const SECRET = 'a'.repeat(64);
const BOT = '123456:AAEtesttesttesttesttesttesttesttesttest';
const CHANNEL = '@swapiki_jobs';
const UUID = '3f8a1c2e-9d4b-4a1f-8c7d-2e6b5a4d3c21';
const UUID2 = '9b2d4e6f-1a3c-4b5d-8e7f-0a1b2c3d4e5f';

const day = new Date().toISOString().slice(0, 10);

const env = {
  INGEST_SECRET: SECRET,
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  TELEGRAM_BOT_TOKEN: BOT,
  TELEGRAM_CHANNEL_ID: CHANNEL
};

const published = (over = {}) => Object.assign(
  {
    id: UUID,
    title: 'Backend Engineer',
    company: 'Acme',
    location: 'Bengaluru',
    category: 'it',
    salary: '20,00,000 per year',
    skills: ['Node', 'SQL'],
    apply_url: 'https://example.com/apply',
    first_seen_at: '2026-10-01T00:00:00Z'
  },
  over
);

/**
 * Stubs PostgREST and the Bot API, recording every call. The jobs and
 * channel_digests reads are answered separately so the route's two GETs can be
 * driven independently.
 */
function harness({ rows = [], digestRows = [], tg, supaGet } = {}) {
  const supa = [];
  const telegram = [];
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const realErr = console.error;
  console.log = () => {};
  console.error = () => {};

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = (init && init.method) || 'GET';
    if (url.startsWith('https://fake.supabase.co')) {
      const restPath = url.split('/rest/v1/')[1];
      supa.push({ method, path: restPath, body: init && init.body ? JSON.parse(init.body) : null });
      if (method === 'GET') {
        const isDigest = restPath.includes('channel_digests');
        const out = supaGet
          ? supaGet(restPath)
          : (isDigest ? digestRows : rows);
        if (out && out.__response) return out.__response;
        return new Response(JSON.stringify(out), { status: 200 });
      }
      return new Response(null, { status: 204 });
    }
    if (url.startsWith('https://api.telegram.org')) {
      const tgMethod = url.split('/bot').pop().split('/')[1];
      const body = init && init.body ? JSON.parse(init.body) : {};
      telegram.push({ method: tgMethod, body });
      if (tg) return tg(tgMethod, body);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 });
    }
    throw new Error(`unexpected host: ${url}`);
  };

  return {
    supa,
    telegram,
    restore() {
      globalThis.fetch = realFetch;
      console.log = realLog;
      console.error = realErr;
    }
  };
}

const post = (headers = {}) => new Request('https://example.com/channel-post', {
  method: 'POST',
  headers: { 'x-ingest-secret': SECRET, ...headers }
});

let lib;
test.before(async () => {
  lib = await import(LIB);
});

test('formatChannelDigest links to our job pages and escapes hostile titles', () => {
  const text = lib.formatChannelDigest([
    {
      job: published({ title: '<b>Free</b> <a href="https://evil.example">crypto</a>', salary: '20,00,000 & stock' }),
      url: `https://swapiki.com/jobs/backend-engineer--${UUID}`
    },
    {
      job: published({ id: UUID2, title: 'Analyst', salary: null }),
      url: `https://swapiki.com/jobs/analyst--${UUID2}`
    }
  ]);
  assert.ok(!text.includes('<b>Free</b>'), 'a raw <b> from the title reached the digest');
  assert.match(text, /&lt;b&gt;Free&lt;\/b&gt;/);
  assert.match(text, /20,00,000 &amp; stock/, 'an ampersand must be escaped or Telegram refuses the message');
  // Every link is ours, one per listed job plus the footer, none off-site.
  const links = [...text.matchAll(/<a href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(links, [
    `https://swapiki.com/jobs/backend-engineer--${UUID}`,
    `https://swapiki.com/jobs/analyst--${UUID2}`,
    'https://swapiki.com/#jobs'
  ], 'in order: the two jobs, then the footer');
  assert.ok(!text.includes('evil.example"'), 'the injected URL must not become a second link');
  assert.match(text, /1\. /, 'the digest numbers its jobs');
  // Each job is spread over short lines (title link, then company/location,
  // then salary) so a narrow phone does not render one over-long line.
  assert.match(text, /<\/a>\nAcme  ·  Bengaluru/, 'the company and location get their own line');
  assert.match(text, /\n💰 20,00,000 &amp; stock/, 'the salary gets its own line');
});

test('formatChannelDigest still renders a header and footer with nothing to list', () => {
  const text = lib.formatChannelDigest([]);
  assert.match(text, /New roles on Swapiki/);
  assert.match(text, /See all roles on Swapiki/);
  assert.ok((text.match(/^\d+\. /gm) || []).length === 0, 'an empty digest must not number anything');
});

test('sendChannelDigest posts ONE message with HTML parse mode and unfurl on', async () => {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
  try {
    await lib.sendChannelDigest(BOT, CHANNEL, [{ job: published(), url: `https://swapiki.com/jobs/x--${UUID}` }]);
    assert.equal(calls.length, 1, 'a digest is one message, not one per job');
    assert.match(calls[0].url, /\/sendMessage$/);
    assert.equal(calls[0].body.chat_id, CHANNEL);
    assert.equal(calls[0].body.parse_mode, 'HTML');
    assert.equal(calls[0].body.disable_web_page_preview, false, 'the job link should unfurl');
  } finally {
    globalThis.fetch = real;
  }
});

test('the route refuses an unauthenticated caller', async () => {
  const mod = await import(ROUTE);
  const res = await mod.onRequestPost({ request: post({ 'x-ingest-secret': 'wrong' }), env });
  assert.equal(res.status, 401);
});

test('the route 503s when the channel is not configured', async () => {
  const mod = await import(ROUTE);
  const res = await mod.onRequestPost({
    request: post(),
    env: { ...env, TELEGRAM_CHANNEL_ID: '' }
  });
  assert.equal(res.status, 503);
});

test('a missing channel_posted_at column is a loud 503 naming the migration', async () => {
  const mod = await import(ROUTE);
  const h = harness({
    supaGet: () => ({
      __response: new Response(
        JSON.stringify({ code: '42703', message: 'column jobs.channel_posted_at does not exist' }),
        { status: 400 }
      )
    })
  });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /jobs_channel_post_migration\.sql/);
  } finally {
    h.restore();
  }
});

test('a missing channel_digests table is a loud 503 naming its migration', async () => {
  const mod = await import(ROUTE);
  const h = harness({
    rows: [published()],
    supaGet: (p) => p.includes('channel_digests')
      ? {
          __response: new Response(
            JSON.stringify({ code: 'PGRST205', message: 'Could not find the table public.channel_digests in the schema cache' }),
            { status: 404 }
          )
        }
      : [published()]
  });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /jobs_channel_digest_migration\.sql/);
  } finally {
    h.restore();
  }
});

test('the first run of a day posts one digest, stamps every listed job, and records the day', async () => {
  const mod = await import(ROUTE);
  const h = harness({ rows: [published(), published({ id: UUID2, title: 'Analyst' })] });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.posted, 2, 'both pending jobs are in the digest');
    assert.equal(body.failed, 0);
    assert.equal(body.alreadyPosted, false);

    // Exactly ONE channel send, listing both jobs.
    const sends = h.telegram.filter(c => c.method === 'sendMessage');
    assert.equal(sends.length, 1, 'a day posts one message, not one per job');
    assert.equal(sends[0].body.chat_id, CHANNEL);
    assert.match(sends[0].body.text, /1\. /);
    assert.ok(sends[0].body.text.includes(UUID2) && sends[0].body.text.includes('swapiki.com/jobs/'));

    // Each included job is stamped after the send.
    const patches = h.supa.filter(c => c.method === 'PATCH' && c.path.startsWith('jobs'));
    assert.equal(patches.length, 2, 'each listed job is stamped');
    assert.ok(patches.every(p => p.body && p.body.channel_posted_at));

    // The day row records the day and its jobs.
    const insert = h.supa.find(c => c.method === 'POST');
    assert.ok(insert, 'the daily digest row is inserted');
    assert.equal(insert.path, 'channel_digests');
    assert.equal(insert.body.day, day);
    assert.deepEqual(insert.body.job_ids, [UUID, UUID2]);

    // The read itself only ever asks for the unposted rows.
    const read = h.supa.find(c => c.method === 'GET' && c.path.startsWith('jobs'));
    assert.match(read.path, /channel_posted_at=is\.null/);
  } finally {
    h.restore();
  }
});

test('a second run on the same day posts nothing and leaves jobs pending', async () => {
  const mod = await import(ROUTE);
  const h = harness({ rows: [published()], digestRows: [{ day }] });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(body.posted, 0);
    assert.equal(body.alreadyPosted, true);
    assert.equal(body.remaining, 1, 'the job waits for tomorrow rather than double-posting');
    assert.equal(h.telegram.filter(c => c.method === 'sendMessage').length, 0, 'no second digest today');
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'and no job is stamped');
  } finally {
    h.restore();
  }
});

test('the publish queue is read newest-first and only within a freshness window', async () => {
  const mod = await import(ROUTE);
  const h = harness({ rows: [] });
  try {
    await mod.onRequestPost({ request: post(), env });
    const read = h.supa.find(c => c.method === 'GET' && c.path.startsWith('jobs'));
    // Newest first: the board publishes far more a day than one digest holds, so
    // oldest-first would leave the channel showing week-old roles. The newest look
    // current, which is the point of the channel.
    assert.match(read.path, /order=first_seen_at\.desc/);
    // And bounded by a freshness window, so the ancient tail is dropped rather
    // than posted late.
    const m = read.path.match(/first_seen_at=gte\.([^&]+)/);
    assert.ok(m, 'the queue query must carry a first_seen_at lower bound');
    const ageHours = (Date.now() - new Date(decodeURIComponent(m[1])).getTime()) / 3600000;
    assert.ok(ageHours > 71.9 && ageHours < 72.1, `expected a ~72h window, got ${ageHours}h`);
  } finally {
    h.restore();
  }
});

test('a day with nothing pending does not post an empty digest', async () => {
  const mod = await import(ROUTE);
  const h = harness({ rows: [] });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(body.posted, 0);
    assert.equal(h.telegram.length, 0, 'no message is sent');
    assert.equal(h.supa.filter(c => c.method === 'POST').length, 0, 'no day row is written');
  } finally {
    h.restore();
  }
});

test('a failed send leaves jobs unstamped and no day row, so it retries', async () => {
  const mod = await import(ROUTE);
  const h = harness({
    rows: [published()],
    tg: () => new Response(JSON.stringify({ ok: false, description: 'chat not found' }), { status: 200 })
  });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(body.posted, 0);
    assert.equal(body.failed, 1);
    assert.equal(body.remaining, 0);
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'a failed send must not be stamped');
    assert.equal(h.supa.filter(c => c.method === 'POST').length, 0, 'and the day must not be marked done');
  } finally {
    h.restore();
  }
});

test('a backfill day lists only the cap and leaves the rest for a later digest', async () => {
  const mod = await import(ROUTE);
  const many = Array.from({ length: 12 }, (_, i) => published({ id: `${i}`.padStart(8, '0'), title: `Role ${i}` }));
  const h = harness({ rows: many });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(body.posted, 8, 'the digest lists at most its cap');
    assert.equal(body.remaining, 4, 'and reports what waits for the next digest');
    assert.equal(h.telegram.filter(c => c.method === 'sendMessage').length, 1);
    assert.equal(h.supa.filter(c => c.method === 'PATCH' && c.path.startsWith('jobs')).length, 8);
    assert.equal(h.supa.find(c => c.method === 'POST').body.job_ids.length, 8);
  } finally {
    h.restore();
  }
});