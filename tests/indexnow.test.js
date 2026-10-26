// IndexNow: the payload shape, the ping's failure behaviour, and the one
// invariant that would fail silently in production.
//
// The threat this file guards against is not a crash. A key file that no longer
// matches the key in the code, or a slugged URL that is not the page's canonical
// address, still produces HTTP 200 responses everywhere and quietly stops the
// site being indexed at all. So the assertions are about agreement: constant vs
// committed file, submitted URL vs canonical slug, curation read vs slug inputs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
// pathToFileURL, not a bare path: the ESM loader rejects a Windows drive letter
// ("Received protocol 'c:'") and every test in this file would fail for a reason
// that has nothing to do with IndexNow.
const urlOf = p => pathToFileURL(p).href;

const UUID = '11111111-2222-3333-4444-555555555555';
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();

let indexnow;
let ingest;

test.before(async () => {
  indexnow = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'indexnow.js')));
  ingest = await import(urlOf(path.join(ROOT, 'functions', 'ingest.js')));
});

// --------------------------------------------------------------- the payload

test('the payload names the host, its key location and a deduplicated list', () => {
  const payload = indexnow.buildIndexNowPayload({
    key: 'k1',
    urls: ['https://swapiki.com/jobs/a', 'https://swapiki.com/jobs/a', '', null, 'https://swapiki.com/jobs/b']
  });
  assert.equal(payload.host, 'swapiki.com');
  assert.equal(payload.key, 'k1');
  assert.equal(payload.keyLocation, 'https://swapiki.com/k1.txt');
  // A URL submitted twice in one batch reads as a repeat submission, which the
  // service answers 429 for.
  assert.deepEqual(payload.urlList, ['https://swapiki.com/jobs/a', 'https://swapiki.com/jobs/b']);
});

test('the key location is derived from the site it points at', () => {
  const payload = indexnow.buildIndexNowPayload({ siteUrl: 'https://swapiki.com/', key: 'abc' });
  assert.equal(payload.keyLocation, 'https://swapiki.com/abc.txt', 'a trailing slash must not double up');
  assert.equal(payload.host, 'swapiki.com');
});

test('a job URL is built from the slug the page canonical uses', async () => {
  const { jobSlug } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'jobs-feed.js')));
  const job = { id: UUID, title: 'Backend Engineer', company: 'Acme', location: 'Bengaluru' };
  const url = indexnow.jobPageUrl(job);
  assert.equal(url, `https://swapiki.com/jobs/${jobSlug(job)}`);
  // The uuid tail is what the route parses back out, so a submitted URL that
  // lost it would point at a 404 and the ping would be wasted.
  assert.ok(url.endsWith(`--${UUID}`), `expected the uuid in ${url}`);
});

// ------------------------------------------------------------------ the ping

test('the ping POSTs the payload to the IndexNow endpoint', async () => {
  const seen = {};
  const fetchImpl = async (url, init) => {
    seen.url = url;
    seen.init = init;
    return new Response('', { status: 200 });
  };

  const res = await indexnow.pingIndexNow([{ id: UUID, title: 'Senior Software Engineer', company: 'Acme', location: 'Bengaluru' }], { fetchImpl });

  assert.equal(seen.url, indexnow.INDEXNOW_ENDPOINT);
  assert.equal(seen.init.method, 'POST');
  assert.match(seen.init.headers['Content-Type'], /application\/json/);

  const body = JSON.parse(seen.init.body);
  assert.equal(body.host, 'swapiki.com');
  assert.equal(body.key, indexnow.INDEXNOW_KEY);
  assert.equal(body.keyLocation, `https://swapiki.com/${indexnow.INDEXNOW_KEY}.txt`);
  assert.deepEqual(body.urlList, ['https://swapiki.com/jobs/senior-software-engineer-acme-bengaluru--' + UUID]);
  assert.deepEqual(res, { submitted: 1, status: 200, ok: true });
});

test('nothing was published, so nothing is submitted', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return new Response('', { status: 200 }); };

  const empty = await indexnow.pingIndexNow([], { fetchImpl });
  const missing = await indexnow.pingIndexNow(undefined, { fetchImpl });
  const voided = await indexnow.pingIndexNow([null, undefined], { fetchImpl });

  assert.equal(called, false, 'an empty batch must not make a request at all');
  for (const res of [empty, missing, voided]) {
    assert.equal(res.submitted, 0);
    assert.equal(res.skipped, true);
  }
});

test('a non-2xx answer is surfaced rather than swallowed', async () => {
  const res = await indexnow.pingIndexNow([{ id: UUID }], {
    fetchImpl: async () => new Response('slow down', { status: 429 })
  });
  assert.deepEqual(res, { submitted: 1, status: 429, ok: false }, 'a rate limit must be readable in the response');
});

test('a network failure is returned as data, never thrown', async () => {
  // The caller publishes jobs first and pings second; if the ping threw, a
  // search engine being unreachable would read as a failed publication.
  const res = await indexnow.pingIndexNow([{ id: UUID }], {
    fetchImpl: async () => { throw new Error('boom'); }
  });
  assert.equal(res.submitted, 0);
  assert.match(res.error, /boom/);
});

// ------------------------------------------------ the agreement, at the root

test('the key file the site serves carries the key the code sends', () => {
  const keyFile = path.join(ROOT, `${indexnow.INDEXNOW_KEY}.txt`);
  assert.ok(fs.existsSync(keyFile), `expected an IndexNow key file at ${keyFile}`);
  const served = fs.readFileSync(keyFile, 'utf8');
  assert.equal(served.trim(), indexnow.INDEXNOW_KEY, 'the served key must be the key being submitted');
});

// ---------------------------------------------- the ping actually happens

/**
 * Runs POST /ingest?curate=1 against a stub network: Supabase answers the
 * curation read with `drafts` and accepts every write, Adzuna returns nothing
 * (so the run is purely "curate the queue"), and the IndexNow endpoint records
 * what it was sent.
 */
async function runCurate(drafts, { fetchImpl: pingFetch } = {}) {
  const supabaseCalls = [];
  const pings = [];
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const u = String(input);
    const method = (init && init.method) || 'GET';

    if (u.startsWith('https://fake.supabase.co')) {
      supabaseCalls.push({ method, path: u.split('/rest/v1/')[1] || u });
      if (method !== 'GET') return new Response(null, { status: 204 });
      return new Response(JSON.stringify(drafts), { status: 200 });
    }

    if (u === indexnow.INDEXNOW_ENDPOINT) {
      pings.push(JSON.parse(init.body));
      if (pingFetch) return pingFetch();
      return new Response('', { status: 200 });
    }

    // Anything else is the feed.
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };

  try {
    const res = await ingest.onRequestPost({
      request: new Request('https://example.com/ingest?curate=1', {
        method: 'POST',
        headers: { 'x-ingest-secret': 'a'.repeat(64) }
      }),
      env: {
        INGEST_SECRET: 'a'.repeat(64),
        SUPABASE_URL: 'https://fake.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
        ADZUNA_APP_ID: 'id',
        ADZUNA_APP_KEY: 'key'
      }
    });
    return { body: await res.json(), status: res.status, pings, supabaseCalls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('publishing a batch pings IndexNow with exactly the URLs that became canonical', async () => {
  const draft = {
    id: UUID,
    title: 'Senior Software Engineer',
    company: 'Acme',
    category: 'it',
    salary: null,
    location: 'Bengaluru',
    first_seen_at: daysAgo(2)
  };

  const { body, status, pings, supabaseCalls } = await runCurate([draft]);

  assert.equal(status, 200);
  assert.equal(body.curation.published, 1, 'the recognised role should publish');
  assert.deepEqual(body.errors, [], 'a search engine must never surface as an ingest error');

  assert.equal(pings.length, 1, `expected one ping, saw ${pings.length}`);
  assert.deepEqual(pings[0].urlList, [
    `https://swapiki.com/jobs/senior-software-engineer-acme-bengaluru--${UUID}`
  ]);
  assert.equal(pings[0].key, indexnow.INDEXNOW_KEY);
  assert.equal(pings[0].host, 'swapiki.com');
  assert.equal(body.curation.indexnow.submitted, 1, 'the run reports what it submitted');

  // The slug needs location, so the curation read has to ask for it - without it
  // the submitted URL and the page's canonical would silently diverge.
  const read = supabaseCalls.find(c => c.method === 'GET');
  assert.ok(read, 'expected a curation read');
  assert.match(read.path, /select=[^&]*location/, 'the curation read must include the slug inputs');
});

test('a batch that publishes nothing sends no ping at all', async () => {
  // An unrecognised title stays in review: nothing reached the public board, so
  // there is no address for an engine to care about yet.
  const review = {
    id: UUID,
    title: 'Chief Happiness Wizard',
    company: 'Elsewhere',
    category: 'any',
    salary: null,
    location: 'Nowhere',
    first_seen_at: daysAgo(2)
  };

  const { body, pings } = await runCurate([review]);

  assert.equal(body.curation.published, 0);
  assert.equal(body.curation.leftAsDraft, 1);
  assert.deepEqual(pings, [], 'a run that published nothing must not submit URLs');
  assert.equal(body.curation.indexnow.skipped, true);
});

test('the publication still succeeds when the ping cannot be delivered', async () => {
  const draft = {
    id: UUID,
    title: 'Senior Software Engineer',
    company: 'Acme',
    category: 'it',
    salary: null,
    location: 'Bengaluru',
    first_seen_at: daysAgo(2)
  };

  const { body, status } = await runCurate([draft], {
    fetchImpl: async () => { throw new Error('engine unreachable'); }
  });

  assert.equal(status, 200);
  assert.equal(body.curation.published, 1, 'the jobs are published regardless');
  assert.deepEqual(body.errors, [], 'a broken ping must not be reported as a failed ingest');
  assert.equal(body.curation.indexnow.submitted, 0);
  assert.match(body.curation.indexnow.error, /engine unreachable/, 'the failure is reported on the ping itself');
});
