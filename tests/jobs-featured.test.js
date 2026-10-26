// Featured (pinned) jobs, in the two emails that carry them.
//
// The public board's behaviour is held in tests/jobs-board.test.js. This file is
// about the other half of the same promise: a listing pinned with `featured` has
// to lead the weekly digest and the nudge email too, and the pin has to survive
// the same pre-migration fallback the board uses. A pin that works on the board
// and not in the email is half a feature, and the half that is missing is the one
// the studio sends to people who are asleep.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const urlOf = (p) => pathToFileURL(p).href;

const DIGEST_URL = urlOf(path.join(ROOT, 'functions', 'api', 'cron-send-digest.js'));
const NUDGE_URL = urlOf(path.join(ROOT, 'worker_setup', 'nudge-emails-worker', 'worker.js'));

function job(id, title, over = {}) {
  return {
    id,
    title,
    company: 'Acme',
    location: 'Remote',
    category: 'it',
    salary: null,
    contact: 'https://example.com/apply',
    skills: [],
    description: 'A role.',
    ...over
  };
}

// ---------------------------------------------------------------------------
// Fortnightly jobs drop (functions/api/cron-send-digest.js)
// ---------------------------------------------------------------------------

/**
 * Runs the digest route against a stubbed network and returns the HTML of the
 * one email it sent.
 *
 * `missingFeatured` reproduces a project that has not run the featured
 * migration: the select naming `featured` is answered with a 400, exactly as
 * PostgREST answers an unknown column.
 *
 * `digestSends` is the rows the cooldown lookup returns — the send history that
 * gates a user to one email per 14 days. Empty (the default) means nobody has
 * received a drop yet.
 */
async function sendDigest({ jobs, clicks = new Map(), missingFeatured = false, digestSends = [], resendStatuses = [], emailPreferences = [], users = [{ id: 'u1', email: 'ada@example.com' }], candidates = [{ user_id: 'u1', name: 'Ada Lovelace', expertise: [] }] } = {}) {
  const mod = await import(DIGEST_URL);
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('api.resend.com/emails')) {
      const body = JSON.parse(init.body);
      sent.push(body);
      // resendStatuses lets a test make the first N attempts fail (throttled)
      // and prove the retry path; the default is a clean 200.
      const status = resendStatuses.length ? resendStatuses.shift() : 200;
      const headers = status === 429 ? { 'retry-after': '0' } : undefined;
      return new Response(status >= 400 ? JSON.stringify({ message: 'throttled' }) : '{}', { status, headers });
    }
    if (url.includes('/auth/v1/admin/users')) {
      return new Response(JSON.stringify({ users }), { status: 200 });
    }
    if (url.includes('/rest/v1/candidates')) {
      return new Response(JSON.stringify(candidates), { status: 200 });
    }
    if (url.includes('/rest/v1/jobs')) {
      if (missingFeatured && /featured/.test(url)) {
        return new Response(
          JSON.stringify({ code: '42703', message: 'column jobs.featured does not exist' }),
          { status: 400 }
        );
      }
      return new Response(JSON.stringify(jobs || []), { status: 200 });
    }
    if (url.includes('/rest/v1/job_clicks')) {
      const rows = [...(clicks || new Map()).entries()].flatMap(([id, n]) =>
        Array.from({ length: n }, () => ({ job_id: id }))
      );
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (url.includes('/rest/v1/email_preferences')) {
      // Frequency / unsubscribe choices written by the /unsubscribe page.
      return new Response(JSON.stringify(emailPreferences), { status: 200 });
    }
    if (url.includes('/rest/v1/digest_sends')) {
      if (init && init.method === 'POST') return new Response('', { status: 201 });
      // The cooldown lookup (GET): send history for the fortnightly gate.
      return new Response(JSON.stringify(digestSends), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const env = {
    DIGEST_CRON_SECRET: 'secret',
    RESEND_API_KEY: 'resend',
    SUPABASE_URL: 'https://fake.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service'
  };
  try {
    const res = await mod.onRequestPost({
      request: new Request('https://swapiki.com/api/cron-send-digest', {
        method: 'POST',
        headers: { 'x-cron-secret': 'secret' }
      }),
      env
    });
    return { status: res.status, body: await res.json(), html: sent.length ? sent[0].html : '', subject: sent.length ? sent[0].subject : '' };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('the digest leads its Top jobs card with a pinned role', async () => {
  const jobs = [
    job('a', 'Ordinary job', { featured: false }),
    job('b', 'Swaniki Frontend Engineer', { featured: true }),
    job('c', 'Another ordinary job', { featured: false })
  ];
  const { status, html } = await sendDigest({ jobs });
  assert.equal(status, 200);
  assert.ok(
    html.indexOf('Swaniki Frontend Engineer') < html.indexOf('Ordinary job'),
    'a pinned role must be listed before a feed role in the digest'
  );
});

test('a pinned role outranks a feed role that was clicked more', async () => {
  // The pin is not a tiebreak. A feed row with forty clicks does not get to
  // outrank the studio's own opening - that is the entire point of the column.
  const jobs = [
    job('a', 'Very popular feed job', { featured: false }),
    job('b', 'Swaniki Backend Engineer', { featured: true })
  ];
  const { html } = await sendDigest({ jobs, clicks: new Map([['a', 40]]) });
  assert.ok(
    html.indexOf('Swaniki Backend Engineer') < html.indexOf('Very popular feed job'),
    'click count must not displace a pinned role'
  );
});

test('the digest survives a database without the featured column', async () => {
  // The route would otherwise 500 on every send until the migration was applied,
  // taking the weekly email down with it. A digest without the pin is still a
  // digest.
  const jobs = [job('a', 'Ordinary job')];
  const { status, html } = await sendDigest({ jobs, missingFeatured: true });
  assert.equal(status, 200);
  assert.match(html, /Ordinary job/, 'the digest must still list jobs after the fallback');
});

test('a user emailed within the last 14 days is skipped', async () => {
  // The scheduler calls this route every two hours. Without the gate everyone
  // would get a "fortnightly" drop twice a day; the digest_sends history is
  // what makes the cadence per user rather than per run.
  const digestSends = [{ user_id: 'u1', created_at: new Date(Date.now() - 2 * 86400000).toISOString() }];
  const { status, body } = await sendDigest({ jobs: [job('a', 'Any job')], digestSends });
  assert.equal(status, 200);
  assert.equal(body.sent, 0, 'no email may go out inside the fortnight');
  assert.equal(body.skipped, 1, 'the recent send must be reported as a skip');
  assert.equal(body.recipients, 1);
});

test('a user last emailed 15 days ago is due again', async () => {
  const digestSends = [{ user_id: 'u1', created_at: new Date(Date.now() - 15 * 86400000).toISOString() }];
  const { status, body } = await sendDigest({ jobs: [job('a', 'Any job')], digestSends });
  assert.equal(status, 200);
  assert.equal(body.sent, 1, 'the fortnight has passed, so the drop must go out');
  assert.equal(body.skipped, 0);
});

test('a user with no send history gets the drop', async () => {
  const { body } = await sendDigest({ jobs: [job('a', 'Any job')] });
  assert.equal(body.sent, 1, 'first-time recipients are never gated');
  assert.equal(body.skipped, 0);
});

test('a throttled send is retried, not logged as a failure', async () => {
  // Resend allows two requests per second. The first live run burst its sends
  // and lost 12 of 36 to 429s - the retry is what keeps a fast database from
  // silently becoming a partial mail-out.
  const { status, body } = await sendDigest({ jobs: [job('a', 'Any job')], resendStatuses: [429] });
  assert.equal(status, 200);
  assert.equal(body.sent, 1, 'the retry, not the throttled attempt, is the result');
  assert.equal(body.failed, 0);
});

test('a send that stays throttled is failed after its retries run out', async () => {
  const { body } = await sendDigest({ jobs: [job('a', 'Any job')], resendStatuses: [429, 429, 429, 429] });
  assert.equal(body.sent, 0);
  assert.equal(body.failed, 1, 'a persistent 429 must be reported, not swallowed');
});

test('the digest drops the 14-day window and leads with a hook', async () => {
  // Feedback: "Don't put last 14 days" (it boxes us into a cadence) and "hook
  // is missing — hey XYZ, you are missing out on the hottest jobs".
  const { html, subject } = await sendDigest({ jobs: [job('a', 'Any job')] });
  assert.doesNotMatch(html, /last 14 days/i, 'the card must not advertise the window');
  assert.doesNotMatch(subject, /14 days/i, 'the subject must not advertise the window');
  assert.match(html, /missing out on the hottest jobs/i, 'the email needs its hook');
  assert.match(subject, /hottest jobs/i);
});

test('the footer carries a signed unsubscribe / frequency link', async () => {
  const { html } = await sendDigest({ jobs: [job('a', 'Any job')] });
  assert.match(html, /\/unsubscribe\?u=u1&t=[A-Za-z0-9_-]+/, 'the footer must link to the preferences page');
  assert.match(html, /unsubscribe/i);
});

test('an unsubscribed user is skipped and reported', async () => {
  const { status, body } = await sendDigest({
    jobs: [job('a', 'Any job')],
    emailPreferences: [{ user_id: 'u1', digest_frequency: 'off' }]
  });
  assert.equal(status, 200);
  assert.equal(body.sent, 0, 'an "off" user must never be emailed');
  assert.equal(body.skipped, 1);
  assert.equal(body.unsubscribed, 1);
});

test('an account with no profile is not an audience for the drop', async () => {
  // The drop is for people who used the site. An auth account with no candidate
  // row never got past signup, so it must not be emailed even though it has an
  // address.
  const { status, body } = await sendDigest({
    jobs: [job('a', 'Any job')],
    users: [
      { id: 'u1', email: 'did@example.com' },
      { id: 'u2', email: 'ghost@example.com' }
    ],
    candidates: [{ user_id: 'u1', name: 'Did Sign Up', expertise: [] }]
  });
  assert.equal(status, 200);
  assert.equal(body.recipients, 2);
  assert.equal(body.sent, 1, 'only the account with a profile is emailed');
  assert.equal(body.skipped, 1, 'the profile-less account is skipped');
});

test('a seeded sample profile does not qualify its account', async () => {
  // Dummy rows exist to make the board look alive; they are not a person who
  // used the site. Recognised by the `dummy-` id prefix as well as the flag.
  const { body } = await sendDigest({
    jobs: [job('a', 'Any job')],
    users: [{ id: 'du', email: 'sample@example.com' }],
    candidates: [{ id: 'dummy-42', user_id: 'du', name: 'Sample', expertise: [] }]
  });
  assert.equal(body.sent, 0, 'a dummy profile must never make its account eligible');
});

test('a monthly user inside 30 days is held back', async () => {
  // 20 days would be due on the default fortnightly cadence, so this proves the
  // monthly preference actually widens the window.
  const digestSends = [{ user_id: 'u1', created_at: new Date(Date.now() - 20 * 86400000).toISOString() }];
  const { body } = await sendDigest({
    jobs: [job('a', 'Any job')],
    digestSends,
    emailPreferences: [{ user_id: 'u1', digest_frequency: 'monthly' }]
  });
  assert.equal(body.sent, 0, '20 days is inside the monthly window');
});

test('a monthly user past 30 days is due', async () => {
  const digestSends = [{ user_id: 'u1', created_at: new Date(Date.now() - 31 * 86400000).toISOString() }];
  const { body } = await sendDigest({
    jobs: [job('a', 'Any job')],
    digestSends,
    emailPreferences: [{ user_id: 'u1', digest_frequency: 'monthly' }]
  });
  assert.equal(body.sent, 1, 'a month has passed, so the drop may go out');
});

// ---------------------------------------------------------------------------
// Nudge worker (worker_setup/nudge-emails-worker/worker.js)
// ---------------------------------------------------------------------------

async function topPicks() {
  const mod = await import(NUDGE_URL);
  return mod.computeTopPicks;
}

test('the nudge card leads with pinned roles', async () => {
  const computeTopPicks = await topPicks();
  const jobs = [
    job('a', 'Feed job one', { featured: false }),
    job('b', 'Swaniki Frontend Engineer', { featured: true }),
    job('c', 'Feed job two', { featured: false }),
    job('d', 'Swaniki Backend Engineer', { featured: true })
  ];
  const picked = computeTopPicks(jobs, new Map(), { expertise: [] });
  assert.equal(picked[0].id, 'b', 'the first pick must be a pinned role');
  assert.equal(picked[1].id, 'd', 'the second pick must be the other pinned role');
});

test('the nudge card keeps a mix instead of becoming the studio\'s own advert', async () => {
  // The card is captioned "Open jobs & internships candidates are applying to".
  // Four rows of the studio's own openings would make that caption false, so the
  // pin takes at most two of the four slots and the feed keeps the rest.
  const computeTopPicks = await topPicks();
  const jobs = [
    job('a', 'Feed job one', { featured: false }),
    job('b', 'Swaniki Frontend Engineer', { featured: true }),
    job('c', 'Feed job two', { featured: false }),
    job('d', 'Swaniki Backend Engineer', { featured: true }),
    job('e', 'Swaniki Third Role', { featured: true })
  ];
  const picked = computeTopPicks(jobs, new Map(), { expertise: [] });
  const pinned = picked.filter((j) => j.id === 'b' || j.id === 'd' || j.id === 'e');
  assert.ok(pinned.length <= 2, `expected at most two pinned rows, got ${pinned.length}`);
  assert.ok(picked.length <= 4, 'the card must not grow past four rows');
  assert.ok(
    picked.some((j) => j.id === 'a' || j.id === 'c'),
    'the card must still show at least one feed role'
  );
});

test('the nudge worker retries without the pin when the column is missing', async () => {
  // Same failure as the board and the digest: a select naming an unknown column
  // is a 400, and a 400 here would leave every nudge email with no Top picks at
  // all - the whole card, not just the pin. The retry has to drop the column and
  // send anyway.
  const mod = await import(NUDGE_URL);
  const realFetch = globalThis.fetch;
  const seen = [];
  const jobs = [job('a', 'Ordinary job', { featured: false })];
  globalThis.fetch = async (input) => {
    const url = String(input);
    seen.push(url);
    if (url.includes('/rest/v1/jobs')) {
      if (/featured/.test(url)) {
        return new Response(
          JSON.stringify({ code: '42703', message: 'column jobs.featured does not exist' }),
          { status: 400 }
        );
      }
      return new Response(JSON.stringify(jobs), { status: 200 });
    }
    if (url.includes('/rest/v1/job_clicks')) return new Response('[]', { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  };
  try {
    const data = await mod.fetchTopPicksData({
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service'
    });
    assert.ok(seen.length >= 2, 'the rejected select must be retried');
    assert.match(seen[0], /featured/, 'the first attempt asks for the pin');
    assert.ok(!/featured/.test(seen[seen.length - 1]), 'the retry must not name the missing column');
    assert.equal(data.jobs.length, 1, 'the jobs must survive the fallback');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the nudge card still ranks by clicks and skills when nothing is pinned', async () => {
  const computeTopPicks = await topPicks();
  const jobs = [
    job('a', 'Ignored', { featured: false }),
    job('b', 'Popular', { featured: false, skills: ['react'] })
  ];
  const picked = computeTopPicks(jobs, new Map([['b', 3]]), { expertise: ['react'] });
  assert.equal(picked[0].id, 'b', 'the pin must not have replaced the normal ranking');
});
