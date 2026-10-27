// A candidate link (<handle>.swapiki.com) used to be able to sit on "loading"
// forever. These tests pin the ways that happened:
//
//   - the profile lookup had no timeout, and a failed lookup was reported as
//     "not found" (or not reported at all);
//   - one project row with a list column stored as text threw inside the async
//     render, which nobody awaited, so the page just stayed on the placeholder;
//   - app startup waited on session restore with no bound;
//   - the edge lookup in front of the HTML document had no bound either;
//   - the play button read the VISITOR's cached profile, so a stranger pressing
//     play heard the built-in demo narration instead of the candidate.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { bootApp, fakeEl } = require('./helpers/app-sandbox');
const { bootStore } = require('./helpers/store-sandbox');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------- store

/** A Supabase stand-in whose per-table terminal results are test-controlled. */
function fakeSupabase({ candidate, projects }) {
  const builder = (terminal) => {
    const b = {
      select: () => b, eq: () => b, order: () => b, limit: () => b,
      maybeSingle: () => terminal(),
      then: (resolve, reject) => terminal().then(resolve, reject)
    };
    return b;
  };
  return {
    from: (table) => builder(table === 'candidates' ? candidate : projects)
  };
}

// Values built inside the vm sandbox have a different Array prototype, which
// deepStrictEqual treats as a mismatch even when the contents are identical.
const plain = (v) => JSON.parse(JSON.stringify(v));

const ROW = { id: 'c1', username: 'priyanshu-007', name: 'Priyanshu', profile_status: 'draft' };
const never = () => new Promise(() => {});

test('a lookup that never answers is reported, not waited on forever', async () => {
  const { store } = bootStore({ supabase: fakeSupabase({ candidate: never, projects: never }) });
  await assert.rejects(
    store.getProfileByUsername('priyanshu-007', { includeUnpublished: true, strict: true, timeoutMs: 40 }),
    /timeout/
  );
});

test('strict mode tells a failed lookup apart from a missing profile', async () => {
  const failing = bootStore({
    supabase: fakeSupabase({ candidate: () => Promise.resolve({ data: null, error: { message: 'boom' } }), projects: never })
  }).store;
  await assert.rejects(failing.getProfileByUsername('x', { strict: true }), /profile_lookup_failed/);

  const missing = bootStore({
    supabase: fakeSupabase({ candidate: () => Promise.resolve({ data: null, error: null }), projects: never })
  }).store;
  assert.strictEqual(await missing.getProfileByUsername('x', { strict: true }), null,
    'a clean "no such row" is still a null, i.e. a real 404');
});

test('the default (non-strict) contract is unchanged: any failure is null', async () => {
  const { store } = bootStore({ supabase: fakeSupabase({ candidate: never, projects: never }) });
  assert.strictEqual(await store.getProfileByUsername('x', { timeoutMs: 30 }), null);
});

test('a stalled projects request does not hold the profile back', async () => {
  const { store } = bootStore({
    supabase: fakeSupabase({ candidate: () => Promise.resolve({ data: ROW, error: null }), projects: never })
  });
  const profile = await store.getProfileByUsername('priyanshu-007', { includeUnpublished: true, strict: true, timeoutMs: 40 });
  assert.ok(profile, 'the profile still comes back');
  assert.strictEqual(profile.name, 'Priyanshu');
  assert.deepStrictEqual(plain(profile.projects), [], 'and simply has no projects yet');
});

test('list columns stored as text become real arrays', () => {
  const { store } = bootStore();
  assert.deepStrictEqual(plain(store.toList(['a', '', null, 'b'])), ['a', 'b']);
  assert.deepStrictEqual(plain(store.toList('react, node ,  ')), ['react', 'node']);
  assert.deepStrictEqual(plain(store.toList('one\ntwo')), ['one', 'two']);
  assert.deepStrictEqual(plain(store.toList('["x","y"]')), ['x', 'y']);
  assert.deepStrictEqual(plain(store.toList(null)), []);
  assert.deepStrictEqual(plain(store.toList({ not: 'a list' })), []);
  const proj = store.fromSupabaseProjectRow({ id: 'p', tags: 'a, b', takeaways: 'one thing' });
  assert.ok(Array.isArray(proj.tags) && Array.isArray(proj.takeaways), 'rows are normalised at the boundary');
});

// ------------------------------------------------------------------ app

/** Boots the app as a visitor on a candidate link with capturable panels/rows. */
function bootCandidatePage(storeOverrides) {
  const booted = bootApp();
  const { app, els, sandbox } = booted;
  for (const id of ['candidate-loading', 'candidate-not-found', 'candidate-load-error']) {
    els[id] = Object.assign(fakeEl(), { id });
  }
  const rows = [];
  els['stitch-candidate-projects-container'] = Object.assign(fakeEl(), { appendChild: (r) => rows.push(r) });
  sandbox.document.createElement = () => fakeEl();
  Object.assign(sandbox.swapikiStore, {
    getProfileByUsername: () => Promise.resolve(null),
    toList: (v) => (Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map(x => x.trim()).filter(Boolean) : [])),
    recordProfileView: () => {}
  }, storeOverrides || {});
  app.publicUsername = 'priyanshu-007';
  return { ...booted, rows };
}

const visible = (els, id) => !els[id].classList.contains('hidden');

test('a failed lookup lands on the error panel with a retry, not a blank page', async () => {
  const { app, els } = bootCandidatePage({
    getProfileByUsername: () => Promise.reject(new Error('profile_lookup_timeout'))
  });
  await app.renderCandidateProfile();
  assert.ok(visible(els, 'candidate-load-error'), 'the error panel is shown');
  assert.ok(!visible(els, 'candidate-not-found'), 'and it is not mislabelled as a 404');
  assert.ok(!visible(els, 'candidate-loading'), 'the spinner is gone');
  assert.match(els['candidate-load-error-handle'].textContent, /priyanshu-007\.swapiki\.com/);
  assert.match(els['candidate-load-error-reason'].textContent, /too long/i, 'a timeout is explained as such');
  assert.strictEqual(typeof app.retryCandidateProfile, 'function', 'the Try again button has a handler');
});

test('a handle that really does not exist is still a 404, not an error', async () => {
  const { app, els } = bootCandidatePage();
  await app.renderCandidateProfile();
  assert.ok(visible(els, 'candidate-not-found'));
  assert.ok(!visible(els, 'candidate-load-error'));
  assert.ok(!visible(els, 'candidate-loading'));
});

test('while the lookup is in flight the loading panel is up, not the demo template', async () => {
  let release;
  const { app, els } = bootCandidatePage({
    getProfileByUsername: () => new Promise((resolve) => { release = resolve; })
  });
  const pending = app.renderCandidateProfile();
  assert.ok(visible(els, 'candidate-loading'), 'visitors see "Loading profile" immediately');
  release(null);
  await pending;
  assert.ok(!visible(els, 'candidate-loading'));
});

test('odd project data renders every project and cannot inject markup', async () => {
  const profile = {
    id: 'c1', name: 'Priyanshu Kumar', title: 'Developer', experience: '1y', status: '', education: '',
    expertise: 'React, Node', linkedin: 'javascript:alert(1)', twitter: '', portfolio: '', resumeLink: '',
    projects: [
      // list columns as text, hostile strings, a javascript: repo link
      { id: 'p1', title: '<img src=x onerror=alert(1)>', role: '"><b>r</b>', impact: '<i>x</i>',
        tags: 'react, node', takeaways: 'solved it', githubUrl: 'javascript:alert(1)', audioUrl: null, audioDuration: null },
      // nulls everywhere
      { id: 'p2', title: 'Second', role: null, impact: null, tags: null, takeaways: null, githubUrl: null, audioUrl: null }
    ]
  };
  const { app, els, rows } = bootCandidatePage({ getProfileByUsername: () => Promise.resolve(profile) });
  await app.renderCandidateProfile();

  assert.ok(!visible(els, 'candidate-load-error'), 'a malformed row must not take the page down');
  assert.strictEqual(rows.length, 2, 'every project is rendered, not just the ones before the bad row');
  const html = rows[0].innerHTML;
  assert.ok(!html.includes('<img src=x'), 'title is escaped');
  assert.ok(html.includes('&lt;img src=x'), 'and still readable as text');
  assert.ok(!html.includes('<b>r</b>'), 'role is escaped');
  assert.ok(html.includes('>react<') && html.includes('>node<'), 'text tags become separate chips');
  assert.ok(!html.includes('javascript:'), 'a javascript: repo link is never rendered as a link');
  assert.ok(html.includes('Repo not linked'));
  assert.ok(!els['rec-linkedin-link'].attributes.href && els['rec-linkedin-link'].href === undefined,
    'a javascript: profile link is never written to an href');
});

test('play on a public profile uses the candidate\'s recording, not the visitor\'s cache', async () => {
  const profile = {
    id: 'c1', name: 'Priyanshu', title: 'Dev', experience: '', status: '', education: '', expertise: [],
    projects: [{ id: 'p1', title: 'Real', role: 'r', impact: 'i', tags: [], takeaways: [], audioUrl: 'https://cdn.example/priyanshu.webm' }]
  };
  const { app, els, sandbox } = bootCandidatePage({ getProfileByUsername: () => Promise.resolve(profile) });
  await app.renderCandidateProfile();

  const made = [];
  sandbox.Audio = class { constructor(src) { this.src = src; this.paused = true; made.push(this); } play() { return Promise.resolve(); } pause() {} };
  els['play-icon-p1'] = Object.assign(fakeEl(), { closest: () => null });
  app.playProjectAudio('p1');
  assert.strictEqual(made.length, 1, 'a real audio element was created');
  assert.strictEqual(made[0].src, 'https://cdn.example/priyanshu.webm',
    'it plays the candidate\'s recording (the visitor\'s own cached profile has no such project)');
});

test('startup does not wait forever on session restore', async () => {
  const { app, sandbox } = bootApp();
  sandbox.location.hostname = 'priyanshu-007.swapiki.com';
  sandbox.window.scrollTo = () => {};
  Object.assign(sandbox.swapikiStore, {
    applyConfig: () => Promise.resolve(),
    captureReferralFromUrl: () => {},
    siteEnv: 'test',
    getSession: never,                       // the stalled auth lock
    getProfileByUsername: () => Promise.resolve(null),
    incrementViews: () => {},
    toList: (v) => v || [],
    recordProfileView: () => {}
  });
  const started = Date.now();
  await app.init();
  const waited = Date.now() - started;
  assert.ok(waited < 4000, `init gave up on the session and carried on (took ${waited}ms)`);
  assert.ok(app.isCandidateHost(), 'and recognised the candidate host');
});

// ------------------------------------------------------------- edge/SSR

test('the edge lookup is bounded and falls through to the SPA on a stall', async () => {
  const ssr = await import(pathToFileURL(path.join(ROOT, 'functions', 'profile-ssr.js')).href);
  const mw = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href);
  const real = globalThis.fetch;
  // A fetch that only ever ends by being aborted, like a stalled upstream.
  globalThis.fetch = (url, init) => new Promise((_, reject) => {
    if (init && init.signal) init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  try {
    const env = { LOOKUP_TIMEOUT_MS: 40 };
    const started = Date.now();
    await assert.rejects(ssr.getProfileForHandle('priyanshu-007', env), /aborted/);
    assert.ok(Date.now() - started < 1500, 'it gave up quickly');

    let nexted = false;
    const res = await mw.onRequest({
      request: new Request('https://priyanshu-007.swapiki.com/', { headers: { 'X-Original-Host': 'priyanshu-007.swapiki.com' } }),
      env,
      next: async () => { nexted = true; return new Response('spa'); }
    });
    assert.ok(nexted, 'the document request is handed on to the SPA instead of hanging');
    assert.strictEqual(await res.text(), 'spa');
  } finally {
    globalThis.fetch = real;
  }
});
