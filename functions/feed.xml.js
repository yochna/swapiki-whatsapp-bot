// Cloudflare Pages Function — Route: GET /feed.xml
//
// RSS 2.0 of the 50 newest published roles. A feed is how a reader, a
// aggregator or an answer engine notices that the board changed without
// re-crawling 500 pages on a poll - which is the difference between a board
// that surfaces as new and one that only surfaces when something re-indexes it.
//
// Capped at 50 because the feed answers "what is new", not "what exists". The
// full set is /jobs.json and /sitemap.xml, both of which are linked from the
// channel so a consumer that outgrows the feed has somewhere to go.

import { DEFAULT_SUPABASE_URL, fetchPublishedJobs } from "./lib/jobs-feed.js";
import { buildFeedXml } from "./lib/jobs-exports.js";

export async function onRequestGet(context) {
  const { env } = context;
  const jobs = await fetchPublishedJobs(
    env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const body = buildFeedXml(jobs);

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=600",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
