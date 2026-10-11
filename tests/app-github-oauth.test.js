// One-click GitHub sign-in (Device Flow) is only offered when a Client ID is
// configured, and the pasted-link path must keep working alongside it.
const test = require('node:test');
const assert = require('node:assert');
const { bootApp, makeStorage } = require('./helpers/app-sandbox');

const WITH_ID = { GITHUB_CLIENT_ID: 'Iv1.testclientid' };

test('no Connect button without a client id, and the link field is still offered', () => {
  const { app, els } = bootApp(makeStorage());
  app.renderGitHubPicker();
  const html = els['gh-picker'].innerHTML;
  assert.strictEqual(html.indexOf('Connect GitHub'), -1, 'sign-in button is hidden');
  assert.ok(html.indexOf('id="gh-link"') !== -1, 'link field is still there');
  assert.ok(html.indexOf('Rank my projects') !== -1, 'link path is still usable');
});

test('a configured client id turns the sign-in button on', () => {
  const { app, els } = bootApp(makeStorage(), WITH_ID);
  app.renderGitHubPicker();
  const html = els['gh-picker'].innerHTML;
  assert.ok(html.indexOf('Connect GitHub') !== -1, 'sign-in button appears');
  assert.ok(html.indexOf('app.ghConnect()') !== -1, 'it starts the device flow');
  assert.ok(html.indexOf('id="gh-link"') !== -1, 'the link field is not displaced');
});

test('the device code screen replaces the form and can be cancelled', () => {
  const { app, els } = bootApp(makeStorage(), WITH_ID);
  app._ghDevice = { device_code: 'dc', user_code: 'WXYZ-1234', verification_uri: 'https://github.com/login/device', interval: 5 };
  app.renderGitHubPicker();
  const html = els['gh-picker'].innerHTML;
  assert.ok(html.indexOf('WXYZ-1234') !== -1, 'shows the code the candidate must type');
  assert.ok(html.indexOf('github.com/login/device') !== -1, 'links to the verification page');
  assert.strictEqual(html.indexOf('id="gh-link"'), -1, 'form is hidden while entering the code');

  app._ghCancelDevice();
  assert.strictEqual(app._ghDevice, null);
  assert.ok(els['gh-picker'].innerHTML.indexOf('id="gh-link"') !== -1, 'form comes back on cancel');
});

test('sign-in is refused when no client id is configured', () => {
  const { app } = bootApp(makeStorage());
  let focused = false;
  app.ghFocusLink = () => { focused = true; };
  app.ghConnect();
  assert.strictEqual(focused, true, 'falls back to the link field instead of failing');
});
