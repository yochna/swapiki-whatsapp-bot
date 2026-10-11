// The machine-readable board: /jobs.json and /feed.xml.
//
// These exist because enumerating Swapiki's jobs otherwise costs one fetch per
// job. An answer engine asked "what IT roles are open in Bengaluru?" should be
// able to answer from one document rather than 500 pages, and a feed reader
// should notice new roles without re-crawling the board.
//
// The risk they introduce is that the two formats drift apart, or that a failed
// database read quietly produces a document claiming an older number of jobs.
// Both are asserted against here.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const urlOf = (p) => pathToFileURL(p).href;
const load = (rel) => import(urlOf(path.join(ROOT, 'functions', rel)));

function makeJob(i, over = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Software Engineer ${i}`,
    company: `Acme ${i}`,
    location: 'Bengaluru',
    category: 'it',
    salary: '₹12,00,000 - ₹18,00,000',
    salary_min: '1200000',
    salary_max: '1800000',
    first_seen_at: '2026-09-28T10:00:00Z',
    apply_url: `https://www.adzuna.in/details/${1000 + i}`,
    ...over
  };
}

/** Runs a Pages Function against a stubbed PostgREST. */
async function run(rel, { jobs = [], noKey = false, fail = false } = {}) {
  const mod = await load(rel);
  const real = globalThis.fetch;
  globalThis.fetch = async () => {
    if (fail) return new Response('{"message":"boom"}', { status: 500 });
    return new Response(JSON.stringify(jobs), { status: 200 });
  };
  const env = { SUPABASE_URL: 'https://fake.supabase.co' };
  if (!noKey) env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  try {
    const res = await mod.onRequestGet({ env });
    return { res, text: await res.text() };
  } finally {
    globalThis.fetch = real;
  }
}

const jsonOf = (text) => {
  try {
    return JSON.parse(text);
  } catch (err) {
    assert.fail(`/jobs.json did not return valid JSON: ${err.message}`);
  }
};

const rssItems = (text) =>
  [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

const tag = (block, name) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? m[1].trim() : null;
};

// ------------------------------------------------------------- /jobs.json

test('/jobs.json describes every published job with its own canonical url', async () => {
  const jobs = [makeJob(1), makeJob(2), makeJob(3)];
  const { res, text } = await run('jobs.json.js', { jobs });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);

  const doc = jsonOf(text);
  assert.equal(doc.count, 3);
  assert.equal(doc.jobs.length, 3);
  for (const job of doc.jobs) {
    // The url has to be the page an engine would cite, not a /jobs? id= query
    // that the SPA resolves but no crawler would ever index.
    assert.match(job.url, /^https:\/\/swapiki\.com\/jobs\/.+/);
    assert.ok(job.url.includes(job.id), 'the stable id is what resolves a job');
    assert.ok(job.title && job.company && job.datePosted, 'a record is incomplete without its own fields');
  }
});

test('/jobs.json reports the failures rather than an older number', async () => {
  // A stale "568 jobs" from a cache while the read is failing is exactly the
  // claim an engine repeats to a user who then finds an empty board.
  const { res, text } = await run('jobs.json.js', { jobs: [makeJob(1)], fail: true });
  assert.equal(res.status, 200);
  const doc = jsonOf(text);
  assert.equal(doc.count, 0);
  assert.deepEqual(doc.jobs, []);
});

test('/jobs.json withholds a salary the employer never stated', async () => {
  const { text } = await run('jobs.json.js', { jobs: [makeJob(1, { salary_min: null, salary_max: null })] });
  const doc = jsonOf(text);
  assert.ok(!('salaryInrPerYear' in doc.jobs[0]), 'an un-stated salary must be absent, not zero');
});

test('/jobs.json counts facets from the rows it actually read', async () => {
  const { text } = await run('jobs.json.js', {
    jobs: [
      makeJob(1, { location: 'Bengaluru' }),
      makeJob(2, { location: 'Bengaluru' }),
      makeJob(3, { location: 'Pune' }),
      makeJob(4, { location: 'Pune' }),
      makeJob(5, { location: 'Pune' }),
      makeJob(6, { location: null })
    ]
  });
  const doc = jsonOf(text);
  // Most common first, so a reader that truncates keeps the useful end.
  assert.deepEqual(Object.keys(doc.facets.location), ['Pune', 'Bengaluru']);
  assert.equal(doc.facets.location.Pune, 3);
  assert.equal(doc.facets.location.Bengaluru, 2);
  // An empty location is not a location, and inventing "Unknown" would put a
  // city in the breakdown that no employer named.
  assert.ok(!('' in doc.facets.location));
  assert.equal(doc.count, 6, 'facets must not silently drop rows either');
});

test('/jobs.json exposes no apply target that is not http or https', async () => {
  const { text } = await run('jobs.json.js', {
    jobs: [makeJob(1, { apply_url: 'javascript:alert(1)' }), makeJob(2)]
  });
  const doc = jsonOf(text);
  for (const job of doc.jobs) {
    if ('applyUrl' in job) assert.match(job.applyUrl, /^https?:\/\//);
  }
});

test('/jobs.json is fetchable from another origin', async () => {
  // Without CORS the document is readable by curl and by nothing in a browser,
  // which is where the tooling that would consume it runs.
  const { res } = await run('jobs.json.js', { jobs: [] });
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

// -------------------------------------------------------------- /feed.xml

test('/feed.xml is valid RSS that links each role at its own page', async () => {
  const { res, text } = await run('feed.xml.js', { jobs: [makeJob(1), makeJob(2)] });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/rss\+xml/);
  assert.match(text, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(text, /<rss version="2\.0"/);
  assert.match(text, /<channel>/);

  const items = rssItems(text);
  assert.equal(items.length, 2);
  for (const item of items) {
    const link = tag(item, 'link');
    assert.match(link, /^https:\/\/swapiki\.com\/jobs\//);
    // guid is the permalink, so a re-published job does not reappear in a
    // reader's unread set as if it were a new opening.
    const guid = tag(item, 'guid');
    assert.equal(guid, link);
    assert.match(item, /isPermaLink="true"/);
    assert.ok(tag(item, 'pubDate'), 'a feed item with no date is not a feed');
    assert.ok(tag(item, 'description'));
  }
});

test('/feed.xml leads with the newest roles', async () => {
  const { text } = await run('feed.xml.js', {
    jobs: [
      makeJob(1, { first_seen_at: '2026-01-01T00:00:00Z' }),
      makeJob(2, { first_seen_at: '2026-09-01T00:00:00Z' }),
      makeJob(3, { first_seen_at: '2026-05-01T00:00:00Z' })
    ]
  });
  const titles = rssItems(text).map((i) => tag(i, 'title'));
  assert.deepEqual(titles, ['Software Engineer 2', 'Software Engineer 3', 'Software Engineer 1']);
});

test('/feed.xml caps at 50 and leaves the full set to jobs.json', async () => {
  const jobs = Array.from({ length: 60 }, (_, i) =>
    makeJob(i + 1, { first_seen_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` })
  );
  const { text } = await run('feed.xml.js', { jobs });
  assert.equal(rssItems(text).length, 50);

  const json = jsonOf((await run('jobs.json.js', { jobs })).text);
  assert.equal(json.jobs.length, 60, 'the JSON index must not be capped the same way');
});

test('the XML cannot be broken by a job title', async () => {
  const { text } = await run('feed.xml.js', {
    jobs: [makeJob(1, { title: 'Senior Engineer <Core> & "Platform"' })]
  });
  assert.ok(!/<title>Senior Engineer <Core>/.test(text), 'a raw < escaped the channel');
  assert.match(text, /<title>Senior Engineer &lt;Core&gt; &amp; &quot;Platform&quot;<\/title>/);
});

test('an empty board still returns a valid feed instead of a blank one', async () => {
  const { res, text } = await run('feed.xml.js', { jobs: [] });
  assert.equal(res.status, 200);
  assert.match(text, /<\/rss>$/);
  assert.equal(rssItems(text).length, 0);
});

// ------------------------------------------------------- the two agree

test('the JSON index and the RSS feed describe the same set of roles', async () => {
  // The whole reason both files are built by one module. Two hand-maintained
  // views of the board diverge eventually, and an engine that reads one and
  // cross-checks the other would find a contradiction it cannot resolve.
  const jobs = Array.from({ length: 12 }, (_, i) => makeJob(i + 1));
  const json = jsonOf((await run('jobs.json.js', { jobs })).text);
  const rss = rssItems((await run('feed.xml.js', { jobs })).text);

  const fromJson = json.jobs.map((j) => j.url).sort();
  const fromRss = rss.map((i) => tag(i, 'link')).sort();
  assert.deepEqual(fromRss, fromJson);
});
