// Cloudflare Pages Function — Route: POST /api/submit-job
//
// Public job submission. Anyone can post an opening; an admin decides whether it
// reaches the board.
//
//   -> { ok: true, id, status: 'draft' }
//
// WHY A ROUTE AND NOT A CLIENT INSERT
//   The `jobs` table is admin-insert-only under RLS (jobs_board_migration.sql),
//   and that is correct: the table also holds every published row that GET /jobs
//   renders as JobPosting JSON-LD into Google's index. Loosening INSERT to
//   "anyone" would hand the internet the ability to write into a table the app
//   publishes from, so instead this route is the single public door. It writes
//   with the service role key — which bypasses RLS — and therefore has to be the
//   strictest thing in the pipeline, not the loosest.
//
// NOTHING HERE PUBLISHES
//   status and source are hardcoded below and are never read from the request
//   body. A submitter cannot make their own job live, cannot make it look like it
//   came from the vetted Adzuna feed, and cannot attach a dedupe_key to collide
//   with a real listing. Curation only ever reads source=eq.adzuna and the sweep
//   only ever retracts source=eq.adzuna, so a submission is a human's decision
//   from first insert to final verdict — no automated path can touch it.
//
// SPAM
//   This endpoint is unauthenticated by design, so it gets the same three
//   defences as /api/signup-guard: a honeypot field bots fill in, a per-IP rate
//   limit, and server-side length caps. The in-memory limiter is per-isolate and
//   best-effort — good enough to throttle bursts at pilot scale, and honest about
//   not being a guarantee.
//
//   Every submission lands in the admin's Awaiting approval list as a draft. A
//   spam flood therefore costs a human review time rather than putting spam on a
//   public job board, which is the property that matters here.

import { isMissingColumnError, rest } from "../lib/postgrest.js";
import { json } from "../lib/http.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";

/** The one value a submitter can never influence. Everything else is validated. */
const SUBMITTED_SOURCE = "user-submission";
const DRAFT = "draft";

// Caps. A job post is a paragraph, not a document: an unbounded field is an
// invitation to store a novel in one text column, and a spammer's cheapest trick.
const LIMITS = {
  title: 120,
  company: 120,
  location: 120,
  salary: 60,
  contact: 200,
  description: 2000,
  skills: 12,
  skillLength: 40
};

const CATEGORIES = new Set(["it", "bfsi", "any"]);

// Same shape as the signup guard's limiter: ip -> { count, resetAt }.
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxSubmissions: 5 };
const attempts = new Map();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function jsonWithCors(obj, status) {
  const res = json(obj, status);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

/** Trims, drops control characters, and refuses to grow past the cap. */
function clean(value, max) {
  // Control characters are stripped rather than escaped: they are never legitimate
  // in a job post, and letting them through is how a title ends up carrying a
  // newline that reflows every table cell it is rendered into.
  const s = String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Keeps a submitted contact usable without letting it smuggle a scheme.
 *
 * `contact` is free text, not a URL field: "hr@company.com", "+91 ..." and
 * "WhatsApp: 98765 43210" are the common cases, and the last of those would be
 * mistaken for a `whatsapp:` scheme by anything that guesses "is this a link?"
 * from the presence of a colon. So rather than parsing, this refuses only the
 * schemes that can execute in an href and keeps everything else verbatim.
 *
 * Anything kept here is still re-checked before it becomes a link —
 * adminJobProvenance() and GET /jobs both allow http(s) only. Storing text and
 * deciding at render time is what keeps "WhatsApp: ..." working without making
 * this the single point where a stored value is trusted.
 */
function cleanContact(value) {
  const s = clean(value, LIMITS.contact);
  if (!s) return "";
  if (/^\s*(javascript|data|vbscript|file|blob)\s*:/i.test(s)) return "";
  return s;
}

/** Comma/newline separated skills, deduped, capped in count and length. */
function cleanSkills(value) {
  const raw = Array.isArray(value) ? value : String(value == null ? "" : value).split(/[,\n]/);
  const out = [];
  for (const item of raw) {
    const s = clean(item, LIMITS.skillLength);
    if (s && !out.some(x => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= LIMITS.skills) break;
  }
  return out;
}

/**
 * Validates a submission body.
 *
 * Returns `{ row }` when the post is complete enough to review, or
 * `{ errors }` naming what is missing. A rejected submission is never partially
 * stored: a draft row missing its company is a row the admin cannot judge.
 */
export function validateSubmission(body) {
  const input = body && typeof body === "object" ? body : {};
  const errors = [];

  const title = clean(input.title, LIMITS.title);
  const company = clean(input.company, LIMITS.company);
  const location = clean(input.location, LIMITS.location);
  const salary = clean(input.salary, LIMITS.salary);
  const contact = cleanContact(input.contact);
  const description = clean(input.description, LIMITS.description);
  const skills = cleanSkills(input.skills);

  if (!title) errors.push("A job title is required.");
  if (!company) errors.push("A company name is required.");
  // A contact is how the admin reaches the poster, and how an employer reaches a
  // candidate. A post with no way to reply is not reviewable, so it is refused
  // rather than queued as something nobody can action.
  if (!contact) errors.push("An email, phone number or apply link is required.");

  const rawCategory = clean(input.category, 10).toLowerCase();
  const category = CATEGORIES.has(rawCategory) ? rawCategory : "any";
  if (rawCategory && !CATEGORIES.has(rawCategory)) {
    errors.push('Category must be "it", "bfsi" or "any".');
  }

  if (errors.length) return { errors };

  return {
    row: {
      title,
      company,
      location: location || null,
      category,
      salary: salary || null,
      contact,
      description,
      skills,
      // Provenance of a human post: what was pasted, and nothing invented.
      raw_text: clean(input.rawText, LIMITS.description),
      status: DRAFT,
      source: SUBMITTED_SOURCE,
      // Stamped so the public board's datePosted is the arrival date rather than
      // the day the page happened to be rendered.
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    }
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonWithCors({ ok: false, error: "Method not allowed." }, 405);
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return jsonWithCors({ ok: false, error: "Could not read that submission." }, 400);
  }

  // Honeypot. Answered exactly like a success so a bot learns nothing, and writes
  // nothing.
  if (String(body.honeypot || "").trim()) {
    return jsonWithCors({ ok: true, id: null, status: DRAFT }, 202);
  }

  const ip = request.headers.get("CF-Connecting-IP")
    || request.headers.get("x-forwarded-for")
    || "unknown";
  const now = Date.now();
  // Expired entries are swept before the map grows past the point where a sweep is
  // worth doing. Without this the map keeps one dead record per IP for the life of
  // the isolate, and the limiter's own bookkeeping becomes a slow leak on a
  // long-lived worker.
  if (attempts.size > 500) {
    for (const [key, value] of attempts) {
      if (value.resetAt <= now) attempts.delete(key);
    }
  }
  const rec = attempts.get(ip);
  if (rec && rec.resetAt > now) {
    if (rec.count >= RATE_LIMIT.maxSubmissions) {
      return jsonWithCors(
        { ok: false, error: "Too many submissions from this connection. Please try again later." },
        429
      );
    }
    rec.count++;
  } else {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
  }

  const { row, errors } = validateSubmission(body);
  if (errors) {
    return jsonWithCors({ ok: false, errors }, 400);
  }

  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // Loud, not silent. An unconfigured route must not look like a queue that
    // happens to be empty.
    return jsonWithCors({ ok: false, error: "Submissions are not configured on this deployment." }, 503);
  }

  // Preferred insert. `description` and `skills` are part of the original schema;
  // first_seen_at/last_seen_at were added by the ingest migration, so a project
  // that has not run it would reject the whole batch for one unknown column. That
  // is why the fallback exists and why a rejection is re-asked without them.
  let inserted;
  try {
    inserted = await rest(supabaseUrl, serviceKey, "jobs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([row])
    });
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    const { first_seen_at, last_seen_at, ...withoutFeedColumns } = row;
    inserted = await rest(supabaseUrl, serviceKey, "jobs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([withoutFeedColumns])
    });
  }

  const created = Array.isArray(inserted) ? inserted[0] : null;
  if (!created || !created.id) {
    return jsonWithCors({ ok: false, error: "Could not save that submission. Please try again." }, 502);
  }

  return jsonWithCors(
    {
      ok: true,
      id: created.id,
      status: DRAFT,
      // Said plainly, because a submitter must not be left thinking their post is
      // already on the board.
      message: "Received. An admin reviews every submission before it appears on the board."
    },
    201
  );
}
