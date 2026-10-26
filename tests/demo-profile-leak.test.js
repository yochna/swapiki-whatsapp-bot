// The shared demo profile ("Ananya Sharma") is what a fresh browser holds in
// memory. It must never end up in a real candidate's account: before this
// guard, a cloud row with blank fields had them "rescued" from that demo copy,
// so new sign-ups opened Edit Profile to a stranger's headline, skills,
// location, bio and LinkedIn instead of empty fields with placeholders.
const test = require('node:test');
const assert = require('node:assert');
const { bootStore, makeStorage } = require('./helpers/store-sandbox');

const USER = { id: 'u1', email: 'suyash@example.com', user_metadata: { full_name: 'Suyash Pandey' } };

function cloudReturning(row) {
  const builder = {
    select() { return builder; }, order() { return builder; }, eq() { return builder; },
    limit() { return builder; }, maybeSingle() { return builder; },
    upsert() { return builder; }, update() { return builder; },
    then(resolve) { return Promise.resolve({ data: row, error: null }).then(resolve); },
    catch(reject) { return Promise.resolve({ data: row, error: null }).catch(reject); }
  };
  return { from() { return builder; } };
}

const BLANK_ROW = {
  id: 'c1', user_id: 'u1', name: 'Suyash Pandey', updated_at: null,
  title: null, location: null, status: null, bio: null, linkedin: null,
  profile_status: 'draft', projects: []
};

test('a fresh browser\'s demo profile is not rescued into a real account', async () => {
  // Nothing in localStorage: the store boots with the demo profile in memory.
  const { store } = bootStore({ storage: makeStorage(), supabase: cloudReturning([BLANK_ROW]), user: USER });
  await store.loadProfileForUser(USER);
  assert.strictEqual(store.data.name, 'Suyash Pandey');
  assert.strictEqual(store.data.title, '');
  assert.strictEqual(store.data.location, '');
  assert.strictEqual(store.data.status, '');
  assert.strictEqual(store.data.bio, '');
  assert.strictEqual(store.data.linkedin, '');
  assert.strictEqual(store.data.expertise.length, 0);
  assert.strictEqual(store.data.projects.length, 0);
});

test('an account that already holds the demo values is cleaned on load', async () => {
  const row = {
    ...BLANK_ROW,
    title: 'Lead Product Designer & UI Architect',
    location: 'Bengaluru, Karnataka (Remote Ready)',
    status: 'Immediate / 15 Days Notice',
    bio: 'Passionate about building scalable fintech design systems and high-converting Indian checkout experiences. Proven track record scaling digital platforms at Swiggy and Razorpay.',
    linkedin: 'https://linkedin.com/in/ananya-sharma-ux'
  };
  const { store } = bootStore({ storage: makeStorage(), supabase: cloudReturning([row]), user: USER });
  await store.loadProfileForUser(USER);
  assert.strictEqual(store.data.title, '');
  assert.strictEqual(store.data.location, '');
  assert.strictEqual(store.data.status, '');
  assert.strictEqual(store.data.bio, '');
  assert.strictEqual(store.data.linkedin, '');
  assert.strictEqual(store.data.name, 'Suyash Pandey', 'the real name is kept');
});

test('a real candidate who shares the demo\'s city or notice period keeps it', async () => {
  const row = {
    ...BLANK_ROW,
    title: 'Backend Engineer',
    location: 'Bengaluru, Karnataka (Remote Ready)',
    status: 'Immediate / 15 Days Notice',
    bio: 'I build payment backends.',
    linkedin: 'https://linkedin.com/in/suyash-pandey'
  };
  const { store } = bootStore({ storage: makeStorage(), supabase: cloudReturning([row]), user: USER });
  await store.loadProfileForUser(USER);
  assert.strictEqual(store.data.location, 'Bengaluru, Karnataka (Remote Ready)');
  assert.strictEqual(store.data.status, 'Immediate / 15 Days Notice');
  assert.strictEqual(store.data.title, 'Backend Engineer');
});