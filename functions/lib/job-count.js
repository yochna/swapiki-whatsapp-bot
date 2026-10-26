// The one rewrite shared by every route that serves index.html (/ and /jobs).
//
// index.html hardcodes "500+ job listings" in three places while the board
// holds thousands, so the site understates its own size to exactly the audience
// that reads raw HTML: crawlers and chat link-preview bots. Both routes that
// serve that shell replace the literal with the real count read from the board,
// and neither invents a number - see functions/index.js and functions/jobs.js.
//
// Kept here, apart from both callers, so the behaviour (and its tests) cannot
// drift between the two routes that depend on it.

// The literal in index.html. Built fresh on each use: a shared /g regex keeps
// lastIndex between calls, so the second call to .test() starts mid-string and
// misses - the page would flip back to "500+" for every second visitor.
const countPlaceholder = () => /500\+/g;

/**
 * Replaces every "500+" with the real count, formatted for India (7,679).
 *
 * Returns the input unchanged when there is no usable number or no placeholder
 * to fill, so the caller can tell "nothing to do" from "did the work", and a
 * failed or absent count degrades to the stale placeholder rather than to a
 * fabricated total.
 */
export const injectJobCount = (html, count) => {
  if (!html || typeof count !== "number" || !Number.isFinite(count) || count <= 0) return html;
  if (!countPlaceholder().test(html)) return html;
  return html.replace(countPlaceholder(), count.toLocaleString("en-IN"));
};
