// Tests for the landing page redesign (index.html).
//
// The landing page is the only file where marketing copy and layout are mixed
// together, and it is hand-edited rather than generated, so two classes of
// regression are worth pinning down:
//
//   1. HONESTY. The redesign's stat wall replaced the old one but still cited
//      invented numbers against fake sources ("11,000 applications per minute -
//      LinkedIn", "91% - Greenhouse AI Hiring Report", "34% - Robert Half",
//      "78% - 2026 application audit"). None of those were ever sourced, and
//      the whole point of the 0.8.37 voice work was to stop implying
//      verification we cannot back up. These tests keep that ground from being
//      re-covered by the next design pass, while pinning the REAL pilot
//      testimonials so a cleanup pass cannot quietly delete honest criticism.
//
//   2. CHROME WIRING. The shared top banner, header and footer are themed by
//      CSS that targets #site-topbar / #site-header / #site-footer. Those IDs
//      were declared in the stylesheet but never added to the markup, so the
//      landing rendered in the editorial palette while the nav and footer
//      stayed in the old blue/amber theme.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const landing = html.slice(html.indexOf('<main class="lp">'), html.indexOf('</main>'));

// Copy is hand-wrapped across source lines, so compare against a
// whitespace-collapsed copy. Otherwise a reflow breaks these assertions
// without any copy actually changing.
const flat = landing.replace(/\s+/g, ' ');

test('landing page keeps its editorial design system scoped to #view-landing', () => {
  assert.match(html, /#view-landing\s*\{[\s\S]*?--lp-accent:\s*#D9481F/);
  assert.match(html, /#view-landing\s*\{[\s\S]*?--lp-paper:\s*#F7F3EC/);
  assert.ok(html.includes('class="lp"'), 'expected the landing <main class="lp"> wrapper');
});

test('shared chrome carries the IDs the theming CSS targets', () => {
  assert.match(html, /id="site-topbar"/, 'top banner missing #site-topbar');
  assert.match(html, /id="site-header"/, 'nav header missing #site-header');
  assert.match(html, /id="site-footer"/, 'footer missing #site-footer');
});

test('landing does not publish invented statistics or attributed sources', () => {
  const invented = [
    '2026 application audit',
    'Greenhouse AI Hiring Report',
    'Robert Half',
    '11,000'
  ];
  for (const needle of invented) {
    assert.ok(
      !landing.includes(needle),
      `landing reintroduced an unsupported claim or source: ${needle}`
    );
  }
  // The old stat wall also carried a per-item source line. The honest
  // replacement is qualitative, so no stat cell may render one.
  assert.ok(!/class="s"/.test(landing), 'landing stat cells should not cite sources');
});

test('landing does not fabricate testimonials or inflate ratings', () => {
  // These five are genuine pilot participants and their quotes are reproduced
  // verbatim, so the landing MUST keep them. The guard is against drift in the
  // other direction: the redesign originally presented Rohan as a flat 5/5 and
  // quietly dropped the two critical reviews, which would misrepresent the
  // pilot. Ratings are pinned below.
  const pilots = [
    { who: 'Rohan Kulkarni', stars: 4 },
    { who: 'Pooja Sundaram', stars: 4 },
    { who: 'Aditya Mehta', stars: 5 },
    { who: 'Sneha Nair', stars: 3 },
    { who: 'Vikram Rao', stars: 4 }
  ];

  for (const { who, stars } of pilots) {
    assert.ok(landing.includes(who), `pilot feedback from ${who} was dropped from the landing`);
    const card = landing.slice(landing.indexOf(who));
    const rate = card.slice(0, card.indexOf('lp-fb-foot'));
    const filled = (rate.match(/<span>&#9733;<\/span>/g) || []).length;
    const dimmed = (rate.match(/class="off">&#9733;<\/span>/g) || []).length;
    assert.equal(filled + dimmed, 5, `${who}: expected 5 rendered stars`);
    assert.equal(filled, stars, `${who}: expected ${stars}/5 stars, rendered ${filled}/5`);
  }
});

test('landing keeps the critical pilot feedback rather than only the praise', () => {
  // Dropping these would turn honest feedback into a marketing wall.
  assert.ok(flat.includes('Fairly good pilot tool'), 'the 3/5 review must stay');
  assert.ok(flat.includes("Audio quality depends on the candidate's mic"), 'the audio-quality caveat must stay');
  assert.ok(flat.includes('Some candidates still struggle'), 'the 2-minute-summary caveat must stay');
  assert.ok(flat.includes('Would love to see direct ATS export'), 'the ATS-export request must stay');
});

test('landing does not claim staff review of the sample walkthrough', () => {
  // Staff review is a real badge on real profiles, but the marketing sample
  // walkthrough has never been reviewed, so the landing must not assert it.
  assert.ok(
    !landing.includes('Reviewed by Swapiki team'),
    'landing must not claim the demo walkthrough was reviewed by the team'
  );
});

test('landing trust copy matches what the product actually does', () => {
  // Proves a live recording. Never a person\'s identity.
  assert.ok(landing.includes('Live recording confirmed'));
  assert.ok(!/voice (is )?verified/i.test(landing), 'must not claim voice/identity verification');
  assert.ok(!/identity verified/i.test(landing));
  // Nothing is AI-scored or auto-rejected.
  assert.ok(landing.includes('No AI scoring'));
  assert.ok(landing.includes('No AI keyword screening'));
});

test('landing keeps the required live-check affordances and honest footer', () => {
  assert.ok(landing.includes('id="how-it-works"'), 'expected the how-it-works anchor target');
  assert.ok(html.includes('Swapiki is a sub-product of'));
  assert.ok(html.includes('href="https://swaniki.com"'), 'Swaniki link missing');
  assert.ok(html.includes('id="footer-copyright"'), 'footer-copyright ID is set by app.js');
});

test('the jobs band points at /jobs and does not promise an ungated board', () => {
  // /jobs is a real crawlable URL (functions/jobs.js) and it now boots the same
  // interactive board as #jobs, including its sign-in and 80% gates. The old
  // copy claimed the public page had "no profile gate" while the board the
  // visitor actually landed on was gated — the page has to say what is true.
  assert.match(landing, /<a class="lp-btn lp-btn-primary" href="\/jobs">/);
  assert.ok(!/href="#jobs"/.test(landing), 'the jobs CTA should use the real /jobs URL, not the hash route');
  assert.ok(flat.includes('500+ job listings'), 'expected the 500+ job listings claim');
  assert.ok(!flat.includes('100+ job listings'), 'the old 100+ job listings claim should be gone');
  assert.ok(!flat.includes('30+ hiring managers'), 'the old 30+ claim should be gone');

  // No copy may claim there is no gate, because the board has one.
  assert.ok(
    !/no profile gate/i.test(flat) && !/open to everyone/i.test(flat),
    'the page still advertises the jobs board as ungated'
  );
  assert.match(flat, /reach 80% to unlock/i, 'the band should say the gate up front');
  assert.match(
    landing.slice(landing.indexOf('lp-faq-list')).replace(/\s+/g, ' '),
    /jobs board is gated/,
    'the FAQ must disclose the 80% gate'
  );

  // Every promise in the strip has to be visible in the real listing feed.
  // These were checked against the live /jobs JSON-LD; keep them honest.
  const strip = landing.slice(landing.indexOf('lp-jobs-strip'));
  for (const claim of ['Across India', 'Remote &amp; onsite', 'Internships', 'Published salary ranges']) {
    assert.ok(strip.includes(claim), `jobs strip claims ${claim}, which the live board does not support`);
  }
  // These categories were invented in an earlier pass and are not in the feed.
  for (const fiction of ['BFSI', 'Design &amp; UX', 'Product']) {
    assert.ok(!strip.includes(fiction), `jobs strip still advertises ${fiction}, which no live listing uses`);
  }
});

test('landing is reachable and legible by keyboard', () => {
  assert.match(html, /#view-landing :focus-visible/, 'expected explicit focus rings on the landing');
  assert.match(html, /scroll-margin-top/, 'anchors need scroll-margin under the fixed header');
});

// Banning the bare word "verified" is too blunt: the page is allowed to say
// "nothing is verified", and in fact should. What must never come back is an
// affirmative verification claim, so these patterns target that instead.
const VERIFICATION_CLAIMS = [
  /verified project/i,
  /voice (?:is )?verified/i,
  /identity (?:is )?verified/i,
  /certified/i,
  /trusted by [\d,]+/i,
  /100% human-to-human/i,
];

test('nothing reachable by search or social share calls anything verified', () => {
  // The meta and JSON-LD blocks are the widest-reaching text on the site, and
  // they used to promise "verified project proof" while the product explicitly
  // verifies nothing. Same for the title's promise of a confident interview
  // decision, which is an outcome the product cannot promise.
  const share = html.slice(0, html.indexOf('</head>'));
  for (const claim of VERIFICATION_CLAIMS) {
    assert.ok(!claim.test(share), `head/meta/OG/JSON-LD must not claim ${claim}`);
  }
  assert.ok(!/Confident Interview Decision/i.test(share), 'title must not promise an interview outcome');
  assert.match(share, /never scored/);
  // Denying verification is allowed, and the JSON-LD is expected to do it.
  assert.match(share, /nothing is presented as independently verified/);
});

test('the hero preview does not pretend to be a media player', () => {
  // There is no audio asset anywhere in the repo. The hero used to draw a play
  // triangle over a running "0:47 / 2:00" timecode on a control that only
  // navigated, which read as broken and as a false claim at the same time.
  // The control is now a labelled pill, so it is honest without needing a
  // caption bolted underneath it.
  assert.match(landing, /class="lp-play-label">Open this profile</);
  assert.ok(!/lp-play::after/.test(html), 'the play-triangle pseudo-element is back');
  // A running timecode is the other half of the illusion.
  assert.ok(!/\d:\d\d \/ 2:00/.test(landing), 'a running transport timecode is back in the hero');
  assert.match(landing, /class="lp-ptime">2:00 max</);
  // The caption that used to sit awkwardly below the card is gone for good.
  assert.ok(!/lp-pnote/.test(html), 'the still-frame caption was removed; it should not come back');
});

test('the FAQ answers only what the code actually does', () => {
  // Native <details>: works with JS disabled, keyboard reachable for free.
  // `landing` is already the <main> slice, so there is no closing tag to cut on.
  const faq = landing.slice(landing.indexOf('lp-faq-list'));
  // Answers are hand-wrapped across source lines, so prose assertions need the
  // collapsed copy or a reflow breaks them for no real reason.
  const faqFlat = faq.replace(/\s+/g, ' ');
  assert.ok(faq.length > 0, 'expected a questions section');
  const rows = faq.match(/<details/g) || [];
  assert.equal(rows.length, 7, 'expected seven questions');
  assert.equal((faq.match(/<summary>/g) || []).length, 7, 'every question needs a summary');
  assert.ok(!faq.includes('<script'), 'the FAQ must not need JS');

  for (const claim of VERIFICATION_CLAIMS) {
    assert.ok(!claim.test(faqFlat), `FAQ must not imply ${claim}`);
  }
  // Denying verification is the whole point of the second answer.
  assert.match(faqFlat, /nothing is stamped as verified/);
  // The challenge phrase IS transcribed, just never stored or scored, so the
  // answer has to say "checked" rather than "not transcribed".
  assert.match(faqFlat, /only to confirm a live microphone/);
  assert.ok(!/not transcribed/i.test(faqFlat), 'the phrase is transcribed in memory; do not deny it');
  assert.match(faqFlat, /not stored against your profile/);
});

test('the FAQ answers the two objections readers actually raise', () => {
  // Both of these were written from real objections posted against the product,
  // not anticipated. If either answer disappears the page goes back to being
  // silent on the two questions that decide whether someone keeps reading.
  const faq = faq_flat();
  // "Why not just use LinkedIn/YouTube?" — the differentiation question.
  assert.match(faq, /Why not just post my demo on LinkedIn or YouTube/);
  assert.match(faq, /recruiter handed four links opens whichever they clicked first/);
  // "Someone else could record it for you" — the proxy-application question,
  // answered by conceding the limit rather than claiming around it.
  assert.match(faq, /not that the person recording is the applicant/);
  assert.match(faq, /at interview, references and offer stage/);
  assert.match(faq, /nothing is stamped as verified/);
});

test('the 80% jobs gate is disclosed rather than discovered', () => {
  // app.js gates the board at 80% and even tells the candidate they are at 46%.
  // /jobs now serves that same gated board, so the landing cannot claim the
  // public page is ungated. The FAQ names the gate, the threshold, and what it
  // actually covers, so nobody discovers it only after investing ten minutes.
  assert.match(faq_flat(), /reach 80% first|jobs board is gated/);
  assert.match(faq_flat(), /gate is on the search, the filters and the match score/);
  // The count has to match CHECKLIST_DEFS in js/profileChecklist.js.
  const defs = fs.readFileSync(path.join(__dirname, '..', 'js', 'profileChecklist.js'), 'utf8');
  const keys = (defs.match(/key:\s*'[a-z0-9-]+'/g) || []).length;
  assert.equal(keys, 7, 'CHECKLIST_DEFS changed; the landing copy needs updating to match');
  assert.match(faq_flat(), /Seven things count towards it/);
  // And the visible tick row must have one segment per checklist item.
  const ticks = landing.slice(landing.indexOf('lp-ticks"'), landing.indexOf('lp-rec"'));
  assert.equal((ticks.match(/<span><\/span>/g) || []).length, keys, 'tick row must match the checklist length');
});

function faq_flat() {
  return landing.slice(landing.indexOf('lp-faq-list')).replace(/\s+/g, ' ');
}

test('the landing layout collapses instead of overflowing on a phone', () => {
  // The redesign was drawn on a 1280px canvas. Three failure modes were live:
  //
  //   1. Multi-column rows (steps, feedback grid, stats) and the proof diptych
  //      stayed side by side until a breakpoint that did not exist.
  //   2. The hero transport card used `margin: auto` to centre itself, which
  //      centres a box that already fills its parent - so on a phone it ran edge
  //      to edge. Same for the decorative waveform rows: a fixed 170-bar flex
  //      row with a 2px min-width per bar cannot fit a 360px screen and gave
  //      the page a horizontal scrollbar.
  //   3. Content-sized elements (pill buttons, the seven ticks, badge rows)
  //      still overflowed after the grids collapsed.
  //
  // These are asserted structurally rather than rendered, because there is no
  // browser in the test suite; what matters is that the rules exist and that
  // each one names the selector it is meant to rescue.

  const css = html.slice(html.indexOf('LANDING PAGE REDESIGN'), html.indexOf('</style>', html.indexOf('LANDING PAGE REDESIGN')));

  // Every breakpoint the page needs, narrowest last so the file stays readable.
  for (const width of [900, 820, 640, 400]) {
    assert.match(css, new RegExp(`@media \\(max-width: ${width}px\\)`), `expected a ${width}px breakpoint`);
  }
  // Attribute order varies, so match the tag rather than one ordering of it.
  assert.match(
    html,
    /<meta[^>]*name="viewport"[^>]*>|<meta[^>]*content="width=device-width[^>]*>/,
    'a responsive page needs a viewport meta'
  );
  assert.match(html, /<meta[^>]*name="viewport"[^>]*content="[^"]*width=device-width|<meta[^>]*content="[^"]*width=device-width[^>]*name="viewport"/);

  // 1. The two-column rows collapse.
  const collapse = css.slice(css.indexOf('@media (max-width: 820px)'), css.indexOf('@media (max-width: 640px)'));
  for (const sel of ['.lp-steps', '.lp-fb-grid', '.lp-stats']) {
    assert.match(
      collapse,
      new RegExp(`#view-landing \\${sel}\\s*\\{[\\s\\S]*?grid-template-columns:\\s*1fr`),
      `${sel} must collapse to one column on a tablet`
    );
  }
  assert.match(
    collapse,
    /#view-landing \.lp-fb-card\.wide\s*\{[\s\S]*?grid-column:\s*auto/,
    'the full-width feedback card must stop spanning two columns'
  );

  // The diptych stacks at its own, wider breakpoint because both halves are
  // readable at 820px and stacking them there would waste tablet width.
  const diptych = css.slice(css.indexOf('@media (max-width: 900px)'), css.indexOf('@media (max-width: 820px)'));
  for (const sel of ['.lp-proof-left', '.lp-proof-right']) {
    assert.match(
      diptych,
      new RegExp(`#view-landing \\${sel}\\s*\\{[\\s\\S]*?flex:\\s*1 1 100%`),
      `${sel} must take a full row once the diptych stacks`
    );
  }

  // 2. Nothing may be centred with auto margins alone, and the decorative bar
  // rows must clip rather than push the page sideways.
  const player = landing.slice(landing.indexOf('class="lp-player"'));
  assert.ok(!player.includes('style="margin:auto'), 'the transport card must not be centred inline');
  assert.match(css, /\.lp-player\s*\{[\s\S]*?width:\s*calc\(100% - /, 'the transport card needs a gutter at every width');
  assert.match(
    css,
    /\[data-wave\]\s*\{[\s\S]*?overflow:\s*hidden/,
    'the decorative waveform rows must clip instead of widening the page'
  );

  // 3. Content-sized elements get their own rules rather than being left to
  // luck at the narrowest width.
  const small = css.slice(css.indexOf('@media (max-width: 400px)'));
  assert.match(
    small,
    /\.lp-cta\s*\{[\s\S]*?flex-direction:\s*column/,
    'the hero CTA buttons must stack rather than sit side by side at 360px'
  );
  assert.match(small, /\.lp-cta \.lp-btn\s*\{[\s\S]*?width:\s*100%/, 'stacked CTA buttons should fill the row');
  assert.match(small, /\.lp-play\s*\{[\s\S]*?flex:\s*1 1 100%/, '"Open this profile" cannot share a row with a timecode at 360px');
  assert.match(small, /\.lp-ticks\s*\{[\s\S]*?gap:\s*4px/, 'seven ticks plus a 6px gap do not fit 360px');

  // And the awkward-on-mobile alignments get undone rather than left ragged.
  const phone = css.slice(css.indexOf('@media (max-width: 640px)'), css.indexOf('@media (max-width: 400px)'));
  assert.match(
    phone,
    /\.lp-rec \.lp-right\s*\{[\s\S]*?align-items:\s*flex-start/,
    'stacked badges should left-align, not float in the middle'
  );
  assert.match(phone, /\.lp-item\s*\{[\s\S]*?display:\s*block/, 'the 96px label column leaves no room for the sentence on a phone');

  // Regression guard: the old three-breakpoint set alone is what shipped the
  // broken phone layout, so the narrowest tier must not be dropped again.
  assert.ok(
    css.indexOf('@media (max-width: 400px)') > css.indexOf('@media (max-width: 640px)'),
    'the small-phone tier must come after the phone tier so it wins'
  );
});

test('the app shell themes every signed-in surface without touching the landing', () => {
  // The dashboard block themes one view. The jobs board, the admin table, the
  // candidate profile and, above all, the overlays app.js appends to
  // document.body were still the old slate-and-blue SaaS console.
  //
  // This block and tailwind.config.js are that pass. The colours live in the
  // config, because the landing uses custom .lp-* classes and zero Tailwind
  // colour utilities, so remapping the slate and blue ramps there reaches every
  // app surface - including the body-level overlays - and provably cannot reach
  // the marketing page.
  // Slice from the opening <style>, not from the banner text: the banner sits
  // inside the block's leading comment, so starting there would leave a
  // dangling comment that the strip below cannot close.
  const banner = html.indexOf('APP SHELL');
  const start = html.lastIndexOf('<style>', banner) + '<style>'.length;
  const end = html.indexOf('</style>', banner);
  assert.ok(start > 0 && end > start, 'expected an app shell theme block');
  const css = html.slice(start, end);

  // Why this scope, and why it has to be this scope. It is a disjunction: the
  // first arm reaches the body-appended overlays app.js builds, the second
  // covers the auth modals, which open from the marketing header while the
  // landing is still the active view. Dropping the second arm does not fail
  // any other test here - sign-in just silently reverts to the old SaaS look.
  const APP_SCOPE = 'body:is(:not(:has(#view-landing.active-view)), :has(:is(#modal-login, #modal-signup, #modal-otp):not(.hidden)))';
  assert.match(
    css,
    new RegExp(APP_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the app layer must key off the landing being inactive to reach body-level overlays'
  );
  assert.ok(
    css.includes(':has(:is(#modal-login, #modal-signup, #modal-otp):not(.hidden))'),
    'the app layer must also switch on while an auth modal is open, or sign-in renders unthemed over the landing'
  );
  // The auth arm must stay narrow. A blanket [id^="modal-"] here would silently
  // recolour the terms, contact, support, feedback and trust dialogs, which are
  // part of the approved landing design and were never in scope.
  assert.ok(
    !css.replace(/\/\*[\s\S]*?\*\//g, '').includes('[id^="modal-"]'),
    'the auth arm must name the three auth modals, not every modal-* overlay'
  );
  // The selector has to actually match the auth modals the marketing page opens.
  for (const id of ['modal-login', 'modal-signup', 'modal-otp']) {
    assert.ok(
      new RegExp(`id="${id}"`).test(html),
      `expected the static auth overlay #${id} to still exist`
    );
    assert.ok(
      new RegExp(`id="${id}"[\\s\\S]{0,400}?fixed inset-0`).test(html),
      `#${id} must be a fixed overlay that the app layer can match`
    );
  }

  // The lighter accent is app-only. The landing keeps the approved #D9481F,
  // which is asserted separately above; if this ever matches, the marketing
  // page has been recoloured without approval.
  assert.match(css, /--a-accent:\s*#E85D2A/, 'the app accent is the lighter burnt orange');

  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // #D9481F may appear in a SELECTOR - the chrome overrides have to match the
  // class name the markup already uses - but never as a value, or the landing
  // accent would leak back into the app.
  const values = stripped.replace(/^[^{}]*\{/gm, '');
  assert.ok(!values.includes('#D9481F'), 'the app layer must not paint anything the landing accent');

  // Every rule after the header comment must be scoped. An unscoped `.bg-white`
  // or `h1` here would repaint the landing, which is the one thing this block
  // exists to avoid.
  const rules = stripped.match(/[^{}]+\{[^{}]*\}/g) || [];
  assert.ok(rules.length > 10, 'expected the app shell to define a real set of rules');
  // A naive split on "," breaks inside :is(...), which the app scope uses, so
  // split on commas at paren depth zero only.
  const splitSelectors = (list) => {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  for (const block of rules) {
    const selector = block.slice(0, block.indexOf('{')).trim();
    if (selector.startsWith('@') || !selector) continue;
    for (const part of splitSelectors(selector)) {
      const sel = part.trim();
      if (!sel) continue;
      assert.ok(
        sel.startsWith(APP_SCOPE),
        `app shell rule "${sel}" is not scoped away from the landing page`
      );
    }
  }

  // The parts that are not colours: type, borders, radii, focus. A palette swap
  // alone still leaves Inter headings and drop shadows, which is what made the
  // dashboard read as a different product.
  assert.match(css, /--a-disp:\s*'Fraunces'/, 'app headings use the landing display face');
  assert.match(css, /--a-mono:\s*'JetBrains Mono'/, 'app labels use the landing mono face');
  assert.match(css, /\.shadow-lg,[\s\S]*?box-shadow:\s*none/, 'paper separates with hairlines, not shadows');
  assert.match(css, /\.rounded-2xl\s*\{[\s\S]*?border-radius:\s*18px/, 'cards use the landing radius');
  assert.match(css, /:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--a-accent\)/, 'focus ring uses the app accent');

  // The shared header and footer carry the accent as hardcoded Tailwind
  // arbitrary values rather than a token, so the palette swap cannot reach
  // them. These rules are what lightens the app chrome - and [class~=] must be a
  // whole-name match, or the bg-[#D9481F]/10 live badge gets flattened to an
  // opaque accent.
  assert.match(css, /\[class~="bg-\[#D9481F\]"\]/, 'the app chrome needs the accent override');
  assert.match(css, /\[class~="bg-\[#D9481F\]\/10"\]/, 'the alpha badge must keep its own transparency');
  assert.ok(
    !/\[class\*="bg-\[#D9481F\]"\]/.test(css),
    'substring matching would paint the /10 badge solid accent'
  );

  // The accent buttons keep the landing glow that the blanket shadow reset took
  // from them, here for every solid accent button rather than the dashboard's.
  assert.match(
    css,
    /button\.bg-primary,[\s\S]*?box-shadow:\s*0 10px 26px -14px rgba\(232, 93, 42/,
    'solid accent buttons keep the warm glow'
  );
});

test('the palette is remapped in the Tailwind config, where it can reach the overlays', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', 'tailwind.config.js'), 'utf8');

  // The landing is the control: it must contain no Tailwind colour utility at
  // all, otherwise remapping the ramps would repaint it.
  const landingStart = html.indexOf('id="view-landing"');
  const landingEnd = html.indexOf('id="view-dashboard"');
  const landing = html.slice(landingStart, landingEnd);
  assert.ok(landing.length > 0, 'expected the landing view');
  assert.equal(
    (landing.match(/\b(?:bg|text|border|from|via|to|ring|divide)-(?:slate|blue)-[0-9]+/g) || []).length,
    0,
    'the landing must stay on .lp-* classes so the palette swap cannot reach it'
  );
  assert.ok(landing.includes('lp-'), 'the landing should still use its own class names');

  // slate is the neutral scale; blue is the accent scale. Both had to be fully
  // specified: extend.colors merges, so an omitted shade falls back to the
  // Tailwind default and a cool blue survives in the middle of a warm ramp.
  for (const shade of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']) {
    assert.ok(config.includes(`"slate-${shade}"`), `slate-${shade} must be specified, not inherited from Tailwind`);
    assert.ok(config.includes(`"blue-${shade}"`), `blue-${shade} must be specified, not inherited from Tailwind`);
  }

  // The blue ramp's dark end is ink, not orange: bg-blue-900 is the Apply
  // button and border/text-blue-900 is the outline buttons, and the editorial
  // equivalent of that solid block is ink.
  assert.match(config, /"blue-900":\s*"#17130E"/, 'blue-900 becomes ink');
  assert.match(config, /"blue-500":\s*"#E85D2A"/, 'the accent sits at blue-500');
  assert.match(config, /primary:\s*"#E85D2A"/, 'the M3 primary token follows the accent');
  assert.ok(!config.includes('#1E3A8A'), 'the old navy primary must be gone');
  assert.ok(!config.includes('#E0E7FF'), 'the old blue tint must be gone');
});

test('every text token in the palette clears 4.5:1 on every surface it lands on', () => {
  // The 0.8.63 palette remap passed every structural test and still shipped an
  // unreadable app: white on the accent fill was 3.48:1, the accent as text was
  // 3.43:1, slate-500 was 3.75:1, and slate-300 was 1.61:1 while carrying real
  // text. Regex assertions cannot catch that - they check that a colour was
  // mentioned, not that it can be read - so this one computes WCAG 2.1
  // contrast from the token file itself.
  const config = fs.readFileSync(path.join(__dirname, '..', 'tailwind.config.js'), 'utf8');

  // Read the token values out of the config rather than restating them here, so
  // this test cannot drift from what actually ships.
  const token = (name) => {
    // Flat quoted key: "slate-400": "#746C60"
    const quoted = new RegExp(`"${name}":\\s*"(#[0-9A-Fa-f]{6})"`).exec(config);
    if (quoted) return quoted[1].toUpperCase();
    // Bare key: primary: "#E85D2A"
    const bare = new RegExp(`(^|[\\s,{])${name}:\\s*"(#[0-9A-Fa-f]{6})"`, 'm').exec(config);
    if (bare) return bare[2].toUpperCase();
    // Nested scale: amber: { 700: "#96620F", ... }
    const nested = new RegExp(`${name}:\\s*\\{[\\s\\S]*?(\\d{3}):\\s*"(#[0-9A-Fa-f]{6})"`).exec(config);
    return nested ? nested[2].toUpperCase() : null;
  };
  // slate and blue are flat keys; amber/rose/emerald are nested scales.
  const ramp = (name, shade) =>
    token(`${name}-${shade}`) ||
    (() => {
      const block = new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\}`).exec(config);
      if (!block) return null;
      const hit = new RegExp(`\\b${shade}:\\s*"(#[0-9A-Fa-f]{6})"`).exec(block[1]);
      return hit ? hit[1].toUpperCase() : null;
    })();

  const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
  const lum = (h) => {
    const [r, g, b] = rgb(h).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // The lightest surfaces app text is ever placed on. Solving against only the
  // card is how a palette passes this test and fails on the page.
  const CARD = token('surface-container-lowest');
  const PAPER = token('surface');
  const TINT = token('primary-fixed');

  // [label, foreground, surfaces it must clear]. 4.5:1 is AA for body text.
  const pairs = [
    ['ink', token('slate-900'), [CARD, PAPER, TINT]],
    ['slate-800', token('slate-800'), [CARD, PAPER, TINT]],
    ['slate-700', token('slate-700'), [CARD, PAPER, TINT]],
    ['slate-600', token('slate-600'), [CARD, PAPER, TINT]],
    ['slate-500', token('slate-500'), [CARD, PAPER, TINT]],
    ['slate-400', token('slate-400'), [CARD, PAPER]],
    ['primary-text', token('primary-text'), [CARD, PAPER, TINT]],
    ['amber-700', ramp('amber', 700), [CARD, ramp('amber', 50)]],
    ['rose-600', ramp('rose', 600), [CARD, ramp('rose', 50)]],
    ['emerald-700', ramp('emerald', 700), [CARD, ramp('emerald', 50)]],
    ['indigo-600', token('indigo-600'), [CARD, token('indigo-50')]],
    ['sky-700', token('sky-700'), [CARD, token('sky-50')]],
    // `outline` is used for the ink-panel eyebrows, so it is a text token.
    ['outline', token('outline'), [CARD, PAPER]],
  ];

  for (const [label, fg, bgs] of pairs) {
    assert.ok(fg, `palette is missing the ${label} token, so this test cannot check it`);
    for (const bg of bgs) {
      const got = contrast(fg, bg);
      assert.ok(
        got >= 4.5,
        `${label} (${fg}) on ${bg} is ${got.toFixed(2)}:1, under the 4.5:1 minimum`
      );
    }
  }

  // Solid fills take a label. The accent is light by design, so its label has
  // to be ink - this is the check that would have caught the 48 white-on-accent
  // buttons.
  const ACCENT = token('primary');
  const ON_ACCENT = token('on-primary');
  assert.ok(
    contrast(ON_ACCENT, ACCENT) >= 4.5,
    `the label on the accent fill (${ON_ACCENT} on ${ACCENT}) is ${contrast(ON_ACCENT, ACCENT).toFixed(2)}:1`
  );

  // The accent is still allowed to be light - that was a deliberate request -
  // but only where it is a graphic. Guard against it quietly being used as body
  // text again.
  assert.match(config, /"primary-text":\s*"#B9491F"/, 'the readable accent tone must exist as its own token');
  assert.ok(
    contrast(ACCENT, CARD) < 4.5,
    'the accent fill is expected to be too light for text; if it now passes, the accent-text split can be retired'
  );

  // The ink panels keep the LIGHT accent, because the deep one is 3.55:1 there.
  const INK = token('slate-900');
  assert.ok(
    contrast(ACCENT, INK) >= 4.5,
    `the accent must stay readable on ink panels (${contrast(ACCENT, INK).toFixed(2)}:1)`
  );

  // slate-300 is a border step and is deliberately NOT in the list above: it
  // is 1.61:1 on a card. The test below pins that it carries no light-surface
  // text, which is the only reason leaving it light is safe.

  // The config token is not the whole story: 48 buttons say `bg-primary
  // text-white` in the markup, and what actually paints them is the app
  // shell's .bg-primary rule. Checking only `on-primary` let a regression
  // through when that rule was edited, so resolve the shell's own variables and
  // compute the pairing it produces.
  const banner = html.indexOf('APP SHELL');
  const shellCss = html.slice(banner, html.indexOf('</style>', banner));
  const shellVar = (name) => {
    const hit = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`, 'i').exec(shellCss);
    return hit ? hit[1].toUpperCase() : null;
  };
  const shellAccent = shellVar('--a-accent');
  const shellInk = shellVar('--a-ink');
  assert.ok(shellAccent && shellInk, 'the app shell must define --a-accent and --a-ink as hex');

  // It must also actually override the label, not merely restate a fill.
  // Several groups mention .bg-primary - the glow is one of them - so find the
  // group that actually declares a colour on a bare .bg-primary.
  const shellRules = [...shellCss.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }))
    .filter((r) => !r.selector.startsWith('@') && r.selector.includes('.bg-primary'));
  const labelRules = shellRules.filter(
    (r) => /color:\s*var\(--a-ink\)/.test(r.body) && /(^|[\s,])(\.bg-primary)([\s,{:]|$)/.test(r.selector)
  );
  assert.ok(
    labelRules.length > 0,
    'a solid accent fill must declare its own label; text-white in the markup is 3.48:1 on this accent'
  );
  assert.ok(
    contrast(shellInk, shellAccent) >= 4.5,
    `the app shell's label on its accent fill is ${contrast(shellInk, shellAccent).toFixed(2)}:1`
  );

  // And the accent-as-text route must point at the deep tone, not the fill tone.
  assert.match(
    shellCss,
    /\.text-primary[^{]*\{[^}]*color:\s*var\(--a-accent-text\)/,
    'accent used as text must resolve to --a-accent-text'
  );
  const shellAccentText = shellVar('--a-accent-text');
  assert.ok(shellAccentText, 'the app shell must define --a-accent-text');
  });

// ---------------------------------------------------------------------------
// The cascade is part of the contract.
//
// 0.8.64 gave .text-primary one colour for the whole app so accent-as-text
// would clear 4.5:1. The dashboard also uses .text-primary as the LABEL on an
// accent FILL, where the correct colour is ink. Both rules are correct on their
// own; together they decided the button by specificity, and the app layer won.
// The hero's "Add Proof Project" and "Preview" buttons shipped as #B9491F on
// #E85D2A - 1.49:1, unreadable, and not something any colour-value assertion in
// this file could ever have caught. So this one resolves the cascade.
// ---------------------------------------------------------------------------

test('the dashboard accent-fill label outranks the app-wide accent-as-text rule', () => {
  // A small CSS specificity calculator. :is() takes its MOST specific
  // argument, :not()/:has() take their argument's, :where() takes nothing.
  // Split a selector list at top-level commas only - commas inside :is()/:not()
  // are part of the argument, not a new selector.
  const splitTop = (s) => {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const maxOf = (list) =>
    list.reduce(
      (acc, item) => {
        const w = specificity(item);
        return w.weight > acc.weight ? w : acc;
      },
      { ids: 0, classes: 0, types: 0, weight: 0 }
    );

  function specificity(selector) {
    let ids = 0;
    let classes = 0;
    let types = 0;
    let i = 0;
    const s = selector;
    const add = (w) => {
      ids += w.ids;
      classes += w.classes;
      types += w.types;
    };
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '>' || ch === '+' || ch === '~' || ch === ',') { i++; continue; }
      if (ch === '*') { i++; continue; }
      if (ch === '#') {
        const before = i;
        i++;
        while (i < s.length && /[\w-]/.test(s[i])) i++;
        if (i === before + 1) continue; // a bare '#' is not a selector part
        ids++;
        continue;
      }
      if (ch === '.') {
        const before = i;
        i++;
        while (i < s.length && /[\w\\-]/.test(s[i])) i++;
        if (i === before + 1) continue;
        classes++;
        continue;
      }
      if (ch === '[') {
        const close = s.indexOf(']', i);
        if (close < 0) { i = s.length; continue; }
        i = close + 1;
        classes++;
        continue;
      }
      if (ch === ':') {
        const name = /^::?[\w-]*/.exec(s.slice(i))[0];
        i += name.length;
        if (name.startsWith('::')) {
          types++; // pseudo-element
          continue;
        }
        const paren = s[i] === '(';
        if (!paren) {
          classes++; // :hover, :focus-visible, ...
          continue;
        }
        const start = s.indexOf('(', i);
        let depth = 0;
        let end = s.length;
        for (let j = start; j < s.length; j++) {
          if (s[j] === '(') depth++;
          else if (s[j] === ')' && --depth === 0) { end = j + 1; break; }
        }
        const body = s.slice(start + 1, end - 1);
        i = end;
        if (name === ':where') continue; // contributes nothing
        if (name === ':is') add(maxOf(splitTop(body)));
        else add(specificity(body)); // :not(), :has()
        continue;
      }
      // Type selector (element name).
      const before = i;
      while (i < s.length && /[\w-]/.test(s[i])) i++;
      if (i === before) { i++; continue; } // never stall
      types++;
    }
    return { ids, classes, types, weight: ids * 10000 + classes * 100 + types };
  }

  // Collect real rules out of the shipped CSS rather than restating selectors.
  // Only <style> blocks: scanning the whole document also matches braces inside
  // inline JS and markup, which are not selectors at all.
  const styleText = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const rulesIn = (css) =>
    [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .map((m) => ({ selector: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2] }))
      .filter((r) => r.selector && !r.selector.startsWith('@') && /color:\s*var\(/.test(r.body));

  const all = rulesIn(styleText);

  // The app layer: the rule that gives .text-primary the accent-as-text tone.
  const appLayer = all.find(
    (r) => /\.text-primary/.test(r.selector) && /color:\s*var\(--a-accent-text\)/.test(r.body)
  );
  assert.ok(appLayer, 'could not find the app-wide .text-primary accent-as-text rule');
  // Pick the single compound selector that carries the class, splitting the rule's
  // selector LIST at top-level commas only - the app scope's :is() contains
  // commas of its own, and cutting inside it would measure a fragment of the
  // selector rather than the thing the browser actually applies.
  const compoundWith = (selector, needle) =>
    splitTop(selector).map((s) => s.trim()).find((s) => s.includes(needle));

  const appSel = compoundWith(appLayer.selector, '.text-primary');
  const appSpec = specificity(appSel);

  // The dashboard: the rule that gives an accent FILL its ink label.
  const dashLayer = all.find(
    (r) => r.selector.includes('#view-dashboard') && /\.bg-white\.text-primary/.test(r.selector) &&
      /color:\s*var\(--d-ink\)/.test(r.body)
  );
  assert.ok(dashLayer, 'could not find the dashboard accent-fill label rule');
  const dashSel = compoundWith(dashLayer.selector, '.bg-white.text-primary');
  const dashSpec = specificity(dashSel);

  assert.ok(
    dashSpec.weight > appSpec.weight,
    `the dashboard label (${dashSel} = ${dashSpec.weight}) must outrank the app-wide ` +
    `accent-as-text rule (${appSel} = ${appSpec.weight}); otherwise .text-primary wins and the ` +
    'button paints accent text on an accent fill at 1.49:1'
  );

  // Specificity is necessary but not sufficient - the winning declaration has
  // to be the legible one, and the :hover variant must still win at hover.
  const lum = (h) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16)).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const dashVars = (name) => {
    const hit = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`, 'i').exec(html);
    return hit ? hit[1].toUpperCase() : null;
  };
  const inkOnAccent = contrast(dashVars('--d-ink'), dashVars('--d-accent'));
  assert.ok(inkOnAccent >= 4.5, `the dashboard's ink label on its accent fill is only ${inkOnAccent.toFixed(2)}:1`);

  const hover = all.find(
    (r) => r.selector.includes('#view-dashboard') && /\.bg-white\.text-primary:hover/.test(r.selector)
  );
  assert.ok(hover, 'the accent-fill hover rule is missing');
  const hoverSel = compoundWith(hover.selector, ':hover');
  const hoverSpec = specificity(hoverSel);
  assert.ok(
    hoverSpec.weight > dashSpec.weight,
    `the hover rule (${hoverSpec.weight}) must outrank the resting rule (${dashSpec.weight}), ` +
    'or raising the resting rule above the app layer also killed the hover background'
  );
  // Hover darkens the fill, so the ink label has to survive on that too. Read
  // the token the hover rule actually references rather than assuming one, so
  // this cannot pass by checking a token nobody paints.
  const hoverFillVar = /background(?:-color)?:\s*var\((--[a-z0-9-]+)\)/.exec(hover.body);
  assert.ok(hoverFillVar, 'the hover rule must set an explicit fill colour');
  const hoverFill = dashVars(hoverFillVar[1]);
  assert.ok(hoverFill, `${hoverFillVar[1]} is referenced by the hover rule but never defined`);
  assert.notEqual(
    hoverFill,
    dashVars('--d-accent-2'),
    'the accent-as-text tone cannot be used as a hover FILL under an ink label'
  );
  const hoverInk = contrast(dashVars('--d-ink'), hoverFill);
  assert.ok(hoverInk >= 4.5, `ink on the hovered accent fill (${hoverFill}) is only ${hoverInk.toFixed(2)}:1`);
});

test('no text is painted in a step that cannot be read on a light card', () => {
  // The specific bug this pass was for: text-slate-300 on a white empty-state
  // card, at 1.61:1. The app shell lifts it, but a silent override is a bad
  // place to leave a legibility fix, so the markup itself must not ask for it.
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  // The two legitimate uses of a light slate step are light text on ink. Both
  // were repointed at slate-200 so the blanket lift is safe; pin that.
  assert.ok(
    !/bg-slate-(?:800|900|950)[^"']*text-slate-300/.test(appJs + html),
    'light text on an ink background should use slate-200, not the border step slate-300'
  );

  // The app shell must carry the lift, or the markup would have to.
  const start = html.indexOf('APP SHELL');
  const css = html.slice(start, html.indexOf('</style>', start));
  assert.match(
    css,
    /\.text-slate-300\s*\{\s*color:\s*var\(--a-quiet\)/,
    'text-slate-300 must be lifted to a readable tone in the app shell'
  );
  assert.match(css, /--a-quiet:\s*#746C60/, 'the quiet tone is the solved 4.5:1 slate-400');

  // And the empty-state icons that motivated it must still be there, so the
  // rule cannot be deleted as dead CSS.
  assert.ok(appJs.includes('text-slate-300'), 'the empty-state icons moved to this rule; if they are gone, re-check it');
});

test('the dashboard speaks the same visual language as the landing page', () => {
  // The landing page was rebuilt in paper / ink / burnt-orange with Fraunces
  // headings, and the shared chrome (#site-header, #site-footer) is themed to
  // match on every page. The dashboard body was never converted, so a
  // signed-in candidate got an editorial header sitting on top of the old
  // slate-and-blue console. This block is the pass that fixes it.
  //
  // The dashboard is themed by OVERRIDING the Tailwind utilities already in
  // the markup, scoped under #view-dashboard. The app shell block further up
  // takes the other half of the job: it supplies the palette to the rest of
  // the app, including the overlays app.js appends to document.body. Two
  // things must still hold here:
  //
  //   1. The overrides are scoped. A bare `.bg-white { background: ... }` here
  //      would repaint the marketing page too, which shares almost none of its
  //      class names but would still inherit a font or radius rule.
  //   2. They still win. Tailwind emits single-class utilities, and an
  //      `#id .class` selector beats that on specificity without needing
  //      !important. If someone later drops the #view-dashboard prefix for
  //      readability, the dashboard silently reverts to the Tailwind default.
  const css = html.slice(html.indexOf('editorial theme'), html.indexOf('</style>', html.indexOf('editorial theme')));
  assert.ok(css.length > 0, 'expected a dashboard theme block');

  // The palette is named once, on the view itself, not scattered per rule.
  assert.match(css, /#view-dashboard\s*\{[\s\S]*?--d-accent:\s*#E85D2A/, 'the dashboard uses the lighter app accent, not the landing accent');
  assert.match(css, /#view-dashboard\s*\{[\s\S]*?--d-paper:\s*#F7F3EC/, 'paper background matches the landing');
  assert.match(css, /#view-dashboard\s*\{[\s\S]*?--d-ink:\s*#17130E/, 'ink text matches the landing');
  assert.match(css, /--d-disp:\s*'Fraunces'/, 'display headings use the landing display face');
  assert.match(css, /--d-mono:\s*'JetBrains Mono'/, 'labels use the landing mono face');

  // Every override must be scoped to the dashboard or one of the shared chrome
  // IDs. An unscoped utility selector here would leak into the admin, jobs and
  // candidate views.
  const rules = css.slice(css.indexOf('/* ---------- surfaces ----------'));
  // Split on commas at paren depth zero only: the app scope uses :is(), and a
    // naive split() cuts a selector in half and reports a false leak.
    const splitTop = (list) => {
      const out = [];
      let depth = 0;
      let cur = '';
      for (const ch of list) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur);
      return out;
    };
    for (const block of rules.match(/[^{}]+\{[^{}]*\}/g) || []) {
      const selector = block.slice(0, block.indexOf('{')).trim();
      if (selector.startsWith('@') || selector.startsWith('/*') || !selector) continue;
      for (const part of splitTop(selector)) {
        const sel = part.trim();
        if (!sel) continue;
        // Two ways to say "only while the dashboard is showing": anchor on the
        // view id, or on body once the router has marked it active. Both must
        // name #view-dashboard, so the rule still cannot reach another view.
        const ok =
          sel.startsWith('#view-dashboard') ||
          (sel.startsWith('body:has(#view-dashboard.active-view)') && sel.includes('#view-dashboard')) ||
          sel.startsWith('#site-') ||
          sel.startsWith('html') ||
          sel === 'body';
        assert.ok(ok, `dashboard theme rule "${sel}" is not scoped to #view-dashboard and will leak into other views`);
      }
    }

  // The pieces the dashboard actually renders. Each of these is a class string
  // that appears in index.html or app.js, so the override is doing real work
  // rather than styling something that no longer exists.
  const dashboard = html.slice(html.indexOf('id="view-dashboard"'), html.indexOf('id="view-jobs"'));
  assert.ok(dashboard.length > 0, 'expected the dashboard view');
  for (const cls of ['bg-gradient-to-br', 'from-primary', 'bg-slate-100', 'text-slate-500', 'bg-white']) {
    assert.ok(dashboard.includes(cls), `dashboard markup no longer contains ${cls}; the theme may need updating`);
  }

  // Blue is the specific thing being retired. If a `text-blue-100` or
  // `bg-primary` survives into the dashboard, the header and body disagree.
  assert.match(css, /\.text-blue-100\s*\{/, 'the dashboard still has blue-100 text to override');
  assert.match(
    css,
    /\.bg-gradient-to-br\.from-primary\.via-primary-container\.to-slate-900\s*\{\s*background:\s*var\(--d-ink\)/,
    'the hero card must be ink, not the old blue gradient'
  );
  // Shadows read as dirt on paper; the landing separates cards with hairlines.
  assert.match(css, /\.shadow-lg,[\s\S]*?box-shadow:\s*none/, 'cards should be separated by hairlines, not shadows');

  // Fraunces for headings and JetBrains Mono for labels is what makes it read
  // as the same product; a colour swap alone would still look like two sites.
  assert.match(css, /\.font-headline-lg,[\s\S]*?font-family:\s*var\(--d-disp\)/);
  assert.match(css, /\.font-label-sm\s*\{[\s\S]*?font-family:\s*var\(--d-mono\)/);

  // ...but the labels are not all tagged font-label-*. The metric and stat
  // labels spell it as `uppercase tracking-wider` in body sans, and they are
  // the dashboard's eyebrows - the thing the eye reads first. Left in sans they
  // are the last place the two pages disagree about typography.
  assert.match(
    css,
    /\.uppercase\.tracking-wider\s*\{[\s\S]*?font-family:\s*var\(--d-mono\)/,
    'the metric and stat labels must be mono like the landing eyebrows'
  );

  // The counters are the argument the view is making, so they get the display
  // face. Tabular figures matter because the values are written by textContent
  // and proportional digits make a 2-digit count jump wider than a 1-digit one.
  for (const id of ['dash-stat-views', 'dash-checklist-percent', 'dash-completion-percent']) {
    assert.match(css, new RegExp(`#view-dashboard #${id}[,\\s]`), `${id} should be set in the display face`);
  }
  assert.match(css, /font-variant-numeric:\s*tabular-nums/, 'live counters must not reflow as they tick');

  // The landing's buttons are body sans (.lp-btn is font-family: inherit) while
  // these carry font-label-*. Bold mono buttons are the one tell left.
  assert.match(
    css,
    /button\.bg-white\.text-primary,[\s\S]*?font-family:\s*inherit/,
    'the dashboard buttons must match the landing buttons, not render as mono'
  );

  // Flattening every shadow is right for cards on paper and wrong for the accent
  // buttons: the landing's primary CTA carries a warm glow, and the dashboard's
  // buttons went dead when the blanket reset hit them.
  assert.match(
    css,
    /\.bg-white\.text-primary\s*\{[\s\S]*?box-shadow:\s*0 10px 26px -14px rgba\(232, 93, 42/,
    'the accent buttons should keep the landing warm glow'
  );

  // .bento-card:hover carries a cool grey shadow (rgba(15,23,42,.08)) in the
  // global stylesheet. The cards wear bento-card with no shadow-* class, so no
  // #view-dashboard utility override can reach it and every project card
  // flashed blue-grey on hover. Extracted first so the checks below cannot pass
  // on a missing rule.
  const cardHover = css.match(/#view-dashboard \.bento-card:hover\s*\{[^}]*\}/);
  assert.ok(cardHover, 'the dashboard must override .bento-card:hover');
  assert.match(cardHover[0], /box-shadow:[^;]*rgba\(23, 19, 14/, 'card hover must be warm');
  assert.doesNotMatch(cardHover[0], /15, 23, 42/, 'the cool grey hover shadow is still reaching the dashboard');

  // The ink panels are framed 2px in the markup, which is a heavy box around
  // something the landing sets flush to the page.
  assert.match(css, /via-primary-container\.to-slate-900\s*\{[\s\S]*?border-width:\s*1px/);

  // The body is bg-surface (#F8FAFC, cool white). Without this, a dashboard
  // shorter than the viewport shows cold white under warm paper - which is every
  // new candidate with one project.
  assert.match(
    css,
    /body:has\(#view-dashboard\.active-view\)\s*\{\s*background:\s*#F7F3EC/,
    'paper must fill the viewport, not just the content box'
  );

  // --d-line on a card is 1.39:1. Pointing .text-slate-300 at it made the
  // empty-state folder and the unchecked checklist circles invisible.
  assert.match(
    css,
    /\.text-slate-300\s*\{\s*color:\s*var\(--d-ghost\)/,
    'placeholder glyphs must stay visible on the card'
  );

  // The global mobile h1/h2 rules are !important at 1.45rem, which is
  // unreadable for display sizes. They have to be beaten, or the dashboard
  // headings collapse to body size on exactly the screens this is fixing.
  assert.match(
    css,
    /@media \(max-width: 640px\)\s*\{\s*#view-dashboard h1\s*\{[\s\S]*?!important/,
    'the dashboard must beat the global mobile heading rules'
  );

  // Half the dashboard is not in index.html at all. renderDashboard() writes the
  // project cards, the checklist rows and the voice-verification line into
  // #view-dashboard from app.js template literals, so auditing only the static
  // markup misses exactly the classes most likely to be left in the old palette.
  // Each of these is a colour class that is genuinely rendered into the view, and
  // each needs a named override: `hover:bg-white` on the add-project card and
  // `text-emerald-700` / `text-amber-700` in the voice-status line were all
  // repainted by hand after being missed the first time round.
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  // renderDashboard(), renderProfileChecklist() and renderVoiceVerificationStatus()
  // are the three functions that write into the view's containers. Bounding the
  // slice at the next method rather than the end of the file matters: the job
  // apply modal and the interview overlay also use blue-50 chips, and letting
  // them into this slice would let a modal-only class pass as "themed".
  const dashRender = appJs.slice(
    appJs.indexOf('  renderDashboard() {'),
    appJs.indexOf('  checklistAction(')
  );
  const voiceLine = appJs.slice(appJs.indexOf('renderVoiceVerificationStatus(profile)'));
  assert.ok(dashRender.length > 0, 'expected the dashboard renderer in app.js');
  assert.match(voiceLine, /renderVoiceVerificationStatus/, 'expected the voice status renderer');
  // Collect the class tokens the block actually targets, with the CSS escapes
  // undone (.hover\:bg-white -> hover:bg-white) so they can be compared as
  // themselves. Matching on raw selector text is not good enough: searching for
  // "hover:bg-white" also finds "hover:bg-white/20" and calls it covered.
  const themed = new Set();
  for (const block of css.match(/[^{}]+\{[^{}]*\}/g) || []) {
    const selector = block.slice(0, block.indexOf('{'));
    if (selector.trim().startsWith('@')) continue;
    for (const part of selector.split(',')) {
      for (const m of part.matchAll(/((?:\\.|[^\s.,:>+~()[\]])+)/g)) {
        if (part[m.index - 1] === '.') themed.add(m[0].replace(/\\(.)/g, '$1'));
      }
    }
  }
  const emitted = dashRender + '\n' + voiceLine;
  for (const cls of [
    'hover:bg-white',
    'text-emerald-700',
    'text-amber-700',
    // group-hover:scale-105 left this list on purpose: the project cover now shows
    // the whole image (no crop), so it no longer zooms on hover.
  ]) {
    assert.ok(emitted.includes(cls), `the dashboard renderer no longer emits ${cls}; the theme may need updating`);
    assert.ok(
      themed.has(cls),
      `${cls} is rendered inside #view-dashboard but no rule overrides it, so it keeps the old palette`
    );
  }
});

test('landing respects prefers-reduced-motion', () => {
  assert.match(
    html,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#view-landing/,
    'expected a reduced-motion block covering the landing animations'
  );
});
