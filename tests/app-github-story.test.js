// Regression tests for the GitHub project picker's app-level wiring.
// These behaviours are invisible to the pure js/githubMatch.js tests: which
// project the model answer and talking points lead with.
const test = require('node:test');
const assert = require('node:assert');
const { bootApp, makeStorage } = require('./helpers/app-sandbox');

const REPOS = [
  { name: 'checkout-redesign', description: 'React + TypeScript checkout rebuild, CWV 2.8s to 1.6s', language: 'TypeScript', topics: ['react', 'performance'], stargazers_count: 34, fork: false, archived: false, size: 5200, pushed_at: '2026-08-20T00:00:00Z', html_url: 'u1' },
  { name: 'admin-panel', description: 'Internal admin dashboard in React with a typed data layer', language: 'TypeScript', topics: ['react'], stargazers_count: 4, fork: false, archived: false, size: 3000, pushed_at: '2026-06-01T00:00:00Z', html_url: 'u2' }
];
const JOB_A = { id: 'jA', title: 'Senior Frontend Engineer', company: 'Flipkart', skills: ['React', 'TypeScript'], description: '- 4+ years building production React apps\n- Strong TypeScript experience' };
const JOB_B = { id: 'jB', title: 'Backend Engineer', company: 'Zeta', skills: ['Go'], description: '- 5+ years with Go and Postgres' };

function connected(app) {
  app._ghSave({ username: 'rahulbuilds', repos: REPOS, fetchedAt: Date.now() });
  return app;
}

test('a chosen project is remembered and leads the model answer after a reload', () => {
  const storage = makeStorage();
  let { app } = bootApp(storage);
  app._interviewJob = JOB_A; app._interviewJobId = 'jA';
  connected(app);
  const top = app._ghRanked()[0].name;
  const second = app._ghRanked()[1].name;
  assert.notStrictEqual(second, top, 'fixture should have two distinct ranked repos');

  app.useRepoStory(app._ghRanked()[1].name);
  assert.strictEqual(app._interviewStory, second);

  ({ app } = bootApp(storage)); // reload: same storage, fresh app state
  app._interviewJob = JOB_A; app._interviewJobId = 'jA';
  connected(app);
  app.renderGitHubPicker();

  assert.strictEqual(app._interviewStory, second, 'pick is rehydrated from storage');
  const model = app._modelAnswer('Walk me through a React project you owned.');
  assert.ok(model.indexOf(second) !== -1, 'model answer leads with the chosen repo');
  assert.strictEqual(model.indexOf(top), -1, 'top-ranked repo is not used instead');
});

test('the pick is per job and does not leak into another job', () => {
  const { app } = bootApp(makeStorage());
  app._interviewJob = JOB_A; app._interviewJobId = 'jA';
  connected(app);
  app.useRepoStory(app._ghRanked()[1].name);

  app._interviewJob = JOB_B; app._interviewJobId = 'jB';
  app.renderGitHubPicker();
  assert.strictEqual(app._interviewStory, '', 'switching jobs clears the in-memory pick');

  app._interviewJob = JOB_A; app._interviewJobId = 'jA';
  app.renderGitHubPicker();
  assert.ok(app._interviewStory, 'returning to the first job restores its pick');
});

test('a repo that matches nothing in the listing is not used as the story', () => {
  const { app } = bootApp(makeStorage());
  app._interviewJob = JOB_B; app._interviewJobId = 'jB';
  connected(app);
  app.renderGitHubPicker();

  const model = app._modelAnswer('Tell me about a Go project you built.');
  assert.ok(model.indexOf('Legacy CRM') !== -1, 'falls back to the profile project');
  assert.strictEqual(model.indexOf('checkout-redesign'), -1, 'irrelevant React repo is not used');
});

test('a pick for a deleted or renamed repo is cleared', () => {
  const storage = makeStorage();
  storage.setItem('swapiki_interview_story_jA', 'deleted-repo');
  const { app } = bootApp(storage);
  app._interviewJob = JOB_A; app._interviewJobId = 'jA';
  connected(app);
  app.renderGitHubPicker();

  assert.strictEqual(app._interviewStory, '', 'stale pick is dropped');
  assert.strictEqual(storage.getItem('swapiki_interview_story_jA'), null, 'stale pick is removed from storage');
  assert.ok(app._modelAnswer('Walk me through a React project you owned.').indexOf('checkout-redesign') !== -1,
    'falls back to the top-ranked repo');
});
