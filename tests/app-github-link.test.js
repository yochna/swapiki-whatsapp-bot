// The candidate pastes their GitHub profile link; we must pull a username out of
// whatever they actually paste, and never treat junk as a username.
const test = require('node:test');
const assert = require('node:assert');
const { bootApp, makeStorage } = require('./helpers/app-sandbox');

const parse = input => bootApp(makeStorage()).app._ghParseUsername(input);

test('accepts a GitHub profile link in the shapes people actually paste', () => {
  assert.strictEqual(parse('https://github.com/rahulbuilds'), 'rahulbuilds');
  assert.strictEqual(parse('http://github.com/rahulbuilds'), 'rahulbuilds');
  assert.strictEqual(parse('https://www.github.com/rahulbuilds'), 'rahulbuilds');
  assert.strictEqual(parse('  https://github.com/rahulbuilds/  '), 'rahulbuilds');
  assert.strictEqual(parse('github.com/rahulbuilds'), 'rahulbuilds');
  assert.strictEqual(parse('github.com/rahulbuilds/'), 'rahulbuilds');
  assert.strictEqual(parse('https://github.com/rahulbuilds?tab=repositories'), 'rahulbuilds');
  assert.strictEqual(parse('https://github.com/rahulbuilds#readme'), 'rahulbuilds');
  assert.strictEqual(parse('HTTPS://GITHUB.COM/RahulBuilds'), 'RahulBuilds');
});

test('accepts a repo link and falls back to the account that owns it', () => {
  assert.strictEqual(parse('https://github.com/rahulbuilds/checkout-redesign'), 'rahulbuilds');
});

test('still tolerates a handle or a bare username', () => {
  assert.strictEqual(parse('@rahulbuilds'), 'rahulbuilds');
  assert.strictEqual(parse('rahulbuilds'), 'rahulbuilds');
  assert.strictEqual(parse('rahul-builds'), 'rahul-builds');
});

test('rejects empty, host-only and unusable input', () => {
  ['', '   ', null, undefined,
    'https://github.com/',
    'github.com',
    'https://gitlab.com/rahul',
    'not a username!',
    'x'.repeat(40)].forEach(v => {
      assert.strictEqual(parse(v), '', 'should reject: ' + JSON.stringify(v));
    });
});

test('a bad link shows a helpful error and asks for no sign-in', async () => {
  const { app, els } = bootApp(makeStorage());
  els['gh-link'] = { value: 'https://github.com/', focus() {} };
  await app.ghConnectFromLink();
  const state = app._ghLoad();
  assert.ok(/GitHub link/i.test(state.error), 'error explains what a link looks like: ' + state.error);
  assert.strictEqual(app._ghLoad().repos, undefined, 'nothing was fetched');
});

test('a pasted link is remembered, and the field is prefilled as a link next time', async () => {
  const storage = makeStorage();
  const { app, els } = bootApp(storage);
  app.ghFetchRepos = async () => { /* no repos: stays on the connect form */ };
  els['gh-link'] = { value: 'https://github.com/rahulbuilds', focus() {} };
  await app.ghConnectFromLink();

  assert.strictEqual(app._ghLoad().username, 'rahulbuilds');
  assert.strictEqual(JSON.parse(storage.getItem('swapiki_github_state')).username, 'rahulbuilds');

  app.renderGitHubPicker();
  const html = els['gh-picker'].innerHTML;
  assert.ok(html.indexOf('https://github.com/rahulbuilds') !== -1, 'field is prefilled with the full link');
  assert.ok(html.indexOf('Paste your GitHub link') !== -1, 'card asks for a link, not a username');
  assert.strictEqual(html.indexOf('your GitHub username'), -1, 'no username prompt anywhere');
});
