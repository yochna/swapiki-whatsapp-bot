// Cloudflare Pages Function
// Route: GET /api/admin-jobs-stats
//
// The numbers behind the Swapiki Jobs admin: how many people used the resume
// tool, how many used interview prep, how many clicked through to apply, which
// listings earned the interest, how many times a public profile was opened and
// where those visits came from, and what candidates are searching for.
//
// WHY THIS READS SUPABASE DIRECTLY RATHER THAN AN RPC
// All four tables here are already the record of truth, written by code that had
// to exist anyway:
//
//   tool_usage     - one row per account per day per distinct job post that used
//                    the resume draft or interview prep (claim_tool_usage()).
//   job_clicks     - one row per account per job per day where the candidate
//                    actually tapped "Apply on the job site" (recordJobClick()).
//   share_events   - one row per profile open, type='view'. The table was
//                    originally created for share clicks and its own schema
//                    comment calls it an analytics log for "profile views/shares";
//                    until now only the share types were ever written, which is
//                    why nobody could answer "how many people opened a profile".
//   search_events  - one row per search, already collected to power the trending
//                    card in the weekly nudge email, and never shown to an admin.
//
// tool_usage has RLS of "owners read their own rows", which is right for the
// candidate-facing allowance meter and wrong here: an admin cannot count what
// they cannot select. The obvious fix is a SECURITY DEFINER aggregate function,
// but that means a migration, and migrations need database credentials this
// project does not have in CI. The service-role key already required by
// /api/admin-promote and /api/jobs bypasses RLS, so the same admin check plus
// this key answers the question today with no schema change at all. If the
// numbers ever grow enough that aggregating in JS stops being reasonable, the
// replacement is one RPC and one call site, not a redesign.
//
// NOTHING IS INVENTED HERE. Everything reported is a count of rows that were
// written when someone did something. Nothing is inferred. In particular there
// is no unique-visitor figure: share_events has no viewer column, so the
// headline is "profile opens", labelled as such, and the referrer split carries
// the "where did they come from" question instead.
//
// EACH SOURCE FAILS ON ITS OWN. tool_usage only exists once
// supabase/tool_usage_migration.sql has been run, and until it has, the resume
// and interview figures are honestly "not set up" rather than a zero that looks
// like "nobody used the resume". One missing table must not blank the figures
// next to it, so all four are fetched independently and each carries its own
// `available` flag.
//
// Environment variables (Cloudflare Pages -> Settings -> Environment variables):
//   SUPABASE_URL                 (optional; falls back to the default below)
//   SUPABASE_SERVICE_ROLE_KEY    (already required by /api/admin-promote)
//
// Caller verification is the same pattern as admin-time-stats.js: identify the
// caller from their own Supabase session token, then confirm they are in the
// `admins` table, before any privileged read.

import { rest } from "../lib/postgrest.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";

// The window every figure is measured over, and the number of days returned in
// the daily series. Thirty days is long enough to see a weekly rhythm in the
// digest-driven click pattern and short enough that the row scan stays small.
const WINDOW_DAYS = 30;

// How many rows one source may contribute before the answer is marked capped.
// The daily job-post allowance is five per account, so 30 days of real traffic
// is a few thousand rows. This is a ceiling against a runaway table, not an
// expected size - and hitting it is REPORTED rather than silently truncating a
// total into a smaller, wronger number.
const ROW_CAP = 50000;

// How many listings the "most clicked" table shows.
const TOP_JOBS = 10;

// How many profiles the "most viewed" table shows.
const TOP_PROFILES = 8;

// How many search terms the "top searches" table shows.
const TOP_SEARCHES = 10;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

/** An ISO date `days` ago, in UTC, as YYYY-MM-DD. */
function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/**
 * Turns raw rows into the shape the dashboard draws.
 *
 * Split out from the request handler and kept free of fetch/env so it can be
 * tested directly: the counting rules (what counts as "a person" versus "a use",
 * how a day with no rows still appears in the series) are the part that is easy
 * to get subtly wrong, and they should not need a database to check.
 *
 * @param {any[]} toolRows rows of {tool, user_id, job_id, usage_day}
 * @param {any[]} clickRows rows of {job_id, user_id, day}
 * @returns {object}
 */
export function summarise(toolRows, clickRows) {
  const tools = Array.isArray(toolRows) ? toolRows : [];
  const clicks = Array.isArray(clickRows) ? clickRows : [];

  // Per-tool totals, plus the distinct people behind them. "12 uses" and
  // "9 people" answer different questions - a tool used once each by nine people
  // and a tool used twelve times by one person are the same twelve and nowhere
  // near the same traction - so both are reported rather than one being chosen
  // as "the" number.
  const perTool = {};
  const toolUsers = { resume: new Set(), interview: new Set() };
  const toolJobs = { resume: new Set(), interview: new Set() };

  for (const r of tools) {
    const tool = r && r.tool;
    if (tool !== "resume" && tool !== "interview") continue;
    if (!perTool[tool]) perTool[tool] = { uses: 0, users: new Set(), jobs: new Set() };
    perTool[tool].uses += 1;
    if (r.user_id) perTool[tool].users.add(r.user_id);
    if (r.job_id) perTool[tool].jobs.add(r.job_id);
    toolUsers[tool] = perTool[tool].users;
    toolJobs[tool] = perTool[tool].jobs;
  }

  // Clicks, counted per person per job per day by the writer's unique key, so a
  // candidate cannot inflate a listing by refreshing. Distinct users and jobs
  // are tracked separately for the same reason as above.
  const clickUsers = new Set();
  const perJob = new Map();
  for (const c of clicks) {
    const id = c && c.job_id;
    if (!id) continue;
    if (c.user_id) clickUsers.add(c.user_id);
    perJob.set(id, (perJob.get(id) || 0) + 1);
  }

  const ranked = Array.from(perJob.entries())
    .map(([job_id, clicks]) => ({ job_id, clicks }))
    .sort((a, b) => b.clicks - a.clicks || a.job_id.localeCompare(b.job_id));

  return {
    resume: { uses: (perTool.resume && perTool.resume.uses) || 0, users: toolUsers.resume.size, jobs: toolJobs.resume.size },
    interview: { uses: (perTool.interview && perTool.interview.uses) || 0, users: toolUsers.interview.size, jobs: toolJobs.interview.size },
    clicks: { total: clicks.length, users: clickUsers.size, jobs: perJob.size },
    ranked
  };
}

/**
 * Builds a dense daily series covering the window.
 *
 * Days with no rows are present with a zero rather than omitted. A sparse
 * series would make the chart's x-axis lie about the interval, and an omitted
 * day reads as missing data instead of "nobody did anything that day".
 *
 * @param {any[]} rows
 * @param {string} field the date column on each row
 * @returns {{day: string, count: number}[]}
 */
export function dailySeries(rows, field, days = WINDOW_DAYS) {
  const counts = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const d = r && r[field];
    if (typeof d === "string" && d) counts.set(d.slice(0, 10), (counts.get(d.slice(0, 10)) || 0) + 1);
  }
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = isoDaysAgo(i);
    out.push({ day, count: counts.get(day) || 0 });
  }
  return out;
}

/**
 * Buckets a raw referrer into the handful of sources worth acting on.
 *
 * Two decisions here are deliberate rather than incidental:
 *
 *  1. LOCALHOST AND DEV HOSTS BECOME "Local / dev", NOT A REAL SOURCE. The team
 *     checking a profile link must not show up as the site's biggest referrer
 *     and quietly inflate the traffic panel they are trying to trust.
 *
 *  2. UNRECOGNISED HOSTS KEEP THEIR HOSTNAME. "Some blog post nobody remembers"
 *     is exactly the kind of thing that turns into a placement, so the hostname
 *     is preserved rather than flattened into "other". search_events and
 *     share_events are append-only, so keeping the raw value costs nothing and
 *     loses nothing.
 *
 * Kept separate from summariseViews() so the mapping itself is testable without
 * a database.
 *
 * @param {string} referrer
 * @returns {string}
 */
export function referrerBucket(referrer) {
  const raw = String(referrer == null ? "" : referrer).trim();
  if (!raw) return "Direct / link shared";

  let host = raw.toLowerCase();
  // Some referrers arrive as a bare host ("linkedin.com"), others as a full URL.
  // Guard the parse so a malformed value degrades to the raw string instead of
  // throwing inside an analytics aggregation.
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch (e) {
    host = raw.toLowerCase().replace(/^www\./, "");
  }
  host = host.replace(/^www\./, "");

  if (!host || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".localhost")) {
    return "Local / dev";
  }

  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("whatsapp")) return "WhatsApp";
  if (host.includes("twitter") || host === "x.com" || host.includes("t.co")) return "X / Twitter";
  if (host.includes("google")) return "Google";
  if (host.includes("bing")) return "Bing";
  if (host.includes("duckduckgo")) return "DuckDuckGo";
  if (host === "swapiki.com" || host.endsWith(".swapiki.com")) return "Swapiki";
  // Telegram previews and in-app browsers append their own path segments.
  if (host.includes("telegram")) return "Telegram";
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("youtube")) return "YouTube";
  if (host.includes("reddit")) return "Reddit";

  return host;
}

/**
 * Counts public-profile views, and the channels they arrived through.
 *
 * "Total views" is a count of rows, which is the only thing these rows can
 * honestly answer: the table stores no viewer identifier, so a distinct-visitor
 * figure would have to be invented. Rather than report a number that looks like
 * "people reached" while actually counting reloads, the dashboard shows raw
 * views and leans on the referrer split for the actionable read.
 *
 * @param {any[]} viewRows rows of {candidate_id, referrer, created_at}
 * @returns {{total: number, profiles: number, ranked: object[], referrers: object[]}}
 */
export function summariseViews(viewRows) {
  const rows = Array.isArray(viewRows) ? viewRows : [];
  const perProfile = new Map();
  const perReferrer = new Map();
  let counted = 0;

  for (const r of rows) {
    // A row with no candidate_id is not a view of anything. Counting raw
    // rows.length would let a malformed row inflate the headline number, so the
    // total counts rows that named a profile — the same rows that are ranked.
    const id = r && r.candidate_id;
    if (!id) continue;
    counted += 1;
    perProfile.set(id, (perProfile.get(id) || 0) + 1);
    const bucket = referrerBucket(r.referrer);
    perReferrer.set(bucket, (perReferrer.get(bucket) || 0) + 1);
  }

  const ranked = Array.from(perProfile.entries())
    .map(([candidate_id, views]) => ({ candidate_id, views }))
    .sort((a, b) => b.views - a.views || String(a.candidate_id).localeCompare(String(b.candidate_id)));

  const referrers = Array.from(perReferrer.entries())
    .map(([source, views]) => ({ source, views }))
    .sort((a, b) => b.views - a.views || a.source.localeCompare(b.source));

  return { total: counted, profiles: perProfile.size, ranked, referrers };
}

/**
 * Ranks search terms, collapsing repeats of the same term.
 *
 * search_events is written as the candidate types, so the raw row count is
 * keystrokes-that-survived-throttling, not searches. Reporting it raw would say
 * someone searched for "react" 400 times when they searched for it 40 times.
 * Rows are therefore folded to one entry per term per day, which is the closest
 * honest approximation to "how many separate occasions was this looked for"
 * that the stored data supports - and `occurrences` is returned alongside it so
 * the dashboard can show the real row count rather than hiding it.
 *
 * Blank terms are dropped: the store already refuses to log an empty query, so
 * one here means noise, and "no one searched for ''" is not a finding.
 *
 * @param {any[]} searchRows rows of {query, created_at}
 */
export function summariseSearches(searchRows) {
  const rows = Array.isArray(searchRows) ? searchRows : [];
  const occurrences = new Map();
  const days = new Map();

  for (const r of rows) {
    const term = r && typeof r.query === "string" ? r.query.trim() : "";
    if (!term) continue;
    const key = term.toLowerCase();
    occurrences.set(key, (occurrences.get(key) || 0) + 1);
    const day = typeof r.created_at === "string" ? r.created_at.slice(0, 10) : "";
    if (day) {
      if (!days.has(key)) days.set(key, new Set());
      days.get(key).add(day);
    }
  }

  const ranked = Array.from(occurrences.entries())
    .map(([key, count]) => ({
      query: key,
      occurrences: count,
      days: (days.get(key) && days.get(key).size) || 0
    }))
    .sort((a, b) => b.days - a.days || b.occurrences - a.occurrences || a.query.localeCompare(b.query));

  return { total: occurrences.size, terms: rows.length, ranked };
}

/**
 * Fetches one table, answering "not set up" instead of throwing.
 *
 * A missing table is a deployment state, not a bug, and the caller renders it as
 * an honest "not set up yet" rather than a zero. Every other failure is a real
 * error and propagates, because silently reporting "no usage" when the database
 * is unreachable is the failure mode this whole file is written against.
 *
 * @returns {Promise<{rows: any[]|null, error: Error|null, capped: boolean}>}
 */
async function fetchSource(url, key, path) {
  try {
    const rows = await rest(url, key, path);
    const list = Array.isArray(rows) ? rows : [];
    return { rows: list, error: null, capped: list.length >= ROW_CAP };
  } catch (err) {
    const msg = String((err && err.message) || err || "");
    const missing = /\b42P01\b/.test(msg) || /relation .* does not exist/i.test(msg) || /\bPGRST205\b/.test(msg);
    return { rows: missing ? null : [], error: missing ? null : err, capped: false };
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const SUPABASE_URL = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;

  try {
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json({ error: "Admin actions aren't configured on this deployment yet (missing service key)." }, 500);
    }

    // 1. Identify the caller from their own session token.
    const authHeader = request.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return json({ error: "Not authenticated." }, 401);
    }

    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: serviceRoleKey }
    });
    if (!callerRes.ok) {
      return json({ error: "Your session is invalid or expired. Please log in again." }, 401);
    }
    const caller = await callerRes.json();

    // 2. Confirm the caller is a registered admin.
    const adminRows = await rest(
      SUPABASE_URL,
      serviceRoleKey,
      `admins?user_id=eq.${caller.id}&select=user_id`
    );
    if (!Array.isArray(adminRows) || adminRows.length === 0) {
      return json({ error: "Admin access required." }, 403);
    }

    const since = isoDaysAgo(WINDOW_DAYS);
    const cap = `&limit=${ROW_CAP}`;
    // created_at is a timestamptz, not a date, so the lower bound carries an
    // explicit time. Comparing against a bare date would drop the boundary day's
    // views and searches rather than including them.
    const sinceTs = `${since}T00:00:00Z`;

    // Four independent sources: one being un-migrated must not hide the others.
    // None is allowed to fail the request, so all four settle into a shape the
    // dashboard can render either way.
    const [toolRes, clickRes, viewRes, searchRes] = await Promise.all([
      fetchSource(SUPABASE_URL, serviceRoleKey, `tool_usage?select=tool,user_id,job_id,usage_day&usage_day=gte.${since}${cap}`),
      fetchSource(SUPABASE_URL, serviceRoleKey, `job_clicks?select=job_id,user_id,day&day=gte.${since}${cap}`),
      // Only type='view'. The share_events table is shared with share clicks,
      // and counting those as profile views would inflate the headline number.
      fetchSource(SUPABASE_URL, serviceRoleKey, `share_events?select=candidate_id,referrer,created_at&type=eq.view&created_at=gte.${sinceTs}${cap}`),
      fetchSource(SUPABASE_URL, serviceRoleKey, `search_events?select=query,created_at&created_at=gte.${sinceTs}${cap}`)
    ]);

    if (toolRes.error) throw toolRes.error;
    if (clickRes.error) throw clickRes.error;
    if (viewRes.error) throw viewRes.error;
    if (searchRes.error) throw searchRes.error;

    const toolRows = toolRes.rows || [];
    const clickRows = clickRes.rows || [];
    const viewRows = viewRes.rows || [];
    const searchRows = searchRes.rows || [];
    const totals = summarise(toolRows, clickRows);
    const viewTotals = summariseViews(viewRows);
    const searchTotals = summariseSearches(searchRows);

    // Only the listings that actually earned clicks are looked up. Pulling the
    // whole board to label ten rows would be the larger query of the two.
    const topIds = totals.ranked.slice(0, TOP_JOBS).map(r => r.job_id);
    let topJobs = [];
    if (topIds.length) {
      const jobRows = await rest(
        SUPABASE_URL,
        serviceRoleKey,
        `jobs?select=id,title,company,status&id=in.(${topIds.join(",")})`
      );
      const byId = new Map((Array.isArray(jobRows) ? jobRows : []).map(j => [j.id, j]));
      topJobs = totals.ranked.slice(0, TOP_JOBS).map(r => {
        const job = byId.get(r.job_id);
        return {
          job_id: r.job_id,
          clicks: r.clicks,
          // A listing that has since been deleted is still a real click, so the
          // row is kept and labelled rather than dropped from the total.
          title: (job && job.title) || "(listing no longer on the board)",
          company: (job && job.company) || "-",
          status: (job && job.status) || "unknown"
        };
      });
    }

    // Same reasoning for the most-viewed profiles: label the top handful rather
    // than pulling the whole candidate table to put a name on eight rows.
    const topProfileIds = viewTotals.ranked.slice(0, TOP_PROFILES).map(r => r.candidate_id);
    let topProfiles = [];
    if (topProfileIds.length) {
      const profileRows = await rest(
        SUPABASE_URL,
        serviceRoleKey,
        `candidates?select=id,username,name,title&id=in.(${topProfileIds.join(",")})`
      );
      const byProfileId = new Map((Array.isArray(profileRows) ? profileRows : []).map(p => [p.id, p]));
      topProfiles = viewTotals.ranked.slice(0, TOP_PROFILES).map(r => {
        const p = byProfileId.get(r.candidate_id);
        return {
          candidate_id: r.candidate_id,
          views: r.views,
          username: (p && p.username) || "",
          name: (p && p.name) || "",
          title: (p && p.title) || ""
        };
      });
    }

    return json(
      {
        configured: true,
        window_days: WINDOW_DAYS,
        tools: {
          // available=false means "the table isn't there yet", which the UI must
          // not render as zero uses.
          available: toolRes.rows !== null,
          resume: totals.resume,
          interview: totals.interview,
          daily: dailySeries(toolRows, "usage_day")
        },
        clicks: {
          available: clickRes.rows !== null,
          total: totals.clicks.total,
          users: totals.clicks.users,
          jobs: totals.clicks.jobs,
          daily: dailySeries(clickRows, "day"),
          top_jobs: topJobs
        },
        // "How many people came to the page." Total views is a count of view rows,
        // NOT a distinct-visitor count - share_events has no viewer column, so a
        // unique figure would be fiction. The UI says so rather than implying
        // otherwise. `refs` is where the actionable signal is: it shows which
        // channel actually produced the visits.
        traffic: {
          available: viewRes.rows !== null,
          total: viewTotals.total,
          profiles: viewTotals.profiles,
          daily: dailySeries(viewRows, "created_at"),
          top_profiles: topProfiles,
          referrers: viewTotals.referrers.slice(0, 8),
          note: "Total counts profile opens, not unique visitors."
        },
        // search_events has been collecting this all along for the nudge
        // emails' trending card, and had never been shown to an admin.
        searches: {
          available: searchRes.rows !== null,
          terms: searchTotals.total,
          rows: searchTotals.terms,
          top: searchTotals.ranked.slice(0, TOP_SEARCHES)
        },
        // Surfaced rather than swallowed: a capped scan is a smaller number than
        // the truth, and the dashboard says so next to the figure.
        capped: toolRes.capped || clickRes.capped || viewRes.capped || searchRes.capped
      },
      200
    );
  } catch (err) {
    return json({ error: (err && err.message) || "Unexpected server error." }, 500);
  }
}