//   Signed-token helpers for the jobs-drop "change how often / unsubscribe" link.
//
//   The link is clicked from an email, so there is no session and no login: the
//   only thing tying the request to a user is a token in the URL. It is an HMAC
//   of the user id under a server secret, so it cannot be forged and cannot be
//   replayed for a different user. The page and the digest route share this file
//   so they agree, byte for byte, on how the token is built.
//
//   The secret is `EMAIL_PREFS_SECRET` when set, otherwise it falls back to
//   `DIGEST_CRON_SECRET` — which is already configured on the project, so the
//   link works without any new setup. Set EMAIL_PREFS_SECRET only if you want to
//   rotate the two independently.

const enc = new TextEncoder();

function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

/** The secret shared by the digest route and the /unsubscribe page. */
export function prefsSecret(env) {
  return (env && (env.EMAIL_PREFS_SECRET || env.DIGEST_CRON_SECRET)) || "";
}

/** Build the signed token for one user id. */
export async function makeUnsubToken(userId, secret) {
  if (!userId || !secret) return "";
  return base64url(await hmac(secret, `unsub:${userId}`));
}

/** Constant-time check that `token` is the valid token for `userId`. */
export async function verifyUnsubToken(userId, token, secret) {
  if (!userId || !token || !secret) return false;
  const expected = await makeUnsubToken(userId, secret);
  if (typeof token !== "string" || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}

/** The link placed in the email footer. */
export function unsubUrl(userId, token, base = "https://swapiki.com") {
  return `${base}/unsubscribe?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
}
