// Cloudflare Pages Function
// Route: GET/POST /unsubscribe?u=<userId>&t=<token>
//
// The "change how often / unsubscribe" page linked from the jobs-drop email.
// The link carries a signed token (see lib/email-prefs.js), so it works without
// a login. The page offers three choices and writes them to `email_preferences`:
//
//   fortnightly  the normal drop, every two weeks (the default)
//   monthly      at most one drop a month
//   off          no jobs-drop emails at all
//
// The digest route reads the same table and honours it, so "off" genuinely stops
// the emails (good for deliverability and for the person who asked).
//
// Env: SUPABASE_URL (optional), SUPABASE_SERVICE_ROLE_KEY, and
// EMAIL_PREFS_SECRET (or DIGEST_CRON_SECRET) as the token key.

import { verifyUnsubToken, prefsSecret } from "./lib/email-prefs.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";

const CHOICES = [
  {
    value: "fortnightly",
    title: "Keep me posted — every 2 weeks",
    desc: "The usual jobs drop, so you never miss a role."
  },
  {
    value: "monthly",
    title: "Only once a month",
    desc: "A quieter summary of the freshest openings."
  },
  {
    value: "off",
    title: "Stop the job emails",
    desc: "No more jobs-drop emails. Your account stays active."
  }
];

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage({ title, inner, status = 200 }) {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <meta name="robots" content="noindex"/>
    <title>${escapeHtml(title)} · Swapiki</title>
  </head>
  <body style="margin:0;background:#F8FAFC;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr><td align="center" style="padding:0 0 20px;">
            <span style="font-size:22px;font-weight:800;color:#4338CA;">Swapiki</span>
            <p style="margin:4px 0 0;color:#64748B;font-size:12px;">Skip the bot. Get heard.</p>
          </td></tr>
          <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;padding:28px;">
            ${inner}
          </td></tr>
          <tr><td align="center" style="padding:18px 0 0;">
            <p style="margin:0;color:#94A3B8;font-size:11px;"><a href="https://swapiki.com" style="color:#94A3B8;">swapiki.com</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function errorPage(title, message, status) {
  return renderPage({
    title,
    status,
    inner: `<h1 style="margin:0 0 8px;font-size:20px;">${escapeHtml(title)}</h1>
      <p style="margin:0;color:#64748B;font-size:14px;line-height:1.6;">${escapeHtml(message)}</p>`
  });
}

function dbConfig(env) {
  const url = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

async function loadEmail(cfg, userId) {
  try {
    const res = await fetch(`${cfg.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: cfg.headers
    });
    if (!res.ok) return "";
    const user = await res.json();
    return (user && user.email) || "";
  } catch (e) {
    return "";
  }
}

async function loadFrequency(cfg, userId) {
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/email_preferences?user_id=eq.${encodeURIComponent(userId)}&select=digest_frequency`,
      { headers: cfg.headers }
    );
    if (!res.ok) return "fortnightly";
    const rows = (await res.json()) || [];
    return (rows[0] && rows[0].digest_frequency) || "fortnightly";
  } catch (e) {
    return "fortnightly";
  }
}

async function saveFrequency(cfg, userId, frequency) {
  const res = await fetch(`${cfg.url}/rest/v1/email_preferences?on_conflict=user_id`, {
    method: "POST",
    headers: {
      ...cfg.headers,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      user_id: userId,
      digest_frequency: frequency,
      updated_at: new Date().toISOString()
    })
  });
  return res.ok;
}

function authentication(context) {
  const env = context.env || {};
  const url = new URL(context.request.url);
  const userId = url.searchParams.get("u") || "";
  const token = url.searchParams.get("t") || "";
  const secret = prefsSecret(env);
  return { env, userId, token, secret };
}

function choiceForm({ userId, token, current }) {
  const rows = CHOICES.map((c) => {
    const active = c.value === current;
    return `<button type="submit" name="action" value="${c.value}"
        style="display:block;width:100%;text-align:left;cursor:pointer;margin:0 0 10px;padding:14px 16px;border-radius:12px;border:1px solid ${active ? "#4338CA" : "#E2E8F0"};background:${active ? "#F5F7FF" : "#FFFFFF"};">
        <span style="display:block;font-size:14px;font-weight:700;color:#111827;">${escapeHtml(c.title)}${active ? " · current" : ""}</span>
        <span style="display:block;margin-top:2px;font-size:12px;color:#64748B;">${escapeHtml(c.desc)}</span>
      </button>`;
  }).join("");
  return `<form method="POST" action="/unsubscribe?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}">
      ${rows}
    </form>`;
}

export async function onRequestGet(context) {
  const { env, userId, token, secret } = authentication(context);
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return errorPage("Not available", "Email preferences are not configured on this deployment yet.", 503);
  }
  if (!(await verifyUnsubToken(userId, token, secret))) {
    return errorPage("Link expired or invalid", "This link is not valid. Please use the most recent email from Swapiki.", 400);
  }
  const cfg = dbConfig(env);
  const [email, current] = await Promise.all([loadEmail(cfg, userId), loadFrequency(cfg, userId)]);
  const who = email ? ` for <strong>${escapeHtml(email)}</strong>` : "";
  return renderPage({
    title: "Email preferences",
    inner: `<h1 style="margin:0 0 6px;font-size:20px;">Job emails${who}</h1>
      <p style="margin:0 0 20px;color:#64748B;font-size:14px;line-height:1.6;">Choose how often you'd like to hear about new jobs. You can change this any time.</p>
      ${choiceForm({ userId, token, current })}`
  });
}

export async function onRequestPost(context) {
  const { env, userId, secret } = authentication(context);
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return errorPage("Not available", "Email preferences are not configured on this deployment yet.", 503);
  }
  const form = await context.request.formData();
  const token = String(form.get("t") || "");
  const action = String(form.get("action") || "");
  if (!(await verifyUnsubToken(userId, token, secret))) {
    return errorPage("Link expired or invalid", "This link is not valid. Please use the most recent email from Swapiki.", 400);
  }
  const valid = CHOICES.some((c) => c.value === action);
  if (!valid) {
    return errorPage("Could not save", "That choice was not recognised. Please try again.", 400);
  }
  const ok = await saveFrequency(dbConfig(env), userId, action);
  if (!ok) {
    return errorPage("Could not save", "Something went wrong saving your choice. Please try again in a moment.", 500);
  }
  const chosen = CHOICES.find((c) => c.value === action);
  return renderPage({
    title: "Saved",
    inner: `<h1 style="margin:0 0 6px;font-size:20px;">You're all set</h1>
      <p style="margin:0 0 6px;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(chosen.title)}</p>
      <p style="margin:0;color:#64748B;font-size:14px;line-height:1.6;">Your preference is saved. Thanks for reading, and good luck with the search.</p>`
  });
}
