//   Rendering for the daily WhatsApp digest — pure functions, no network.
//
//   Mirrors the Telegram channel digest (functions/lib/telegram.js
//   formatChannelDigest) but for WhatsApp's plain-text markup: bold is *...*,
//   links are raw URLs on their own line (tappable, and they enable a link
//   preview), and there is no HTML to escape because there is no HTML parser.
//
//   The one injection worth defending against is WhatsApp's own formatting: an
//   asterisk in a job title would open a *bold* run mid-message, so asterisks
//   are stripped from every rendered field.

const CAP = { title: 200, company: 120, location: 120, salary: 120 };
const SITE_TARGET = "https://swapiki.com/#jobs";

// The digest is one message, so it cannot list a whole backfill day at once.
// Anything cut here is still un-stamped, so the NEXT day's digest picks it up.
export const MAX_DIGEST_JOBS = 8;

/** The UTC date key for "which digest is today's". */
export const todayKey = () => new Date().toISOString().slice(0, 10);

/** Truncates one field to its cap, on a character boundary, with an ellipsis. */
function clip(value, max) {
  const s = String(value == null ? "" : value).trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}...` : s;
}

/** Neutralises WhatsApp's own formatting markers, which would otherwise split the message. */
function plain(value) {
  return String(value == null ? "" : value).replace(/\*/g, "");
}

/** The PostgREST select for "published, not yet broadcast, oldest first". */
export const pendingQuery = () =>
  "jobs" +
  "?select=id,title,company,location,category,salary,skills,apply_url,first_seen_at" +
  "&status=eq.published&whatsapp_posted_at=is.null" +
  "&order=first_seen_at.asc";

/**
 * Renders the daily digest: every job published since the previous post, in one
 * message. `items` is [{ job, url }]. Every link is to our own job page (never
 * the raw apply_url, so the board keeps the attribution and the profile pitch),
 * and every field is capped and defused like the Telegram card so a crafted
 * title cannot break the message.
 */
export function formatWhatsAppDigest(items) {
  const lines = ["*New roles on Swapiki*", ""];
  (items || []).forEach(({ job, url }, i) => {
    const title = plain(clip(job && job.title, CAP.title)) || "(untitled role)";
    const where = [job && job.company, job && job.location]
      .map(v => plain(clip(v, CAP.company)))
      .filter(Boolean)
      .join("  ·  ");
    const salary = plain(clip(job && job.salary, CAP.salary));
    // One short line per field rather than one long  ·  -joined line: a phone is
    // much narrower than desktop and a single long line runs past the edge of
    // the message bubble instead of wrapping cleanly.
    lines.push(`${i + 1}. *${title}*`);
    if (where) lines.push(where);
    if (salary) lines.push(`💰 ${salary}`);
    lines.push(String(url || ""));
    lines.push("");
  });
  lines.push("👉 See all roles on Swapiki");
  lines.push(SITE_TARGET);
  return lines.join("\n").trim();
}