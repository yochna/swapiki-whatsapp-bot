// The fraud takedown state. When an admin acts on a profile report the profile
// is frozen with profile_status = 'suspended': hidden from the public exactly
// like a draft, but distinct enough that the admin list can show a takedown
// rather than an unfinished profile.
//
// The reason this needs its own guard: the candidate owns their own row, and
// the "Users can update own profile" RLS policy would let a suspended candidate
// simply flip the status back to 'published' and reappear. The migration holds
// the status against them - only an admin or the service role can restore it.
//
// These pin four things:
//   1. A suspended profile is never served to the public (SSR, store read).
//   2. The store treats the status as cloud-authoritative, not a local field.
//   3. The admin UI freezes on a report and shows the state distinctly.
//   4. The migration function/trigger actually blocks the self-restore.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { bootStore, makeStorage } = require('./helpers/store-sandbox');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const USER = { id: 'u1', email: 'rahul@example.com', user_metadata: {} };

const SUSPENDED_ROW = {
  id: 'c1', user_id: 'u1', username: 'rahul', name: 'Rahul Sharma',
  profile_status: 'suspended', updated_at: new Date().toISOString(), projects: []
};

/** A Supabase stand-in that answers the candidates select with `row`. */
function cloudReturning(row) {
  const builder = {
    select() { return builder; },
    order() { return builder; },
    eq() { return builder; },
    limit() { return builder; },
    maybeSingle() { return builder; },
    upsert() { return builder; },
    update() { return builder; },
    then(resolve) { return Promise.resolve({ data: row, error: null }).then(resolve); },
    catch(reject) { return Promise.resolve({ data: row, error: null }).catch(reject); }
  };
  return { from() { return builder; } };
}

// --- 1. never served to the public ---------------------------------------

function stubSupabase(rows) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.includes('/rest/v1/candidates')) return new Response(JSON.stringify(rows), { status: 200 });
    return new Response('[]', { status: 200 });
  };
  return { restore: () => { globalThis.fetch = real; } };
}

test('a suspended profile is never server-rendered to the public', async () => {
  const ssr = await import(pathToFileURL(path.join(ROOT, 'functions', 'profile-ssr.js')).href);
  const s = stubSupabase([{ id: 'c1', username: 'rahul', name: 'Rahul', profile_status: 'suspended' }]);
  try {
    const profile = await ssr.getProfileForHandle('rahul', { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon' });
    assert.strictEqual(profile, null, 'a suspended handle must resolve to no profile');
  } finally { s.restore(); }
});

test('the store reads a suspended status back from the cloud', async () => {
  const store = bootStore({ storage: makeStorage(), supabase: cloudReturning([SUSPENDED_ROW]), user: USER }).store;
  await store.loadProfileForUser(USER);
  assert.strictEqual(store.data.profileStatus, 'suspended', 'the frozen status survives the cloud load');
});

// --- 2. status is cloud-authoritative ------------------------------------

test('profile status is not a field the browser may rescue over the cloud', () => {
  const store = bootStore({ storage: makeStorage() }).store;
  assert.ok(
    !store.constructor.RECONCILED_FIELDS.includes('profileStatus'),
    'a suspended cloud status must never be overwritten by a newer local copy'
  );
  assert.ok(
    !store.constructor.RECONCILED_FIELDS.includes('profile_status'),
    'and the snake_case form must not be in the rescue list either'
  );
});

// --- 3. admin ui ---------------------------------------------------------

test('acting on a report suspends the profile and marks the report actioned', () => {
  const app = read('js/app.js');
  assert.ok(app.includes('async adminSuspendReportedProfile('), 'the suspend action must exist');
  assert.ok(app.includes("adminSetProfileStatus(candidateId, 'suspended')"), 'it must freeze to suspended, not draft');
  assert.ok(app.includes('adminResolveProfileReport(reportId, \'actioned\')'), 'and resolve the report');
  assert.ok(
    !app.includes('adminUnpublishReportedProfile'),
    'the old unpublish-only report action must be gone, so a takedown is never just a draft'
  );
});

test('the report queue offers Suspend as its takedown button', () => {
  const app = read('js/app.js');
  assert.ok(app.includes("app.adminSuspendReportedProfile(this.dataset.id"), 'the queue button must call suspend');
  assert.ok(/>\s*Suspend</.test(app) || app.includes('> Suspend</button>'), 'and be labelled Suspend');
});

test('the admin candidate list shows a suspended profile distinctly and can restore it', () => {
  const app = read('js/app.js');
  assert.ok(
    /c\.profile_status === 'suspended' \? 'bg-rose-50 text-rose-700'/.test(app),
    'suspended must have its own (rose) badge, not the draft grey'
  );
  assert.ok(
    app.includes("c.profile_status === 'suspended' ? 'Restore'"),
    'the toggle on a suspended row must read Restore, because an admin can lift it'
  );
});

test('a suspended candidate is told their profile is under review, and cannot re-publish from the UI', () => {
  const app = read('js/app.js');
  assert.ok(app.includes('Paused — under review'), 'the dashboard must name the paused state');
  assert.ok(app.includes('publishButton.disabled = suspended'), 'and disable the publish control');
  assert.ok(
    app.includes("if (profile.profileStatus === 'suspended')") &&
    app.includes("this.showToast('Your profile is paused"),
    'publishProfile must refuse a suspended profile even if the button is forced'
  );
});

// --- 4. the migration holds the status against the candidate -------------

test('the migration freezes a suspended status against a self-restore', () => {
  const sql = read('supabase/suspend_migration.sql');
  assert.ok(/create or replace function public\.protect_suspended_profile\(\)/.test(sql), 'the guard function must exist');
  assert.ok(/before update on public\.candidates/.test(sql), 'and run before every candidate update');
  assert.ok(/old\.profile_status = 'suspended'/.test(sql), 'it only guards a move out of suspended');
  assert.ok(/new\.profile_status := 'suspended'/.test(sql), 'and reverts the move');
  assert.ok(/from public\.admins/.test(sql), 'admins can still restore');
  assert.ok(/service_role/.test(sql), 'as can the service role');
});
