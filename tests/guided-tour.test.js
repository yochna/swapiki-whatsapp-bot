// The dashboard tour used to start only when the page loaded, so a new
// candidate who signed up (or logged in) in the same page never saw it - it
// turned up on a later reload (a tester saw it on their 4th visit). It now
// starts right after every sign-in path, once, and is six steps long.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bootApp, makeStorage, fakeEl } = require('./helpers/app-sandbox');

const NEW_USER = {
  id: 'u-new', email: 'new@example.com',
  created_at: '2026-10-27T10:00:00Z', last_sign_in_at: '2026-10-27T10:00:05Z'
};

// In the real page both the tour overlay and the reminder modal start with the
// `hidden` class; the sandbox's blank elements do not, so mirror the page here.
function appWithUser(user, storage) {
  const booted = bootApp(storage || makeStorage());
  booted.sandbox.swapikiStore.currentUser = user;
  ['tour-root', 'modal-profile-reminder'].forEach(id => {
    booted.els[id] = fakeEl();
    booted.els[id].classList.add('hidden');
  });
  return booted;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

test('the tour is six steps and every step has something to point at', () => {
  const { app } = bootApp(makeStorage());
  const keys = app._guidedTourSteps().map(s => s.key);
  assert.deepStrictEqual(Array.from(keys),
    ['welcome', 'nav-edit-profile', 'add-project', 'dash-checklist', 'dash-voice', 'dash-share']);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  keys.filter(k => k !== 'welcome').forEach(k => {
    assert.ok(html.includes(`data-tour="${k}"`), `index.html has no data-tour="${k}" for that step`);
  });
});

test('a brand-new account gets the tour straight after sign-in, without a reload', async () => {
  const { app, els } = appWithUser(NEW_USER);
  app.maybeStartGuidedTour();
  await wait(700);
  assert.strictEqual(els['tour-root'].classList.contains('hidden'), false, 'tour overlay should be visible');
});

test('asking twice in a row starts the tour only once', async () => {
  const { app, els } = appWithUser(NEW_USER);
  let starts = 0;
  const real = app.startGuidedTour.bind(app);
  app.startGuidedTour = () => { starts++; return real(); };
  app.maybeStartGuidedTour();
  app.maybeStartGuidedTour();
  await wait(700);
  assert.strictEqual(starts, 1);
});

test('once the tour was seen on this device it does not come back', async () => {
  const storage = makeStorage({ 'swapiki:guided-tour:v1:u-new': 'done' });
  const { app } = appWithUser(NEW_USER, storage);
  let starts = 0;
  app.startGuidedTour = () => { starts++; };
  app.maybeStartGuidedTour();
  await wait(700);
  assert.strictEqual(starts, 0);
});

test('the tour waits while the "complete your profile" reminder is open', async () => {
  const { app, els } = appWithUser(NEW_USER);
  els['modal-profile-reminder'].classList.remove('hidden'); // open
  let starts = 0;
  app.startGuidedTour = () => { starts++; };
  app.maybeStartGuidedTour();
  await wait(700);
  assert.strictEqual(starts, 0, 'must not stack on top of the reminder');
  els['modal-profile-reminder'].classList.add('hidden');
  await wait(1400);
  assert.strictEqual(starts, 1, 'starts once the reminder is closed');
});

test('all four sign-in paths hand over to the tour', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const calls = (src.match(/this\.maybeStartGuidedTour\(\);/g) || []).length;
  // init() + login + Google + signup + email-code verification
  assert.ok(calls >= 5, `expected the tour to be requested from 5 places, found ${calls}`);
});
