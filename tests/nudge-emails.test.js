// The profile-lifecycle emails: one conversation, five beats, never more than
// twice a week per candidate.
//
// The decision logic and templates are pure (decideNextEmail, remainingSteps,
// renderTemplate) and are asserted directly. One integration test drives
// runNudgeJob against a stubbed network to prove the loop actually sends and
// stamps a candidate instead of just rendering strings.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const NUDGE_URL = pathToFileURL(
  path.join(ROOT, 'worker_setup', 'nudge-emails-worker', 'worker.js')
).href;

async function mod() {
  return await import(NUDGE_URL);
}

// A fully-formed candidate state for decideNextEmail.
function state(over = {}) {
  return {
    hasEmail: true,
    isDummy: false,
    accountAgeDays: 20,
    lastSignInDays: 0,
    completion: 50,
    isPublished: false,
    clickedInLastDays: false,
    ...over
  };
}

// -------------------------------------------------------------- the decision

test('never emails a candidate with no email address', async () => {
  const { decideNextEmail } = await mod();
  assert.equal(decideNextEmail(state({ hasEmail: false })), null);
});

test('never emails dummy profiles', async () => {
  const { decideNextEmail } = await mod();
  assert.equal(decideNextEmail(state({ isDummy: true })), null);
});

test('no same-day signup emails', async () => {
  const { decideNextEmail } = await mod();
  assert.equal(decideNextEmail(state({ accountAgeDays: 2 })), null);
  assert.ok(decideNextEmail(state({ accountAgeDays: 3 })), 'day three is old enough');
});

test('an incomplete profile that has not been visited in 4+ days gets the miss-you email', async () => {
  const { decideNextEmail } = await mod();
  assert.deepEqual(decideNextEmail(state({ lastSignInDays: 4, completion: 30 })), { kind: 'we_miss_you' });
  assert.deepEqual(decideNextEmail(state({ lastSignInDays: 9, completion: 80 })), { kind: 'we_miss_you' });
});

test('an incomplete profile that is still active gets the progress email', async () => {
  const { decideNextEmail } = await mod();
  assert.deepEqual(decideNextEmail(state({ lastSignInDays: 3, completion: 30 })),
    { kind: 'progress', variant: 'stepping' });
});

test('crossing 50% switches the progress email to the halfway rendering', async () => {
  const { decideNextEmail } = await mod();
  assert.deepEqual(decideNextEmail(state({ lastSignInDays: 1, completion: 50 })),
    { kind: 'progress', variant: 'halfway' });
  assert.deepEqual(decideNextEmail(state({ lastSignInDays: 1, completion: 74 })),
    { kind: 'progress', variant: 'halfway' });
});

test('a finished but unpublished profile is told to publish', async () => {
  const { decideNextEmail } = await mod();
  assert.deepEqual(decideNextEmail(state({ completion: 100, isPublished: false })),
    { kind: 'apply_now', variant: 'publish' });
});

test('a live profile that has not opened a job in 7 days is told to apply', async () => {
  const { decideNextEmail } = await mod();
  assert.deepEqual(decideNextEmail(state({ completion: 100, isPublished: true, clickedInLastDays: false })),
    { kind: 'apply_now', variant: 'apply' });
});

test('a live profile that is still applying is left alone except the quiet beat', async () => {
  const { decideNextEmail } = await mod();
  assert.deepEqual(decideNextEmail(state({ completion: 100, isPublished: true, clickedInLastDays: true })),
    { kind: 'keep_fresh' });
});

// ------------------------------------------------------ the "what's left" list

test('the steps list names project, voice and publish in order', async () => {
  const { remainingSteps } = await mod();
  const steps = remainingSteps({ profile_status: 'draft' }, false, false);
  assert.deepEqual(steps, [
    'Add your first proof project',
    'Record your two-minute voice walkthrough',
    'Publish the profile'
  ]);
});

test('done items drop out of the steps list', async () => {
  const { remainingSteps } = await mod();
  assert.deepEqual(remainingSteps({ profile_status: 'published' }, true, true), []);
  assert.deepEqual(remainingSteps({ profile_status: 'published' }, true, false),
    ['Record your two-minute voice walkthrough']);
  assert.deepEqual(remainingSteps({ profile_status: 'draft' }, true, true),
    ['Publish the profile']);
});

test('an absent profile_status reads as unpublished, never as published', async () => {
  const { remainingSteps } = await mod();
  assert.ok(remainingSteps({}, true, true).includes('Publish the profile'));
});

// ----------------------------------------------------------- the templates

test('every beat carries its subject and greeting', async () => {
  const { renderTemplate } = await mod();
  const ctx = { firstName: 'Ada', completion: 30, steps: [], topSearchesHtml: '', topPicksHtml: '' };
  const cases = [
    ['we_miss_you', {}, "It's been a few days, and your profile is still at 30%"],
    ['progress', { variant: 'stepping' }, "You're 30% there"],
    ['progress', { variant: 'halfway' }, 'Halfway there'],
    ['apply_now', { variant: 'publish' }, "one click from live"],
    ['apply_now', { variant: 'apply' }, "It hasn't been applied anywhere yet."],
    ['keep_fresh', {}, 'A quiet week on Swapiki']
  ];
  for (const [kind, over, subjectPart] of cases) {
    const { subject } = renderTemplate(kind, { ...ctx, ...over });
    assert.match(subject, new RegExp(subjectPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('the top job searches card is the first block after the greeting', async () => {
  const { renderTemplate } = await mod();
  const ctx = {
    firstName: 'Ada',
    completion: 55,
    steps: [],
    topSearchesHtml: '<div id="searches-card">Top job searches</div>',
    topPicksHtml: '<div id="picks-card">Top picks this week</div>'
  };
  for (const [kind, over] of [
    ['we_miss_you', {}],
    ['progress', { variant: 'halfway' }],
    ['apply_now', { variant: 'apply' }],
    ['keep_fresh', {}]
  ]) {
    const { html } = renderTemplate(kind, { ...ctx, ...over });
    const headingEnd = html.indexOf('</h1>');
    const searches = html.indexOf('id="searches-card"');
    const firstParagraph = html.indexOf('margin:0 0 14px');
    assert.ok(headingEnd >= 0, `${kind}: the greeting must be the first block`);
    assert.ok(searches > headingEnd, `${kind}: searches must follow the greeting`);
    assert.ok(firstParagraph > searches, `${kind}: the nudge copy must come after searches`);
  }
});

test('the searches and picks cards appear once each, and picks only where asked', async () => {
  const { renderTemplate } = await mod();
  const cards = {
    topSearchesHtml: '<div>Top job searches</div>',
    topPicksHtml: '<div>Top picks this week</div>'
  };
  const halfway = renderTemplate('progress', { firstName: 'Ada', variant: 'halfway', ...cards }).html;
  assert.equal(halfway.split('Top job searches').length - 1, 1);
  assert.ok(!halfway.includes('Top picks this week'), 'progress emails should not carry the picks card');

  const apply = renderTemplate('apply_now', { firstName: 'Ada', variant: 'apply', ...cards }).html;
  assert.equal(apply.split('Top job searches').length - 1, 1);
  assert.equal(apply.split('Top picks this week').length - 1, 1);
});

test('the stepping email lists the steps as a real list', async () => {
  const { renderTemplate } = await mod();
  const { html } = renderTemplate('progress', {
    firstName: 'Ada',
    variant: 'stepping',
    steps: ['Record your two-minute voice walkthrough', 'Publish the profile']
  });
  assert.equal(html.split('<li>').length - 1, 2);
  assert.match(html, /Do these in order and your profile goes live\./);
});

test('rendered emails never claim verification', async () => {
  const { renderTemplate } = await mod();
  const kinds = [
    ['we_miss_you', {}],
    ['progress', { variant: 'stepping' }],
    ['progress', { variant: 'halfway' }],
    ['apply_now', { variant: 'publish' }],
    ['apply_now', { variant: 'apply' }],
    ['keep_fresh', {}]
  ];
  for (const [kind, over] of kinds) {
    const { html, subject } = renderTemplate(kind, {
      firstName: 'Ada',
      completion: 100,
      steps: [],
      ...over
    });
    assert.ok(!/\bverified\b|\bcertified\b/i.test(html + subject), `${kind} must not claim verification`);
  }
});

test('the footer tells the reader how often these land', async () => {
  const { renderTemplate } = await mod();
  const { html } = renderTemplate('we_miss_you', { firstName: 'Ada' });
  assert.match(html, /never more than twice a week/);
});

// ------------------------------------------------- the runner (stubbed network)

function candidate(over = {}) {
  return {
    id: 'c' + (over.id || Math.random().toString(16).slice(2)),
    user_id: 'u' + (over.id || Math.random().toString(16).slice(2)),
    email: 'candidate@example.com',
    name: 'Ada Lovelace',
    expertise: [],
    is_dummy: false,
    profile_status: 'draft',
    completion_score: 30,
    last_sign_in_at: null,
    last_nudge_sent_at: null,
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    ...over
  };
}

/**
 * Runs runNudgeJob against a fully stubbed network. Tracks every outbound
 * request so the assertions can prove what was sent and to whom.
 */
async function run(env, fetchImpl) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: (init.method || 'GET').toUpperCase(), body: init.body });
    return fetchImpl(url, init);
  };
  try {
    const mod = await import(NUDGE_URL);
    await mod.runNudgeJob(env);
  } finally {
    globalThis.fetch = realFetch;
  }
  return calls;
}

function network({ candidates = [], projects = [] } = {}) {
  return (url) => {
    if (url.includes('/rest/v1/candidates')) return new Response(JSON.stringify(candidates), { status: 200 });
    if (url.includes('/rest/v1/projects')) return new Response(JSON.stringify(projects), { status: 200 });
    if (url.includes('/auth/v1/admin/users')) {
      return new Response(JSON.stringify({
        users: candidates.map(c => ({ id: c.user_id, last_sign_in_at: c.last_sign_in_at }))
      }), { status: 200 });
    }
    if (url.includes('/rest/v1/job_clicks')) return new Response('[]', { status: 200 });
    if (url.includes('/rest/v1/jobs')) return new Response('[]', { status: 200 });
    if (url.includes('/rest/v1/search_events')) return new Response('[]', { status: 200 });
    if (url.includes('/v1.1/email')) return new Response('{}', { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  };
}

const ENV = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  ZEPTOMAIL_API_URL: 'https://api.zeptomail.in/v1.1/email',
  ZEPTOMAIL_TOKEN: 'token',
  ZEPTOMAIL_FROM_ADDRESS: 'hello@swapiki.com'
};

test('the job sends exactly the emails the conversation calls for', async () => {
  const now = new Date();
  const sends = [
    candidate({
      id: 'a', email: 'active30@example.com',
      last_sign_in_at: new Date(now.getTime() - 1 * 86400000).toISOString()
    }),
    candidate({
      id: 'b', email: 'sleepy@example.com',
      // no last_sign_in_at -> falls back to created_at, which is 20 days old
    }),
    candidate({ id: 'dummy', user_id: 'ud', email: null, is_dummy: true }),
    candidate({ id: 'done', user_id: 'u2', email: 'done@example.com', completion_score: 100, profile_status: 'published' })
  ];
  // sleepy@example.com was created 20 days ago inside the object above
  sends[1].created_at = new Date(now.getTime() - 20 * 86400000).toISOString();
  // done@example.com has clicked nothing in 7 days -> apply_now/apply
  sends[3].created_at = new Date(now.getTime() - 30 * 86400000).toISOString();

  const calls = await run(ENV, network({ candidates: sends }));

  const emails = calls.filter(c => c.url.includes('/v1.1/email'));
  assert.equal(emails.length, 3, 'three sends: progress, miss-you, apply');
  const sentTo = emails.map(c => JSON.parse(c.body).to[0].email_address.address).sort();
  assert.deepEqual(sentTo, ['active30@example.com', 'done@example.com', 'sleepy@example.com']);

  const subjects = emails.map(c => JSON.parse(c.body).subject);
  assert.ok(subjects.some(s => s.includes("You're 30% there")), 'active incomplete -> progress');
  assert.ok(subjects.some(s => s.includes('It\'s been a few days')), 'inactive -> miss-you');
  assert.ok(subjects.some(s => s.includes("It hasn't been applied anywhere yet.")), 'complete but idle -> apply');

  // The stamps: the two that actually need the progress/miss-you beat write
  // last_nudge_type; the dummy never does.
  const patches = calls.filter(c => c.method === 'PATCH');
  assert.equal(patches.length, 3, 'each real send is stamped');
  for (const p of patches) {
    const body = JSON.parse(p.body);
    assert.ok(['progress', 'we_miss_you', 'apply_now'].includes(body.last_nudge_type.split(':')[0]));
  }
  assert.ok(!patches.some(p => p.url.includes('dummy')), 'the dummy is never stamped');
});

test('the four-day cooldown holds back repeat emails', async () => {
  const recentlySent = new Date(Date.now() - 2 * 86400000).toISOString();
  const candidates = [
    candidate({ id: 'r', last_nudge_sent_at: recentlySent })
  ];
  const calls = await run(ENV, network({ candidates }));
  assert.equal(calls.filter(c => c.url.includes('/v1.1/email')).length, 0,
    'an email sent two days ago must be inside the cooldown');
});

test('a healthy recently-applying candidate only gets the quiet beat on its own cadence', async () => {
  // recently clicked (job_clicks has their user_id) and complete & published
  const candidates = [candidate({
    id: 'h', user_id: 'uh', email: 'healthy@example.com',
    completion_score: 100, profile_status: 'published',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString()
  })];
  // Fall through to the standard network stub, but answer job_clicks with a
  // real click so the profile reads as "still applying".
  const calls = await run(ENV, (url, init) => {
    if (url.includes('/rest/v1/job_clicks')) return new Response(JSON.stringify([{ user_id: 'uh' }]), { status: 200 });
    return network({ candidates })(url, init);
  });
  const emails = calls.filter(c => c.url.includes('/v1.1/email'));
  assert.equal(emails.length, 1);
  assert.match(JSON.parse(emails[0].body).subject, /A quiet week on Swapiki/);
  const patch = calls.find(c => c.method === 'PATCH');
  assert.equal(JSON.parse(patch.body).last_nudge_type, 'keep_fresh');
});