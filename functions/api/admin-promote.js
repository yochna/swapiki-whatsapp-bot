// Cloudflare Pages Function
// Route: POST /api/admin-promote   body: { email: string }
//
// Lets an EXISTING admin grant admin access to another already-registered
// user, by email, without ever exposing the Supabase service role key to
// the browser. The service role key lives only in this server-side
// function's environment variable (SUPABASE_SERVICE_ROLE_KEY), configured
// in Cloudflare Pages → Settings → Environment variables. Never commit that
// key to code or send it to the client.
// SUPABASE_URL also comes from the same per-project environment variables, so
// the test Pages project can verify against a test Supabase; if it's unset,
// the current production project is used.

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";

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
  const SUPABASE_URL = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;

  try {
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json({ error: "Admin actions aren't configured on this deployment yet (missing service key)." }, 500);
    }

    const authHeader = request.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return json({ error: "Not authenticated." }, 401);
    }

    // 1. Identify the caller from their own session token.
    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: serviceRoleKey }
    });
    if (!callerRes.ok) {
      return json({ error: "Your session is invalid or expired. Please log in again." }, 401);
    }
    const caller = await callerRes.json();

    // 2. Confirm the caller is already a registered admin.
    const adminCheckRes = await fetch(
      `${SUPABASE_URL}/rest/v1/admins?user_id=eq.${caller.id}&select=user_id`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    const adminCheckRows = await adminCheckRes.json();
    if (!Array.isArray(adminCheckRows) || adminCheckRows.length === 0) {
      return json({ error: "Only an existing admin can promote another user to admin." }, 403);
    }

    // 3. Look up the target account by email using the Auth Admin API.
    const body = await request.json().catch(() => ({}));
    const email = (body.email || "").trim().toLowerCase();
    if (!email) {
      return json({ error: "Email is required." }, 400);
    }

    // Supabase's admin/users endpoint does NOT support filtering by email via
    // a query param — it only supports page/per_page pagination. Passing
    // ?email=... is silently ignored and just returns every user, so we have
    // to page through the results ourselves and match the email exactly.
    let targetUser = null;
    const PER_PAGE = 1000;
    for (let page = 1; page <= 20 && !targetUser; page++) {
      const lookupRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
      );
      const lookupData = await lookupRes.json().catch(() => null);
      const users = (lookupData && Array.isArray(lookupData.users) && lookupData.users) || [];
      targetUser = users.find(u => (u.email || "").toLowerCase() === email) || null;
      if (users.length < PER_PAGE) break; // last page reached
    }

    if (!targetUser) {
      return json({ error: `No Swapiki account found for ${email}. They need to sign up first.` }, 404);
    }

    // 4. Add them to the admins table (service role bypasses RLS for this insert).
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/admins`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({ user_id: targetUser.id, email: targetUser.email })
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      return json({ error: `Could not grant admin access: ${errText}` }, 500);
    }

    return json({ success: true, email: targetUser.email }, 200);
  } catch (err) {
    return json({ error: (err && err.message) || "Unexpected server error." }, 500);
  }
}
