// The daily job-post allowance on resume draft and interview prep.
//
// Five distinct job posts a day, shared by both tools, enforced by the database
// rather than by the browser. The properties worth protecting, in order:
//
//   1. The browser cannot spend the allowance itself. The client sends a job id
//      and a tool name and nothing else - no count, no limit, no day - and the
//      rows are written only by a SECURITY DEFINER function that takes the user
//      id from auth.uid(). An account that has used its five cannot get a sixth
//      by editing the page, opening a second tab, or clearing localStorage,
//      because there is nothing local to clear.
//   2. Five is five, and a day is a day. The limit lives in the SQL so the two
//      functions that answer the question cannot disagree about it.
//   3. Re-opening a job already used today is free. The unique key is
//      (user_id, usage_day, job_id), so a candidate who goes back to the same
//      listing is not punished for it - the allowance is per job post, not per
//      button press.
//   4. A project that has not run the migration still works. "Function does not
//      exist" is treated as "not enforced yet", loudly, not as a spent allowance.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { bootApp, makeStorage, fakeEl } = require('./helpers/app-sandbox');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase', 'tool_usage_migration.sql'), 'utf8');

// ---------------------------------------------------------------------------
// The migration (supabase/tool_usage_migration.sql)
// ---------------------------------------------------------------------------

test('the allowance is one row per account, per day, per distinct job post', () => {
  assert.match(SQL, /create table if not exists public\.tool_usage/i);
  assert.match(SQL, /user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/i,
    'a row must not outlive the account that made it');
  assert.match(SQL, /usage_day\s+date\s+not null/i);
  assert.match(SQL, /job_id\s+text\s+not null/i);
  // The whole "re-opening this job is free" promise is this one constraint. With
  // it keyed on something else, a second open spends a second allowance.
  assert.match(SQL, /unique\s*\(user_id,\s*usage_day,\s*job_id\)/i);
  assert.match(SQL, /check\s*\(tool in \('resume',\s*'interview'\)\)/i,
    'the tool is a closed set, so a typo cannot invent a fourth tool');
});

test('the browser has no direct write path to the table', () => {
  assert.match(SQL, /alter table public\.tool_usage enable row level security/i);
  assert.match(SQL, /for select\s*\n\s*to authenticated\s*\n\s*using \(auth\.uid\(\) = user_id\)/i,
    'the only policy is "read your own rows"');
  assert.ok(!/for\s+(insert|update|delete)/i.test(SQL),
    'an insert/update/delete policy would reopen the write path RLS was there to close');
  assert.match(SQL, /revoke insert, update, delete on public\.tool_usage from anon, authenticated/i);
});

test('the limit is five job posts a day, and a day ends at IST midnight', () => {
  // Both functions must read the same limit and the same clock, or the number
  // shown to a candidate and the number enforced against them drift apart.
  // Sliced per function rather than counted, because claim_tool_usage has two
  // return paths (allowed / refused) and both have to carry the same limit.
  const claim = SQL.slice(SQL.indexOf('function public.claim_tool_usage'));
  const status = SQL.slice(SQL.indexOf('function public.tool_usage_status'));
  for (const [name, body] of [['claim_tool_usage', claim], ['tool_usage_status', status]]) {
    assert.match(body, /v_limit int := 5;/, `${name} must enforce five job posts`);
    assert.match(body, /v_day date := public\.swapiki_usage_day\(\);/,
      `${name} must take the day from the shared definition`);
    assert.match(body, /'reset_at', \(\(v_day \+ 1\)::timestamp at time zone 'Asia\/Kolkata'\)/,
      `${name} must say when the allowance comes back`);
  }
  assert.match(SQL, /\(now\(\) at time zone 'Asia\/Kolkata'\)::date/,
    "the day has to be fixed to one timezone or 'today' is the server's day, not the user's");
  assert.match(SQL, /create or replace function public\.swapiki_usage_day\(\)/,
    'one definition of "today", shared by both functions');
});

test('claiming is serialised, so two tabs cannot both pass the check', () => {
  // Count-then-insert without a lock is the classic race: both tabs read 4, both
  // insert, and the account ends the day at six job posts.
  assert.match(SQL, /perform pg_advisory_xact_lock\(hashtextextended\(v_uid::text, 0\)\)/);
  assert.match(SQL, /on conflict \(user_id, usage_day, job_id\)\s*\n\s*do update set tool = excluded\.tool/i,
    'a repeat claim must update the existing row, not fail or add one');
});

test('a repeat claim on the same job is free because it is excluded from the count', () => {
  assert.match(SQL, /and job_id <> p_job_id/i,
    'counting this job as an "other" job would spend an allowance on a page reload');
  assert.match(SQL, /if v_used >= v_limit then/,
    'the limit is enforced before the insert, not after');
});

test('only a signed-in account can claim anything', () => {
  assert.match(SQL, /if v_uid is null then\s*\n\s*raise exception 'not authenticated' using errcode = '28000'/i,
    "a null auth.uid() must fail loudly, not default to someone else's allowance");
  assert.match(SQL, /security definer/i);
  assert.match(SQL, /revoke all on function public\.claim_tool_usage\(text, text\) from public/i);
  assert.match(SQL, /grant execute on function public\.claim_tool_usage\(text, text\) to authenticated/i);
});

test('the migration is safe to re-run', () => {
  assert.match(SQL, /create table if not exists/i);
  assert.match(SQL, /create index if not exists/i);
  assert.match(SQL, /drop policy if exists/i);
  assert.ok((SQL.match(/create or replace function/g) || []).length >= 3);
});

// ---------------------------------------------------------------------------
// The store (js/store.js)
// ---------------------------------------------------------------------------

function bootStore(rpcImpl) {
  const noop = () => {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    document: { referrer: '', querySelector: () => null, querySelectorAll: () => [], addEventListener: noop },
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('store.js'), sandbox, { filename: 'store.js' });
  const calls = [];
  sandbox.swapikiStore.supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return rpcImpl(name, args);
    }
  };
  return { store: sandbox.swapikiStore, calls };
}

const VERDICT = { allowed: true, used: 1, remaining: 4, limit: 5, reset_at: '2026-10-03T00:00:00+05:30' };

test('the store sends the job and the tool, and nothing the browser could bend', async () => {
  const { store, calls } = bootStore(async () => ({ data: VERDICT, error: null }));
  store.currentUser = { id: 'u1' };
  const res = await store.claimToolUsage('job-9', 'interview');
  assert.equal(calls[0].name, 'claim_tool_usage');
  assert.deepEqual(calls[0].args, { p_job_id: 'job-9', p_tool: 'interview' },
    'a client-sent count or limit would let an account claim its own sixth job post');
  assert.equal(res.allowed, true);
  assert.equal(res.remaining, 4);
});

test('an unknown tool name is coerced to one of the two, never passed through', async () => {
  const { store, calls } = bootStore(async () => ({ data: VERDICT, error: null }));
  store.currentUser = { id: 'u1' };
  await store.claimToolUsage('job-9', 'something-else');
  assert.equal(calls[0].args.p_tool, 'resume');
});

test('a project that has not run the migration is not a spent allowance', async () => {
  // Supabase reports an un-created function two ways depending on the layer that
  // noticed. Both have to read as "not enforced yet", or running this migration
  // would break the tools for everyone the moment it was half-applied.
  for (const error of [
    { code: 'PGRST202', message: 'Could not find the function public.claim_tool_usage' },
    { code: '42883', message: 'function public.claim_tool_usage(text, text) does not exist' }
  ]) {
    const { store } = bootStore(async () => ({ data: null, error }));
    store.currentUser = { id: 'u1' };
    const res = await store.claimToolUsage('job-9', 'resume');
    assert.equal(res.allowed, true, `a missing function blocked the tool: ${error.code}`);
    assert.equal(res.unavailable, true);
  }
});

test('a real failure refuses the tool instead of quietly allowing it', async () => {
  // The opposite of the missing-function case. Here we genuinely do not know
  // whether the allowance is spent, and handing out a free job post because a
  // count failed is how the limit quietly stops being a limit.
  const { store } = bootStore(async () => ({ data: null, error: { code: '500', message: 'boom' } }));
  store.currentUser = { id: 'u1' };
  const res = await store.claimToolUsage('job-9', 'resume');
  assert.equal(res.allowed, false);
  assert.ok(res.error, 'the failure has to be reported, not swallowed');
});

test('a signed-out visitor never reaches the database', async () => {
  const { store, calls } = bootStore(async () => ({ data: VERDICT, error: null }));
  store.currentUser = null;
  const res = await store.claimToolUsage('job-9', 'resume');
  assert.equal(calls.length, 0);
  assert.equal(res.allowed, false);
  assert.equal(res.reason, 'unauthenticated');
});

test('a store that throws does not become an open door', async () => {
  const { store } = bootStore(async () => { throw new Error('network down'); });
  store.currentUser = { id: 'u1' };
  const res = await store.claimToolUsage('job-9', 'resume');
  assert.equal(res.allowed, false);
});

// ---------------------------------------------------------------------------
// The views (js/app.js)
// ---------------------------------------------------------------------------

/**
 * Boots the app as a member above the 80% wall with `job` on the board, and a
 * claim function that returns `verdict`. Returns the view roots and the claims
 * made, so a test can assert both the message and what was charged.
 */
async function bootToolView(verdict, view) {
  const { app, els, sandbox } = bootApp(makeStorage());
  const claims = [];
  sandbox.swapikiStore.currentUser = { id: 'u1' };
  sandbox.swapikiStore.getProfile = () => ({
    name: 'Rahul Verma', title: 'Frontend Engineer', experience: '3 years',
    expertise: ['react'], completionScore: 90,
    projects: [{ title: 'Design system', role: 'Dev', tags: ['react'], takeaways: ['Shipped it'] }]
  });
  sandbox.swapikiStore.claimToolUsage = async (jobId, tool) => {
    claims.push({ jobId, tool });
    return verdict;
  };
  app._jobsCache = [{ id: 'j1', title: 'Frontend Engineer', company: 'Swaniki', description: 'Build with React.' }];
  if (view === 'resume') {
    app._resumeJobId = 'j1';
    await app.renderResumeDraftView();
  } else {
    app._interviewJobId = 'j1';
    await app.renderInterviewPrepView();
  }
  const root = view === 'resume' ? els['resume-draft-container'] : els['interview-prep-container'];
  return { app, html: root ? root.innerHTML : '', claims, sandbox };
}

const SPENT = { allowed: false, used: 5, remaining: 0, limit: 5, reset_at: '2026-10-03T00:00:00+05:30' };

test('a spent allowance tells the candidate to come back tomorrow', async () => {
  const { html, claims } = await bootToolView(SPENT, 'resume');
  assert.deepEqual(claims, [{ jobId: 'j1', tool: 'resume' }], 'the job is charged before the limit is shown');
  assert.match(html, /Daily limit reached/);
  assert.match(html, /Come back tomorrow/);
  assert.match(html, /all 5 job posts/);
  assert.ok(!/Draft a resume for this job/.test(html), 'the editor must not render past the limit');
});

test('interview prep is stopped by the same allowance', async () => {
  const { html, claims } = await bootToolView(SPENT, 'interview');
  assert.deepEqual(claims, [{ jobId: 'j1', tool: 'interview' }]);
  assert.match(html, /Daily limit reached/);
  assert.match(html, /Come back tomorrow/);
  assert.ok(!/Interview prep for this job/.test(html), 'the question bank must not render past the limit');
});

test('the limit is one shared allowance, not two separate ones', async () => {
  // Both tools charge the same server-side allowance, so opening resume draft
  // first and interview prep second cannot buy the candidate ten job posts.
  const sqlCalls = [];
  const { store } = bootStore(async (name, args) => {
    sqlCalls.push(args);
    return { data: VERDICT, error: null };
  });
  store.currentUser = { id: 'u1' };
  await store.claimToolUsage('job-1', 'resume');
  await store.claimToolUsage('job-1', 'interview');
  await store.claimToolUsage('job-2', 'interview');
  // One function, one row per job: the day is counted by the database, so the
  // tools cannot disagree about how much is left.
  assert.deepEqual(sqlCalls.map(c => c.p_job_id), ['job-1', 'job-1', 'job-2']);
  assert.ok(sqlCalls.every(c => c.p_job_id !== undefined), 'the job is the unit being spent');
  assert.ok(!sqlCalls.some(c => 'p_count' in c || 'p_limit' in c || 'p_day' in c),
    'a client-sent day or count would let one tab ignore the day it just used');
});

test('a job still inside the allowance opens, and says how much is left', async () => {
  const { html } = await bootToolView(VERDICT, 'resume');
  assert.match(html, /Draft a resume for this job/);
  assert.match(html, /4 of 5 job posts left today/);
  assert.match(html, /already used today is free/, 'the repeat rule is stated, not left to be guessed');
});

test('a failed check is not announced as a spent allowance', async () => {
  const { html } = await bootToolView({ allowed: false, error: 'boom' }, 'resume');
  assert.match(html, /Couldn't check your daily limit/);
  assert.match(html, /try again/i);
  assert.ok(!/Come back tomorrow/.test(html),
    "a server hiccup is not the candidate's fault and must not send them away for a day");
});

test('the tools still open before the migration has run', async () => {
  const { html } = await bootToolView({ allowed: true, unavailable: true }, 'resume');
  assert.match(html, /Draft a resume for this job/);
  assert.ok(!/Daily limit reached/.test(html));
  assert.ok(!/of \d+ job posts left today/.test(html),
    'an unenforced limit must not be shown as a running count');
  assert.match(html, /5 job posts a day/,
    'the policy is still disclosed even when the server cannot count yet');
});

test('the limit is disclosed before the candidate clicks anything', async () => {
  // The Apply popup is where the two buttons are. If the rule only appeared
  // after the sixth job post, the first five would be a trap.
  const { app, sandbox } = bootApp(makeStorage());
  // openJobApplyModal builds the overlay with createElement and appends it to the
  // body, so the helper's throwaway elements have to be captured to read the
  // markup it produced.
  let overlay = null;
  sandbox.document.createElement = () => (overlay = fakeEl());
  sandbox.swapikiStore.currentUser = { id: 'user-1' };
  sandbox.swapikiStore.getProfile = () => ({ name: 'Rahul', username: 'rahul', expertise: [], projects: [], completionScore: 90 });
  app._jobsCache = [{ id: 'j1', title: 'Frontend Engineer', company: 'Swaniki', contact: 'https://x.example' }];
  app.openJobApplyModal('j1');
  const html = overlay ? overlay.innerHTML : '';
  assert.match(html, /job posts a day/);
  assert.match(html, /shared between resume drafts and interview prep/);
  assert.match(html, /Draft resume/);
  assert.match(html, /Interview prep/);
  // The countdown line is not on this popup: it would need a claim to know, and
  // opening the popup must not spend one.
  assert.ok(!/job posts left today/.test(html));
});

test('the number the candidate is told is the number the database enforces', () => {
  // Two places state the limit: the SQL the candidate is held to, and the copy
  // shown before they click. If these drift, the product quietly lies.
  const app = read('app.js');
  const shown = app.match(/const DAILY_TOOL_JOB_LIMIT = (\d+);/);
  assert.ok(shown, 'app.js must state the limit as a named constant');
  const enforced = (SQL.match(/v_limit int := (\d+);/g) || []).map(s => s.match(/(\d+)/)[1]);
  assert.ok(enforced.length >= 2, 'both SQL functions enforce the limit');
  for (const n of enforced) {
    assert.equal(shown[1], n, `the UI says ${shown[1]} but the database enforces ${n}`);
  }
  assert.match(app, /\$\{limit\} job posts a day, shared between resume drafts and interview prep/,
    'the disclosed number must be the constant, not a number typed into the copy');
});

test('a signed-out visitor is asked to sign in, not shown a limit', async () => {
  const { app, els, sandbox } = bootApp(makeStorage());
  let called = 0;
  sandbox.swapikiStore.claimToolUsage = async () => { called++; return SPENT; };
  await app.renderResumeDraftView();
  assert.equal(called, 0, 'a signed-out visitor has no allowance to spend');
  assert.match(els['resume-draft-container'].innerHTML, /Resume drafts are for members/);
});

test('the app keeps no allowance state of its own', () => {
  // If the browser stored a count, clearing localStorage would hand the account
  // a fresh five. The only number the UI ever shows is the one the server sent.
  const app = read('app.js');
  const helpers = app.slice(app.indexOf('async _claimTool('), app.indexOf('openResumeDraft('));
  assert.ok(!/localStorage|sessionStorage/.test(helpers),
    'the quota helpers must not persist a count in the browser');
  assert.ok(!/d\s*[-+*\/]?=\s*1|used\s*\+\+/.test(helpers), 'the count is incremented by the server');
});
