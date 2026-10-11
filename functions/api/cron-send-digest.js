// Cloudflare Pages Function
// Route: POST /api/cron-send-digest   header: x-cron-secret: <DIGEST_CRON_SECRET>
//
// The "jobs drop" (or manually triggerable) broadcast: every Swapiki user gets
// this email at most once per their chosen cadence — fortnightly (default) or
// monthly, and never when they have unsubscribed — gated per user from the
// `digest_sends` log plus the `email_preferences` table. The scheduler may call
// the route as often as it likes; nobody receives a drop before their window is
// up. The TOP card is "Top jobs & internships" — the openings candidates
// actually clicked on most (real interest, not guesses). Per-user
// personalization: the same list is re-ranked by skill overlap with the
// candidate's own `expertise` before the top slots are picked. The footer
// carries a signed "change how often / unsubscribe" link (see lib/email-prefs.js
// and functions/unsubscribe.js).
//
// Called by the scheduler worker (step 5) with `x-cron-secret`; a manual curl
// with the same header works for testing.
//
// Environment variables (Cloudflare Pages -> Settings -> Environment variables,
// set on BOTH the test and prod projects):
//   SUPABASE_URL            (optional; falls back to the default below)
//   SUPABASE_SERVICE_ROLE_KEY  (already required for /api/admin-promote + /jobs)
//   RESEND_API_KEY             (from Resend — free tier = 3k emails/month)
//   RESEND_FROM                ("Swapiki <jobs@swapiki.com>" by default)
//   DIGEST_CRON_SECRET         (shared secret the scheduler worker sends; also
//                               used for manual curl triggers)
//
// Never commit any of these keys; they live only as Pages secrets.

import { isMissingColumnError } from "../lib/postgrest.js";
import { makeUnsubToken, unsubUrl, prefsSecret } from "../lib/email-prefs.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";
const DEFAULT_FROM = "Swapiki <jobs@swapiki.com>";
const BOARD_URL = "https://swapiki.com/jobs";
const TOP_PER_TYPE = 4;          // rows shown per card section (jobs / internships)
const CLICKS_WINDOW_DAYS = 14;   // interest window — one whole drop period
const COOLDOWN_DAYS = 14;        // a user is emailed at most once per 14 days
const MONTHLY_WINDOW_DAYS = 30;  // ... unless they chose "monthly" on /unsubscribe
const MAX_PER_RUN = 50;          // bound a single run; the rest drain on the next run
const SEND_INTERVAL_MS = 550;    // Resend allows 2 requests/second — one per 500ms, with slack
const MAX_SEND_ATTEMPTS = 4;     // a 429/5xx is retried with backoff before it is logged as failed

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function eq(a, b) {
  // Constant-time-ish string compare for the cron secret.
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const secret = env.DIGEST_CRON_SECRET;
  if (!secret) {
    return json({ error: "DIGEST_CRON_SECRET is not configured on this deployment yet." }, 503);
  }
  const got = request.headers.get("x-cron-secret") || "";
  if (!eq(got, secret)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return json({ error: "RESEND_API_KEY is not configured yet — add it to the Pages project, then trigger again." }, 503);
  }

  const SUPABASE_URL = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const svc = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    auth: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || ""}`
  };
  if (!svc.apikey) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured on this deployment yet." }, 503);
  }

  try {
    // 1. Every user's email (Auth Admin API, paginated).
    const users = [];
    const PER_PAGE = 1000;
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`,
        { headers: { apikey: svc.apikey, Authorization: svc.auth } }
      );
      const data = await res.json().catch(() => null);
      const rows = (data && Array.isArray(data.users) && data.users) || [];
      for (const u of rows) {
        if (u && u.id && u.email && /@/.test(u.email)) users.push({ id: u.id, email: u.email });
      }
      if (rows.length < PER_PAGE) break;
    }

    // 2. Candidate profiles (for a first name + skills to personalize with).
    const candRes = await fetch(
      `${SUPABASE_URL}/rest/v1/candidates?select=user_id,name,expertise`,
      { headers: { apikey: svc.apikey, Authorization: svc.auth } }
    );
    const candRows = (await candRes.json().catch(() => [])) || [];
    const byUser = new Map();
    for (const c of candRows) {
      if (!c || !c.user_id) continue;
      const props = {
        name: (c.name || "").trim(),
        expertise: Array.isArray(c.expertise) ? c.expertise.map(s => String(s).toLowerCase()) : []
      };
      byUser.set(c.user_id, props);
    }

    // 3. Published jobs (service role bypasses RLS, so we filter explicitly).
    //
    // `featured` is asked for so the studio's own openings can lead the card, and
    // retried without it when the schema predates the column: PostgREST rejects
    // the whole request for one unknown name, and this route would otherwise
    // 500 on every send until the migration was applied - taking the weekly
    // email down with it. A digest without the pin is still a digest.
    const JOB_COLUMNS =
      "id,title,company,location,category,salary,contact,skills,description,featured";
    const JOB_COLUMNS_NO_FEATURED =
      "id,title,company,location,category,salary,contact,skills,description";
    const jobsUrl = select =>
      `${SUPABASE_URL}/rest/v1/jobs?status=eq.published&select=${select}&order=created_at.desc`;
    const dbHeaders = { apikey: svc.apikey, Authorization: svc.auth };
    let jobsRes = await fetch(jobsUrl(JOB_COLUMNS), { headers: dbHeaders });
    if (!jobsRes.ok && jobsRes.status === 400) {
      const body = await jobsRes.clone().text().catch(() => "");
      if (isMissingColumnError(body)) {
        console.warn(
          "[digest] jobs.featured is not in the table; sending the card in click order. " +
            "Run supabase/swaniki_jobs_migration.sql."
        );
        jobsRes = await fetch(jobsUrl(JOB_COLUMNS_NO_FEATURED), { headers: dbHeaders });
      }
    }
    if (!jobsRes.ok) {
      return json({ error: `Could not load jobs (${jobsRes.status}).` }, 500);
    }
    const jobs = (await jobsRes.json()) || [];

    // 4. Candidate clicks over the interest window — count per job.
    const since = new Date(Date.now() - CLICKS_WINDOW_DAYS * 86400000).toISOString();
    const clicksRes = await fetch(
      `${SUPABASE_URL}/rest/v1/job_clicks?select=job_id&created_at=gte.${encodeURIComponent(since)}`,
      { headers: { apikey: svc.apikey, Authorization: svc.auth } }
    );
    const clickRows = (await clicksRes.json().catch(() => [])) || [];
    const clicks = new Map();
    for (const c of clickRows) {
      if (c && c.job_id) clicks.set(c.job_id, (clicks.get(c.job_id) || 0) + 1);
    }

    // 5. Derive type + work-mode the same way the board does.
    const isInternship = j => /\(internship\)|internship|intern\b/i.test(
      [j.salary, j.title, j.description || ''].join(' '));
    const workMode = j => {
      const text = [j.location || '', j.description || ''].join(' ');
      if (/hybrid/i.test(text)) return 'Hybrid';
      if (/remote|work from home|\bwfh\b/i.test(text)) return 'Remote / WFH';
      return 'Onsite';
    };
    const clickScore = j => clicks.get(j.id) || 0;
    // A positive reading, never a presence check: `featured` is a real boolean
    // from PostgREST, but a string "true" from an older write path is also on,
    // and the column is simply absent when the migration has not been run.
    const isFeatured = j => !!(j && (j.featured === true || j.featured === "true" || j.featured === "t"));

    for (const j of jobs) j._internship = isInternship(j);
    const jobsPool = jobs.filter(j => !j._internship);
    const internPool = jobs.filter(j => j._internship);

    // 6. Personalization: overlap between the candidate's skills and the job's.
    const skillOverlap = (cand, j) => {
      const jobSkills = (j.skills || []).map(s => String(s).toLowerCase());
      if (cand.expertise.length === 0 || jobSkills.length === 0) return 0;
      return cand.expertise.filter(s => jobSkills.includes(s)).length;
    };
    const pickTop = (pool, cand) => {
      const scored = pool
        .map(j => ({ j, score: clickScore(j) * 4 + skillOverlap(cand, j) }))
        .sort((a, b) => b.score - a.score || b.j.title.localeCompare(a.j.title));
      // The pin is applied after ranking, not folded into the score. A featured
      // role nobody has clicked yet still belongs at the top - that is what
      // featured means - and a feed row with forty clicks does not outrank it.
      // Within the pinned group the score still decides, so a candidate whose
      // skills match one of them sees that one first.
      const pinned = scored.filter(x => isFeatured(x.j));
      const rest = scored.filter(x => !isFeatured(x.j));
      return pinned.concat(rest).slice(0, TOP_PER_TYPE).map(x => x.j);
    };

    // 7. Build the email. The Top Jobs card is the first thing after the header.
    const buildCardRows = rows => {
      if (!rows.length) return "";
      return rows.map(j => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EEF2F7;">
            <div style="margin:0 0 4px;">
              <a href="${escapeHtml(j.contact || BOARD_URL)}" style="color:#111827;font-weight:700;font-size:14px;text-decoration:none;">${escapeHtml(j.title)}</a>
              <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:${j._internship ? '#FFF1F2' : '#ECFDF5'};color:${j._internship ? '#E11D48' : '#047857'};">${j._internship ? 'INTERNSHIP' : 'JOB'}</span>
            </div>
            <div style="margin:0 0 2px;color:#64748B;font-size:12px;">${escapeHtml(j.company) || ''}${j.location ? ' · ' + escapeHtml(j.location) : ''} · ${workMode(j)}</div>
            <div style="margin:0;color:#94A3B8;font-size:11px;">${j.salary ? escapeHtml(j.salary) : ''} ${clickScore(j) > 0 ? `· &hearts; ${clickScore(j)} candidate${clickScore(j) === 1 ? '' : 's'} clicked lately` : ''}</div>
          </td>
        </tr>`).join("");
    };

    const subject = "Jobs drop: the hottest jobs picked for you · Swapiki";

    const renderEmail = (candName, topJobs, topInterns, unsubHref) => {
      const firstName = (candName || "").split(/\s+/)[0] || "there";
      const jobsRows = buildCardRows(topJobs);
      const internRows = buildCardRows(topInterns);
      const sections = [];
      if (jobsRows) sections.push(`<div style="margin:0 0 6px;color:#9CA3AF;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Top jobs</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${jobsRows}</table>`);
      if (internRows) sections.push(`<div style="margin:18px 0 6px;color:#9CA3AF;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Top internships</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${internRows}</table>`);
      if (sections.length === 0) {
        sections.push(`<p style="margin:0;color:#64748B;font-size:13px;line-height:1.6;">No openings are live right now. Check the board in a couple of days — new roles are posted as they're vetted.</p>`);
      }

      return `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${subject}</title></head>
  <body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-collapse:collapse;">
          <tr><td align="center" style="padding:0 0 20px;">
            <span style="font-size:20px;font-weight:800;color:#4338CA;">Swapiki</span>
            <p style="margin:4px 0 0;color:#64748B;font-size:12px;">Jobs for proof-backed profiles</p>
          </td></tr>

          <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
            <p style="margin:0 0 4px;color:#111827;font-size:15px;font-weight:700;">Hey ${escapeHtml(firstName)},</p>
            <p style="margin:0 0 18px;color:#64748B;font-size:13px;line-height:1.6;">You're missing out on the hottest jobs. These are the openings proof-backed candidates are actually clicking and applying to right now — ranked for your skills. Tap one and your Swapiki proof profile makes the case.</p>

            <div style="border:1px solid #E0E7FF;border-radius:12px;background:#F5F7FF;padding:16px 18px;margin:0 0 20px;">
              <div style="font-size:15px;font-weight:800;color:#312E81;margin:0 0 2px;">Top jobs &amp; internships</div>
              <div style="font-size:11px;color:#6366F1;margin:0 0 12px;">Ranked by what candidates clicked on the board &middot; personalized to your skills</div>
              ${sections.join("")}
            </div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">
              <tr><td align="center">
                <a href="${BOARD_URL}" style="display:inline-block;background:#4338CA;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">Browse the full board</a>
              </td></tr>
            </table>

            <p style="margin:0 0 4px;color:#111827;font-size:13px;">Keep your profile fresh to stay ranked.</p>
            <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">Swapiki ranks openings by real candidate interest — profiles that are proof-backed (projects + a voice walkthrough) show up strongest.</p>
          </td></tr>

          <tr><td align="center" style="padding:18px 0 0;">
            <p style="margin:0;color:#94A3B8;font-size:11px;">You're getting this jobs drop because you're a Swapiki member.</p>
            <p style="margin:4px 0 0;color:#94A3B8;font-size:11px;"><a href="${unsubHref}" style="color:#94A3B8;text-decoration:underline;">Change how often you get these emails, or unsubscribe</a></p>
            <p style="margin:4px 0 0;color:#94A3B8;font-size:11px;">Update your profile anytime at <a href="${BOARD_URL}" style="color:#94A3B8;">swapiki.com</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
    };

    // 8. Email preferences: "off" stops the drops, "monthly" widens the window.
    //    A missing table (migration not run) or a missing row means the default
    //    fortnightly cadence. Read here, with the cooldown, so a change on the
    //    /unsubscribe page takes effect on the very next run.
    let prefs = new Map();
    try {
      const prefsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/email_preferences?select=user_id,digest_frequency`,
        { headers: { apikey: svc.apikey, Authorization: svc.auth } }
      );
      const prefsRows = prefsRes.ok ? ((await prefsRes.json().catch(() => [])) || []) : [];
      if (!prefsRes.ok) {
        console.warn(`[digest] preferences lookup failed (${prefsRes.status}); using the default cadence.`);
      }
      for (const row of prefsRows) {
        if (row && row.user_id && row.digest_frequency) prefs.set(row.user_id, row.digest_frequency);
      }
    } catch (err) {
      console.warn(`[digest] preferences lookup errored (${(err && err.message) || err}); using the default cadence.`);
    }

    // 8b. The cadence gate. `digest_sends` is the cooldown tracker: a user is due
    //    only when their latest successful send is at least their window old
    //    (COOLDOWN_DAYS, or MONTHLY_WINDOW_DAYS when they chose monthly), or they
    //    have never received one — and never when they are unsubscribed. Reading
    //    it here, right before sending, means the same rows the admin sees as
    //    delivery history are what enforce the cadence.
    let lastSentAt = new Map();
    try {
      const gateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/digest_sends?select=user_id,created_at&status=eq.sent&order=created_at.desc`,
        { headers: { apikey: svc.apikey, Authorization: svc.auth } }
      );
      const gateRows = gateRes.ok ? ((await gateRes.json().catch(() => [])) || []) : [];
      if (!gateRes.ok) {
        console.warn(`[digest] cooldown lookup failed (${gateRes.status}); sending as if there is no history.`);
      }
      for (const row of gateRows) {
        // Descending order: the first row seen for a user is their latest send.
        if (row && row.user_id && !lastSentAt.has(row.user_id)) {
          lastSentAt.set(row.user_id, Date.parse(row.created_at));
        }
      }
    } catch (err) {
      console.warn(`[digest] cooldown lookup errored (${(err && err.message) || err}); sending as if there is no history.`);
    }
    const gateNow = Date.now();
    const due = [];
    let unsubscribed = 0;
    for (const user of users) {
      const frequency = prefs.get(user.id) || "fortnightly";
      if (frequency === "off") { unsubscribed++; continue; }
      const windowDays = frequency === "monthly" ? MONTHLY_WINDOW_DAYS : COOLDOWN_DAYS;
      const at = lastSentAt.get(user.id);
      if (Number.isFinite(at) && gateNow - at < windowDays * 86400000) continue;
      due.push(user);
    }
    const skipped = users.length - due.length;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // 9. Send to each due user, logging each result.
    const sendOne = async (user) => {
      const cand = byUser.get(user.id) || { name: "", expertise: [] };
      const topJobs = pickTop(jobsPool, cand);
      const topInterns = pickTop(internPool, cand);
      const jobCount = topJobs.length + topInterns.length;
      const unsubHref = unsubUrl(user.id, await makeUnsubToken(user.id, prefsSecret(env)));
      const body = {
        from: env.RESEND_FROM || DEFAULT_FROM,
        to: [user.email],
        subject,
        html: renderEmail(cand.name, topJobs, topInterns, unsubHref)
      };
      // Resend allows two requests per second on every plan, so a burst of
      // parallel sends loses the overflow to 429s - the first live run dropped
      // 12 of 36 that way, and none of them had an email created. A 429/5xx (or
      // a network blip) is therefore retried with backoff, and only the final
      // failure is logged. The loop still stamps 'sent' only after a confirmed
      // 2xx, so nobody is marked done who was not emailed.
      for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
          });
          if (res.status >= 200 && res.status < 300) {
            await logSend(user.id, user.email, jobCount, "sent", null);
            return true;
          }
          const text = (await res.text().catch(() => "")).slice(0, 400);
          if ((res.status === 429 || res.status >= 500) && attempt < MAX_SEND_ATTEMPTS) {
            const retryAfter = res.headers.get("retry-after");
            const wait = retryAfter != null && Number.isFinite(Number(retryAfter))
              ? Math.max(0, Number(retryAfter) * 1000)
              : SEND_INTERVAL_MS * attempt;
            await sleep(wait);
            continue;
          }
          await logSend(user.id, user.email, jobCount, "failed", `resend ${res.status}: ${text}`);
          return false;
        } catch (err) {
          if (attempt < MAX_SEND_ATTEMPTS) {
            await sleep(SEND_INTERVAL_MS * attempt);
            continue;
          }
          await logSend(user.id, user.email, jobCount, "failed", (err && err.message) || "network error");
          return false;
        }
      }
      return false;
    };

    const logSend = async (userId, email, jobCount, status, error) => {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/digest_sends`, {
          method: "POST",
          headers: {
            apikey: svc.apikey,
            Authorization: svc.auth,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({ user_id: userId, email, job_count: jobCount, status, error: error || null })
        });
      } catch (e) { /* logging must never break the digest */ }
    };

    let sent = 0, failed = 0;
    const batch = due.slice(0, MAX_PER_RUN);
    for (let i = 0; i < batch.length; i++) {
      // Paced starts, not a burst: the per-second limit is what the first run
      // ran into. Retries of a throttled send sleep on top of this.
      if (i > 0) await sleep(SEND_INTERVAL_MS);
      (await sendOne(batch[i])) ? sent++ : failed++;
    }
    const remaining = due.length - batch.length;

    return json({ sent, failed, skipped, unsubscribed, remaining, recipients: users.length, asOf: new Date().toISOString() }, 200);
  } catch (err) {
    return json({ error: (err && err.message) || "Unexpected server error." }, 500);
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Manual trigger (no browser involvement, so no CORS/simple GET needed):
//   curl -X POST "https://<preview alias>/api/cron-send-digest" \
//        -H "x-cron-secret: <DIGEST_CRON_SECRET>"