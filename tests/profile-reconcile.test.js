// A candidate's profile lives in two places: the browser (localStorage) and a
// Supabase row. The profile upsert is fire-and-forget and only logs its
// failures, so the cloud row can silently fall behind the browser - an RLS
// rejection, a dropped connection, an unapplied migration, a second device that
// never refreshed. The cloud load used to replace the browser's copy wholesale,
// which turned any lag into permanent data loss: it wrote the emptied profile
// back over localStorage, so the fields were gone from both sides.
//
// These pin the rule that replaced it: newer copy wins, and when it cannot be
// determined the cloud never gets to blank something the browser still has.
const test = require('node:test');
const assert = require('node:assert');
const { bootStore, makeStorage } = require('./helpers/store-sandbox');

const USER = { id: 'u1', email: 'rahul@example.com', user_metadata: {} };

/** A Supabase stand-in that answers the candidates select with `row`. */
function cloudReturning(row) {
  const upserts = [];
  const builder = {
    select() { return builder; },
    order() { return builder; },
    eq() { return builder; },
    limit() { return builder; },
    maybeSingle() { return builder; },
    upsert(payload) { upserts.push(payload); return builder; },
    update() { return builder; },
    then(resolve) { return Promise.resolve({ data: row, error: null }).then(resolve); },
    catch(reject) { return Promise.resolve({ data: row, error: null }).catch(reject); }
  };
  return { from() { return builder; }, upserts };
}

/** The select fails outright - a dropped connection or an RLS rejection. */
function cloudFailing(error) {
  const builder = {
    select() { return builder; },
    order() { return builder; },
    eq() { return builder; },
    limit() { return builder; },
    maybeSingle() { return builder; },
    upsert() { return builder; },
    update() { return builder; },
    then(resolve) { return Promise.resolve({ data: null, error }).then(resolve); },
    catch(reject) { return Promise.resolve({ data: null, error }).catch(reject); }
  };
  return { from() { return builder; } };
}

/** The select never resolves - a dropped connection mid-request. */
function cloudRejecting(error) {
  const builder = {
    select() { return builder; },
    order() { return builder; },
    eq() { return builder; },
    limit() { return builder; },
    maybeSingle() { return builder; },
    upsert() { return builder; },
    update() { return builder; },
    then(resolve, reject) { if (reject) reject(error); return Promise.resolve(); },
    catch(reject) { return Promise.resolve(); }
  };
  return { from() { return builder; } };
}

const MIN = 60 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();

/**
 * Boots a store over a shared localStorage that already holds the edits the
 * candidate typed, then reloads it against a cloud row.
 */
async function reload(opts) {
  const storage = makeStorage();
  const first = bootStore({ storage });
  first.store.data = Object.assign(first.store.emptyProfileTemplate(), {
    name: 'Rahul Sharma',
    title: 'Senior Frontend Engineer',
    location: 'Bengaluru',
    linkedin: 'https://linkedin.com/in/rahul',
    projects: [{ id: 'p1', title: 'Checkout rebuild' }]
  });
  // Legacy local data carries no updatedAt at all.
  if (!opts.stampLocal) delete first.store.data.updatedAt;
  if (opts.localUpdatedAt) first.store.data.updatedAt = opts.localUpdatedAt;
  first.store.saveData(first.store.data);

  // A real `.select().limit(1)` resolves to an array of rows.
  const supabase = opts.rejects ? cloudRejecting(opts.rejects)
    : opts.fails ? cloudFailing(opts.fails)
      : cloudReturning([opts.row]);
  const second = bootStore({ storage, supabase, user: USER });
  await second.store.loadProfileForUser(USER);
  return { store: second.store, supabase, storage };
}

const STALE_ROW = {
  id: 'c1', user_id: 'u1', name: 'Rahul Sharma', updated_at: ago(10 * MIN),
  title: null, location: null, linkedin: null, profile_status: 'draft', projects: []
};

// --- the data loss itself ------------------------------------------------

test('a cloud row that is behind cannot blank what the candidate already typed', async () => {
  const { store } = await reload({
    row: STALE_ROW,
    localUpdatedAt: ago(1 * MIN)
  });
  assert.strictEqual(store.data.title, 'Senior Frontend Engineer', 'title survived');
  assert.strictEqual(store.data.location, 'Bengaluru', 'location survived');
  assert.strictEqual(store.data.linkedin, 'https://linkedin.com/in/rahul', 'link survived');
});

test('the rescued profile is written back, so the loss cannot repeat', async () => {
  const { store, supabase } = await reload({
    row: STALE_ROW,
    localUpdatedAt: ago(1 * MIN)
  });
  const push = supabase.upserts.find(u => u.name === 'Rahul Sharma');
  assert.ok(push, 'the browser copy was pushed back up');
  assert.strictEqual(push.title, 'Senior Frontend Engineer');
  assert.strictEqual(push.location, 'Bengaluru');
});

test('a cloud row with no usable timestamp never blanks the browser copy', async () => {
  // Undecidable must not fall through to "the cloud wins" - that was the branch
  // that ate profiles, and a row written before updated_at existed hits it.
  const row = Object.assign({}, STALE_ROW);
  delete row.updated_at;
  const { store } = await reload({ row });
  assert.strictEqual(store.data.location, 'Bengaluru');
  assert.strictEqual(store.data.linkedin, 'https://linkedin.com/in/rahul');
});

test('proof projects survive a cloud row whose projects embed came back empty', async () => {
  // No localUpdatedAt on purpose: with timestamps this case is already covered
  // by "keep the newer copy whole", so without this the projects rule below it
  // would never actually be exercised.
  const { store, supabase, storage } = await reload({ row: Object.assign({}, STALE_ROW, { projects: null }) });
  assert.strictEqual(store.data.projects.length, 1, 'their project is still there');
  assert.strictEqual(store.data.projects[0].title, 'Checkout rebuild');
  // Projects live in their own table, so the profile upsert never carried them;
  // what must not happen is the emptied profile being written over the copy on
  // this device, which is what made the loss permanent.
  const persisted = JSON.parse(storage.getItem('swapiki_candidate_data_v2'));
  assert.strictEqual(persisted.projects.length, 1, 'and it is still saved on this device');
  const push = supabase.upserts.find(u => u.name === 'Rahul Sharma');
  assert.ok(push, 'the rescued fields are written back up, so this cannot repeat');
  assert.strictEqual(push.title, 'Senior Frontend Engineer');
});

// --- multi-device must still work ----------------------------------------

test('a genuinely newer cloud row wins, so editing on another device still works', async () => {
  const { store } = await reload({
    row: Object.assign({}, STALE_ROW, {
      title: 'Staff Frontend Engineer',
      location: 'Hyderabad',
      updated_at: ago(MIN)
    }),
    localUpdatedAt: ago(30 * MIN)
  });
  assert.strictEqual(store.data.title, 'Staff Frontend Engineer', 'the newer edit came through');
  assert.strictEqual(store.data.location, 'Hyderabad');
});

test('a field the candidate deliberately cleared is not resurrected', async () => {
  // The rescue must not become a way to undo a real clear on a newer copy.
  const { store } = await reload({
    row: Object.assign({}, STALE_ROW, {
      title: 'Staff Frontend Engineer',
      location: '',
      updated_at: ago(MIN)
    }),
    localUpdatedAt: ago(30 * MIN)
  });
  assert.strictEqual(store.data.location, '', 'the clear was respected');
  assert.strictEqual(store.data.title, 'Staff Frontend Engineer');
});

test('editing after a load makes the browser the newer copy again', async () => {
  const { store } = await reload({
    row: Object.assign({}, STALE_ROW, { updated_at: ago(MIN) }),
    localUpdatedAt: ago(30 * MIN)
  });
  store.updateProfile({ location: 'Pune' });
  assert.ok(Date.parse(store.data.updatedAt) > Date.parse(ago(MIN)) - MIN,
    'the save stamped a fresh timestamp: ' + store.data.updatedAt);
  assert.strictEqual(store.data.location, 'Pune');
});

// --- identity stays cloud-led --------------------------------------------

test('the rescue never reinstates identity or infrastructure fields', async () => {
  // Resurrecting a stale username, avatar or published status would be worse
  // than losing them: those are unique, locked and admin-owned.
  const storage = makeStorage();
  const first = bootStore({ storage });
  first.store.data = Object.assign(first.store.emptyProfileTemplate(), {
    name: 'Rahul', username: 'rahul-old', avatar: 'https://old/a.png',
    profileStatus: 'published', locked: true, location: 'Bengaluru'
  });
  delete first.store.data.updatedAt;
  first.store.saveData(first.store.data);

  const supabase = cloudReturning([{
    id: 'c1', user_id: 'u1', name: 'Rahul', updated_at: ago(5 * MIN),
    username: 'rahul', avatar: null, profile_status: 'draft', location: null
  }]);
  const second = bootStore({ storage, supabase, user: USER });
  await second.store.loadProfileForUser(USER);

  assert.strictEqual(second.store.data.username, 'rahul', 'the cloud handle stands');
  assert.strictEqual(second.store.data.avatar, null, 'a stale avatar is not restored');
  assert.strictEqual(second.store.data.profileStatus, 'draft', 'published status is not restored');
  assert.strictEqual(second.store.data.location, 'Bengaluru', 'but their typed location is kept');
});

// --- a failed lookup is not an empty profile -----------------------------

test('a failed profile lookup does not replace a real profile with a blank draft', async () => {
  // This is the worse half of the same bug: an errored select produced no rows,
  // which the old code read as "this candidate has no profile yet" - so it built
  // a fresh empty one and saved it over the copy already on the device. One
  // flaky request, one RLS rejection, one rejected projects embed was enough.
  const { store } = await reload({ fails: { message: 'PGRST301: JWT expired' }, localUpdatedAt: ago(MIN) });
  assert.strictEqual(store.data.name, 'Rahul Sharma', 'still themselves');
  assert.strictEqual(store.data.title, 'Senior Frontend Engineer');
  assert.strictEqual(store.data.location, 'Bengaluru');
  assert.strictEqual(store.data.projects.length, 1, 'and their proof project');
});

test('a request that never comes back is still a failure, not an empty profile', async () => {
  // The rejected-request path is separate from the errored-response path: the
  // catch has to carry the reason forward, or the load is indistinguishable
  // from "no profile exists yet".
  const { store } = await reload({ rejects: new Error('Failed to fetch'), localUpdatedAt: ago(MIN) });
  assert.strictEqual(store.data.name, 'Rahul Sharma');
  assert.strictEqual(store.data.location, 'Bengaluru');
});

test('a lookup that returns an unusable shape is treated as a failure, not as no profile', async () => {
  const { store } = await reload({ fails: { message: 'unexpected shape' }, localUpdatedAt: ago(MIN) });
  assert.notStrictEqual(store.data.title, '', 'a blank profile is never invented over real data');
});

test('a genuinely new candidate with no cloud row still gets a profile', async () => {
  // The guard must not turn "first ever sign-in" into a no-op.
  const storage = makeStorage();
  const first = bootStore({ storage });
  first.store.data = first.store.emptyProfileTemplate();
  first.store.saveData(first.store.data);

  const supabase = cloudReturning([]);
  const second = bootStore({ storage, supabase, user: { id: 'u9', email: 'new@e.com', user_metadata: { full_name: 'New Person' } } });
  await second.store.loadProfileForUser({ id: 'u9', email: 'new@e.com', user_metadata: { full_name: 'New Person' } });
  assert.strictEqual(second.store.data.name, 'New Person', 'seeded from their account');
  assert.ok(second.store.data.username, 'and given a handle');
});

// --- the number the candidate is shown -----------------------------------

test('a profile whose fields were eaten no longer reads as a near-empty one', async () => {
  const { buildProfileChecklist } = require('../js/profileChecklist.js');
  const { store } = await reload({ row: STALE_ROW, localUpdatedAt: ago(MIN) });
  const before = buildProfileChecklist(store.data);
  ['name-title', 'location', 'links'].forEach(key => {
    const item = before.items.find(i => i.key === key);
    assert.strictEqual(item.done, true, key + ' counts as done again');
  });
  assert.ok(before.percent >= 43, 'at least the three fields they filled in: ' + before.percent + '%');
});