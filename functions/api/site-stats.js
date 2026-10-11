// Cloudflare Pages Function — Route: GET /api/site-stats
//
// The small set of real, count-of-rows numbers the landing page and the jobs
// board may display: how many profiles exist, how many are published, how many
// were published or updated this week, and how many jobs are live.
//
// WHY THIS EXISTS AS ITS OWN ENDPOINT
// The landing page and the jobs board are static HTML. To show a live figure
// they would otherwise each fetch Supabase directly with the public key, which
// means shipping a database query into the browser and reading the jobs table on
// the public path (whose RLS is admin-only). Doing it here keeps one query shape,
// one cache header and one place that decides what is safe to publish.
//
// HONESTY IS THE WHOLE POINT. Every figure is a count of rows that exist. A
// value that cannot be read is returned as null, and the client hides that cell
// rather than rendering a zero that reads as "nobody has done this". See
// lib/site-stats.js for the counting rules.
//
// Public by design, so no auth: the numbers are aggregates over data the site
// already shows one row at a time (published profiles on their subdomains,
// published jobs on /jobs). It is cached at the edge for the same reason - it is
// not per-user and must not be a database hit on every landing-page load.
//
// Environment variables (Cloudflare Pages -> Settings -> Environment variables):
//   SUPABASE_URL                 (optional; falls back to the default below)
//   SUPABASE_SERVICE_ROLE_KEY    (optional; preferred so the jobs count is
//                                 available; the candidate count works with the
//                                 anon key when it is absent)
//   SUPABASE_ANON_KEY            (fallback key for the candidate read)

import { fetchSiteStats } from "../lib/site-stats.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";

export async function onRequestGet({ env }) {
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  // Prefer the service key: it can read the jobs table, and using one key keeps
  // the two counts consistent. Without it the candidate figures still resolve
  // and the job count comes back null, which the client hides.
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "";

  const stats = await fetchSiteStats(supabaseUrl, key);

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: {
      "Content-Type": "application/json",
      // Public and slow-changing: five minutes at the edge keeps the landing
      // page load off the database without making the figures feel stale.
      "Cache-Control": "public, max-age=300, s-maxage=600",
      "Access-Control-Allow-Origin": "*"
    }
  });
}