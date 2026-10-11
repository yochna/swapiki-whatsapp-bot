//   Small shared helpers for talking to Supabase's PostgREST layer.
//
//   Why this file exists: PostgREST's failure mode for a column that does not
//   exist is a hard reject of the *entire* request, not a skipped field. One
//   unknown name in an insert payload fails the whole batch, and one unknown
//   name in a select returns 400 with no rows. Both call sites (the importer and
//   the public job board) therefore need to tell "the schema is not what I think
//   it is" apart from "the request was genuinely bad", or they end up either
//   blanking a live page or reporting a configuration problem as a data problem.
//
//   The error is identified by the SQLSTATE code PostgREST returns (42703,
//   undefined_column) and by the message Postgres pairs with it, rather than by
//   substring-matching an HTTP status, because a 400 is also what a genuinely
//   malformed filter returns and the two need opposite handling.

/**
 * Does this error mean PostgREST could not find a column we asked for?
 *
 * Both signals are checked. The `code` is authoritative when present; the
 * message is the fallback for proxies and older PostgREST builds that flatten
 * the error body to plain text. That fallback requires the identifier Postgres
 * prints between "column" and "does not exist", not merely the words, so prose
 * that happens to contain "column ... does not exist" is not mistaken for the
 * schema error.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isMissingColumnError(err) {
  const msg = String((err && err.message) || err || "");
  if (!msg) return false;
  // SQLSTATE undefined_column, as PostgREST serialises it.
  if (/\b42703\b/.test(msg)) return true;
  // The paired message, e.g. 'column jobs.salary_min does not exist'. The
  // identifier is mandatory: 'relation "jobs" does not exist' (a missing table,
  // not a missing column) and 'this column does not exist in the data' both fail
  // to match, which is what keeps the fallback from firing on the wrong error.
  return /\bcolumn\s+[\w."]+\s+does not exist\b/i.test(msg);
}

/**
 * One thin PostgREST request against a Supabase project.
 *
 * Shared by the importer, the notifier and the Telegram webhook so they agree on
 * the auth headers and, more importantly, on how a failure is surfaced. A non-2xx
 * becomes a thrown Error carrying the status and a slice of PostgREST's body -
 * the body is where the SQLSTATE lives, and isMissingColumnError() reads it.
 *
 * `return=minimal` writes answer 204 with no body, hence the null.
 *
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 * @param {string} path  e.g. 'jobs?status=eq.draft'
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
export async function rest(supabaseUrl, serviceKey, path, init) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...((init && init.headers) || {})
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase ${init && init.method} ${path} -> ${res.status} ${body.slice(0, 180)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Coerces a Postgres `numeric` into a JavaScript number, or null.
 *
 * PostgREST serialises `numeric` as a JSON *string* to preserve arbitrary
 * precision, so a salary bound arrives as "1200000" rather than 1200000. That is
 * correct for the database and wrong for structured data: schema.org's
 * QuantitativeValue.value is a JSON number, and emitting the string would be
 * invalid markup that still looks plausible in review.
 *
 * Returns null for anything that is not a finite positive number, so a missing
 * bound, a null, or a stray string all take the same path as "the employer
 * stated no salary" and are omitted from the markup rather than guessed at.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
