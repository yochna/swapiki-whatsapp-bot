// The two Telegram-facing routes: POST /notify and POST /telegram.
//
// What these tests hold in place:
//   1. /notify only ever messages the queue curation left behind - imported,
//      undecided, and not already asked about. If it touched a published job or
//      a hand-typed draft, the admin would be asked to judge their own work.
//   2. /telegram decides on a job only while it is still a draft, and only for
//     the admin. A replayed or stale press must not flip a published job back to
//      rejected.
//   3. Both routes refuse an unauthenticated caller. /notify writes with the
//     service role key and /telegram writes statuses, so an open endpoint would
//      hand publishing rights to the internet.
//
// Neither route is imported more than once: unlike the ingest module, neither
// caches schema state, so a single import is enough.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const urlOf = p => pathToFileURL(p).href;
const notifyUrl = urlOf(path.join(ROOT, 'functions', 'notify.js'));
const telegramUrl = urlOf(path.join(ROOT, 'functions', 'telegram.js'));

const SECRET = 'a'.repeat(64);
const BOT = '123456:AAEtesttesttesttesttesttesttesttesttest';
const ADMIN = '555000111';
const WEBHOOK_SECRET = 'swk_deadbeef';
const UUID = '3f8a1c2e-9d4b-4a1f-8c7d-2e6b5a4d3c21';
const UUID2 = '9b2d4e6f-1a3c-4b5d-8e7f-0a1b2c3d4e5f';

const env = {
  INGEST_SECRET: SECRET,
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  TELEGRAM_BOT_TOKEN: BOT,
  TELEGRAM_ADMIN_CHAT_ID: ADMIN,
  TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET
};

const draft = (over = {}) => Object.assign(
  {
    id: UUID,
    title: 'Chief Happiness Wizard',
    company: 'Elsewhere',
    location: 'Bengaluru, Karnataka',
    category: 'any',
    salary: null,
    skills: [],
    apply_url: 'https://www.adzuna.co.in/jobs/land/ad/1',
    first_seen_at: '2026-09-27T00:00:00Z'
  },
  over
);

/**
 * Stubs both upstreams.
 *
 * `supa` answers PostgREST: a GET returns `rows`, writes return 204. `tg` answers
 * the Bot API. Both record every call so a test can assert on what was written
 * and to whom.
 */
function harness({ rows = [], tg, supaGet } = {}) {
  const supa = [];
  const telegram = [];
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const realErr = console.error;
  // The routes log their own counts and errors. Captured rather than printed so a
  // deliberately-failing case below does not look like a broken test run.
  console.log = () => {};
  console.error = () => {};

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = (init && init.method) || 'GET';

    if (url.startsWith('https://fake.supabase.co')) {
      const path_ = url.split('/rest/v1/')[1];
      supa.push({ method, path: path_, body: init && init.body ? JSON.parse(init.body) : null });
      if (method === 'GET') {
        const out = supaGet ? supaGet(path_) : rows;
        if (out && out.__response) return out.__response;
        return new Response(JSON.stringify(out), { status: 200 });
      }
      return new Response(null, { status: 204 });
    }

    if (url.startsWith('https://api.telegram.org')) {
      const method2 = url.split('/bot').pop().split('/')[1];
      const body = init && init.body ? JSON.parse(init.body) : {};
      telegram.push({ method: method2, body });
      if (tg) return tg(method2, body);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }

    throw new Error(`unexpected host: ${url}`);
  };

  return {
    supa,
    telegram,
    restore() {
      globalThis.fetch = realFetch;
      console.log = realLog;
      console.error = realErr;
    }
  };
}

const post = (headers = {}) => new Request('https://example.com/notify', {
  method: 'POST',
  headers: { 'x-ingest-secret': SECRET, ...headers }
});

async function postNotify(overrides) {
  const mod = await import(notifyUrl);
  const h = harness(overrides);
  try {
    const res = await mod.onRequestPost({ request: post(), env });
    return { h, status: res.status, body: await res.json() };
  } finally {
    h.restore();
  }
}

// ---------------------------------------------------------------------------
// /notify
// ---------------------------------------------------------------------------

test('notify refuses an unauthenticated caller', async () => {
  const mod = await import(notifyUrl);
  const h = harness({ rows: [draft()] });
  try {
    const res = await mod.onRequestPost({
      request: new Request('https://example.com/notify', { method: 'POST' }),
      env
    });
    assert.equal(res.status, 401);
    assert.equal(h.supa.length, 0, 'no queue read, let alone a message');
    assert.equal(h.telegram.length, 0);
  } finally {
    h.restore();
  }
});

test('notify refuses a wrong secret rather than a near miss', async () => {
  const mod = await import(notifyUrl);
  const h = harness({ rows: [draft()] });
  try {
    for (const bad of [SECRET.slice(0, 63), SECRET + 'x', '', 'a'.repeat(63), 'A'.repeat(64)]) {
      const res = await mod.onRequestPost({
        request: new Request('https://example.com/notify', {
          method: 'POST', headers: { 'x-ingest-secret': bad }
        }),
        env
      });
      assert.equal(res.status, 401, `accepted a wrong secret: ${JSON.stringify(bad)}`);
    }
    assert.equal(h.telegram.length, 0);
  } finally {
    h.restore();
  }
});

test('notify asks only for undecided, unsent, imported drafts', async () => {
  // The filter is the whole point of the route. source=eq.adzuna keeps a
  // hand-typed draft out of the admin's own queue; review_sent_at=is.null is what
  // stops a draft the admin ignored being re-sent every two hours.
  const { h, status, body } = await postNotify({ rows: [] });
  assert.equal(status, 200);
  assert.equal(h.supa.length, 1);
  const q = h.supa[0].path;
  assert.match(q, /status=eq\.draft/);
  assert.match(q, /source=eq\.adzuna/);
  assert.match(q, /review_sent_at=is\.null/);
  assert.match(q, /order=first_seen_at\.asc/, 'oldest first, so a backlog drains in arrival order');
  assert.deepEqual(body, { sent: 0, failed: 0, remaining: 0, errors: [] });
});

test('notify messages each pending draft and stamps it sent', async () => {
  const rows = [draft(), draft({ id: UUID2, title: 'Another Unfamiliar Role' })];
  const { h, body } = await postNotify({ rows });
  assert.equal(body.sent, 2);
  assert.equal(body.failed, 0);
  assert.equal(h.telegram.length, 2);
  for (const call of h.telegram) {
    assert.equal(call.method, 'sendMessage');
    assert.equal(call.body.chat_id, ADMIN, 'the bot may only message the admin');
  }
  assert.match(h.telegram[0].body.text, /Chief Happiness Wizard/);

  const stamps = h.supa.filter(c => c.method === 'PATCH');
  assert.equal(stamps.length, 2, 'each delivered card is recorded as asked');
  for (const s of stamps) {
    assert.match(s.path, /^jobs\?id=eq\.[0-9a-f-]{36}$/);
    assert.match(s.body.review_sent_at, /^\d{4}-\d{2}-\d{2}T/);
  }
  assert.equal(stamps[0].body.review_message_id, '1', 'the message id is kept for tracing');
});

test('notify stamps only after a successful send, so a failure retries next run', async () => {
  // The ordering matters: stamping first would drop a job out of the queue
  // because of a transient Telegram error, and it would never be asked again.
  const { h, body } = await postNotify({
    rows: [draft()],
    tg: (method) => method === 'sendMessage'
      ? new Response(JSON.stringify({ ok: false, description: 'Too Many Requests' }), { status: 200 })
      : new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
  });
  assert.equal(body.sent, 0);
  assert.equal(body.failed, 1);
  assert.equal(body.errors.length, 1);
  assert.match(body.errors[0], /Too Many Requests/);
  assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'nothing was stamped');
});

test('one bad card does not abandon the rest of the queue', async () => {
  const rows = [draft(), draft({ id: UUID2, title: 'Second' })];
  const { body } = await postNotify({
    rows,
    tg: (method, b) => {
      if (method === 'sendMessage') {
        return b.text.includes('Chief Happiness Wizard')
          ? new Response(JSON.stringify({ ok: false, description: 'nope' }), { status: 200 })
          : new Response(JSON.stringify({ ok: true, result: { message_id: 9 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    }
  });
  assert.equal(body.sent, 1);
  assert.equal(body.failed, 1);
});

test('notify reports the leftover backlog instead of dropping it silently', async () => {
  // MAX_PER_RUN is sized by Cloudflare's 50-subrequest budget (send + stamp = 2
  // per card), so a queue this long drains across runs. Reporting what is left
  // is what makes that visible rather than looking like a short queue.
  const many = Array.from({ length: 130 }, (_, i) => draft({ id: `${i}`.padStart(8, '0') } ));
  const { h, body } = await postNotify({ rows: many });
  assert.equal(body.sent, 20);
  assert.equal(body.remaining, 110);
  assert.equal(h.telegram.length, 20);
});

test('a missing review_sent_at column is a loud 503, not a silent zero', async () => {
  // The pre-migration schema. Reporting { sent: 0 } here would be indistinguishable
  // from a quiet queue, and the bot would look broken with nothing to show for it.
  const { status, body } = await postNotify({
    rows: [],
    supaGet: () => ({
      __response: new Response(
        JSON.stringify({ code: '42703', message: 'column jobs.review_sent_at does not exist' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    })
  });
  assert.equal(status, 503);
  assert.match(body.error, /jobs_review_migration\.sql/);
});

test('notify says so when Telegram is not configured, instead of pretending to send', async () => {
  const mod = await import(notifyUrl);
  const h = harness({ rows: [draft()] });
  try {
    const res = await mod.onRequestPost({
      request: post(),
      env: { ...env, TELEGRAM_BOT_TOKEN: '', TELEGRAM_ADMIN_CHAT_ID: '' }
    });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /TELEGRAM_BOT_TOKEN/);
    assert.equal(h.telegram.length, 0);
  } finally {
    h.restore();
  }
});

// ---------------------------------------------------------------------------
// /telegram
// ---------------------------------------------------------------------------

/** A callback_query as Telegram sends it for a press on one of our cards. */
function callback(data, over = {}) {
  return {
    update_id: 1,
    callback_query: {
      id: 'cbq-1',
      from: { id: Number(ADMIN), ...(over.from || {}) },
      message: {
        message_id: 42,
        chat: { id: Number(ADMIN), type: 'private', ...(over.chat || {}) },
        text: '<b>Chief Happiness Wizard</b>\nElsewhere',
        ...(over.message || {})
      },
      data
    }
  };
}

function postTelegram(update) {
  const mod = Promise.resolve(import(telegramUrl));
  const req = new Request('https://example.com/telegram', {
    method: 'POST',
    headers: {
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
      'content-type': 'application/json'
    },
    body: JSON.stringify(update)
  });
  return mod.then(m => ({ mod: m, req, env }));
}

test('the webhook refuses a request without the Telegram secret', async () => {
  // The route is a public URL. Without the secret header, anyone who found it
  // could publish or reject jobs, so this check is the whole authorisation story
  // for everything except "who pressed".
  const mod = await import(telegramUrl);
  for (const headers of [
    { 'content-type': 'application/json' },
    { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong' },
    { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET.slice(0, -1) }
  ]) {
    const h = harness({ rows: [{ id: UUID, status: 'draft' }] });
    try {
      const res = await mod.onRequestPost({
        request: new Request('https://example.com/telegram', {
          method: 'POST', headers, body: JSON.stringify(callback(`pub:${UUID}`))
        }),
        env
      });
      assert.equal(res.status, 401, `accepted headers ${JSON.stringify(Object.keys(headers))}`);
      assert.equal(h.supa.length, 0, 'no status write');
      assert.equal(h.telegram.length, 0, 'and no answer to a press we did not authenticate');
    } finally {
      h.restore();
    }
  }
});

test('GET /telegram reports configuration without leaking anything', async () => {
  const mod = await import(telegramUrl);
  const res = await mod.onRequestGet({ env });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.configured, true);
  assert.equal(body.webhookSecretSet, true);
  assert.ok(!JSON.stringify(body).includes(BOT), 'the bot token must not appear in a response');
  assert.ok(!JSON.stringify(body).includes(WEBHOOK_SECRET), 'the webhook secret must not appear in a response');
});

test('Publish flips a draft to published and tells the admin', async () => {
  const { mod, req } = await postTelegram(callback(`pub:${UUID}`));
  const h = harness({ rows: [{ id: UUID, title: 'Chief Happiness Wizard', company: 'Elsewhere', status: 'draft' }] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'published');

    const read = h.supa.find(c => c.method === 'GET');
    assert.match(read.path, new RegExp(`id=eq\\.${UUID}$`), 'the job named by the button is re-read');
    const write = h.supa.find(c => c.method === 'PATCH');
    assert.ok(write, 'the status must actually be written');
    assert.equal(write.path, `jobs?id=eq.${UUID}`);
    assert.deepEqual(write.body, { status: 'published' });

    const edit = h.telegram.find(c => c.method === 'editMessageText');
    assert.ok(edit, 'the card is marked in place');
    assert.match(edit.body.text, /Published/);
    assert.deepEqual(edit.body.reply_markup, { inline_keyboard: [] }, 'the buttons come off');
    const ack = h.telegram.find(c => c.method === 'answerCallbackQuery');
    assert.ok(ack, 'Telegram is told the press was handled');
  } finally {
    h.restore();
  }
});

test('Reject marks the job rejected rather than deleting it', async () => {
  // Rejected rows are kept on purpose: the decision is auditable and the dedupe
  // key stops the same listing coming back as a new draft tomorrow.
  const { mod, req } = await postTelegram(callback(`rej:${UUID}`));
  const h = harness({ rows: [{ id: UUID, title: 'X', company: 'Y', status: 'draft' }] });
  try {
    await mod.onRequestPost({ request: req, env });
    const write = h.supa.find(c => c.method === 'PATCH');
    assert.deepEqual(write.body, { status: 'rejected' });
    assert.equal(h.supa.filter(c => c.method === 'DELETE').length, 0, 'a reject is not a delete');
  } finally {
    h.restore();
  }
});

test('a press on an already-decided job changes nothing', async () => {
  // The stale-card case: the job was published, then someone re-presses Reject on
  // a message still in their chat history. Without the draft check this would
  // unpublish a live listing.
  const { mod, req } = await postTelegram(callback(`rej:${UUID}`));
  const h = harness({ rows: [{ id: UUID, title: 'X', company: 'Y', status: 'published' }] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ignored, 'already decided');
    assert.equal(body.status, 'published');
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'nothing may be written');
    const ack = h.telegram.find(c => c.method === 'answerCallbackQuery');
    assert.match(ack.body.text, /Already published/);
  } finally {
    h.restore();
  }
});

test('a press from anyone but the admin is ignored, even with a valid secret', async () => {
  // The secret proves the request came through our webhook URL. It says nothing
  // about who pressed, so the id check is a separate, necessary gate.
  const { mod, req } = await postTelegram(callback(`pub:${UUID}`, { from: { id: 999 } }));
  const h = harness({ rows: [{ id: UUID, status: 'draft' }] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    assert.equal((await res.json()).ignored, 'not the admin');
    assert.equal(h.supa.length, 0, 'not even the job is read');
    const ack = h.telegram.find(c => c.method === 'answerCallbackQuery');
    assert.match(ack.body.text, /Not your queue/);
  } finally {
    h.restore();
  }
});

test('a press in a group by the admin still does not decide', async () => {
  // chat.id is the group, from.id is the admin. Requiring both to be the admin id
  // means a group is not a valid queue, which is the safe default.
  const { mod, req } = await postTelegram(callback(`pub:${UUID}`, { chat: { id: -1001234, type: 'group' } }));
  const h = harness({ rows: [{ id: UUID, status: 'draft' }] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    assert.equal((await res.json()).ignored, 'not the admin');
    assert.equal(h.supa.length, 0);
  } finally {
    h.restore();
  }
});

test('a press naming a job that is gone is answered, not an error', async () => {
  const { mod, req } = await postTelegram(callback(`pub:${UUID}`));
  const h = harness({ rows: [] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, 'job not found');
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0);
    const ack = h.telegram.find(c => c.method === 'answerCallbackQuery');
    assert.match(ack.body.text, /no longer in the queue/);
  } finally {
    h.restore();
  }
});

test('callback data that is not a known decision is refused', async () => {
  // Defence in depth: only pub:/rej: with a uuid is ever sent by us, so anything
  // else did not come from our keyboard. It must not reach the database at all -
  // the id is interpolated straight into a PostgREST filter.
  for (const data of [
    `del:${UUID}`,
    `pub:${UUID}&select=*`,
    'pub:',
    'anything at all',
    ''
  ]) {
    const { mod, req } = await postTelegram(callback(data));
    const h = harness({ rows: [{ id: UUID, status: 'draft' }] });
    try {
      const res = await mod.onRequestPost({ request: req, env });
      assert.equal(res.status, 200, `data ${JSON.stringify(data)} should be ignored, not error`);
      assert.equal((await res.json()).ignored, 'unrecognised callback data');
      assert.equal(h.supa.length, 0, `data ${JSON.stringify(data)} reached the database`);
    } finally {
      h.restore();
    }
  }
});

test('Publish-all flips the whole pending queue and records it on the card', async () => {
  // The review-flow companion to the per-job Publish button: one press for a
  // backlog, decided against the queue as it is now.
  const { mod, req } = await postTelegram(callback('puball'));
  const h = harness({ rows: [draft(), draft({ id: UUID2, title: 'Second Role' })] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.published, 2);

    const read = h.supa.find(c => c.method === 'GET');
    assert.match(read.path, /status=eq\.draft/, 'the queue is re-read on the press');
    assert.match(read.path, /source=eq\.adzuna/, 'same scope as the cards /notify is asking about');

    const write = h.supa.find(c => c.method === 'PATCH');
    assert.ok(write, 'the queue is written in one request');
    assert.match(write.path, new RegExp(`id=in\\.\\(${UUID},${UUID2}\\)`));
    assert.deepEqual(write.body, { status: 'published' });

    const edit = h.telegram.find(c => c.method === 'editMessageText');
    assert.ok(edit, 'the pressed card records the outcome');
    assert.match(edit.body.text, /Published 2 pending drafts/);
    assert.deepEqual(edit.body.reply_markup, { inline_keyboard: [] });

    const ack = h.telegram.find(c => c.method === 'answerCallbackQuery');
    assert.match(ack.body.text, /Published 2/);
  } finally {
    h.restore();
  }
});

test('Publish-all on an already-empty queue is answered, not an error', async () => {
  const { mod, req } = await postTelegram(callback('puball'));
  const h = harness({ rows: [] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).published, 0);
    assert.equal(h.supa.filter(c => c.method === 'PATCH').length, 0, 'nothing to publish');
    const ack = h.telegram.find(c => c.method === 'answerCallbackQuery');
    assert.match(ack.body.text, /already empty/);
  } finally {
    h.restore();
  }
});

test('a non-button update is acknowledged and ignored', async () => {
  // allowed_updates is set to callback_query only, so this should not happen - but
  // Telegram will send an unknown update once in a while, and a webhook that 500s
  // makes Telegram retry the same update forever.
  const { mod, req } = await postTelegram({ update_id: 1, message: { text: 'hello' } });
  const h = harness({ rows: [] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, 'not a button press');
    assert.equal(h.supa.length + h.telegram.length, 0);
  } finally {
    h.restore();
  }
});

test('a failed status write is reported and the card keeps its buttons', async () => {
  // Nothing is committed, so the card must stay pressable: the admin retries
  // rather than believing a decision that was not saved.
  const { mod, req } = await postTelegram(callback(`pub:${UUID}`));
  const h = harness();
  const realFetch = globalThis.fetch;
  h.restore();
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://fake.supabase.co')) {
      const method = (init && init.method) || 'GET';
      h.supa.push({ method, path: url.split('/rest/v1/')[1], body: null });
      if (method === 'GET') {
        return new Response(JSON.stringify([{ id: UUID, title: 'X', status: 'draft' }]), { status: 200 });
      }
      return new Response(JSON.stringify({ code: '08006' }), { status: 500 });
    }
    h.telegram.push({ method: url.split('/bot').pop().split('/')[1], body: JSON.parse((init && init.body) || '{}') });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const res = await mod.onRequestPost({ request: req, env });
    assert.equal(res.status, 500);
    assert.equal(h.telegram.filter(c => c.method === 'editMessageText').length, 0,
      'the card must not claim a decision that was not saved');
    const ack = h.telegram.find(c => c.method === 'answerCallbackQuery');
    assert.match(ack.body.text, /Try again/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a decision that was saved still reports success if the card edit fails', async () => {
  // The write has already happened; a cosmetic failure must not be reported as a
  // failed press, or the admin re-presses and hits "already decided".
  const { mod, req } = await postTelegram(callback(`pub:${UUID}`));
  const realFetch = globalThis.fetch;
  const tgCalls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://fake.supabase.co')) {
      const method = (init && init.method) || 'GET';
      if (method === 'GET') {
        return new Response(JSON.stringify([{ id: UUID, title: 'X', status: 'draft' }]), { status: 200 });
      }
      return new Response(null, { status: 204 });
    }
    const method = url.split('/bot').pop().split('/')[1];
    tgCalls.push(method);
    if (method === 'editMessageText') {
      return new Response(JSON.stringify({ ok: false, description: 'message is not modified' }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    const res = await mod.onRequestPost({ request: req, env });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'published');
    assert.ok(tgCalls.includes('answerCallbackQuery'), 'the press is still acknowledged');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('malformed JSON is a 400, not a 500 that Telegram would retry', async () => {
  const mod = await import(telegramUrl);
  const req = new Request('https://example.com/telegram', {
    method: 'POST',
    headers: {
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
      'content-type': 'application/json'
    },
    body: '{not json'
  });
  const h = harness({ rows: [] });
  try {
    const res = await mod.onRequestPost({ request: req, env });
    assert.equal(res.status, 400);
    assert.equal(h.telegram.length, 0);
  } finally {
    h.restore();
  }
});
