/**
 * Search-term logging must record the term someone SETTLED on, not the first
 * couple of characters they happened to type.
 *
 * Regression guard: logging ran on every keystroke behind a 15s throttle, so a
 * visitor typing "software engineer" recorded "sw" and then had the rest of the
 * burst suppressed. "sw" became the #1 term on the admin Top Searches panel and
 * in the digest emails, purely because it was typed first.
 */
const test = require('node:test');
const assert = require('node:assert');
const { bootApp } = require('./helpers/app-sandbox');

/** Boots the app with a recorder that captures what the store was asked to log. */
function bootWithSearchLog() {
  const booted = bootApp();
  const logged = [];
  booted.sandbox.swapikiStore.recordSearchEvent = q => logged.push(q);
  return { app: booted.app, logged };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

test('typing does not log a term until the visitor pauses', async () => {
  const { app, logged } = bootWithSearchLog();

  app.setJobsQuery('software');
  app.setJobsQuery('software engineer');

  // Still mid-thought: nothing may be recorded yet. This is the assertion the
  // old throttle could not make - it logged "so" on the second keystroke.
  assert.deepStrictEqual(logged, [], 'logged a term while the visitor was still typing');

  await wait(1300);
  assert.deepStrictEqual(logged, ['software engineer']);
});

test('a burst of keystrokes yields one row for the final term, not one per prefix', async () => {
  const { app, logged } = bootWithSearchLog();

  // What a real "software engineer" looks like through oninput.
  for (const prefix of ['s', 'so', 'sof', 'softw', 'software', 'software e', 'software engineer']) {
    app.setJobsQuery(prefix);
  }

  await wait(1300);
  assert.deepStrictEqual(logged, ['software engineer']);
});

test('Enter commits the term immediately instead of waiting out the debounce', () => {
  const { app, logged } = bootWithSearchLog();

  app.setJobsQuery('react native');
  assert.deepStrictEqual(logged, [], 'logged before Enter');

  app.commitJobsQueryNow();
  assert.deepStrictEqual(logged, ['react native']);
});

test('a term retyped in the same session is recorded once', () => {
  const { app, logged } = bootWithSearchLog();

  app.setJobsQuery('react');
  app.commitJobsQueryNow();
  app.setJobsQuery('react');
  app.commitJobsQueryNow();

  assert.deepStrictEqual(logged, ['react'], 'one sitting is one signal, not five');
});

test('a later different term is still recorded after an earlier one', () => {
  const { app, logged } = bootWithSearchLog();

  app.setJobsQuery('react');
  app.commitJobsQueryNow();
  app.setJobsQuery('python');
  app.commitJobsQueryNow();

  assert.deepStrictEqual(logged, ['react', 'python']);
});

test('one-character and cleared queries are not logged', () => {
  const { app, logged } = bootWithSearchLog();

  app.setJobsQuery('a');
  app.commitJobsQueryNow();
  app.setJobsQuery('react');
  app.commitJobsQueryNow();
  app.setJobsQuery('');
  app.commitJobsQueryNow();

  assert.deepStrictEqual(logged, ['react']);
});

test('the search box commits on Enter from the keyboard', () => {
  // renderJobsView needs store data the sandbox stub doesn't provide, so it
  // never paints the real search box here. Assert the wiring at its source
  // instead - the handler contract itself is covered behaviourally above.
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'js', 'app.js'), 'utf8');

  assert.match(src, /id="job-search"/);
  assert.match(src, /oninput="app\.setJobsQuery\(this\.value\)"/);
  assert.match(
    src,
    /id="job-search"[\s\S]{0,400}onkeydown="if\(event\.key==='Enter'\)app\.commitJobsQueryNow\(\)"/,
    'the search box never commits on Enter, so a committed term would only be logged 1.2s late'
  );
});
