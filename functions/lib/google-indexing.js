// Google Indexing API submission for freshly published job pages.
//
// functions/lib/indexnow.js already tells Bing, Yandex, Seznam and Naver about a
// new job. Google does not participate in that protocol - it still finds pages
// through /sitemap.xml, but a sitemap pass is measured in days or weeks. Google
// publishes this API separately, and it answers in hours. It is officially
// supported only for JobPosting and LiveStream events, which is exactly what
// this site serves - see functions/jobs/[slug].js.
//
// Two things make it different from IndexNow, and both are load-bearing:
//
// 1. Each publish request names exactly ONE url, so a batch of N jobs is N
//    requests rather than one POST.
// 2. The quota is 200 requests per day per project. That quota, not latency, is
//    the whole design constraint here: the batch is capped, taken newest-first,
//    and a 429 is returned as data instead of thrown, because a run that
//    published two hundred jobs must not fail because a search engine was full.
//
// The credential is a Google service-account JSON key - a private key, and so a
// secret. It is read only from the GOOGLE_INDEXING_SERVICE_ACCOUNT page secret
// and is never written to a file, a log line or config.js. The Indexing API
// key, by contrast, is published by design: see functions/lib/indexnow.js.

import { jobPageUrl } from "./indexnow.js";

export const GOOGLE_INDEXING_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";

/** Google's quota for urlNotifications:publish, per day, per project. */
export const GOOGLE_DAILY_QUOTA = 200;

/**
 * How many urls a single run may ping.
 *
 * The scheduler runs every other hour - twelve times a day - so this is the
 * largest whole number that cannot exceed GOOGLE_DAILY_QUOTA across a full day:
 * 12 x 15 = 180, with room to spare for a retry or an out-of-band call. Lowering
 * it is always safe; raising it above 16 is not.
 */
export const MAX_PINGS_PER_RUN = 15;

// The job rows are usually written newest-first, but "usually" is not a
// guarantee, and a quota spent on the oldest listings helps least. The sort is
// defensive: rows without a usable timestamp keep their given order and the
// newest ones still come first when there is one.
const publishedAt = (job) => {
  const raw = job && (job.published_at || job.created_at || job.updated_at);
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : 0;
};

const newestFirst = (jobs) =>
  [...jobs].sort((a, b) => publishedAt(b) - publishedAt(a));

// --- base64url, written against the Web Crypto primitives this codebase
// already uses (functions/lib/email-prefs.js) so the module works in Pages
// Functions and in a Worker alike, with no node: dependency.

const enc = new TextEncoder();

const toBase64Url = (input) => {
  const bytes = typeof input === "string" ? enc.encode(input) : new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value) => {
  let b64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  // atob rejects a short final block; both the PEM armour and base64url signatures
  // can arrive unpadded depending on the encoder that produced them.
  b64 += "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

/** Strips the PEM armour, leaving the DER bytes the pkcs8 importer expects. */
const pemToDer = (pem) => {
  const b64 = String(pem)
    .replace(/-----BEGIN[^-]*-----/g, "")
    .replace(/-----END[^-]*-----/g, "")
    .replace(/\s+/g, "");
  return fromBase64Url(b64);
};

/**
 * Reads the service-account key out of the page secret.
 *
 * Returns null for a missing or malformed key rather than throwing, so a route
 * that has not been configured yet simply skips the ping - the ingest that
 * produced the urls must never fail because a secret was forgotten.
 */
export const parseServiceAccount = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { client_email, private_key, private_key_id } = parsed;
  if (!client_email || !private_key) return null;
  return { client_email, private_key, private_key_id: private_key_id || null };
};

/** The exact body the publish endpoint expects. Pure, so tests need no network. */
export const buildIndexingPayload = (url) => ({ url, type: "URL_UPDATED" });

/**
 * Exchanges a service-account key for an OAuth access token (RS256 JWT grant).
 *
 * Tokens are cached in module memory for their lifetime, which matters because
 * a batch is N requests and every request would otherwise cost another round
 * trip - and the cache is per isolate, so nothing sensitive outlives the request
 * that read it.
 */
let tokenCache = { token: null, expiresAt: 0 };

export const resetTokenCache = () => {
  tokenCache = { token: null, expiresAt: 0 };
};

export async function getAccessToken(serviceAccount, { fetchImpl = fetch } = {}) {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt - now > 60_000) return tokenCache.token;

  const issuedAt = Math.floor(now / 1000);
  const claims = {
    iss: serviceAccount.client_email,
    scope: GOOGLE_INDEXING_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  };
  const header = { alg: "RS256", typ: "JWT", kid: serviceAccount.private_key_id || undefined };
  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signingInput));
  const assertion = `${signingInput}.${toBase64Url(signature)}`;

  const res = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(assertion)}`
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`google token: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  }
  tokenCache = {
    token: data.access_token,
    // expires_in is 3600; the buffer keeps a long batch from going stale midway.
    expiresAt: now + ((data.expires_in || 3600) - 60) * 1000
  };
  return tokenCache.token;
}

/**
 * Tell Google that a batch of just-published jobs is new.
 *
 * Best-effort by design, and never throws: indexing is owed to search engines,
 * not to this product, so a missing secret, a rate limit, a 403 from a
 * mis-shared Search Console property or a network failure are all returned as
 * data on `curation.googleIndexing` for the caller to log. Anything thrown here
 * would take down the publication that already succeeded without it.
 *
 * Shape mirrors pingIndexNow, so the ingest calls both the same way.
 */
export async function pingGoogleIndexing(jobs, { env = {}, fetchImpl = fetch } = {}) {
  const raw = env && env.GOOGLE_INDEXING_SERVICE_ACCOUNT;
  if (!raw) return { submitted: 0, skipped: true, reason: "not configured" };

  const serviceAccount = parseServiceAccount(raw);
  if (!serviceAccount) {
    // Set but unreadable is a misconfiguration, not an absence - a truncated or
    // re-encoded key would otherwise skip every ping forever looking healthy.
    // Returning it as an error puts it on curation.errors, where ingest reports
    // it, instead of leaving the site silently unbroadcast.
    return { submitted: 0, error: "GOOGLE_INDEXING_SERVICE_ACCOUNT is set but is not a readable service-account key" };
  }

  const jobsWithId = (Array.isArray(jobs) ? jobs : []).filter((job) => job && job.id);
  if (!jobsWithId.length) return { submitted: 0, skipped: true, reason: "no urls" };

  const urls = [...new Set(newestFirst(jobsWithId).map(jobPageUrl).filter(Boolean))];
  const batch = urls.slice(0, MAX_PINGS_PER_RUN);

  let token;
  try {
    token = await getAccessToken(serviceAccount, { fetchImpl });
  } catch (err) {
    return { submitted: 0, error: String((err && err.message) || err) };
  }

  let submitted = 0;
  let status = null;
  const errors = [];

  for (const url of batch) {
    try {
      const res = await fetchImpl(GOOGLE_INDEXING_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildIndexingPayload(url))
      });
      status = res.status;
      if (res.ok) {
        submitted += 1;
        continue;
      }
      const text = await res.text().catch(() => "");
      errors.push(`${res.status} ${text.slice(0, 200)}`);
      // 429 means the daily quota is spent and 403 means Google is refusing the
      // property outright. Either way the next 14 requests fail identically, so
      // stop rather than burn the rest of the batch recording the same refusal.
      if (res.status === 429 || res.status === 403) break;
    } catch (err) {
      errors.push(String((err && err.message) || err));
      break;
    }
  }

  return {
    submitted,
    attempted: batch.length,
    status,
    truncated: urls.length > batch.length,
    ...(errors.length ? { errors } : {})
  };
}
