// Cloudflare Pages Function — Route: GET /config
//
// Environment-driven configuration so ONE build can talk to ANY backend.
// Each Pages project supplies its own values via
//   Cloudflare "swapiki-test" / "swapiki" / "swapiki-prod"
//   project → Settings → Environment variables:
//     SUPABASE_URL      e.g. https://xxxx.supabase.co
//     SUPABASE_ANON_KEY the anon/publishable key for that Supabase project
//     SITE_ENV          "test" | "prod"  (optional, just for diagnostics)
//
// Values come only from Cloudflare Pages environment variables. There are no
// hardcoded production fallbacks: a deployment without SUPABASE_URL/SUPABASE_ANON_KEY
// simply returns empty values, and the client stays in local-only mode until
// real config arrives via /config. The keys are public by design
// (anon/publishable) — never put the service role key here.

export function onRequest(context) {
  const env = context.env || {};

  return new Response(JSON.stringify({
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseAnonKey: env.SUPABASE_ANON_KEY || "",
    siteEnv: env.SITE_ENV || "unknown"
  }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache"
    }
  });
}