// The candidate fills in what they actually did in a repo; that must reach the
// 60-second pitch, the model answer, and the talking points, and it must stay
// out of the way when it is empty.
const test = require('node:test');
const assert = require('node:assert');
const { bootApp, makeStorage } = require('./helpers/app-sandbox');
const gh = require('../js/githubMatch.js');

const REPO = {
  name: 'checkout-redesign',
  description: 'React + TypeScript checkout rebuild, CWV 2.8s to 1.6s',
  language: 'TypeScript', topics: ['react', 'performance'], stargazers_count: 34,
  fork: false, archived: false, size: 5200, pushed_at: '2026-08-20T00:00:00Z', html_url: 'https://github.com/me/checkout-redesign'
};
const JOB = { id: 'j1', title: 'Senior Frontend Engineer', company: 'Flipkart', skills: ['React', 'TypeScript'], description: '- 4+ years building production React apps\n- Strong TypeScript experience' };

const FULL = {
  problem: 'checkout drop-off was costing us sales',
  role: 'I owned the front end end to end',
  stack: 'React with TypeScript, because the cart state had bugs that types caught',
  hard: 'keeping cart state consistent across tabs',
  result: 'cut checkout time from 2.8s to 1.6s and recovered 4% of revenue'
};

test('a complete set of notes produces a written pitch with no brackets left', () => {
  const pitch = gh.buildRepoPitch({ repo: REPO, matchedSkills: ['react', 'typescript'] }, { title: 'Senior Frontend Engineer' }, FULL);
  assert.strictEqual(pitch.indexOf('['), -1, 'no blanks remain: ' + pitch);
  assert.ok(pitch.indexOf('checkout drop-off was costing us sales') !== -1);
  assert.ok(pitch.indexOf('I owned the front end end to end') !== -1);
  assert.ok(pitch.indexOf('2.8s to 1.6s') !== -1, 'the real number is used');
  assert.ok(pitch.indexOf('WHY IT EXISTS') === -1, 'skeleton header is gone');
  assert.ok(pitch.indexOf('YOUR 60-SECOND ANSWER') !== -1, 'reads as a finished answer');
});

test('an empty set of notes keeps the skeleton and names what is missing', () => {
  const pitch = gh.buildRepoPitch({ repo: REPO, matchedSkills: ['react'] }, { title: 'Senior Frontend Engineer' }, {});
  assert.ok(pitch.indexOf('[') !== -1, 'blanks are still shown');
  assert.ok(pitch.indexOf('STILL TO FILL IN') !== -1);
  ['The problem it solved', 'What you personally owned', 'The measurable result'].forEach(label => {
    assert.ok(pitch.indexOf('- ' + label) !== -1, 'lists "' + label + '" as still needed');
  });
});

test('partial notes fill in only what was given', () => {
  const pitch = gh.buildRepoPitch({ repo: REPO, matchedSkills: [] }, { title: 'Dev' }, { result: 'shipped to 12k users' });
  assert.ok(pitch.indexOf('shipped to 12k users') !== -1, 'the filled field is used');
  assert.ok(pitch.indexOf('[the problem you wanted to solve') !== -1, 'unfilled fields stay blank');
  assert.ok(pitch.indexOf('STILL TO FILL IN') !== -1);
});

test('blankFields reports exactly what is still missing', () => {
  assert.strictEqual(gh.blankFields({}).length, 5);
  assert.strictEqual(gh.blankFields(FULL).length, 0);
  const partial = gh.blankFields({ problem: 'x', role: 'y' }).map(f => f.key);
  assert.deepStrictEqual(partial, ['stack', 'hard', 'result']);
});

test('notes are stored per repo and never mix between repos', () => {
  const { app, storage } = bootApp(makeStorage());
  app._interviewJob = JOB; app._interviewJobId = 'j1';
  app._ghSave({ username: 'me', repos: [REPO, { name: 'other', description: 'go api', language: 'Go', topics: [], stargazers_count: 0, fork: false, archived: false, size: 100, pushed_at: '2026-07-01T00:00:00Z' }], fetchedAt: Date.now() });

  storage.setItem(app._ghNotesKey('checkout-redesign'), JSON.stringify({ problem: 'the real problem' }));
  storage.setItem(app._ghNotesKey('other'), JSON.stringify({ problem: 'a different problem' }));

  assert.notStrictEqual(app._ghNotes('checkout-redesign').problem, 'a different problem');
  assert.strictEqual(app._ghNotes('checkout-redesign').problem, 'the real problem');
  assert.strictEqual(app._ghNotes('other').problem, 'a different problem');
  assert.notStrictEqual(app._ghNotesKey('checkout-redesign'), app._ghNotesKey('other'));
});

test('saved notes reach the model answer and remove its placeholders', () => {
  const { app, storage } = bootApp(makeStorage());
  app._interviewJob = JOB; app._interviewJobId = 'j1';
  app._ghSave({ username: 'me', repos: [REPO], fetchedAt: Date.now() });
  storage.setItem('swapiki_repo_notes_checkout-redesign', JSON.stringify(FULL));

  const model = app._modelAnswer('Walk me through a React project you owned.');
  assert.ok(model.indexOf('checkout drop-off was costing us sales') !== -1, 'problem used');
  assert.ok(model.indexOf('I owned the front end end to end') !== -1, 'role used');
  assert.ok(model.indexOf('2.8s to 1.6s') !== -1, 'result used');
  assert.strictEqual(model.indexOf('The outcome was [the number'), -1, 'result placeholder gone');
  assert.strictEqual(model.indexOf('The problem it solved was [the one-line problem'), -1, 'problem placeholder gone');
});

test('the notes form only appears for the repo that is leading the answers', () => {
  const { app, els } = bootApp(makeStorage());
  app._interviewJob = JOB; app._interviewJobId = 'j1';
  app._ghSave({ username: 'me', repos: [REPO], fetchedAt: Date.now() });
  app.renderGitHubPicker();
  assert.strictEqual(els['gh-picker'].innerHTML.indexOf('What did you actually do'), -1, 'hidden until asked for');

  app.useRepoStory('checkout-redesign');
  assert.ok(els['gh-picker'].innerHTML.indexOf('Leading my answers') !== -1, 'the repo is now the story');
  assert.ok(els['gh-picker'].innerHTML.indexOf('Add what you did') !== -1, 'the form can be opened for it');
  assert.strictEqual(els['gh-picker'].innerHTML.indexOf('gh-note-problem'), -1, 'form stays collapsed by default');

  app.toggleRepoNotes('checkout-redesign');
  let html = els['gh-picker'].innerHTML;
  assert.ok(html.indexOf('What did you actually do in checkout-redesign') !== -1, 'heading names the repo');
  assert.ok(html.indexOf('gh-note-problem') !== -1, 'problem field rendered');
  assert.ok(html.indexOf('gh-note-result') !== -1, 'result field rendered');
  assert.ok(html.indexOf('Hide my details') !== -1, 'the toggle now offers to hide it');

  // Save must not make the form disappear.
  els['gh-note-problem'] = { value: 'checkout drop-off was costing us sales' };
  els['gh-note-role'] = { value: 'I owned the front end' };
  app._ghSaveNotes('checkout-redesign');
  html = els['gh-picker'].innerHTML;
  assert.ok(html.indexOf('gh-note-problem') !== -1, 'form stays open after saving');
  assert.ok(html.indexOf('2 of 5 filled in') !== -1, 'counter reflects what was typed');
  assert.ok(html.indexOf('2/5 details added') !== -1, 'row badge reflects it too');

  app.toggleRepoNotes('checkout-redesign');
  assert.strictEqual(els['gh-picker'].innerHTML.indexOf('gh-note-problem'), -1, 'hides again');
  assert.ok(els['gh-picker'].innerHTML.indexOf('2/5 details added') !== -1, 'badge survives closing');
});

test('every row explains why it ranks where it does', () => {
  const { app, els } = bootApp(makeStorage());
  app._interviewJob = JOB; app._interviewJobId = 'j1';
  app._ghSave({ username: 'me', repos: [REPO, { name: 'unrelated', description: 'a dotfiles list', language: 'Shell', topics: [], stargazers_count: 0, fork: false, archived: false, size: 5, pushed_at: '2020-01-01T00:00:00Z' }], fetchedAt: Date.now() });
  app.renderGitHubPicker();
  const html = els['gh-picker'].innerHTML;
  assert.ok(html.indexOf('which this listing asks for') !== -1, 'matched repo explains itself');
  assert.ok(html.indexOf('Nothing in the listing matches this one') !== -1, 'unmatched repo says so plainly');
});

test('sorting changes the order without breaking the buttons', () => {
  const { app, els } = bootApp(makeStorage());
  app._interviewJob = JOB; app._interviewJobId = 'j1';
  app._ghSave({
    username: 'me', fetchedAt: Date.now(),
    repos: [
      { name: 'stale-but-perfect', description: 'React TypeScript production app', language: 'TypeScript', topics: ['react'], stargazers_count: 900, fork: false, archived: false, size: 900, pushed_at: '2019-01-01T00:00:00Z' },
      REPO
    ]
  });

  app._ghSort = 'match';
  app.renderGitHubPicker();
  assert.ok(els['gh-picker'].innerHTML.indexOf('>1</span>') !== -1, 'rank 1 exists');

  app._ghSort = 'recent';
  app.renderGitHubPicker();
  const recentFirst = app._ghOrdered().ordered[0].name;
  assert.strictEqual(recentFirst, 'checkout-redesign', 'newer repo first when sorting by recent');

  app._ghSort = 'stars';
  app.renderGitHubPicker();
  assert.strictEqual(app._ghOrdered().ordered[0].name, 'stale-but-perfect', 'most starred first when sorting by stars');

  // The buttons act on a repo by name, so they can never hit a different row
  // than the one clicked, whatever the order is.
  app.useRepoStory('stale-but-perfect');
  assert.strictEqual(app._interviewStory, 'stale-but-perfect', 'the named repo is chosen');
  assert.strictEqual(app._ghHydrateStory(), 'stale-but-perfect', 'and it is the story after re-render');
});

test('the open form stays on its own repo when the order changes', () => {
  const { app, els } = bootApp(makeStorage());
  app._interviewJob = JOB; app._interviewJobId = 'j1';
  app._ghSave({
    username: 'me', fetchedAt: Date.now(),
    repos: [
      { name: 'older', description: 'React TypeScript app', language: 'TypeScript', topics: ['react'], stargazers_count: 5, fork: false, archived: false, size: 400, pushed_at: '2020-01-01T00:00:00Z' },
      REPO
    ]
  });

  app.toggleRepoNotes('older');
  assert.ok(els['gh-picker'].innerHTML.indexOf('What did you actually do in older') !== -1, 'opened for the older repo');

  app._ghSort = 'recent';
  app.renderGitHubPicker();
  const html = els['gh-picker'].innerHTML;
  assert.ok(html.indexOf('What did you actually do in older') !== -1, 'still on the same repo after re-sorting');
  assert.strictEqual(html.indexOf('What did you actually do in checkout-redesign'), -1, 'not moved onto another project');
});

test('opening the form for a non-leading repo makes it the story', () => {
  const { app, els } = bootApp(makeStorage());
  app._interviewJob = JOB; app._interviewJobId = 'j1';
  app._ghSave({ username: 'me', repos: [REPO, { name: 'other', description: 'a React admin dashboard in TypeScript', language: 'TypeScript', topics: ['react'], stargazers_count: 2, fork: false, archived: false, size: 200, pushed_at: '2026-05-01T00:00:00Z' }], fetchedAt: Date.now() });
  app.useRepoStory('checkout-redesign');
  assert.strictEqual(app._ghHydrateStory(), 'checkout-redesign');

  app.toggleRepoNotes('other');
  assert.strictEqual(app._ghHydrateStory(), 'other', 'the story follows the form');
  assert.ok(els['gh-picker'].innerHTML.indexOf('What did you actually do in other') !== -1);
});
