// Tests for the server-rendered share row (functions/lib/share.js) and the two
// rendered pages that use it (job pages and profile pages).
//
// A share control only exists on the SPA today, which a crawler never runs and a
// no-JS visitor never reaches. These pages are the ones that get pasted into
// chat, so the row has to be plain anchors that work with scripting off. The
// other half of the test is safety: every link is built from our own canonical
// URL, and the copy-to-clipboard handler embeds that URL inside a JS string, so a
// URL with a quote in it must not be able to break out of the attribute.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, ...rel)).href);

test('shareRow offers the four off-site destinations plus copy-link', async () => {
  const { shareRow } = await mod(['functions', 'lib', 'share.js']);
  const html = shareRow('https://swapiki.com/jobs/react-dev--abc', 'React Dev at Acme');
  assert.match(html, /https:\/\/twitter\.com\/intent\/tweet\?/);
  assert.match(html, /https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/);
  assert.match(html, /https:\/\/wa\.me\/\?text=/);
  assert.match(html, /mailto:\?subject=/);
  assert.match(html, /Copy link/);
  // Off-site links must open in a new tab and not leak the referrer.
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /target="_blank"/);
});

test('shareRow encodes the URL into each intent, never the visitor input', async () => {
  const { shareRow } = await mod(['functions', 'lib', 'share.js']);
  const url = 'https://swapiki.com/jobs/senior-qa--1a2b';
  const html = shareRow(url, 'Senior QA');
  assert.ok(html.includes(encodeURIComponent(url)), 'the encoded URL must appear in the intents');
});

test('a hostile share URL cannot break out of the copy-link handler', async () => {
  const { shareRow } = await mod(['functions', 'lib', 'share.js']);
  const hostile = `https://swapiki.com/');alert(1);//`;
  const html = shareRow(hostile, 'x');
  // The single quote in the URL must be escaped inside the onclick handler, or
  // the string literal closes early and the rest becomes executable script.
  assert.ok(html.includes("\\');alert(1)"), 'the quote in the shared URL must be escaped');
});

test('the job page renders a share row built from its canonical URL', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'jobs', '[slug].js'), 'utf8');
  assert.match(src, /import\s*\{\s*shareRow\s*\}/, 'job page must import shareRow');
  assert.match(src, /shareRow\(canonical/, 'job page must share its canonical URL');
});

test('the profile SSR body renders a share row and keeps it script-free', async () => {
  const { renderProfileBody } = await mod(['functions', 'profile-ssr.js']);
  const body = renderProfileBody('yochna5', {
    cand: { username: 'yochna5', name: 'Yochna', title: 'Designer' },
    projects: []
  });
  assert.match(body, /swapiki-share/);
  assert.match(body, /https:\/\/yochna5\.swapiki\.com\//);
  // The section is injected into the SPA shell; a <script> here would either be
  // stripped or double-execute, and the profile test forbids it anyway.
  assert.ok(!body.includes('<script'), 'the SSR section must not contain a script tag');
});