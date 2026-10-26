// What a crawler reads off the raw HTML must be true, and it must be tidy.
//
// Two defects lived here. index.html hardcoded "500+ job listings" while the
// board holds thousands, so every crawler and link preview understated the site.
// And ~20 feed rows carry UTF-8 bytes decoded as latin-1, so Google was indexing
// titles like "ETL Developer â Hadoop". Both are fixed in the code that serves
// them; both are pinned here so a refactor cannot quietly bring them back.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const FEED_URL = pathToFileURL(path.join(ROOT, 'functions', 'lib', 'jobs-feed.js')).href;
const HOME_URL = pathToFileURL(path.join(ROOT, 'functions', 'index.js')).href;
const JOBS_URL = pathToFileURL(path.join(ROOT, 'functions', 'jobs.js')).href;

const indexHtml = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---------------------------------------------------------------------------
// Mojibake
// ---------------------------------------------------------------------------

// Built from codepoints rather than pasted literals. The feed carries UTF-8
// bytes that were decoded as latin-1: an en dash is E2 80 93 and a lightning
// bolt is E2 9A A1, so each becomes three latin-1 characters. Pasting those
// characters into a source file tends to re-encode them and quietly turn the
// fixture into clean text, which would make every assertion below vacuous.
const L1 = (bytes) => String.fromCharCode(...bytes);
const EN_DASH_MOJI = `ETL Developer ${L1([0xe2, 0x80, 0x93])} Hadoop & PySpark`;
const BOLT_MOJI = `Lightning job by Cutshort ${L1([0xe2, 0x9a, 0xa1])}`;
// Shape 2: a lead byte whose continuation bytes were dropped. U+00C2 is the
// first byte of a two-byte UTF-8 character; alone it renders as "Â".
const LONE_LEAD_MOJI = `IFS Cloud Consultant${L1([0xc2])} -Remote`;
const EN_DASH_CLEAN = 'ETL Developer – Hadoop & PySpark';
const BOLT_CLEAN = 'Lightning job by Cutshort ⚡';

test('the mojibake fixtures really are mojibake', () => {
  // Guards the guards: if a tool re-encodes these strings the assertions below
  // would pass or fail for the wrong reason.
  assert.equal(EN_DASH_MOJI.length, 34, 'three latin-1 chars stand in for one en dash');
  assert.equal(EN_DASH_MOJI.charCodeAt(14), 0xe2, 'the first mojibake byte is at index 14');
  assert.equal(EN_DASH_CLEAN.length, 32, 'the repaired title is two characters shorter');
  assert.notEqual(EN_DASH_MOJI, EN_DASH_CLEAN);
  assert.equal(BOLT_CLEAN, 'Lightning job by Cutshort ⚡');
  // The lone lead byte is a bare U+00C2 with no continuation - not a real "Â",
  // which would be the two codepoints U+00C3 U+0082.
  assert.equal(LONE_LEAD_MOJI.charCodeAt(20), 0xc2);
  assert.equal(LONE_LEAD_MOJI.length, 29);
});

test('fixMojibake repairs a latin-1-decoded UTF-8 sequence', async () => {
  const { fixMojibake } = await import(FEED_URL);
  assert.equal(fixMojibake(EN_DASH_MOJI), EN_DASH_CLEAN);
  assert.equal(fixMojibake(BOLT_MOJI), BOLT_CLEAN);
});

test('fixMojibake leaves clean text alone', async () => {
  const { fixMojibake } = await import(FEED_URL);
  const cases = [
    'Senior React Engineer',
    '',
    'Node.js Developer (Bengaluru)',
    'Café Manager',            // a real accented char, not mojibake
    'Ñandú Analytics Lead',    // real non-ASCII, outside byte range
    null,
    undefined
  ];
  for (const c of cases) assert.equal(fixMojibake(c), c == null ? '' : c);
});

test('fixMojibake refuses to corrupt a string it cannot decode', async () => {
  const { fixMojibake } = await import(FEED_URL);
  // A bare U+00C2 is a lead byte whose continuation was lost. It is invalid
  // UTF-8, so the round trip throws. It is left alone on purpose: a real "Â"
  // in a correctly decoded string IS U+00C2, so stripping the codepoint would
  // repair this one row while corrupting every genuine accented character.
  assert.equal(fixMojibake(LONE_LEAD_MOJI), LONE_LEAD_MOJI);
  // Clean text with real accents is untouched.
  const clean = 'Café Ñandú role Â team';
  assert.equal(fixMojibake(clean), clean);
});

test('cleanJobRow repairs the readable fields and nothing else', async () => {
  const { cleanJobRow } = await import(FEED_URL);
  // Every mojibake literal is built the same way as EN_DASH_MOJI above.
  const moji = (bytes, around = '') => around.replace('X', L1(bytes));
  const row = {
    title: EN_DASH_MOJI,
    company: moji([0xe2, 0x80, 0x93], 'Acme X Inc'),
    location: 'Bangalore',
    salary: moji([0xe2, 0x80, 0x93], 'X12 LPA'),
    description: moji([0xe2, 0x80, 0x93], 'Build pipelines X carefully'),
    id: 'abc-123',
    status: 'published',
    apply_url: 'https://example.com/apply?x=' + L1([0xe2, 0x80, 0x93])
  };
  cleanJobRow(row);
  assert.equal(row.title, EN_DASH_CLEAN);
  assert.equal(row.company, 'Acme – Inc');
  assert.equal(row.salary, '–12 LPA');
  assert.equal(row.description, 'Build pipelines – carefully');
  assert.equal(row.location, 'Bangalore');
  assert.equal(row.id, 'abc-123');
  assert.equal(row.status, 'published');
  assert.equal(
    row.apply_url,
    'https://example.com/apply?x=' + L1([0xe2, 0x80, 0x93]),
    'a URL is not prose; leave it'
  );
});

test('cleanJobRows is safe on non-arrays and empty input', async () => {
  const { cleanJobRows } = await import(FEED_URL);
  assert.deepEqual(cleanJobRows([]), []);
  assert.deepEqual(cleanJobRows(null), null);
  assert.deepEqual(cleanJobRows(undefined), undefined);
});

test('repairing a title does not change its slug, so no indexed URL breaks', async () => {
  const { fixMojibake, jobSlug } = await import(FEED_URL);
  const raw = EN_DASH_MOJI;
  const clean = fixMojibake(raw);
  assert.notEqual(raw, clean, 'the fixture must actually be mojibake');
  // jobSlug strips every non-alphanumeric char, and both the mojibake sequence
  // and the repaired en dash collapse to the same "-".
  assert.equal(
    jobSlug({ title: raw, company: 'Acme', location: 'Bangalore' }),
    jobSlug({ title: clean, company: 'Acme', location: 'Bangalore' })
  );
});

// ---------------------------------------------------------------------------
// The live count on the homepage
// ---------------------------------------------------------------------------

test('index.html still carries the placeholder the function replaces', () => {
  // If this fails the copy changed; update countPlaceholder in
  // functions/lib/job-count.js and the assertions below rather than deleting the
  // test.
  const matches = indexHtml().match(/500\+/g) || [];
  assert.ok(matches.length > 0, 'index.html should still contain the 500+ placeholder');
});

test('injectJobCount writes the real, India-formatted count into the page', async () => {
  const { injectJobCount } = await import(HOME_URL);
  const html = '<div class="lp-foot-big"><span>500+</span> job listings</div><p>500+ more</p>';
  const out = injectJobCount(html, 7679);
  assert.ok(!out.includes('500+'), 'no stale placeholder may survive');
  assert.ok(out.includes('<span>7,679</span>'), 'uses en-IN grouping: ' + out);
  assert.ok(out.includes('7,679 more'));
});

test('injectJobCount leaves the page untouched when the count is unknown', async () => {
  const { injectJobCount } = await import(HOME_URL);
  const html = '<span>500+</span> job listings';
  for (const bad of [null, undefined, 0, -1, NaN, '7679']) {
    assert.equal(injectJobCount(html, bad), html, 'must not invent a number for ' + String(bad));
  }
});

test('injectJobCount is a no-op when the placeholder is gone', async () => {
  const { injectJobCount } = await import(HOME_URL);
  const html = '<span>7,679</span> job listings';
  assert.equal(injectJobCount(html, 9999), html);
});

test('injectJobCount survives repeated calls (the /g lastIndex trap)', async () => {
  const { injectJobCount } = await import(HOME_URL);
  const html = 'a 500+ b 500+ c';
  assert.equal(injectJobCount(html, 7679), 'a 7,679 b 7,679 c');
  assert.equal(injectJobCount(html, 7679), 'a 7,679 b 7,679 c');
  assert.equal(injectJobCount(html, 7679), 'a 7,679 b 7,679 c');
});

// ---------------------------------------------------------------------------
// The route itself
// ---------------------------------------------------------------------------

/** A handler context with a stub ASSETS binding serving a fixed index.html. */
function ctxWith(html, count) {
  const calls = { countReads: 0 };
  return {
    calls,
    request: new Request('https://swapiki.com/'),
    waitUntil: () => {},
    env: {
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      ASSETS: {
        async fetch() {
          return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
      }
    },
    count
  };
}

async function runRoute(html, count) {
  const home = await import(HOME_URL);
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    // fetchPublishedJobCount reads Content-Range from PostgREST, not a body.
    if (String(input).includes('/rest/v1/jobs')) {
      return new Response(null, {
        status: 206,
        headers: { 'Content-Range': count == null ? 'x' : `0-0/${count}` }
      });
    }
    return new Response('[]', { status: 200 });
  };
  try {
    return await home.onRequestGet(ctxWith(html, count));
  } finally {
    globalThis.fetch = real;
  }
}

test('the homepage route serves the shell with the live count injected', async () => {
  const res = await runRoute('<html><body><span>500+</span> job listings</body></html>', 7679);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes('7,679'), 'serves the real count: ' + body);
  assert.ok(!body.includes('500+'), 'never ships the stale figure');
});

test('the homepage route still serves the page when the count read fails', async () => {
  const res = await runRoute('<html><body><span>500+</span> job listings</body></html>', null);
  assert.equal(res.status, 200, 'a missing number must not take the homepage down');
  const body = await res.text();
  assert.ok(body.includes('500+'), 'degrades to the placeholder rather than a wrong total');
});

test('the homepage route 503s rather than 200s when the shell cannot be read', async () => {
  const home = await import(HOME_URL);
  const res = await home.onRequestGet({
    request: new Request('https://swapiki.com/'),
    waitUntil: () => {},
    env: {} // no ASSETS binding
  });
  assert.equal(res.status, 503);
});

// ---------------------------------------------------------------------------
// The same placeholder on the /jobs route
// ---------------------------------------------------------------------------

// /jobs serves the same index.html shell, so it inherited the same stale "500+"
// copy. It already reads the exact published total with the board request, so it
// rewrites the literal too - these pin that it does, and that it never trades the
// stale figure for a fabricated one.

test('the /jobs shell rewrites the placeholder with the board total', async () => {
  const { injectJobsShell } = await import(JOBS_URL);
  const out = injectJobsShell(indexHtml(), [], 7679);
  assert.equal((out.match(/500\+/g) || []).length, 0, 'no stale placeholder may survive on /jobs');
  assert.ok(out.includes('7,679'), 'carries the real total');
  // The board-specific head must still be correct after the count rewrite.
  assert.ok(out.includes('<link rel="canonical" href="https://swapiki.com/jobs" />'));
  assert.ok(out.includes('<title>Swapiki Jobs'), 'keeps the board title');
});

test('the /jobs shell leaves the placeholder when the total is unknown', async () => {
  const { injectJobsShell } = await import(JOBS_URL);
  for (const bad of [null, undefined, NaN, 0]) {
    const out = injectJobsShell(indexHtml(), [], bad);
    assert.ok(out.includes('500+'), 'degrades to the placeholder for ' + String(bad));
  }
});

test('both routes rewrite the placeholder through the same helper', async () => {
  const home = await import(HOME_URL);
  const lib = await import(pathToFileURL(path.join(ROOT, 'functions', 'lib', 'job-count.js')).href);
  assert.equal(home.injectJobCount, lib.injectJobCount, 'one implementation, not two copies');
});

// ---------------------------------------------------------------------------
// The served homepage, end to end, is what crawlers index
// ---------------------------------------------------------------------------

test('serving the real index.html injects the count in every stale spot', async () => {
  const res = await runRoute(indexHtml(), 7679);
  const body = await res.text();
  const stale = body.match(/500\+/g) || [];
  assert.equal(stale.length, 0, 'the served page must carry no 500+ at all');
  // All three call sites get the number.
  assert.ok(body.includes('7,679+ job listings') || body.includes('7,679 job listings'));
});

test('the served homepage keeps the SPA boot markup intact', async () => {
  const res = await runRoute(indexHtml(), 7679);
  const body = await res.text();
  // The count rewrite must not disturb the mount points the app boots from.
  for (const marker of ['id="jobs-container"', 'id="lp-live-jobs"', 'id="main-content"']) {
    assert.ok(body.includes(marker), 'missing boot marker: ' + marker);
  }
  assert.equal(
    (body.match(/<script/g) || []).length,
    (indexHtml().match(/<script/g) || []).length,
    'no script tag may be added or removed'
  );
});
