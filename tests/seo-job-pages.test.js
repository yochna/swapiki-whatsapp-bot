// Per-job pages and the generated sitemap.
//
// The reason any of this exists: every published job shared the single /jobs
// URL, and the board is behind an 80% sign-in gate that replaces
// #jobs-container when the SPA boots. So a crawler following the board saw a
// sign-in wall, and one URL had to rank for every job query at once. These tests
// hold in place the three things that fix it - a URL per job, real HTML text on
// that URL, and a sitemap that lists them.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const urlOf = (p) => pathToFileURL(p).href;

const load = (rel) => import(urlOf(path.join(ROOT, 'functions', rel)));
const feed = () => load('lib/jobs-feed.js');

const UUID = '11111111-2222-3333-4444-555555555555';

function makeJob(i, over = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Software Engineer ${i}`,
    company: `Acme ${i}`,
    location: 'Bengaluru',
    category: 'it',
    salary: '₹12,00,000 - ₹18,00,000',
    description: 'Build things that matter. You will own features end to end.',
    first_seen_at: '2026-09-28T10:00:00Z',
    apply_url: `https://www.adzuna.in/details/${1000 + i}`,
    ...over
  };
}

/** Runs a Pages Function against a stubbed Supabase and returns its response. */
async function run(rel, { jobs = [], slug, noKey = false, rowsById } = {}) {
  const mod = await load(rel);
  const real = globalThis.fetch;
  // PostgREST returns ONLY the columns named in select=, and rejects the whole
  // request if any one of them is missing. A stub that returned the whole row
  // regardless would make every column-narrowing path look like it worked, which
  // is how a job page can quietly lose its salary bounds and nothing notices.
  const project = (row, url) => {
    if (!row) return null;
    const sel = (url.match(/[?&]select=([^&]*)/) || [])[1];
    if (!sel) return row;
    const cols = sel.split(',').map((c) => c.trim()).filter(Boolean);
    const out = {};
    for (const c of cols) if (c in row) out[c] = row[c];
    return out;
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (/employment_type/.test(url)) {
      return new Response(JSON.stringify({ code: '42703', message: 'column does not exist' }), { status: 400 });
    }
    // A single-row lookup (the per-job page) answers from the id it asked for.
    const wanted = (url.match(/[?&]id=eq\.([^&]+)/) || [])[1];
    if (wanted) {
      const row = rowsById
        ? rowsById[decodeURIComponent(wanted)]
        : jobs.find((j) => j.id === decodeURIComponent(wanted));
      const projected = project(row, url);
      return new Response(JSON.stringify(projected ? [projected] : []), { status: 200 });
    }
    const limit = Number((url.match(/[?&]limit=(\d+)/) || [])[1] || jobs.length);
    const offset = Number((url.match(/[?&]offset=(\d+)/) || [])[1] || 0);
    return new Response(
      JSON.stringify(jobs.slice(offset, offset + limit).map((j) => project(j, url))),
      { status: 200 }
    );
  };
  const env = { SUPABASE_URL: 'https://fake.supabase.co' };
  if (!noKey) env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  try {
    const res = await mod.onRequestGet({
      env,
      request: new Request('https://swapiki.com/jobs/x'),
      params: { slug }
    });
    return { res, html: await res.text() };
  } finally {
    globalThis.fetch = real;
  }
}

/** The JSON-LD graph the per-job page emits. */
function ldOf(html) {
  const m = html.match(/<script type="application\/ld\+json" id="job-jsonld">([\s\S]*?)<\/script>/);
  assert.ok(m, 'the job page carries no structured data');
  return JSON.parse(m[1]);
}

// ---------------------------------------------------------------- slugs

test('a job slug carries readable words and the row id', async () => {
  const { jobSlug } = await feed();
  const slug = jobSlug(makeJob(7));
  assert.match(slug, /^software-engineer-7-acme-7-bengaluru--/);
  assert.ok(slug.endsWith(makeJob(7).id), 'the slug must end in the uuid');
});

test('the id is recovered from a slug however the words are worded', async () => {
  const { idFromSlug, jobSlug } = await feed();
  const j = makeJob(3);
  assert.equal(idFromSlug(jobSlug(j)), j.id);
  // A listing gets renamed in the feed; the old address has to keep resolving.
  assert.equal(idFromSlug(`some-entirely-old-title--${j.id}`), j.id);
  assert.equal(idFromSlug(j.id), j.id);
});

test('a path with no uuid in it is not a job', async () => {
  const { idFromSlug } = await feed();
  assert.equal(idFromSlug('software-engineer'), '');
  assert.equal(idFromSlug(''), '');
  assert.equal(idFromSlug('--not-a-uuid'), '');
  assert.equal(idFromSlug('../../etc/passwd'), '');
});

test('a job with no usable words still gets a URL from its id', async () => {
  const { jobSlug } = await feed();
  assert.equal(jobSlug({ id: UUID, title: '', company: '' }), UUID);
});

// ---------------------------------------------------------- the job page

test('a job page is a real document with its own title, description and canonical', async () => {
  const jobs = [makeJob(1), makeJob(2)];
  const { html, res } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });

  assert.equal(res.status, 200);
  assert.match(html, /<title>Software Engineer 1 at Acme 1, Bengaluru \| Swapiki Jobs<\/title>/);
  assert.match(html, /<h1[^>]*>Software Engineer 1<\/h1>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/swapiki\.com\/jobs\/software-engineer-1-acme-1-bengaluru--/);
  // index, follow: this page is the whole point of the exercise.
  assert.match(html, /<meta name="robots" content="index, follow/);
  // And it describes itself with the facts the feed stated.
  assert.match(html, /<meta name="description" content="[^"]*Acme 1[^"]*Bengaluru/);
});

test('the job page renders its description as text, with no dependency on the SPA', async () => {
  const jobs = [makeJob(1)];
  const { html } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });

  assert.match(html, /Build things that matter\. You will own features end to end\./);
  // Nothing here is injected by app.js, which is the whole reason this page exists.
  assert.ok(!/jobs-container/.test(html), 'the job page must not rely on the gated board container');
  assert.match(html, /BreadcrumbList/);
});

test('the job page states the job and where it sits, as one structured graph', async () => {
  const jobs = [makeJob(1)];
  const { html } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });
  const graph = ldOf(html)['@graph'];

  const posting = graph.find((n) => n['@type'] === 'JobPosting');
  assert.equal(posting.title, 'Software Engineer 1');
  assert.equal(posting.hiringOrganization.name, 'Acme 1');
  assert.equal(posting.datePosted, '2026-09-28');
  assert.equal(posting.jobLocation.address.addressLocality, 'Bengaluru');

  const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList');
  assert.equal(crumbs.itemListElement.length, 3);
  assert.equal(crumbs.itemListElement[1].item, 'https://swapiki.com/jobs');
});

test('a job page links to its neighbours, which is how a crawler walks the set', async () => {
  const jobs = [makeJob(1), makeJob(2), makeJob(3)];
  const { html } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });

  assert.match(html, /href="\/jobs\/software-engineer-2-acme-2-bengaluru--/);
  assert.match(html, /href="\/jobs\/software-engineer-3-acme-3-bengaluru--/);

  // The neighbour list must not recommend the job you are already reading. Scoped
  // to the list, because the page's own URL legitimately appears elsewhere - as
  // the canonical, and inside the breadcrumb trail.
  const list = (html.match(/<h2[^>]*>Other open roles<\/h2>[\s\S]*?<\/section>/) || [''])[0];
  assert.ok(list, 'no neighbour section was rendered');
  assert.ok(
    !list.includes(`software-engineer-1-acme-1-bengaluru--${jobs[0].id}`),
    'a job page lists itself as a related role'
  );
});

test('a job in a thin category still gets neighbours to hand the crawler', async () => {
  // One lone BFSI role among many IT roles. Without a cross-category top-up this
  // page would dead-end on zero related links, which is exactly the page most in
  // need of somewhere else to crawl to.
  const jobs = [
    makeJob(1),
    makeJob(2, { category: 'bfsi', title: 'Risk Analyst' }),
    makeJob(3),
    makeJob(4)
  ];
  const { html } = await run('jobs/[slug].js', { jobs, slug: jobs[1].id });

  const list = (html.match(/<h2[^>]*>Other open roles<\/h2>[\s\S]*?<\/section>/) || [''])[0];
  const links = (list.match(/href="\/jobs\/[^"]+"/g) || []).length;
  assert.ok(links >= 3, `expected the cross-category top-up, got ${links} links`);
});

test('a job with no description still renders, rather than printing an empty section', async () => {
  const jobs = [makeJob(1, { description: null })];
  const { html, res } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });

  assert.equal(res.status, 200);
  assert.match(html, /has not published a description/);
});

// ------------------------------------------------------ the failure paths

test('a URL with no uuid is a hard 404, not a soft one', async () => {
  const { res, html } = await run('jobs/[slug].js', { jobs: [makeJob(1)], slug: 'software-engineer' });

  assert.equal(res.status, 404);
  assert.match(html, /noindex, follow/);
});

test('a withdrawn or unknown job 404s instead of serving an empty page', async () => {
  const { res, html } = await run('jobs/[slug].js', { jobs: [], slug: UUID });

  assert.equal(res.status, 404);
  assert.match(html, /no longer listed/);
  assert.match(html, /noindex/);
});

test('without the service key a job page 404s rather than serving a content-free page', async () => {
  // The preview project has no service key, so the jobs table cannot be read at
  // all. Rendering the template with the job's facts missing would produce a
  // page that says nothing, one per job, for a crawler to waste its crawl budget
  // on. A 404 says "no such page here" and is the truthful answer.
  const jobs = [makeJob(1)];
  const { res, html } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id, noKey: true });

  assert.equal(res.status, 404);
  assert.match(html, /noindex/);
});

test('a job page still renders when employment_type is not in the schema', async () => {
  const jobs = [makeJob(1)];
  const { res, html } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });

  assert.equal(res.status, 200);
  assert.match(html, /Software Engineer 1/);
});

test('a stated salary reaches the job page, not just the board', async () => {
  // employment_type is absent from the production table. When it was listed in the
  // first column shape, every job-page request failed that query and fell back to a
  // shape with no salary bounds - so a role whose employer did publish a salary
  // showed no structured pay on its own page, while the board did. A lost field on
  // one surface and not the other is invisible until it is asserted here.
  const jobs = [makeJob(1, { salary_min: 1200000, salary_max: 1800000 })];
  const { html } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });

  const ld = JSON.parse(html.match(/id="job-jsonld">([\s\S]*?)<\/script>/)[1]);
  const posting = ld['@graph'].find((n) => n['@type'] === 'JobPosting');
  assert.ok(posting.baseSalary, 'the job page dropped a salary the feed stated');
  assert.equal(posting.baseSalary.currency, 'INR');
  assert.equal(posting.baseSalary.value.minValue, 1200000);
  assert.equal(posting.baseSalary.value.maxValue, 1800000);
});

// ------------------------------------------------------------- the hazards

test('a javascript: apply link from the feed cannot reach the job page', async () => {
  const jobs = [makeJob(1, { apply_url: 'javascript:alert(1)' })];
  const { html } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });

  assert.ok(!/href="javascript:/i.test(html), 'a script URL reached an href');
  assert.match(html, /No direct apply link/);
});

test('a title carrying </script> cannot break out of the structured data', async () => {
  const nasty = 'Engineer </script><script>alert(1)</script>';
  const jobs = [makeJob(1, { title: nasty })];
  const { html } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });

  // The escaped form is valid JSON that parses back to the original string.
  assert.equal(ldOf(html)['@graph'].find((n) => n['@type'] === 'JobPosting').title, nasty);
  // And no second, real script tag was smuggled into the document.
  assert.equal((html.match(/<script>/g) || []).length, 0);
});

test('markup in a description is rendered as text, not as tags', async () => {
  // A real tag is stripped rather than escaped - it is markup, not prose.
  const jobs = [makeJob(1, { description: '<img src=x onerror=alert(1)> great role' })];
  const { html } = await run('jobs/[slug].js', { jobs, slug: jobs[0].id });

  assert.ok(!/<img/i.test(html), 'feed markup became a live element');
  assert.match(html, /great role/);

  // Prose that merely LOOKS like markup is escaped, not dropped.
  const prose = [makeJob(2, { description: 'Needs 5 < 6 yrs & JavaScript <3' })];
  const { html: escHtml } = await run('jobs/[slug].js', { jobs: prose, slug: prose[0].id });
  assert.match(escHtml, /5 &lt; 6 yrs &amp; JavaScript/);
});

// -------------------------------------------------------------- the sitemap

test('the sitemap lists a URL for every published job', async () => {
  const jobs = [makeJob(1), makeJob(2), makeJob(3)];
  const { res, html } = await run('sitemap.xml.js', { jobs });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /xml/);
  assert.match(html, /<loc>https:\/\/swapiki\.com\/<\/loc>/);
  assert.match(html, /<loc>https:\/\/swapiki\.com\/jobs<\/loc>/);
  for (const j of jobs) {
    assert.match(html, new RegExp(`<loc>https://swapiki\\.com/jobs/[^<]*${j.id}</loc>`));
  }
  // Every job, plus the two static board URLs and the three content pages
  // (/for-recruiters, /how-it-works, /about) added alongside them.
  assert.equal((html.match(/<url>/g) || []).length, jobs.length + 5);
});

test('the sitemap carries the real arrival date, never today', async () => {
  const { html } = await run('sitemap.xml.js', { jobs: [makeJob(1, { first_seen_at: '2026-09-28T10:00:00Z' })] });

  assert.match(html, /<lastmod>2026-09-28<\/lastmod>/);
  // A job with no arrival date must not claim it changed today, on every crawl.
  const { html: undated } = await run('sitemap.xml.js', { jobs: [makeJob(1, { first_seen_at: null })] });
  assert.ok(!/<lastmod>/.test(undated), 'an undated job was given a lastmod');
});

test('the sitemap escapes a title that would otherwise break the XML', async () => {
  const jobs = [makeJob(1, { title: 'Dev <b>&amp;</b> "quoted"' })];
  const { html } = await run('sitemap.xml.js', { jobs });

  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#)/.test(html), 'a bare ampersand reached the XML');
  assert.ok(!/<b>/.test(html), 'markup reached the XML');
});

test('the sitemap is still valid when there is nothing published', async () => {
  const { res, html } = await run('sitemap.xml.js', { jobs: [] });

  assert.equal(res.status, 200);
  assert.match(html, /<urlset/);
  // Two static board URLs plus the three content pages, even with no jobs.
  assert.equal((html.match(/<url>/g) || []).length, 5);
});

test('the committed sitemap cannot come back and hide the generated one', () => {
  // A static sitemap.xml shadows the function on the same route, and the old one
  // listed two URLs - which would make every job page undiscoverable while
  // looking perfectly valid.
  const fs = require('node:fs');
  assert.ok(
    !fs.existsSync(path.join(ROOT, 'sitemap.xml')),
    'a static sitemap.xml exists and will shadow functions/sitemap.xml.js'
  );
  // robots.txt has to keep pointing at the route the function now serves.
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap:\s*https:\/\/swapiki\.com\/sitemap\.xml/);
});

test('the no-JS board links to the job pages, not only off-site', async () => {
  // The board is gated, so this static list is the only internal link into the
  // per-job set that does not depend on the gate being lifted.
  const mod = await load('jobs.js');
  const jobs = [makeJob(1), makeJob(2)];
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(jobs), { status: 200 });
  try {
    const res = await mod.onRequestGet({ env: { SUPABASE_SERVICE_ROLE_KEY: 'k' }, request: new Request('https://x/jobs') });
    const html = await res.text();
    assert.match(html, /href="\/jobs\/software-engineer-1-acme-1-bengaluru--/);
    assert.match(html, /href="https:\/\/www\.adzuna\.in\/details\/1001"/);
  } finally {
    globalThis.fetch = real;
  }
});
