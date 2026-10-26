const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const urlOf = (p) => pathToFileURL(p).href;

function makeJob(i, over = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Engineer ${i}`,
    company: `Company ${i}`,
    location: 'Bengaluru',
    category: 'it',
    salary: '₹12,00,000 - ₹18,00,000',
    first_seen_at: '2026-09-28T10:00:00Z',
    // The feed's redirect_url, which is what every imported card links to.
    apply_url: `https://www.adzuna.in/details/${1000 + i}`,
    ...over
  };
}

/** The real index.html, so tests assert against the shell that actually ships. */
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/**
 * Renders the real /jobs route against a stubbed Supabase.
 *
 * By default env.ASSETS serves the real index.html, i.e. the SPA boots and the
 * interactive board is what a visitor gets. Pass `noAssets: true` to simulate an
 * asset-binding failure and exercise the no-JS fallback.
 */
async function render(jobs, opts = {}) {
  const mod = await import(urlOf(path.join(ROOT, 'functions', 'jobs.js')));
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    seen.push(String(input));
    // Simulate the pre-migration schema: PostgREST rejects the whole request
    // (400, undefined_column) whenever the select names a missing column.
    if (opts.missingSalaryColumns && /salary_min/.test(String(input))) {
      return new Response(
        JSON.stringify({
          code: '42703',
          message: 'column jobs.salary_min does not exist'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // The pin is both selected and sorted on, so this is a 400 like any other
    // missing column. Checked before the offset, so a request that is wrong in
    // both ways is rejected for the column the test is about.
    if (opts.missingFeaturedColumn && /featured/.test(String(input))) {
      return new Response(
        JSON.stringify({
          code: '42703',
          message: 'column jobs.featured does not exist'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Honour limit/offset the way PostgREST does, so a test can prove the route
    // pages past its first page instead of trusting whatever it happens to get.
    const url = String(input);
    const limit = Number((url.match(/[?&]limit=(\d+)/) || [])[1] || jobs.length);
    const offset = Number((url.match(/[?&]offset=(\d+)/) || [])[1] || 0);
    const page = jobs.slice(offset, offset + limit);
    // PostgREST reports the size of the whole relation in Content-Range, which is
    // where the board reads the "first N of M" total from. Stubbed here so the
    // count path is exercised instead of the route quietly falling back to the
    // number of rows it happens to be holding.
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: {
        'Content-Range': `${offset}-${offset + Math.max(page.length - 1, 0)}/${jobs.length}`
      }
    });
  };
  const env = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  if (!opts.noAssets) {
    env.ASSETS = {
      fetch: async () =>
        opts.assetsFail
          ? new Response('nope', { status: 500 })
          : new Response(opts.indexHtml != null ? opts.indexHtml : INDEX_HTML, {
              status: 200,
              headers: { 'Content-Type': 'text/html' }
            })
    };
  }
  try {
    const res = await mod.onRequestGet({
      request: new Request('https://example.com/jobs'),
      env
    });
    return { html: await res.text(), seen, status: res.status };
  } finally {
    globalThis.fetch = real;
  }
}

/**
 * The JobPosting JSON-LD this route adds.
 *
 * Matches on id="jobs-jsonld" rather than the first ld+json block in the
 * document, because /jobs now serves index.html, which ships its own
 * organisation-level structured data. That block is the first one in the page
 * and it contains no JobPosting, so matching on tag alone would read the
 * homepage's data and every posting assertion here would silently pass against
 * the wrong thing — or fail for the wrong reason.
 */
function jsonOf(html) {
  const m =
    html.match(/<script type="application\/ld\+json" id="jobs-jsonld">([\s\S]*?)<\/script>/) ||
    html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'expected a JSON-LD block');
  return m[1];
}

function ldOf(html) {
  return JSON.parse(jsonOf(html));
}

/** Every JobPosting in the graph, in document order. */
function postingsOf(html) {
  const graph = ldOf(html)['@graph'];
  assert.ok(Array.isArray(graph), 'expected a schema graph');
  return graph.filter((n) => n['@type'] === 'JobPosting');
}

/** The one node of a given type, for asserting the shared entity graph. */
function nodeOf(html, type) {
  const graph = ldOf(html)['@graph'];
  const found = (graph || []).filter((n) => n['@type'] === type);
  assert.equal(found.length, 1, `expected exactly one ${type}`);
  return found[0];
}

/** The posting for one job, found by title, so order never matters. */
function postingOf(html, title) {
  const graph = ldOf(html)['@graph'];
  assert.ok(Array.isArray(graph), 'expected a JobPosting graph');
  const found = graph.find((p) => p.title === title);
  assert.ok(found, `no JobPosting for "${title}" among ${graph.length}`);
  return found;
}

/**
 * Renders a job's OWN page against a stubbed Supabase.
 *
 * The board route and the job route read the same table in different ways: the
 * board pages over it, the job page looks one row up by its id. So the stub
 * answers an id lookup with that row and anything else with nothing. The job
 * page is the leaf page, and it is the only page allowed to carry JobPosting
 * markup - Google's job posting content policy allows it on a page about a
 * single job and on no other page at all.
 */
async function renderJob(job) {
  const mod = await import(urlOf(path.join(ROOT, 'functions', 'jobs', '[slug].js')));
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const wanted = (url.match(/[?&]id=eq\.([^&]+)/) || [])[1];
    if (wanted) {
      const row = job.id === decodeURIComponent(wanted) ? job : null;
      return new Response(JSON.stringify(row ? [row] : []), {
        status: 200,
        headers: { 'Content-Range': `0-${row ? 0 : -1}/${row ? 1 : 0}` }
      });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const env = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  try {
    const res = await mod.onRequestGet({
      request: new Request(`https://example.com/jobs/${job.id}`),
      env,
      params: { slug: job.id }
    });
    return { html: await res.text(), status: res.status };
  } finally {
    globalThis.fetch = real;
  }
}

/** The JSON-LD graph the job's own page emits. */
function jobLdOf(html) {
  const m = html.match(/<script type="application\/ld\+json" id="job-jsonld">([\s\S]*?)<\/script>/);
  assert.ok(m, 'expected a JSON-LD block on the job page');
  return JSON.parse(m[1]);
}

/** The one JobPosting on a job's own page. */
function jobPostingOf(html) {
  const found = (jobLdOf(html)['@graph'] || []).filter((n) => n['@type'] === 'JobPosting');
  assert.equal(found.length, 1, `expected exactly one JobPosting, saw ${found.length}`);
  return found[0];
}

test('the board asks for one page of what it draws, and the exact total with it', async () => {
  // The route used to read the ENTIRE published board in order to draw two
  // hundred cards - on the live board that was thirteen sequential requests
  // before the page could render a single row, and seconds of time-to-first-byte.
  // It now asks for exactly the rows the page shows, and reads the real total out
  // of the same response, so the board can still say how many openings there are
  // without fetching them.
  const jobs = Array.from({ length: 501 }, (_, i) => makeJob(i + 1));
  const { html, seen } = await render(jobs);
  assert.equal(seen.length, 1, `expected a single page, made ${seen.length} requests`);
  assert.match(seen[0], /status=eq\.published/);
  const limit = Number(seen[0].match(/limit=(\d+)/)[1]);
  const cards = [...html.matchAll(/<a href="\/jobs\//g)].length;
  assert.equal(limit, cards, `asked for ${limit} rows but drew ${cards} cards`);
  assert.ok(limit >= 100, `limit ${limit} is an arbitrary small number, not a page of the board`);
});

test('the board states the true total rather than passing its first page off as the whole board', async () => {
  // The cap only stays honest if the page says so. A board that drew two hundred
  // cards out of five hundred and claimed nothing reads as a five-hundred-job
  // board that happens to be short - which is exactly the silent truncation the
  // count exists to prevent. The rows past the cap are not lost: each has its own
  // page, and functions/sitemap.xml.js lists them all.
  const jobs = Array.from({ length: 501 }, (_, i) => makeJob(i + 1));
  const { html } = await render(jobs);
  assert.match(html, /Showing the first 200 of 501 openings/);
  assert.ok(!/Engineer 501/.test(html), 'the board should not carry rows past its cap');
});

test('a second request for the same page is answered from the edge, not the database', async () => {
  // The header always claimed the response was cacheable, but HTML never landed
  // in Cloudflare's cache - every request rebuilt the board, which is why a page
  // this small had seconds of server time behind it.
  const jobs = Array.from({ length: 3 }, (_, i) => makeJob(i + 1));
  const store = new Map();
  const realCaches = globalThis.caches;
  const realFetch = globalThis.fetch;
  globalThis.caches = {
    default: {
      async match(key) {
        const entry = store.get(key);
        return entry ? new Response(entry.body, { status: 200 }) : undefined;
      },
      async put(key, res) {
        store.set(key, { body: await res.text() });
      }
    }
  };
  let queries = 0;
  globalThis.fetch = async () => {
    queries += 1;
    return new Response(JSON.stringify(jobs), {
      status: 200,
      headers: { 'Content-Range': `0-2/${jobs.length}` }
    });
  };
  try {
    const mod = await import(urlOf(path.join(ROOT, 'functions', 'jobs.js')));
    const env = {
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ASSETS: { fetch: async () => new Response(INDEX_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } }) }
    };
    const once = () =>
      mod.onRequestGet({ request: new Request('https://example.com/jobs'), env, waitUntil: () => {} });

    const first = await once();
    assert.equal(first.status, 200);
    await first.text();
    // The write is handed to waitUntil, i.e. it lands in the background exactly
    // as it does on Cloudflare, so give it a turn before looking for it.
    await new Promise((r) => setImmediate(r));
    const second = await once();
    assert.equal(second.status, 200);
    assert.match(await second.text(), /Engineer 1/, 'the cached copy was not a real page');

    assert.equal(store.size, 1, 'the first response was never handed to the edge');
    assert.equal(queries, 1, `the edge did not answer: ${queries} database queries ran`);
  } finally {
    globalThis.fetch = realFetch;
    if (realCaches === undefined) delete globalThis.caches;
    else globalThis.caches = realCaches;
  }
});

test('the board pages over a total order, so no row is served twice or skipped', async () => {
  // The cap was fixed, but paging introduced a quieter version of the same bug.
  // OFFSET pagination needs a total order to be correct, and created_at is not
  // one: a bulk insert stamps many rows with the same timestamp. With ties, the
  // database may return the same row on both page one and page two, and leave
  // another row off the board entirely - a duplicate card and a missing job in
  // the same response, with no error to notice. id breaks the tie, so the sort
  // is total and every row lands on exactly one page.
  const { seen } = await render([makeJob(1)]);
  const order = seen[0].match(/order=([^&]+)/)[1];
  assert.match(order, /id\.(asc|desc)\b/, `order=${order} has no unique tiebreaker, so OFFSET paging can skip or repeat rows`);
});

test('the board only selects columns the jobs table actually has', async () => {
  // PostgREST rejects an entire request for one unknown column, and this handler
  // reports a failed fetch as an empty board - so a made-up column name blanks
  // the public page with no error anywhere the user can see. The salary_min/max
  // columns were selected before the migration that creates them existed, which
  // is exactly how that happens. Derived from the SQL, not a hand-kept list.
  //
  // Every migration in supabase/ is read, not just the ingest one. A column added
  // by a later migration is a column the board is allowed to select, and a check
  // that only knew about one file would call it unknown - which reads as a bug in
  // the board and tempts someone into deleting a correct select.
  const dir = path.join(ROOT, 'supabase');
  const applied = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    // Only columns from executable statements count. These files also document
    // pending migrations in comments, and matching a commented-out column would
    // defeat the whole point of the check.
    .map((sql) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n');
  const created = new Set(
    [...applied.matchAll(/add column if not exists (\w+)/g)].map((m) => m[1])
  );
  // Columns the base schema is assumed to have; the migrations only add to these.
  for (const base of [
    'id', 'title', 'company', 'location', 'category', 'salary', 'status',
    'created_at', 'apply_url', 'first_seen_at', 'contact', 'source', 'skills',
    'raw_text', 'description'
  ]) {
    created.add(base);
  }

  const { seen } = await render([makeJob(1)]);
  const select = seen[0].match(/select=([^&]+)/)[1];
  const unknown = select.split(',').filter((c) => !created.has(c.trim()));
  assert.deepEqual(unknown, [], `select names columns no migration ever creates: ${unknown.join(', ')}`);
});

test('/jobs serves the real app, not a dead page of its own', async () => {
  // This is the bug that made the board unrecognisable. /jobs is a Pages
  // Function, so it used to render its own bare card list and the SPA never
  // booted - no search box, no Jobs/Internships chips, no Remote/Hybrid/Onsite
  // filters, no match-to-profile score, no draft resume, no GitHub ranking.
  // Serving index.html is what puts the whole board back.
  const { html } = await render([makeJob(1)]);
  assert.match(html, /id="view-jobs"/, 'the app shell is not being served');
  assert.match(html, /id="jobs-container"/, 'the board mount point is missing');
  // Proof the interactive board is reachable, not just an empty container.
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  for (const feature of ['setJobsQuery', 'setJobsType', 'setJobsMode', 'openResumeDraft', 'applyToJob']) {
    assert.match(app, new RegExp(feature), `the app no longer wires up ${feature}`);
  }
});

test('the page describes itself as the jobs board, not the homepage', async () => {
  // index.html is the site-wide shell, so its own title/description/canonical
  // all point at the homepage. Serving it unmodified at /jobs would tell every
  // crawler and chat preview that this URL is the marketing page.
  const { html } = await render([makeJob(1)]);
  assert.match(html, /<title>Swapiki Jobs — IT, BFSI &amp; Internships in India<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/swapiki\.com\/jobs"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/swapiki\.com\/jobs"/);
});

test('the job view is what a visitor lands on at /jobs', async () => {
  // The router has to map the /jobs PATH to the jobs view, because the app is
  // hash-routed and an unrecognised path with no hash falls through to the
  // landing page.
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  // The guard is now a named local rather than a bare `if`, because it has to
  // yield to an explicit hash. Match the two halves rather than their distance
  // apart, so renaming a variable cannot silently unprotect the route.
  assert.match(app, /path === '\/jobs'/, '/jobs no longer tests the path at all');
  assert.match(app, /pathWantsJobs && !hashNamesAView[\s\S]{0,40}navigate\('jobs'/,
    '/jobs no longer routes to the jobs view');
});

// ---------------------------------------------------------------------------
// Routing: one click has to be enough.
//
// The nav calls router.navigate('dashboard'), which sets location.hash AND
// switches the view; the hashchange that follows then re-enters handleHash().
// Both halves have to agree on the answer. When they disagree the symptom is
// very specific: the FIRST click appears to do nothing and the SECOND click
// works, because after the first click the hash is already correct, so
// assigning it again fires no hashchange and navigate() does the work alone.
// That is what a visitor on /jobs hit on their way to any other view.
// ---------------------------------------------------------------------------

/** Pull the shipped handleHash() body out of app.js and run it for real. */
function loadHandleHash() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const start = src.indexOf('handleHash() {');
  assert.ok(start > 0, 'handleHash() is gone from js/app.js');
  // Brace-match from the opening brace to find the true end of the method.
  let depth = 0;
  let i = src.indexOf('{', start);
  const bodyStart = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  const body = src.slice(bodyStart, i + 1);
  const factory = new Function(
    'window',
    'app',
    'swapikiStore',
    `return function handleHash() {${body}}`
  );
  return factory;
}

function route({ hostname = 'swapiki.com', pathname = '/', hash = '', currentView = 'landing', authed = true } = {}) {
  const make = loadHandleHash();
  const calls = [];
  const windowStub = {
    location: { hostname, pathname, hash: hash ? '#' + hash : '' },
    app: { isAuthenticated: () => authed },
  };
  const appStub = {
    publicUsername: undefined,
    _adminPreviewMode: false,
    isAuthenticated: () => authed,
    openLoginModal() {},
    showToast() {},
  };
  const router = {
    currentView,
    navigate(viewId, updateHistory = true) {
      calls.push(viewId);
      // Mirror the real navigate(): switching the view is what makes the
      // hashchange that follows a no-op.
      this.currentView = viewId;
      if (updateHistory) windowStub.location.hash = '#' + viewId;
    },
  };
  make(windowStub, appStub, { incrementViews() {} }).call(router);
  return calls;
}

test('a nav click from the /jobs path lands on the view that was clicked', () => {
  // The bug: /jobs won the route, so the first click bounced back to the jobs
  // board and only the second click reached the dashboard.
  for (const view of ['dashboard', 'candidate', 'admin', 'add-project']) {
    const calls = route({ pathname: '/jobs', hash: view, currentView: 'jobs' });
    assert.deepEqual(calls, [view], `${view} from /jobs did not route to ${view}`);
  }
});

test('the second click of the same nav item is a no-op, not a second render', () => {
  // navigate() sets the hash, then hashchange re-enters the router. Both must
  // resolve to the same view, and the second must not re-render.
  const calls = route({ pathname: '/jobs', hash: 'dashboard', currentView: 'dashboard' });
  assert.deepEqual(calls, [], 'already on the target view should not re-navigate');
});

test('/jobs still routes to the jobs board when nothing else is asked for', () => {
  // The crawler path the existing test protects: no hash, and a hash that
  // agrees. Both must still land on jobs, or the SEO route regresses.
  assert.deepEqual(route({ pathname: '/jobs', hash: '', currentView: 'landing' }), ['jobs']);
  assert.deepEqual(route({ pathname: '/jobs', hash: 'jobs', currentView: 'jobs' }), ['jobs']);
  assert.deepEqual(route({ pathname: '/jobs/', hash: '', currentView: 'landing' }), ['jobs']);
});

test('a deep link into the app from the landing still wins over the default', () => {
  assert.deepEqual(route({ pathname: '/', hash: 'admin', currentView: 'landing' }), ['admin']);
  assert.deepEqual(route({ pathname: '/', hash: 'candidate', currentView: 'landing' }), ['candidate']);
  // No hash at all: a signed-in candidate gets the dashboard, a guest the page.
  assert.deepEqual(route({ pathname: '/', hash: '', currentView: 'landing', authed: true }), ['dashboard']);
  assert.deepEqual(route({ pathname: '/', hash: '', currentView: 'landing', authed: false }), ['landing']);
});

test('the profile subroutes still outrank the /jobs path', () => {
  // These return early, above the path check. If someone ever reorders the
  // branches, a shared profile link opened from /jobs must not show the board.
  assert.deepEqual(route({ pathname: '/jobs', hash: 'sites/someone', currentView: 'jobs' }), ['candidate']);
  assert.deepEqual(route({ pathname: '/jobs', hash: 'profile/someone', currentView: 'jobs' }), ['candidate']);
  assert.deepEqual(route({ pathname: '/jobs', hash: 'admin-preview/someone', currentView: 'jobs' }), ['candidate']);
  assert.deepEqual(route({ pathname: '/jobs', hash: 'resume-draft/job-1', currentView: 'jobs' }), ['resume-draft']);
  assert.deepEqual(route({ pathname: '/jobs', hash: 'interview-prep/job-1', currentView: 'jobs' }), ['interview-prep']);
});

test('an asset failure degrades to a readable board, never a 500', async () => {
  // A crawler with no JS, or an asset binding that misbehaves, must still get
  // the listings. The fallback is the old grouped card list.
  for (const opts of [{ noAssets: true }, { assetsFail: true }]) {
    const { html, status } = await render([makeJob(1)], opts);
    assert.equal(status, 200);
    assert.match(html, /Engineer 1/, 'the fallback board lost the job');
    assert.match(html, /Apply &rarr;<\/a>/, 'the fallback card has no apply link');
  }
});

test('the served board carries visible listings and links, so a no-JS crawler sees a board', async () => {
  // index.html ships an empty #jobs-container and the SPA fills it at runtime,
  // so a crawler that runs no JS - or a renderer that truncates before the
  // bundle boots - used to see an empty board. The route now writes the listings
  // into the container too, with a real anchor into each per-job page, so the
  // served document is a populated board rather than a blank mount point.
  const { html } = await render([makeJob(1), makeJob(2, { category: 'bfsi' })]);
  assert.match(html, /id="jobs-container">\s*<h2/, 'the container is still empty in the served HTML');
  assert.match(html, /<a href="\/jobs\/engineer-1-company-1-bengaluru--[0-9a-f-]*"/, 'no link to job 1');
  assert.match(html, /<a href="\/jobs\/engineer-2-company-2-bengaluru--[0-9a-f-]*"/, 'no link to job 2');
  assert.match(html, /IT &amp; Engineering/, 'the visible board lost its categories');
  assert.ok(!/id="jobs-container"><\/div>/.test(html), 'an empty mount point was served');
});

test('a large board ships a visible list without duplicating every job into the markup', async () => {
  // Two full copies of several thousand cards - one in the DOM and one in the
  // JSON-LD - would balloon an already-large document, and a graph that describes
  // jobs a reader cannot see on the page is what earns a structured-data penalty.
  // The visible list is capped, and the markup names no job at all.
  const jobs = Array.from({ length: 250 }, (_, i) => makeJob(i + 1));
  const { html } = await render(jobs);
  const visible = [...html.matchAll(/<a href="\/jobs\//g)].length;
  assert.ok(visible > 0, 'the served board has no visible listings');
  assert.ok(visible <= 200, `the visible list should be capped, saw ${visible} links`);
  // A board is a list of jobs, and Google's job posting content policy says the
  // JobPosting markup "must only be used on pages that contain a single job
  // posting". So the board names the collection; each posting is described on
  // its own page, where the job's description actually is.
  assert.equal(postingsOf(html).length, 0, 'a list page must not carry JobPosting markup');
  // The board also carries no ItemList. An ItemList is Google's carousel markup,
  // and a carousel is only supported next to a Course list, a Movie, a Recipe or
  // a Restaurant - a list of job pages is none of those. What the markup bought
  // was a report instead: Search Console counted its 200 ListItems as items on
  // the page and flagged them ("200 items detected, some are invalid").
  assert.ok(
    !ldOf(html)['@graph'].some((n) => n['@type'] === 'ItemList'),
    'the board must not declare a carousel of job pages'
  );
  assert.ok(
    !ldOf(html)['@graph'].some((n) => n['@type'] === 'ListItem'),
    'no carousel ListItem may be counted as an item on the page'
  );
});

test('every card is clickable, because a board of dead ends is not a board', async () => {
  // The original complaint: 317 listings with nothing to click. In the app that
  // link is the Apply button, and it is only rendered when the job actually has
  // a URL — so the RPC has to hand apply_url through, or the button never appears.
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'jobs_board_migration.sql'), 'utf8');
  assert.match(sql, /'apply_url',\s*j\.apply_url/,
    'get_published_jobs() does not return apply_url, so no imported card can link out');
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(app, /job\.apply_url \|\| job\.contact/,
    'the app must read apply_url, not just contact');
});

test('a javascript: apply link from the feed cannot reach the board', async () => {
  // apply_url is the feed's redirect_url, so it is attacker-influenced data on a
  // public page. Both the server-rendered markup and the app must refuse it.
  const { html } = await render([makeJob(1, { apply_url: 'javascript:alert(1)' })], { noAssets: true });
  assert.ok(!/href="javascript:/i.test(html), 'a javascript: URL reached an href');
  assert.ok(!jsonOf(html).includes('javascript:'), 'the hostile value reached the JSON-LD');
  // The board's structured data names Swapiki's own pages, never the employer's
  // link, so there is nowhere for a feed-supplied URL to land even as a string.
  const graph = ldOf(html)['@graph'];
  for (const node of graph) {
    const urls = JSON.stringify(node).match(/https?:\/\/[^"\\ ]+/g) || [];
    for (const u of urls) {
      assert.ok(
        u.startsWith('https://swapiki.com/'),
        `the board's structured data must only name Swapiki's own pages, found ${u}`
      );
    }
  }
});

test('the board carries no JobPosting markup, because it is a list of jobs', async () => {
  // Google's job posting content policy, verbatim: "The JobPosting markup must
  // only be used on pages that contain a single job posting. We don't allow the
  // use of JobPosting markup in any other page, including pages that do not
  // list any job." A board lists jobs, so a board may not describe them as
  // postings - and a posting on a list URL also has no page of its own to be
  // indexed under.
  const { html } = await render([makeJob(1), makeJob(2)]);
  assert.equal(postingsOf(html).length, 0, 'the board must not describe postings');
  assert.ok(!/JobPosting/.test(jsonOf(html)), 'the string must not appear in the block either');
  // The page still says what it is, and it names no carousel: an ItemList is
  // Google's carousel markup, and carousels are only supported next to a Course
  // list, a Movie, a Recipe or a Restaurant - never next to a list of job pages.
  // The board's openings are described by the per-job pages it links to.
  assert.ok(
    !ldOf(html)['@graph'].some((n) => n['@type'] === 'ItemList' || n['@type'] === 'ListItem'),
    'the board must not declare a carousel of job pages'
  );
  assert.equal(nodeOf(html, 'CollectionPage')['@id'], 'https://swapiki.com/jobs#webpage');
  assert.equal(nodeOf(html, 'Organization')['@id'], 'https://swapiki.com/#organization');
});

test("a job's own page carries the one posting, and says it is not a direct application", async () => {
  // Google treats a JobPosting without `url` as incomplete, so `url` is set - but
  // to the page describing the role, not the employer's ATS page. Forwarding
  // `url` off-site would make every posting claim the same address as the redirect
  // it happens to land on.
  //
  // `directApply` means the applicant applies in the employer's own system. Every
  // listing here does, so the honest value is false. Asserting true would put a
  // false claim on every posting, which is what earns a structured-data penalty,
  // so this test exists to keep that from creeping back.
  const { html } = await renderJob(makeJob(7));
  const posting = jobPostingOf(html);
  assert.match(posting.url, /^https:\/\/swapiki\.com\/jobs\/engineer-7-company-7-bengaluru--/);
  assert.equal(posting.directApply, false);
});

test('the structured data is injected into the app shell, once', async () => {
  // The app reuses #jobs-jsonld rather than appending a second block, because
  // two conflicting graphs in one page is worse than one.
  const { html } = await render([makeJob(1)]);
  assert.equal((html.match(/application\/ld\+json/g) || []).length,
    (INDEX_HTML.match(/application\/ld\+json/g) || []).length + 1,
    'expected exactly one added JSON-LD block');
  assert.match(html, /id="jobs-jsonld"/, 'the block needs the id the app looks up');
  // A board inside the cap is covered end to end. The markup names no job at
  // all: the cap only bites when there is more than it holds, and the visible
  // list is what a reader (and a crawler) follows to the per-job pages.
  const { html: many } = await render(Array.from({ length: 40 }, (_, i) => makeJob(i)));
  const visible = [...many.matchAll(/<a href="\/jobs\//g)].length;
  assert.equal(visible, 40, 'the visible list still holds every row');
  assert.ok(
    !ldOf(many)['@graph'].some((n) => n['@type'] === 'ItemList'),
    'the board names no carousel, however many rows it shows'
  );
});

test('a job with no usable apply link still renders, just without a button', async () => {
  // The feed omits the redirect for some listings. Dropping the whole card would
  // hide a real vacancy because a link was missing.
  for (const bad of [null, '', 'not a url', 'javascript:alert(1)', 'data:text/html,<script>']) {
    const { html } = await render([makeJob(1, { apply_url: bad })], { noAssets: true });
    assert.match(html, /Engineer 1/, `a card disappeared for apply_url ${JSON.stringify(bad)}`);
    assert.ok(!/Apply &rarr;/.test(html), `a bad URL produced a button: ${JSON.stringify(bad)}`);
  }
});

test('the salary is never reshaped into numbers it does not have', async () => {
  // With no numeric bounds stored there is no honest baseSalary to emit, and a
  // string is not a valid QuantitativeValue. Reinstating the columns should
  // bring the numbers back, not a guess.
  const { html } = await renderJob(makeJob(1));
  const posting = jobPostingOf(html);
  assert.ok(!('baseSalary' in posting), 'no stored bounds means no invented salary markup');
  assert.ok(!/"baseSalary"/.test(JSON.stringify(posting)), 'the field must not appear at all');
});

test('stored salary bounds become a real MonetaryAmount, in INR per year', async () => {
  const { html } = await renderJob(
    makeJob(1, { salary_min: 1200000, salary_max: 1800000 })
  );
  const posting = jobPostingOf(html);
  assert.deepEqual(posting.baseSalary, {
    '@type': 'MonetaryAmount',
    currency: 'INR',
    value: { '@type': 'QuantitativeValue', unitText: 'YEAR', minValue: 1200000, maxValue: 1800000 }
  });
});

test('PostgREST returns numeric as a string, and the markup still gets numbers', async () => {
  // `numeric` is serialised as a JSON string to preserve precision, so the board
  // receives "1200000", not 1200000. Emitting the string would be valid-looking
  // but invalid structured data, so this is the exact shape to test.
  const { html } = await renderJob(
    makeJob(1, { salary_min: '1200000', salary_max: '1800000' })
  );
  const { value } = jobPostingOf(html).baseSalary;
  assert.strictEqual(value.minValue, 1200000, 'a numeric string must be coerced to a number');
  assert.strictEqual(value.maxValue, 1800000);
});

test('a stated one-sided salary is emitted, not completed by guessing', async () => {
  const a = await renderJob(makeJob(1, { salary_min: 900000, salary_max: null }));
  const b = await renderJob(makeJob(2, { salary_min: null, salary_max: 1500000 }));
  const first = jobPostingOf(a.html).baseSalary.value;
  const second = jobPostingOf(b.html).baseSalary.value;
  assert.ok(!('maxValue' in first), 'a missing upper bound must not be invented');
  assert.equal(first.minValue, 900000);
  assert.ok(!('minValue' in second));
  assert.equal(second.maxValue, 1500000);
});

test('a malformed salary bound is dropped rather than emitted', async () => {
  const { html } = await renderJob(
    makeJob(1, { salary_min: 'not-a-number', salary_max: 1800000 })
  );
  const value = jobPostingOf(html).baseSalary.value;
  assert.ok(!('minValue' in value), 'an unparseable bound must not become 0 or NaN');
  assert.equal(value.maxValue, 1800000);
});

test('the board still renders every job when the salary columns do not exist yet', async () => {
  // The actual outage: the select named salary_min/salary_max before the
  // migration existed, PostgREST 400'd the whole request, and the public page
  // went blank. The retry must drop only the salary columns, never the jobs.
  const jobs = [makeJob(1), makeJob(2)];
  const { html, seen } = await render(jobs, { missingSalaryColumns: true });
  // Three shapes, not two: with the pin, with the salary bounds alone, with
  // neither. The stub only knows about salary_min, so it rejects the first two.
  assert.equal(seen.length, 3, 'the failed select is retried without the salary columns');
  assert.match(seen[0], /salary_min/, 'the first attempt asks for the new columns');
  assert.ok(!/salary_min/.test(seen[2]), 'the shape that succeeds must not name the missing columns');
  // The jobs survive even though the columns did not. Asserted on the visible
  // list, because that is what a reader (and a crawler) follows to the per-job
  // pages - the board's structured data names no job at all.
  const visible = [...html.matchAll(/<a href="\/jobs\//g)].length;
  assert.equal(visible, 2, 'jobs survive the fallback');
  assert.ok(!/"baseSalary"/.test(jsonOf(html)), 'without the columns there is no salary markup');
});

test('the board still renders every job when the featured column does not exist yet', async () => {
  // The same outage, one column later. `featured` is selected and sorted on, so
  // on a database where the migration has not run this is a 400 like any other -
  // and the pin must degrade to plain arrival order rather than to a blank page.
  const jobs = [makeJob(1), makeJob(2)];
  const { html, seen } = await render(jobs, { missingFeaturedColumn: true });
  assert.ok(seen.length >= 2, 'the rejected select must be retried');
  assert.match(seen[0], /featured/, 'the first attempt asks for the pin');
  // Sorting by a column that does not exist fails the whole query, so the order
  // has to be dropped at the same moment as the column. Keeping featured.desc in
  // the retry would make every one of them fail.
  const serving = seen[seen.length - 1];
  assert.ok(!/featured/.test(serving), `the request that succeeds must not sort on featured: ${serving}`);
  assert.match(serving, /id\.asc/, 'the order still needs its unique tiebreaker');
  const visible = [...html.matchAll(/<a href="\/jobs\//g)].length;
  assert.equal(visible, 2, 'jobs survive the fallback');
});

test('the board leads with the featured rows, in the order the pin asks for', async () => {
  // The pin is the whole feature: the studio's own openings have to sit at the
  // top of the public board, not merely be sortable by pin.
  const jobs = [
    makeJob(1, { title: 'Ordinary one', featured: false }),
    makeJob(2, { title: 'Swaniki Frontend', featured: true }),
    makeJob(3, { title: 'Ordinary two', featured: false }),
    makeJob(4, { title: 'Swaniki Backend', featured: true })
  ];
  const { seen } = await render(jobs);
  const order = decodeURIComponent(seen[0].match(/order=([^&]+)/)[1]);
  assert.match(order, /^featured\.desc/, `order=${order} does not put the pin first`);
});

test('the pin is not a ranking signal - one boolean, and id breaks every tie', async () => {
  // Two traps. Ordering by something derived - clicks, salary, a score - makes
  // "pinned" mean "won a competition", and the studio's openings would slide
  // down the board as the feed ran. And a featured.desc with no unique
  // tiebreaker is the same OFFSET paging bug as before, now applied to the pin:
  // with ties the database may serve one pinned row twice and skip another.
  const { seen } = await render([makeJob(1)]);
  const order = decodeURIComponent(seen[0].match(/order=([^&]+)/)[1]);
  const parts = order.split(',');
  assert.equal(parts[0], 'featured.desc', 'the pin leads');
  assert.ok(
    !/click|score|popular|rating|salary/i.test(order),
    `the pin must be a fixed flag, not a ranking signal: ${order}`
  );
  assert.ok(parts.includes('id.asc'), `order=${order} has no unique tiebreaker`);
});

test('a page of the board does not re-discover the schema on every request', async () => {
  // The fallback walk used to be re-run per page, because the resolved shape was
  // never carried out of the fetch that resolved it - two wasted round trips per
  // page, sixty of them on a cold start of a twenty-page board. The board reads
  // one page now, so the entire cost of a missing column is the rejected shape
  // and the retry that replaces it, and nothing repeats.
  const jobs = Array.from({ length: 1001 }, (_, i) => makeJob(i + 1));
  const { seen } = await render(jobs, { missingFeaturedColumn: true });
  const offsets = seen.map((u) => Number((u.match(/offset=(\d+)/) || [])[1] || 0));
  // The first shape is rejected, the retry at the same offset is honoured.
  assert.deepEqual(offsets, [0, 0], `unexpected requests: ${JSON.stringify(offsets)}`);
  assert.equal(seen.length, 2, 'the schema must be discovered once, not once per page');
});

test('the pin is written by a migration, and the seed that uses it', async () => {
  // The board, the digest and the nudge all read one column. If the column is
  // created by hand in a dashboard and never written down, the next person to
  // rebuild the database has a board whose pin silently does nothing.
  const migration = fs.readFileSync(path.join(ROOT, 'supabase', 'swaniki_jobs_migration.sql'), 'utf8');
  const applied = migration.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(applied, /add column if not exists featured/i, 'featured is not created by the migration');
  assert.match(applied, /boolean/i, 'featured must be a boolean, not a nullable anything');
  // The public RPC is what the SPA actually reads, so the ordering has to be in
  // there too - a column that exists but is not sorted on pins nothing.
  assert.match(applied, /order by[\s\S]*featured desc/i, 'get_published_jobs does not order by the pin');
});

test('the SPA read path returns the pin, or the board cannot show it', async () => {
  // The served page boots the SPA, which reads through get_published_jobs(). A
  // projection that drops `featured` renders the board in the RPC's order - the
  // pin works in the SQL and nowhere a visitor can see it.
  const migration = fs.readFileSync(path.join(ROOT, 'supabase', 'swaniki_jobs_migration.sql'), 'utf8');
  const applied = migration.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(applied, /'featured',\s*j\.featured/, 'get_published_jobs does not return featured');
  assert.ok(applied.indexOf("'featured', j.featured") < applied.indexOf('order by'), 'the pin is not in the projection');
});

test('the card says a listing is pinned, rather than looking like every other one', async () => {
  // Ordering alone is invisible. A visitor cannot tell which rows were put there
  // deliberately and which are just the feed - so the pin has to be stated.
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const card = app.slice(app.indexOf('renderJobCard(j) {'), app.indexOf('_injectJobsJsonLd(jobs) {'));
  assert.ok(card.length > 0, 'could not locate renderJobCard');
  assert.match(card, /jobFeaturedLabel\(j\)/, 'the job card never renders the pin label');
  // And a missing column must not badge everything: absence means "not pinned".
  const fn = app.slice(app.indexOf('adminIsFeatured(j) {'));
  assert.match(fn.slice(0, 400), /=== true/, 'the pin must be read positively, not by presence');
});

test('employmentType is not asserted without evidence', async () => {
  // The feed carries a contract_time that is not stored, so every listing used to
  // claim FULL_TIME whether or not it was. Google says to omit the field when
  // unknown, so a constant is worse than nothing.
  const { html } = await renderJob(makeJob(1));
  const posting = jobPostingOf(html);
  assert.ok(!('employmentType' in posting), 'employmentType must not be a hardcoded FULL_TIME');
});

test('employmentType is read out of the title, in Google\'s own vocabulary', async () => {
  // Google accepts a fixed, case-sensitive set - FULL_TIME, PART_TIME,
  // CONTRACTOR, TEMPORARY, INTERN, VOLUNTEER, PER_DIEM, OTHER - and allows more
  // than one on the same posting. A title that names a type states it, so it is
  // reported; a title that names none gets nothing.
  const cases = [
    ['Software Development Intern', ['INTERN']],
    ['Sales Trainee (Fresher, Part Time, Work From Home)', ['PART_TIME', 'INTERN']],
    ['Freelance Content Writer', ['CONTRACTOR']],
    ['Contract Engineer', ['CONTRACTOR']],
    ['SAP Treasury Consultant (3 Months Contractual)', ['CONTRACTOR']],
    ['Full Time Backend Engineer', ['FULL_TIME']],
    ['Contract Management Analyst', []],
    ['Backend Engineer', []]
  ];
  for (const [title, expected] of cases) {
    const { html } = await renderJob(makeJob(1, { title }));
    const posting = jobPostingOf(html);
    const got = posting.employmentType;
    if (!expected.length) {
      assert.ok(!('employmentType' in posting), `${title} states no type, so none may be claimed`);
      continue;
    }
    const list = Array.isArray(got) ? got : [got];
    assert.deepEqual(list, expected, `${title} should report ${expected.join(', ')}`);
  }
});

test('every published job is reachable from the board, not just the first ten', async () => {
  // The old code did jobs.slice(0, 10) for the graph while the page rendered all
  // of them, so crawlers were told the board was ten jobs long. The board no
  // longer names the jobs in its markup at all - the visible list and the
  // per-job pages do that - so the thing to protect is that every row is still
  // linked and every link is a real job page.
  const jobs = Array.from({ length: 40 }, (_, i) => makeJob(i));
  const html = (await render(jobs)).html;
  for (let i = 0; i < jobs.length; i++) {
    assert.match(html, new RegExp(`Engineer ${i}<`), `Engineer ${i} is missing from the visible board`);
    assert.match(html, /<a href="\/jobs\/engineer-/g);
  }
  const links = [...html.matchAll(/href="\/jobs\/([^"#?]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith('in/'));
  const unique = new Set(links);
  assert.equal(unique.size, 40, 'every job is linked exactly once');
  assert.ok(
    !ldOf(html)['@graph'].some((n) => n['@type'] === 'ItemList'),
    'the board names no carousel of job pages'
  );
});

test('datePosted is the real arrival date, not the day the page was rendered', async () => {
  const { html } = await renderJob(makeJob(1));
  assert.equal(jobPostingOf(html).datePosted, '2026-09-28');
  assert.ok(
    !html.includes(`"datePosted": "${new Date().toISOString().slice(0, 10)}"`),
    'datePosted must not be rewritten to today on every request'
  );
});

test('baseSalary is omitted rather than invented from the display string', async () => {
  const { html } = await renderJob(makeJob(1, { salary: null }));
  const posting = jobPostingOf(html);
  assert.ok(!('baseSalary' in posting), 'no numeric bounds are stored, so none may be claimed');
});

test('a job with no arrival date falls back to the date the row was created', async () => {
  // Four listings came through the board's own form and never through the
  // importer, so they have no arrival date. Google rejects a JobPosting with no
  // datePosted, and the row's creation date is a fact about the listing rather
  // than an invention - which is exactly what the render date would be.
  const { html } = await renderJob(
    makeJob(1, { first_seen_at: null, created_at: '2026-10-01T18:18:08.172819+00:00' })
  );
  assert.equal(jobPostingOf(html).datePosted, '2026-10-01');
});

test('a job with no date at all omits datePosted rather than inventing one', async () => {
  const { html } = await renderJob(makeJob(1, { first_seen_at: null, created_at: null }));
  const posting = jobPostingOf(html);
  assert.ok(!('datePosted' in posting), 'a missing date must not become a fabricated one');
});

test('validThrough is left out when there is no timestamp to build one from', async () => {
  // Google: "If a job posting never expires, or you do not know when the job
  // will expire, do not include this property." A row with no arrival date, no
  // creation date and no sighting leaves us with nothing to say, and a missing
  // expiry is far better than a fabricated one.
  const { html } = await renderJob(makeJob(1, { first_seen_at: null, created_at: null }));
  assert.ok(!('validThrough' in jobPostingOf(html)), 'an unknown expiry is not claimed');
});

test('a posting of our own expires 30 days after we published it', async () => {
  // A listing submitted through the board's own form never came through the
  // importer, so it has no sighting at all - the publication IS the evidence.
  // Its expiry is therefore the same 30-day window from the day it went live,
  // which is exactly the date Google would assume on its own; stating it
  // plainly costs nothing and claims nothing extra.
  const { html } = await renderJob(makeJob(1, {
    first_seen_at: null,
    created_at: '2026-10-01T18:18:08Z',
    last_seen_at: null
  }));
  const posting = jobPostingOf(html);
  assert.equal(posting.datePosted, '2026-10-01');
  assert.equal(posting.validThrough, '2026-10-31');
});

test('a feed listing the feed has not re-served expires 30 days after it arrived', async () => {
  const { html } = await renderJob(makeJob(1, {
    first_seen_at: '2026-09-28T10:00:00Z',
    last_seen_at: null
  }));
  const posting = jobPostingOf(html);
  assert.equal(posting.datePosted, '2026-09-28');
  assert.equal(posting.validThrough, '2026-10-28');
});

test('validThrough is 30 days past the last time the feed carried the listing', async () => {
  // `last_seen_at` is the date the importer last saw this listing in the feed,
  // bumped every time the feed re-serves it. Thirty days past that is this
  // board's own rule for how long a listing stands, so the date is a fact we
  // hold rather than a guess about the employer's closing date.
  const { html } = await renderJob(makeJob(1, { last_seen_at: '2026-10-19T04:12:00Z' }));
  assert.equal(jobPostingOf(html).validThrough, '2026-11-18');
});

test('the expiry is never earlier than the one Google would assume on its own', async () => {
  // Google assumes a posting expires 30 days after `datePosted` - the arrival
  // date. A listing the feed carried for a fortnight after it arrived would be
  // written off as expired on its arrival date, while the feed was still
  // serving it. Reading the expiry off the last sighting instead can only move
  // the date later, never earlier, so a posting is never aged out while it is
  // still there.
  const { html } = await renderJob(makeJob(1, {
    first_seen_at: '2026-09-28T10:00:00Z',
    last_seen_at: '2026-10-19T04:12:00Z'
  }));
  const posting = jobPostingOf(html);
  const googleAssumption = new Date(Date.parse(posting.datePosted) + 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  assert.ok(posting.validThrough > googleAssumption, 'the expiry must not be earlier than Google would assume');
});

test('a sighting that predates the posting itself is not turned into an expiry', async () => {
  // Two timestamps that disagree mean the row is inconsistent, and a claim
  // built on disagreement is worse than no claim. The expiry is left out
  // rather than guessed at.
  const { html } = await renderJob(makeJob(1, {
    first_seen_at: '2026-10-10T10:00:00Z',
    last_seen_at: '2026-09-01T10:00:00Z'
  }));
  assert.ok(!('validThrough' in jobPostingOf(html)), 'inconsistent dates must not produce an expiry');
});

test('the job page asks for the last sighting, or the expiry can never reach it', async () => {
  // PostgREST returns only the columns named in select=. A page that never
  // asked for the sighting would serve a posting with no expiry, and nothing
  // would say why.
  const mod = await import(urlOf(path.join(ROOT, 'functions', 'jobs', '[slug].js')));
  const real = globalThis.fetch;
  let asked = '';
  const job = makeJob(1);
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (/id=eq\./.test(url)) {
      asked = (url.match(/[?&]select=([^&]*)/) || [])[1] || '';
      return new Response(JSON.stringify([job]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const env = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  try {
    await mod.onRequestGet({
      request: new Request(`https://example.com/jobs/${job.id}`),
      env,
      params: { slug: job.id }
    });
  } finally {
    globalThis.fetch = real;
  }
  assert.match(asked, /\blast_seen_at\b/, 'the leaf query must ask for the last sighting');
});

test('the posting is identified by something that never changes', async () => {
  // Google's own example of an identifier is a name plus a value. The value is
  // what makes it an identifier, and the row's uuid is the one handle that
  // never changes and never repeats.
  const job = makeJob(1);
  const { html } = await renderJob(job);
  const posting = jobPostingOf(html);
  assert.equal(posting.identifier['@type'], 'PropertyValue');
  assert.equal(posting.identifier.name, 'Company 1 - Engineer 1');
  assert.equal(posting.identifier.value, job.id);
});

test('the posting stands alone, the way Google\'s own job posting markup does', async () => {
  // Google's documentation for a job posting is a standalone JobPosting node:
  // no @id, no mainEntity, no mainEntityOfPage, no publisher. A reference
  // between the page and the posting is how a parser says "this page is about
  // that thing" - and a parser that resolves it folds the posting into the
  // page entity, so the posting stops being an item of its own. The schema.org
  // validator does exactly that, which is how this was found.
  const { html } = await renderJob(makeJob(1));
  const posting = jobPostingOf(html);
  const graph = jobLdOf(html)['@graph'] || [];
  const webPage = graph.find((n) => n['@type'] === 'WebPage');

  for (const field of ['@id', 'mainEntity', 'mainEntityOfPage', 'publisher']) {
    assert.ok(!(field in posting), `the posting should not carry ${field}`);
  }
  assert.ok(!webPage || !('mainEntity' in webPage), 'the page should not point at the posting');
  // It still says which page it is on, which is how Google pairs a posting
  // with the URL it was found on.
  assert.match(posting.url, /^https:\/\/swapiki\.com\/jobs\/[a-z0-9-]+--[0-9a-f-]{36}$/);
});

test('the posting only carries fields schema.org defines for a JobPosting', async () => {
  // JobPosting sits under Thing > Intangible, NOT under CreativeWork, so the
  // fields a CreativeWork gets - `publisher` above all - are unknown on a
  // posting. The schema.org validator says so in as many words, and a field
  // Google does not recognise is a field it cannot use.
  //
  // The list below is schema.org's own: every property defined on JobPosting,
  // plus the ones Thing adds, plus the two JSON-LD keys that are not fields.
  const allowed = new Set([
    // JobPosting's own properties.
    'applicantLocationRequirements', 'applicationContact', 'baseSalary', 'bonus',
    'candidateInstructions', 'datePosted', 'description', 'directApply',
    'educationRequirements', 'eligibilityToWorkRequirement', 'employerOverview',
    'employmentType', 'employmentUnit', 'estimatedSalary',
    'experienceInPlaceOfEducation', 'experienceRequirements', 'hiringOrganization',
    'identifier', 'incentiveCompensation', 'industry', 'jobBenefits', 'jobDuration',
    'jobImmediateStart', 'jobLocation', 'jobLocationType', 'jobStartDate',
    'occupationalCategory', 'physicalRequirement', 'qualifications',
    'relevantOccupation', 'responsibilities', 'salaryCurrency',
    'securityClearanceRequirement', 'sensoryRequirement', 'skills',
    'specialCommitments', 'title', 'totalJobOpenings', 'validThrough', 'workHours',
    // The properties Thing adds.
    'additionalType', 'alternateName', 'disambiguatingDescription', 'image',
    'mainEntityOfPage', 'name', 'owner', 'potentialAction', 'sameAs', 'subjectOf',
    'url', 'about',
    // Not fields, but the keys the graph itself is written in.
    '@type', '@id'
  ]);

  const seen = [];
  for (const job of [
    makeJob(1),
    makeJob(2, { location: 'Remote (India)' }),
    makeJob(3, { title: 'Part Time Marketing Intern', salary_min: 300000, salary_max: 600000 })
  ]) {
    const { html } = await renderJob(job);
    const posting = jobPostingOf(html);
    for (const key of Object.keys(posting)) {
      seen.push(key);
      assert.ok(allowed.has(key), `"${key}" is not a schema.org JobPosting field`);
    }
  }
  // The field that caused this: naming the board as the publisher of the
  // posting is a CreativeWork idea, and JobPosting is not a CreativeWork.
  assert.ok(!seen.includes('publisher'), 'a JobPosting has no publisher field');
});

test('the location says where the job is, and a remote job says who may apply', async () => {
  const office = await renderJob(makeJob(1, { location: 'Bangalore, Karnataka' }));
  const place = jobPostingOf(office.html).jobLocation;
  assert.equal(place.address.addressLocality, 'Bangalore');
  assert.equal(place.address.addressRegion, 'Karnataka');
  assert.equal(place.address.addressCountry, 'IN');

  const remote = await renderJob(makeJob(2, { location: 'Remote (India)' }));
  const remotePosting = jobPostingOf(remote.html);
  assert.equal(remotePosting.jobLocationType, 'TELECOMMUTE');
  assert.equal(remotePosting.applicantLocationRequirements.name, 'India');
  // A remote job has no site to sit in, so the country is all the address can
  // honestly say.
  assert.equal(remotePosting.jobLocation.address.addressCountry, 'IN');
  assert.ok(!('addressLocality' in remotePosting.jobLocation.address),
    'a remote job must not claim a locality');
});

test('the description is the job, in HTML, and not just the title', async () => {
  // Google requires the description in HTML, at minimum with paragraph breaks,
  // and says it "can't be the same as the title". The markup also has to match
  // the words a reader can read on the page.
  const job = makeJob(1, {
    description: '<p>You will own features end to end.</p><p>You have shipped something real.</p>'
  });
  const { html } = await renderJob(job);
  const posting = jobPostingOf(html);
  assert.match(posting.description, /^<p>/, 'the description must be HTML');
  assert.ok(posting.description.includes('</p><p>'), 'the paragraphs must be marked up');
  assert.ok(!posting.description.includes('<script'), 'no raw markup from the feed');
  assert.ok(posting.description.includes('You will own features end to end.'));
  assert.ok(!posting.description.startsWith(`<p>${job.title}</p>`),
    'the description must not be the title');
  // And the page shows the same words.
  assert.match(html, /You will own features end to end\./);
  assert.match(html, /You have shipped something real\./);
});

test('the board is grouped by category with counts', async () => {
  // Grouping lives in the no-JS fallback, so this exercises that path.
  const { html } = await render([
    makeJob(1, { category: 'it' }),
    makeJob(2, { category: 'it' }),
    makeJob(3, { category: 'bfsi' }),
    makeJob(4, { category: null })
  ], { noAssets: true });
  assert.match(html, /IT &amp; Engineering <span[^>]*>\(2\)/, 'IT section with its count');
  assert.match(html, /BFSI <span[^>]*>\(1\)/, 'BFSI section with its count');
  assert.match(html, /Other roles <span[^>]*>\(1\)/, 'a null category lands in Other, not vanishes');
  // IT before BFSI, every time. Scoped to the section headings, because "BFSI"
  // also appears in the <title> and meta description well above the body.
  const headings = [...html.matchAll(/>(IT &amp; Engineering|BFSI|Other roles) <span/g)].map((m) => m[1]);
  assert.deepEqual(headings, ['IT &amp; Engineering', 'BFSI', 'Other roles'], 'sections render in a fixed order');
});

test('an empty board degrades without inventing jobs or markup', async () => {
  const { html } = await render([], { noAssets: true });
  assert.match(html, /No open positions right now/);
  // The page still describes itself and the org, but publishes no posting - and
  // no list either, because the board names no list of jobs in its markup at all.
  assert.equal(postingsOf(html).length, 0, 'no jobs means no JobPosting');
  assert.ok(!ldOf(html)['@graph'].some((n) => n['@type'] === 'ItemList'), 'no invented empty list');
  assert.equal(nodeOf(html, 'CollectionPage')['@id'], 'https://swapiki.com/jobs#webpage');
});

test('the board does not require a service key to be honest', async () => {
  // No key configured: the page must still serve the app, with no structured
  // listing data, and must not crash or leak an error.
  const mod = await import(urlOf(path.join(ROOT, 'functions', 'jobs.js')));
  const res = await mod.onRequestGet({
    request: new Request('https://example.com/jobs'),
    env: {
      SUPABASE_URL: 'https://fake.supabase.co',
      ASSETS: { fetch: async () => new Response(INDEX_HTML, { status: 200 }) }
    }
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /id="view-jobs"/, 'the board still renders without a service key');
  // Honest degradation: the page is described, but nothing claims a list size.
  // An empty ItemList here would assert Swapiki has zero openings, when the truth
  // is that this request could not read them.
  assert.equal(nodeOf(html, 'CollectionPage')['@id'], 'https://swapiki.com/jobs#webpage');
  assert.ok(!ldOf(html)['@graph'].some((n) => n['@type'] === 'ItemList'),
    'a list whose size could not be read must not be published');
  assert.ok(!/SUPABASE_SERVICE_ROLE_KEY/.test(html), 'no config detail in the page');
});

test('job fields cannot break out of the markup or the JSON-LD script tag', async () => {
  const hostile = {
    title: '<script>alert(1)</script>',
    company: '"><img src=x onerror=alert(1)>'
  };
  const { html } = await renderJob(makeJob(1, hostile));

  // The page is HTML-escaped, so no live markup from either field.
  assert.ok(!html.includes('<script>alert(1)</script>'), 'a job title must not inject a script');
  assert.ok(!html.includes('<img src=x'), 'a company name must not inject an element');

  // The JSON-LD is the sharper edge: it is embedded inside a <script> element,
  // where "</script>" would end the tag early. ldOf() parses the block up to the
  // first "</script>", so a successful parse proves no early close happened.
  const posting = jobPostingOf(html);
  assert.equal(posting.title, hostile.title, 'data must round-trip unchanged');
  assert.equal(posting.hiringOrganization.name, hostile.company);
  // Belt and braces: the escaping must be the \u form, not literal angle brackets.
  const block = html.match(/<script type="application\/ld\+json" id="job-jsonld">([\s\S]*?)<\/script>/)[1];
  assert.ok(!block.includes('<'), 'no raw < may survive inside the JSON-LD block');
  assert.ok(!block.includes('>'), 'no raw > may survive inside the JSON-LD block');
});

test('a hostile field cannot break out of the app shell either', async () => {
  // The same data is injected into the shell that is already in the page, so the
  // escaping has to hold in that path too — that is the one that actually ships.
  const { html } = await render([makeJob(1, { title: '</script><img src=x onerror=alert(1)>' })]);
  const block = jsonOf(html);
  assert.ok(!block.includes('<'), 'no raw < may survive inside the injected JSON-LD');
  // The board names no job in its markup, so the hostile title is only ever
  // visible text on a card - HTML-escaped there - and never data in the graph.
  assert.ok(
    !ldOf(html)['@graph'].some((n) => JSON.stringify(n).includes('onerror')),
    'the hostile title must not reach the structured data'
  );
  assert.match(html, /&lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt;/, 'the card escapes it');
});
