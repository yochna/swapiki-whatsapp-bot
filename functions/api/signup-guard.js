// Cloudflare Pages Function — Route: POST /api/signup-guard
// Called by the browser just before a Supabase signup attempt. This is the
// server-side, non-bypassable half of signup spam protection:
//   1. Honeypot — bots auto-fill invisible form fields; any value = reject.
//   2. Disposable email blocklist — the address' domain is checked.
//   3. Per-IP rate limit — best-effort in-memory sliding window (6 valid
//      attempts per 10 minutes). Cloudflare may run several worker isolates,
//      so this is per-isolate memory; it still reliably throttles burst bots
//      and is honest for pilot scale. Swap to KV for strict multi-isolate
//      limiting when volume demands it.
//
// The client ALSO checks the same blocklist for instant UX (see
// isDisposableEmail in js/app.js) — this endpoint is the enforcement point.

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
  'guerrillamail.com', 'guerrillamail.org', 'guerrillamail.net', 'guerrillamail.info',
  'guerrillamail.biz', 'guerrilla-mail.com', 'grr.la', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'temp-mail.org', 'temp-mail.io', 'tempmail.top',
  'throwawaymail.com', 'trashmail.com', 'trash-mail.com', 'trashymail.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'yopmail.org',
  'maildrop.cc', 'mailnesia.com', 'dispostable.com', 'mailcatch.com',
  'getnada.com', 'nada.email', 'dropmail.me', 'mailsac.com', 'tempail.com',
  'temporary-mail.net', 'tempsky.net', 'emailnator.com', 'moakt.com', 'moakt.co',
  'fakemail.net', 'femail.com', 'quickinbox.com', 'harakirimail.com',
  'discard.email', 'discardmail.com', 'discardmail.de', 'spambox.us', 'spambox.me',
  'burner.email', 'jetable.com', '33mail.com', 'spamgourmet.com', 'mytrashmail.com',
  'mailmetrash.com', 'wuzupmail.com', 'freeml.net', 'zemail.eu', 'inboxbear.com'
]);

const RATE_LIMIT = { windowMs: 10 * 60 * 1000, maxAttempts: 6 };

// ip -> { count, resetAt }  (in-memory, per-isolate — see header comment)
const attempts = new Map();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

function isDisposable(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at < 0) return false;
  const domain = String(email).slice(at + 1).toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim();
  const honeypot = String(body.honeypot || '').trim();

  // 1. Honeypot — silent reject; don't admit how we caught it.
  if (honeypot) {
    return json({ allowed: false, reason: 'honeypot' });
  }

  // 2. Disposable email blocklist.
  if (isDisposable(email)) {
    return json({ allowed: false, reason: 'disposable' });
  }

  // 3. Per-IP rate limit.
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && rec.resetAt > now) {
    if (rec.count >= RATE_LIMIT.maxAttempts) {
      return json({ allowed: false, reason: 'rate_limit' });
    }
    rec.count++;
  } else {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
  }

  return json({ allowed: true });
}