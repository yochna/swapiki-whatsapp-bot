// Tests for the Edit Profile truth-attestation record added in 0.8.38.
//
// Two things matter here and both are easy to regress:
//   1. The attestation (name + time) is actually persisted, locally and to the
//      cloud, with the right column names.
//   2. It is written in an ISOLATED update. If it rode along in the big profile
//      upsert, a project that has not run the migration yet would lose its
//      whole cloud profile save the moment this feature shipped.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootStore, makeFakeSupabase } = require('./helpers/store-sandbox');

const user = { id: 'user-1', email: 'a@example.com' };

test('recordProfileAttestation stores the trimmed name and a timestamp locally', () => {
  const { store, storage } = bootStore({});
  const before = Date.now();
  store.recordProfileAttestation({ name: '  Ananya Sharma  ' });

  assert.equal(store.data.profileAttestedName, 'Ananya Sharma');
  assert.ok(store.data.profileAttestedAt, 'expected a timestamp');
  assert.ok(new Date(store.data.profileAttestedAt).getTime() >= before);

  const persisted = JSON.parse(storage.getItem(store.key));
  assert.equal(persisted.profileAttestedName, 'Ananya Sharma');
  assert.equal(persisted.profileAttestedAt, store.data.profileAttestedAt);
});

test('recordProfileAttestation uses the provided timestamp and blanks an empty name to null', () => {
  const { store } = bootStore({});
  store.recordProfileAttestation({ name: '   ', attestedAt: '2026-09-30T10:00:00.000Z' });
  assert.equal(store.data.profileAttestedAt, '2026-09-30T10:00:00.000Z');
  assert.equal(store.data.profileAttestedName, null);
});

test('recordProfileAttestation writes the two columns via an isolated update, not the profile upsert', async () => {
  const supabase = makeFakeSupabase();
  const { store } = bootStore({ supabase, user });

  store.recordProfileAttestation({ name: 'Ananya Sharma' });
  await new Promise(r => setImmediate(r));

  const updates = supabase.calls.filter(c => c.kind === 'update');
  assert.equal(updates.length, 1, 'expected exactly one update');
  assert.equal(updates[0].payload.profile_attested_name, 'Ananya Sharma');
  assert.equal(updates[0].payload.profile_attested_at, store.data.profileAttestedAt);

  const upserts = supabase.calls.filter(c => c.kind === 'upsert');
  assert.equal(upserts.length, 0, 'attestation must not use the big profile upsert');
});

test('a missing attestation column logs a warning but never throws or blocks the local record', async () => {
  const supabase = makeFakeSupabase();
  supabase.state.nextError = { message: 'column "profile_attested_at" does not exist' };
  const { store, storage } = bootStore({ supabase, user });

  assert.doesNotThrow(() => store.recordProfileAttestation({ name: 'Ananya' }));
  await new Promise(r => setImmediate(r));

  assert.equal(store.data.profileAttestedName, 'Ananya');
  const persisted = JSON.parse(storage.getItem(store.key));
  assert.equal(persisted.profileAttestedName, 'Ananya');
});

test('the main profile upsert payload never includes the attestation columns', async () => {
  const supabase = makeFakeSupabase();
  const { store } = bootStore({ supabase, user });

  store.saveData({ ...store.data, name: 'Ananya Sharma' });
  await new Promise(r => setImmediate(r));

  const upserts = supabase.calls.filter(c => c.kind === 'upsert');
  assert.equal(upserts.length, 1, 'expected one profile upsert');
  const payload = upserts[0].payload;
  assert.ok(!('profile_attested_at' in payload), 'profile_attested_at must stay out of the main upsert');
  assert.ok(!('profile_attested_name' in payload), 'profile_attested_name must stay out of the main upsert');
});

test('fromSupabaseRow maps the attestation columns to camelCase', () => {
  const { store } = bootStore({});
  const profile = store.fromSupabaseRow({
    id: 'c1',
    name: 'Ananya',
    profile_attested_at: '2026-09-30T10:00:00.000Z',
    profile_attested_name: 'Ananya Sharma'
  });
  assert.equal(profile.profileAttestedAt, '2026-09-30T10:00:00.000Z');
  assert.equal(profile.profileAttestedName, 'Ananya Sharma');
});

test('fromSupabaseRow leaves absent attestation columns as null', () => {
  const { store } = bootStore({});
  const profile = store.fromSupabaseRow({ id: 'c1', name: 'Ananya' });
  assert.equal(profile.profileAttestedAt, null);
  assert.equal(profile.profileAttestedName, null);
});

test('normalizeData backfills attestation fields on a profile cached by an older build', () => {
  const storage = require('./helpers/store-sandbox').makeStorage({
    swapiki_candidate_data_v2: JSON.stringify({ id: 'c1', name: 'Old Profile', projects: [] })
  });
  const { store } = bootStore({ storage });
  assert.equal(store.data.profileAttestedAt, null);
  assert.equal(store.data.profileAttestedName, null);
});
