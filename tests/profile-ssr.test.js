const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const urlOf = (p) => pathToFileURL(p).href;

const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const CANDIDATE = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  username: 'yochna5',
  name: 'Yochna <script>',
  title: 'Lead Product Designer & UI Architect',
  experience: '6+ years',
  location: 'Bengaluru',
  bio: 'Builds telecom ops tooling.',
  profile_status: 'published',
  expertise: ['UX', 'Telecom']
};

const PROJECTS = [
  { title: 'Telecom Ops', problem: 'Manual dispatch', takeaways: ['owned it'], position: 0 },
  { title: 'Billing', problem: 'Leaky invoices', takeaways: [], position: 1 }
];

/** Stubs global fetch for Supabase REST only. */
function stubSupabase(rows, projects, opts = {}) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    seen.push(u);
    if (opts.fail) return new Response('nope', { status: 500 });
    if (u.includes('/rest/v1/candidates')) {
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (u.includes('/rest/v1/projects')) {
      return new Response(JSON.stringify(projects || []), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}

async function loadSsr() {
  return import(urlOf(path.join(ROOT, 'functions', 'profile-ssr.js')));
}

async function loadMiddleware() {
  return import(urlOf(path.join(ROOT, 'functions', '_middleware.js')));
}

test('getProfileForHandle returns a published candidate with their projects', async () => {
  const ssr = await loadSsr();
  const s = stubSupabase([CANDIDATE], PROJECTS);
  try {
    const profile = await ssr.getProfileForHandle('yochna5', { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon' });
    assert.ok(profile);
    assert.strictEqual(profile.cand.username, 'yochna5');
    assert.strictEqual(profile.projects.length, 2);
    assert.ok(s.seen.some((u) => u.includes('/rest/v1/candidates')));
    assert.ok(s.seen.some((u) => u.includes('/rest/v1/projects')));
  } finally {
    s.restore();
  }
});

test('getProfileForHandle refuses an unpublished (draft) profile', async () => {
  const ssr = await loadSsr();
  const s = stubSupabase([{ ...CANDIDATE, profile_status: 'draft' }], PROJECTS);
  try {
    const profile = await ssr.getProfileForHandle('yochna5', { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon' });
    assert.strictEqual(profile, null);
  } finally {
    s.restore();
  }
});

test('getProfileForHandle returns null when the handle does not exist', async () => {
  const ssr = await loadSsr();
  const s = stubSupabase([], PROJECTS);
  try {
    const profile = await ssr.getProfileForHandle('nobody', { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon' });
    assert.strictEqual(profile, null);
  } finally {
    s.restore();
  }
});

test('getProfileForHandle throws on a Supabase failure so the caller can tell it apart from "no profile"', async () => {
  const ssr = await loadSsr();
  const s = stubSupabase([CANDIDATE], PROJECTS, { fail: true });
  try {
    await assert.rejects(
      () => ssr.getProfileForHandle('yochna5', { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon' })
    );
  } finally {
    s.restore();
  }
});

test('the bare SSR page names the candidate, canonicalises to the subdomain and carries Person JSON-LD', async () => {
  const ssr = await loadSsr();
  const html = ssr.renderProfileHTML('yochna5', { cand: CANDIDATE, projects: PROJECTS });
  assert.match(html, /<title>.*Lead Product Designer.*\| Swapiki<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/yochna5\.swapiki\.com\/">/);
  assert.match(html, /"@type":"Person"/);
  assert.match(html, /Telecom Ops/);
});

test('the bare SSR page escapes a hostile candidate name', async () => {
  const ssr = await loadSsr();
  const html = ssr.renderProfileHTML('yochna5', { cand: CANDIDATE, projects: [] });
  assert.ok(!html.includes('<script>alert'), 'raw script tag leaked');
  assert.match(html, /Yochna &lt;script&gt;/);
});

test('injectProfileMeta rewrites the shell head and leaves the SPA body intact', async () => {
  const ssr = await loadSsr();
  const html = ssr.injectProfileMeta(INDEX_HTML, 'yochna5', { cand: CANDIDATE, projects: PROJECTS });
  assert.match(html, /<title>Yochna &lt;script&gt; — Lead Product Designer &amp; UI Architect \| Swapiki<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/yochna5\.swapiki\.com\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/yochna5\.swapiki\.com\/">/);
  assert.match(html, /<meta property="og:type" content="profile">/);
  assert.match(html, /"@type":"Person"/);
  // The app still boots: the shell's own scripts survive.
  assert.match(html, /dist\/js\/app\.js/);
});

test('the SSR page carries the profile in the body for a crawler that runs no JS', async () => {
  const ssr = await loadSsr();
  const html = ssr.injectProfileMeta(INDEX_HTML, 'yochna5', { cand: CANDIDATE, projects: PROJECTS });
  assert.match(html, /id="view-ssr-profile"/);
  assert.match(html, /<h1>Yochna &lt;script&gt;<\/h1>/);
  assert.match(html, /Lead Product Designer &amp; UI Architect/);
  assert.match(html, /Telecom Ops/);
  assert.match(html, /href="\/jobs"/);
  // The landing section must not be the active view, or the crawler sees the
  // homepage instead of the profile on first paint.
  assert.ok(!/id="view-landing"[^>]*active-view/.test(html), 'landing stayed the active view');
  // The injected content must not repeat the profile twice.
  assert.strictEqual(html.match(/id="view-ssr-profile"/g).length, 1);
});

test('the injected body escapes a hostile candidate and project name', async () => {
  const ssr = await loadSsr();
  const hostile = {
    cand: { ...CANDIDATE, name: '<img src=x onerror=alert(1)>', bio: '</p><script>bad()</script>' },
    projects: [{ title: '<b>pwn</b>', impact: '<img src=x onerror=alert(1)>', position: 0 }]
  };
  const html = ssr.injectProfileMeta(INDEX_HTML, 'yochna5', hostile);
  const start = html.indexOf('id="view-ssr-profile"');
  const section = html.slice(start, html.indexOf('</section>', start));
  assert.ok(!section.includes('<img'), 'hostile <img> survived in the SSR section');
  assert.ok(!section.includes('<script'), 'hostile <script> survived in the SSR section');
  assert.match(section, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(section, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
});

test('the SSR output makes no verification claim', async () => {
  const ssr = await loadSsr();
  const html = ssr.injectProfileMeta(INDEX_HTML, 'yochna5', { cand: CANDIDATE, projects: PROJECTS });
  const m = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"Person"[\s\S]*?)<\/script>/);
  assert.ok(m, 'expected an injected Person JSON-LD block');
  assert.ok(!/verified|verification|vetted|endorsed|guaranteed/i.test(m[1]), 'profile JSON-LD claims verification');
});

/* ------------------------------------------------------------------ */
/* Middleware routing                                                  */
/* ------------------------------------------------------------------ */

async function runMiddleware(request, env, opts = {}) {
  const mw = await loadMiddleware();
  let nextCalled = false;
  const context = {
    request,
    env,
    next: async () => {
      nextCalled = true;
      return new Response('SPA', { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
  };
  const res = await mw.onRequest(context);
  return { res, nextCalled, body: await res.text() };
}

function shellAssets() {
  return { fetch: async () => new Response(INDEX_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } }) };
}

test('a published subdomain is server-rendered (meta injected into the shell)', async () => {
  const s = stubSupabase([CANDIDATE], PROJECTS);
  try {
    const req = new Request('https://swapiki.pages.dev/', {
      headers: { 'X-Original-Host': 'yochna5.swapiki.com', Host: 'swapiki.pages.dev' }
    });
    const { res, nextCalled, body } = await runMiddleware(req, {
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      ASSETS: shellAssets()
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(nextCalled, false);
    assert.match(body, /canonical" href="https:\/\/yochna5\.swapiki\.com\/"/);
  } finally {
    s.restore();
  }
});

test('a profile subdomain serves a real robots.txt that points at the sitemap', async () => {
  const mw = await loadMiddleware();
  const req = new Request('https://yochna5.swapiki.com/robots.txt', {
    headers: { 'X-Original-Host': 'yochna5.swapiki.com' }
  });
  const res = await mw.onRequest({ request: req, env: {}, next: () => new Response('spa') });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  const body = await res.text();
  assert.match(body, /User-agent: \*/);
  assert.match(body, /Sitemap: https:\/\/swapiki\.com\/sitemap\.xml/);
  assert.ok(!body.includes('<html'), 'robots.txt should not be the SPA shell');
});

test('an unknown subdomain is a noindex soft-404, never a redirect to the apex', async () => {
  const s = stubSupabase([], []);
  try {
    const req = new Request('https://swapiki.pages.dev/', {
      headers: { 'X-Original-Host': 'ghost.swapiki.com', Host: 'swapiki.pages.dev' }
    });
    const { res, nextCalled, body } = await runMiddleware(req, {
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      ASSETS: shellAssets()
    });
    assert.strictEqual(res.status, 200);
    assert.notStrictEqual(res.status, 301);
    assert.strictEqual(nextCalled, false);
    assert.match(body, /<meta name="robots" content="noindex, nofollow">/);
    assert.ok(!/rel="canonical" href="https:\/\/swapiki\.com\/"/.test(body), 'soft-404 still canonicalises to the homepage');
    // The SPA must still boot, so a draft owner can preview their own page.
    assert.match(body, /dist\/js\/app\.js/);
  } finally {
    s.restore();
  }
});

test('a transient Supabase failure falls through to the SPA and is never marked noindex', async () => {
  const s = stubSupabase([CANDIDATE], PROJECTS, { fail: true });
  try {
    const req = new Request('https://swapiki.pages.dev/', {
      headers: { 'X-Original-Host': 'yochna5.swapiki.com', Host: 'swapiki.pages.dev' }
    });
    const { nextCalled, res } = await runMiddleware(req, {
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      ASSETS: shellAssets()
    });
    assert.strictEqual(nextCalled, true);
    assert.notStrictEqual(res.status, 301);
  } finally {
    s.restore();
  }
});

test('the apex points an unknown /u/<handle> at the same noindex soft-404', async () => {
  const s = stubSupabase([], []);
  try {
    const req = new Request('https://swapiki.com/u/nobody', { headers: { Host: 'swapiki.com' } });
    const { res, body } = await runMiddleware(req, {
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      ASSETS: shellAssets()
    });
    assert.strictEqual(res.status, 200);
    assert.match(body, /<meta name="robots" content="noindex, nofollow">/);
  } finally {
    s.restore();
  }
});

test('a bare pages.dev hit with no forwarded host still 301s to swapiki.com', async () => {
  const req = new Request('https://swapiki.pages.dev/jobs');
  const { res, nextCalled } = await runMiddleware(req, {});
  assert.strictEqual(res.status, 301);
  assert.strictEqual(res.headers.get('Location'), 'https://swapiki.com/jobs');
  assert.strictEqual(nextCalled, false);
});

test('the apex /u/<handle> is server-rendered', async () => {
  const s = stubSupabase([CANDIDATE], PROJECTS);
  try {
    const req = new Request('https://swapiki.com/u/yochna5', { headers: { Host: 'swapiki.com' } });
    const { res, nextCalled, body } = await runMiddleware(req, {
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      ASSETS: shellAssets()
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(nextCalled, false);
    assert.match(body, /canonical" href="https:\/\/yochna5\.swapiki\.com\/"/);
  } finally {
    s.restore();
  }
});

test('a normal apex page falls through to the SPA untouched', async () => {
  const req = new Request('https://swapiki.com/jobs', { headers: { Host: 'swapiki.com' } });
  const { body, nextCalled } = await runMiddleware(req, { ASSETS: shellAssets() });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(body, 'SPA');
});

test('the sitemap lists published profiles by their subdomain and skips dummies', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.includes('/rest/v1/candidates')) {
      return new Response(JSON.stringify([
        { username: 'yochna5', updated_at: '2026-10-01T00:00:00Z', is_dummy: false },
        { username: 'dummy-abc', updated_at: '2026-10-01T00:00:00Z', is_dummy: true }
      ]), { status: 200 });
    }
    // published jobs feed
    return new Response(JSON.stringify([]), { status: 200 });
  };
  try {
    const mod = await import(urlOf(path.join(ROOT, 'functions', 'sitemap.xml.js')));
    const res = await mod.onRequestGet({ env: { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' } });
    const xml = await res.text();
    assert.match(xml, /<loc>https:\/\/yochna5\.swapiki\.com\/<\/loc>/);
    assert.ok(!xml.includes('dummy-abc'), 'a dummy profile leaked into the sitemap');
  } finally {
    globalThis.fetch = real;
  }
});

test('a failed asset binding still returns crawlable profile HTML', async () => {
  const s = stubSupabase([CANDIDATE], PROJECTS);
  try {
    const req = new Request('https://swapiki.pages.dev/', {
      headers: { 'X-Original-Host': 'yochna5.swapiki.com', Host: 'swapiki.pages.dev' }
    });
    const { res, nextCalled, body } = await runMiddleware(req, {
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_ANON_KEY: 'anon'
      // no ASSETS binding
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(nextCalled, false);
    assert.match(body, /"@type":"Person"/);
  } finally {
    s.restore();
  }
});