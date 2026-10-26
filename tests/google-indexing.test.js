// The Google Indexing API is the one engine that answers in hours instead of
// waiting for a sitemap pass, and the only one with a hard 200-a-day quota. What
// is pinned here is therefore mostly the failure behaviour: a forgotten secret,
// a spent quota or an unshared Search Console property must all be reported as
// data on curation.googleIndexing, because they arrive in the middle of a
// curation run that has already published the job it was pinging.

const test = require('node:test');
const { beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const URL0 = pathToFileURL(path.join(ROOT, 'functions', 'lib', 'google-indexing.js')).href;

const json = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

// A real RSA key, generated in-process, so the RS256 signing path runs for
// genuine instead of being mocked around. A fixture private key pasted into a
// test file would be a credential in a repository for no benefit.
let SA;
let keyPair;

async function makeServiceAccount() {
  keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/.{64}/g, '$&\n');
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}${b64.endsWith('\n') ? '' : '\n'}-----END PRIVATE KEY-----`;
  SA = JSON.stringify({
    type: 'service_account',
    project_id: 'swapiki-indexing',
    client_email: 'swapiki-indexing@swapiki-indexing.iam.gserviceaccount.com',
    private_key_id: 'test-key-id',
    private_key: pem
  });
  return SA;
}

// Mirrors the scheduler's cron "23 */2 * * *" - twelve runs a day.
const RUNS_PER_DAY = 12;
const jobs = (n, base = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    title: `Job ${i}`,
    company: 'Acme',
    location: 'Bangalore',
    created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    ...base
  }));

beforeEach(async () => {
  if (!SA) await makeServiceAccount();
  const mod = await import(URL0);
  mod.resetTokenCache();
});

test('parseServiceAccount reads the fields the grant needs', async () => {
  const { parseServiceAccount } = await import(URL0);
  const sa = parseServiceAccount(await makeServiceAccount());
  assert.equal(sa.client_email, 'swapiki-indexing@swapiki-indexing.iam.gserviceaccount.com');
  assert.equal(sa.private_key_id, 'test-key-id');
  assert.ok(sa.private_key.includes('BEGIN PRIVATE KEY'));
});

test('a missing or malformed key is null, never a throw', async () => {
  const { parseServiceAccount } = await import(URL0);
  for (const bad of [null, undefined, '', 'not json', '[]', '{"client_email":"x@y.z"}', '{"private_key":"x"}', 42]) {
    assert.equal(parseServiceAccount(bad), null, 'should be null for ' + String(bad));
  }
});

test('buildIndexingPayload names one url and marks it updated', async () => {
  const { buildIndexingPayload } = await import(URL0);
  assert.deepEqual(buildIndexingPayload('https://swapiki.com/jobs/a'), {
    url: 'https://swapiki.com/jobs/a',
    type: 'URL_UPDATED'
  });
});

test('without a configured secret nothing is sent', async () => {
  const { pingGoogleIndexing } = await import(URL0);
  let calls = 0;
  const res = await pingGoogleIndexing(jobs(3), {
    env: {},
    fetchImpl: async () => { calls++; return json({}); }
  });
  assert.equal(res.skipped, true);
  assert.equal(res.reason, 'not configured');
  assert.equal(calls, 0, 'must not reach the network without a credential');
});

test('a key that is set but unreadable is reported, not silently skipped', async () => {
  const { pingGoogleIndexing } = await import(URL0);
  let calls = 0;
  for (const bad of ['{truncated', 'not json at all', '{"client_email":"a@b.c"}']) {
    const res = await pingGoogleIndexing(jobs(3), {
      env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: bad },
      fetchImpl: async () => { calls++; return json({}); }
    });
    assert.equal(res.skipped, undefined, 'must not read as a deliberate skip');
    assert.match(res.error, /GOOGLE_INDEXING_SERVICE_ACCOUNT/);
    assert.equal(res.submitted, 0);
  }
  assert.equal(calls, 0, 'and it never signs with a key it cannot read');
});

test('an empty batch is skipped, not an error', async () => {
  const { pingGoogleIndexing } = await import(URL0);
  const res = await pingGoogleIndexing([], {
    env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA },
    fetchImpl: async () => json({})
  });
  assert.equal(res.skipped, true);
  assert.equal(res.reason, 'no urls');
});

test('each url is published as URL_UPDATED with the OAuth bearer', async () => {
  const { pingGoogleIndexing, GOOGLE_INDEXING_ENDPOINT, GOOGLE_OAUTH_TOKEN_URL } = await import(URL0);
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    if (url === GOOGLE_OAUTH_TOKEN_URL) return json({ access_token: 'tok-1', expires_in: 3600 });
    return json({ urlNotificationMetadata: {} });
  };
  const res = await pingGoogleIndexing(jobs(3), {
    env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA },
    fetchImpl
  });
  assert.equal(res.submitted, 3);
  assert.equal(res.attempted, 3);
  assert.equal(res.errors, undefined, 'a clean run reports no errors');

  const tokenCall = calls.find((c) => c.url === GOOGLE_OAUTH_TOKEN_URL);
  assert.ok(tokenCall, 'the key is exchanged for a token first');
  const assertion = /assertion=([^&]+)/.exec(tokenCall.opts.body).pop();
  assert.equal(assertion.split('.').length, 3, 'the grant is a three-part JWT');

  const pings = calls.filter((c) => c.url === GOOGLE_INDEXING_ENDPOINT);
  assert.equal(pings.length, 3);
  for (const p of pings) {
    assert.equal(p.opts.headers.Authorization, 'Bearer tok-1');
    assert.equal(JSON.parse(p.opts.body).type, 'URL_UPDATED');
    assert.match(JSON.parse(p.opts.body).url, /^https:\/\/swapiki\.com\/jobs\//);
  }
});

test('the JWT header carries the key id Google checks against', async () => {
  const { getAccessToken, parseServiceAccount } = await import(URL0);
  let assertion = null;
  const fetchImpl = async (url, opts) => {
    assertion = /assertion=([^&]+)/.exec(opts.body).pop();
    return json({ access_token: 'tok-2', expires_in: 3600 });
  };
  await getAccessToken(parseServiceAccount(SA), { fetchImpl });
  const header = JSON.parse(Buffer.from(assertion.split('.')[0], 'base64url').toString('utf8'));
  assert.equal(header.alg, 'RS256');
  assert.equal(header.kid, 'test-key-id');
  const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.iss, 'swapiki-indexing@swapiki-indexing.iam.gserviceaccount.com');
  assert.match(claims.scope, /indexing/);
});

test('one token is reused across the whole batch', async () => {
  const { pingGoogleIndexing, GOOGLE_INDEXING_ENDPOINT, GOOGLE_OAUTH_TOKEN_URL } = await import(URL0);
  let tokenCalls = 0;
  const fetchImpl = async (url, opts) => {
    if (url === GOOGLE_OAUTH_TOKEN_URL) { tokenCalls++; return json({ access_token: 't', expires_in: 3600 }); }
    return json({});
  };
  await pingGoogleIndexing(jobs(5), { env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA }, fetchImpl });
  assert.equal(tokenCalls, 1, 'five requests, one grant');
});

test('the batch never exceeds the share of the daily quota one run may use', async () => {
  const { pingGoogleIndexing, MAX_PINGS_PER_RUN, GOOGLE_DAILY_QUOTA } = await import(URL0);
  assert.ok(
    MAX_PINGS_PER_RUN * RUNS_PER_DAY <= GOOGLE_DAILY_QUOTA,
    'a full day of runs would overrun Google\'s quota'
  );
  assert.ok(MAX_PINGS_PER_RUN <= 16, '16/day x 12 runs would be 192; 17 would exceed 200');

  let publishes = 0;
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com')) return json({ access_token: 't', expires_in: 3600 });
    publishes++;
    return json({});
  };
  const res = await pingGoogleIndexing(jobs(500), {
    env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA },
    fetchImpl
  });
  assert.equal(res.attempted, MAX_PINGS_PER_RUN);
  assert.equal(res.truncated, true, 'the caller is told the batch was cut');
  assert.equal(publishes, MAX_PINGS_PER_RUN, 'the quota is enforced by not sending');
});

test('the newest listings get the scarce requests first', async () => {
  const { pingGoogleIndexing, GOOGLE_INDEXING_ENDPOINT } = await import(URL0);
  const sent = [];
  const fetchImpl = async (url, opts) => {
    if (url.includes('oauth2.googleapis.com')) return json({ access_token: 't', expires_in: 3600 });
    sent.push(JSON.parse(opts.body).url);
    return json({});
  };
  // jobs() is already oldest-first - the worst order this function can be
  // handed, since it spends the scarce requests on the listings Google has
  // probably already seen unless it re-sorts them itself.
  const rows = jobs(4);
  await pingGoogleIndexing(rows, { env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA }, fetchImpl });
  assert.equal(sent.length, 4);
  const newest = await import(pathToFileURL(path.join(ROOT, 'functions', 'lib', 'indexnow.js')).href);
  assert.equal(sent[0], newest.jobPageUrl(rows[3]), 'newest row pings first');
});

test('a spent quota is reported, and stops the batch instead of burning it', async () => {
  const { pingGoogleIndexing, MAX_PINGS_PER_RUN, GOOGLE_INDEXING_ENDPOINT } = await import(URL0);
  let publishes = 0;
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com')) return json({ access_token: 't', expires_in: 3600 });
    publishes++;
    return json({ error: { code: 429, message: 'Quota exceeded' } }, 429);
  };
  const res = await pingGoogleIndexing(jobs(50), {
    env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA },
    fetchImpl
  });
  assert.equal(res.submitted, 0);
  assert.ok(res.errors.length >= 1, 'the refusal reaches the log');
  assert.ok(res.errors[0].includes('429'));
  assert.equal(publishes, 1, 'the remaining 14 were not spent on the same answer');
  assert.ok(publishes < MAX_PINGS_PER_RUN);
});

test('a 403 stops the batch too - one refusal, not fifteen', async () => {
  const { pingGoogleIndexing } = await import(URL0);
  let publishes = 0;
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com')) return json({ access_token: 't', expires_in: 3600 });
    publishes++;
    return json({ error: { message: 'Property not shared with this account' } }, 403);
  };
  const res = await pingGoogleIndexing(jobs(50), {
    env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA },
    fetchImpl
  });
  assert.equal(publishes, 1);
  assert.ok(res.errors[0].includes('403'));
  assert.equal(res.submitted, 0);
});

test('a network failure is data, never a thrown error', async () => {
  const { pingGoogleIndexing } = await import(URL0);
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com')) return json({ access_token: 't', expires_in: 3600 });
    throw new Error('network down');
  };
  const res = await pingGoogleIndexing(jobs(3), {
    env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA },
    fetchImpl
  });
  assert.equal(res.submitted, 0);
  assert.ok(res.errors[0].includes('network down'));
});

test('a failed token exchange is reported rather than thrown', async () => {
  const { pingGoogleIndexing } = await import(URL0);
  const fetchImpl = async () => json({ error: 'invalid_grant' }, 401);
  const res = await pingGoogleIndexing(jobs(3), {
    env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA },
    fetchImpl
  });
  assert.equal(res.submitted, 0);
  assert.match(res.error, /token/);
});

test('duplicate ids and url-less rows collapse to one ping each', async () => {
  const { pingGoogleIndexing, GOOGLE_INDEXING_ENDPOINT } = await import(URL0);
  const sent = [];
  const fetchImpl = async (url, opts) => {
    if (url.includes('oauth2.googleapis.com')) return json({ access_token: 't', expires_in: 3600 });
    sent.push(JSON.parse(opts.body).url);
    return json({});
  };
  const rows = [jobs(1)[0], jobs(1)[0], { title: 'no id' }, null, undefined, jobs(1)[0]];
  const res = await pingGoogleIndexing(rows, {
    env: { GOOGLE_INDEXING_SERVICE_ACCOUNT: SA },
    fetchImpl
  });
  assert.equal(res.submitted, 1, 'the same job is never pinged twice in a run');
  assert.equal(sent.length, 1);
});
