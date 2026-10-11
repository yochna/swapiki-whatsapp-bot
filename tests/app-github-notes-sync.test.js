// The device copy of a repo's notes is a cache, not the record: the account is
// where they actually live, so signing in on another laptop has to bring them
// back, and a half-saved device note must never be overwritten by an older
// account copy (or the other way round). These tests cover that merge, the
// upsert/select calls it makes, and what the app does when the repo_notes table
// has not been migrated yet.
const test = require('node:test');
const assert = require('node:assert');
const { bootApp, makeStorage } = require('./helpers/app-sandbox');
const storeSrc = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'store.js'), 'utf8');

const REPO = {
  name: 'checkout-redesign',
  description: 'React + TypeScript checkout rebuild', language: 'TypeScript', topics: ['react'],
  stargazers_count: 34, fork: false, archived: false, size: 5200,
  pushed_at: '2026-08-20T00:00:00Z', html_url: 'https://github.com/me/checkout-redesign'
};
const JOB = { id: 'j1', title: 'Senior Frontend Engineer', company: 'Flipkart', skills: ['React', 'TypeScript'], description: '- 4+ years building production React apps\n- Strong TypeScript experience' };

const FULL = {
  problem: 'checkout drop-off was costing us sales',
  role: 'I owned the front end end to end',
  stack: 'React with TypeScript, because the cart state had bugs that types caught',
  hard: 'keeping cart state consistent across tabs',
  result: 'cut checkout time from 2.8s to 1.6s and recovered 4% of revenue'
};

/** Boots the app signed in, with a store double that records every call. */
function bootSignedIn(storage, remote) {
  const store = storage || makeStorage();
  const { app, els, sandbox } = bootApp(store);
  const calls = { saved: [], deleted: [] };
  sandbox.swapikiStore.currentUser = { id: 'u1' };
  sandbox.swapikiStore.saveRepoNote = async (name, notes) => { calls.saved.push({ name, notes }); return true; };
  sandbox.swapikiStore.fetchRepoNotes = async () => (remote || {});
  sandbox.swapikiStore.deleteRepoNote = async name => { calls.deleted.push(name); return true; };
  app._interviewJob = JOB; app._interviewJobId = 'j1';
  app._ghSave({ username: 'me', repos: [REPO], fetchedAt: Date.now() });
  return { app, els, calls, sandbox, storage: store };
}

/**
 * Loads the real SwapikiStore class with its constructor's network setup
 * stripped, so the repo-notes methods can be exercised against a fake client
 * without booting Supabase. The production source is used verbatim - only the
 * constructor is dropped, so these tests cannot drift from the real code.
 */
function loadStoreClass() {
  const start = storeSrc.indexOf('class SwapikiStore');
  const end = storeSrc.indexOf('window.swapikiStore = new SwapikiStore()');
  const cls = storeSrc.slice(start, end).replace(/constructor\([\s\S]*?\n  \}\n/, '');
  return new Function('return (function(){' + cls + '\nreturn SwapikiStore;})()')();
}

/** VM-built objects have a different Object.prototype, so compare via JSON. */
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('the account copy is pulled down on a new device, so the story follows the candidate', async () => {
  const { app } = bootSignedIn(makeStorage(), {
    'checkout-redesign': { notes: FULL, updatedAt: '2026-09-20T10:00:00.000Z' }
  });
  await app._ghHydrateNotes();
  assert.deepStrictEqual(plain(app._ghNotes('checkout-redesign')), FULL, 'the words arrived intact');
  assert.strictEqual(app._ghNoteEnvelope('checkout-redesign').s, true, 'and are marked as reached the account');
});

test('a device note written here wins over an older account copy and is pushed back up', async () => {
  const { app, calls } = bootSignedIn(makeStorage(), {
    'checkout-redesign': { notes: { problem: 'the old version of the problem' }, updatedAt: '2026-09-01T00:00:00.000Z' }
  });
  app._ghWriteNotes('checkout-redesign', { problem: 'the newer problem I typed here' }, false, Date.parse('2026-09-25T10:00:00.000Z'));

  await app._ghHydrateNotes();

  assert.strictEqual(app._ghNotes('checkout-redesign').problem, 'the newer problem I typed here',
    'the newer device copy is not clobbered by the older account copy');
  assert.strictEqual(calls.saved.length, 1, 'and it is pushed up so the other device gets it');
  assert.strictEqual(calls.saved[0].name, 'checkout-redesign');
  assert.strictEqual(calls.saved[0].notes.problem, 'the newer problem I typed here');
});

test('an older account copy still wins over a stale device copy, then clears the unsynced flag', async () => {
  const { app, calls } = bootSignedIn(makeStorage(), {
    'checkout-redesign': { notes: { problem: 'typed on the other laptop' }, updatedAt: '2026-09-25T10:00:00.000Z' }
  });
  app._ghWriteNotes('checkout-redesign', { problem: 'stale leftover from weeks ago' }, false, Date.parse('2026-09-02T10:00:00.000Z'));

  await app._ghHydrateNotes();

  assert.strictEqual(app._ghNotes('checkout-redesign').problem, 'typed on the other laptop');
  assert.strictEqual(calls.saved.length, 0, 'nothing to push: the account was already newer');
  assert.strictEqual(app._ghNoteEnvelope('checkout-redesign').s, true, 'no longer waiting to be synced');
});

test('an identical copy on both sides is left alone', async () => {
  const at = '2026-09-25T10:00:00.000Z';
  const { app, calls } = bootSignedIn(makeStorage(), {
    'checkout-redesign': { notes: { problem: 'same words' }, updatedAt: at }
  });
  app._ghWriteNotes('checkout-redesign', { problem: 'same words' }, true, Date.parse(at));

  await app._ghHydrateNotes();

  assert.strictEqual(calls.saved.length, 0, 'no pointless write on every page load');
  assert.strictEqual(app._ghNoteEnvelope('checkout-redesign').s, true);
});

test('saving writes the device copy first, then mirrors it to the account', async () => {
  const { app, els, calls } = bootSignedIn(makeStorage());
  app.useRepoStory('checkout-redesign');
  app.toggleRepoNotes('checkout-redesign');
  Object.keys(FULL).forEach(k => { els['gh-note-' + k] = { value: FULL[k] }; });

  await app._ghSaveNotes('checkout-redesign');

  assert.deepStrictEqual(plain(app._ghNotes('checkout-redesign')), FULL, 'on the device immediately');
  assert.strictEqual(calls.saved.length, 1, 'and sent to the account');
  assert.deepStrictEqual(plain(calls.saved[0].notes), FULL);
  assert.strictEqual(app._ghNoteEnvelope('checkout-redesign').s, true, 'marked as synced once the push lands');
});

test('a failed push keeps the words on the device and reports them as device-only', async () => {
  const { app, els, sandbox } = bootSignedIn(makeStorage());
  sandbox.swapikiStore.saveRepoNote = async () => false;
  app.useRepoStory('checkout-redesign');
  app.toggleRepoNotes('checkout-redesign');
  els['gh-note-problem'] = { value: 'the problem' };

  await app._ghSaveNotes('checkout-redesign');

  assert.strictEqual(app._ghNotes('checkout-redesign').problem, 'the problem', 'nothing is lost when the network fails');
  assert.strictEqual(app._ghNoteEnvelope('checkout-redesign').s, false, 'still waiting to be synced');
  assert.ok(app._ghNoteWhereText(false).indexOf('this device only') !== -1, 'and the UI is honest about where it is');
});

test('the unsynced device copy is retried on the next hydrate', async () => {
  const { app, calls } = bootSignedIn(makeStorage(), {});
  app._ghWriteNotes('checkout-redesign', { problem: 'typed while signed out' }, false);

  await app._ghHydrateNotes();

  assert.strictEqual(calls.saved.length, 1, 'flushed to the account once signed in');
  assert.strictEqual(app._ghNoteEnvelope('checkout-redesign').s, true);
});

test('a signed-out candidate is told the truth: device only', () => {
  const { app } = bootApp(makeStorage());
  assert.strictEqual(app._ghNotesCloudState(), 'device', 'not the account');
  assert.ok(app._ghNoteWhereText(false).indexOf('Sign in to keep it') !== -1, 'the form says so');
});

test('a missing repo_notes table degrades to the device copy instead of breaking the form', async () => {
  const { app, els, sandbox } = bootSignedIn(makeStorage(), {});
  sandbox.swapikiStore.saveRepoNote = async () => false;
  sandbox.swapikiStore._repoNotesUnavailable = true; // store saw 42P01 / PGRST2
  app.useRepoStory('checkout-redesign');
  app.toggleRepoNotes('checkout-redesign');
  els['gh-note-problem'] = { value: 'still works' };

  await app._ghSaveNotes('checkout-redesign');

  assert.strictEqual(app._ghNotesCloudState(), 'device', 'falls back honestly');
  assert.strictEqual(app._ghNotes('checkout-redesign').problem, 'still works', 'the form still saves');
  assert.ok(els['gh-picker'].innerHTML.indexOf('What did you actually do') !== -1, 'and the picker still renders');
});

test('notes written before account sync existed still read correctly', () => {  const storage = makeStorage();
  const { app } = bootApp(storage);
  storage.setItem('swapiki_repo_notes_checkout-redesign', JSON.stringify({ problem: 'from the old format' }));
  assert.strictEqual(app._ghNotes('checkout-redesign').problem, 'from the old format');
  assert.strictEqual(app._ghNoteEnvelope('checkout-redesign').s, false, 'and count as not yet in the account');
});

test('a half-written or corrupt device record never throws', () => {
  const storage = makeStorage();
  const { app } = bootApp(storage);
  storage.setItem('swapiki_repo_notes_checkout-redesign', 'not json at all');
  assert.deepStrictEqual(plain(app._ghNotes('checkout-redesign')), {}, 'unparseable JSON reads as empty');
  storage.setItem('swapiki_repo_notes_other', JSON.stringify('a string'));
  assert.deepStrictEqual(plain(app._ghNotes('other')), {}, 'a non-object record reads as empty');
});

// ---- deleting: the candidate must be able to take their own words back out ----

test('forgetting a repo deletes it from the device, the index, and the account', async () => {
  const { app, els, calls, storage } = bootSignedIn(makeStorage());
  app.useRepoStory('checkout-redesign');
  app.toggleRepoNotes('checkout-redesign');
  Object.keys(FULL).forEach(k => { els['gh-note-' + k] = { value: FULL[k] }; });
  await app._ghSaveNotes('checkout-redesign');
  assert.deepStrictEqual(plain(app._ghNotes('checkout-redesign')), FULL, 'saved first');

  await app._ghClearNotes('checkout-redesign');

  assert.deepStrictEqual(plain(app._ghNotes('checkout-redesign')), {}, 'gone from the device');
  assert.deepStrictEqual(calls.deleted, ['checkout-redesign'], 'and the account row was deleted');
  const html = els['gh-picker'].innerHTML;
  assert.strictEqual(html.indexOf('gh-note-problem'), -1, 'the form is closed again');
  assert.ok(html.indexOf('checkout-redesign') !== -1, 'the repo is still listed');
  assert.strictEqual(html.indexOf('5/5 details added'), -1, 'and the progress badge is gone with the data');
});

test('a forgotten repo is not resurrected by the next hydrate', async () => {
  const { app, storage, calls } = bootSignedIn(makeStorage(), {});
  app._ghWriteNotes('checkout-redesign', FULL, false);
  assert.notStrictEqual(
    JSON.parse(storage.getItem('swapiki_repo_notes_index') || '[]').indexOf('checkout-redesign'), -1,
    'it is in the sync index while it exists'
  );

  await app._ghClearNotes('checkout-redesign');
  assert.strictEqual(
    JSON.parse(storage.getItem('swapiki_repo_notes_index') || '[]').indexOf('checkout-redesign'), -1,
    'dropped from the sync index, so the flush cannot send it again'
  );

  calls.saved.length = 0;
  await app._ghHydrateNotes();
  assert.strictEqual(calls.saved.length, 0, 'and never pushed back up');
});

test('forgetting works while signed out, without touching the network', async () => {
  const { app, sandbox } = bootApp(makeStorage());
  app._interviewJob = JOB; app._interviewJobId = 'j1';
  app._ghSave({ username: 'me', repos: [REPO], fetchedAt: Date.now() });
  app._ghWriteNotes('checkout-redesign', FULL, false);
  let called = false;
  sandbox.swapikiStore.deleteRepoNote = async () => { called = true; return true; };

  await app._ghClearNotes('checkout-redesign');

  assert.deepStrictEqual(plain(app._ghNotes('checkout-redesign')), {}, 'removed from the device');
  assert.strictEqual(called, false, 'no account call when there is no account');
});

test('the form offers a way to forget the details', () => {
  const { app, els } = bootSignedIn(makeStorage());
  app.useRepoStory('checkout-redesign');
  app.toggleRepoNotes('checkout-redesign');
  const html = els['gh-picker'].innerHTML;
  assert.ok(html.indexOf('Forget these details') !== -1, 'there is an erase action');
  assert.ok(html.indexOf('app._ghClearNotes(') !== -1, 'wired to the delete path');
  assert.ok(html.indexOf('from your account and this device') !== -1, 'and it says what it removes');
});

// ---- store.js layer: the sanitising and the table-missing detection ----

test('cleanRepoNotes keeps only the five fields, trimmed and capped', () => {
  const s = Object.create(loadStoreClass().prototype);
  const out = s.cleanRepoNotes({
    problem: '  spaced   out  ',
    role: '',
    evil: 'should never be stored',
    result: 'r'.repeat(500)
  });
  assert.strictEqual(out.problem, 'spaced out', 'collapsed and trimmed');
  assert.strictEqual('role' in out, false, 'empty answers are dropped, not stored blank');
  assert.strictEqual('evil' in out, false, 'unknown keys never reach the database');
  assert.strictEqual(out.result.length, 400, 'capped at 400 characters');
});

test('a missing table is recognised as a deployment state, not a sync failure', () => {
  const host = Object.create(loadStoreClass().prototype);
  host._repoNotesUnavailable = false;

  host.noteRepoNotesUnavailable({ code: '42P01', message: 'relation "repo_notes" does not exist' });
  assert.strictEqual(host._repoNotesUnavailable, true, 'a missing table switches the UI to device-only');

  host._repoNotesUnavailable = false;
  host.noteRepoNotesUnavailable({ code: '23505', message: 'duplicate key' });
  assert.strictEqual(host._repoNotesUnavailable, false, 'a real error is not mistaken for a missing table');
});

test('the upsert is keyed by user and repo, so two candidates never collide', async () => {
  const calls = [];
  const supabase = {
    from: table => ({
      upsert: (payload, opts) => { calls.push({ table, payload, opts }); return Promise.resolve({ error: null }); }
    })
  };
  const s = Object.create(loadStoreClass().prototype);
  s.supabase = supabase;
  s.currentUser = { id: 'u-123' };
  s._repoNotesUnavailable = false;

  const ok = await s.saveRepoNote('checkout-redesign', FULL);
  assert.strictEqual(ok, true, 'reports that it really reached the database');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].table, 'repo_notes');
  assert.strictEqual(calls[0].payload.user_id, 'u-123', 'row belongs to the signed-in candidate');
  assert.strictEqual(calls[0].payload.repo_name, 'checkout-redesign');
  assert.strictEqual(calls[0].opts.onConflict, 'user_id,repo_name', 're-saving replaces the same row');
});

test('a signed-out or tableless push reports false rather than pretending to have saved', async () => {
  const SwapikiStore = loadStoreClass();

  const signedOut = Object.create(SwapikiStore.prototype);
  signedOut.supabase = { from: () => ({ upsert: () => Promise.resolve({ error: null }) }) };
  signedOut.currentUser = null;
  assert.strictEqual(await signedOut.saveRepoNote('r1', FULL), false, 'signed out: no write, no lie');

  const failing = Object.create(SwapikiStore.prototype);
  failing.supabase = { from: () => ({ upsert: () => Promise.resolve({ error: { code: '42P01', message: 'does not exist' } }) }) };
  failing.currentUser = { id: 'u1' };
  failing._repoNotesUnavailable = false;
  assert.strictEqual(await failing.saveRepoNote('r1', FULL), false, 'missing table: reports honestly');
  assert.strictEqual(failing._repoNotesUnavailable, true, 'and remembers so the UI can say device-only');
});
