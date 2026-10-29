// The landing page has a motion system (data-reveal + #view-landing.lp-motion).
// It used to cover only the top four sections, so everything from "proof" down to
// the closing call to action sat still, and the "Browse by city" block had
// markup but no styles at all. These tests keep every section inside the system.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const main = html.slice(html.indexOf('<main class="lp">'), html.indexOf('</main>', html.indexOf('<main class="lp">')));

function sectionHtml(cls) {
  const a = main.indexOf(`<section class="${cls}"`);
  assert.ok(a !== -1, `section ${cls} exists`);
  const next = main.indexOf('\n        <section class="lp-', a + 10);
  return main.slice(a, next === -1 ? main.length : next);
}

test('every landing section has elements that animate in', () => {
  ['lp-hero', 'lp-what', 'lp-problem', 'lp-how', 'lp-proof', 'lp-live', 'lp-city-hubs', 'lp-fb', 'lp-jobs', 'lp-faq', 'lp-final']
    .forEach((cls) => {
      const n = (sectionHtml(cls).match(/data-reveal/g) || []).length;
      assert.ok(n >= 1, `${cls} has no data-reveal element`);
    });
});

test('lists and grids enter one item at a time, not as one block', () => {
  assert.ok((sectionHtml('lp-city-hubs').match(/class="lp-city-hub"[^>]*data-reveal/g) || []).length === 8, 'each city tile');
  assert.ok((sectionHtml('lp-fb').match(/lp-fb-card[^>]*data-reveal/g) || []).length === 5, 'each feedback card');
  assert.ok((sectionHtml('lp-faq').match(/lp-faq-row"[^>]*data-reveal/g) || []).length === 7, 'each FAQ row');
});

test('content is never left invisible: no-JS and no-IntersectionObserver both show it', () => {
  // The base rule hides [data-reveal] until the script reveals it, so both ways
  // the script can fail to run must show everything instead.
  assert.ok(/<noscript><style>#view-landing \[data-reveal\] \{ opacity: 1 !important/.test(html), 'a <noscript> fallback exists');
  const guard = html.indexOf("if (!('IntersectionObserver' in window)) {");
  assert.ok(guard !== -1, 'the script handles a browser without IntersectionObserver');
  assert.ok(/is-inview/.test(html.slice(guard, guard + 300)), '...by revealing every element');
});

test('the Browse by city block has its own styles', () => {
  ['.lp-city-hubs {', '.lp-city-hubs-grid {', '.lp-city-hub {', '.lp-city-hub:hover'].forEach((sel) => {
    assert.ok(html.includes(`#view-landing ${sel}`), `missing style for ${sel}`);
  });
});

test('the new animations are switched off for people who ask for reduced motion', () => {
  const at = html.indexOf('\n      #view-landing [data-reveal] { opacity: 1 !important');
  assert.ok(at !== -1, 'the landing reduced-motion rule exists');
  const start = html.lastIndexOf('@media (prefers-reduced-motion: reduce)', at);
  const block = html.slice(start, html.indexOf('</style>', at));
  assert.ok(/lp-faq-row\[open\] > p/.test(block), 'the FAQ open animation is covered');
  assert.ok(/lp-ghost2/.test(block), 'the drifting word is covered');
});
