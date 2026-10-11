// The honest, small set of site-wide numbers the landing page and the jobs
// board are allowed to show.
//
// Every number is a count of rows that exist. Nothing is estimated, rounded up
// for effect, or padded with activity that did not happen - a strip that says
// "4 published profiles" when there are four is credible; one that says
// "10,000 members" is not, and the landing page's tests exist to keep that kind
// of number off the site.
//
// Each source fails on its own. A candidates read that fails returns null for
// the candidate figures rather than zero, because "the database could not be
// read" and "nobody has published" are different facts and the UI must not
// render the second when the first is true.

const DAY = 86400000;
const WEEK_MS = 7 * DAY;
const list = (rows) => (Array.isArray(rows) ? rows : []);

/**
 * Published, non-dummy profiles, and how many of those were updated in the last
 * week. `updated_at` is the only date column safe to read here: `created_at` is
 * not exposed to anon reads (the request 400s), and a row with no usable date is
 * left out of the weekly figure rather than assumed to be recent.
 *
 * @returns {Promise<{profiles:number, published:number, publishedThisWeek:number}|null>}
 */
export async function fetchCandidateStats(supabaseUrl, key, now = Date.now()) {
  if (!supabaseUrl || !key) return null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/candidates?select=profile_status,is_dummy,updated_at&limit=5000`,
      { headers: { apikey: key, Authorization: "Bearer " + key } }
    );
    if (!res.ok) return null;
    const rows = list(await res.json());
    const publishedRows = rows.filter((r) => r && r.profile_status === "published" && r.is_dummy !== true);
    const publishedThisWeek = publishedRows.filter((r) => {
      const ms = Date.parse(String(r.updated_at || ""));
      return Number.isFinite(ms) && now - ms <= WEEK_MS;
    }).length;
    return { profiles: rows.length, published: publishedRows.length, publishedThisWeek };
  } catch (e) {
    return null;
  }
}

/** Published jobs, or null when the caller cannot read the table.
 *
 * The count is asked for directly rather than by fetching rows and measuring
 * them: the board is already past a thousand listings, and a `limit`-bounded
 * fetch would quietly report the limit as the total. PostgREST's
 * `Content-Range: 0-0/<total>` answers the real number without transferring a
 * single row. A missing or unparseable header returns null - "unknown" - rather
 * than a number that is really a ceiling.
 */
export async function fetchPublishedJobCount(supabaseUrl, key) {
  if (!supabaseUrl || !key) return null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/jobs?select=id&status=eq.published`,
      {
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          Prefer: "count=exact",
          Range: "0-0"
        }
      }
    );
    if (!res.ok) return null;
    const range = res.headers.get("content-range") || "";
    const total = Number(range.split("/")[1]);
    return Number.isFinite(total) ? total : null;
  } catch (e) {
    return null;
  }
}

/**
 * The combined shape /api/site-stats returns. Any figure it cannot read is
 * null, and the caller hides that cell rather than printing a zero.
 */
export async function fetchSiteStats(supabaseUrl, key, now = Date.now()) {
  // The service key is preferred for both reads when present: the jobs table is
  // RLS admin-only, and using one key for both keeps the two counts consistent.
  const candidates = await fetchCandidateStats(supabaseUrl, key, now);
  const jobs = await fetchPublishedJobCount(supabaseUrl, key);
  return {
    profiles: candidates ? candidates.profiles : null,
    published: candidates ? candidates.published : null,
    publishedThisWeek: candidates ? candidates.publishedThisWeek : null,
    jobs
  };
}