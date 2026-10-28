// Cloudflare Pages Function — Route: POST /api/report-profile
//
// A visitor flags a public profile as a scam, or as someone else's work. This is
// the discovery half of the fraud response: the admin panel can already unpublish
// or delete a profile, but only ever notices one by accident. This route stores
// the report and pushes an instant Telegram alert, so a takedown can happen in
// minutes instead of whenever someone stumbles on it.
//
//   POST /api/report-profile
//   { candidate_id, reason, details?, email?, page_url? }
//   -> { ok: true, id }  |  { ok: false, error }
//
// The row is written with the SERVICE ROLE, so the browser never needs a write
// policy on profile_reports and the report lands even for a logged-out visitor.
// The Telegram ping is best-effort and runs AFTER the insert: a bot outage (or no
// Telegram configured at all) never loses a report that was already saved.
//
// ENV
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY       service role, inserts the row
//   TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID    optional; alert only if set
//
// MIGRATION
//   Needs supabase/profile_reports_migration.sql. If the table is missing the
//   route answers 503 and names it, rather than accepting a report it cannot keep
//   — a silent 200 here would be a report the admin never sees.

import { rest, isMissingColumnError } from "../lib/postgrest.js";
import { json } from "../lib/http.js";
import { sendMessage, esc } from "../lib/telegram.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";

const REASONS = new Set(["scam", "impersonation", "stolen_work", "ai_voice", "contact", "spam", "other"]);
const REASON_LABEL = {
  scam: "Scam / fraud",
  impersonation: "Fake person / stolen identity",
  stolen_work: "Stolen work or content",
  ai_voice: "AI-generated or cloned voice recording",
  contact: "Asks for money / off-platform contact",
  spam: "Spam or advertising",
  other: "Other"
};

const MAX_DETAILS = 1000;
const MAX_EMAIL = 200;
const MAX_URL = 300;

// Best-effort per-IP rate limit, per-isolate (same shape as signup-guard).
// Reports are lower-volume than signups, so the ceiling is a touch higher.
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, maxAttempts: 8 };
const attempts = new Map();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clip(value, max) {
  const s = String(value == null ? "" : value).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function looksLikeMissingTable(err) {
  const msg = String((err && err.message) || err || "");
  return isMissingColumnError(err) || /profile_reports/i.test(msg) && /(does not exist|schema cache)/i.test(msg);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const ip = request.headers.get("CF-Connecting-IP")
    || request.headers.get("x-forwarded-for") || "unknown";
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && rec.resetAt > now) {
    if (rec.count >= RATE_LIMIT.maxAttempts) {
      return json({ ok: false, error: "Too many reports from this device. Please try again later." }, 429);
    }
    rec.count++;
  } else {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
  }

  const body = await request.json().catch(() => ({}));
  const candidateId = clip(body.candidate_id, 64);
  if (!UUID_RE.test(candidateId)) {
    return json({ ok: false, error: "That profile could not be identified." }, 400);
  }

  const reason = REASONS.has(body.reason) ? body.reason : "other";
  const details = clip(body.details, MAX_DETAILS);
  const email = clip(body.email, MAX_EMAIL);
  const pageUrl = clip(body.page_url, MAX_URL);

  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json({ ok: false, error: "Reporting is not configured." }, 503);

  let inserted;
  try {
    inserted = await rest(supabaseUrl, serviceKey, "profile_reports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        candidate_id: candidateId,
        reason,
        details: details || null,
        reporter_email: email || null,
        page_url: pageUrl || null
      })
    });
  } catch (err) {
    if (looksLikeMissingTable(err)) {
      return json(
        {
          ok: false,
          error:
            "Reporting is not set up yet. Run supabase/profile_reports_migration.sql in the Supabase SQL editor."
        },
        503
      );
    }
    return json({ ok: false, error: "Could not save the report.", detail: String(err && err.message || err) }, 500);
  }

  const row = Array.isArray(inserted) ? inserted[0] : inserted;

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID) {
    const lines = [`🚩 <b>Profile reported</b>`, esc(REASON_LABEL[reason])];
    if (details) lines.push(esc(details.slice(0, 300)));
    if (email) lines.push(`Reporter: ${esc(email)}`);
    if (pageUrl) lines.push(esc(pageUrl));
    lines.push("", "Review it in the admin panel.");
    try {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_ADMIN_CHAT_ID, lines.join("\n"), { parse_mode: "HTML" });
    } catch (err) {
      // The report is already stored, so an alert failure is logged, not fatal.
      console.error(`report-profile: Telegram alert failed: ${String(err && err.message || err)}`);
    }
  }

  return json({ ok: true, id: row && row.id ? row.id : null });
}
