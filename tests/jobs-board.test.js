const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const urlOf = (p) => pathToFileURL(p).href;

function makeJob(i, over = {}) {
  return {
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
    return new Response(JSON.stringify(jobs.slice(offset, offset + limit)), { status: 200 });
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

test('the board asks for every published job, not an arbitrary twenty', async () => {
  const { seen } = await render([makeJob(1)]);
  assert.equal(seen.length, 1);
  assert.match(seen[0], /status=eq\.published/);
  const limit = Number(seen[0].match(/limit=(\d+)/)[1]);
  assert.ok(limit >= 500, `limit ${limit} would truncate the published board`);
});

test('the board pages past its first page instead of dropping the older jobs', async () => {
  // This is the bug the single limit caused. The cap was raised 20 -> 500, the
  // board then grew past 500 published jobs, and because the route took the newest
  // page and stopped, the oldest jobs left the page and the JobPosting graph
  // silently. The number stayed at exactly the cap, which is what made it look
  // healthy: a cap that is also the current count is indistinguishable from a
  // board that is complete.
  const jobs = Array.from({ length: 501 }, (_, i) => makeJob(i + 1));
  const { html, seen } = await render(jobs);

  const offsets = seen.map((u) => Number(u.match(/offset=(\d+)/)[1]));
  assert.deepEqual(offsets, [0, 500], `expected a second page, requested offsets ${offsets}`);
  // And the job that the old code threw away is still on the page.
  assert.ok(ldOf(html)['@graph'].some((p) => p.title === 'Engineer 501'));
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
  assert.match(html, /<a href="\/jobs\/engineer-1-company-1-bengaluru--"/, 'no link to job 1');
  assert.match(html, /<a href="\/jobs\/engineer-2-company-2-bengaluru--"/, 'no link to job 2');
  assert.match(html, /IT &amp; Engineering/, 'the visible board lost its categories');
  assert.ok(!/id="jobs-container"><\/div>/.test(html), 'an empty mount point was served');
});

test('a large board ships a visible list without duplicating every job into the markup', async () => {
  // The JSON-LD already carries every posting. Writing a second full copy of
  // several thousand cards into the DOM would balloon an already-large document,
  // so the visible list is capped - but it must still be a real, populated board
  // and the structured data must still cover every job.
  const jobs = Array.from({ length: 250 }, (_, i) => makeJob(i + 1));
  const { html } = await render(jobs);
  const visible = [...html.matchAll(/<a href="\/jobs\//g)].length;
  assert.ok(visible > 0, 'the served board has no visible listings');
  assert.ok(visible <= 200, `the visible list should be capped, saw ${visible} links`);
  assert.equal(postingsOf(html).length, 250, 'the structured data must still cover every job');
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
  const posting = postingsOf(html)[0];
  // The posting's own url is its page on Swapiki, so the hostile feed value has
  // nowhere to go even as a string.
  assert.match(posting.url, /^https:\/\/swapiki\.com\/jobs\//);
  assert.ok(!JSON.stringify(posting).includes('javascript:'), 'the hostile value reached the JSON-LD');
  assert.ok(!posting.directApply, 'nor be advertised as a direct application');
});

test('the posting points at its own page, and admits it is not a direct application', async () => {
  // Google treats a JobPosting without `url` as incomplete, so `url` is set - but
  // to the page describing the role, not the employer's ATS page. Forwarding
  // `url` off-site would make every posting claim the same address as the redirect
  // it happens to land on.
  //
  // `directApply` means the applicant applies in the employer's own system. Every
  // listing here does, so the honest value is false. Asserting true would put a
  // false claim on all 500+ postings, which is what earns a structured-data
  // penalty, so this test exists to keep that from creeping back.
  const { html } = await render([makeJob(7)]);
  const posting = postingsOf(html)[0];
  assert.match(posting.url, /^https:\/\/swapiki\.com\/jobs\/engineer-7-company-7-bengaluru--/);
  assert.equal(posting.directApply, false);
});

test('the structured data is injected into the app shell, once', async () => {
  // The app reuses #jobs-jsonld rather than appending a second block, because
  // two conflicting JobPosting graphs in one page is worse than one.
  const { html } = await render([makeJob(1)]);
  assert.equal((html.match(/application\/ld\+json/g) || []).length,
    (INDEX_HTML.match(/application\/ld\+json/g) || []).length + 1,
    'expected exactly one added JSON-LD block');
  assert.match(html, /id="jobs-jsonld"/, 'the block needs the id the app looks up');
  // Every job, not a slice: capping the markup while the page shows all of them
  // tells crawlers the board is shorter than it is.
  const { html: many } = await render(Array.from({ length: 40 }, (_, i) => makeJob(i)));
  assert.equal(postingsOf(many).length, 40);
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
  const { html } = await render([makeJob(1)]);
  const posting = postingOf(html, 'Engineer 1');
  assert.ok(!('baseSalary' in posting), 'no stored bounds means no invented salary markup');
  assert.ok(!/"baseSalary"/.test(jsonOf(html)), 'the field must not appear at all');
});

test('stored salary bounds become a real MonetaryAmount, in INR per year', async () => {
  const { html } = await render([
    makeJob(1, { salary_min: 1200000, salary_max: 1800000 })
  ]);
  const posting = postingsOf(html)[0];
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
  const { html } = await render([
    makeJob(1, { salary_min: '1200000', salary_max: '1800000' })
  ]);
  const { value } = postingsOf(html)[0].baseSalary;
  assert.strictEqual(value.minValue, 1200000, 'a numeric string must be coerced to a number');
  assert.strictEqual(value.maxValue, 1800000);
});

test('a stated one-sided salary is emitted, not completed by guessing', async () => {
  const { html } = await render([
    makeJob(1, { salary_min: 900000, salary_max: null }),
    makeJob(2, { salary_min: null, salary_max: 1500000 })
  ]);
  const [a, b] = postingsOf(html);
  assert.ok(!('maxValue' in a.baseSalary.value), 'a missing upper bound must not be invented');
  assert.equal(a.baseSalary.value.minValue, 900000);
  assert.ok(!('minValue' in b.baseSalary.value));
  assert.equal(b.baseSalary.value.maxValue, 1500000);
});

test('a malformed salary bound is dropped rather than emitted', async () => {
  const { html } = await render([
    makeJob(1, { salary_min: 'not-a-number', salary_max: 1800000 })
  ]);
  const value = postingsOf(html)[0].baseSalary.value;
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
  // The jobs survive even though the columns did not. Asserted on the structured
  // data rather than the markup, because the JSON-LD graph is what a crawler
  // reads and it must name every job even when the salary columns are absent.
  assert.equal(postingsOf(html).length, 2, 'jobs survive the fallback');
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
  assert.equal(postingsOf(html).length, 2, 'jobs survive the fallback');
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
  // never carried out of the fetch that resolved it. On an un-migrated database
  // that is two wasted round trips per page - sixty of them on a cold start of a
  // twenty-page board - to learn something the first page already knew.
  const jobs = Array.from({ length: 1001 }, (_, i) => makeJob(i + 1));
  const { seen } = await render(jobs, { missingFeaturedColumn: true });
  const offsets = seen.map((u) => Number((u.match(/offset=(\d+)/) || [])[1] || 0));
  // Two pages of real work, plus the rejected first shape, plus nothing more.
  assert.deepEqual(offsets, [0, 0, 0, 500, 1000], `unexpected paging: ${JSON.stringify(offsets)}`);
  assert.equal(seen.length, 5, 'the schema must be discovered once, not once per page');
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
  const { html } = await render([makeJob(1)]);
  const posting = postingsOf(html)[0];
  assert.ok(!('employmentType' in posting), 'employmentType must not be a hardcoded FULL_TIME');
});

test('every published job appears in the structured data, not just the first ten', async () => {
  // The old code did jobs.slice(0, 10) for the graph while the page rendered all
  // of them, so crawlers were told the board was ten jobs long.
  const jobs = Array.from({ length: 40 }, (_, i) => makeJob(i));
  const html = (await render(jobs)).html;
  const postings = postingsOf(html);
  assert.equal(postings.length, 40, 'the JSON-LD graph must cover every listed job');
  // The list must agree with the postings, or the board's own answer is wrong
  // about how many openings it has.
  assert.equal(nodeOf(html, 'ItemList').numberOfItems, 40);
  for (let i = 0; i < jobs.length; i++) {
    assert.ok(
      postings.some((p) => p.title === `Engineer ${i}`),
      `Engineer ${i} is missing from the structured data`
    );
  }
});

test('datePosted is the real arrival date, not the day the page was rendered', async () => {
  const { html } = await render([makeJob(1)]);
  assert.equal(postingOf(html, 'Engineer 1').datePosted, '2026-09-28');
  assert.ok(
    !jsonOf(html).includes(`"datePosted": "${new Date().toISOString().slice(0, 10)}"`),
    'datePosted must not be rewritten to today on every request'
  );
});

test('baseSalary is omitted rather than invented from the display string', async () => {
  const graph = ldOf((await render([makeJob(1), makeJob(2, { salary: null })])).html)['@graph'];
  for (const g of graph) {
    assert.ok(!('baseSalary' in g), 'no numeric bounds are stored, so none may be claimed');
  }
});

test('a job with no arrival date omits datePosted rather than inventing one', async () => {
  const { html } = await render([makeJob(1, { first_seen_at: null })]);
  const posting = postingsOf(html)[0];
  assert.ok(!('datePosted' in posting), 'a missing date must not become a fabricated one');
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
  // The page still describes itself and the org, but publishes no list and no
  // posting - an empty ItemList would tell crawlers the board is genuinely empty,
  // which is a claim about the world this request cannot make.
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
  const { html } = await render([makeJob(1, hostile)], { noAssets: true });

  // The card is HTML-escaped, so no live markup from either field.
  assert.ok(!html.includes('<script>alert(1)</script>'), 'a job title must not inject a script');
  assert.ok(!html.includes('<img src=x'), 'a company name must not inject an element');

  // The JSON-LD is the sharper edge: it is embedded inside a <script> element,
  // where "</script>" would end the tag early. ldOf() parses the block up to the
  // first "</script>", so a successful parse proves no early close happened.
  const postings = postingsOf(html);
  assert.equal(postings[0].title, hostile.title, 'data must round-trip unchanged');
  assert.equal(postings[0].hiringOrganization.name, hostile.company);
  // Belt and braces: the escaping must be the \u form, not literal angle brackets.
  const block = jsonOf(html);
  assert.ok(!block.includes('<'), 'no raw < may survive inside the JSON-LD block');
  assert.ok(!block.includes('>'), 'no raw > may survive inside the JSON-LD block');
});

test('a hostile field cannot break out of the app shell either', async () => {
  // The same data is injected into the shell that is already in the page, so the
  // escaping has to hold in that path too — that is the one that actually ships.
  const { html } = await render([makeJob(1, { title: '</script><img src=x onerror=alert(1)>' })]);
  const block = jsonOf(html);
  assert.ok(!block.includes('<'), 'no raw < may survive inside the injected JSON-LD');
  assert.equal(postingsOf(html)[0].title, '</script><img src=x onerror=alert(1)>',
    'and the data must still round-trip unchanged');
});
