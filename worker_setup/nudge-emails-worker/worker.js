/**
 * Swapiki — Profile Lifecycle Emails (the conversation)
 * -------------------------------------------------------
 * Runs on a daily Cloudflare Cron Trigger. Every candidate gets one email,
 * chosen from a five-step conversation, and never more than twice a week:
 *
 *   we_miss_you   - active account, profile incomplete, no sign-in in 4+ days
 *                   ("It's been a few days…")
 *   progress      - profile incomplete, still active. Two renderings:
 *                     stepping (under 50% — "here's exactly what's left")
 *                     halfway ( 50%+   — "this is the half recruiters read")
 *   apply_now     - profile complete (100%). Two renderings:
 *                     publish  (finished but still a draft — "one click from live")
 *                     apply    (live but no job opened in 7 days — "go use it")
 *   keep_fresh    - complete AND recently applying. Rare (14-day cadence),
 *                   deliberately quiet so it never reads as noise.
 *
 * Emails that ask the candidate to do something are capped at one per 4 days
 * (~2/week). The conversational rule is: acknowledge where they are, show the
 * jobs people are searching for up top, move them one step forward — never
 * three nudges about the same thing.
 *
 * WHICH PROVIDER AND WHY:
 * ZeptoMail (Zoho's transactional API) because Cloudflare Workers cannot open
 * a raw SMTP connection. Plain HTTP API, generous free tier. Keep regular
 * Zoho Mail inboxes for humans replying to candidates.
 *
 * Required secrets (set with `wrangler secret put <NAME>`):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   ZEPTOMAIL_TOKEN, ZEPTOMAIL_FROM_ADDRESS, ZEPTOMAIL_API_URL
 *   (ZEPTOMAIL_API_URL is https://api.zeptomail.in/v1.1/email on the .in DC,
 *    https://api.zeptomail.com/v1.1/email on the .com DC — ZeptoMail > Setup
 *    shows which one your account uses.)
 *
 * Schema note: voice pitches live on individual PROJECTS (projects.audio_url),
 * so "has a voice pitch" means "has at least one project with audio_url".
 * completion_score comes from the candidates table (the seven-item checklist
 * the profile builder computes). job_clicks.user_id says whether a candidate
 * has opened any apply link in the last 7 days.
 */

const MIN_ACCOUNT_AGE_DAYS = 3;        // no same-day signup emails
const MISS_YOU_THRESHOLD_DAYS = 4;     // account inactive this long -> we_miss_you
const ACTION_COOLDOWN_DAYS = 4;        // max one actionable email per 4 days (~2/week)
const KEEP_FRESH_COOLDOWN_DAYS = 14;   // healthy candidates emailed at most every 2 weeks
const APPLY_WINDOW_DAYS = 7;           // "still applying" looks back this far
const TOP_PICKS_LIMIT = 4;             // rows on the "Top picks" card (jobs + internships)
const PINNED_SLOTS = 2;                // of those rows, how many featured roles may take
const TOP_SEARCHES_LIMIT = 5;          // rows on the "Top searches" card
const CLICKS_WINDOW_DAYS = 7;          // ranking window for real candidate interest

// Demo terms for the manual `?email=...&sample=1` test send ONLY — lets the
// team preview the Top-searches card before real search_events build up.
// The scheduled job never uses these values.
const SAMPLE_SEARCHES = [
  ['full stack developer', 12],
  ['data analyst', 9],
  ['frontend internship', 7],
  ['marketing intern', 6],
  ['python intern', 4]
];

function daysAgo(dateString) {
  if (!dateString) return Infinity;
  return (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24);
}

function firstNameFrom(candidate) {
  const name = (candidate.name || '').trim();
  return name ? name.split(' ')[0] : 'there';
}

function percentOf(candidate) {
  const v = Number(candidate.completion_score);
  return Number.isFinite(v) ? Math.round(v) : 0;
}

// --- Decision logic (pure — exported for the tests) --------------------------

// The conversation, as one function. State is a plain object so the tests can
// feed any combination without touching a database:
//   { hasEmail, isDummy, accountAgeDays, lastSignInDays, completion,
//     isPublished, clickedInLastDays }
// Returns null when the candidate deserves to be left alone.
export function decideNextEmail(state) {
  if (!state.hasEmail || state.isDummy || state.accountAgeDays < MIN_ACCOUNT_AGE_DAYS) {
    return null;
  }
  if (state.completion < 100) {
    if (state.lastSignInDays >= MISS_YOU_THRESHOLD_DAYS) return { kind: 'we_miss_you' };
    return { kind: 'progress', variant: state.completion >= 50 ? 'halfway' : 'stepping' };
  }
  // Profile complete (100%) — the remaining questions are "did you publish?"
  // and "are you actually using it?"
  if (!state.isPublished) return { kind: 'apply_now', variant: 'publish' };
  if (!state.clickedInLastDays) return { kind: 'apply_now', variant: 'apply' };
  return { kind: 'keep_fresh' };
}

// What the "here's exactly what's left" email lists. Detected from the same
// signals the worker already fetches; never claims more than it can see.
export function remainingSteps(candidate, hasProject, hasAudio) {
  const steps = [];
  if (!hasProject) steps.push('Add your first proof project');
  if (!hasAudio) steps.push('Record your two-minute voice walkthrough');
  if (!candidate.profile_status || candidate.profile_status !== 'published') {
    steps.push('Publish the profile');
  }
  return steps;
}

// --- Top-picks card (jobs & internships candidates are applying to) ----------

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isInternship(job) {
  return /\(internship\)|internship|intern\b/i.test(
    [job.salary, job.title, job.description || ''].join(' ')
  );
}

function workMode(job) {
  const text = [job.location || '', job.description || ''].join(' ');
  if (/hybrid/i.test(text)) return 'Hybrid';
  if (/remote|work from home|\bwfh\b/i.test(text)) return 'Remote / WFH';
  return 'Onsite';
}

// Fetches published jobs + last-7-days candidate clicks, once per run.
export async function fetchTopPicksData(env) {
  const columns = 'id,title,company,location,category,salary,contact,skills,description,created_at,featured';
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  };
  let jobsRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/jobs?status=eq.published&select=${columns}&order=created_at.desc`,
    { headers }
  );
  if (jobsRes.status === 400) {
    const body = await jobsRes.clone().text().catch(() => '');
    if (/42703|column\s+[\w."]+\s+does not exist/i.test(body)) {
      console.warn('Top picks: jobs.featured is missing; ranking without the pin. Run supabase/swaniki_jobs_migration.sql.');
      jobsRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/jobs?status=eq.published&select=${columns.replace(',featured', '')}&order=created_at.desc`,
        { headers }
      );
    }
  }
  if (!jobsRes.ok) {
    console.warn('Top picks: could not fetch jobs', jobsRes.status);
    return { jobs: [], clicks: new Map() };
  }
  const jobs = await jobsRes.json();

  const clicks = new Map();
  try {
    const since = new Date(Date.now() - CLICKS_WINDOW_DAYS * 86400000).toISOString();
    const clicksRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/job_clicks?select=job_id&created_at=gte.${encodeURIComponent(since)}`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (clicksRes.ok) {
      for (const c of await clicksRes.json()) {
        if (c && c.job_id) clicks.set(c.job_id, (clicks.get(c.job_id) || 0) + 1);
      }
    }
  } catch (err) {
    console.warn('Top picks: click ranking unavailable — using skill match + newest', err.message);
  }

  return { jobs, clicks };
}

function skillOverlap(candidate, job) {
  const candSkills = (candidate.expertise || []).map(s => String(s).toLowerCase());
  const jobSkills = (job.skills || []).map(s => String(s).toLowerCase());
  if (candSkills.length === 0 || jobSkills.length === 0) return 0;
  return candSkills.filter(s => jobSkills.includes(s)).length;
}

// Picks the top 3-4 openings for one candidate: blends the most-clicked jobs
// with the most-clicked internships, then re-ranks by skill match. Featured
// roles (the studio's own openings) lead; the 2-per-type split keeps the card
// a mix of jobs and internships. Exported for the tests only.
export function computeTopPicks(jobs, clicks, candidate) {
  const featured = (j) => !!(j && (j.featured === true || j.featured === 'true' || j.featured === 't'));
  const scored = jobs.map(j => ({
    job: j,
    on: isInternship(j),
    score: (clicks.get(j.id) || 0) * 4 + skillOverlap(candidate, j),
    recency: new Date(j.created_at || 0).getTime()
  }));
  const featuredPool = scored
    .filter(p => featured(p.job))
    .sort((a, b) => b.score - a.score || b.recency - a.recency);
  const feedPool = scored
    .filter(p => !featured(p.job))
    .sort((a, b) => b.score - a.score || b.recency - a.recency);

  const picked = [];
  const jobsPicked = [];
  const internPicked = [];
  const add = (p) => {
    (p.on ? internPicked : jobsPicked).push(p);
    picked.push(p);
  };

  for (const p of featuredPool) {
    if (picked.length >= PINNED_SLOTS || picked.length >= TOP_PICKS_LIMIT) break;
    add(p);
  }
  for (const p of feedPool) {
    if (picked.length >= TOP_PICKS_LIMIT) break;
    const target = p.on ? internPicked : jobsPicked;
    if (target.length < 2) add(p);
  }
  for (const p of feedPool) {
    if (picked.includes(p) || picked.length >= TOP_PICKS_LIMIT) continue;
    add(p);
  }
  for (const p of featuredPool) {
    if (picked.includes(p) || picked.length >= TOP_PICKS_LIMIT) continue;
    add(p);
  }

  return picked.map(p => p.job);
}

function renderTopPicksCard(pickedJobs, clicks) {
  if (!pickedJobs.length) return '';
  const rows = pickedJobs.map((j, i) => {
    const intern = isInternship(j);
    const link = /^https?:\/\//i.test(j.contact || '') ? j.contact : 'https://swapiki.com/#jobs';
    const clicksCount = clicks.get(j.id) || 0;
    return `
      <div style="${i > 0 ? 'border-top:1px solid #E8ECF5;' : ''}padding:9px 0;">
        <a href="${escapeHtml(link)}" style="color:#111827; font-weight:700; font-size:13px; text-decoration:none; line-height:1.35;">${escapeHtml(j.title)}</a>
        <span style="display:inline-block; margin-left:6px; padding:1px 8px; border-radius:999px; font-size:9px; font-weight:700; background:${intern ? '#FFF1F2' : '#ECFDF5'}; color:${intern ? '#E11D48' : '#047857'};">${intern ? 'INTERNSHIP' : 'JOB'}</span>
        <div style="color:#64748B; font-size:11px; margin-top:2px;">${escapeHtml(j.company || '')}${j.location ? ' · ' + escapeHtml(j.location) : ''} · ${workMode(j)}</div>
        <div style="color:#94A3B8; font-size:11px; margin-top:1px;">${j.salary ? escapeHtml(j.salary) : ''}${clicksCount > 0 ? ` · ${clicksCount} candidate${clicksCount === 1 ? '' : 's'} applied this week` : ''}</div>
      </div>`;
  }).join('');

  return `
  <div style="background:#F5F7FF; border:1px solid #E0E7FF; border-radius:12px; padding:14px 16px; margin:0 0 20px;">
    <div style="font-size:14px; font-weight:800; color:#312E81; margin:0 0 2px;">Top picks this week</div>
    <div style="font-size:11px; color:#6366F1; margin:0 0 6px;">Open jobs &amp; internships candidates are applying to</div>
    ${rows}
    <div style="padding-top:8px;">
      <a href="https://swapiki.com/#jobs" style="color:#4338CA; font-size:12px; font-weight:700; text-decoration:none;">See all openings →</a>
    </div>
  </div>`;
}

// --- Top searches card (the section every email opens with) ------------------

// Tallies the last 7 days of job-board search_events into the top terms.
// Optional: if the table/policies don't exist yet the worker still runs — it
// just renders the email without the searches card.
async function fetchTopSearches(env) {
  const since = new Date(Date.now() - CLICKS_WINDOW_DAYS * 86400000).toISOString();
  const tally = new Map();
  try {
    const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
    let offset = 0;
    for (;;) {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/search_events?select=query&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=1000&offset=${offset}`,
        { headers }
      );
      if (!res.ok) {
        console.warn('Top searches: could not fetch search_events', res.status, await res.text().catch(() => ''));
        break;
      }
      const rows = await res.json();
      for (const r of rows) {
        const q = String((r && r.query) || '').trim().toLowerCase();
        if (q.length >= 2) tally.set(q, (tally.get(q) || 0) + 1);
      }
      if (!rows || rows.length < 1000) break;
      offset += rows.length;
    }
  } catch (err) {
    console.warn('Top searches unavailable — email still sends without it', err.message);
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, TOP_SEARCHES_LIMIT);
}

function renderTopSearchesCard(topSearches) {
  if (!topSearches || !topSearches.length) return '';
  const rows = topSearches.map(([term, count], i) => `
      <div style="${i > 0 ? 'border-top:1px solid #E8ECF5;' : ''}padding:8px 0;">
        <span style="color:#0F172A; font-weight:700; font-size:13px;">&ldquo;${escapeHtml(term)}&rdquo;</span>
        <span style="color:#64748B; font-size:11px; margin-left:4px;">${count} search${count === 1 ? '' : 'es'} this week</span>
      </div>`).join('');

  return `
  <div style="background:#F0FDF4; border:1px solid #D1FAE5; border-radius:12px; padding:14px 16px; margin:0 0 20px;">
    <div style="font-size:14px; font-weight:800; color:#14532D; margin:0 0 2px;">Top job searches</div>
    <div style="font-size:11px; color:#059669; margin:0 0 6px;">What candidates are looking for this week</div>
    ${rows}
    <div style="padding-top:8px;">
      <a href="https://swapiki.com/#jobs" style="color:#047857; font-size:12px; font-weight:700; text-decoration:none;">Browse all jobs →</a>
    </div>
  </div>`;
}

// --- Email templates (the conversation) --------------------------------------

// Every email follows the same shape so the thread stays readable:
//   heading (the greeting) -> top searches first -> where you are -> next step
// The searches card is deliberately the SECOND block: it is what makes the
// email feel current, but it never replaces the reason we wrote.
//
// Copy is built per call (completion % and first name are dynamic), then
// rendered. `kind` selects the conversation beat, `variant` the rendering
// when a beat has two of them.
export function renderTemplate(kind, ctx) {
  const {
    firstName = 'there',
    completion = 0,
    steps = [],
    topSearchesHtml = '',
    topPicksHtml = ''
  } = ctx;

  const lead = (texts) =>
    texts.map(p => `<p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:#334155;">${p}</p>`).join('\n');

  const beats = {
    we_miss_you: () => ({
      subject: `It's been a few days, and your profile is still at ${completion}%`,
      heading: `Hey ${firstName}, it's Swapiki — we kept waiting for you to come back.`,
      paragraphs: [
        `Your profile is at ${completion}% right now, and a finished one is what recruiters actually open.`
      ],
      steps: [],
      showPicks: false,
      cta: { text: 'Finish your profile', url: 'https://swapiki.com/#login' },
      footerLine: 'Nothing you have done is lost — it will all be waiting when you come back.'
    }),
    progress: {
      stepping: () => ({
        subject: `You're ${completion}% there — here's exactly what's left`,
        heading: `Hey ${firstName}, quick check-in. You're at ${completion}% and on your way.`,
        paragraphs: [
          'Recruiters skim a lot of profiles. Proof-backed ones — a real project plus a voice walkthrough — are the ones they stop on.'
        ],
        steps,
        showPicks: false,
        cta: { text: 'Keep building', url: 'https://swapiki.com/#login' },
        footerLine: 'Do these in order and your profile goes live.'
      }),
      halfway: () => ({
        subject: 'Halfway there — this is the half recruiters read',
        heading: `Hey ${firstName}, you crossed the halfway mark.`,
        paragraphs: [
          'The half you have done takes the time. What is left takes minutes, and it is the half that gets your profile read.'
        ],
        steps,
        showPicks: false,
        cta: { text: 'Finish the last stretch', url: 'https://swapiki.com/#login' },
        footerLine: 'One push and it is ready for recruiters.'
      })
    },
    apply_now: {
      publish: () => ({
        subject: `Your profile's ready — one click from live`,
        heading: `Hey ${firstName}, your profile is finished. It just isn't public yet.`,
        paragraphs: [
          'You did the work: project, voice walkthrough, everything at 100%. One button separates it from recruiters.'
        ],
        steps: [],
        showPicks: true,
        cta: { text: 'Publish my profile', url: 'https://swapiki.com/#login' },
        footerLine: 'Published profiles are the only ones that reach the jobs board.'
      }),
      apply: () => ({
        subject: `Your profile's ready. It hasn't been applied anywhere yet.`,
        heading: `Hey ${firstName}, your profile is complete and live.`,
        paragraphs: [
          "Honest question: you haven't opened a single job to apply this week. You built the profile — now let it work."
        ],
        steps: [],
        showPicks: true,
        cta: { text: 'See jobs that match you', url: 'https://swapiki.com/#jobs' },
        footerLine: 'These are the openings other candidates have been clicking.'
      })
    },
    keep_fresh: () => ({
      subject: 'A quiet week on Swapiki — not much to report',
      heading: `Hey ${firstName}, just a quiet one.`,
      paragraphs: [
        'You are doing the thing that keeps a profile ranked: applying. Nothing needs fixing.'
      ],
      steps: [],
      showPicks: true,
      cta: { text: 'Browse the board', url: 'https://swapiki.com/#jobs' },
      footerLine: 'Keep your profile fresh and there is nothing else to do.'
    })
  };

  const beat = beats[kind];
  const build = typeof beat === 'function' ? beat : beat[ctx.variant] || Object.values(beat)[0];
  const b = build();

  const searchesBlock = topSearchesHtml || '';
  const picksBlock = (b.showPicks ? topPicksHtml || '' : '');
  const stepsBlock = b.steps && b.steps.length
    ? `<ol style="margin:0 0 16px 18px; padding:0; color:#334155; font-size:15px; line-height:1.7;">
        ${b.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
      </ol>`
    : '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; background-color:#F1F5F9; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9; padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#FFFFFF; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.08);">
        <tr><td style="background-color:#1E3A8A; padding:28px 32px;">
          <span style="font-size:20px; font-weight:700; color:#FFFFFF;">Swapiki</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px; font-size:22px; line-height:1.3; font-weight:700; color:#0F172A;">${b.heading}</h1>
          ${searchesBlock}
          ${lead(b.paragraphs)}
          ${stepsBlock}
          ${picksBlock}
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:8px; background-color:#1E3A8A;">
              <a href="${b.cta.url}" style="display:inline-block; padding:12px 28px; font-size:15px; font-weight:600; color:#FFFFFF; text-decoration:none;">${b.cta.text}</a>
            </td>
          </tr></table>
          <p style="margin:16px 0 0; font-size:12px; line-height:1.5; color:#64748B;">${b.footerLine}</p>
        </td></tr>
        <tr><td style="padding:20px 32px; background-color:#F8FAFC; border-top:1px solid #E2E8F0;">
          <p style="margin:0; font-size:12px; line-height:1.5; color:#94A3B8;">You're getting this because you created a Swapiki account. Questions? Reply to this email or write to
          <a href="mailto:support@swapiki.com" style="color:#2563EB; text-decoration:none;">support@swapiki.com</a>.
          Occasionally you'll get a few of these — never more than twice a week, and usually fewer.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: b.subject, html };
}

// --- Sending -----------------------------------------------------------------

async function sendViaZeptoMail(env, toEmail, toName, kind, ctx) {
  const { subject, html } = renderTemplate(kind, ctx);
  const res = await fetch(env.ZEPTOMAIL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: env.ZEPTOMAIL_TOKEN,
    },
    body: JSON.stringify({
      from: { address: env.ZEPTOMAIL_FROM_ADDRESS, name: 'Swapiki' },
      to: [{ email_address: { address: toEmail, name: toName } }],
      subject,
      htmlbody: html
    })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ZeptoMail send failed (${res.status}): ${errText}`);
  }
}

// --- Data reads --------------------------------------------------------------

async function fetchAllCandidates(env) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/candidates?select=id,user_id,email,name,expertise,is_dummy,profile_status,completion_score,updated_at,last_nudge_type,last_nudge_sent_at,created_at`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Fetching candidates failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Reads the projects table: does each candidate have any project, and does any
// of their projects have a recorded audio_url.
async function fetchProjectSignals(env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/projects?select=candidate_id,audio_url`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  });
  if (!res.ok) throw new Error(`Fetching projects failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  const candidateIdsWithProjects = new Set();
  const candidateIdsWithAudio = new Set();
  for (const r of rows) {
    candidateIdsWithProjects.add(r.candidate_id);
    if (r.audio_url) candidateIdsWithAudio.add(r.candidate_id);
  }
  return { candidateIdsWithProjects, candidateIdsWithAudio };
}

// User ids who opened any apply link in the last APPLY_WINDOW_DAYS.
async function fetchClickerUserIds(env) {
  const clickers = new Set();
  try {
    const since = new Date(Date.now() - APPLY_WINDOW_DAYS * 86400000).toISOString();
    const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
    let offset = 0;
    for (;;) {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/job_clicks?select=user_id&created_at=gte.${encodeURIComponent(since)}&limit=1000&offset=${offset}`,
        { headers }
      );
      if (!res.ok) {
        console.warn('Apply signal: could not read job_clicks', res.status, await res.text().catch(() => ''));
        break;
      }
      const rows = await res.json();
      for (const r of rows) if (r && r.user_id) clickers.add(r.user_id);
      if (!rows || rows.length < 1000) break;
      offset += rows.length;
    }
  } catch (err) {
    console.warn('Apply signal unavailable — treating nobody as applying', err.message);
  }
  return clickers;
}

async function fetchLastSignInByUserId(env) {
  const map = new Map();
  let page = 1;
  for (;;) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
    if (!res.ok) throw new Error(`Fetching auth users failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const users = data.users || [];
    users.forEach(u => map.set(u.id, u.last_sign_in_at));
    if (users.length < 1000) break;
    page += 1;
  }
  return map;
}

async function markNudged(env, candidateId, kind, variant) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/candidates?id=eq.${candidateId}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      last_nudge_type: variant ? `${kind}:${variant}` : kind,
      last_nudge_sent_at: new Date().toISOString()
    })
  });
}

// --- The runner --------------------------------------------------------------

// Exported for the tests only; the Cloudflare runtime only calls the default
// handler, which passes this straight through with a real env.
export async function runNudgeJob(env) {
  const [candidates, projectSignals, lastSignInByUserId, clickerIds, topPicksData, topSearches] = await Promise.all([
    fetchAllCandidates(env),
    fetchProjectSignals(env),
    fetchLastSignInByUserId(env),
    fetchClickerUserIds(env),
    fetchTopPicksData(env),
    fetchTopSearches(env)
  ]);
  const { candidateIdsWithProjects, candidateIdsWithAudio } = projectSignals;
  const { jobs, clicks } = topPicksData;

  let sent = 0, skipped = 0, leftAlone = 0;

  // Top searches are global (not per-candidate) — render once for all.
  const topSearchesHtml = renderTopSearchesCard(topSearches);
  const topPicksHtmlFor = (candidate) => {
    const picked = computeTopPicks(jobs, clicks, candidate);
    return renderTopPicksCard(picked, clicks);
  };

  for (const candidate of candidates) {
    const state = {
      hasEmail: !!(candidate.email && /@/.test(candidate.email)),
      isDummy: !!(candidate.is_dummy || /^dummy-/.test(candidate.id || '')),
      accountAgeDays: daysAgo(candidate.created_at),
      lastSignInDays: daysAgo(
        lastSignInByUserId.get(candidate.user_id) || candidate.created_at
      ),
      completion: percentOf(candidate),
      isPublished: candidate.profile_status === 'published',
      clickedInLastDays: clickerIds.has(candidate.user_id)
    };

    const decision = decideNextEmail(state);
    if (!decision) { leftAlone++; continue; }

    const cooldownDays = decision.kind === 'keep_fresh'
      ? KEEP_FRESH_COOLDOWN_DAYS
      : ACTION_COOLDOWN_DAYS;
    if (daysAgo(candidate.last_nudge_sent_at) < cooldownDays) { skipped++; continue; }

    const hasProject = candidateIdsWithProjects.has(candidate.id);
    const hasAudio = candidateIdsWithAudio.has(candidate.id);

    try {
      const ctx = {
        firstName: firstNameFrom(candidate),
        completion: state.completion,
        steps: remainingSteps(candidate, hasProject, hasAudio),
        isPublished: state.isPublished,
        topSearchesHtml,
        topPicksHtml: topPicksHtmlFor(candidate)
      };
      await sendViaZeptoMail(env, candidate.email, ctx.firstName, decision.kind, {
        ...ctx,
        variant: decision.variant
      });
      await markNudged(env, candidate.id, decision.kind, decision.variant);
      sent++;
      console.log(`Nudged ${candidate.email} (${decision.kind}${decision.variant ? ':' + decision.variant : ''})`);
    } catch (err) {
      console.error(`Failed to nudge candidate ${candidate.id}:`, err.message);
    }
  }

  console.log(`Lifecycle job done. Sent: ${sent}, skipped (cooldown): ${skipped}, no email needed: ${leftAlone}, total candidates: ${candidates.length}`);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runNudgeJob(env));
  },
  // Test endpoint: a plain GET runs the whole job. A GET with `?email=` sends a
  // SINGLE test email to that address (the halfway variant, which shows the
  // searches-first layout at its richest). Add `&variant=apply` for the apply
  // variant (adds the Top picks card), or `&sample=1` to preview the Top
  // searches card with demo terms when real search_events are still empty.
  async fetch(request, env) {
    const url = new URL(request.url);
    const toEmail = url.searchParams.get('email');
    if (toEmail) {
      try {
        const variant = url.searchParams.get('variant') === 'apply' ? 'apply' : 'halfway';
        const [topPicksData, topSearches] = await Promise.all([
          fetchTopPicksData(env),
          fetchTopSearches(env)
        ]);
        let searches = topSearches;
        if (url.searchParams.get('sample') === '1' && searches.length === 0) {
          searches = SAMPLE_SEARCHES;
        }
        const pickedJobs = computeTopPicks(topPicksData.jobs, topPicksData.clicks, { expertise: [] });
        const ctx = {
          firstName: 'Candidate',
          completion: variant === 'apply' ? 100 : 55,
          steps: variant === 'apply' ? [] : ['Record your two-minute voice walkthrough', 'Publish the profile'],
          isPublished: variant === 'apply',
          topSearchesHtml: renderTopSearchesCard(searches),
          topPicksHtml: renderTopPicksCard(pickedJobs, topPicksData.clicks),
          variant
        };
        await sendViaZeptoMail(env, toEmail, ctx.firstName, 'apply_now', ctx);
        return new Response(`Test email sent to ${toEmail}.`, { status: 200 });
      } catch (err) {
        console.error('Manual test send failed:', err.message);
        return new Response(`Test send failed: ${err.message}`, { status: 500 });
      }
    }
    await runNudgeJob(env);
    return new Response('Lifecycle job ran — check logs for details.');
  }
};