//   Length-safe constant-time compare, so a wrong guess leaks no timing signal —
//   a standalone copy of functions/lib/http.js secretMatches(). The send-digest
//   route is a public endpoint, and the shared secret is what keeps the two-hourly
//   scheduler from being spoofed into posting an extra digest.

export function secretMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = String(provided);
  const b = String(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}