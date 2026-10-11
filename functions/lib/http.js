//   Shared HTTP helpers for the Pages Functions.
//
//   Small, but duplicated everywhere they are needed: every route returns JSON
//   with the same no-store headers, and every write route guards itself with the
//   same secret compared the same way. Centralising the comparison in particular
//   matters — a timing-safe compare reimplemented per file is one edit away from
//   silently becoming `===`.

/** A JSON response that no cache or proxy should keep, since it carries queue state. */
export function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

/**
 * Length-safe constant-time compare, so a wrong guess leaks no timing signal.
 *
 * The length check falls out before the loop, which is unavoidable (a length
 * mismatch is not a secret worth hiding) but means equal-length guesses take the
 * same time whether they differ in the first byte or the last.
 */
export function secretMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = String(provided);
  const b = String(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
