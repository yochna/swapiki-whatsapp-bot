// The referral loop: capture ?ref=, attribute it to the new account via the
// SECURITY DEFINER RPC, credit it when the invited profile publishes, and turn
// credited referrals into extra project slots. These tests cover the client
// half (js/store.js + js/app.js); the migration itself is checked for the pieces
// the client depends on existing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { bootStore, makeStorage } = require('./helpers/store-sandbox.js');
const { bootApp } = require('./helpers/app-sandbox.js');

const APP_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const STORE_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const MIGRATION = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'referrals_migration.sql'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/** A Supabase stand-in that answers rpc() from a handler and records calls. */
function makeRpcSupabase(handler) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      const res = handler ? handler(name, args) : { data: null, error: null };
      return Promise.resolve(res);
    },
    from() {
      const b = {};
      b.select = () => b; b.eq = () => b; b.order = () => b; b.limit = () => b;
      b.upsert = () => b; b.update = () => b; b.delete = () => b; b.insert = () => b;
      b.then = (r) => Promise.resolve({ data: null, error: null }).then(r);
      b.catch = (r) => Promise.resolve({ data: null, error: null }).catch(r);
      return b;
    }
  };
}

// ---------------------------------------------------------------------------
// Slot unlock math
// ---------------------------------------------------------------------------
test('base project cap is four with no referrals', () => {
  const { store } = bootStore();
  assert.equal(store.getReferralBonus(), 0);
  assert.equal(store.getMaxProjects(), 4);
});

test('each credited referral adds a slot, capped at +2', () => {
  const { store } = bootStore();
  store.referralStats = { total: 1, credited: 1 };
  assert.equal(store.getMaxProjects(), 5);
  store.referralStats = { total: 2, credited: 2 };
  assert.equal(store.getMaxProjects(), 6);
  store.referralStats = { total: 9, credited: 9 };
  assert.equal(store.getReferralBonus(), 2, 'bonus never exceeds the cap');
  assert.equal(store.getMaxProjects(), 6);
});

test('addProject respects the unlocked cap', () => {
  const { store } = bootStore();
  store.data.projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.throws(() => store.addProject({ title: 'fifth' }), /no more than 4/);

  store.referralStats = { total: 2, credited: 2 };
  const added = store.addProject({ title: 'fifth' });
  assert.ok(added && added.id, 'the fifth project fits once the cap is raised');
});

// ---------------------------------------------------------------------------
// Capture (?ref=)
// ---------------------------------------------------------------------------
test('captureReferralFromUrl stores a sanitized handle', () => {
  const { store, sandbox, storage } = bootStore();
  sandbox.location.href = 'https://swapiki.com/?ref=Friend-User';
  assert.equal(store.captureReferralFromUrl(), 'friend-user');
  assert.equal(storage.getItem('swapiki_ref'), 'friend-user');
});

test('capture is first-touch: an existing attribution is never overwritten', () => {
  const { store, sandbox, storage } = bootStore({ storage: makeStorage({ swapiki_ref: 'first-ref' }) });
  sandbox.location.href = 'https://swapiki.com/?ref=second-ref';
  store.captureReferralFromUrl();
  assert.equal(storage.getItem('swapiki_ref'), 'first-ref');
});

test('capture reads a ref out of the hash fragment too', () => {
  const { store, sandbox, storage } = bootStore();
  sandbox.location.href = 'https://swapiki.com/#profile/someone?ref=Hashed-Ref';
  store.captureReferralFromUrl();
  assert.equal(storage.getItem('swapiki_ref'), 'hashed-ref');
});

test('capture ignores an absent or malformed ref', () => {
  const { store, sandbox, storage } = bootStore();
  sandbox.location.href = 'https://swapiki.com/';
  assert.equal(store.captureReferralFromUrl(), null);

  sandbox.location.href = 'https://swapiki.com/?ref=@@bad@@';
  assert.equal(store.captureReferralFromUrl(), null);
  assert.equal(storage.getItem('swapiki_ref'), null);
});

// ---------------------------------------------------------------------------
// Attribution (recordReferralIfPending)
// ---------------------------------------------------------------------------
const USER = { id: '11111111-1111-1111-1111-111111111111' };

test('no stored ref means nothing to record', async () => {
  const supabase = makeRpcSupabase(() => ({ data: { recorded: true }, error: null }));
  const { store } = bootStore({ supabase, user: USER });
  const res = await store.recordReferralIfPending(USER);
  assert.equal(res.recorded, false);
  assert.equal(res.reason, 'no-ref');
  assert.equal(supabase.calls.length, 0, 'must not call the RPC without a ref');
});

test('a self-referral is dropped, never sent', async () => {
  // DEFAULT_PROFILE's username is ananya-sharma; a ?ref= pointing at yourself
  // must not be recorded.
  const supabase = makeRpcSupabase(() => ({ data: { recorded: true }, error: null }));
  const { store, storage } = bootStore({ storage: makeStorage({ swapiki_ref: 'ananya-sharma' }), supabase, user: USER });
  const res = await store.recordReferralIfPending(USER);
  assert.equal(res.recorded, false);
  assert.equal(res.reason, 'self');
  assert.equal(supabase.calls.length, 0);
  assert.equal(storage.getItem('swapiki_ref'), null, 'the self-ref is cleared');
});

test('a valid ref is relayed to record_referral and then cleared', async () => {
  const supabase = makeRpcSupabase(() => ({ data: { recorded: true, credited: false }, error: null }));
  const { store, storage } = bootStore({ storage: makeStorage({ swapiki_ref: 'friend-user' }), supabase, user: USER });
  const res = await store.recordReferralIfPending(USER);
  assert.equal(res.recorded, true);
  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].name, 'record_referral');
  assert.equal(supabase.calls[0].args.p_referrer_username, 'friend-user');
  assert.equal(storage.getItem('swapiki_ref'), null, 'the ref is consumed');
  assert.equal(storage.getItem('swapiki_ref_recorded:' + USER.id), '1');
});

test('an already-recorded account does not call the RPC again', async () => {
  const supabase = makeRpcSupabase(() => ({ data: { recorded: true }, error: null }));
  const { store } = bootStore({
    storage: makeStorage({ swapiki_ref: 'friend-user', ['swapiki_ref_recorded:' + USER.id]: '1' }),
    supabase, user: USER
  });
  const res = await store.recordReferralIfPending(USER);
  assert.equal(res.reason, 'already-recorded');
  assert.equal(supabase.calls.length, 0);
});

test('a missing migration is reported but the ref is kept for later', async () => {
  const supabase = makeRpcSupabase(() => ({
    data: null,
    error: { code: 'PGRST202', message: 'Could not find the function public.record_referral' }
  }));
  const { store, storage } = bootStore({ storage: makeStorage({ swapiki_ref: 'friend-user' }), supabase, user: USER });
  const res = await store.recordReferralIfPending(USER);
  assert.equal(res.recorded, false);
  assert.ok(res.error);
  // Nothing definitive happened, so we retry on a later boot instead of
  // silently burning the attribution.
  assert.equal(storage.getItem('swapiki_ref'), 'friend-user');
  assert.equal(storage.getItem('swapiki_ref_recorded:' + USER.id), null);
});

// ---------------------------------------------------------------------------
// Stats (getReferralStats)
// ---------------------------------------------------------------------------
test('getReferralStats caches the RPC counts and feeds the cap', async () => {
  const supabase = makeRpcSupabase(() => ({ data: { total: 3, credited: 2 }, error: null }));
  const { store } = bootStore({ supabase, user: USER });
  const stats = await store.getReferralStats();
  // Compare fields, not the object: store methods run in a vm context, so the
  // returned object's prototype is a different realm's Object.
  assert.equal(stats.total, 3);
  assert.equal(stats.credited, 2);
  assert.equal(store.referralStats.total, 3);
  assert.equal(store.referralStats.credited, 2);
  assert.equal(store.getMaxProjects(), 6);
});

test('getReferralStats is zeros when signed out', async () => {
  const supabase = makeRpcSupabase(() => ({ data: { total: 3, credited: 2 }, error: null }));
  const { store } = bootStore({ supabase });
  const stats = await store.getReferralStats();
  assert.equal(stats.total, 0);
  assert.equal(stats.credited, 0);
  assert.equal(supabase.calls.length, 0);
});

test('getReferralStats is zeros (not a throw) when the migration is missing', async () => {
  const supabase = makeRpcSupabase(() => ({ data: null, error: { code: '42883', message: 'function does not exist' } }));
  const { store } = bootStore({ supabase, user: USER });
  const stats = await store.getReferralStats();
  assert.equal(stats.total, 0);
  assert.equal(stats.credited, 0);
});

// ---------------------------------------------------------------------------
// app.js wiring
// ---------------------------------------------------------------------------
test('copyReferralLink copies a ?ref=<username> link', () => {
  const { app, sandbox } = bootApp();
  sandbox.swapikiStore.getProfile = () => ({ username: 'ananya-sharma' });
  let copied = null;
  sandbox.navigator.clipboard.writeText = (t) => { copied = t; return Promise.resolve(); };

  app.copyReferralLink();
  assert.equal(copied, 'https://swapiki.com/?ref=ananya-sharma');
});

test('the checklist card carries a referral row wired to copyReferralLink', () => {
  assert.ok(APP_SRC.includes('data-referral="1"'), 'the referral row must be rendered');
  assert.ok(APP_SRC.includes("ev.target.closest('[data-referral]')"), 'the row must be wired to a click');
  assert.ok(APP_SRC.includes('copyReferralLink('), 'the copy handler must exist');
  assert.ok(APP_SRC.includes('captureReferralFromUrl'), 'referral capture must run at boot');
  assert.ok(STORE_SRC.includes('getMaxProjects()'), 'the slot cap must come from the referral-aware helper');
});

// ---------------------------------------------------------------------------
// The invited-visitor landing prompt
// ---------------------------------------------------------------------------
test('an invited visitor sees a personal banner naming the referrer', () => {
  const { app, els } = bootApp(makeStorage({ swapiki_ref: 'friend-user' }));
  const ref = app.maybeShowInviteBanner();
  assert.equal(ref, 'friend-user');
  const banner = els['invite-banner'];
  assert.ok(banner, 'the banner element is present');
  assert.match(banner.innerHTML, /@friend-user/, 'the inviter handle is shown');
  assert.match(banner.innerHTML, /openSignupModal/, 'the CTA opens signup');
  assert.ok(!banner.classList.contains('hidden'), 'the banner is visible');
});

test('no pending invite means no banner', () => {
  const { app, els } = bootApp();
  assert.equal(app.maybeShowInviteBanner(), null);
  assert.ok(els['invite-banner'].classList.contains('hidden'));
});

test('a signed-in visitor never sees the invite banner', () => {
  const { app, els, sandbox } = bootApp(makeStorage({ swapiki_ref: 'friend-user' }));
  sandbox.swapikiStore.currentUser = { id: 'u1' };
  assert.equal(app.maybeShowInviteBanner(), null);
  assert.ok(els['invite-banner'].classList.contains('hidden'));
});

test('signing in hides a banner that was showing', () => {
  const { app, els, sandbox } = bootApp(makeStorage({ swapiki_ref: 'friend-user' }));
  app.maybeShowInviteBanner();
  assert.ok(!els['invite-banner'].classList.contains('hidden'), 'shown while signed out');
  sandbox.swapikiStore.currentUser = { id: 'u1' };
  app.refreshAuthUI();
  assert.ok(els['invite-banner'].classList.contains('hidden'), 'hidden once signed in');
});

test('the landing markup carries the banner and the boot path wires it', () => {
  assert.match(INDEX_HTML, /id="invite-banner"/, 'the banner lives in the hero');
  assert.match(INDEX_HTML, /#view-landing \.lp-invite/, 'the banner has landing-scoped styles');
  assert.ok(APP_SRC.includes('maybeShowInviteBanner'), 'the app must render it');
});

// ---------------------------------------------------------------------------
// The migration the client depends on
// ---------------------------------------------------------------------------
test('referrals_migration.sql defines the table, RLS, RPCs and trigger', () => {
  assert.match(MIGRATION, /create table if not exists public\.referrals/i);
  assert.match(MIGRATION, /enable row level security/i);
  assert.match(MIGRATION, /constraint referrals_referred_unique unique \(referred_user_id\)/i);
  assert.match(MIGRATION, /create or replace function public\.record_referral/i);
  assert.match(MIGRATION, /create or replace function public\.my_referral_stats/i);
  assert.match(MIGRATION, /create or replace function public\.credit_referral_on_publish/i);
  assert.match(MIGRATION, /create trigger candidates_credit_referral/i);
  assert.match(MIGRATION, /after update of profile_status on public\.candidates/i);
});
