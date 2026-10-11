const test = require('node:test');
const assert = require('node:assert/strict');

const { isDemoGoogleClientId, getConfiguredGoogleClientId, parseGoogleJwtPayload, initGoogleSignIn } = require('../js/googleAuth.js');

test('rejects placeholder Google client IDs', () => {
  assert.equal(isDemoGoogleClientId('1089204820192-demo.apps.googleusercontent.com'), true);
  assert.equal(isDemoGoogleClientId('YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'), true);
  assert.equal(isDemoGoogleClientId('real-client-id.apps.googleusercontent.com'), false);
});

test('reads a configured Google client ID from the window config', () => {
  const original = global.window;
  global.window = { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' };

  try {
    assert.equal(getConfiguredGoogleClientId(), 'test-client.apps.googleusercontent.com');
  } finally {
    global.window = original;
  }
});

test('parses a Google JWT payload without external libraries', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: '123', email: 'user@example.com', name: 'Google User' })).toString('base64url');
  const jwt = `${header}.${payload}.signature`;

  assert.deepEqual(parseGoogleJwtPayload(jwt), {
    sub: '123',
    email: 'user@example.com',
    name: 'Google User'
  });
});

test('initGoogleSignIn declines to render when no real Client ID is configured', () => {
  const original = global.window;
  global.window = {
    GOOGLE_CLIENT_ID: '',
    document: { getElementById: () => ({ innerHTML: '' }) }
  };
  global.document = global.window.document;

  try {
    assert.equal(initGoogleSignIn('google-signin-button-signup', () => {}), false);
  } finally {
    global.window = original;
    delete global.document;
  }
});

test('initGoogleSignIn waits for the Google Identity Services script to load', () => {
  const original = global.window;
  global.window = {
    GOOGLE_CLIENT_ID: 'real-client-id.apps.googleusercontent.com',
    document: { getElementById: () => ({ innerHTML: '' }) }
    // window.google is intentionally absent, simulating gsi/client.js not loaded yet
  };
  global.document = global.window.document;

  try {
    assert.equal(initGoogleSignIn('google-signin-button-signup', () => {}), false);
  } finally {
    global.window = original;
    delete global.document;
  }
});
