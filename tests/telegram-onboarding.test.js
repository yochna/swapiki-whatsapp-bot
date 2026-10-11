// The onboarding half of the channel feature: /api/tg-link and the webhook
// handlers for /start and chat_member.
//
// What these hold in place:
//   1. The deep link is only minted for a session that resolves to a candidate
//      row, and the token it carries is stored server-side for a single use -
//      so a copied link cannot be replayed after the bot has seen it.
//   2. /start writes telegram_id BEFORE clearing the token, so the two halves
//      of the link cannot be separated by a retry.
//   3. The nudge is profile-aware: an unpublished profile is told to finish it,
//      a live one is told to browse jobs. A generic "welcome" would miss the
//      only thing the message exists to move.
//   4. A chat_member join only DMs a user we can actually reach (someone who
//      pressed Start on the bot) and only marks them joined once.
//
// functions/*.js are ESM, so they are pulled in with a dynamic import from
// these CommonJS tests.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const urlOf = p => pathToFileURL(p).href;
const LIB = urlOf(path.join(ROOT, 'functions', 'lib', 'telegram.js'));
const WEBHOOK = urlOf(path.join(ROOT, 'functions', 'telegram.js'));
const TGLINK = urlOf(path.join(ROOT, 'functions', 'api', 'tg-link.js'));

const SECRET = 'a'.repeat(64);
const BOT = '123456:AAEtesttesttesttesttesttesttesttesttest';
const WEBHOOK_SECRET = 'swk_deadbeef';
const CHANNEL_ID = '@swapiki_jobs';
const CHANNEL_URL = 'https://t.me/swapiki_jobs';
const UUID = '3f8a1c2e-9d4b-4a1f-8c7d-2e6b5a4d3c21';

const env = {
  INGEST_SECRET: SECRET,
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  TELEGRAM_BOT_TOKEN: BOT,
  TELEGRAM_ADMIN_CHAT_ID: '555000111',
  TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
  TELEGRAM_CHANNEL_ID: CHANNEL_ID,
  TELEGRAM_CHANNEL_URL: CHANNEL_URL,
  TELEGRAM_BOT_USERNAME: 'swapiki_bot'
};

/** Stubs PostgREST, Supabase auth and the Bot API, recording every call. */
function harness({ rows = [], tg, candidates = [], auth = { id: 'caller-uuid-1' } } = {}) {
  const supa = [];
  const telegram = [];
  const authCalls = [];
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const realErr = console.error;
  console.log = () => {};
  console.error = () => {};

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = (init && init.method) || 'GET';
    const body = init && init.body ? init.body : null;

    if (url.startsWith('https://fake.supabase.co/auth/v1/user')) {
      authCalls.push(url);
      return new Response(JSON.stringify(auth || {}), { status: auth ? 200 : 401 });
    }
    if (url.startsWith('https://fake.supabase.co')) {
      const restPath = url.split('/rest/v1/')[1];
      supa.push({ method, path: restPath, body: body ? JSON.parse(body) : null });
      if (method === 'GET') return new Response(JSON.stringify(candidates), { status: 200 });
      return new Response(null, { status: 204 });
    }
    if (url.startsWith('https://api.telegram.org')) {
      const tgMethod = url.split('/bot').pop().split('/')[1];
      const payload = body ? JSON.parse(body) : {};
      telegram.push({ method: tgMethod, body: payload });
      if (tg) return tg(tgMethod, payload);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    throw new Error(`unexpected host: ${url}`);
  };

  return {
    supa,
    telegram,
    authCalls,
    restore() {
      globalThis.fetch = realFetch;
      console.log = realLog;
      console.error = realErr;
    }
  };
}

const webhookRequest = update => new Request('https://example.com/telegram', {
  method: 'POST',
  headers: {
    'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
    'content-type': 'application/json'
  },
  body: JSON.stringify(update)
});

const startUpdate = (text, over = {}) => ({
  update_id: 1,
  message: {
    message_id: 1,
    chat: { id: 999001, type: 'private' },
    from: { id: 999001, username: 'anjali_dev', ...((over.from) || {}) },
    text
  }
});

const joinUpdate = (chat, user, oldStatus = 'left', newStatus = 'member') => ({
  update_id: 2,
  chat_member: {
    chat: { id: chat.id, type: 'channel', username: chat.username },
    from: { id: 777 },
    new_chat_member: { user: { id: user.id, username: user.username }, status: newStatus },
    old_chat_member: { user: { id: user.id, username: user.username }, status: oldStatus }
  }
});

// Telegram gives us a numeric chat id; we configured the channel by @handle.
const OUR_CHANNEL = { id: -1001234567890, username: 'swapiki_jobs' };

let lib;
test.before(async () => {
  lib = await import(LIB);
});

// ---------------------------------------------------------------------------
// Message builder
// ---------------------------------------------------------------------------

test('the nudge changes with the profile, not with our mood', () => {
  const draft = lib.formatOnboardingMessage({ name: 'Anjali Verma', profile_status: 'draft' });
  const live = lib.formatOnboardingMessage({ name: 'Anjali Verma', profile_status: 'published' });
  const none = lib.formatOnboardingMessage(null);

  assert.match(draft.text, /Hi Anjali!/, 'a known profile is addressed by first name');
  assert.match(draft.text, /not live yet/);
  assert.match(draft.reply_markup.inline_keyboard[0][0].url, /\/#dashboard$/, 'the unfinished profile is told to finish');

  assert.match(live.text, /is live/);
  assert.match(live.reply_markup.inline_keyboard[0][0].url, /\/#jobs$/, 'a live profile is pointed at jobs');

  assert.ok(!/null/.test(none.text), `a missing profile must not render "null": ${none.text}`);
  assert.match(none.reply_markup.inline_keyboard[0][0].url, /\/#dashboard$/);
});

test('the message is safe to send as HTML and carries one channel button', () => {
  const fm = lib.formatOnboardingMessage(
    { name: '<b>Anjali</b> Smith', profile_status: 'published' },
    { site: 'https://swapiki.com', channelUrl: CHANNEL_URL }
  );
  assert.ok(!fm.text.includes('<b>Anjali</b>'), 'the name is markup and must be escaped');
  assert.match(fm.text, /&lt;b&gt;/);
  const keyboard = fm.reply_markup.inline_keyboard;
  assert.equal(keyboard.length, 1, 'both buttons sit on one row');
  assert.equal(keyboard[0].length, 2);
  assert.equal(keyboard[0][1].url, CHANNEL_URL, 'the channel link is offered back');
});

// ---------------------------------------------------------------------------
// POST /api/tg-link
// ---------------------------------------------------------------------------

const tgLinkRequest = (headers = {}) => new Request('https://example.com/api/tg-link', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers }
});

test('the deep link endpoint refuses an unauthenticated caller', async () => {
  const mod = await import(TGLINK);
  const res = await mod.onRequestPost({ request: tgLinkRequest(), env });
  assert.equal(res.status, 401);
});

test('the deep link endpoint 404s when the caller has no profile yet', async () => {
  const mod = await import(TGLINK);
  const h = harness({ candidates: [] });
  try {
    const res = await mod.onRequestPost({
      request: tgLinkRequest({ Authorization: 'Bearer tok' }),
      env
    });
    assert.equal(res.status, 404);
    assert.ok(!h.supa.some(c => c.method === 'PATCH'), 'nothing is written without a profile to link');
  } finally {
    h.restore();
  }
});

test('a minted link stores a single-use token and points at the bot', async () => {
  const mod = await import(TGLINK);
  const h = harness({ candidates: [{ id: UUID, name: 'Anjali Verma' }] });
  try {
    const res = await mod.onRequestPost({
      request: tgLinkRequest({ Authorization: 'Bearer tok' }),
      env
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.deepLink.startsWith('https://t.me/swapiki_bot?start='), body.deepLink);

    const write = h.supa.find(c => c.method === 'PATCH');
    assert.ok(write, 'the token must be stored server-side');
    assert.ok(write.body.telegram_link_token, 'a token is minted');
    assert.ok(write.body.telegram_link_expires_at, 'and it expires');
    assert.ok(write.body.telegram_link_token.length >= 8, `token too short: ${write.body.telegram_link_token}`);
    assert.ok(/^[A-Za-z0-9_-]+$/.test(write.body.telegram_link_token), 'Telegram only accepts that alphabet');
    assert.equal(write.path, `candidates?id=eq.${UUID}`, "the caller's own row is updated");
    // The token in the URL is the token we stored, or the bot cannot match it.
    assert.equal(body.token, write.body.telegram_link_token);
  } finally {
    h.restore();
  }
});

// ---------------------------------------------------------------------------
// Webhook: /start
// ---------------------------------------------------------------------------

test('/start with a live token links the account and clears the token', async () => {
  const mod = await import(WEBHOOK);
  const h = harness({
    candidates: [{ id: UUID, name: 'Anjali Verma', profile_status: 'draft', telegram_link_token: 'abc123', telegram_link_expires_at: null }]
  });
  try {
    const res = await mod.onRequestPost({ request: webhookRequest(startUpdate('/start abc123')), env });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);

    const read = h.supa.find(c => c.method === 'GET');
    assert.match(read.path, /telegram_link_token=eq\.abc123/, 'the token is looked up by value');

    const write = h.supa.find(c => c.method === 'PATCH');
    assert.ok(write, 'the candidate row must be written');
    assert.equal(write.body.telegram_id, 999001, 'the Telegram user id is stored');
    assert.strictEqual(write.body.telegram_link_token, null, 'the token is single use');
    assert.strictEqual(write.body.telegram_link_expires_at, null);
    assert.ok(write.body.telegram_linked_at);

    const send = h.telegram.find(c => c.method === 'sendMessage');
    assert.ok(send, 'the user gets the onboarding message');
    assert.equal(send.body.chat_id, 999001, 'it is a DM, not a channel post');
    assert.equal(send.body.parse_mode, 'HTML');
    assert.match(send.body.text, /Hi Anjali!/, 'the nudge is addressed to the profile');
    assert.match(send.body.text, /not live yet/);
    assert.ok(send.body.reply_markup, 'the message carries its buttons');
  } finally {
    h.restore();
  }
});

test('/start with an unknown or expired token still answers, without linking', async () => {
  const mod = await import(WEBHOOK);
  for (const update of [
    startUpdate('/start nosuchtoken'),
    startUpdate('/start'),
    startUpdate('/start abc123')
  ]) {
    const h = harness({
      candidates: update.text === '/start abc123'
        ? [{ id: UUID, telegram_link_token: 'abc123', telegram_link_expires_at: '2020-01-01T00:00:00Z' }]
        : []
    });
    try {
      const res = await mod.onRequestPost({ request: webhookRequest(update), env });
      assert.equal(res.status, 200, `update ${JSON.stringify(update.message.text)} must not 500`);
      assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'nothing is linked without a valid token');
      assert.ok(h.telegram.some(c => c.method === 'sendMessage'), 'the user is still told what to do');
    } finally {
      h.restore();
    }
  }
});

test('a bare code types like a link and links the account the same way', async () => {
  // The jobs board shows the token as a short code, for the phone where a deep
  // link keeps opening in a browser. Sending the code bare must behave exactly
  // like /start <token>.
  const mod = await import(WEBHOOK);
  const code = 'abc123XYZ9';
  const h = harness({
    candidates: [{ id: UUID, name: 'Anjali Verma', profile_status: 'draft', telegram_link_token: code, telegram_link_expires_at: null }]
  });
  try {
    const res = await mod.onRequestPost({ request: webhookRequest(startUpdate(code)), env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.linked, true);

    const read = h.supa.find(c => c.method === 'GET');
    assert.match(read.path, /telegram_link_token=eq\.abc123XYZ9/, 'the code is looked up by value');

    const write = h.supa.find(c => c.method === 'PATCH');
    assert.ok(write, 'the candidate row must be written');
    assert.equal(write.body.telegram_id, 999001);
    assert.strictEqual(write.body.telegram_link_token, null);

    const send = h.telegram.find(c => c.method === 'sendMessage');
    assert.match(send.body.text, /Hi Anjali!/, 'the user gets the same onboarding as a /start');
  } finally {
    h.restore();
  }
});

test('a bare code that matches nothing is told so, not welcomed generically', async () => {
  // A typo should read like a typo: spell out what to do next rather than
  // replying with the full onboarding, so the user does not think they linked.
  const mod = await import(WEBHOOK);
  const h = harness({ candidates: [] });
  try {
    const res = await mod.onRequestPost({ request: webhookRequest(startUpdate('zzzzzzzzzz')), env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.linked, false);
    assert.equal(body.ignored, 'unknown code');
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'nothing is linked');
    const send = h.telegram.find(c => c.method === 'sendMessage');
    assert.match(send.body.text, /didn't match/, 'the reply explains the code did not match');
    assert.ok(!/Thanks for reaching out/.test(send.body.text), 'it must not look like a successful link');
  } finally {
    h.restore();
  }
});

test('a plain non-code message is still ignored, not treated as a code', async () => {
  const mod = await import(WEBHOOK);
  for (const text of ['hello', 'thanks for the jobs', '???']) {
    const h = harness({ candidates: [] });
    try {
      const res = await mod.onRequestPost({ request: webhookRequest(startUpdate(text)), env });
      assert.equal(res.status, 200, `plain message ${JSON.stringify(text)} must not be treated as a code`);
      assert.equal((await res.json()).ignored, 'not a button press');
      assert.equal(h.supa.length, 0, 'no token lookup for a message that is not code-shaped');
      assert.equal(h.telegram.length, 0, 'and nothing is sent');
    } finally {
      h.restore();
    }
  }
});

test('/start without the webhook secret is refused', async () => {
  const mod = await import(WEBHOOK);
  const req = new Request('https://example.com/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(startUpdate('/start abc123'))
  });
  const h = harness({ candidates: [{ id: UUID, telegram_link_token: 'abc123' }] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    assert.equal(res.status, 401);
    assert.equal(h.supa.length + h.telegram.length, 0, 'no work happens on an unauthenticated webhook');
  } finally {
    h.restore();
  }
});

// ---------------------------------------------------------------------------
// Webhook: chat_member
// ---------------------------------------------------------------------------

test('a channel join is recorded and DMs the user we already know', async () => {
  const mod = await import(WEBHOOK);
  const h = harness({
    candidates: [{ id: UUID, telegram_id: 999001, name: 'Anjali Verma', profile_status: 'published', channel_joined_at: null }]
  });
  try {
    const res = await mod.onRequestPost({
      request: webhookRequest(joinUpdate(OUR_CHANNEL, { id: 999001 })),
      env
    });
    assert.equal(res.status, 200);

    const write = h.supa.find(c => c.method === 'PATCH');
    assert.ok(write, 'channel_joined_at must be written');
    assert.ok(write.body.channel_joined_at);
    assert.match(readPathOf(h), /telegram_id=eq\.999001/, 'the user is looked up by the id we stored');

    const send = h.telegram.find(c => c.method === 'sendMessage');
    assert.ok(send, 'the member gets a DM');
    assert.equal(send.body.chat_id, 999001);
    assert.match(send.body.text, /is live/);
  } finally {
    h.restore();
  }
});

function readPathOf(h) {
  const read = h.supa.find(c => c.method === 'GET');
  return (read && read.path) || '';
}

test('a join by someone we cannot DM is recorded but not messaged', async () => {
  const mod = await import(WEBHOOK);
  const h = harness({ candidates: [] });
  try {
    const res = await mod.onRequestPost({
      request: webhookRequest(joinUpdate(OUR_CHANNEL, { id: 424242 })),
      env
    });
    assert.equal(res.status, 200);
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'an unknown member is not written');
    assert.equal(h.telegram.length, 0, 'and must not be DMed');
  } finally {
    h.restore();
  }
});

test('an already-recorded join is not repeated', async () => {
  const mod = await import(WEBHOOK);
  const h = harness({
    candidates: [{ id: UUID, telegram_id: 999001, channel_joined_at: '2026-10-01T00:00:00Z' }]
  });
  try {
    await mod.onRequestPost({
      request: webhookRequest(joinUpdate(OUR_CHANNEL, { id: 999001 })),
      env
    });
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'joined_at is written once');
    assert.equal(h.telegram.length, 0, 'no duplicate DM');
  } finally {
    h.restore();
  }
});

test('a join in another chat is ignored', async () => {
  const mod = await import(WEBHOOK);
  const h = harness({
    candidates: [{ id: UUID, telegram_id: 999001, channel_joined_at: null }]
  });
  try {
    await mod.onRequestPost({
      request: webhookRequest(joinUpdate({ id: -1009999999999, username: 'some_other_channel' }, { id: 999001 })),
      env
    });
    assert.equal(h.supa.length, 0, 'only our channel counts');
    assert.equal(h.telegram.length, 0);
  } finally {
    h.restore();
  }
});