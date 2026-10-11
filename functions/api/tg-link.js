const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

export async function onRequestPost(context) {
  const { request, env } = context;
  const SUPABASE_URL = env.SUPABASE_URL || "https://eusbnfgfurrmrccaxbub.supabase.co";

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return json({ error: "Not authenticated." }, 401);
    }

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, 500);
    }
    const botUsername = env.TELEGRAM_BOT_USERNAME;
    if (!botUsername) {
      return json({ error: "TELEGRAM_BOT_USERNAME is not set." }, 500);
    }

    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: serviceRoleKey }
    });
    if (!callerRes.ok) {
      return json({ error: "Your session is invalid or expired. Please log in again." }, 401);
    }
    const caller = await callerRes.json();

    const candRes = await fetch(
      `${SUPABASE_URL}/rest/v1/candidates?user_id=eq.${encodeURIComponent(caller.id)}&select=id,name,profile_status`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    const candRows = await candRes.json();
    if (!Array.isArray(candRows)) {
      return json({ error: "Could not read your profile. Please try again." }, 502);
    }
    if (candRows.length === 0) {
      return json({ error: "No candidate profile found. Create your profile first." }, 404);
    }
    const cand = candRows[0];

    const token = cryptoRandom(12);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/candidates?id=eq.${encodeURIComponent(cand.id)}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ telegram_link_token: token, telegram_link_expires_at: expiresAt })
    });
    if (!patchRes.ok) {
      return json({
        error: "Could not create deep link. Run supabase/candidates_telegram_migration.sql first."
      }, 500);
    }

    const deepLink = `https://t.me/${encodeURIComponent(botUsername)}?start=${token}`;
    return json({ token, deepLink, botUsername }, 200);
  } catch (err) {
    return json({ error: (err && err.message) || "Unexpected server error." }, 500);
  }
}

function cryptoRandom(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let out = "";
  const buf = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < len; i++) {
    out += chars[buf[i] & 0x3f];
  }
  return out;
}