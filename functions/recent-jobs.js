// Cloudflare Pages Function — Route: GET /recent-jobs
import { DEFAULT_SUPABASE_URL, fetchPublishedJobs } from "./lib/jobs-feed.js";

export async function onRequestGet(context) {
  const { env } = context;
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";

  // Get the most recent 5 jobs (by first_seen_at)
  const jobs = await fetchPublishedJobs(supabaseUrl, serviceKey);
  const sorted = jobs
    .filter((j) => j && j.first_seen_at)
    .sort((a, b) => new Date(b.first_seen_at) - new Date(a.first_seen_at))
    .slice(0, 5)
    .map((j) => ({
      title: j.title || "Open role",
      url: `${"https://swapiki.com"}/jobs/${(function jobSlug(j) { const id = String(j && j.id ? j.id : "").trim(); const words = [j && j.title, j && j.company, j && j.location].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, ""); return words ? `${words}--${id}` : id; })(j)}`
    }));

  const res = new Response(JSON.stringify(sorted), {
    headers: { "Content-Type": "application/json" }
  });
  return res;
}
