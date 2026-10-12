//   Supabase PostgREST access for the WhatsApp bot — a standalone copy of
//   functions/lib/postgrest.js (minus numericOrNull, which this service never
//   needs).
//
//   Same reason it exists in the site codebase: PostgREST rejects an entire
//   request when one column name is wrong, and the daily digest has to tell
//   "the migration has not been run" apart from "the request was bad" or it
//   would report a configuration problem as a data problem.

/**
 * Does this error mean PostgREST could not find a column we asked for?
 *
 * Both signals are checked. The `code` is authoritative when present; the
 * message is the fallback. That fallback requires the identifier Postgres
 * prints between "column" and "does not exist", not merely the words.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isMissingColumnError(err) {
  const msg = String((err && err.message) || err || "");
  if (!msg) return false;
  if (/\b42703\b/.test(msg)) return true;
  return /\bcolumn\s+[\w."]+\s+does not exist\b/i.test(msg);
}

/**
 * One thin PostgREST request against a Supabase project.
 *
 * A non-2xx becomes a thrown Error carrying the status and a slice of the body —
 * the body is where the SQLSTATE lives.
 *
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 * @param {string} path  e.g. 'jobs?status=eq.draft'
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
export async function rest(supabaseUrl, serviceKey, path, init) {
  const url = `${supabaseUrl}/rest/v1/${path}`;
  const options = {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...((init && init.headers) || {})
    }
  };
  // A home connection drops the occasional DNS/connection attempt; the session
  // save sits right on the pairing restart, so a single blip there would throw
  // the pairing away. Retry the network layer only — never an HTTP error we
  // constructed below, which is a real answer and would just repeat.
  const TRANSIENT = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|terminated/i;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Supabase ${init && init.method} ${path} -> ${res.status} ${body.slice(0, 180)}`);
      }
      if (res.status === 204) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (err) {
      const msg = String((err && err.message) || err);
      const transient = TRANSIENT.test(msg) && !/^Supabase /.test(msg);
      if (!transient || attempt >= 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

/** Does this error mean the table itself is missing? */
export function isMissingTableError(err, table) {
  const msg = String((err && err.message) || err || "");
  return new RegExp(table).test(msg) && /(42P01|PGRST205|does not exist|could not find the table)/i.test(msg);
}