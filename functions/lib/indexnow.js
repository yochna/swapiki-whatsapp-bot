// IndexNow submission for freshly published job pages.
//
// IndexNow is a shared ping: one POST tells Bing, Yandex, Seznam and Naver that
// a set of URLs is new or changed, so a job page can be crawled in hours instead
// of waiting for the next sitemap pass. Google does not participate - it still
// discovers these pages through /sitemap.xml, so this adds a second engine rather
// than replacing the first.
//
// Proving ownership is the whole point of the key: the service reads the key back
// from <site>/<key>.txt, which means the key is published by design and is not a
// secret. tests/indexnow.test.js keeps the committed key file and the constant
// here in agreement, because a key that drifted would make every ping answer 403
// while looking successful from this side.

import { SITE_URL } from "./schema.js";
import { jobSlug } from "./jobs-feed.js";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export const INDEXNOW_KEY = "3682db4258b027265483592774c6b745";

/** One job's public URL, built from the same slug its canonical tag uses. */
export const jobPageUrl = (job) => `${SITE_URL}/jobs/${jobSlug(job)}`;

/**
 * The exact body IndexNow expects. Pure and separate from the network so the
 * shape can be asserted without making a request.
 *
 * keyLocation is derived rather than hardcoded: it must point at the file that
 * actually carries the key, so a different site host or key cannot silently
 * publish a payload pointing at a location that 404s.
 */
export const buildIndexNowPayload = ({ siteUrl = SITE_URL, key = INDEXNOW_KEY, urls = [] } = {}) => ({
  host: new URL(siteUrl).host,
  key,
  keyLocation: `${String(siteUrl).replace(/\/+$/, "")}/${key}.txt`,
  urlList: [...new Set((urls || []).filter(Boolean))]
});

/**
 * Submit a batch of just-published jobs.
 *
 * Best-effort by design. Indexing is a courtesy owed to search engines, not a
 * requirement of the product, so a rate limit, a timeout or a malformed response
 * must never fail the ingest that produced these URLs - every failure is
 * returned as data the caller can log, and never thrown.
 */
export async function pingIndexNow(jobs, { env = {}, fetchImpl = fetch } = {}) {
  const key = (env && env.INDEXNOW_KEY) || INDEXNOW_KEY;
  // Filtered on the id, not on the built URL: a row with no id has no address
  // the route could resolve (it 404s), and jobSlug would otherwise produce a
  // plausible-looking URL that points at nothing.
  const jobsWithId = (Array.isArray(jobs) ? jobs : []).filter((job) => job && job.id);
  const urls = jobsWithId.map(jobPageUrl).filter(Boolean);

  // Nothing to say: publishing is the only moment worth telling engines about,
  // and an empty batch is the normal outcome of a run that curated nothing.
  if (!urls.length) return { submitted: 0, skipped: true, reason: "no urls" };

  const payload = buildIndexNowPayload({ key, urls });

  try {
    const res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload)
    });
    // A non-2xx is reported rather than thrown: IndexNow answers 429 for a
    // repeat submission and 403 for a key mismatch, and both are worth reading in
    // the response body without taking down the run that triggered them.
    return { submitted: payload.urlList.length, status: res.status, ok: res.ok === true };
  } catch (err) {
    return { submitted: 0, error: String((err && err.message) || err) };
  }
}
