// The traffic and search halves of GET /api/admin-jobs-stats.
//
// These exist because "how many people came to the page" was unanswerable: nothing
// wrote a row when a public profile was opened. The fix writes share_events rows
// with type='view' and aggregates them here. The rules worth protecting:
//
//   1. PROFILE OPENS ARE NOT PEOPLE. share_events has no viewer column, so a
//      unique-visitor count cannot be computed and must not be faked. The
//      headline is a count of opens, and the UI says so.
//   2. THE TEAM'S OWN TESTING MUST NOT BE TRAFFIC. A localhost or private-host
//      referrer is bucketed as dev, so checking a profile link does not become
//      the site's biggest referrer.
//   3. SHARE CLICKS ARE NOT VIEWS. The same table holds share events; the query
//      filters type='view'. An aggregation that counted every row would report
//      "someone copied my link" as "someone read my profile".
//   4. SEARCH COUNTS ARE NOT KEYSTROKES. The store logs a row per throttled
//      keystroke, so ranking on raw rows would crown whichever term was typed
//      most slowly. Ranking is on distinct days, with the raw count alongside.
//   5. AN UNMIGRATED TABLE SAYS "NOT SET UP". Each source carries its own
//      available flag; one missing table must not zero the others.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const statsUrl = pathToFileURL(path.join(ROOT, 'functions', 'api', 'admin-jobs-stats.js')).href;
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase', 'full_redesign_migration.sql'), 'utf8');
const ENDPOINT = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'admin-jobs-stats.js'), 'utf8');

// This file is CommonJS, so the ESM endpoint cannot be imported at load time.
// Node caches the module, so this resolves to the same instance on every call.
let cached = null;
const load = async () => (cached || (cached = await import(statsUrl)));

// ---------------------------------------------------------------------------
// The write path: something must actually log a profile open
// ---------------------------------------------------------------------------
test('a public profile open is written to share_events as type=view', () => {
  assert.match(STORE, /recordProfileView\s*\(\s*profileId/,
    'the store needs a method that records a view');
  assert.match(STORE, /type:\s*'view'/,
    "the view row must be distinguishable from a share click by its type");
  assert.match(STORE, /candidate_id:\s*profileId/,
    'the view must be recorded against the profile that was OPENED, not the viewer');
});

test('share_events already permits anonymous inserts, so no migration is needed', () => {
  // This is the whole reason the view lands in share_events rather than a new
  // table: the insert policy is open to logged-out visitors, and the viewer is
  // almost always logged out. If this ever tightens, views stop recording for
  // exactly the audience that matters.
  assert.match(SQL, /create table if not exists public\.share_events/i);
  assert.match(SQL, /for insert\s*\n\s*with check \(true\)/i,
    'a view by a logged-out visitor must still be insertable');
});

test('the client logs the view against the profile that resolved, not a 404', () => {
  assert.match(APP, /_recordPublicProfileView\s*\(/,
    'the render path must call the recorder');
  // The call has to sit AFTER the not-found early return, or "Profile not
  // found" would be reported as the most-viewed profile on the site.
  const notFoundReturn = APP.indexOf('this.showNotFoundToast(this.publicUsername)');
  const call = APP.indexOf('this._recordPublicProfileView(profile, isAdminPreview)');
  assert.ok(notFoundReturn > -1 && call > notFoundReturn,
    'the recorder must run after the 404 branch returns, never before it');
});

test('own profile, admin preview and refresh are not counted as audience', () => {
  const start = APP.indexOf('_recordPublicProfileView(profile, isAdminPreview) {');
  const fn = APP.slice(start, APP.indexOf('async renderCandidateProfile', start));
  assert.match(fn, /if \(!this\.publicUsername \|\| isAdminPreview\) return;/,
    'the owner preview and the admin preview are staff, not audience');
  assert.match(fn, /profile\.userId === viewerId\) return;/,
    'an owner opening their own public link is not a view from the audience');
  assert.match(fn, /sessionStorage/,
    'a refresh must not be counted twice, or one visitor holding F5 tops the board');
});

// ---------------------------------------------------------------------------
// referrerBucket: where the visits came from
// ---------------------------------------------------------------------------
test('referrers collapse to the handful of channels worth acting on', async () => {
  const { referrerBucket } = await load();
  assert.equal(referrerBucket('https://www.linkedin.com/feed/'), 'LinkedIn');
  assert.equal(referrerBucket('https://web.whatsapp.com/'), 'WhatsApp');
  assert.equal(referrerBucket('https://t.co/abc'), 'X / Twitter');
  assert.equal(referrerBucket('https://www.google.co.in/search?q=react'), 'Google');
  assert.equal(referrerBucket('https://rahul.swapiki.com/'), 'Swapiki');
  // A bare host with no scheme is common in older browsers and must still parse.
  assert.equal(referrerBucket('linkedin.com'), 'LinkedIn');
});

test('an unknown host keeps its hostname, because that is a lead', async () => {
  const { referrerBucket } = await load();
  // "Some blog post nobody remembers" is exactly how a placement gets found.
  assert.equal(referrerBucket('https://blog.somecollege.edu/careers'), 'blog.somecollege.edu');
});

test('the team testing their own profile is not reported as traffic', async () => {
  const { referrerBucket } = await load();
  assert.equal(referrerBucket(''), 'Direct / link shared');
  assert.equal(referrerBucket(null), 'Direct / link shared');
  assert.equal(referrerBucket(undefined), 'Direct / link shared');
  assert.equal(referrerBucket('http://localhost:5173/'), 'Local / dev');
  assert.equal(referrerBucket('http://127.0.0.1:8788/'), 'Local / dev');
  assert.equal(referrerBucket('http://my-laptop.local'), 'Local / dev');
});

test('a malformed referrer degrades to text instead of throwing', async () => {
  const { referrerBucket } = await load();
  // An analytics aggregation must never be the thing that 500s the endpoint.
  assert.doesNotThrow(() => referrerBucket('::::not a url::::'));
  assert.equal(typeof referrerBucket('::::not a url::::'), 'string');
});

// ---------------------------------------------------------------------------
// summariseViews
// ---------------------------------------------------------------------------
test('views are counted per profile, ranked, and the busiest profile wins', async () => {
  const { summariseViews } = await load();
  const out = summariseViews([
    { candidate_id: 'a', referrer: 'https://linkedin.com', created_at: '2026-10-01T10:00:00Z' },
    { candidate_id: 'a', referrer: 'https://linkedin.com', created_at: '2026-10-01T11:00:00Z' },
    { candidate_id: 'b', referrer: '', created_at: '2026-10-02T11:00:00Z' },
    { candidate_id: 'a', referrer: '', created_at: '2026-10-02T11:00:00Z' }
  ]);
  assert.equal(out.total, 4, 'four opens were logged');
  assert.equal(out.profiles, 2, 'two distinct profiles were opened');
  assert.equal(out.ranked[0].candidate_id, 'a');
  assert.equal(out.ranked[0].views, 3);
  assert.equal(out.ranked[1].views, 1);
});

test('the referrer split adds up to the total', async () => {
  const { summariseViews } = await load();
  const rows = [
    { candidate_id: 'a', referrer: 'https://linkedin.com' },
    { candidate_id: 'a', referrer: 'https://linkedin.com' },
    { candidate_id: 'b', referrer: '' },
    { candidate_id: 'c', referrer: 'http://localhost:3000/' }
  ];
  const out = summariseViews(rows);
  const summed = out.referrers.reduce((n, r) => n + r.views, 0);
  assert.equal(summed, out.total, 'every open is attributed to exactly one source');
  const dev = out.referrers.find(r => r.source === 'Local / dev');
  assert.ok(dev, 'the local check is bucketed, not counted as a real channel');
  assert.equal(dev.views, 1);
});

test('no view rows is zero views, not a crash', async () => {
  const { summariseViews } = await load();
  for (const input of [[], null, undefined, [null, {}]]) {
    const out = summariseViews(input);
    assert.equal(out.total, 0);
    assert.deepEqual(out.ranked, []);
    assert.deepEqual(out.referrers, []);
  }
});

// ---------------------------------------------------------------------------
// summariseSearches
// ---------------------------------------------------------------------------
test('searches rank on distinct days, not on how slowly someone typed', async () => {
  const { summariseSearches } = await load();
  // "react" typed carefully on one day is one search, however many keystroke
  // rows it left behind. "java" found on three separate days is a stronger
  // signal, so it should outrank it.
  const out = summariseSearches([
    { query: 'react', created_at: '2026-10-01T10:00:00Z' },
    { query: 'react', created_at: '2026-10-01T10:05:00Z' },
    { query: 'react', created_at: '2026-10-01T10:09:00Z' },
    { query: 'java', created_at: '2026-10-01T11:00:00Z' },
    { query: 'java', created_at: '2026-10-02T11:00:00Z' },
    { query: 'java', created_at: '2026-10-03T11:00:00Z' }
  ]);
  assert.equal(out.ranked[0].query, 'java', 'three days of interest beats one day of typing');
  assert.equal(out.ranked[0].days, 3);
  assert.equal(out.ranked[1].query, 'react');
  assert.equal(out.ranked[1].days, 1);
  assert.equal(out.ranked[1].occurrences, 3,
    'the raw row count is still reported, just not used for the ranking');
  assert.equal(out.total, 2, 'two distinct terms');
  assert.equal(out.terms, 6, 'six rows were logged');
});

test('search terms fold together regardless of case or padding', async () => {
  const { summariseSearches } = await load();
  const out = summariseSearches([
    { query: 'React', created_at: '2026-10-01T10:00:00Z' },
    { query: '  react  ', created_at: '2026-10-01T10:01:00Z' }
  ]);
  assert.equal(out.total, 1, '"React" and "react" are the same search');
  assert.equal(out.ranked[0].occurrences, 2);
});

test('a blank search is noise and is dropped', async () => {
  const { summariseSearches } = await load();
  // The store already refuses to log an empty query; one here means junk, and
  // "nobody searched for ''" is not a finding worth a row.
  const out = summariseSearches([
    { query: '   ', created_at: '2026-10-01T10:00:00Z' },
    { query: '', created_at: '2026-10-01T10:01:00Z' },
    { query: null, created_at: '2026-10-01T10:02:00Z' },
    { query: 'react', created_at: '2026-10-01T10:03:00Z' }
  ]);
  assert.equal(out.total, 1);
  assert.equal(out.ranked[0].query, 'react');
});

test('no search rows is zero terms, not a crash', async () => {
  const { summariseSearches } = await load();
  assert.equal(summariseSearches([]).total, 0);
  assert.equal(summariseSearches(null).terms, 0);
  assert.equal(summariseSearches(undefined).ranked.length, 0);
});

// ---------------------------------------------------------------------------
// The endpoint contract
// ---------------------------------------------------------------------------
test('views are filtered to type=view so share clicks are not counted as reads', () => {
  assert.match(ENDPOINT, /share_events\?select=candidate_id,referrer,created_at&type=eq\.view/,
    'the query must exclude the share types that share the table');
});

test('the traffic panel says opens, not visitors', () => {
  // The claim the UI makes has to be the claim the data supports.
  assert.match(APP, /Counts profile opens, not unique visitors/);
});

// ---------------------------------------------------------------------------
// The rendered admin page
// ---------------------------------------------------------------------------
// The blast radius of a template error here is the WHOLE jobs admin: the caller
// wraps this render in a try/catch that replaces the page with an error card.
// So the panels are rendered for real, and the two degraded states are pinned.
const { bootApp } = require('./helpers/app-sandbox');

const trafficPayload = (over = {}) => Object.assign({
  available: true,
  total: 42,
  profiles: 3,
  daily: [],
  top_profiles: [
    { candidate_id: 'a', views: 20, username: 'rahul-verma', name: 'Rahul Verma', title: 'SDE' },
    { candidate_id: 'b', views: 5, username: 'priya-s', name: 'Priya S', title: 'PM' }
  ],
  referrers: [
    { source: 'LinkedIn', views: 30 },
    { source: 'Direct / link shared', views: 10 },
    { source: 'Local / dev', views: 2 }
  ]
}, over);

const searchPayload = (over = {}) => Object.assign({
  available: true,
  terms: 3,
  rows: 9,
  top: [
    { query: 'react', occurrences: 5, days: 2 },
    { query: 'java', occurrences: 4, days: 1 }
  ]
}, over);

const baseStats = (over = {}) => Object.assign({
  configured: true,
  window_days: 30,
  tools: { available: true, resume: { uses: 3, users: 2, jobs: 2 }, interview: { uses: 1, users: 1, jobs: 1 }, daily: [] },
  clicks: { available: true, total: 5, users: 3, jobs: 4, daily: [], top_jobs: [{ job_id: 'j1', clicks: 5, title: 'SDE', company: 'Acme', status: 'published' }] },
  traffic: trafficPayload(),
  searches: searchPayload(),
  capped: false
}, over);

test('the page renders all three panels when every source answered', () => {
  const { app } = bootApp();
  const html = app.renderAdminJobsStats(baseStats());
  assert.match(html, /Profile Opens/, 'the headline card is present');
  assert.match(html, /Profile Traffic/, 'the traffic section is present');
  assert.match(html, /Top Searches/, 'the search section is present');
  assert.match(html, /Most Clicked/, 'the pre-existing clicks table still renders');
  assert.match(html, /Counts profile opens, not unique visitors/);
  // The referrer bars are proportional, so the biggest source must be full width.
  assert.match(html, /width:100%/);
  assert.match(html, /rahul-verma\.swapiki\.com/, 'a viewed profile links to its public page');
  assert.ok(!/undefined/.test(html), 'no placeholder leaked into the markup');
});

test('an un-migrated share_events removes the traffic panel but not the page', () => {
  // share_events predates this feature, so a deployment that never ran the
  // redesign migration must still get a working jobs admin - just without the
  // panel, rather than with a permanent "not set up" box.
  const { app } = bootApp();
  const html = app.renderAdminJobsStats(baseStats({ traffic: { available: false } }));
  assert.doesNotMatch(html, /Profile Traffic/, 'no traffic panel when the table is absent');
  assert.doesNotMatch(html, /Where they came from/);
  assert.match(html, /Most Clicked/, 'the rest of the page still renders');
  assert.match(html, /Top Searches/, 'an unrelated missing source does not hide others');
});

test('an absent search_events removes only the search panel', () => {
  const { app } = bootApp();
  const html = app.renderAdminJobsStats(baseStats({ searches: { available: false } }));
  assert.doesNotMatch(html, /Top Searches/);
  assert.match(html, /Profile Traffic/, 'traffic survives an absent search table');
  assert.match(html, /Most Clicked/);
});

test('an empty window renders honest empty states, not zeros pretending to be data', () => {
  const { app } = bootApp();
  const html = app.renderAdminJobsStats(baseStats({
    traffic: trafficPayload({ total: 0, profiles: 0, top_profiles: [], referrers: [] }),
    searches: searchPayload({ terms: 0, rows: 0, top: [] })
  }));
  assert.match(html, /No profile opens recorded in this window yet\./);
  assert.match(html, /No searches recorded in this window yet\./);
});

test('a username and a search term cannot inject markup', () => {
  // Both are user-supplied and both land in HTML. The handle additionally lands
  // inside an href, which is why it goes through the store's slug rule.
  const { app } = bootApp();
  const html = app.renderAdminJobsStats(baseStats({
    traffic: trafficPayload({
      top_profiles: [{ candidate_id: 'x', views: 1, username: 'a"><script>alert(1)</script>', name: '<img src=x onerror=alert(2)>', title: 'SDE' }]
    }),
    searches: searchPayload({ top: [{ query: '<script>alert(3)</script>', occurrences: 1, days: 1 }] })
  }));
  // What matters is that no tag is LIVE. The literal text "onerror=" can survive
  // inside escaped output without doing anything, because the angle brackets
  // around it are gone. So the check is that the dangerous characters were
  // encoded, not that the substring vanished.
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;script&gt;alert\(3\)&lt;\/script&gt;/,
    'the search term is present but encoded, so it renders as text');
  assert.match(html, /&lt;img src=x onerror=/,
    'the profile name is present but encoded, so it cannot become a tag');
  // The slug rule strips the injection down to harmless characters, so the href
  // can only ever contain [a-z0-9_-] from user input.
  assert.ok(html.includes('a-script-alert-1-script.swapiki.com'),
    'the href is built from the slug, so no quote or angle bracket reaches it');
  assert.ok(!/href="[^"]*"[^"]*"/.test(html.split('a-script-alert')[0].slice(-40)),
    'no attribute was broken out of');
});

test('an unconfigured endpoint still explains itself instead of showing blanks', () => {
  const { app } = bootApp();
  const html = app.renderAdminJobsStats({ configured: false });
  assert.match(html, /aren't set up on this deployment yet/);
});

test('a single person and a single job are not pluralised', () => {
  // "1 people · 1 jobs" makes a real single-interview-prep week look like a
  // broken counter, which is precisely the reading that would stop someone
  // trusting the number. One person who used interview prep once IS the number.
  const { app } = bootApp();
  const one = app.renderAdminJobsStats(baseStats({
    tools: {
      available: true,
      resume: { uses: 0, users: 0, jobs: 0 },
      interview: { uses: 1, users: 1, jobs: 1 },
      daily: []
    },
    clicks: { available: true, total: 1, users: 1, jobs: 1, daily: [], top_jobs: [] },
    traffic: trafficPayload({ total: 1, profiles: 1, top_profiles: [], referrers: [{ source: 'LinkedIn', views: 1 }] }),
    searches: searchPayload({ terms: 1, rows: 1, top: [{ query: 'react', occurrences: 1, days: 1 }] })
  }));
  assert.match(one, /1 person · 1 job\b/);
  assert.doesNotMatch(one, /1 people/);
  assert.doesNotMatch(one, /1 jobs/);
  assert.match(one, /across 1 profile\b/);
  assert.doesNotMatch(one, /1 profiles/);
  assert.match(one, /1 distinct term\b/);
  assert.match(one, /1 search logged/);
  assert.match(one, /1 day</);
});

test('two or more still reads as a plural', () => {
  const { app } = bootApp();
  const many = app.renderAdminJobsStats(baseStats({
    tools: {
      available: true,
      resume: { uses: 4, users: 2, jobs: 3 },
      interview: { uses: 2, users: 2, jobs: 2 },
      daily: []
    },
    searches: searchPayload({ terms: 2, rows: 5, top: [] })
  }));
  assert.match(many, /2 people · 3 jobs/);
  assert.match(many, /2 distinct terms/);
});

test('a real zero says so, rather than blaming a missing table', () => {
  // "opens recorded so far" and "Run job_clicks migration" mean opposite things:
  // the first is a true zero, the second is a deployment that has not been
  // migrated. Collapsing them would hide a missing table behind a real number.
  const { app } = bootApp();
  const zero = app.renderAdminJobsStats(baseStats({
    traffic: trafficPayload({ total: 0, profiles: 0, top_profiles: [], referrers: [] })
  }));
  assert.match(zero, /opens recorded so far/);
  assert.doesNotMatch(zero, /Tracking not set up/);
});
