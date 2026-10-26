// Edge caching for the generated job surfaces.
//
// Every one of these routes rebuilds its answer from the database on each hit,
// and measured on production they took seconds of server time to do it - the
// board, the per-job page and the sitemap all showed `cf-cache-status: DYNAMIC`
// even though they already send `Cache-Control: public, ..., s-maxage=600`.
// Setting the header does not by itself put an HTML response in Cloudflare's
// cache, so the routes ask for it explicitly here: a warm response is served
// from the edge without running the function or touching Postgres at all.
//
// The helpers are deliberately no-ops wherever the Cache API is unavailable or
// the caller cannot hold a background task open:
//
//   * `caches` does not exist in the test harness (and can be absent at runtime
//     too), so a missing global means "run the route", never an error.
//   * Pages Functions hand the handler a context with `waitUntil`; its presence
//     is the signal that this is a real request context the Cache API can serve,
//     so a context without it (a unit test, say) opts out rather than writing
//     into a cache nothing will ever read.
//
// A cache that never warms costs one lookup, which is why failing open is always
// the right answer here: caching is an optimisation, and a route must never
// refuse to serve because of one.
//
// The key carries an hour, because nothing else does. `put()` stores an entry
// until it is evicted, and these routes must not outlive their content: a role
// that stopped being published has to stop serving, and a listing that landed at
// noon has to be readable in the next hour, not the next LRU sweep. Rounding the
// hour into the key gives every page a one-hour life, keeps a fresh copy available
// for every hit within that hour, and bounds the number of warm copies at one per
// URL per hour instead of one per request.

const HOUR_MS = 36e5;

/** The cache key for this request: its own URL, stamped with the current hour. */
const cacheKey = (request) => {
  const url = new URL(request.url);
  url.searchParams.set("_ch", String(Math.floor(Date.now() / HOUR_MS)));
  return url.toString();
};

const isCacheable = (context) =>
  typeof caches !== "undefined" &&
  !!context &&
  !!context.request &&
  context.request.method === "GET" &&
  typeof context.waitUntil === "function";

/** The stored copy of this request, or null when there is none. */
export async function cacheMatch(context) {
  if (!isCacheable(context)) return null;
  try {
    return (await caches.default.match(cacheKey(context.request))) || null;
  } catch {
    return null;
  }
}

/**
 * What this handler knows about its own cache, for a response header.
 *
 * "HIT" is set by the route that found a copy, "MISS" means the Cache API is
 * available and there was simply nothing there, and "OFF" means it is not - no
 * `caches` global, or a context that cannot hold the write open. All three are
 * answered the same way (run the route); the header exists so a fetch can tell
 * them apart instead of leaving every generated page looking equally cold.
 */
export const cacheState = (context) => {
  if (!isCacheable(context)) return "OFF";
  if (!caches || !caches.default) return "NO-DEFAULT";
  return "MISS";
};

/** The response with the cache state stamped on it, body untouched. */
export function withCacheState(res, value) {
  try {
    const headers = new Headers(res.headers);
    headers.set("x-swapiki-cache", value);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
}

/**
 * Stores the response for this hour, and reports whether it stuck.
 *
 * Only a complete 200 is worth storing: a redirect, a 404 or a half-built error
 * page would be replayed at everyone until it expired. The caller awaits this
 * before returning, so the write lands while the isolate is still alive instead
 * of racing the response; the clone is required because the original body is
 * consumed by whoever the route returns it to.
 */
export async function cachePut(context, res) {
  if (!isCacheable(context) || !res || res.status !== 200) return "SKIP";
  try {
    await caches.default.put(cacheKey(context.request), res.clone());
    return "PUT-OK";
  } catch (err) {
    console.warn("[cache] put threw:", err && err.message);
    return "PUT-ERR:" + (err && err.message);
  }
}

/** Serve from the edge when warm, otherwise run the route and store the result. */
export async function cached(context, build) {
  const hit = await cacheMatch(context);
  if (hit) return withCacheState(hit, "HIT");
  const res = await build();
  await cachePut(context, res);
  return withCacheState(res, cacheState(context));
}
