// Cloudflare Pages Function — Route: GET /jobs.json
//
// The whole published board as one JSON document, for programs rather than
// people: an answer engine that wants to say how many roles are open, or which
// cities they are in, should not have to fetch 500 HTML pages to count them.
//
// Public and unauthenticated on purpose - the same rows are already rendered on
// /jobs and on every /jobs/<slug> page, so this exposes nothing a crawler could
// not read. The service key is used server-side, exactly as the HTML routes do,
// because the jobs table's RLS is admin-only.
//
// If the read fails the document reports zero jobs rather than an older number.
// A feed that claims 500 openings while serving none is worse than one that
// admits it came back empty.

import { DEFAULT_SUPABASE_URL, fetchPublishedJobs } from "./lib/jobs-feed.js";
import { buildJobsJson } from "./lib/jobs-exports.js";
import { cached } from "./lib/page-cache.js";

export async function onRequestGet(context) {
  const { env } = context;
  // Several megabytes of JSON built from a paged read of the whole board, which
  // is far too much work to repeat per request: the edge holds it instead.
  return cached(context, async () => {
    const jobs = await fetchPublishedJobs(
      env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY || ""
    );

    const body = JSON.stringify(buildJobsJson(jobs), null, 2);

    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=600",
        // Answer engines and third-party tools fetch this from another origin.
        // Without CORS the document is readable by curl and by nothing in a
        // browser, which is where most of the tooling that would consume it runs.
        "Access-Control-Allow-Origin": "*"
      }
    });
  });
}
