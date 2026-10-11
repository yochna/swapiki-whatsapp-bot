// Public job submission: anyone can post an opening, an admin decides.
//
// The flow this holds in place:
//   form on the public /jobs page -> POST /api/submit-job -> draft row -> admin's
//   Awaiting approval list -> approve -> published on the board.
//
// The load-bearing property is that the middle step is a hard stop. A submission
// must arrive as a draft with source='user-submission' no matter what the request
// body claims, because the automated paths — /curate publishing, the staleness
// sweep retracting, /notify messaging — all scope themselves to source='adzuna'.
// The moment a public writer can choose its own source, an unmoderated job can
// enter the auto-pipeline that the vetted feed is supposed to own.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { bootApp, makeStorage, fakeEl } = require('./helpers/app-sandbox');

const ROOT = path.join(__dirname, '..');
const routeUrl = pathToFileURL(path.join(ROOT, 'functions', 'api', 'submit-job.js')).href;
const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

const UUID = '7c1f4b2a-5d3e-4a6b-8c9d-0e1f2a3b4c5d';
const UUID2 = '2b8e6d1f-4a5c-4b7e-9f10-3c4d5e6f7a8b';
const env = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
};

const goodPost = (over = {}) => Object.assign(
  {
    title: 'Backend Engineer',
    company: 'Northwind',
    location: 'Bengaluru',
    salary: '18-24 LPA',
    category: 'it',
    contact: 'https://northwind.example/careers/backend',
    description: 'Own the payments service.',
    rawText: 'Northwind is hiring a backend engineer.',
    skills: ['Go', 'Postgres']
  },
  over
);

// ---------------------------------------------------------------------------
// Route harness
// ---------------------------------------------------------------------------
// Stubs PostgREST and records every insert. `missingColumns` reproduces a project
// that has not run the ingest migration, where one unknown column makes PostgREST
// reject the whole request — the failure the route has to recover from rather than
// losing an employer's post. The rejection is conditional on the column actually
// being in the payload, so the route's retry is answered rather than bounced again.
function harness({ missingColumns = [], created = true, body } = {}) {
  const writes = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const method = (init && init.method) || 'GET';
    if (!String(input).startsWith(env.SUPABASE_URL)) throw new Error(`unexpected host: ${input}`);
    const payload = init && init.body ? JSON.parse(init.body) : null;
    const row = payload && payload[0];
    writes.push({ method, payload: row });
    const missing = missingColumns.find(col => row && col in row);
    if (missing) {
      return new Response(
        JSON.stringify({ code: '42703', message: `column jobs.${missing} does not exist` }),
        { status: 400 }
      );
    }
    if (!created) return new Response(null, { status: 204 });
    return new Response(JSON.stringify((payload || []).map(r => Object.assign({ id: UUID }, r))), {
      status: 201
    });
  };
  return {
    writes,
    restore() { globalThis.fetch = realFetch; }
  };
}

/** Each test gets its own IP so the route's per-IP limiter cannot leak between them. */
let ipCounter = 0;
function postRequest(payload, { ip, method = 'POST' } = {}) {
  ipCounter++;
  return new Request('https://example.com/api/submit-job', {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, ip ? { 'CF-Connecting-IP': ip } : {}),
    body: method === 'POST' ? JSON.stringify(payload === undefined ? goodPost() : payload) : undefined
  });
}

async function submit({ payload, ip, method = 'POST', missingColumns, created, envOverrides } = {}) {
  const mod = await import(routeUrl);
  const h = harness({ missingColumns, created });
  try {
    const res = await mod.onRequest({
      request: postRequest(payload, { ip: ip || `10.0.0.${ipCounter}`, method }),
      env: envOverrides === null ? {} : Object.assign({}, env, envOverrides)
    });
    return { writes: h.writes, status: res.status, body: await res.json().catch(() => null) };
  } finally {
    h.restore();
  }
}

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

test('a submission is stored as a draft for an admin to review', async () => {
  const { status, body, writes } = await submit();
  assert.strictEqual(status, 201);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.status, 'draft');
  assert.strictEqual(body.id, UUID);
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].payload.status, 'draft', 'a public post is never live on arrival');
  assert.strictEqual(writes[0].payload.source, 'user-submission');
  assert.strictEqual(writes[0].payload.title, 'Backend Engineer');
  assert.strictEqual(writes[0].payload.contact, 'https://northwind.example/careers/backend');
  // The poster is told what actually happened to their post, rather than being
  // left to assume it is on the board.
  assert.match(body.message, /reviews every submission before it appears/i);
});

test('a status or source in the request body is ignored', async () => {
  // The single most important assertion in this file. This route writes with the
  // service role key, which bypasses RLS, so the only thing standing between a
  // stranger and a published job is that these two values are hardcoded.
  const { writes, status } = await submit({
    payload: goodPost({
      status: 'published',
      source: 'adzuna',
      dedupe_key: 'collide-with-a-real-listing',
      posted_by: '00000000-0000-0000-0000-000000000000'
    })
  });
  assert.strictEqual(status, 201);
  const row = writes[0].payload;
  assert.strictEqual(row.status, 'draft');
  assert.strictEqual(row.source, 'user-submission');
  // A dedupe_key would put a stranger's post inside the feed importer's identity
  // check, so the column is left absent rather than merely unset.
  assert.ok(!('dedupe_key' in row), 'a submission must not carry a dedupe_key');
  assert.ok(!('posted_by' in row), 'a submission is not attributed to a user account');
});

test('a post with no title, company or contact is refused and nothing is written', async () => {
  // Storing a partial draft would put a row in the review queue that no admin can
  // act on, so the whole post is refused and the poster is told which parts are missing.
  const { status, body, writes } = await submit({ payload: {} });
  assert.strictEqual(status, 400);
  assert.strictEqual(writes.length, 0);
  assert.strictEqual(body.errors.length, 3);
  const joined = body.errors.join(' ');
  assert.match(joined, /job title is required/);
  assert.match(joined, /company name is required/);
  assert.match(joined, /email, phone number or apply link is required/);
});

test('a honeypot submission is accepted silently and writes nothing', async () => {
  // Answered like a success so a bot cannot learn the field exists, and nothing is
  // written so a flood of them cannot fill the review queue.
  const { status, body, writes } = await submit({ payload: goodPost({ honeypot: 'http://spam.example' }) });
  assert.strictEqual(status, 202);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(writes.length, 0);
});

test('a contact that could execute in a link is dropped rather than stored', async () => {
  // `contact` is rendered as an href in the admin review row, so a stored
  // javascript: or data: URL would execute when the admin opened the queue.
  for (const contact of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
    const { status, body, writes } = await submit({ payload: goodPost({ contact }) });
    assert.strictEqual(status, 400, `${contact} must be refused`);
    assert.strictEqual(writes.length, 0);
    assert.match(body.errors.join(' '), /email, phone number or apply link is required/);
  }
});

test('a plain email or phone number survives the link check', async () => {
  // Most posters give one of these. "WhatsApp: 98765 43210" is the case a
  // guess-the-scheme-from-the-colon check gets wrong: the colon makes it look
  // like a URI, so the post gets refused for the most ordinary input there is.
  for (const contact of ['hr@northwind.example', '+91 98765 43210', 'WhatsApp: 9876543210']) {
    const { status, writes } = await submit({ payload: goodPost({ contact }) });
    assert.strictEqual(status, 201, `${contact} must be accepted`);
    assert.strictEqual(writes[0].payload.contact, contact);
  }
});

test('an unknown category is refused instead of silently becoming something else', async () => {
  const { status, body, writes } = await submit({ payload: goodPost({ category: 'crypto' }) });
  assert.strictEqual(status, 400);
  assert.strictEqual(writes.length, 0);
  assert.match(body.errors.join(' '), /"it", "bfsi" or "any"/);
});

test('a burst from one connection is throttled', async () => {
  const ip = '203.0.113.7';
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await submit({ ip })).status);
  assert.deepStrictEqual(statuses, [201, 201, 201, 201, 201, 429], 'five posts, then refused');
  const throttled = await submit({ ip });
  assert.match(throttled.body.error, /Too many submissions/);
});

test('only POST is accepted, and the preflight is answered', async () => {
  const { status, writes } = await submit({ method: 'GET' });
  assert.strictEqual(status, 405);
  assert.strictEqual(writes.length, 0);

  const mod = await import(routeUrl);
  const preflight = await mod.onRequest({ request: new Request('https://example.com/api/submit-job', { method: 'OPTIONS' }), env });
  assert.strictEqual(preflight.status, 204);
  assert.strictEqual(preflight.headers.get('Access-Control-Allow-Origin'), '*');
});

test('an unconfigured deployment says so rather than looking like an empty queue', async () => {
  const { status, body, writes } = await submit({ envOverrides: { SUPABASE_SERVICE_ROLE_KEY: '' } });
  assert.strictEqual(status, 503);
  assert.strictEqual(writes.length, 0);
  assert.match(body.error, /not configured/i);
});

test('a project missing the feed columns still accepts the post', async () => {
  // first_seen_at/last_seen_at arrive with the ingest migration. PostgREST rejects
  // the whole request for one unknown column, so the retry drops just those two.
  // Losing an employer's post because a reporting column is absent would be the
  // wrong trade.
  const { status, writes } = await submit({ missingColumns: ['first_seen_at'] });
  assert.strictEqual(status, 201);
  assert.strictEqual(writes.length, 2, 'the rejected attempt, then the retry');
  assert.ok('first_seen_at' in writes[0].payload, 'the first attempt asks for the column');
  assert.ok(!('first_seen_at' in writes[1].payload), 'the retry drops it');
  assert.ok(!('last_seen_at' in writes[1].payload));
  // Everything that identifies the post survives the retry, and the status is
  // still forced — the fallback must not become a path around the draft guarantee.
  assert.strictEqual(writes[1].payload.status, 'draft');
  assert.strictEqual(writes[1].payload.source, 'user-submission');
  assert.strictEqual(writes[1].payload.title, 'Backend Engineer');
});

test('skills are deduped and capped, and control characters never reach a field', async () => {
  const mod = await import(routeUrl);
  const many = Array.from({ length: 30 }, (_, i) => `skill${i}`);
  const { row } = mod.validateSubmission(goodPost({
    skills: ['Go', 'go', 'GO', ...many],
    title: 'Staff\u0000 Engineer\n\tLead',
    company: 'Northwind\u0007'
  }));
  assert.strictEqual(row.skills.length, 12, 'a job post is a paragraph, not a keyword dump');
  assert.deepStrictEqual(row.skills.slice(0, 2), ['Go', 'skill0'], 'case-insensitive dedupe');
  // A newline in a title reflows every table cell it is rendered into, and a NUL
  // is never legitimate in a job post.
  assert.strictEqual(row.title, 'Staff Engineer Lead');
  assert.strictEqual(row.company, 'Northwind');
});

test('oversized text is truncated rather than stored whole', async () => {
  const mod = await import(routeUrl);
  const { row } = mod.validateSubmission(goodPost({ description: 'x'.repeat(9000) }));
  assert.strictEqual(row.description.length, 2000);
});

// ---------------------------------------------------------------------------
// The form on the public jobs page
// ---------------------------------------------------------------------------

/**
 * Renders the jobs page as one of its three states: signed out, under 80%, and
 * an unlocked member. Every state renders the same listings; the first two gate
 * only the search, filter and match controls.
 */
async function renderJobs(state, jobs = []) {
  const { app, sandbox, els } = bootApp(makeStorage());
  if (state !== 'signed-out') {
    sandbox.swapikiStore.currentUser = { id: 'user-1' };
    sandbox.swapikiStore.getProfile = () => ({ completionScore: state === 'board' ? 90 : 30 });
  }
  sandbox.swapikiStore.getPublishedJobs = () => Promise.resolve(jobs);
  sandbox.swapikiStore.getPublicJobs = () => Promise.resolve(jobs);
  await app.renderJobsView();
  return { app, sandbox, els, html: els['jobs-container'].innerHTML };
}

test('a signed-out visitor can post a job and still read the listings', async () => {
  // Posting an opening is how a board gets its listings, so the form is offered
  // before sign-in. The listings are public too - the gate is on the search, the
  // filters and the match score, not on the jobs existing - so a signed-out
  // visitor browses the board and is told plainly what signing in unlocks.
  const { html, els } = await renderJobs('signed-out', [
    { id: UUID, title: 'Backend Engineer', company: 'Northwind', category: 'it' }
  ]);
  assert.ok(html.includes('app.submitJobForm(event)'), 'the form is offered before sign-in');
  assert.ok(html.includes('id="job-form-hp"'), 'with its honeypot');
  assert.match(html, /Search, filters and match are for proof-backed profiles/);
  assert.ok(!html.includes('id="job-search"'), 'the search box stays gated');
  assert.match(els['jobs-results'].innerHTML, /Backend Engineer/, 'the listings are shown');
});

test('a candidate below the 80% wall can post a job and read the listings', async () => {
  const { html, els } = await renderJobs('under-80', [
    { id: UUID, title: 'Backend Engineer', company: 'Northwind', category: 'it' }
  ]);
  assert.ok(html.includes('app.submitJobForm(event)'));
  assert.match(html, /Search, filters and match are for proof-backed profiles/);
  assert.match(html, /You're at 30%/);
  assert.ok(!html.includes('id="job-search"'), 'the search box stays gated below 80%');
  assert.match(els['jobs-results'].innerHTML, /Backend Engineer/);
});

test('a member with the board unlocked sees the form and the board together', async () => {
  const { html, els } = await renderJobs('board', [{ id: UUID, title: 'Backend Engineer', company: 'Northwind', category: 'it' }]);
  assert.ok(html.includes('app.submitJobForm(event)'));
  assert.ok(html.includes('id="jobs-results"'), 'the board is still rendered');
  // The results grid is filled in separately so the search box keeps focus, so the
  // listing lands in its own element rather than in the page shell.
  assert.match(els['jobs-results'].innerHTML, /Backend Engineer/);
});

test('the form asks for a title, a company and a way to reply', async () => {
  const { app } = await renderJobs('signed-out');
  const html = app.renderJobSubmitForm();
  ['job-form-title', 'job-form-company', 'job-form-contact', 'job-form-description', 'job-form-skills']
    .forEach(id => assert.ok(html.includes(`id="${id}"`), `missing ${id}`));
  // A reviewer's only action on a draft is to reply, so the contact field is
  // marked required on the label itself and not only in the placeholder.
  assert.match(html, /Apply link, email or phone \*/);
  assert.match(html, /Job title \*/);
  assert.match(html, /Company \*/);
  // Stated up front, because a poster who assumes their job is live is a poster
  // who will post something they did not mean to.
  assert.match(html, /admin reviews it before it goes live/i);
});

/**
 * Stands in for the form as it exists on a rendered page.
 *
 * In the browser these elements come from the innerHTML renderJobSubmitForm()
 * returned. The sandbox has no parser, so the ids the handler reads are created
 * here instead — otherwise every test would be asserting against an empty element
 * and pass for the wrong reason.
 */
function fillForm(els, values = {}) {
  [
    'job-form-title', 'job-form-company', 'job-form-contact', 'job-form-location',
    'job-form-salary', 'job-form-category', 'job-form-description', 'job-form-raw',
    'job-form-skills', 'job-form-hp', 'job-form-submit', 'job-form-result'
  ].forEach(id => { els[id] = els[id] || fakeEl(); });
  els['job-form-category'].value = 'it';
  Object.keys(values).forEach(id => { els[id].value = values[id]; });
  return els;
}

/** Counts the form resets a successful submission triggers. */
function watchFormReset(sandbox) {
  const state = { resets: 0 };
  sandbox.document.querySelector = sel => (sel === '#post-a-job form'
    ? { reset() { state.resets++; } }
    : null);
  return state;
}

test('an incomplete post is refused in the browser without calling the server', async () => {
  const { app, sandbox, els } = bootApp(makeStorage());
  let called = 0;
  sandbox.swapikiStore.submitJob = () => { called++; return Promise.resolve({ ok: true }); };
  fillForm(els, { 'job-form-title': 'Backend Engineer', 'job-form-company': 'Northwind' });

  await app.submitJobForm({ preventDefault() {} });

  assert.strictEqual(called, 0, 'the round trip is only worth making for a complete post');
  assert.match(els['job-form-result'].innerHTML, /apply link, email or phone number/);
});

test('a complete post is sent with the fields the route validates', async () => {
  const { app, sandbox, els } = bootApp(makeStorage());
  const sent = [];
  sandbox.swapikiStore.submitJob = payload => { sent.push(payload); return Promise.resolve({ ok: true, id: UUID }); };
  const form = watchFormReset(sandbox);
  fillForm(els, {
    'job-form-title': ' Backend Engineer ',
    'job-form-company': 'Northwind',
    'job-form-contact': 'https://northwind.example/careers',
    'job-form-location': 'Bengaluru',
    'job-form-salary': '18-24 LPA',
    'job-form-category': 'bfsi',
    'job-form-description': 'Own the payments service.',
    'job-form-raw': 'Forwarded text',
    'job-form-skills': 'Go, Postgres , , Go'
  });

  await app.submitJobForm({ preventDefault() {} });

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].title, 'Backend Engineer', 'the value is trimmed before it is sent');
  assert.strictEqual(sent[0].category, 'bfsi');
  // Blanks are dropped here; dedupe and the cap belong to the route, which is the
  // only place they are enforced, so there is one rule rather than two.
  assert.deepStrictEqual(Array.from(sent[0].skills), ['Go', 'Postgres', 'Go']);
  assert.match(els['job-form-result'].innerHTML, /reviews every submission/);
  assert.strictEqual(form.resets, 1, 'a submitted post does not stay on screen to be re-sent');
  // The button has to come back, or a poster who mistypes a field can never retry.
  assert.strictEqual(els['job-form-submit'].disabled, false);
  assert.strictEqual(els['job-form-submit'].textContent, 'Submit for review');
});

test("the server's own complaint is shown to the poster", async () => {
  const { app, sandbox, els } = bootApp(makeStorage());
  sandbox.swapikiStore.submitJob = () => Promise.reject(new Error('A company name is required.'));
  fillForm(els, {
    'job-form-title': 'Backend Engineer',
    'job-form-company': 'Northwind',
    'job-form-contact': 'https://northwind.example/careers'
  });

  await app.submitJobForm({ preventDefault() {} });

  assert.match(els['job-form-result'].innerHTML, /A company name is required/);
  assert.strictEqual(els['job-form-submit'].disabled, false);
});

test('a server error message is escaped before it is shown', async () => {
  const { app, sandbox, els } = bootApp(makeStorage());
  sandbox.swapikiStore.submitJob = () => Promise.reject(new Error('<img src=x onerror=alert(1)>'));
  fillForm(els, {
    'job-form-title': 'Backend Engineer',
    'job-form-company': 'Northwind',
    'job-form-contact': 'https://northwind.example/careers'
  });

  await app.submitJobForm({ preventDefault() {} });

  assert.ok(!els['job-form-result'].innerHTML.includes('<img'), 'the message is not markup');
  assert.match(els['job-form-result'].innerHTML, /&lt;img/);
});

// ---------------------------------------------------------------------------
// The admin side
// ---------------------------------------------------------------------------

test('the admin no longer has a way to add a job', async () => {
  // Posting an opening is an employer's job, not an admin's, and the second write
  // path it used to have bypassed every validation the public route now applies.
  const { app } = bootApp(makeStorage());
  const html = app.renderAdminJobsSection([
    { id: UUID, title: 'Backend Engineer', company: 'Northwind', category: 'it', status: 'draft' },
    { id: UUID2, title: 'Data Analyst', company: 'Southwind', category: 'bfsi', status: 'published' }
  ]);
  assert.strictEqual(typeof app.adminSubmitJob, 'undefined', 'the admin submit handler is gone');
  assert.ok(!html.includes('<form'), 'no form in the jobs section');
  assert.ok(!html.includes('admin-job-raw'), 'and none of its fields');
  // The review queue is what the admin is actually there for, and it stays.
  assert.ok(html.includes("app.adminBulkSetStatus('draft', 'published')"));
  assert.ok(html.includes("app.adminBulkSetStatus('draft', 'rejected')"));
  assert.ok(html.includes('app.adminApproveJob('), 'single-row decisions still work');
  assert.ok(html.includes('app.adminUnpublishJob('));
});

test('the header counts the jobs waiting for a decision, not the rows in the table', async () => {
  // 796 rows and 41 decisions. The number an admin needs on arrival is the size of
  // the work, so the header carries the review count and the published total keeps
  // its own heading. The old "Awaiting approval" line and the paragraph above it
  // said the same thing twice, at two different sizes.
  const { app } = bootApp(makeStorage());
  const drafts = Array.from({ length: 41 }, (_, i) => ({
    id: `0000000${i}-2222-3333-4444-555555555555`,
    title: `Draft ${i}`, company: 'Acme', category: 'it', status: 'draft'
  }));
  const published = Array.from({ length: 755 }, (_, i) => ({
    id: `1000000${i}-2222-3333-4444-555555555555`,
    title: `Live ${i}`, company: 'Acme', category: 'it', status: 'published'
  }));
  const html = app.renderAdminJobsSection(drafts.concat(published));

  assert.match(html, /Job Review<\/h3>\s*<span[^>]*data-admin-total="draft"[^>]*>41<\/span>/, 'the badge is the review count');
  assert.ok(!html.includes('>796<'), 'the row total is not the headline');
  assert.ok(!html.includes('Awaiting approval'), 'and the duplicate heading is gone');
  assert.ok(!html.includes('Every opening arrives here first'), 'and so is the paragraph restating it');
  // The published count is still available — just on the table it belongs to, and
  // in a span the repaint can correct in place when a decision moves a row.
  assert.match(html, /Published \(<span[^>]*data-admin-total="published"[^>]*>755<\/span>\)/);
});

test('an empty queue reads as nothing to do, not as a heading with a zero', async () => {
  const { app } = bootApp(makeStorage());
  const html = app.renderAdminJobsSection([]);
  assert.match(html, /Job Review<\/h3>\s*<span[^>]*>0<\/span>/);
  assert.match(html, /Nothing to review/);
  assert.ok(!html.includes('Select all'), 'an empty queue has no bulk bar to sit disarmed');
});

test('the admin sees that a listing came from an employer, and how to reply', async () => {
  const { app } = bootApp(makeStorage());
  const html = app.adminJobProvenance({ source: 'user-submission', contact: 'https://northwind.example/careers' });
  assert.match(html, /Posted by employer/);
  assert.match(html, /href="https:\/\/northwind\.example\/careers"/);
});

test('an employer-posted contact is not turned into a link unless it is http(s)', async () => {
  const { app } = bootApp(makeStorage());
  const hostile = app.adminJobProvenance({ source: 'user-submission', contact: 'javascript:alert(1)' });
  assert.ok(!hostile.includes('href='), 'a javascript: contact is shown as text, never as a link');
  assert.match(hostile, /javascript:alert\(1\)/, 'the reviewer still sees what was submitted');
});

test('a submission with no contact is flagged rather than passed over', async () => {
  const { app } = bootApp(makeStorage());
  assert.match(app.adminJobProvenance({ source: 'user-submission', contact: '' }), /no contact given/);
});

test('the phone card says who posted a listing, not just its title', async () => {
  // The admin reviews on a phone, and a submission is distinguished from a feed
  // listing only by its poster and its contact. A card that showed the title alone
  // would make the queue undecidable from the device it is actually read on.
  const { app } = bootApp(makeStorage());
  const html = app.renderAdminJobsSection([
    {
      id: UUID,
      title: 'Backend Engineer',
      company: 'Northwind',
      location: 'Bengaluru',
      category: 'it',
      status: 'draft',
      source: 'user-submission',
      contact: 'https://northwind.example/careers',
      raw_text: 'Northwind is hiring.'
    }
  ]);
  const card = html.slice(html.indexOf('md:hidden'));
  assert.match(card, /Backend Engineer/);
  assert.match(card, /Northwind · Bengaluru/);
  assert.match(card, /Posted by employer/);
  assert.match(card, /href="https:\/\/northwind\.example\/careers"/);
  assert.match(card, /Original post/, 'the pasted text is still one tap away');
});

test('every public job card is labelled as posted by Swapiki', async () => {
  const { app } = bootApp(makeStorage());
  // The badge renders the source label straight after its own icon span. The
  // public board shows one label for every source by product decision; the real
  // provenance is still shown in the admin review view.
  const label = j => (app.renderJobCard(j).match(/>share<\/span>([^<]*)</) || [])[1];
  assert.strictEqual(label({ title: 'A', company: 'B', source: 'user-submission' }), 'Posted by Swapiki');
  assert.strictEqual(label({ title: 'A', company: 'B', source: 'adzuna' }), 'Posted by Swapiki');
  assert.strictEqual(label({ title: 'A', company: 'B', source: 'direct-post' }), 'Posted by Swapiki');
  assert.strictEqual(label({ title: 'A', company: 'B', source: 'swaniki' }), 'Posted by Swapiki');
  assert.strictEqual(label({ title: 'A', company: 'B', source: 'whatsapp-forward' }), 'Posted by Swapiki');
  assert.strictEqual(label({ title: 'A', company: 'B' }), 'Posted by Swapiki');
});

test('a job card shows the profile match score under the posted-by badge', async () => {
  const { app, sandbox } = bootApp(makeStorage());
  // The scorer is a separate deferred script in the browser; load it here the
  // same way index.html does, then give the sandbox a profile that overlaps the
  // listing's description and skills.
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'js', 'profileMatch.js'), 'utf8'),
    sandbox,
    { filename: 'profileMatch.js' }
  );
  sandbox.swapikiStore.getProfile = () => ({
    title: 'Frontend Engineer',
    experience: '3 years',
    expertise: ['react', 'css'],
    projects: [{ title: 'Design system', tags: ['react'] }]
  });
  const html = app.renderJobCard({
    id: 'j1', title: 'Frontend Engineer', company: 'Swaniki', source: 'swaniki',
    skills: ['react', 'css'], description: 'Build with React and CSS.'
  });
  assert.match(html, /\d+% match/, 'the card must state the match score');
  // And with no profile the card still renders, without inventing a score.
  const { app: bare } = bootApp(makeStorage());
  assert.ok(!/% match/.test(bare.renderJobCard({ id: 'j2', title: 'X', company: 'Y' })), 'no profile means no invented score');
});

// ---------------------------------------------------------------------------
// The store method
// ---------------------------------------------------------------------------

function bootStore(respond) {
  const noop = () => {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    document: { referrer: '', querySelector: () => null, querySelectorAll: () => [], addEventListener: noop },
    fetch: respond
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('store.js'), sandbox, { filename: 'store.js' });
  return sandbox;
}

test('a public submission goes to the route, not to the jobs table', async () => {
  const calls = [];
  const sandbox = bootStore((url, init) => {
    calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ ok: true, id: UUID, status: 'draft' }) });
  });
  sandbox.swapikiStore.supabase = { from: () => { throw new Error('the jobs table must not be written from the client'); } };

  const res = await sandbox.swapikiStore.submitJob({ title: 'Backend Engineer', company: 'Northwind', contact: 'hr@northwind.example', skills: ['Go'] });

  assert.strictEqual(res.ok, true);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, '/api/submit-job');
  assert.strictEqual(calls[0].method, 'POST');
  assert.strictEqual(calls[0].body.title, 'Backend Engineer');
  // Even though a submitter is never an admin and never signs in, the payload
  // carries no status and no source: there is nothing here to influence.
  assert.ok(!('status' in calls[0].body), 'no status is sent');
  assert.ok(!('source' in calls[0].body), 'no source is sent');
  assert.ok(!('dedupe_key' in calls[0].body), 'no dedupe_key is sent');
});

test('posting a job needs neither admin access nor an account', async () => {
  const sandbox = bootStore(() => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ ok: true }) }));
  sandbox.swapikiStore.supabase = null;
  sandbox.swapikiStore.isAdminUser = false;
  sandbox.swapikiStore.currentUser = null;
  const res = await sandbox.swapikiStore.submitJob({ title: 'A', company: 'B', contact: 'c@d.example' });
  assert.strictEqual(res.ok, true);
});

test('the named validation errors reach the poster as one sentence', async () => {
  const sandbox = bootStore(() => Promise.resolve({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ ok: false, errors: ['A job title is required.', 'A company name is required.'] })
  }));
  await assert.rejects(
    () => sandbox.swapikiStore.submitJob({ contact: 'c@d.example' }),
    /A job title is required\. A company name is required\./
  );
});

test('an unreachable server produces a sentence the poster can act on', async () => {
  const sandbox = bootStore(() => Promise.reject(new Error('network down')));
  await assert.rejects(() => sandbox.swapikiStore.submitJob({ title: 'A' }), /Check your connection/);
});
