// Tests for the weekly Telegram job digest: POST /telegram-digest and its
// helpers.
//
// What these hold in place:
//   1. Only people we can actually reach (telegram_id) who follow the channel
//      (channel_joined_at) with a published profile get the digest.
//   2. "Weekly" is enforced by the stamp: a candidate is skipped until their
//      telegram_digest_sent_at is at least six days old, so the route is safe to
//      call on every two-hour run.
//   3. Roles rank by skill overlap, then freshness; no overlap means no DM, so a
//      candidate is never sent a digest of irrelevant jobs.
//   4. A row is stamped only after the send is confirmed, and a missing
//      telegram_digest_sent_at column is a loud 503 naming the migration.
//
// functions/*.js are ESM, so they are pulled in with a dynamic import from
// these CommonJS tests.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const urlOf = p => pathToFileURL(p).href;
const LIB = urlOf(path.join(ROOT, 'functions', 'lib', 'telegram.js'));
const ROUTE = urlOf(path.join(ROOT, 'functions', 'telegram-digest.js'));

const SECRET = 'a'.repeat(64);
const BOT = '123456:AAEtesttesttesttesttesttesttesttesttest';
const UUID = '3f8a1c2e-9d4b-4a1f-8c7d-2e6b5a4d3c21';
const UUID2 = '9b2d4e6f-1a3c-4b5d-8e7f-0a1b2c3d4e5f';
const UUID3 = '1c2e3d4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f';

const env = {
  INGEST_SECRET: SECRET,
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  TELEGRAM_BOT_TOKEN: BOT
};

const recent = new Date(Date.now() - 2 * 86400000).toISOString();

const candidate = (over = {}) => Object.assign(
  {
    id: UUID,
    name: 'Anjali Verma',
    expertise: ['node', 'sql'],
    profile_status: 'published',
    telegram_id: 111222,
    channel_joined_at: recent,
    telegram_digest_sent_at: null,
    is_dummy: false
  },
  over
);

const job = (over = {}) => Object.assign(
  {
    id: UUID2,
    title: 'Backend Engineer',
    company: 'Acme',
    location: 'Bengaluru',
    salary: '20,00,000 per year',
    skills: ['Node', 'SQL'],
    created_at: recent
  },
  over
);

/**
 * Stubs PostgREST and the Bot API, recording every call. The candidates and
 * jobs reads are answered separately so a test can drive each table.
 */
function harness({ candidates = [], jobs = [], tg, supaGet } = {}) {
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
        const isCandidates = restPath.startsWith('candidates');
        const out = supaGet
          ? supaGet(restPath)
          : (isCandidates ? candidates : jobs);
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
      return new Response(JSON.stringify({ ok: true, result: { message_id: 3 } }), { status: 200 });
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

const post = (headers = {}) => new Request('https://example.com/telegram-digest', {
  method: 'POST',
  headers: { 'x-ingest-secret': SECRET, ...headers }
});

let lib;
test.before(async () => {
  lib = await import(LIB);
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('rankDigestJobs puts skill overlap before freshness', async () => {
  const mod = await import(ROUTE);
  const nodeJob = job({ id: UUID2, title: 'Node role', skills: ['Node'], created_at: recent });
  const freshJob = job({ id: UUID3, title: 'Fresh but no match', skills: ['Marketing'], created_at: new Date().toISOString() });
  const older = job({ id: UUID, title: 'SQL role, older', skills: ['SQL'], created_at: new Date(Date.now() - 5 * 86400000).toISOString() });

  const ranked = mod.rankDigestJobs([freshJob, nodeJob, older], candidate({ expertise: ['Node'] }));
  assert.equal(ranked[0].id, UUID2, 'the overlapping skill outranks a newer job');
  assert.ok(ranked.indexOf(freshJob) < ranked.indexOf(older), 'of two non-matches, the newer one stays ahead');
});

test('a candidate with no expertise is ranked by freshness', async () => {
  const mod = await import(ROUTE);
  const oldest = job({ id: UUID2, title: 'old', created_at: recent });
  const newest = job({ id: UUID3, title: 'new', created_at: new Date().toISOString() });
  const ranked = mod.rankDigestJobs([oldest, newest], candidate({ expertise: [] }));
  assert.equal(ranked[0].id, UUID3, 'recency decides when nothing matches');
});

test('formatCandidateDigest escapes the receiver and the jobs, and links to ours', () => {
  const text = lib.formatCandidateDigest('<b>Anjali</b>', [
    {
      job: job({ title: '<i>Backend</i> <a href="https://evil.example">x</a>', salary: '20,00,000 & equity' }),
      url: `https://swapiki.com/jobs/backend--${UUID2}`
    }
  ]);
  assert.ok(!text.includes('<b>Anjali</b>'), 'the name is markup and must be escaped');
  assert.match(text, /&lt;b&gt;Anjali&lt;\/b&gt;/);
  assert.ok(!text.includes('<i>Backend</i>'), 'a raw job title tag reached the digest');
  assert.match(text, /20,00,000 &amp; equity/, 'an ampersand must be escaped or Telegram refuses the message');
  const links = [...text.matchAll(/<a href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(links, [`https://swapiki.com/jobs/backend--${UUID2}`, 'https://swapiki.com/#jobs'], 'the one job, then the footer');
});

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

test('the route refuses an unauthenticated caller', async () => {
  const mod = await import(ROUTE);
  const res = await mod.onRequestPost({ request: post({ 'x-ingest-secret': 'wrong' }), env });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).sent, undefined);
});

test('the route 503s when Telegram is not configured', async () => {
  const mod = await import(ROUTE);
  const res = await mod.onRequestPost({
    request: post(),
    env: { ...env, TELEGRAM_BOT_TOKEN: '' }
  });
  assert.equal(res.status, 503);
});

test('a missing telegram_digest_sent_at column is a loud 503 naming the migration', async () => {
  const mod = await import(ROUTE);
  const h = harness({
    candidates: [candidate()],
    jobs: [job()],
    supaGet: (p) => p.startsWith('candidates')
      ? {
          __response: new Response(
            JSON.stringify({ code: '42703', message: 'column candidates.telegram_digest_sent_at does not exist' }),
            { status: 400 }
          )
        }
      : [job()]
  });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /telegram_digest_migration\.sql/);
  } finally {
    h.restore();
  }
});

test('linked, joined, published candidates get the digest and are stamped', async () => {
  const mod = await import(ROUTE);
  const h = harness({ candidates: [candidate()], jobs: [job()] });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.sent, 1);
    assert.equal(body.failed, 0);

    const send = h.telegram.find(c => c.method === 'sendMessage');
    assert.ok(send, 'a digest DM is sent');
    assert.equal(send.body.chat_id, 111222, 'it goes to the candidate, not the channel');
    assert.equal(send.body.parse_mode, 'HTML');
    assert.match(send.body.text, /Hi Anjali!/);
    assert.match(send.body.text, /Backend Engineer/);
    assert.match(send.body.text, /swapiki\.com\/jobs\//);

    const stamp = h.supa.find(c => c.method === 'PATCH');
    assert.ok(stamp, 'the send is recorded on the row');
    assert.equal(stamp.path, `candidates?id=eq.${UUID}`);
    assert.match(stamp.body.telegram_digest_sent_at, /^\d{4}-\d{2}-\d{2}T/);

    const read = h.supa.find(c => c.method === 'GET');
    assert.match(read.path, /telegram_id=not\.is\.null/);
    assert.match(read.path, /channel_joined_at=not\.is\.null/);
    assert.match(read.path, /profile_status=eq\.published/);
  } finally {
    h.restore();
  }
});

test('a candidate messaged in the last six days is skipped, not re-sent', async () => {
  const mod = await import(ROUTE);
  const h = harness({
    candidates: [candidate({ telegram_digest_sent_at: new Date(Date.now() - 2 * 86400000).toISOString() })],
    jobs: [job()]
  });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(body.sent, 0);
    assert.equal(body.skipped, 1);
    assert.equal(h.telegram.length, 0, 'no DM inside the cooldown');
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'and no stamp is rewritten');
  } finally {
    h.restore();
  }
});

test('dummy profiles and unlinked rows are never in the audience', async () => {
  const mod = await import(ROUTE);
  const h = harness({
    candidates: [
      candidate({ id: UUID, is_dummy: true, telegram_id: 111 }),
      candidate({ id: UUID2, telegram_id: null }),
      candidate({ id: UUID3, profile_status: 'draft' })
    ],
    jobs: [job()]
  });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(body.sent, 0);
    assert.equal(body.eligible, 0, 'nothing matches the audience filter');
    assert.equal(h.telegram.length, 0);
  } finally {
    h.restore();
  }
});

test('no skill overlap means no message, not an irrelevant digest', async () => {
  const mod = await import(ROUTE);
  const h = harness({
    candidates: [candidate({ expertise: ['cooking'] })],
    jobs: [job({ skills: ['Node', 'SQL'] })]
  });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(body.sent, 0);
    assert.equal(body.skipped, 1);
    assert.equal(h.telegram.length, 0, 'a candidate not matched by skills stays quiet');
  } finally {
    h.restore();
  }
});

test('a failed send is left unstamped so it retries, and is reported', async () => {
  const mod = await import(ROUTE);
  const h = harness({
    candidates: [candidate()],
    jobs: [job()],
    tg: () => new Response(JSON.stringify({ ok: false, description: 'bot was blocked' }), { status: 200 })
  });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(body.sent, 0);
    assert.equal(body.failed, 1);
    assert.equal(body.errors.length, 1);
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'only a confirmed send is stamped');
  } finally {
    h.restore();
  }
});

test('a big audience drains across runs instead of bursting DMs', async () => {
  const mod = await import(ROUTE);
  const many = Array.from({ length: 45 }, (_, i) => candidate({
    id: `${i}`.padStart(8, '0'),
    telegram_id: 1000 + i,
    expertise: ['node'],
    name: `Candidate ${i}`
  }));
  const h = harness({ candidates: many, jobs: [job()] });
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    const body = await res.json();
    assert.equal(body.sent, 20, 'one run drains only the cap, which fits the 50-subrequest budget');
    assert.equal(body.remaining, 25, 'the rest wait for the next poll');
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 20);
  } finally {
    h.restore();
  }
});