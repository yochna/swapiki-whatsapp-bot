// Tests for the honest site-wide counters behind /api/site-stats.
//
// The landing page and the jobs board both display these figures, so the rules
// that decide what counts are worth pinning: dummies never count, only published
// profiles count, "this week" uses a real date rather than assuming, and a read
// that fails returns null instead of a zero that would read as "nobody".
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const mod = () => import(pathToFileURL(path.join(ROOT, 'functions', 'lib', 'site-stats.js')).href);

const NOW = Date.parse('2026-10-07T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

function stub(rows, { ok = true } = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (!ok) return new Response('nope', { status: 500 });
    if (String(input).includes('/rest/v1/candidates')) {
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  return () => { globalThis.fetch = real; };
}

test('counts only published, non-dummy profiles and real recent activity', async () => {
  const { fetchSiteStats } = await mod();
  const restore = stub([
    { profile_status: 'published', is_dummy: false, updated_at: daysAgo(1) },
    { profile_status: 'published', is_dummy: false, updated_at: daysAgo(20) },
    { profile_status: 'published', is_dummy: true, updated_at: daysAgo(1) },
    { profile_status: 'draft', is_dummy: false, updated_at: daysAgo(1) }
  ]);
  try {
    const stats = await fetchSiteStats('https://fake.supabase.co', 'key', NOW);
    assert.strictEqual(stats.profiles, 4, 'profiles is every row');
    assert.strictEqual(stats.published, 2, 'dummies and drafts must not count as published');
    assert.strictEqual(stats.publishedThisWeek, 1, 'only the recent published row counts this week');
  } finally {
    restore();
  }
});

test('a failed read returns nulls, never zeroes', async () => {
  const { fetchSiteStats } = await mod();
  const restore = stub([], { ok: false });
  try {
    const stats = await fetchSiteStats('https://fake.supabase.co', 'key', NOW);
    assert.strictEqual(stats.profiles, null);
    assert.strictEqual(stats.published, null);
    assert.strictEqual(stats.publishedThisWeek, null);
    assert.strictEqual(stats.jobs, null);
  } finally {
    restore();
  }
});

test('the job count is read from an exact-count header, not from a capped row list', async () => {
  const { fetchPublishedJobCount } = await mod();
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 1 }]), {
    status: 200,
    headers: { 'Content-Range': '0-0/1487' }
  });
  try {
    const n = await fetchPublishedJobCount('https://fake.supabase.co', 'service');
    assert.strictEqual(n, 1487, 'the count must come from the header, not the one returned row');
  } finally {
    globalThis.fetch = real;
  }
});

test('a job count without an exact-count header is null, never a capped number', async () => {
  const { fetchPublishedJobCount } = await mod();
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
  try {
    assert.strictEqual(await fetchPublishedJobCount('https://fake.supabase.co', 'service'), null);
  } finally {
    globalThis.fetch = real;
  }
});

test('without a key the whole result is null rather than an invented empty board', async () => {
  const { fetchSiteStats, fetchPublishedJobCount } = await mod();
  const stats = await fetchSiteStats('https://fake.supabase.co', '');
  assert.strictEqual(stats.published, null);
  assert.strictEqual(await fetchPublishedJobCount('https://fake.supabase.co', ''), null);
});

test('the API route serves the stats as JSON and is cacheable', async () => {
  const route = await import(pathToFileURL(path.join(ROOT, 'functions', 'api', 'site-stats.js')).href);
  const restore = stub([
    { profile_status: 'published', is_dummy: false, updated_at: daysAgo(2) }
  ]);
  try {
    const res = await route.onRequestGet({ env: { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon' } });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('Cache-Control'), /max-age=/);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.stats.published, 1);
  } finally {
    restore();
  }
});