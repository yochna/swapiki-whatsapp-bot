// A candidate link (<handle>.swapiki.com) sat on its loading spinner forever
// because the profile branch of the middleware answered EVERY path on the
// subdomain with the HTML shell - including /dist/js/app.js. The browser then
// threw "Uncaught SyntaxError: Unexpected token '<'" on every script and the
// app never started. These tests pin that static files go to Pages untouched
// while documents keep their profile behaviour.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const loadMiddleware = () => import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);

const CANDIDATE = { id: 'c1', username: 'priyanshu-007', name: 'Priyanshu', profile_status: 'draft' };

/** Supabase REST stand-in: `rows` are the candidates it returns. */
function withSupabase(rows, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.includes('/rest/v1/candidates')) return new Response(JSON.stringify(rows), { status: 200 });
    return new Response('[]', { status: 200 });
  };
  return fn().finally(() => { globalThis.fetch = real; });
}

async function run(pathname, { host = 'priyanshu-007.swapiki.com', rows = [] } = {}) {
  // The lookup must actually work: in production it does, and that is exactly
  // when the profile branch used to swallow script requests. With no database
  // configured the lookup throws and falls through to Pages, hiding the bug.
  const mw = await loadMiddleware();
  let nextCalled = false;
  const req = new Request(`https://swapiki.pages.dev${pathname}`, {
    headers: { 'X-Original-Host': host, Host: 'swapiki.pages.dev' }
  });
  const env = {
    SUPABASE_URL: 'https://fake.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    ASSETS: { fetch: async () => new Response(INDEX_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } }) }
  };
  const res = await withSupabase(rows, () => mw.onRequest({
    request: req,
    env,
    next: async () => {
      nextCalled = true;
      return new Response('/* the real file */', { status: 200, headers: { 'Content-Type': 'application/javascript' } });
    }
  }));
  return { res, nextCalled, body: await res.text() };
}

// Every file the shell loads, taken from index.html itself so a new script or
// stylesheet is covered automatically.
const loaded = [...INDEX_HTML.matchAll(/(?:src|href)="(\/?(?:dist|vendor|assets)\/[^"?#]+)/g)]
  .map((m) => (m[1].startsWith('/') ? m[1] : '/' + m[1]));

test('index.html really does load scripts from /dist and /vendor (sanity)', () => {
  assert.ok(loaded.includes('/dist/js/app.js'));
  assert.ok(loaded.includes('/dist/js/store.js'));
  assert.ok(loaded.includes('/vendor/supabase.min.js'));
});

test('every file the page loads is served as the real file on a profile subdomain', async () => {
  for (const p of new Set(loaded)) {
    const { res, nextCalled, body } = await run(p);
    assert.ok(nextCalled, `${p} must be passed on to Pages`);
    assert.ok(!body.includes('<html') && !body.includes('<!DOCTYPE'), `${p} must not be answered with the HTML shell`);
    assert.match(res.headers.get('content-type') || '', /javascript|css|svg|png|image|font|octet/, `${p} keeps a non-HTML type`);
  }
});

test('the app bundle is a script, not the shell, even for a handle that does not exist', async () => {
  const { nextCalled, body } = await run('/dist/js/app.js', { host: 'ghost.swapiki.com', rows: [] });
  assert.ok(nextCalled);
  assert.ok(!body.includes('<'), 'a script must never start with "<"');
});

test('scripts are real files for a draft and for a published candidate too', async () => {
  for (const status of ['draft', 'published']) {
    const { nextCalled, body } = await run('/dist/js/store.js', { rows: [{ ...CANDIDATE, profile_status: status }] });
    assert.ok(nextCalled, `${status}: store.js must reach Pages`);
    assert.ok(!body.includes('<'), `${status}: store.js must not be HTML`);
  }
});

test('the profile page itself (/) still gets the shell, as before', async () => {
  const { nextCalled, body } = await run('/');
  assert.strictEqual(nextCalled, false, 'the document is still handled by the profile branch');
  assert.match(body, /<html/i);
});

test('feeds and robots on a subdomain keep their old behaviour', async () => {
  const robots = await run('/robots.txt');
  assert.match(robots.body, /User-agent: \*/);
  const sitemap = await run('/sitemap.xml');
  assert.strictEqual(sitemap.nextCalled, false, 'xml is not treated as a static asset');
});

test('secret-looking paths are still refused before the asset exemption', async () => {
  const { res, nextCalled } = await run('/whatsapp-bot/anything.js');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(nextCalled, false);
});
