// Generative Engine Optimization: making Swapiki legible to AI answer engines.
//
// Search indexing and answer-engine citation are different problems. An index
// needs a page per query. An answer engine needs an entity it can trust: a
// connected graph, claims that are each attributable, and machine-readable text
// that says the same thing the visible page says.
//
// These tests hold three things in place, in descending order of how easy they
// are to break by accident:
//
//   1. One entity graph. Every surface emits the same Organization and WebSite
//      nodes under the same @id, so an engine merges the descriptions instead of
//      treating the homepage, the board and a job page as three unrelated
//      things that happen to share a name.
//
//   2. No fabrication. Not one of these nodes may claim a fact the product does
//      not establish - no founding date, no employee count, no ratings, no
//      social profiles, no "verified". A fabricated attribute is worse than a
//      missing one: it is a false statement that engines repeat and users act on.
//
//   3. Agreement with the page. Schema.org requires a FAQ answer to be present
//      in the visible content too. Markup that answers a question the reader
//      cannot see is the schema equivalent of invisible text.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const urlOf = (p) => pathToFileURL(p).href;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const INDEX_HTML = read('index.html');
const ROBOTS = read('robots.txt');
const LLMS = read('llms.txt');

/** The graph embedded in index.html, which is where the landing page lives. */
function landingLd() {
  const block = INDEX_HTML.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, 'index.html has no JSON-LD block');
  return JSON.parse(block[1]);
}

const types = (ld) => (ld['@graph'] || []).map((n) => n['@type']);
const oneOf = (ld, type) => (ld['@graph'] || []).filter((n) => n['@type'] === type);

// ---------------------------------------------------- the entity graph

test('the landing page declares one organization, one site and one app', () => {
  const ld = landingLd();
  assert.equal(oneOf(ld, 'Organization').length, 1);
  assert.equal(oneOf(ld, 'WebSite').length, 1);
  assert.equal(oneOf(ld, 'WebApplication').length, 1);
});

test('every surface resolves to the same organization @id', () => {
  // The whole point. If the board emitted its own organization string, an engine
  // would hold two Swapiki nodes and could cite either, or neither.
  const ORG = 'https://swapiki.com/#organization';
  const SITE = 'https://swapiki.com/#website';

  const ld = landingLd();
  const org = oneOf(ld, 'Organization')[0];
  assert.equal(org['@id'], ORG);
  assert.equal(oneOf(ld, 'WebSite')[0]['@id'], SITE);
  assert.equal(oneOf(ld, 'WebSite')[0].publisher['@id'], ORG);
  assert.equal(oneOf(ld, 'WebApplication')[0].publisher['@id'], ORG);
  assert.equal(oneOf(ld, 'WebApplication')[0].isPartOf['@id'], SITE);
  assert.equal(oneOf(ld, 'CollectionPage')[0].isPartOf['@id'], SITE);
});

test('the organization node carries a logo and an area served', () => {
  const org = oneOf(landingLd(), 'Organization')[0];
  assert.match(org.logo.url, /^https:\/\/swapiki\.com\/assets\/logo\/logo-horizontal\.svg$/);
  assert.equal(org.areaServed['@type'], 'Country');
  assert.equal(org.areaServed.name, 'India');
});

test('the page image points at an image, not at the app', () => {
  // primaryImageOfPage has to resolve to an image. It used to point at the
  // WebApplication node, and the schema.org validator rejected the whole page
  // for it: the reference was resolvable, but the thing it resolved to was not
  // an image. It now names the logo directly, the same image the organization
  // points at, so the page and the company agree on one picture.
  const ld = landingLd();
  const page = oneOf(ld, 'CollectionPage')[0];
  const image = page.primaryImageOfPage;
  assert.equal(image['@type'], 'ImageObject');
  assert.match(image.url, /^https:\/\/swapiki\.com\/assets\/logo\//);
  assert.equal(oneOf(ld, 'Organization')[0].logo.url, image.url);
});

// ------------------------------------------- what must never be invented

test('no node claims a fact the product has not established', () => {
  // Each of these is a schema.org attribute that would, if invented, be a false
  // claim attached to the company. None of them is established anywhere in the
  // product, so none of them may appear.
  const banned = [
    'foundingDate', 'foundingLocation', 'numberOfEmployees', 'aggregateRating',
    'review', 'reviewRating', 'award', 'email', 'telephone', 'faxNumber',
    'address', 'taxID', 'duns', 'leiCode', 'iso6523Code', 'naics', 'vatID'
  ];
  for (const node of landingLd()['@graph']) {
    for (const key of banned) {
      assert.ok(!(key in node), `${node['@type']} invents ${key}`);
    }
  }
});

test('no node claims a social profile that does not exist', () => {
  // The only social URLs in this repo are <input placeholder> attributes on the
  // profile editor. sameAs is how an engine confirms an identity across sites, so
  // pointing it at "github.com/username" would assert a link that was never
  // made. Omitted is the honest state.
  for (const node of landingLd()['@graph']) {
    if ('sameAs' in node) {
      assert.fail(`${node['@type']} declares sameAs: ${JSON.stringify(node.sameAs)}`);
    }
  }
});

test('the schema never describes Swapiki as verifying identity', () => {
  // The landing page is careful about this on purpose - it says outright that
  // nothing is verified. Structured data that said "verified" would let an engine
  // answer a question the product has explicitly refused to answer.
  const raw = JSON.stringify(landingLd()).toLowerCase();
  for (const claim of ['identity verified', 'background check', 'identity check', 'verified identity']) {
    assert.ok(!raw.includes(claim), `the schema asserts "${claim}"`);
  }
});

test('the schema repeats the promise that audio is never scored', () => {
  // The single most load-bearing claim the product makes, and the one an answer
  // engine is most likely to get wrong by pattern-matching to every other hiring
  // tool. It has to be in the machine-readable copy, not only the visible page.
  const app = oneOf(landingLd(), 'WebApplication')[0];
  assert.match(app.description, /never scored, ranked or sentiment-analysed/);
});

test('the free offer is zero, and claims nothing about a future price', () => {
  const offer = oneOf(landingLd(), 'WebApplication')[0].offers;
  assert.equal(offer.price, '0');
  assert.match(offer.description, /pilot/i, 'a zero price must be scoped to the pilot, not read as permanent');
});

// ------------------------------------------------------------- the FAQ

test('the landing page publishes its FAQ as structured data', () => {
  const faqs = oneOf(landingLd(), 'FAQPage');
  assert.equal(faqs.length, 1, 'the visible FAQ is not in the graph');
  assert.ok(faqs[0].mainEntity.length >= 4, 'too few questions to be useful');
});

test('every FAQ question is visible text on the page', () => {
  // schema.org requires the question to appear in the page content. Markup that
  // answers something the reader cannot see is invisible-text cloaking.
  const faq = oneOf(landingLd(), 'FAQPage')[0];
  for (const q of faq.mainEntity) {
    assert.ok(INDEX_HTML.includes(q.name), `no visible question: "${q.name}"`);
    assert.ok(INDEX_HTML.includes(q.acceptedAnswer.text.slice(0, 60)),
      `no visible answer for: "${q.name}"`);
  }
});

test('the FAQ does not invent an answer the page does not give', () => {
  // The visible FAQ rows and the structured ones must be the same set, or the
  // graph is answering questions the site never took a position on.
  const structured = oneOf(landingLd(), 'FAQPage')[0].mainEntity.map((q) => q.name);
  const visible = [...INDEX_HTML.matchAll(/<summary>([^<]+)<\/summary>/g)].map((m) =>
    m[1].replace(/&amp;/g, '&').trim()
  );
  for (const name of visible) {
    assert.ok(structured.includes(name), `visible question absent from the graph: "${name}"`);
  }
});

// ------------------------------------------------ the crawler-facing files

test('robots.txt invites the answer engines by name', () => {
  // Each operator reads a more specific rule when one exists. Naming them is a
  // deliberate allow, not an accident of the wildcard.
  const required = [
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
    'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot'
  ];
  for (const bot of required) {
    const rule = new RegExp(`User-agent:\\s*${bot.replace(/[-]/g, '\\-')}\\s*\\n\\s*Allow:\\s*/`, 'i');
    assert.match(ROBOTS, rule, `${bot} is not explicitly allowed`);
  }
});

test('robots.txt still points at the sitemap and still allows the public pages', () => {
  assert.match(ROBOTS, /^Sitemap:\s*https:\/\/swapiki\.com\/sitemap\.xml$/m);
  assert.match(ROBOTS, /User-agent:\s*\*\s*\n\s*Allow:\s*\//);
});

test('robots.txt does not block the job pages or the board', () => {
  // The disallow list is about crawl budget on signed-in surfaces. One bad line
  // here would hide the entire product from search, so it is asserted rather
  // than trusted.
  const disallows = [...ROBOTS.matchAll(/^Disallow:\s*(\S*)/gim)].map((m) => m[1]);
  for (const rule of disallows) {
    for (const publicPath of ['/jobs', '/jobs/', '']) {
      if (!rule) continue;
      assert.ok(
        !rule.startsWith(publicPath) || publicPath === '',
        `Disallow: ${rule} would hide public page ${publicPath || '/'}`
      );
    }
  }
  assert.ok(!disallows.some((r) => r.startsWith('/jobs')), '/jobs must stay crawlable');
  assert.ok(!disallows.some((r) => r.startsWith('/llms')), '/llms.txt must stay crawlable');
});

test('llms.txt states what Swapiki is in the first line', () => {
  // The convention is that this file is read by a fetcher that will not read the
  // site, so the summary has to stand alone.
  assert.match(LLMS, /^# Swapiki/);
  assert.match(LLMS, /skill-highlighting hiring platform/i);
});

test('llms.txt tells a reader how to enumerate every job', () => {
  // 500+ job pages are useless to an engine that does not know they exist. The
  // URL shape plus the sitemap is the whole discovery story.
  assert.match(LLMS, /https:\/\/swapiki\.com\/sitemap\.xml/);
  assert.match(LLMS, /--<uuid>|trailing UUID/i, 'the stable-id part of the URL pattern must be explained');
});

test('llms.txt carries the honesty constraints an engine would otherwise get wrong', () => {
  // Each of these is a question the site answers carefully in prose. An engine
  // summarising without them would say something the product refuses to claim.
  // Matched against a whitespace-normalised copy, because the sentences are hard
  // wrapped and these claims must not depend on where the lines break.
  const flat = LLMS.replace(/\s+/g, ' ');
  assert.match(flat, /does not verify identity/i);
  assert.match(flat, /never scored, ranked or sentiment-analysed/i);
  assert.match(flat, /directApply/);
  assert.match(flat, /not describe Swapiki as an application-tracking or ATS system/i);
});

test('llms.txt links only to addresses that resolve', () => {
  // Sign-up lives in a modal, not at its own path, and the app shell answers
  // unknown paths with 200 - so a plausible-looking link here is a soft 404.
  // The documented URL template contains angle brackets, so the path is captured
  // whole and then discarded as a shape rather than an address. Trailing
  // punctuation is dropped because a link at the end of a sentence carries the
  // full stop with it, and a comma in prose is not part of the path.
  const links = [...LLMS.matchAll(/https:\/\/swapiki\.com(\/[^\s)`*]*)?/g)]
    .map((m) => (m[1] || '/').replace(/[;,]+$/, '').replace(/\.$/, ''))
    .filter((p) => !p.includes('<'));
  const real = new Set([
    '/', '/jobs', '/jobs.json', '/feed.xml', '/llms.txt', '/llms-full.txt', '/sitemap.xml'
  ]);
  assert.ok(links.length >= 4, 'the file should link the pages it documents');
  for (const link of links) {
    assert.ok(real.has(link), `llms.txt links to an address that does not exist: ${link}`);
  }
});

// ------------------------------------------- agreement across the surfaces

test('the job page graph carries the same organization the landing page does', async () => {
  const { graph, ORG_ID } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'schema.js')));
  const ld = landingLd();
  assert.equal(oneOf(ld, 'Organization')[0]['@id'], ORG_ID);
  // And the shared module is the single source of that id, so the board and the
  // job page cannot drift away from the landing page at a later edit.
  assert.equal(ORG_ID, 'https://swapiki.com/#organization');
  assert.equal(graph([null, undefined])['@graph'].length, 0,
    'graph() must drop absent nodes rather than emit null');
});

test('the JSON-LD in index.html is a single well-formed block', () => {
  const blocks = INDEX_HTML.match(/<script type="application\/ld\+json">/g) || [];
  assert.equal(blocks.length, 1, 'two graphs on one page can contradict each other');
  assert.doesNotThrow(() => landingLd());
});

// ------------------------------------------ the rest of the answer engines

test('robots.txt names the answer engines that arrived after the first draft', () => {
  // An explicit allow is the difference between "we did not think about it" and
  // "we decided this", and the list is not closed: new crawlers appear, and a
  // named allow for the current set is the standing posture.
  const later = [
    'Claude-Web', 'anthropic-ai', 'meta-externalagent', 'Bytespider',
    'Amazonbot', 'YouBot', 'cohere-ai', 'MistralAI-User', 'DeepSeekBot'
  ];
  for (const bot of later) {
    const rule = new RegExp(`User-agent:\\s*${bot}\\s*\\n\\s*Allow:\\s*/`, 'i');
    assert.match(ROBOTS, rule, `${bot} is not explicitly allowed`);
  }
});

test('robots.txt points at every machine-readable surface it is hiding', () => {
  // These are what an engine comes for. The wildcard already covers them, but a
  // document that never names them leaves the discovery story to be inferred.
  for (const rule of [
    'Allow: /jobs.json', 'Allow: /feed.xml', 'Allow: /llms.txt',
    'Allow: /llms-full.txt', 'Allow: /sitemap.xml'
  ]) {
    assert.ok(ROBOTS.includes(rule), `robots.txt does not name ${rule}`);
  }
});

// ---------------------------------------- the long-form machine document

test('llms-full.txt exists and states the same facts llms.txt does', () => {
  // Two documents about the same product that disagree is worse than one that
  // is incomplete: an engine that reads both has to pick, and it will pick the
  // more confident-sounding one. Every load-bearing claim in the short file has
  // to appear in the long one.
  const full = read('llms-full.txt');
  const flat = full.replace(/\s+/g, ' ');
  assert.match(full, /^# Swapiki/);
  assert.match(flat, /does not verify identity/i);
  assert.match(flat, /never scored, ranked or sentiment-analysed/i);
  assert.match(flat, /directApply:\s*false/);
  assert.match(flat, /not an applicant tracking system/i);
  // And it has to be long enough to actually be the long-form document.
  assert.ok(full.length > LLMS.length, 'llms-full.txt should be the longer of the two');
  assert.ok(flat.split('**').length > 10, 'the FAQ should be carried in full');
  // The two answers written from real reader objections have to reach the
  // machine-readable copy too: "is this real?" and "why not just LinkedIn?" are
  // the questions an engine is asked most about a tool like this.
  assert.match(flat, /Why not just post my demo on LinkedIn or YouTube/);
  assert.match(flat, /not that the person recording is the applicant/);
  assert.match(flat, /Tying that recording to a real identity is the employer's check to run/);
});

test('neither machine document claims something the landing page refuses to', () => {
  // llms.txt is the file an answer engine reads first, so an assertion here that
  // the site disclaims is the worst possible place for one. These are the exact
  // patterns the landing trust tests ban from index.html.
  //
  // The documents are allowed to *mention* a banned phrase in order to deny it -
  // "do not describe Swapiki profiles as identity verified" is the correction,
  // not the claim. So each hit is checked against the line it appeared on, and
  // a line that denies before it mentions passes.
  const banned = [
    /verified project/i, /voice (?:is )?verified/i, /identity (?:is )?verified/i,
    /certified/i, /trusted by [\d,]+/i, /100% human-to-human/i, /background check(?:ed)?/i
  ];
  const denies = /\b(?:not|never|no|neither|nor|refus\w*|disclaim\w*|without|unverified)\b/i;

  for (const [name, doc] of [['llms.txt', LLMS], ['llms-full.txt', read('llms-full.txt')]]) {
    // Each bullet, heading and paragraph is one row. Wrapped lines inside it are
    // joined, so a denial and the phrase it denies land on the same row instead
    // of being split apart - but a denial in bullet 1 cannot vouch for an
    // assertion in bullet 12.
    const rows = doc
      .split(/\n(?=\s*(?:[-*] |#{1,6} |[0-9]+\. ))/)
      .map((row) => row.replace(/\s*\n\s*/g, ' '));
    for (const claim of banned) {
      for (const line of rows) {
        for (const hit of line.matchAll(new RegExp(claim.source, 'gi'))) {
          const before = line.slice(0, hit.index);
          assert.ok(denies.test(before),
            `${name} carries the banned claim ${claim} in: ${line.trim().slice(0, 160)}`);
        }
      }
    }
  }
});

// ------------------------------------------- client and server agree

test('the SPA adds no JobPosting of its own, so two graphs cannot disagree', async () => {
  // js/app.js used to inject its own JobPosting graph when a signed-in crawler
  // rendered the board, so a page could end up carrying both. Two graphs on one
  // page disagreeing about the same job is the contradiction an engine resolves
  // by trusting neither of them - and a board is a list, which may not carry
  // postings at all, so the app now only refreshes the collection the server
  // named.
  const { jobPostingFor } = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'jobs-feed.js')));
  const posting = jobPostingFor({
    id: '11111111-2222-3333-4444-555555555555',
    title: 'Software Engineer',
    company: 'Acme',
    location: 'Bengaluru',
    apply_url: 'https://example.com/apply',
    first_seen_at: '2026-09-28T10:00:00Z'
  });
  assert.equal(posting.directApply, false, 'the server marks postings not-direct');

  const app = read('js/app.js');
  // The app's graph must not describe a posting, and it must not invent one
  // either - only the collection.
  const injector = app.slice(app.indexOf('_injectJobsJsonLd(jobs) {'));
  assert.ok(injector.length > 0, 'could not locate the app graph');
  assert.ok(!/'@type':\s*'JobPosting'/.test(injector), 'the app still builds JobPosting nodes');
  assert.ok(!/directApply\s*=\s*true/.test(app), 'the SPA asserts directApply true somewhere');
});

// --------------------------------------------- one honest public document

test('every page the project root ships makes only claims the site allows', () => {
  // A stray file at the root is served as a static asset, so anything left in
  // one of them is public, indexable and citable even though nobody linked to
  // it. This is what catches a stale copy of index.html surviving a redesign.
  const banned = [
    /verified project/i, /voice (?:is )?verified/i, /identity (?:is )?verified/i,
    /certified/i, /trusted by [\d,]+/i, /100% human-to-human/i
  ];
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  assert.ok(pages.includes('index.html'), 'the landing page should be at the root');
  assert.equal(pages.length, 1, `unexpected HTML at the project root: ${pages.join(', ')}`);
  for (const file of pages) {
    const html = read(file);
    for (const claim of banned) {
      assert.ok(!claim.test(html), `${file} ships the banned claim ${claim}`);
    }
  }
});

test('the landing answers "what is Swapiki?" in one standing paragraph', () => {
  // The single most-asked question about a product, and the paragraph an answer
  // engine lifts when it has no room for a full summary. It has to be complete
  // on its own - not a sentence that only reads correctly next to a headline.
  const start = INDEX_HTML.indexOf('id="what-is-swapiki"');
  assert.ok(start > -1, 'the landing has no standalone definition block');
  const end = INDEX_HTML.indexOf('</section>', start);
  const block = INDEX_HTML.slice(start, end);

  assert.match(block, /<h2[^>]*>What is Swapiki\?<\/h2>/, 'the block is headed by the question');
  const flat = block.replace(/\s+/g, ' ');
  assert.match(flat, /free, India-focused hiring platform/);
  assert.match(flat, /does not use AI to score, rank or reject/);
  assert.match(flat, /does not verify identity/);
  assert.match(flat, /job(s)? board|public board/);
  assert.ok(flat.length > 300, 'the answer should be substantial enough to stand alone');
});
