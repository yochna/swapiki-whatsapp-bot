// Tests for the visitor-facing profile report path: POST /api/report-profile,
// the admin queue it feeds, and the on-page "Report this profile" control.
//
// What these hold in place:
//   1. A report is stored with the service role, so the browser never needs a
//      write policy on profile_reports and a logged-out visitor can still report.
//   2. The Telegram alert is best-effort: the report is saved first, so a bot
//      outage (or no Telegram at all) never loses a report.
//   3. A missing table is a loud 503 naming the migration, never a silent 200
//      that swallows a report the admin would never see.
//   4. The on-page control and admin queue are wired: the profile carries the
//      button, and the dashboard renders the reports section with real actions.
//
// functions/*.js are ESM, so they are pulled in with a dynamic import from these
// CommonJS tests, as the other route tests do.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const ROUTE = pathToFileURL(path.join(ROOT, 'functions', 'api', 'report-profile.js')).href;

const UUID = '3f8a1c2e-9d4b-4a1f-8c7d-2e6b5a4d3c21';
const BOT = '123456:AAEtesttesttesttesttesttesttesttesttest';
const CHAT = '555000111';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/**
 * Stubs PostgREST and the Bot API, recording every call.
 *
 * `insertResponse` lets a test drive the one write this route makes, so the
 * "table missing" and generic-failure paths can be exercised without a network.
 */
function harness({ insertResponse, tgResponse } = {}) {
  const supa = [];
  const telegram = [];
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const realErr = console.error;
  console.log = () => {};
  console.error = () => {};

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = (init && init.method) || 'GET';
    if (url.startsWith('https://fake.supabase.co')) {
      const restPath = url.split('/rest/v1/')[1];
      supa.push({ method, path: restPath, body: init && init.body ? JSON.parse(init.body) : null });
      if (insertResponse) return insertResponse();
      return new Response(JSON.stringify([{ id: 'report-1' }]), { status: 201 });
    }
    if (url.startsWith('https://api.telegram.org')) {
      const tgMethod = url.split('/bot').pop().split('/')[1];
      const body = init && init.body ? JSON.parse(init.body) : {};
      telegram.push({ method: tgMethod, body });
      if (tgResponse) return tgResponse();
      return new Response(JSON.stringify({ ok: true, result: { message_id: 9 } }), { status: 200 });
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

const env = (over = {}) => Object.assign({
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  TELEGRAM_BOT_TOKEN: BOT,
  TELEGRAM_ADMIN_CHAT_ID: CHAT
}, over);

function reportRequest(payload, { method = 'POST', ip = '1.2.3.4' } = {}) {
  return new Request('https://swapiki.com/api/report-profile', {
    method,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: method === 'POST' ? JSON.stringify(payload) : undefined
  });
}

let route;
test.before(async () => { route = await import(ROUTE); });

test('the route rejects anything but POST/OPTIONS', async () => {
  const res = await route.onRequest({ request: reportRequest({}, { method: 'GET' }), env: env() });
  assert.equal(res.status, 405);
  const opt = await route.onRequest({ request: reportRequest({}, { method: 'OPTIONS' }), env: env() });
  assert.equal(opt.status, 204);
});

test('a missing or malformed candidate_id is a 400, never a stored report', async () => {
  const h = harness();
  try {
    const none = await route.onRequest({ request: reportRequest({ reason: 'scam' }, { ip: '9.9.9.1' }), env: env() });
    assert.equal(none.status, 400);
    const bad = await route.onRequest({ request: reportRequest({ candidate_id: 'not-a-uuid' }, { ip: '9.9.9.1' }), env: env() });
    assert.equal(bad.status, 400);
    assert.equal(h.supa.length, 0, 'nothing may reach the database without a real profile id');
  } finally { h.restore(); }
});

test('without a service key the route refuses rather than pretending to file', async () => {
  const h = harness();
  try {
    const res = await route.onRequest({
      request: reportRequest({ candidate_id: UUID }, { ip: '9.9.9.2' }),
      env: env({ SUPABASE_SERVICE_ROLE_KEY: '' })
    });
    assert.equal(res.status, 503);
    assert.equal(h.supa.length, 0);
  } finally { h.restore(); }
});

test('a valid report is stored with the fields given, and the admin is alerted', async () => {
  const h = harness();
  try {
    const res = await route.onRequest({
      request: reportRequest({
        candidate_id: UUID,
        reason: 'scam',
        details: 'Asks for a deposit before an interview.',
        email: 'witness@example.com',
        page_url: 'https://someone.swapiki.com/'
      }, { ip: '9.9.9.3' }),
      env: env()
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.id, 'report-1');

    assert.equal(h.supa.length, 1, 'exactly one insert');
    assert.equal(h.supa[0].method, 'POST');
    assert.match(h.supa[0].path, /^profile_reports$/);
    assert.equal(h.supa[0].body.candidate_id, UUID);
    assert.equal(h.supa[0].body.reason, 'scam');
    assert.match(h.supa[0].body.details, /deposit/);

    assert.equal(h.telegram.length, 1, 'the admin gets exactly one alert');
    assert.equal(h.telegram[0].method, 'sendMessage');
    assert.equal(h.telegram[0].body.chat_id, CHAT);
    assert.match(h.telegram[0].body.text, /Profile reported/);
    assert.match(h.telegram[0].body.text, /Scam \/ fraud/);
  } finally { h.restore(); }
});

test('an unknown reason is coerced to "other" rather than stored raw', async () => {
  const h = harness();
  try {
    await route.onRequest({
      request: reportRequest({ candidate_id: UUID, reason: '<script>' }, { ip: '9.9.9.4' }),
      env: env()
    });
    assert.equal(h.supa[0].body.reason, 'other');
  } finally { h.restore(); }
});

test('a Telegram failure does not turn a saved report into an error', async () => {
  const h = harness({ tgResponse: () => new Response(JSON.stringify({ ok: false, description: 'kicked' }), { status: 200 }) });
  try {
    const res = await route.onRequest({
      request: reportRequest({ candidate_id: UUID, reason: 'spam' }, { ip: '9.9.9.5' }),
      env: env()
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
    assert.equal(h.supa.length, 1, 'the report is stored first');
  } finally { h.restore(); }
});

test('a missing profile_reports table is a loud 503 that names the migration', async () => {
  const h = harness({
    insertResponse: () => new Response(
      JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.profile_reports' in the schema cache" }),
      { status: 404 }
    )
  });
  try {
    const res = await route.onRequest({
      request: reportRequest({ candidate_id: UUID }, { ip: '9.9.9.6' }),
      env: env()
    });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /profile_reports_migration\.sql/);
  } finally { h.restore(); }
});

test('a burst of reports from one IP is rate-limited', async () => {
  const h = harness();
  try {
    let last = 200;
    for (let i = 0; i < 9; i++) {
      const res = await route.onRequest({
        request: reportRequest({ candidate_id: UUID, reason: 'spam' }, { ip: '7.7.7.7' }),
        env: env()
      });
      last = res.status;
    }
    assert.equal(last, 429, 'the ninth report from one IP in ten minutes is refused');
  } finally { h.restore(); }
});

test('the profile page carries a Report control and the report modal', () => {
  const html = read('index.html');
  assert.ok(html.includes('id="rec-report-btn"'), 'the profile must have a report button');
  assert.ok(html.includes('id="modal-report-profile"'), 'the report modal must exist');
  assert.ok(html.includes('app.openReportProfileModal()'), 'the button must open the modal');
  assert.ok(html.includes('id="report-reason"'), 'the modal must offer a reason');
  assert.ok(html.includes('app.submitProfileReport(event)'), 'the modal must submit through the app');
  // The badge honesty caption that this work added alongside the report path.
  assert.ok(
    /automated completeness checks/.test(html) && /not identity or background verification/.test(html),
    'the profile must say the badges are not identity verification'
  );
});

test('the profile render shows the report button only for someone else\'s profile', () => {
  const app = read('js/app.js');
  assert.ok(app.includes('openReportProfileModal()'), 'the modal opener must exist');
  assert.ok(app.includes('submitProfileReport('), 'the submit handler must exist');
  assert.ok(app.includes("swapikiStore.reportProfile("), 'the submit handler must call the store');
  const idx = app.indexOf("const showReport = !!this.publicUsername && !isAdminPreview");
  assert.ok(idx > -1, 'the button must be gated on a public, non-admin profile');
  assert.ok(app.includes("reportBtn.classList.toggle('hidden', !showReport)"), 'and it must be toggled, not always shown');
});

test('the store files reports through the Pages Function and reads them back for admins', () => {
  const store = read('js/store.js');
  assert.ok(store.includes("fetch('/api/report-profile'"), 'the store must call the report route');
  assert.ok(store.includes('async reportProfile('), 'the store must expose reportProfile');
  assert.ok(store.includes('async adminListProfileReports('), 'admins need a way to list reports');
  assert.ok(store.includes('async adminResolveProfileReport('), 'admins need a way to resolve reports');
});

test('the admin dashboard renders a reports queue with real actions', () => {
  const app = read('js/app.js');
  assert.ok(app.includes('${this.adminReportsSection(reports)}'), 'the dashboard must render the reports section');
  assert.ok(app.includes('swapikiStore.adminListProfileReports()'), 'and fetch the reports');
  assert.ok(app.includes('async adminSuspendReportedProfile('), 'suspend-and-resolve must exist');
  assert.ok(app.includes('async adminResolveReport('), 'dismiss must exist');
  assert.ok(app.includes("adminSetProfileStatus(candidateId, 'suspended')"), 'acting on a report must suspend the profile');
});

test('the migration creates the table with admin-only read/update and no public write', () => {
  const sql = read('supabase/profile_reports_migration.sql');
  assert.ok(/create table if not exists public\.profile_reports/.test(sql), 'the table must be created');
  assert.ok(/enable row level security/.test(sql), 'RLS must be on');
  assert.ok(/for select/.test(sql) && /from public\.admins/.test(sql), 'admins read via the admin table');
  assert.ok(/candidate_id text references public\.candidates\(id\)/.test(sql), 'candidate_id must match candidates.id, which is text not uuid');
  assert.ok(!/for insert[\s\S]*with check \(true\)/.test(sql), 'there must be no public insert policy');
});
