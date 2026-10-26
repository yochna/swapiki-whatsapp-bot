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

test('the SPA job card renders a share button wired to a canonical /jobs/<id> link', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(src, /openJobShareModal\('\$\{j\.id\}'\)/, 'each job card must render a share button');
  assert.match(src, /jobShareUrl\(job\)\s*\{[\s\S]*?\/jobs\/\$\{encodeURIComponent\(job\.id\)\}/,
    'jobShareUrl must build the canonical /jobs/<id> URL');
  assert.match(src, /shareJobVia\(channel\)/, 'shareJobVia must exist');
  assert.match(src, /copyJobLink\(\)\s*\{/, 'copyJobLink must exist');
});

test('the SPA job share modal offers the same destinations as the SSR share row', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(src, /id="modal-share-job"/, 'the SPA must carry a job share modal');
  for (const channel of ['whatsapp', 'linkedin', 'x', 'email']) {
    assert.ok(src.includes(`app.shareJobVia('${channel}')`), `modal must offer ${channel}`);
  }
  assert.ok(src.includes('app.copyJobLink()'), 'modal must offer copy link');
});

test('the apply modal offers a share action and shares are tracked', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(src, /closeJobApplyModal\(\); app\.openJobShareModal\('\$\{job\.id\}'\)/,
    'the apply modal must offer a share action');
  assert.match(src, /posthog\.capture\('job_share',/, 'a completed share must be logged to PostHog');
  assert.match(src, /posthog\.capture\('job_share_open'/, 'opening the share modal must be logged');
});

test('the server-rendered /jobs board gives every card a share row', () => {
  // The board is the first thing shown on /jobs (the SPA replaces it on boot),
  // and the only thing a no-JS crawler or reader sees. A share control that
  // lives only in the app is missing for everyone in that window.
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'jobs.js'), 'utf8');
  assert.match(src, /import\s*\{\s*shareRow\s*\}/, 'the board must import the share row');
  const card = src.slice(src.indexOf('const jobCard ='), src.indexOf('const renderBoardRows'));
  assert.match(card, /shareRow\(/, 'each server-rendered card must carry a share row');
  assert.match(card, /https:\/\/swapiki\.com\$\{href\}/, 'the board must share the job canonical URL');
});

test('the SPA board paints one page at a time, with a Show more control', () => {
  // Rendering all several thousand cards into one innerHTML freezes the board on
  // arrival; the page must bound what it paints and offer the rest on demand.
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(src, /const JOBS_PAGE_SIZE\s*=\s*\d+/, 'the board must define a page size');
  assert.match(src, /filtered\.slice\(0,\s*limit\)/, 'the board must paint a bounded slice, not every card');
  assert.match(src, /showMoreJobs\(\)\s*\{[\s\S]*?jobsShown[\s\S]*?\+\s*JOBS_PAGE_SIZE/, 'Show more must advance one page');
  assert.match(src, /onclick="app\.showMoreJobs\(\)"/, 'the board must offer a Show more button');
});