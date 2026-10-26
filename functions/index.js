// Cloudflare Pages Function — Route: GET /
//
// A Pages Function wins over the static asset on its route, so this handler —
// not index.html — answers the homepage. It exists for one job: index.html
// hardcodes "500+ job listings" in three places, and the board is ~7,679. That
// number ships to every crawler and every link preview, so the site understates
// its own size to exactly the audience that reads the raw HTML.
//
// The SPA already fetches /api/site-stats to fill #lp-live-jobs, but a JS-fetched
// number is invisible to a no-JS reader and lands after first paint for everyone
// else. Writing the real count into the served HTML fixes both.
//
// The number is never guessed here. It comes from fetchPublishedJobCount(), a
// PostgREST `Prefer: count=exact` read of published rows, and when that read
// fails the function serves the original file untouched rather than a wrong
// figure — "500+" is stale, but a fabricated total is a lie about the world.
// The substitution is likewise a no-op unless the exact placeholder is present,
// so an upstream copy change degrades to "page serves, number not injected".
//
// The only rewrite applied is the count itself. The SPA boots off this document
// exactly as it does off the static asset, so nothing interactive changes.

import { fetchPublishedJobCount } from "./lib/site-stats.js";
import { DEFAULT_SUPABASE_URL } from "./lib/jobs-feed.js";
import { injectJobCount } from "./lib/job-count.js";
import { cacheMatch, cachePut, cacheState, withCacheState } from "./lib/page-cache.js";

// Re-exported so the tests and any future caller can reach it from the route it
// is most associated with; the implementation lives in lib/job-count.js because
// /jobs rewrites the same placeholder.
export { injectJobCount };

export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=600",
    "x-swapiki-cache": cacheState(context)
  };

  const warm = await cacheMatch(context);
  if (warm) return withCacheState(warm, "HIT");

  const shellUrl = new URL("/index.html", request ? request.url : "https://swapiki.com/");
  try {
    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      console.warn("[home] no ASSETS binding; cannot serve the homepage.");
      return new Response("Homepage temporarily unavailable.", { status: 503, headers });
    }
    const assetRes = await env.ASSETS.fetch(shellUrl);
    if (!assetRes || !assetRes.ok) {
      console.warn("[home] index.html fetch failed:", assetRes && assetRes.status);
      return new Response("Homepage temporarily unavailable.", { status: 503, headers });
    }

    const html = await assetRes.text();
    const count = await fetchPublishedJobCount(
      env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY || ""
    );
    const body = injectJobCount(html, count);
    if (count == null) console.warn("[home] job count unavailable; served the static placeholder.");

    const res = new Response(body, { headers });
    await cachePut(context, res);
    return res;
  } catch (err) {
    console.warn("[home] threw:", err && err.message);
    return new Response("Homepage temporarily unavailable.", { status: 503, headers });
  }
}
