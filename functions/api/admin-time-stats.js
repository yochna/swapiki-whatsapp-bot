// Cloudflare Pages Function
// Route: GET /api/admin-time-stats
//
// Returns average time-spent-per-session (last 30 days), sourced from
// PostHog. This is the ONE admin stat that comes from PostHog rather than
// Supabase — session/engagement duration isn't something a database column
// can hold, but it's exactly what PostHog is built for.
//
// Two secrets, both server-side only (Cloudflare Pages → Settings →
// Environment variables), never sent to the browser:
//   - POSTHOG_PERSONAL_API_KEY  (Project Settings > Personal API Keys in PostHog,
//                                 needs "Query read" access)
//   - POSTHOG_PROJECT_ID        (Project Settings > Project ID)
// Optional:
//   - POSTHOG_HOST  (defaults to https://us.posthog.com — use
//                     https://eu.posthog.com if your project is EU-hosted)
//
// Same caller-verification pattern as admin-promote.js: identify the caller
// from their own Supabase session token, then confirm they're in the
// `admins` table, before doing anything privileged.
// SUPABASE_URL comes from the per-project environment variables (test Pages
// project → test Supabase); falls back to the production URL when unset.

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";

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

export async function onRequestGet(context) {
  const { request, env } = context;
  const SUPABASE_URL = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;

  try {
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const posthogKey = env.POSTHOG_PERSONAL_API_KEY;
    const posthogProjectId = env.POSTHOG_PROJECT_ID;
    const posthogHost = env.POSTHOG_HOST || "https://us.posthog.com";

    // TEMPORARY DEBUG: confirm exactly which env vars this deployment can
    // see at runtime, without leaking secret values. Remove this block once
    // the PostHog "configured:false" mystery is solved.
    if (new URL(request.url).searchParams.has("debug_env")) {
      return json({
        debug: true,
        has_SUPABASE_SERVICE_ROLE_KEY: !!serviceRoleKey,
        has_POSTHOG_PERSONAL_API_KEY: !!posthogKey,
        has_POSTHOG_PROJECT_ID: !!posthogProjectId,
        POSTHOG_PROJECT_ID_value: posthogProjectId || null,
        has_POSTHOG_HOST: !!env.POSTHOG_HOST,
        all_env_keys: Object.keys(env)
      }, 200);
    }

    if (!serviceRoleKey) {
      return json({ error: "Admin actions aren't configured on this deployment yet (missing service key)." }, 500);
    }
    if (!posthogKey || !posthogProjectId) {
      // Not an error the admin dashboard should hard-fail on — just means
      // this stat hasn't been set up yet. Return a clear "not configured"
      // shape instead of a 500 so the UI can show "—" for this one stat.
      return json({ configured: false }, 200);
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
    const adminCheckRes = await fetch(
      `${SUPABASE_URL}/rest/v1/admins?user_id=eq.${caller.id}&select=user_id`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    const adminCheckRows = await adminCheckRes.json();
    if (!Array.isArray(adminCheckRows) || adminCheckRows.length === 0) {
      return json({ error: "Admin access required." }, 403);
    }

    // 3. Query PostHog: average session duration (first-to-last event span
    // per $session_id) over the last 30 days, via HogQL.
    const hogql = `
      SELECT
        round(avg(duration_seconds), 0) AS avg_session_seconds,
        count() AS session_count
      FROM (
        SELECT
          properties.$session_id AS session_id,
          dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds
        FROM events
        WHERE timestamp > now() - INTERVAL 30 DAY
          AND properties.$session_id IS NOT NULL
        GROUP BY session_id
      )
    `;

    const phRes = await fetch(`${posthogHost}/api/projects/${posthogProjectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${posthogKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } })
    });

    if (!phRes.ok) {
      const errText = await phRes.text();
      return json({ error: `PostHog query failed: ${errText}` }, 502);
    }

    const phData = await phRes.json();
    const row = (phData && phData.results && phData.results[0]) || [null, 0];
    const avgSessionSeconds = row[0] === null ? null : Number(row[0]);
    const sessionCount = Number(row[1] || 0);

    return json(
      {
        configured: true,
        avg_session_seconds: avgSessionSeconds,
        session_count: sessionCount,
        window_days: 30
      },
      200
    );
  } catch (err) {
    return json({ error: (err && err.message) || "Unexpected server error." }, 500);
  }
}
