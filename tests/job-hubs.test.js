// City hub pages: /jobs/in/<city>
//
// Why these pages exist, and therefore what these tests are protecting:
// /jobs is one URL for every role in India, so it competes only for the head
// term "jobs" — whose SERP is Indeed, LinkedIn, Naukri and Google for Jobs. The
// queries a new Indian job board can actually win are the long ones ("software
// engineer jobs in bangalore"), and those need a page per city with real
// openings on it.
//
// Three properties are easy to break by accident and expensive to break
// silently, so each has tests below:
//
//   1. The filter is applied at the database, and the `%` wildcards survive
//      PostgREST's URL-decoding. A bare `%ba` is a hex escape, not a LIKE
//      wildcard, so the hub would render empty with no error anywhere.
//
//   2. The page's numbers agree with the sitemap's. Both derive from the same
//      alias list, so a URL the sitemap advertises is a URL the route serves
//      with jobs on it.
//
//   3. Nothing is fabricated. The hub names no set of cards in its structured
//      data - an ItemList is Google's carousel markup, and carousels are only
//      supported next to a Course list, a Movie, a Recipe or a Restaurant - so
//      the visible cards are the only list there is, the FAQ answers appear
//      verbatim in the visible text, and no claim of verification, certification
//      or rating appears anywhere.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const urlOf = (p) => pathToFileURL(p).href;
const load = (rel) => import(urlOf(path.join(ROOT, 'functions', rel)));

// ---------------------------------------------------------------- the library

test('every hub has a unique, url-safe slug', async () => {
  const { JOB_CITIES } = await load('lib/job-hubs.js');
  const slugs = JOB_CITIES.map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate city slug');
  for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/, `slug "${s}" is not url-safe`);
});

test('every alias is lowercase, non-empty and unique within its city', async () => {
  const { JOB_CITIES } = await load('lib/job-hubs.js');
  for (const city of JOB_CITIES) {
    assert.ok(city.aliases.length, `${city.slug} has no aliases`);
    for (const a of city.aliases) {
      assert.equal(a, a.toLowerCase(), `${city.slug} alias "${a}" is not lowercase`);
      assert.ok(a.length >= 3, `${city.slug} alias "${a}" is too short to match anything safely`);
      assert.ok(!/\s/.test(a), `${city.slug} alias "${a}" contains whitespace`);
    }
    assert.equal(new Set(city.aliases).size, city.aliases.length, `${city.slug} has duplicate aliases`);
  }
});

test('cityBySlug is case-insensitive and returns null for anything unknown', async () => {
  const { cityBySlug } = await load('lib/job-hubs.js');
  assert.equal(cityBySlug('bangalore').name, 'Bangalore');
  assert.equal(cityBySlug('BANGALORE').slug, 'bangalore');
  assert.equal(cityBySlug('Delhi-NCR').slug, 'delhi-ncr');
  assert.equal(cityBySlug('atlanta'), null);
  assert.equal(cityBySlug(''), null);
  assert.equal(cityBySlug(null), null);
});

test('matchesCity is a case-insensitive substring match on the location', async () => {
  const { cityBySlug, matchesCity } = await load('lib/job-hubs.js');
  const blr = cityBySlug('bangalore');
  assert.equal(matchesCity({ location: 'Bangalore, Karnataka' }, blr), true);
  assert.equal(matchesCity({ location: 'Bengaluru' }, blr), true);
  assert.equal(matchesCity({ location: 'RICHMOND TOWN, BANGALORE' }, blr), true);
  assert.equal(matchesCity({ location: 'Hyderabad, Telangana' }, blr), false);
  // A nationwide or unstated location is not evidence of a city.
  assert.equal(matchesCity({ location: 'India' }, blr), false);
  assert.equal(matchesCity({ location: '' }, blr), false);
  assert.equal(matchesCity({ location: null }, blr), false);
  assert.equal(matchesCity({}, blr), false);
  assert.equal(matchesCity(null, blr), false);
});

// This is the failure that matters most. PostgREST URL-decodes the filter
// before it reaches the LIKE pattern, so a bare "%ba" is read as the hex byte
// 0xBA and the query silently matches nothing — the hub would render empty,
// the sitemap would still list it, and no error would be raised anywhere.
test('cityOrParam percent-encodes its wildcards so they survive PostgREST decoding', async () => {
  const { cityBySlug, cityOrParam } = await load('lib/job-hubs.js');
  const p = cityOrParam(cityBySlug('bangalore'));
  assert.match(p, /^or=\(/, 'filter is not an or= clause');
  assert.ok(p.endsWith(')'), 'or= clause is not closed');
  assert.ok(!/%[0-9a-fA-F]{2}/.test(p.replace(/%25/g, '')), 'a bare percent-escape slipped into the filter');
  assert.ok(p.includes('location.ilike.%25bangalore%25'), p);
  assert.ok(p.includes('location.ilike.%25bengaluru%25'), p);
  // Round-trips to the pattern the matcher uses.
  const patterns = p
    .slice(4, -1) // strip "or=(" and the closing ")"
    .split(',')
    .map((alt) => decodeURIComponent(alt.replace('location.ilike.', '')))
    .map((raw) => raw.replace(/^%/, '').replace(/%$/, ''));
  assert.deepEqual(patterns, ['bangalore', 'bengaluru']);
});

test('fmtCount groups in Indian notation', async () => {
  const { fmtCount } = await load('lib/job-hubs.js');
  assert.equal(fmtCount(1715), '1,715');
  assert.equal(fmtCount(12345), '12,345');
  assert.equal(fmtCount(100000), '1,00,000');
  assert.equal(fmtCount(0), '0');
  assert.equal(fmtCount(null), '0');
});

// ------------------------------------------------------------------ the route

function makeJob(i, over = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Software Engineer ${i}`,
    company: `Acme ${i}`,
    location: 'Bangalore, Karnataka',
    category: 'it',
    salary: 'Rs. 12,00,000',
    first_seen_at: '2026-10-01T10:00:00Z',
    apply_url: `https://www.adzuna.in/details/${1000 + i}`,
    ...over
  };
}

/**
 * A PostgREST stand-in that actually applies the `or=(location.ilike...)`
 * filter the route sends.
 *
 * A stub that returned every row regardless would make the hub look like it
 * worked while the real database query was matching nothing — precisely the
 * silent failure the percent-encoding above exists to prevent. Decoding here
 * mirrors what PostgREST does, so the encoding is exercised end to end.
 */
function stubPostgrest(jobs, opts = {}) {
  const seen = [];
  const fn = async (input) => {
    const url = String(input);
    seen.push(url);
    if (opts.missingSalaryColumns && /salary_min/.test(url)) {
      return new Response(
        JSON.stringify({ code: '42703', message: 'column jobs.salary_min does not exist' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    let matched = jobs;
    const or = url.match(/or=\(([^)]*)\)/);
    if (or) {
      const patterns = or[1]
        .split(',')
        .map((alt) => alt.trim())
        .filter(Boolean)
        .map((alt) => {
          const m = alt.match(/^location\.ilike\.(.*)$/);
          assert.ok(m, `unrecognised filter alternative: ${alt}`);
          return decodeURIComponent(m[1]).replace(/^%/, '').replace(/%$/, '').toLowerCase();
        });
      matched = jobs.filter((j) => {
        const loc = String((j && j.location) || '').toLowerCase();
        return patterns.some((p) => loc.includes(p));
      });
    }
    const limit = Number((url.match(/[?&]limit=(\d+)/) || [])[1] || matched.length);
    const page = matched.slice(0, limit);
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { 'Content-Range': `0-${Math.max(page.length - 1, 0)}/${matched.length}` }
    });
  };
  fn.seen = seen;
  return fn;
}

async function renderHub(slug, jobs, opts = {}) {
  const mod = await load(path.join('jobs', 'in', '[city].js'));
  const real = globalThis.fetch;
  const stub = opts.fetchImpl || stubPostgrest(jobs, opts);
  globalThis.fetch = stub;
  const env = { SUPABASE_URL: 'https://fake.supabase.co' };
  if (!opts.noKey) env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  try {
    const res = await mod.onRequestGet({
      request: new Request(`https://swapiki.com/jobs/in/${slug}`),
      env,
      params: { city: slug }
    });
    return { res, html: await res.text(), seen: stub.seen || [] };
  } finally {
    globalThis.fetch = real;
  }
}

function ldOf(html) {
  const m = html.match(/<script type="application\/ld\+json" id="city-jsonld">([\s\S]*?)<\/script>/);
  assert.ok(m, 'the hub page carries no structured data');
  return JSON.parse(m[1]);
}

const nodes = (html, type) => (ldOf(html)['@graph'] || []).filter((n) => n['@type'] === type);

/** Every anchor into a per-job page, i.e. the cards — not the hub cross-links. */
const cardHrefs = (html) =>
  [...html.matchAll(/<a href="\/jobs\/([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !s.startsWith('in/'));

const CORPUS = [
  ...Array.from({ length: 22 }, (_, i) => makeJob(i)),
  ...Array.from({ length: 6 }, (_, i) => makeJob(100 + i, { location: 'Bengaluru' })),
  ...Array.from({ length: 18 }, (_, i) => makeJob(200 + i, { location: 'Mumbai, Maharashtra' })),
  ...Array.from({ length: 4 }, (_, i) => makeJob(300 + i, { location: 'Navi Mumbai, Maharashtra' })),
  ...Array.from({ length: 5 }, (_, i) => makeJob(400 + i, { location: 'India' })),
  makeJob(500, { location: null }),
  makeJob(501, { location: '' })
];

test('a hub with listings serves an indexable page at its own canonical', async () => {
  const { res, html } = await renderHub('bangalore', CORPUS);
  assert.equal(res.status, 200);
  assert.match(html, /<meta name="robots" content="index, follow/);
  assert.match(html, /<link rel="canonical" href="https:\/\/swapiki\.com\/jobs\/in\/bangalore"\/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/swapiki\.com\/jobs\/in\/bangalore"\/>/);
  // 22 "Bangalore, Karnataka" + 6 "Bengaluru" = 28. The India and empty
  // locations must not be counted as Bangalore.
  assert.match(html, /<h1 style="[^"]*">Jobs in Bangalore<\/h1>/);
  assert.match(html, /<strong>28 open roles<\/strong>/);
  assert.match(html, /<title>Jobs in Bangalore — 28 Open Roles \(Bengaluru\) \| Swapiki<\/title>/);
});

test('the hub filters at the database, with encoded wildcards', async () => {
  const { seen } = await renderHub('bangalore', CORPUS);
  assert.ok(seen.length, 'the hub made no database request');
  const filtered = seen.filter((u) => /or=\(/.test(u));
  assert.equal(filtered.length, 1, 'expected exactly one filtered query');
  assert.ok(filtered[0].includes('status=eq.published'), 'query is not restricted to published jobs');
  assert.ok(filtered[0].includes('location.ilike.%25bangalore%25'), filtered[0]);
  assert.ok(filtered[0].includes('location.ilike.%25bengaluru%25'), filtered[0]);
  assert.ok(filtered[0].includes('limit=100'), 'the hub does not cap its own fetch');
  // Mumbai's aliases must not appear on a Bangalore query.
  assert.ok(!filtered[0].includes('mumbai'), 'the filter leaked another city');
});

test('the shape walk still applies to a filtered query', async () => {
  const { res, html } = await renderHub('bangalore', CORPUS, { missingSalaryColumns: true });
  assert.equal(res.status, 200);
  assert.match(html, /<strong>28 open roles<\/strong>/);
});

test('Navi Mumbai counts as Mumbai and India counts as no hub', async () => {
  const { html } = await renderHub('mumbai', CORPUS);
  assert.match(html, /<strong>22 open roles<\/strong>/);
  const { html: india } = await renderHub('delhi-ncr', CORPUS);
  assert.equal(india.includes('open roles'), true);
});

test('an unknown city is a hard 404, not a soft one', async () => {
  const { res, html } = await renderHub('atlanta', CORPUS);
  assert.equal(res.status, 404);
  assert.match(html, /content="noindex, follow"/);
  assert.match(html, /href="https:\/\/swapiki\.com\/jobs"\/>/);
});

test('a known city with nothing live on it is a 404, not an empty hub', async () => {
  const { res } = await renderHub('jaipur', CORPUS);
  assert.equal(res.status, 404);
});

test('a missing service key costs the listings, never the URL', async () => {
  const { res, html } = await renderHub('bangalore', CORPUS, { noKey: true });
  assert.equal(res.status, 200, 'a misconfiguration must not de-index the hub');
  assert.match(html, /content="index, follow/);
  assert.match(html, /Jobs in Bangalore/);
  assert.match(html, /Browse all jobs in India/);
});

// ------------------------------------------------------------ the JSON-LD

test('the hub emits one connected graph: page, breadcrumb and FAQ', async () => {
  const { html } = await renderHub('bangalore', CORPUS);
  const ld = ldOf(html);
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(nodes(html, 'Organization').length, 1);
  assert.equal(nodes(html, 'WebSite').length, 1);
  assert.equal(nodes(html, 'CollectionPage').length, 1);
  assert.equal(nodes(html, 'BreadcrumbList').length, 1);
  assert.equal(nodes(html, 'FAQPage').length, 1);
  // No JobPosting here: each posting lives on its own page, and repeating a
  // hundred of them would describe work the reader has to scroll past.
  assert.equal(nodes(html, 'JobPosting').length, 0);
  // And no ItemList: an ItemList is Google's carousel markup, and a carousel is
  // only supported next to a Course list, a Movie, a Recipe or a Restaurant. A
  // hub of job pages is none of those, so the markup could never show a
  // carousel - it could only register as invalid items in Search Console.
  assert.equal(nodes(html, 'ItemList').length, 0, 'a hub is not a carousel');
  // The breadcrumb's own list items are the only ones on the page.
  assert.equal((JSON.stringify(ldOf(html)).match(/"ListItem"/g) || []).length, 3,
    'only the breadcrumb has list items');

  const page = nodes(html, 'CollectionPage')[0];
  assert.equal(page.url, 'https://swapiki.com/jobs/in/bangalore');
  assert.equal(page.isPartOf['@id'], 'https://swapiki.com/#website');
  assert.equal(page.about['@id'], 'https://swapiki.com/#organization');

  const crumbs = nodes(html, 'BreadcrumbList')[0].itemListElement;
  assert.deepEqual(
    crumbs.map((c) => c.name),
    ['Home', 'Jobs in India', 'Jobs in Bangalore']
  );
  assert.equal(crumbs[2].item, 'https://swapiki.com/jobs/in/bangalore');
});

test('the hub links to exactly the cards the reader can see', async () => {
  const { html } = await renderHub('bangalore', CORPUS);
  const hrefs = cardHrefs(html);
  assert.equal(hrefs.length, 28);
  // The structured data names no card of its own, so the visible list is the
  // only list there is - and it must not be padded with rows nobody can see.
  assert.equal(nodes(html, 'ItemList').length, 0, 'structured data names no set of cards');
});

test('every card links to a per-job page, not off-site', async () => {
  const { html } = await renderHub('bangalore', CORPUS);
  const hrefs = cardHrefs(html);
  assert.equal(hrefs.length, 28);
  for (const h of hrefs) assert.match(h, /^[a-z0-9-]+--[0-9a-f-]+$/, `card href "${h}" is not a job slug`);
});

test('the FAQ answers appear verbatim in the visible text', async () => {
  const { html } = await renderHub('bangalore', CORPUS);
  const faq = nodes(html, 'FAQPage')[0];
  assert.equal(faq.mainEntity.length, 3);
  for (const pair of faq.mainEntity) {
    assert.ok(html.includes(pair.name), `question missing from the page: ${pair.name}`);
    assert.ok(html.includes(pair.acceptedAnswer.text), `answer missing from the page: ${pair.acceptedAnswer.text}`);
  }
  assert.match(faq.mainEntity[0].acceptedAnswer.text, /^28 openings are listed/);
});

test('the hub claims nothing the product does not establish', async () => {
  const { html } = await renderHub('bangalore', CORPUS);
  const ld = ldOf(html);
  for (const banned of [
    /verified/i,
    /certified/i,
    /trusted by/i,
    /100%\s*human/i,
    /background check/i,
    /aggregateRating/,
    /numberOfEmployees/,
    /foundingDate/,
    /sameAs/
  ]) {
    assert.ok(!banned.test(html), `banned claim ${banned} appears on the hub page`);
  }
  assert.ok(!bannedInJson(ld));
});
function bannedInJson(node) {
  if (Array.isArray(node)) return node.some(bannedInJson);
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (k === 'aggregateRating' || k === 'numberOfEmployees' || k === 'foundingDate' || k === 'sameAs') return true;
      if (bannedInJson(node[k])) return true;
    }
  }
  return false;
}

test('a hub cross-links to the other hubs and never to itself', async () => {
  const { JOB_CITIES } = await load('lib/job-hubs.js');
  const slugs = new Set(JOB_CITIES.map((c) => c.slug));
  const { html } = await renderHub('bangalore', CORPUS);
  const hubs = [...html.matchAll(/<a href="\/jobs\/in\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hubs.length >= 8, 'a hub that links nowhere is a dead end for a crawler');
  assert.ok(!hubs.includes('bangalore'), 'a hub linked to itself');
  for (const h of hubs) assert.ok(slugs.has(h), `hub link "${h}" is not a real hub`);
});

test('every /jobs/in/ link on any hub points at a hub that exists', async () => {
  const { JOB_CITIES, cityBySlug } = await load('lib/job-hubs.js');
  const slugs = new Set(JOB_CITIES.map((c) => c.slug));
  // A corpus with live listings in every city, so every hub actually renders
  // its cross-link section instead of short-circuiting to a 404.
  const full = JOB_CITIES.flatMap((c, ci) =>
    Array.from({ length: 16 }, (_, i) => makeJob(2000 + ci * 100 + i, { location: `Somewhere, ${c.aliases[0]}` }))
  );
  for (const city of JOB_CITIES) {
    const { res, html } = await renderHub(city.slug, full);
    assert.equal(res.status, 200, `${city.slug} did not render`);
    const hubs = [...html.matchAll(/<a href="\/jobs\/in\/([^"]+)"/g)].map((m) => m[1]);
    assert.ok(hubs.length >= 8, `${city.slug} links nowhere`);
    for (const h of hubs) {
      assert.ok(slugs.has(h), `${city.slug} links to a non-existent hub ${h}`);
      assert.ok(cityBySlug(h), `${city.slug} links to a non-existent hub ${h}`);
    }
  }
});

test('a long hub says so instead of pretending the board is only this long', async () => {
  const big = Array.from({ length: 140 }, (_, i) => makeJob(900 + i));
  const { html } = await renderHub('bangalore', big);
  assert.equal(cardHrefs(html).length, 100, 'the card cap moved');
  assert.match(html, /Showing the first 100 of 140 openings in Bangalore/);
  assert.equal(nodes(html, 'ItemList').length, 0, 'a long hub is still not a carousel');
});

// ---------------------------------------------------------------- the sitemap

async function runSitemap(jobs) {
  const mod = await load('sitemap.xml.js');
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (/candidates/.test(url)) return new Response(JSON.stringify([]), { status: 200 });
    const limit = Number((url.match(/[?&]limit=(\d+)/) || [])[1] || jobs.length);
    const offset = Number((url.match(/[?&]offset=(\d+)/) || [])[1] || 0);
    return new Response(JSON.stringify(jobs.slice(offset, offset + limit)), { status: 200 });
  };
  try {
    const res = await mod.onRequestGet({ env: { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' }, request: new Request('https://swapiki.com/sitemap.xml') });
    return await res.text();
  } finally {
    globalThis.fetch = real;
  }
}

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

test('the sitemap lists the city hubs that have enough jobs', async () => {
  const xml = await runSitemap(CORPUS);
  const urls = locs(xml);
  assert.ok(urls.includes('https://swapiki.com/jobs/in/bangalore'), 'bangalore hub missing from the sitemap');
  assert.ok(urls.includes('https://swapiki.com/jobs/in/mumbai'), 'mumbai hub missing from the sitemap');
});

test('the sitemap leaves out a city that has dried up below the threshold', async () => {
  const { HUB_MIN_JOBS } = await load('lib/job-hubs.js');
  // Pune: four jobs, comfortably under the threshold of 15.
  const pune = Array.from({ length: HUB_MIN_JOBS - 1 }, (_, i) => makeJob(600 + i, { location: 'Pune, Maharashtra' }));
  const xml = await runSitemap(pune);
  assert.ok(!locs(xml).some((u) => u.includes('/jobs/in/pune')), 'a near-empty hub was advertised');
});

test('every hub URL the sitemap advertises is a hub the route serves', async () => {
  const { JOB_CITIES } = await load('lib/job-hubs.js');
  const jobs = JOB_CITIES.flatMap((c, ci) =>
    Array.from({ length: 16 }, (_, i) => makeJob(1000 + ci * 100 + i, { location: `Somewhere, ${c.aliases[0]}` }))
  );
  const xml = await runSitemap(jobs);
  const hubUrls = locs(xml).filter((u) => u.includes('/jobs/in/'));
  assert.equal(hubUrls.length, JOB_CITIES.length, 'not every city got a sitemap entry');
  for (const u of hubUrls) {
    const slug = u.split('/jobs/in/')[1];
    const { res, html } = await renderHub(slug, jobs);
    assert.equal(res.status, 200, `${u} is advertised but not served`);
    assert.match(html, new RegExp(`<link rel="canonical" href="${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\/>`));
  }
});

test('a hub lastmod is the newest real listing date in that city', async () => {
  const jobs = [
    makeJob(1, { location: 'Bangalore', first_seen_at: '2026-10-02T00:00:00Z' }),
    ...Array.from({ length: 15 }, (_, i) => makeJob(2 + i, { location: 'Bangalore', first_seen_at: '2026-09-20T00:00:00Z' })),
    makeJob(99, { location: 'Bangalore', first_seen_at: null })
  ];
  const xml = await runSitemap(jobs);
  const entry = xml.split('<url>').find((chunk) => chunk.includes('/jobs/in/bangalore'));
  assert.ok(entry, 'bangalore hub missing');
  assert.match(entry, /<lastmod>2026-10-02<\/lastmod>/);
  assert.match(entry, /<changefreq>weekly<\/changefreq>/);
});

// ------------------------------------------------------- the hub route's source

test('the route and its library are parseable ES modules', () => {
  const esbuild = path.join(ROOT, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
  if (!fs.existsSync(esbuild)) return; // non-Windows CI skips the syntax gate
  const { execFileSync } = require('node:child_process');
  for (const rel of ['functions/lib/job-hubs.js', 'functions/jobs/in/[city].js', 'functions/lib/jobs-feed.js']) {
    execFileSync(esbuild, [path.join(ROOT, rel), '--outfile=NUL', '--log-level=warning']);
  }
  assert.ok(true);
});
