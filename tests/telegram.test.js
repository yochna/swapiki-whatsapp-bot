// The Telegram helpers: message rendering, callback encoding, and the HTTP client.
//
// Three properties are worth protecting here, in order of how much damage a bug
// would do:
//
//   1. A crafted job title cannot inject Telegram markup. Titles come from a
//      third-party feed, and the review card is HTML - unescaped, a job titled
//      "<b>Free crypto</b>" could render as a heading the admin reads as ours.
//   2. callback_data cannot carry anything but a decision and a uuid. It is
//      echoed back to us and interpolated into a PostgREST filter, so an
//      unvalidated value there is a filter-injection hole on a public endpoint.
//   3. Telegram answers 200 with { ok: false } for application errors, so a
//      status-code check alone would report a refused call as a delivered card -
//      and the job would be marked "sent" having never been seen.
//
// functions/lib/telegram.js is ESM (Pages Functions require it), so it is pulled
// in with a dynamic import from these CommonJS tests.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
// pathToFileURL, not a bare path: the ESM loader rejects a Windows drive letter.
const urlOf = p => pathToFileURL(p).href;
let lib;

test.before(async () => {
  lib = await import(urlOf(path.join(ROOT, 'functions', 'lib', 'telegram.js')));
});

const TOKEN = '123456:AAEtesttesttesttesttesttesttesttesttest';
const UUID = '3f8a1c2e-9d4b-4a1f-8c7d-2e6b5a4d3c21';

const job = (over = {}) => Object.assign(
  {
    id: UUID,
    title: 'Senior Software Engineer',
    company: 'Acme Payments',
    location: 'Bengaluru, Karnataka',
    category: 'it',
    salary: '15,00,000 - 24,00,000 per year',
    skills: ['React', 'SQL'],
    apply_url: 'https://www.adzuna.co.in/jobs/land/ad/129698749'
  },
  over
);

/** Answers api.telegram.org calls from a table of canned results, recording each. */
function fakeTelegram(reply) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = String(input);
    // The URL is https://api.telegram.org/bot<token>/<method>.
    const method = url.split('/bot').pop().split('/')[1];
    calls.push({
      url,
      method,
      body: init && init.body ? JSON.parse(init.body) : null
    });
    return reply(url, JSON.parse(init.body));
  };
  return { calls, fetchImpl };
}

test('esc neutralises every character that can change the markup around it', () => {
  assert.equal(lib.esc('<b>x</b> & "y"'), '&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
  assert.equal(lib.esc("it's"), 'it&#39;s');
  assert.equal(lib.esc(null), '', 'a missing value must render as empty, not "null"');
  assert.equal(lib.esc(undefined), '');
  assert.equal(lib.esc(0), '0', 'zero is a value, not an absence');
});

test('a crafted job title cannot inject markup into the review card', () => {
  // The card is sent with parse_mode=HTML, so a title is attacker-influenced
  // input rendered as markup. This is the same failure class as the JSON-LD
  // escaping on the public board.
  const card = lib.formatJobCard(job({
    title: '<b>Apply here</b> <a href="https://evil.example">free crypto</a>',
    company: 'Ampersand & Co <script>'
  }));
  assert.ok(!card.includes('<b>Apply here</b>'), 'a raw <b> from the title reached the card');
  assert.ok(!/<a href="https:\/\/evil\.example"/.test(card), 'the title opened its own link');
  assert.equal((card.match(/<a href="/g) || []).length, 1, 'the card must contain exactly one link, ours');
  assert.match(card, /&lt;b&gt;Apply here&lt;\/b&gt;/);
  assert.match(card, /&quot;https:\/\/evil\.example&quot;/, 'the injected URL survives as visible, inert text');
  assert.match(card, /Ampersand &amp; Co/);
  // The one link we do emit is the one we built.
  assert.match(card, /<a href="https:\/\/www\.adzuna\.co\.in[^"]*">Open original post<\/a>/);
});

test('a title with a quote cannot break out of the apply link attribute', () => {
  const card = lib.formatJobCard(job({ apply_url: 'https://x.example/" onmouseover="alert(1)' }));
  assert.ok(!card.includes('onmouseover="alert'), 'an unescaped quote escaped the attribute');
  assert.match(card, /&quot;/);
});

test('the review card shows the fields a decision needs, and omits the ones it lacks', () => {
  const card = lib.formatJobCard(job());
  assert.match(card, /<b>Senior Software Engineer<\/b>/);
  assert.match(card, /Acme Payments/);
  assert.match(card, /Location: Bengaluru, Karnataka/);
  // A category code is not something a human can judge by, so the label is shown
  // - and escaped, because a raw "&" is invalid markup Telegram refuses to parse,
  // which would lose the whole card.
  assert.match(card, /IT &amp; Engineering/, 'a raw & would make the card unsendable');
  assert.match(card, /15,00,000 - 24,00,000 per year/);
  assert.match(card, /Skills: React, SQL/);
  assert.match(card, /Open original post/);

  // A sparse row must not render "Location: null" or an empty Skills line.
  const sparse = lib.formatJobCard({ id: UUID, title: 'Analyst' });
  assert.equal(sparse, '<b>Analyst</b>');
  assert.ok(!/null|undefined/.test(sparse), `sparse card rendered a placeholder: ${sparse}`);
});

test('a pathological row is clipped per field, never mid-tag', () => {
  // Telegram rejects a message whose entities it cannot parse, so a whole-message
  // character slice is not an option - it can land inside a tag and lose the card.
  const card = lib.formatJobCard(job({
    title: 'A'.repeat(5000),
    company: 'B'.repeat(5000),
    skills: Array.from({ length: 400 }, (_, i) => `Skill${i}`),
  }));
  assert.ok(card.length < 4096, `card is ${card.length} chars, over Telegram's limit`);
  const opens = (card.match(/<b>/g) || []).length;
  const closes = (card.match(/<\/b>/g) || []).length;
  assert.equal(opens, closes, 'unbalanced tags mean the card was cut mid-element');
  assert.equal(opens, 1, 'only the title is bold');
  assert.match(card, /\.\.\.$/m, 'a clipped field is marked as clipped');
  const lines = card.split('\n');
  assert.equal(lines.length, 6, 'title, company, location, meta, skills, link');
  for (const line of lines) {
    assert.ok(line.length <= 250, `a line was not clipped: ${line.length} chars`);
  }
});

test('parseReviewAction accepts only the two decisions and a real uuid', () => {
  assert.deepEqual(lib.parseReviewAction(`pub:${UUID}`), { action: 'publish', jobId: UUID });
  assert.deepEqual(lib.parseReviewAction(`rej:${UUID}`), { action: 'reject', jobId: UUID });

  for (const bad of [
    'del:00000000-0000-0000-0000-000000000000',       // not a decision we offer
    'pub:not-a-uuid',
    'pub:',
    `pub:${UUID}&select=*`,                            // filter injection attempt
    `pub:${UUID}' or '1'='1`,
    'pub:../../jobs',
    'pub:' + UUID.toUpperCase() + ' extra',
    '',
    null,
    undefined,
    42,
    { action: 'publish' }
  ]) {
    assert.equal(lib.parseReviewAction(bad), null, `accepted a bad callback: ${JSON.stringify(bad)}`);
  }
});

test('parseReviewAction accepts the whole-queue publish-all press', () => {
  assert.deepEqual(lib.parseReviewAction('puball'), { action: 'publish_all', jobId: null });
  // A case or whitespace change must not sneak past: the button sends exactly
  // this string, and the webhook is public.
  assert.equal(lib.parseReviewAction('Puball'), null);
  assert.equal(lib.parseReviewAction('puball '), null);
});

test('an uppercase uuid is still accepted, because Postgres writes them that way', () => {
  const parsed = lib.parseReviewAction(`pub:${UUID.toUpperCase()}`);
  assert.ok(parsed, 'case must not be the reason a legitimate press is ignored');
  assert.equal(parsed.action, 'publish');
});

test('callback_data fits Telegram\'s 64-byte limit', () => {
  // The limit is bytes, and the payload is a fixed verb plus a uuid. If someone
  // ever widens it, this fails here rather than silently at send time.
  assert.ok(Buffer.byteLength(`pub:${UUID}`, 'utf8') <= 64);
  assert.ok(Buffer.byteLength(`rej:${UUID}`, 'utf8') <= 64);
});

test('sendJobForReview sends one card with both decision buttons', async () => {
  const t = fakeTelegram(() => new Response(JSON.stringify({ ok: true, result: { message_id: 4242 } }), { status: 200 }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = t.fetchImpl;
  let messageId;
  try {
    messageId = await lib.sendJobForReview(TOKEN, '555', job());
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].method, 'sendMessage');
  assert.equal(t.calls[0].body.chat_id, '555');
  assert.equal(t.calls[0].body.parse_mode, 'HTML');
  const keys = t.calls[0].body.reply_markup.inline_keyboard[0];
  assert.deepEqual(keys.map(k => k.callback_data), [`pub:${UUID}`, `rej:${UUID}`]);
  assert.match(keys[0].text, /Publish/);
  assert.match(keys[1].text, /Reject/);
  assert.equal(messageId, 4242, 'the caller records this to find the card again');
});

test('sendJobForReview adds a publish-all row and a queue link when others wait', async () => {
  const t = fakeTelegram(() => new Response(JSON.stringify({ ok: true, result: { message_id: 5 } }), { status: 200 }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = t.fetchImpl;
  try {
    await lib.sendJobForReview(TOKEN, '555', job(), 3);
  } finally {
    globalThis.fetch = realFetch;
  }

  const keyboard = t.calls[0].body.reply_markup.inline_keyboard;
  assert.equal(keyboard.length, 3, 'decision row, publish-all row, queue link');
  assert.deepEqual(keyboard[0].map(k => k.callback_data), [`pub:${UUID}`, `rej:${UUID}`]);
  assert.deepEqual(keyboard[1][0].callback_data, 'puball');
  assert.match(keyboard[1][0].text, /Publish all 3 pending/);
  assert.equal(keyboard[2][0].url, 'https://swapiki.com/#admin-jobs', 'the queue is reachable in one tap');
  assert.match(t.calls[0].body.text, /3 more drafts in queue/);
});

test('sendJobForReview without a backlog stays a plain two-button card', async () => {
  const t = fakeTelegram(() => new Response(JSON.stringify({ ok: true, result: { message_id: 6 } }), { status: 200 }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = t.fetchImpl;
  try {
    await lib.sendJobForReview(TOKEN, '555', job());
  } finally {
    globalThis.fetch = realFetch;
  }

  const keyboard = t.calls[0].body.reply_markup.inline_keyboard;
  assert.equal(keyboard.length, 2, 'decision row plus the queue link');
  assert.equal(keyboard[1][0].callback_data, undefined, 'no publish-all button for a single job');
  assert.ok(!/more drafts/.test(t.calls[0].body.text), 'no queue footer for a lone job');
});

test('a refused send throws instead of reporting a delivered card', async () => {
  // Telegram's most common failure is a 200 with ok:false. A status check alone
  // would return a result, the caller would stamp review_sent_at, and the job
  // would leave the queue without the admin ever seeing it.
  const t = fakeTelegram(() => new Response(
    JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }),
    { status: 200 }
  ));
  const realFetch = globalThis.fetch;
  globalThis.fetch = t.fetchImpl;
  try {
    await assert.rejects(
      () => lib.sendJobForReview(TOKEN, '555', job()),
      /bot was blocked/
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a missing bot token fails before any network call', async () => {
  const t = fakeTelegram(() => new Response('{}', { status: 200 }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = t.fetchImpl;
  try {
    await assert.rejects(() => lib.sendJobForReview('', '555', job()), /TELEGRAM_BOT_TOKEN/);
    assert.equal(t.calls.length, 0, 'an unconfigured bot must not reach the network');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('editMessageText can remove the buttons as well as rewrite the text', async () => {
  const t = fakeTelegram(() => new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = t.fetchImpl;
  try {
    await lib.editMessageText(TOKEN, '555', 7, 'done', { inline_keyboard: [] });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(t.calls[0].method, 'editMessageText');
  assert.equal(t.calls[0].body.message_id, 7);
  assert.deepEqual(t.calls[0].body.reply_markup, { inline_keyboard: [] },
    'a decided job must not keep live buttons');
});

test('a message is truncated to Telegram\'s length limit rather than rejected', async () => {
  const t = fakeTelegram(() => new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = t.fetchImpl;
  try {
    await lib.sendMessage(TOKEN, '555', 'x'.repeat(9000));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(t.calls[0].body.text.length, 4096);
});

test('the Bot API token is only ever in the URL, never logged or echoed', () => {
  // The token is a bearer credential for the bot. Nothing here should return it
  // in a message that could reach a log or a response body.
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'lib', 'telegram.js'), 'utf8');
  assert.ok(!/console\.(log|error|warn)/.test(src), 'the Telegram client must not log at all');
  assert.match(src, /throw new Error\(`Telegram \$\{method\} failed/, 'errors must name the method, not the payload');
});
