// Tests for the crawlable content pages (functions/lib/content-pages.js and the
// three routes that serve it): /for-recruiters, /how-it-works and /about.
//
// Two things are being pinned here. First, that each page is a real, standalone
// HTML document with its own canonical, an indexable robots tag and a linked
// schema graph - that is the whole reason the pages exist, and a page that boots
// the SPA or loses its canonical is not serving the purpose. Second, that the
// same honesty rules the landing page is tested against hold here: no invented
// statistics, no affirmative verification claim, and the "nothing is verified"
// position stated plainly.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, ...rel)).href);

// The same affirmative-claim patterns the landing page bans. Denying
// verification is allowed and expected; claiming it is not.
const VERIFICATION_CLAIMS = [
  /verified project/i,
  /voice (?:is )?verified/i,
  /identity (?:is )?verified/i,
  /certified/i,
  /trusted by [\d,]+/i
];

test('each content page is a standalone, indexable HTML document', async () => {
  const { CONTENT_PAGES, renderContentPage } = await mod(['functions', 'lib', 'content-pages.js']);
  const names = Object.keys(CONTENT_PAGES);
  assert.deepStrictEqual(names.sort(), ['about', 'for-recruiters', 'how-it-works']);

  for (const name of names) {
    const p = CONTENT_PAGES[name];
    const html = renderContentPage(p);
    assert.match(html, /^<!DOCTYPE html>/i, `${name}: not a full document`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://swapiki\\.com${p.path}"\\s*/>`), `${name}: canonical`);
    assert.match(html, /<meta name="robots" content="index, follow/, `${name}: robots`);
    assert.match(html, /<h1[\s>]/, `${name}: needs an h1`);
    assert.match(html, /"@type":"WebPage"/, `${name}: needs a WebPage node`);
    assert.match(html, /"@type":"BreadcrumbList"/, `${name}: needs a breadcrumb`);
    // It must not boot the SPA: a crawler has to read the content without JS.
    assert.ok(!/dist\/js\/app\.js/.test(html), `${name}: must not depend on the SPA`);
  }
});

test('content pages make no affirmative verification claim', async () => {
  const { CONTENT_PAGES, renderContentPage } = await mod(['functions', 'lib', 'content-pages.js']);
  for (const p of Object.values(CONTENT_PAGES)) {
    const html = renderContentPage(p);
    for (const claim of VERIFICATION_CLAIMS) {
      assert.ok(!claim.test(html), `${p.path}: claims ${claim}`);
    }
  }
});

test('the About and recruiter pages state what Swapiki does not do', async () => {
  const { CONTENT_PAGES, renderContentPage } = await mod(['functions', 'lib', 'content-pages.js']);
  const about = renderContentPage(CONTENT_PAGES['about']).replace(/\s+/g, ' ');
  assert.match(about, /does not verify identity/i);
  assert.match(about, /nothing is stamped as verified/i);

  const rec = renderContentPage(CONTENT_PAGES['for-recruiters']).replace(/\s+/g, ' ');
  assert.match(rec, /does not screen, rank, reject or keyword-filter/i);
});

test('each content page links to the others so a crawler can walk them', async () => {
  const { CONTENT_PAGES, renderContentPage } = await mod(['functions', 'lib', 'content-pages.js']);
  const html = renderContentPage(CONTENT_PAGES['about']);
  for (const p of Object.values(CONTENT_PAGES)) {
    assert.ok(html.includes(`href="${p.path}"`), `footer is missing a link to ${p.path}`);
  }
  assert.ok(html.includes('href="/jobs"'), 'footer should link the jobs board');
});

test('the route handlers answer with HTML and the right canonical', async () => {
  for (const name of ['for-recruiters', 'how-it-works', 'about']) {
    const handler = await mod(['functions', `${name}.js`]);
    const res = handler.onRequestGet();
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('Content-Type'), /text\/html/);
    const body = await res.text();
    assert.match(body, new RegExp(`canonical" href="https://swapiki\\.com/${name}"`));
  }
});

test('the sitemap lists the three content pages', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200 });
  try {
    const sm = await mod(['functions', 'sitemap.xml.js']);
    const res = await sm.onRequestGet({ env: { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' } });
    const xml = await res.text();
    for (const p of ['/for-recruiters', '/how-it-works', '/about']) {
      assert.ok(xml.includes(`<loc>https://swapiki.com${p}</loc>`), `sitemap is missing ${p}`);
    }
  } finally {
    globalThis.fetch = real;
  }
});