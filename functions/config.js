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
// Values intentionally fall back to the production defaults so a deployment
// with no variables set still works exactly as before (hardcoded prod).
// The keys are public by design (anon/publishable) — never put the service
// role key here.

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_cpyZT7-regpFjo2qmg0uYQ_j6qwoa21";

export function onRequest(context) {
  const env = context.env || {};

  return new Response(JSON.stringify({
    supabaseUrl: env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
    siteEnv: env.SITE_ENV || "unknown"
  }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache"
    }
  });
}