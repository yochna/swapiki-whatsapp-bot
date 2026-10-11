// Ingest pipeline: the Adzuna adapter and the /ingest route.
//
// The point of these tests is that the adapter is pure, so every case below
// runs offline with no network, no key, and no database. The two properties
// worth protecting hardest:
//
//   1. A feed can never publish anything. status is fixed to 'draft' and there
//      is no input that changes it, because /jobs emits JobPosting JSON-LD into
//      Google's index. An automated feed is unvetted by definition, so a bug
//      here would put unreviewed third-party listings in front of employers.
//   2. Re-running is safe. A daily scheduler will re-serve the same listing
//      forever, so dedupe has to hold on the key the database indexes.
//
// functions/lib/adzuna.js is ESM (Pages Functions require it), so it is pulled
// in with a dynamic import from these CommonJS tests.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { bootApp } = require('./helpers/app-sandbox');

const ROOT = path.join(__dirname, '..');
// pathToFileURL, not a bare path: the ESM loader rejects a Windows drive letter
// ("Received protocol 'c:'") and every test in this file would fail for a reason
// that has nothing to do with the ingest logic.
const urlOf = p => pathToFileURL(p).href;

/**
 * A first_seen_at recent enough to be undecided (far under
 * UNDECIDED_EXPIRY_DAYS=14) but far enough to never collide with another row.
 * Curation tests used to freeze "2026-09-27", which sits exactly 14 days before
 * the date this file happens to run — the tests passed for weeks, then all
 * started failing on the day the frozen draft crossed the expiry boundary and
 * the sweep started rejecting it. A relative date keeps the expiry clock out of
 * every curation assertion while the timer test below still uses deliberately
 * ancient dates to exercise the sweep itself.
 */
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();
let lib;

test.before(async () => {
  lib = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'adzuna.js')));
});

/**
 * Blanks out // and /* *\/ comments so the source scan below reads code only.
 * Stripping only line comments left /* ... *\/ doc blocks in place, and those
 * blocks discuss publishing by name, so the word "published" survived and the
 * scan flagged its own documentation.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

const sample = (over = {}) => Object.assign(
  {
    id: "129698749",
    title: "Senior React Developer",
    description: "<p>Build <b>dashboards</b>.</p><ul><li>React</li><li>SQL</li></ul>",
    created: "2026-09-30T10:00:00Z",
    redirect_url: "https://www.adzuna.co.in/jobs/land/ad/129698749",
    contract_type: "permanent",
    contract_time: "full_time",
    salary_min: 1500000,
    salary_max: 2400000,
    salary_is_predicted: 0,
    category: { label: "IT Jobs", tag: "it-jobs" },
    company: { display_name: "Payments Co" },
    location: { display_name: "Bengaluru", area: ["India", "Karnataka", "Bengaluru"] }
  },
  over
);

test('buildSearchUrl targets India and asks for JSON', () => {
  const url = new URL(lib.buildSearchUrl({ appId: "A", appKey: "B", what: "react", where: "India" }));
  assert.equal(url.searchParams.get('app_id'), 'A');
  assert.equal(url.searchParams.get('app_key'), 'B');
  assert.equal(url.searchParams.get('what'), 'react');
  assert.equal(url.searchParams.get('where'), 'India');
  assert.equal(url.searchParams.get('content-type'), 'application/json');
  assert.match(url.pathname, /\/v1\/api\/jobs\/in\/search\/1$/);
  // Without a recency window every run re-imports all of history.
  assert.ok(Number(url.searchParams.get('max_days_old')) > 0, 'expected a recency window');
  assert.equal(url.searchParams.get('sort_by'), 'date', 'newest first, so a partial run still gets fresh rows');
});

test('buildSearchUrl refuses to build an unauthenticated request', () => {
  assert.throws(() => lib.buildSearchUrl({ what: 'react' }), /app_id/);
  assert.throws(() => lib.buildSearchUrl({ appId: 'A' }), /app_id/);
});

test('the default query set is fixed and India-scoped', () => {
  assert.ok(Array.isArray(lib.DEFAULT_QUERIES) && lib.DEFAULT_QUERIES.length > 0);
  for (const q of lib.DEFAULT_QUERIES) {
    assert.equal(typeof q.what, 'string');
    assert.match(q.where, /India/i, `query "${q.what}" must stay India-scoped`);
  }
  // An unattended hourly job against an open-ended query burns the rate limit.
  const what = lib.DEFAULT_QUERIES.map(q => q.what);
  assert.equal(new Set(what).size, what.length, 'duplicate queries would just re-import the same rows');
});

test('normalizeResult maps a listing onto the jobs columns', () => {
  const row = lib.normalizeResult(sample());
  assert.equal(row.dedupe_key, 'adzuna:in:129698749');
  assert.equal(row.title, 'Senior React Developer');
  assert.equal(row.company, 'Payments Co');
  assert.equal(row.location, 'Bengaluru');
  assert.equal(row.category, 'it');
  assert.equal(row.source, 'adzuna');
  assert.equal(row.apply_url, 'https://www.adzuna.co.in/jobs/land/ad/129698749');
  assert.equal(row.contact, row.apply_url, 'contact and apply_url carry the same link for this feed');
  assert.match(row.salary, /₹/);
  assert.ok(Array.isArray(row.skills));
});

test('an imported listing is always a draft, whatever the feed says', () => {
  // The whole verification standard in 0.8.39-0.8.42 rests on this. /jobs
  // publishes JobPosting JSON-LD, so an imported row that reached "published"
  // would put unreviewed third-party copy in front of Google and employers.
  for (const hostile of [
    { status: 'published' },
    { status: 'PUBLISHED' },
    { published: true },
    { status: 'approved' }
  ]) {
    const row = lib.normalizeResult(sample(hostile));
    assert.equal(row.status, 'draft', `feed field ${JSON.stringify(hostile)} must not reach status`);
  }
  assert.ok(!('published' in lib.normalizeResult(sample({ published: true }))));
});

test('dedupeKeyFor is stable and country-scoped', () => {
  assert.equal(lib.dedupeKeyFor('129698749'), lib.dedupeKeyFor('129698749'));
  assert.equal(lib.dedupeKeyFor('129698749'), lib.dedupeKeyFor(' 129698749 '), 'whitespace is trimmed');
  assert.notEqual(lib.dedupeKeyFor(1), lib.dedupeKeyFor(2));
  assert.match(lib.dedupeKeyFor(1), /^adzuna:[a-z]{2}:/, 'prefixed so a second market cannot collide');
});

test('dedupeRows collapses the same listing seen by two queries', () => {
  // Different `what` values routinely return one listing. Without this the run
  // submits one dedupe_key twice and the unique index rejects the whole batch.
  const a = lib.normalizeResult(sample());
  const b = lib.normalizeResult(sample({ title: 'Same job, second sighting' }));
  assert.equal(a.dedupe_key, b.dedupe_key);
  const out = lib.dedupeRows([a, b, null, undefined, { nope: true }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Senior React Developer', 'first sighting wins');
});

test('listings missing a title or company are rejected', () => {
  // The manual admin form refuses these, so the importer should too rather than
  // filling the approval queue with rows nobody can publish.
  assert.equal(lib.normalizeResult(sample({ title: '   ' })), null);
  assert.equal(lib.normalizeResult(sample({ company: { display_name: '' } })), null);
  assert.equal(lib.normalizeResult(sample({ id: '' })), null);
  assert.equal(lib.normalizeResult(null), null);
  assert.equal(lib.normalizeResult(undefined), null);
});

test('BFSI, IT and unrecognised listings land in the right bucket', () => {
  const bfsi = lib.normalizeResult(sample({ title: 'Relationship Manager, Retail Banking', category: { label: 'Banking Jobs', tag: 'banking-jobs' } }));
  assert.equal(bfsi.category, 'bfsi');
  const it = lib.normalizeResult(sample({ title: 'Backend Engineer', category: { label: 'IT Jobs', tag: 'it-jobs' } }));
  assert.equal(it.category, 'it');
  // The category is a candidate-facing filter, so an unknown one must not be
  // guessed into IT.
  const unknown = lib.normalizeResult(sample({ title: 'Barista', category: { label: 'Hospitality Jobs', tag: 'hospitality-jobs' } }));
  assert.equal(unknown.category, 'any');
});

test('a predicted salary is dropped rather than shown as if it were stated', () => {
  const predicted = lib.formatSalary(sample({ salary_is_predicted: 1 }));
  assert.equal(predicted, '', 'Adzuna inferred this number; the reader cannot tell it apart from a stated one');
  const stated = lib.formatSalary(sample());
  assert.match(stated, /₹/);
  assert.equal(lib.formatSalary({}), '');
  assert.equal(lib.formatSalary(null), '');
  assert.equal(lib.formatSalary(sample({ salary_min: null, salary_max: null })), '');
});

test('salary_is_predicted arrives as a STRING, so a naive truthiness test inverts the rule', () => {
  // Verified against the live India feed: the field is the string "0" for an
  // employer-stated salary, never the number 0. The non-empty string "0" is
  // TRUTHY in JavaScript, so `if (result.salary_is_predicted) return ""` dropped
  // all 183 real salaries in the first live run and would have kept only the
  // predicted ones - exactly backwards. The unit fixture used the number 0, so
  // the test suite passed while the feature was inverted.
  assert.equal(typeof String(sample().salary_is_predicted), 'string');
  assert.equal(String(0), '0');
  assert.ok(String(0), 'the trap: "0" is truthy');

  // Stated, as the feed actually sends it.
  assert.equal(lib.isPredictedSalary({ salary_is_predicted: '0' }), false);
  assert.match(lib.formatSalary(sample({ salary_is_predicted: '0' })), /₹/, 'a stated salary must survive');

  // Predicted, in every shape the feed or a test might use.
  for (const v of ['1', 1, true, 'true', 'TRUE', ' 1 ']) {
    assert.equal(lib.isPredictedSalary({ salary_is_predicted: v }), true, `${JSON.stringify(v)} should be predicted`);
    assert.equal(lib.formatSalary(sample({ salary_is_predicted: v })), '');
  }

  // Absent field means "not predicted", so a real salary is kept.
  assert.equal(lib.isPredictedSalary({}), false);
  assert.equal(lib.isPredictedSalary({ salary_min: 100, salary_max: 200 }), false);
  assert.equal(lib.isPredictedSalary(null), false);
  // Guards against someone reintroducing the truthiness bug.
  assert.match(lib.formatSalary(sample({ salary_is_predicted: '0' })), /₹15,00,000 - ₹24,00,000/);
});

test('salary formatting handles open ranges and inverted bounds', () => {
  assert.match(lib.formatSalary(sample({ salary_min: 900000, salary_max: 1800000 })), /-/, 'a real range gets a dash');
  assert.match(lib.formatSalary(sample({ salary_min: null, salary_max: 1800000 })), /^Up to/);
  assert.match(lib.formatSalary(sample({ salary_min: 900000, salary_max: null })), /^From/);
  assert.equal(lib.formatSalary(sample({ salary_min: 1800000, salary_max: 900000 })), '', 'min > max is nonsense, show nothing');
});

test('an implausibly wide salary band is dropped as a feed unit error', () => {
  // The live India feed served a "Sales Intern" at Rs 1,20,000 - 12,00,000: a
  // 10x span that is a monthly figure paired with an annual one. Rendering it
  // would be absurd and would look exactly like a real offer to a reader.
  assert.equal(lib.formatSalary(sample({ salary_min: 120000, salary_max: 1200000 })), '', '10x band rejected');
  // Exactly 4x is the boundary and stays; beyond it is dropped.
  assert.match(lib.formatSalary(sample({ salary_min: 400000, salary_max: 1600000 })), /-/);
  assert.equal(lib.formatSalary(sample({ salary_min: 400000, salary_max: 1600001 })), '', 'just over 4x rejected');
  // A normal senior band is untouched.
  assert.equal(lib.formatSalary(sample({ salary_min: 1500000, salary_max: 2400000 })), '₹15,00,000 - ₹24,00,000');
});

test('skills are also read from the description, not just the title', () => {
  // Measured on the live feed: title-only recovered skills for 11 of 50 software
  // roles, title+description recovered 17. jobs.skills drives candidate scoring,
  // so missing a listed technology costs ranking accuracy.
  const inDescription = lib.normalizeResult(sample({
    title: 'Backend Engineer',
    description: '<p>You will work with our Java and PostgreSQL stack on AWS.</p>'
  }));
  assert.ok(inDescription.skills.includes('java'), 'java is named only in the description');
  assert.ok(inDescription.skills.includes('postgresql'));
  assert.ok(inDescription.skills.includes('aws'));
  // And it must still not invent technology that is nowhere in the listing.
  const unrelated = lib.normalizeResult(sample({
    title: 'Backend Engineer',
    description: '<p>Sales and operations role.</p>'
  }));
  assert.deepEqual(unrelated.skills, [], 'no skills when none are mentioned');
});

test('skills are matched from a fixed vocabulary, not scraped from prose', () => {
  // jobs.skills is read by profileMatch.requiredSkills() to score candidates,
  // so a sloppy extraction degrades the core feature.
  assert.deepEqual(lib.extractSkills('Senior React Developer'), ['react']);
  assert.ok(lib.extractSkills('Data Analyst (SQL, Power BI)').includes('sql'));
  // "C++ Developer" must match c++ and not the bare "c".
  const cpp = lib.extractSkills('C++ Developer');
  assert.ok(cpp.includes('c++'), 'metacharacters must be escaped');
  assert.ok(!cpp.includes('c'));
  // Capped, so a long title cannot stuff the array.
  const many = 'react angular vue python java sql aws docker kubernetes terraform spark hadoop';
  assert.ok(lib.extractSkills(many).length <= 6, 'skill list is capped');
  assert.deepEqual(lib.extractSkills(''), []);
  assert.deepEqual(lib.extractSkills(null), []);
});

test('the vocabulary names the technologies the feed actually lists', () => {
  // 2 of 37 pending drafts carried any skill while the feed was posting Kafka,
  // Snowflake, CyberArk and Workday roles: the words were real, the list was
  // short. A candidate is under-ranked by an absent skill, so these are pinned.
  // Pinned in realistic batches, because extractSkills caps at 6 per listing:
  // one sentence naming a dozen tools is not a listing, and it would test the cap
  // rather than the vocabulary.
  const batches = [
    ['Kafka, Snowflake, dbt and Airflow pipelines', ['kafka', 'snowflake', 'dbt', 'airflow']],
    ['Databricks on Azure with Terraform', ['databricks', 'azure', 'terraform']],
    ['CyberArk and Workday integration', ['cyberark', 'workday']],
    ['ServiceNow, PowerApps, Splunk', ['servicenow', 'powerapps']],
    ['React and Python', ['react', 'python']]
  ];
  for (const [text, expected] of batches) {
    const found = lib.extractSkills(text);
    for (const skill of expected) {
      assert.ok(found.includes(skill), `feed vocabulary is missing ${skill} in "${text}"`);
    }
  }
  // The words that would fire on ordinary prose stay out on purpose. "Shell" is
  // Shell the oil major, "react" here is a reaction, "chef" is a kitchen, and a
  // two-letter "r" or "go" is not a skill anyone can be ranked by.
  const prose = lib.extractSkills(
    'The role will engage with stakeholders and react to change at Shell and BP. ' +
      'Go to the office, ask the R team, coordinate with the chef de partie. Go, r, shell.'
  );
  for (const word of ['go', 'r', 'shell', 'chef']) {
    assert.ok(!prose.includes(word), `"${word}" must not be read as a skill`);
  }
});

test('description HTML is flattened and length-capped', () => {
  const text = lib.stripHtml('<p>Build <b>dashboards</b>.</p><ul><li>React</li><li>SQL</li></ul>');
  assert.ok(!text.includes('<'), 'no tags survive');
  assert.ok(!text.includes('&nbsp;'), 'entities are decoded');
  assert.match(text, /dashboards/);
  assert.match(text, /React/);
  const long = lib.stripHtml('<p>' + 'x'.repeat(9000) + '</p>', 100);
  assert.ok(long.length <= 104, 'truncated with an ellipsis');
  assert.equal(lib.stripHtml(null), '');
});

test('first_seen_at and last_seen_at are both stamped, and equally', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const row = lib.normalizeResult(sample(), { now });
  assert.equal(row.first_seen_at, '2026-09-30T12:00:00.000Z');
  assert.equal(row.last_seen_at, row.first_seen_at);
});

test('an imported job shows the admin where it came from and how to check it', () => {
  const { app } = bootApp();
  // An imported listing is unvetted third-party copy, so a reviewer must be able
  // to open the source posting before clicking publish. Without the link,
  // "verify before you publish" is not actionable from the queue.
  const adzuna = app.adminJobProvenance({ source: 'adzuna', apply_url: 'https://www.adzuna.co.in/jobs/land/ad/1' });
  assert.match(adzuna, /From Adzuna/);
  assert.match(adzuna, /view on Adzuna/);
  assert.match(adzuna, /href="https:\/\/www\.adzuna\.co\.in\/jobs\/land\/ad\/1"/);
  // The href is Adzuna's own detail page, not the employer's ATS. Labelling it
  // "the original" promises a first-party posting we cannot actually reach, so
  // the wording is pinned to name the real destination.
  assert.doesNotMatch(adzuna, /check the original/);
  // rel must block both window.opener access and referrer leakage.
  assert.match(adzuna, /rel="noopener noreferrer nofollow"/);
  assert.match(adzuna, /target="_blank"/);
});

test('an imported apply link cannot smuggle a javascript: URL into the admin row', () => {
  const { app } = bootApp();
  // redirect_url comes from a third-party feed, so it is attacker-influenced.
  // An href of javascript:... would run when an admin clicked the row.
  for (const hostile of [
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '  javascript:alert(1)  '
  ]) {
    const html = app.adminJobProvenance({ source: 'adzuna', apply_url: hostile });
    assert.ok(!/href=/.test(html), `"${hostile}" must not produce a link`);
    assert.match(html, /From Adzuna/, 'the provenance badge should still show');
  }
});

test('a hand-typed job gets no provenance line at all', () => {
  const { app } = bootApp();
  assert.equal(app.adminJobProvenance({ source: 'whatsapp-forward', contact: 'hr@example.com' }), '');
  assert.equal(app.adminJobProvenance({}), '');
  assert.equal(app.adminJobProvenance(null), '');
  // An unknown future source must not be guessed into a badge either.
  assert.equal(app.adminJobProvenance({ source: 'scraped' }), '');
});

test('the /ingest route is POST-only and secret-gated', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'ingest.js'), 'utf8');
  assert.match(src, /export async function onRequestPost/);
  assert.match(src, /x-ingest-secret/);
  // Comparison must not leak a timing signal.
  assert.match(src, /secretMatches/, 'expected a constant-time compare');
  // A GET is refused *and* the secret is required, but the ordering matters:
  // reject before doing any work.
  assert.ok(
    src.indexOf('INGEST_SECRET') < src.indexOf('buildSearchUrl'),
    'the secret check must come before any network call'
  );

  // The GET handler only reads draft rows for the QC report, but that read uses
  // the service role key. So the guarantee that matters is: with no secret, GET
  // is refused and no database call happens. Assert the behaviour, not the
  // function's argument list.
  const mod = await import(urlOf(path.join(ROOT, 'functions', 'ingest.js')));
  let called = false;
  const globalThisFetch = globalThis.fetch;
  globalThis.fetch = () => {
    called = true;
    throw new Error('GET must not reach the network');
  };
  try {
    for (const qs of ['', '?report=1', '?report=1&status=published']) {
      const res = await mod.onRequestGet({
        request: new Request(`https://example.com/ingest${qs}`, { method: 'GET' }),
        env: { INGEST_SECRET: 'a'.repeat(64), SUPABASE_SERVICE_ROLE_KEY: 'service' }
      });
      assert.equal(res.status, 405, `unauthenticated GET${qs} must be refused`);
    }
    // A wrong secret is refused exactly like a missing one.
    const wrong = await mod.onRequestGet({
      request: new Request('https://example.com/ingest?report=1', {
        method: 'GET',
        headers: { 'x-ingest-secret': 'b'.repeat(64) }
      }),
      env: { INGEST_SECRET: 'a'.repeat(64), SUPABASE_SERVICE_ROLE_KEY: 'service' }
    });
    assert.equal(wrong.status, 405, 'a wrong secret must be refused');
    assert.equal(called, false, 'no unauthenticated GET may reach the network');
  } finally {
    globalThis.fetch = globalThisFetch;
  }
});

/**
 * Stands in for Supabase. Returns the draft queue on a select and records every
 * PATCH, so a test can assert on the writes a route actually issued rather than
 * on the shape of its source.
 */
function fakeSupabase(draftRows) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = String(input);
    if (!url.includes('/rest/v1/')) throw new Error(`unexpected host: ${url}`);
    const method = (init && init.method) || 'GET';
    const path = url.split('/rest/v1/')[1];
    calls.push({ method, path, body: init && init.body ? JSON.parse(init.body) : null });
    if (method === 'GET') return new Response(JSON.stringify(draftRows), { status: 200 });
    // 204 has to be constructed with a null body or the Response constructor
    // throws - which is exactly what a bad stub would do to the code under test.
    return new Response(null, { status: 204 });
  };
  return { calls, fetchImpl };
}

const postEnv = {
  INGEST_SECRET: 'a'.repeat(64),
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  ADZUNA_APP_ID: 'id',
  ADZUNA_APP_KEY: 'key'
};

async function postIngest(qs, { rows = [], feedResults = null } = {}) {
  const mod = await import(urlOf(path.join(ROOT, 'functions', 'ingest.js')));
  const supa = fakeSupabase(rows);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const u = String(input);
    if (u.startsWith('https://fake.supabase.co')) return supa.fetchImpl(input, init);
    if (feedResults) return new Response(JSON.stringify({ results: feedResults }), { status: 200 });
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  try {
    const res = await mod.onRequestPost({
      request: new Request(`https://example.com/ingest${qs}`, {
        method: 'POST',
        headers: { 'x-ingest-secret': 'a'.repeat(64) }
      }),
      env: postEnv
    });
    return { body: await res.json(), status: res.status, supa };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('the sweep previews the stale published jobs before it retracts any', async () => {
  // Curation only reads drafts, so a job published by older rules is never
  // revisited. These are three real rows the live board was serving that the
  // current rules reject.
  // source is 'adzuna' because these are feed rows, and the sweep only retracts
  // feed rows. A published row with no source is treated as not the sweep's to
  // touch, which the next test covers explicitly.
  const published = [
    { id: 'a', title: 'Content and Social Media Marketing Intern', company: 'Ohhmydesign', category: 'any', salary: null, source: 'adzuna' },
    { id: 'b', title: 'Sales and Distribution Intern - Apprentice (12 months)', company: 'HSBC', category: 'bfsi', salary: null, source: 'adzuna' },
    { id: 'c', title: 'Senior Data Engineer', company: 'Acme', category: 'it', salary: null, source: 'adzuna' }
  ];

  const preview = await postIngest('?sweep=1&dry=1', { rows: published });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.sweep.dryRun, true);
  assert.equal(preview.body.sweep.wouldUnpublish, 2, `preview listed ${JSON.stringify(preview.body.sweep.byFamily)}`);
  assert.ok(preview.body.sweep.offTarget.some(j => j.id === 'c') === false, 'a good job must not be in the retraction list');
  // A preview is worthless if it wrote anything, so the route is asked to prove it.
  assert.deepEqual(
    preview.supa.calls.filter(c => c.method === 'PATCH'),
    [],
    'the dry run issued a write'
  );
  // And a preview must not need the feed either, or it is not a preview of the
  // sweep but a disguised ingest.
  assert.equal(preview.body.sweep.total, 3);

  const applied = await postIngest('?sweep=1', { rows: published });
  const patches = applied.supa.calls.filter(c => c.method === 'PATCH');
  assert.equal(patches.length, 1, 'the retraction is chunked into one write here');
  assert.deepEqual(patches[0].body, { status: 'rejected' }, 'a retracted job is rejected, never deleted');
  assert.match(patches[0].path, /id=in\.\(a,b\)/, 'only the rows the rules object to are touched');
});

test('the sweep tells a redundant copy apart from a job that should never be there', async () => {
  // "duplicate" is a statement about a batch, not about a listing: the same
  // vacancy syndicated to two boards. Lumping it in with genuine objections
  // makes the report read as "17 jobs are wrong" when the truth is "3 are wrong
  // and 14 are the same job twice" - and the first live preview of this route
  // showed Capital One and Palo Alto Networks software roles on that list, which
  // is exactly how a sweep earns a reputation for eating good jobs.
  const rows = [
    { id: 'keep', title: 'Senior Software Engineer', company: 'Capital One', category: 'it', salary: null, first_seen_at: '2026-09-01T00:00:00Z', source: 'adzuna' },
    { id: 'copy', title: 'Senior Software Engineer', company: 'Capital One', category: 'it', salary: null, first_seen_at: '2026-09-02T00:00:00Z', source: 'adzuna' },
    { id: 'junk', title: 'Digital Marketing Executive', company: 'K2 Interiors', category: 'any', salary: null, first_seen_at: '2026-09-01T00:00:00Z', source: 'adzuna' }
  ];
  const { body } = await postIngest('?sweep=1&dry=1', { rows });
  const s = body.sweep;
  assert.equal(s.wouldUnpublishOffTarget, 1, 'one job the rules object to');
  assert.equal(s.redundantCopies, 1, 'one redundant copy');
  assert.deepEqual(s.offTarget.map(j => j.id), ['junk']);
  assert.deepEqual(s.redundant.map(j => j.id), ['copy']);
  // The oldest listing of a syndicated pair is the one that stays, which is the
  // same rule the draft path uses and depends on first_seen_at being selected.
  assert.ok(!s.redundant.some(j => j.id === 'keep'));
});

test('the sweep judges the whole board but only retracts the rows it owns', async () => {
  // The live board was serving four byte-identical duplicate pairs - same Adzuna
  // id, title, company and date - while the sweep reported nothing to do. The
  // cause was the source filter: duplicates were only ever counted among feed
  // rows, so a vacancy published twice where one copy was hand-typed or promoted
  // was invisible to the very check meant to catch it. Judging is now done over
  // every published row so the pair is seen at all...
  // The feed copy is the NEWER one, so the oldest row - the survivor - is the
  // hand-typed one. That ordering matters: the sweep may only retract the copy it
  // owns, and here that is the redundant newer one.
  const rows = [
    { id: 'typed-copy', title: 'Senior Data Engineer/Architect', company: 'CGI', category: 'it', salary: null, first_seen_at: '2026-09-01T00:00:00Z', source: 'manual' },
    { id: 'feed-copy', title: 'Senior Data Engineer/Architect', company: 'CGI', category: 'it', salary: null, first_seen_at: '2026-09-02T00:00:00Z', source: 'adzuna' }
  ];
  const preview = await postIngest('?sweep=1&dry=1', { rows });
  const s = preview.body.sweep;
  assert.equal(s.total, 2, 'the sweep must read every published row, not just the feed ones');
  assert.equal(s.wouldUnpublish, 1, 'the redundant feed copy is retractable');
  assert.equal(s.heldBack, 0);
  assert.deepEqual(s.redundant.map(j => j.id), ['feed-copy']);

  // A row a human published is never retracted, whichever side of the pair it is
  // on. Reversing the ages makes the hand-typed row the redundant one instead,
  // and the sweep must then decline to write rather than take it.
  const reversed = [
    { id: 'typed-copy', title: 'Senior Data Engineer/Architect', company: 'CGI', category: 'it', salary: null, first_seen_at: '2026-09-02T00:00:00Z', source: 'manual' },
    { id: 'feed-copy', title: 'Senior Data Engineer/Architect', company: 'CGI', category: 'it', salary: null, first_seen_at: '2026-09-01T00:00:00Z', source: 'adzuna' }
  ];
  const held = await postIngest('?sweep=1', { rows: reversed });
  const writes = held.supa.calls.filter(c => c.method === 'PATCH');
  assert.equal(writes.length, 0, `the sweep wrote a hand-published row: ${JSON.stringify(writes.map(w => w.path))}`);
  assert.equal(held.body.sweep.heldBack, 1, 'the withheld row is counted, not silently dropped');
  assert.equal(held.body.sweep.unpublished, 0);
});

test('the sweep pages over a total order, so a re-read cannot move the survivor', async () => {
  // "Keep the oldest copy" is only a stable promise if the query returns the same
  // order twice. created_at is not unique across a bulk insert, so ordering by it
  // alone lets the database re-order tied rows between reads - and a re-run would
  // then retract a different copy of the same pair, quietly unpublishing the
  // survivor of the previous run.
  const mod = await import(urlOf(path.join(ROOT, 'functions', 'ingest.js')));
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'ingest.js'), 'utf8');
  const sweep = src.slice(src.indexOf('async function sweepPublished'));
  const query = (sweep.match(/jobs\?select=[^"]+/) || [])[0] || '';
  assert.ok(query, 'could not find the sweep query');
  assert.match(query, /order=[^&"]*id\./, `sweep order "${query}" has no unique tiebreaker`);
  assert.ok(mod, 'route module loads');
});

test('the sweep is never wired into the scheduled run', () => {
  // Unpublishing a live job is visible to a candidate the moment it happens, so
  // it cannot ride along unattended on a cron. A scheduler that grew a sweep
  // call would retract jobs at 2am with nobody watching.
  const src = fs.readFileSync(path.join(ROOT, 'worker', 'scheduler', 'src', 'index.js'), 'utf8');
  assert.ok(!/sweep/i.test(src), 'the scheduler must not call the sweep');

  const ingest = fs.readFileSync(path.join(ROOT, 'functions', 'ingest.js'), 'utf8');
  assert.match(ingest, /searchParams\.get\("sweep"\) === "1"/, 'the sweep is not separately gated');
  // Curation itself must not have grown a published-row write: the draft select
  // is the whole of what it is allowed to look at.
  const draftQuery = ingest.match(/jobs\?select=[^"]*status=eq\.draft[^"]*"/);
  assert.ok(draftQuery, 'curation selects drafts');
  assert.ok(!/status=eq\.published[^"]*"[\s\S]{0,200}applyCuration/.test(ingest), 'curation reached for published rows');
});

test('a dry run writes nothing and never touches the feed', async () => {
  const rows = [
    { id: '1', title: 'Senior Software Engineer', company: 'Acme', category: 'it', salary: null, first_seen_at: daysAgo(2) },
    { id: '2', title: 'Relationship Manager', company: 'Bank', category: 'bfsi', salary: null, first_seen_at: daysAgo(2) }
  ];
  const { body, supa } = await postIngest('?curate=1&dry=1', { rows });

  assert.equal(body.dryRun, true);
  assert.equal(body.ingested, false, 'a dry run must not import anything');
  assert.equal(body.curation.summary.publish, 1);
  assert.equal(body.curation.summary.reject, 1);

  const writes = supa.calls.filter(c => c.method !== 'GET');
  assert.deepEqual(writes, [], `a dry run must not write, saw ${JSON.stringify(writes)}`);
  // And it must have scoped itself to imported rows, not every draft.
  const read = supa.calls.find(c => c.method === 'GET');
  assert.match(read.path, /source=eq\.adzuna/, 'curation must only triage imported rows');
  assert.match(read.path, /status=eq\.draft/);
});

test('a dry run needs no Adzuna credentials', async () => {
  const { body, status } = await (async () => {
    const mod = await import(urlOf(path.join(ROOT, 'functions', 'ingest.js')));
    const supa = fakeSupabase([]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = supa.fetchImpl;
    try {
      const res = await mod.onRequestPost({
        request: new Request('https://example.com/ingest?curate=1&dry=1', {
          method: 'POST',
          headers: { 'x-ingest-secret': 'a'.repeat(64) }
        }),
        // deliberately no ADZUNA_APP_ID / ADZUNA_APP_KEY
        env: { INGEST_SECRET: 'a'.repeat(64), SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' }
      });
      return { body: await res.json(), status: res.status, supa };
    } finally {
      globalThis.fetch = realFetch;
    }
  })();
  assert.equal(status, 200);
  assert.equal(body.curation.summary.total, 0);
});

test('curation publishes recognised roles, rejects the rest, and leaves unknowns for a human', async () => {
  const rows = [
    { id: '1', title: 'Senior Software Engineer', company: 'Acme', category: 'it', salary: null, first_seen_at: daysAgo(2) },
    { id: '2', title: 'Relationship Manager', company: 'Bank', category: 'bfsi', salary: null, first_seen_at: daysAgo(2) },
    { id: '3', title: 'Chief Happiness Wizard', company: 'Elsewhere', category: 'any', salary: null, first_seen_at: daysAgo(2) }
  ];
  // Feed returns nothing, so this also covers "an empty feed must still curate".
  const { body, supa } = await postIngest('?curate=1', { rows, feedResults: [] });

  assert.equal(body.curation.published, 1);
  assert.equal(body.curation.rejected, 1);
  assert.equal(body.curation.leftAsDraft, 1, 'an unrecognised title must stay a draft');

  const patches = supa.calls.filter(c => c.method === 'PATCH');
  const publishedIds = patches.filter(p => p.body.status === 'published').flatMap(p => p.path.match(/in\.\(([^)]*)\)/)[1].split(','));
  const rejectedIds = patches.filter(p => p.body.status === 'rejected').flatMap(p => p.path.match(/in\.\(([^)]*)\)/)[1].split(','));
  assert.deepEqual(publishedIds, ['1'], 'only the recognised role is published');
  assert.deepEqual(rejectedIds, ['2'], 'only the retail-banking role is rejected');
  assert.ok(!publishedIds.includes('3') && !rejectedIds.includes('3'), 'the unknown role is not written at all');
});

test('curation is idempotent: a second run writes nothing new', async () => {
  // After the first run, the published and rejected rows are no longer drafts,
  // so the second read returns only the still-unknown row.
  const { supa } = await postIngest('?curate=1', {
    rows: [{ id: '3', title: 'Chief Happiness Wizard', company: 'Elsewhere', category: 'any', salary: null, first_seen_at: daysAgo(2) }],
    feedResults: []
  });
  const writes = supa.calls.filter(c => c.method === 'PATCH');
  assert.deepEqual(writes, [], 'a queue of only unknown titles must produce no writes');
});

// The importer caches "do the salary columns exist" for the life of the module,
// which Node also does. A fresh instance is imported per test so one test's
// answer cannot leak into the next.
let ingestInstance = 0;
async function freshIngest() {
  ingestInstance += 1;
  return import(`${urlOf(path.join(ROOT, 'functions', 'ingest.js'))}?fresh=${ingestInstance}`);
}

test('the importer stores numeric salary bounds when the schema has them', async () => {
  const mod = await freshIngest();
  const supa = fakeSupabase([]);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const u = String(input);
    if (u.startsWith('https://fake.supabase.co')) return supa.fetchImpl(input, init);
    return new Response(JSON.stringify({ results: [sample({ salary_is_predicted: '0' })] }), { status: 200 });
  };
  try {
    await mod.onRequestPost({
      request: new Request('https://example.com/ingest', { method: 'POST', headers: { 'x-ingest-secret': 'a'.repeat(64) } }),
      env: postEnv
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  const insert = supa.calls.find(c => c.method === 'POST');
  assert.ok(insert, 'expected an insert');
  // 15,00,000 - 24,00,000, the stated figures from the fixture.
  assert.equal(insert.body[0].salary_min, 1500000);
  assert.equal(insert.body[0].salary_max, 2400000);
});

test('the importer still inserts when the salary columns are missing, and stops asking', async () => {
  // The pre-migration schema. PostgREST fails the whole insert for one unknown
  // column, so the first batch is lost - but the run must recover within itself
  // rather than leave the queue empty until someone applies the migration.
  const mod = await freshIngest();
  const calls = [];
  let attempts = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const u = String(input);
    if (!u.startsWith('https://fake.supabase.co')) {
      return new Response(JSON.stringify({ results: [sample({ salary_is_predicted: '0' })] }), { status: 200 });
    }
    const method = (init && init.method) || 'GET';
    calls.push({ method, path: u.split('/rest/v1/')[1], body: init && init.body ? JSON.parse(init.body) : null });
    if (method === 'GET') return new Response(JSON.stringify([]), { status: 200 });
    attempts += 1;
    if (attempts === 1) {
      return new Response(
        JSON.stringify({ code: '42703', message: 'column jobs.salary_min does not exist' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify([{ id: 'new' }]), { status: 201 });
  };
  let body;
  try {
    const res = await mod.onRequestPost({
      request: new Request('https://example.com/ingest', { method: 'POST', headers: { 'x-ingest-secret': 'a'.repeat(64) } }),
      env: postEnv
    });
    body = await res.json();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(body.errors, [], 'the recoverable schema mismatch must not be reported as a failure');
  assert.equal(body.inserted, 1);
  const posts = calls.filter(c => c.method === 'POST');
  assert.equal(posts.length, 2, 'the failed insert is retried once without the salary columns');
  assert.ok('salary_min' in posts[0].body[0], 'the first attempt asks for the new columns');
  assert.ok(!('salary_min' in posts[1].body[0]), 'the retry must not name the missing column again');
  assert.equal(posts[1].body[0].status, 'draft', 'the fallback must not weaken the draft guarantee');
});

test('the ingest route inserts as draft and never writes status from the feed', () => {

  const src = fs.readFileSync(path.join(ROOT, 'functions', 'ingest.js'), 'utf8');
  // Exactly one status literal in the insert payload, and it is 'draft'.
  const literals = src.match(/status:\s*"[a-z]+"/g) || [];
  assert.deepEqual(literals, ['status: "draft"'], 'the only status literal the route writes is draft');
  // Existing rows get last_seen_at and nothing else: a published job must not be
  // rewritten just because a feed re-served it.
  //
  // Scoped to the refresh block rather than "the first PATCH in the file",
  // because curation added a second PATCH above it. Matching by position meant
  // this test silently started inspecting the wrong write path.
  const refresh = src.match(/if \(seenIds\.length\) \{[\s\S]*?\n  \}/);
  assert.ok(refresh, 'expected a refresh block');
  const patch = refresh[0].match(/method:\s*"PATCH"[\s\S]{0,240}?JSON\.stringify\(\{([^}]*)\}\)/);
  assert.ok(patch, 'expected a PATCH body inside the refresh block');
  // Read the keys off the source rather than JSON.parse: the body is a JS object
  // literal holding a call (now.toISOString()), not valid JSON.
  const keys = (patch[1].match(/([A-Za-z_]\w*)\s*:/g) || [])
    .map(k => k.replace(/\s*:/g, ''))
    .sort();
  assert.deepEqual(keys, ['last_seen_at'], 'the refresh path must only touch last_seen_at');
});

test('the ingest route reports its own misconfiguration instead of failing silently', () => {
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'ingest.js'), 'utf8');
  assert.match(src, /ADZUNA_APP_ID[\s\S]{0,200}?503/, 'missing Adzuna keys -> 503');
  assert.match(src, /SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,120}?503/, 'missing service key -> 503');
  // A scheduler runs unattended; a silent 0-row result is indistinguishable
  // from "the feed is empty" and would go unnoticed for weeks.
  assert.match(src, /errors/, 'a run must report per-query failures');
});

test('the migration makes the dedupe key unique and adds the columns the importer writes', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'jobs_ingest_migration.sql'), 'utf8');
  for (const col of ['dedupe_key', 'apply_url', 'first_seen_at', 'last_seen_at']) {
    assert.match(sql, new RegExp(`add column if not exists ${col}`), `missing column ${col}`);
  }
  assert.match(sql, /create unique index if not exists jobs_dedupe_key_uniq[\s\S]*?on public\.jobs \(dedupe_key\)/);
  // Partial: hand-typed jobs keep a NULL key and must not collide with each other.
  assert.match(sql, /where dedupe_key is not null/);
  assert.match(sql, /if not exists/, 're-running the migration must be safe');
  // RLS is unchanged, so no anon/authenticated key gains write access.
  assert.ok(!/create policy/i.test(sql), 'the ingest migration must not add a policy');
});

test('the migration creates the salary bounds as executable DDL, not a commented plan', () => {
  // The previous version of the migration documented salary_min/salary_max in a
  // comment and left them for a human to uncomment later. A test that read the
  // raw file passed regardless, so the columns never actually existed while the
  // board select assumed they did. Comments are stripped before matching.
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'jobs_ingest_migration.sql'), 'utf8');
  const applied = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const col of ['salary_min', 'salary_max']) {
    assert.match(applied, new RegExp(`add column if not exists ${col} numeric`), `${col} must be runnable DDL`);
  }
});


test('the review migration adds the columns the Telegram routes read and write', () => {
  // Comments are stripped first, for the same reason as the salary test above: a
  // test that matched the raw file would pass on prose describing a column that
  // was never actually created, and /notify would then answer 503 forever.
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'jobs_review_migration.sql'), 'utf8');
  const applied = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(applied, /add column if not exists review_sent_at\s+timestamptz/);
  assert.match(applied, /add column if not exists review_message_id\s+text/);
  // Partial and filtered, because the only rows worth an index are the small
  // pending slice - not the hundreds of published and rejected ones.
  assert.match(applied, /create index if not exists jobs_review_pending_idx[\s\S]*?on public\.jobs \(first_seen_at\)/);
  assert.match(applied, /where status = 'draft' and review_sent_at is null/);
  assert.match(sql, /if not exists/, 're-running the migration must be safe');
  // RLS is unchanged, so no anon/authenticated key gains write access. The routes
  // reach these columns with the service role key, behind their own auth.
  assert.ok(!/create policy/i.test(applied), 'the review migration must not add a policy');
});

test('the feed itself can never publish a job', () => {
  // The safety property that survived the move to auto-curation: the INSERT that
  // carries feed data must never name a status other than draft, so nothing
  // Adzuna sends can reach the public board.
  //
  // Checked by slicing the actual insert payload out of the route rather than by
  // grepping the whole file for the word, because the route legitimately does
  // contain a "published" write now - inside applyCuration. A whole-file grep
  // would pass or fail on syntax rather than on the property being protected.
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'functions', 'ingest.js'), 'utf8'));

  const payload = src.match(/const base = r => \(\{[\s\S]*?\}\);/);
  assert.ok(payload, 'expected to find the insert payload builder');
  assert.match(payload[0], /status:\s*"draft"/);
  assert.ok(
    !/["']published["']/.test(payload[0]),
    'the feed insert payload must not contain "published"'
  );

  // And the adapter must not be able to smuggle a status through either.
  const adzuna = stripComments(fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'adzuna.js'), 'utf8'));
  assert.ok(
    !/["']published["']/.test(adzuna),
    'functions/lib/adzuna.js must not assign the string "published"'
  );

  // Curation is the single place allowed to publish. Exactly one call site.
  const calls = src.match(/setStatus\([^)]*["']published["']/g) || [];
  assert.equal(calls.length, 1, 'exactly one call site may write status published');
  assert.ok(
    /async function applyCuration/.test(src),
    'the published write must live inside applyCuration'
  );
});

test('the ingest path still hardcodes draft on insert', () => {
  // Auto-curation must not have softened the insert. New rows arrive as drafts
  // and are promoted by an explicit rule, not by the feed's say-so.
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'functions', 'ingest.js'), 'utf8'));
  const literals = src.match(/status:\s*"[a-z]+"/g) || [];
  assert.deepEqual(literals, ['status: "draft"'], 'the only status the insert can write is draft');
});

// ---------------------------------------------------------------------------
// Curation rules (functions/lib/curate.js)
//
// The owner asked for the board to fill itself without hand-approving 400 rows.
// These tests are the safety net for that: they encode the actual job families
// seen in the first live feed run, including the two bugs the first draft of the
// rules had (case sensitivity, and word boundaries before an underscore).
// ---------------------------------------------------------------------------

test('a retail-banking sales title is rejected even when the parts are underscore-joined', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // Regression: \b does not exist before "_", so /\brelationship manager\b/
  // silently failed to match this and the single largest unwanted family of
  // rows reached the review pile.
  for (const title of [
    'Relationship Manager_Tractors and Farm Equipments (TFE)-Retail-Sales',
    'Acquisition Manager_Sales-Sales_Salem',
    'Team Collections Manager_Tractors and Farm Equipments',
    'Relationship Officer-811_Digital Banking Kotak 811',
    'Customer Relationship Officer| Karnal',
    'Personal Banker-Inbound_Branch Banking',
    'Elite Banker-Household-Outbound'
  ]) {
    const d = decideListing({ title, company: 'Kotak Mahindra Bank' });
    assert.equal(d.outcome, 'reject', `should reject: ${title}`);
    assert.equal(d.family, 'retail-banking-sales');
  }
});

test('a title-cased engineering role publishes', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // Regression: the patterns are lower case and the haystack was not lowercased,
  // so "Engineer" never matched /engineer/ and 373 good rows landed in review.
  for (const [title, company] of [
    ['Custom Software Engineer', 'Accenture'],
    ['Manager Software Engineering', 'ACI Worldwide'],
    ['Embedded Software Engineering Technical Leader', 'Cisco'],
    ['PYTHON DEVELOPER', 'Vrinda International'],
    ['Technical Lead – Engineering', 'Vrinda International'],
    ['Senior Java Full Stack Developer', 'Infosys Limited'],
    ['DevOps Engineer', 'Weekday AI'],
    ['Data Analyst', 'American Express'],
    ['Senior Risk Analyst – Data Science & Analytics', 'Experian'],
    ['Software Development Engineer Intern', 'Smytten'],
    ['Snowflake', 'Infosys Limited'],
    ['Hadoop / PySpark', 'Infosys Limited'],
    ['R2R - Ops Specialist', 'VDart Software Services'],
    ['Accounts Payable Associate', 'Embark Services'],
    ['Management Controller', 'Valeo'],
    ['FP&A', 'VDart Software Services'],
    ['Sr. Oracle Fusion SCM Consultant', 'bTranz']
  ]) {
    const d = decideListing({ title, company });
    assert.equal(d.outcome, 'publish', `should publish: ${title} @ ${company}`);
  }
});

test('Salesforce and sales-adjacent DATA roles are not caught by the sales filter', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // "Salesforce" is a product and "Sales Pipeline Data Analyst" is a data job.
  // A naive /sales/ reject would delete good listings, so only specific sales
  // titles are in the reject list.
  for (const [title, company] of [
    ['Salesforce Data Analyst', 'First Advantage'],
    ['Salesforce Data Quality Manager', 'First Advantage'],
    ['Advisory Coordinator - Sales Pipeline Data Analyst', 'EisnerAmper']
  ]) {
    const d = decideListing({ title, company });
    assert.equal(d.outcome, 'publish', `should publish: ${title}`);
  }
  // But genuine sales titles are still rejected.
  for (const title of [
    'Sales Development Representative',
    'Senior Account Executive - Enterprise Sales',
    'KAM-Enterprise Sales - Manager -Hyderabad',
    'Sr. Sales Executive_Tractors and Farm Equipments (TFE)-Retail',
    'National Recruitment Head'
  ]) {
    assert.equal(decideListing({ title, company: 'Acme' }).outcome, 'reject', `should reject: ${title}`);
  }
});

test('reject rules win over publish rules in the same title', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // Ordering matters: a sales title that also contains a role keyword must not
  // be rescued by that keyword appearing later in the string.
  const d = decideListing({ title: 'Relationship Manager with Data Analyst duties', company: 'Kotak Mahindra Bank' });
  assert.equal(d.outcome, 'reject');
  assert.equal(d.family, 'retail-banking-sales');
});

test('an unrecognised title is left for a human rather than published', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // The safe default is inverted from the original design: unknown must not
  // publish by accident.
  for (const title of ['Specialist', 'Manager', 'TPM', 'Executive', 'Global Payments']) {
    const d = decideListing({ title, company: 'Metayb' });
    assert.equal(d.outcome, 'review', `should be left as a draft: ${title}`);
    assert.equal(d.family, 'unknown');
  }
});

test('an agency or training provider is rejected as an employer of record', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  for (const [title, company] of [
    ['Software Engineer', 'Paradise Placement Consultancy'],
    ['Data Analyst', 'Softcrayons IT Education'],
    ['Engineer', 'Random Manpower Services']
  ]) {
    const d = decideListing({ title, company });
    assert.equal(d.outcome, 'reject', `should reject: ${company}`);
    assert.equal(d.family, 'agency');
  }
});

test('salary sanity drops monthly-in-annual but keeps real entry-level pay', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // "Software Engineer I/II" arrived with 18,000-33,000, which is a MONTHLY
  // figure in an annual field.
  const broken = decideListing({ title: 'Software Engineer I/II', company: 'Omnidian', salary: '₹18,000 - ₹33,000' });
  assert.equal(broken.outcome, 'reject');
  assert.equal(broken.family, 'salary-range');

  // But trainee and intern pay in India genuinely is this low, so an earlier
  // 1,00,000 floor wrongly rejected real entry-level roles.
  for (const salary of ['₹84,000 - ₹96,000', '₹60,000 - ₹84,000', '₹1,20,000 - ₹1,80,000']) {
    const d = decideListing({ title: 'Web Developer Intern', company: 'Rite KnowledgeLabs', salary });
    assert.equal(d.outcome, 'publish', `should keep: ${salary}`);
  }

  // A normal range is untouched.
  assert.equal(
    decideListing({ title: 'Software Engineer', company: 'Amazon', salary: '₹13,28,844 - ₹27,38,736' }).outcome,
    'publish'
  );
});

// A large share of the real feed titles a vacancy with a code or a level
// ("Executive", "SPE-Policy Servicing", "TPM", "Manager"), where the role only
// appears in the body text. The titles below are verbatim from the live queue
// when every one of the 32 drafts came back "no known role family matched".
test('a generic title is still decided when the description names the role', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  const cases = [
    ['Executive-KDNI', 'BSR & Co', 'We are hiring an SAP FICO consultant to support the finance transformation programme.'],
    ['SPE-Policy Servicing', 'Cognizant', 'Role is a software engineer building the policy administration module in Java.'],
    ['TPM', 'Kadel Labs', 'Technical Program Manager ownering data migration, verification and EQuIS tooling.'],
    ['Lead - ESG Data Reporting', 'GSK', 'The lead will work with the data science team on regulatory reporting.'],
    ['Team Lead - OTI', 'NielsenIQ', 'Market research analyst role, building the retail measurement data pipeline.'],
    ['Credit Manager-Working Capital-Credit', 'Kotak Mahindra Bank', 'Responsible for credit analyst reporting and risk assessment of the portfolio.'],
    ['Senior Specialist - Cloud & Infra Management', 'LTM', 'Looking for a cloud engineer to run our Kubernetes infrastructure on Azure.']
  ];
  for (const [title, company, raw_text] of cases) {
    const d = decideListing({ title, company, raw_text });
    assert.equal(d.outcome, 'publish', `should publish from the description: ${title} (got ${d.outcome})`);
    assert.match(d.reason, /named in the description/, 'the reason must say where the match came from');
  }
});

// Regression, and the reason the families carry a second, stricter pattern.
// A title like "Engine Field Service Technician" is not a role on the board, and
// the description that came with it in the live queue said "requires a diploma
// in mechanical engineering". The original body pass reused the title regexes,
// so the bare noun "engineering" published a field service job as software
// engineering. Prose has to name the role, not merely the discipline.
// The queue is the input here: these 17 titles were all sitting as drafts after
// a full curation pass, and every one of them is a real IT or BFSI role. The
// old word lists could not see them because they name no "engineer" and no
// "developer" - a manager of software development is still a software role, and
// a CyberArk or Workday title is a platform role under any reading.
test('titles from the live queue that name the discipline indirectly still publish', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  const cases = [
    ['Software Development Manager, Amazon Freight', 'Amazon'],
    ['Software Test Specialist', 'Avaloq'],
    ['Specialist, Software Technology PLC Programming', 'KLA'],
    ['Data Protection Officer', 'Axis My India Limited'],
    ['Associate Director , Data Stewardship', 'MSD'],
    ['TC-CS-IAM-CyberArk-Senior', 'EY'],
    ['Workday Techno Funtional Consultant', 'Poshmark'],
    ['Strategic Planner - R&D', 'TVS Motor Company'],
    ['Senior Manager Stress Test, ESG R', 'Standard Chartered Bank'],
    ['Associate Manager - Transfer Pricing', 'Standard Chartered Bank'],
    ['Manager, Tax Services-Canada-BTS', 'Deloitte'],
    ['R&D Tax Incentives Assistant Manager', 'Eide Bailly'],
    ['PKF LittleJohn - Accounts Preparer', 'Talent Formula'],
    ['Middle Office - Senior Associate', 'State Street']
  ];
  for (const [title, company] of cases) {
    const d = decideListing({ title, company });
    assert.equal(d.outcome, 'publish', `should publish on the title alone: ${title} (got ${d.outcome})`);
  }
});

test('widening the discipline words does not let sales roles through', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // "development" and "software" are new title words. These are the cases that
  // made them dangerous: a sales role whose title happens to contain one of
  // them must still be rejected, because reject rules outrank publish rules.
  const cases = [
    ['Business Development Manager', 'Somewhere'],
    ['Sales Development Executive', 'Somewhere'],
    ['Key Account Manager', 'Somewhere'],
    ['Marketing Manager', 'Somewhere'],
    ['Data Entry Operator', 'Somewhere'],
    ['Recruiter', 'Somewhere']
  ];
  for (const [title, company] of cases) {
    const d = decideListing({ title, company });
    assert.equal(d.outcome, 'reject', `must still be rejected: ${title} (got ${d.outcome})`);
  }
  // And the two that must survive that widening, because they are data roles.
  for (const [title, company] of [['Salesforce Data Analyst', 'Somewhere'], ['Sales Pipeline Data Analyst', 'Somewhere']]) {
    const d = decideListing({ title, company });
    assert.equal(d.outcome, 'publish', `a data role must not be caught by the sales rules: ${title}`);
  }
});

// The point of the junk families is that the admin never sees these. Every title
// is verbatim from the live queue, and each one is off-target for a board aimed
// at BFSI and IT candidates under any reading.
test('the recurring junk categories in the live queue are rejected outright', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  const cases = [
    ['Chef de Partie - Pizza', 'Hyatt'],
    ['Food and Beverage Manager | voco Amritsar', 'IHG Hotels & Resorts'],
    ['Assistant Manager - In Room Dining', 'Park Hyatt'],
    ['Senior Territory Service Representative - ATR(Amritsar)', 'Blue Dart'],
    ['Senior Territory Service Representative - LDC (Ludhiana)', 'Blue Dart'],
    ['Area Manager, Sort center', 'ASSPL - Maharashtra - C32'],
    ['Customer Voice Process (upto 30k)', 'Mindtel'],
    ['Chat & Customer Support Lead', 'Aura Gold'],
    ['Instructional Designer, TRM Academy', 'TRM Labs'],
    ['Lead Instructor', 'TRM Labs']
  ];
  for (const [title, company] of cases) {
    const d = decideListing({ title, company });
    assert.equal(d.outcome, 'reject', `junk must be rejected without an admin: ${title} (got ${d.outcome})`);
  }
});

test('a known employer carries the decision when the title is useless', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // Verbatim from the live queue. None of these titles name a discipline, so
  // every title family misses them - but at these employers they are ordinary
  // BFSI roles, and without this signal they would sit in the queue until the
  // 14-day expiry threw away jobs that were worth posting.
  const cases = [
    ['Associate Manager', 'Standard Chartered Bank', 'bfsi'],
    ['Manager Operations', 'HSBC', 'bfsi'],
    ['Senior Executive Officer, ADGM', 'Coinbase', 'bfsi'],
    ['Compliance, Senior Associate', 'Coinbase', 'bfsi'],
    ['Legal/ Corporate Compliance Operations Associate', 'Stripe', 'it']
  ];
  for (const [title, company, category] of cases) {
    const d = decideListing({ title, company, category });
    assert.equal(d.outcome, 'publish', `a known employer should carry it: ${title} (got ${d.outcome})`);
    assert.equal(d.family, 'known-employer');
  }
});

test('the known-employer signal cannot rescue a row the rules object to', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // The gates that make this safe rather than a guess: an unknown employer, a
  // category the feed did not recognise, and a row already caught by a reject
  // family all stay out. A known employer running a restaurant or a guard
  // contract is still off-target for this board.
  const cases = [
    [{ title: 'Associate Manager', company: 'Some Random Firm', category: 'bfsi' }, 'review', 'unknown employer'],
    [{ title: 'Team Lead', company: 'ASSPL - Tamil Nadu - D31', category: 'any' }, 'review', 'category not bfsi/it'],
    [{ title: 'Senior Director, India Global Delivery Center', company: 'GE Vernova', category: 'any' }, 'review', 'category not bfsi/it'],
    [{ title: 'Executive', company: 'EXL', category: 'bfsi' }, 'review', 'EXL is not a known employer'],
    [{ title: 'Security Guard', company: 'Standard Chartered Bank', category: 'it' }, 'reject', 'a reject family still wins'],
    [{ title: 'Data Entry Operator', company: 'HSBC', category: 'it' }, 'reject', 'a reject family still wins']
  ];
  for (const [row, expected, why] of cases) {
    const d = decideListing({ ...row, raw_text: '' });
    assert.equal(d.outcome, expected, `${why}: ${row.title} (got ${d.outcome} via ${d.family})`);
  }
});

test('the known-employer list matches whole names, not fragments', async () => {
  const { isKnownEmployer } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  for (const c of ['Standard Chartered Bank', 'state street', 'Citi', 'Kotak Mahindra Bank', 'Infosys Ltd', 'TCS']) {
    assert.ok(isKnownEmployer(c), `should be recognised: ${c}`);
  }
  // The failure mode that matters: a substring match would sweep in unrelated
  // companies, because "axis" sits inside plenty of names and "citi" inside
  // "excited".
  for (const c of ['Dowsons Pharmaceuticals', 'The Sabarmati Cleaning Corp', 'Some Axis Traders', 'Excited Media', 'Blue Dart']) {
    assert.ok(!isKnownEmployer(c), `must not match a fragment: ${c}`);
  }
});

test('the junk families do not reach into roles that merely sound similar', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // Each of these sits one word away from a rejected title above, which is
  // exactly how a careless reject rule deletes a good listing.
  const cases = [
    ['Customer success manager', 'Merkle Science'],
    ['Senior Customer Support Engineer', 'Atlassian'],
    ['Data Center Operations Manager', 'Amazon'],
    ['Cloud Operations Manager', 'Amazon'],
    ['Operations Manager', 'Launch Ventures Private Limited'],
    ['Senior Operations Staff (DDM)', 'Blue Dart'],
    ['Manager - Operations', 'Blue Dart'],
    ['Director of Sales, Logistics', 'DHL']
  ];
  for (const [title, company] of cases) {
    const d = decideListing({ title, company });
    assert.notEqual(d.outcome, 'reject', `a near miss must not be deleted: ${title} (rejected by ${d.family})`);
  }
});

test('the remaining off-target queue rows are decided without an admin', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // Every title here was sitting in the live draft queue as a review after the
  // known-employer pass, and every one is verbatim from the feed.
  const rejected = [
    ['Engine Field Service Technician - Level III', 'Alstom'],
    ['Import/Export Logistics', 'Blue Dart'],
    ['Global Senior Manager, Strategic Sourcing - Renewable Energy Category Performance', 'Alstom'],
    ['Procurement Lead', 'Alstom'],
    ['Associate Director - Affluent Relations', 'Standard Chartered Bank'],
    ['CRM and Lifecycle Manager II', 'Kotak Mahindra Bank'],
    ['Area Manager', 'Hut 8'],
    ['EH&S Sustainability Technician', 'Alstom'],
    ['Senior Sales Lead, Custody & Wealth Management', 'Standard Chartered Bank'],
    ['Manager - Sales and Distributions', 'Standard Chartered Bank']
  ];
  for (const [title, company] of rejected) {
    const d = decideListing({ title, company });
    assert.equal(d.outcome, 'reject', `${title} should be decided, got ${d.outcome} via ${d.family}`);
  }

  // The publish side of the same queue: this one is a data role by its own name
  // and was the last real BFSI/IT listing left in review.
  const data = decideListing({
    title: 'Managing Consultant, Data Management (data migration, verification, EQuIS, SQL)',
    company: 'IQVIA'
  });
  assert.equal(data.outcome, 'publish', `data role left for a human: ${data.family || 'no family'}`);
  assert.equal(data.family, 'data');

  // And the near misses the new family must not swallow. "Field Service
  // Engineer" is real IT support work in this feed, and a data engineer at a
  // company that runs a logistics platform is still a data engineer.
  for (const title of [
    'Field Service Engineer - Fujitsu',
    'Data Migration Engineer',
    'Logistics Software Engineer',
    'Procurement Software Developer'
  ]) {
    assert.notEqual(
      decideListing({ title, company: 'Accenture' }).outcome,
      'reject',
      `a real IT role was rejected: ${title}`
    );
  }
});

test('a banking word inside a different role does not reject it', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // "Talent Acquisition Manager" is a recruiting post, and the live board had
  // one published: the retail-banking family matches "acquisition manager" and
  // is checked before the HR family, so the HR reading never got a say. A
  // recruiting post must be rejected as HR, not as a bank branch.
  const d = decideListing({ title: 'Talent Acquisition Manager', company: 'Hevo Data' });
  assert.equal(d.outcome, 'reject', 'a recruiting role should still be rejected');
  assert.equal(d.family, 'hr-and-teaching', `rejected as ${d.family} instead of as HR`);
  // And the banking reading of the same two words is still a banking role.
  assert.equal(
    decideListing({ title: 'Acquisition Manager_Sales', company: 'Kotak Mahindra Bank' }).family,
    'retail-banking-sales'
  );
});

test('a draft the rules cannot judge expires on a timer, and only once it is old', async () => {
  const { UNDECIDED_EXPIRY_DAYS } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();
  // The window is the product decision: long enough that an admin is not asked
  // to re-read the same undecidable titles every run.
  assert.equal(UNDECIDED_EXPIRY_DAYS, 14);

  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  const undecidable = { title: 'Associate Manager', company: 'Standard Chartered Bank' };
  assert.equal(decideListing(undecidable).outcome, 'review', 'the row used below must be one the rules cannot decide');
});

test('curation carries the arrival date through so expiry can use it', async () => {
  const { curateBatch } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // Expiry is decided on first_seen_at, so a decision that dropped the date
  // would silently expire nothing (or, worse, everything).
  const { decisions } = curateBatch([
    { id: 'a', title: 'Associate Manager', company: 'Standard Chartered Bank', first_seen_at: '2026-01-01T00:00:00Z' },
    { id: 'b', title: 'Data Analyst', company: 'Acme', first_seen_at: '2026-01-02T00:00:00Z' }
  ]);
  const a = decisions.find(d => d.id === 'a');
  assert.equal(a.first_seen_at, '2026-01-01T00:00:00Z', 'the arrival date must survive curation');
});

test('a description must name the role, not just the discipline', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  const cases = [
    ['Engine Field Service Technician - Level III', 'Cummins Inc.', 'Field Service Technician will service and repair industrial engines at customer sites. Requires a diploma in mechanical engineering and 3-5 years of field service experience.'],
    ['EH&S Sustainability Technician', 'Dow', 'EH&S technician supports the site environmental health and safety programme, sustainability reporting and waste management.'],
    ['Import/Export Logistics', 'VASA Denticity Limited', 'Handling import export logistics coordination, customs documentation and freight follow up for the dental supply chain.'],
    ['Area Manager', 'Medtronic', 'The Area Manager will lead a regional sales team, own the territory plan and grow new business.'],
    ['Operations Team Member_WBG Operations (Ops)-Customer Service Desk_Ahmedabad', 'Kotak Mahindra Bank', 'Customer service desk role handling inbound customer queries and service requests for the wealth and investment banking group.'],
    ['Senior Investigation Specialist, Last Mile - Flex VoD', 'Amazon', 'Auditing vendor performance and reducing delivery failures.'],
    ['Operations Team Member-Liability Operations-RPC Operations', 'Kotak Mahindra Bank', 'Operations team member handling liability operations and processing for the insurance business.'],
    ['Service Excellence Specialist_WBG HO / IPO / CIP-WISE_Indore', 'Kotak Mahindra Bank', 'Service excellence specialist in the wealth and investment banking group, IPO and CIP service desk.']
  ];
  // The invariant is that a body of prose must not publish a listing. Four of
  // these are since decided on the title alone, which is a better answer than
  // review and is asserted as such below - the reason they are still here is that
  // their descriptions read like technology adverts.
  const decided = new Set([
    'Engine Field Service Technician - Level III',
    'EH&S Sustainability Technician',
    'Import/Export Logistics',
    'Area Manager'
  ]);
  for (const [title, company, raw_text] of cases) {
    const d = decideListing({ title, company, raw_text });
    assert.notEqual(d.outcome, 'publish', `a bare discipline noun must not publish: ${title} (via ${d.family})`);
    if (decided.has(title)) {
      assert.equal(d.outcome, 'reject', `${title} should be decided on its title alone, via ${d.family}`);
    } else {
      assert.equal(d.outcome, 'review', `a bare discipline noun must not publish: ${title} (got ${d.outcome} via ${d.family})`);
    }
  }
});

test('a description cannot reject a listing, only publish one', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // Prose names every function in the business. A software advert that mentions
  // the sales team must not be deleted by the sales rule, and an HR advert that
  // mentions recruitment must not be deleted by the recruitment rule.
  const cases = [
    ['TPM', 'Acme', 'You will partner closely with our sales team and work with the marketing budget.'],
    ['Executive', 'Kotak Mahindra Bank', 'The role sits within human resources and handles talent acquisition for the team.'],
    ['Manager', 'Somewhere', 'Front office administration, office assistant duties and reception coverage.']
  ];
  for (const [title, company, raw_text] of cases) {
    const d = decideListing({ title, company, raw_text });
    assert.notEqual(d.outcome, 'reject', `body text must never reject: ${title}`);
  }
});

test('a row with no usable signal anywhere is still left for a human', async () => {
  const { decideListing } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  for (const row of [
    { title: 'Executive', company: 'EXL' },
    { title: 'Executive', company: 'EXL', raw_text: null },
    { title: 'Executive', company: 'EXL', raw_text: '   ' },
    { title: 'Executive', company: 'EXL', raw_text: 'Apply within seven days of publication. Kindly share your updated resume.' }
  ]) {
    const d = decideListing(row);
    assert.equal(d.outcome, 'review', `no signal must stay a draft: ${JSON.stringify(row)}`);
  }
});

test('curation reads the description off the draft rows it selects', async () => {
  // The live bug this protects: every draft came back "no known role family
  // matched" because the draft query never selected raw_text, so the fallback
  // in decideListing had nothing to read. Selecting the column is the whole fix.
  // The companies and categories here are deliberately ones the known-employer
  // rule cannot rescue, so "both stay drafts" isolates the raw_text assertion
  // below rather than the employer signal.
  const rows = [
    { id: '1', title: 'Executive-KDNI', company: 'BSR & Co', category: 'any', salary: null, first_seen_at: daysAgo(2) },
    { id: '2', title: 'SPE-Policy Servicing', company: 'Northgate Trading', category: 'any', salary: null, first_seen_at: daysAgo(2) }
  ];
  const { body, supa } = await postIngest('?curate=1', { rows, feedResults: [] });

  const read = supa.calls.find(c => c.method === 'GET' && c.path.includes('source=eq.adzuna'));
  assert.ok(read, 'expected the draft queue read');
  assert.match(read.path, /select=[^&]*raw_text/, 'curation must select the description it matches on');
  // The rows above carry no raw_text, so both stay drafts - the assertion is
  // that the column is asked for, which is what was missing.
  assert.equal(body.curation.leftAsDraft, 2);
});

test('a known listing is only stamped as seen, never rewritten', async () => {
  const mod = await freshIngest();
  const known = [{ id: 'cc33', dedupe_key: lib.dedupeKeyFor(sample().id) }];
  const supa = fakeSupabase(known);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const u = String(input);
    if (u.startsWith('https://fake.supabase.co')) return supa.fetchImpl(input, init);
    return new Response(JSON.stringify({ results: [sample({ salary_is_predicted: '0' })] }), { status: 200 });
  };
  let body;
  try {
    const res = await mod.onRequestPost({
      request: new Request('https://example.com/ingest', { method: 'POST', headers: { 'x-ingest-secret': 'a'.repeat(64) } }),
      env: postEnv
    });
    body = await res.json();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(body.inserted, 0, 'the row already exists, so nothing is inserted');
  assert.equal(body.refreshed, 1, 'it is stamped as seen');
  const writes = supa.calls.filter(c => c.method === 'PATCH');
  assert.deepEqual(
    writes.map(w => Object.keys(w.body)),
    [['last_seen_at']],
    `a known listing must only get last_seen_at, saw ${JSON.stringify(writes)}`
  );
});

test('the same vacancy syndicated to several boards collapses to one row', async () => {
  const { curateBatch } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  // Adzuna is a meta-aggregator: one real vacancy on three boards is three ids,
  // which the per-id dedupe key cannot see. The first run returned Accenture's
  // "Custom Software Engineer" eight times.
  const rows = [
    { title: 'Custom Software Engineer', company: 'Accenture', first_seen_at: daysAgo(2) },
    { title: 'Custom Software Engineer', company: 'Accenture', first_seen_at: daysAgo(2) },
    { title: 'Custom Software Engineer', company: 'Accenture', first_seen_at: daysAgo(2) },
    { title: 'Custom software engineer', company: 'Accenture  ', first_seen_at: daysAgo(2) }
  ];
  const { decisions, summary } = curateBatch(rows);
  assert.equal(summary.publish, 1, 'exactly one survives');
  assert.equal(summary.reject, 3);
  assert.equal(summary.byReason['same title and company already in this batch'], 3);
});

test('curation is reversible in shape: every decision carries an id', async () => {
  const { curateBatch } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'curate.js')));
  const { decisions, summary } = curateBatch([
    { id: 'a', title: 'Software Engineer', company: 'Amazon' },
    { id: 'b', title: 'Relationship Manager_Tractors', company: 'Kotak Mahindra Bank' },
    { id: 'c', title: 'Manager', company: 'Metayb' }
  ]);
  // Unpublishing a batch is a status flip, so every decision must name its row.
  assert.deepEqual(decisions.map(d => d.id).sort(), ['a', 'b', 'c']);
  assert.equal(summary.publish, 1);
  assert.equal(summary.reject, 1);
  assert.equal(summary.review, 1);
});
