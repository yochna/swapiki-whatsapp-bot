//   Telegram Bot API — the small slice this project needs.
//
//   Two directions of traffic live here:
//     outbound  sendJobForReview / sendMessage / editMessageText / answerCallback
//     inbound   parseReviewAction, which turns a button press back into a decision
//
//   Keeping it in one module means the rest of the code never builds a Telegram
//   URL by hand, and there is exactly one place that decides how a job is
//   rendered or how a callback is encoded - so the two cannot drift apart.

const MAX_MESSAGE = 4096; // Telegram's hard limit per message.

/**
 * HTML-escapes text for Telegram's parse_mode=HTML.
 *
 * The double quote matters as much as the angle brackets: job.apply_url is
 * rendered inside an href="..." attribute, and an unescaped quote there closes the
 * attribute early and turns the rest of the URL into markup.
 */
export function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

/** Per-field length caps, so a pathological row cannot produce an unsendable card. */
const CAP = { title: 200, company: 120, location: 120, salary: 120, skills: 200, footer: 200 };

/**
 * Truncates one field to its cap, on a character boundary, with an ellipsis.
 *
 * Capping per field rather than slicing the finished message is deliberate: a
 * whole-message slice can land in the middle of a tag or an entity, and Telegram
 * rejects a message it cannot parse with "can't parse entities" - losing the card
 * entirely. With these caps the assembled card is a few hundred characters.
 */
function clip(value, max) {
  const s = String(value == null ? "" : value).trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}...` : s;
}

/**
 * Calls one Bot API method and unwraps the result.
 *
 * Telegram answers 200 with `{ ok: false }` for most application errors, so a
 * status check alone would treat a refused call (bad token, chat not found) as a
 * success. Both are checked, and the raw body is kept in the error because that
 * is the only place Telegram states the reason.
 */
export async function callTelegram(token, method, payload) {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Left null; the throw below reports the raw body.
  }
  if (!res.ok || !body || body.ok === false) {
    const detail = (body && (body.description || body.error_code)) || text.slice(0, 180);
    throw new Error(`Telegram ${method} failed (${res.status}): ${detail}`);
  }
  return body.result;
}

const CATEGORY_LABEL = { it: "IT & Engineering", bfsi: "BFSI", any: "Other" };
const SITE_TARGET = "https://swapiki.com/#jobs";

/**
 * Renders one draft as the message the admin decides on.
 *
 * Every value is escaped: a title, company or URL is attacker-influenced (it comes
 * from a third-party feed) and Telegram's HTML parser would otherwise let a
 * crafted title inject markup into the review card. Same class of bug as the
 * JSON-LD escaping on the public board. The literal labels are escaped for the
 * same reason - "IT & Engineering" written raw is invalid markup that Telegram
 * refuses to parse, taking the whole card with it.
 *
 * `pendingCount` adds a footer saying how many other drafts are waiting, so a
 * card never looks like it is acting alone on the queue.
 */
export function formatJobCard(job, pendingCount = 0) {
  const lines = [];
  const title = clip(job.title, CAP.title);
  lines.push(`<b>${esc(title || "(untitled)")}</b>`);

  const company = clip(job.company, CAP.company);
  if (company) lines.push(esc(company));

  const location = clip(job.location, CAP.location);
  if (location) lines.push(`Location: ${esc(location)}`);

  const meta = [];
  if (job.category) meta.push(esc(CATEGORY_LABEL[job.category] || job.category));
  const salary = clip(job.salary, CAP.salary);
  if (salary) meta.push(esc(salary));
  if (meta.length) lines.push(meta.join("  -  "));

  const skills = Array.isArray(job.skills) ? job.skills.join(", ") : job.skills;
  const skillsText = clip(skills, CAP.skills);
  if (skillsText) lines.push(`Skills: ${esc(skillsText)}`);

  if (job.apply_url) lines.push(`<a href="${esc(job.apply_url)}">Open original post</a>`);

  if (Number(pendingCount) > 0) {
    lines.push(`\n<i>${Number(pendingCount)} more draft${Number(pendingCount) === 1 ? "" : "s"} in queue</i>`);
  }

  return lines.join("\n");
}

/**
 * Sends a draft to the admin with Publish / Reject buttons.
 *
 * callback_data is what Telegram echoes back on a press. It is capped at 64
 * bytes by Telegram, which is why it is "pub:<uuid>" (40 chars) rather than any
 * bundled payload - and why the decision is re-fetched from the database on the
 * press rather than trusted from the callback.
 *
 * A "Publish all" button is added when the queue holds more than one draft, and
 * a plain link back to the admin queue is always on the board so a long list of
 * jobs does not have to be decided card by card.
 *
 * Returns the message id so the caller can record it (and later edit the card).
 */
export async function sendJobForReview(token, chatId, job, pendingCount = 0) {
  const otherDrafts = Math.max(0, Number(pendingCount) || 0);
  const keyboard = [
    [
      { text: "✅ Publish", callback_data: `pub:${job.id}` },
      { text: "❌ Reject", callback_data: `rej:${job.id}` }
    ]
  ];
  if (otherDrafts > 0) {
    keyboard.push([{ text: `✅ Publish all ${otherDrafts} pending`, callback_data: "puball" }]);
  }
  keyboard.push([{ text: "Open queue on Swapiki", url: "https://swapiki.com/#admin-jobs" }]);

  const result = await callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text: formatJobCard(job, otherDrafts),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard }
  });
  return result && result.message_id;
}

export function sendMessage(token, chatId, text, extra) {
  return callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text: String(text || "").slice(0, MAX_MESSAGE),
    disable_web_page_preview: true,
    ...(extra || {})
  });
}

export function answerCallbackQuery(token, callbackQueryId, text) {
  return callTelegram(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: String(text || "").slice(0, 200)
  });
}

/**
 * Renders the daily channel digest: every job published since the previous
 * post, in one message.
 *
 * One post per day rather than one per job — the /channel-post route ran on the
 * two-hourly scheduler and broadcast each job separately, which is more channel
 * traffic than a channel people actually read. Every link is to our own job
 * page (never the raw apply_url, so the board keeps the attribution and the
 * profile pitch), and every field is capped and escaped like the review card so
 * a crafted title cannot break the message or an href.
 */
export function formatChannelDigest(items) {
  const lines = ["<b>New roles on Swapiki</b>", ""];
  (items || []).forEach(({ job, url }, i) => {
    const title = clip(job && job.title, CAP.title) || "(untitled role)";
    const where = [job && job.company, job && job.location]
      .map(v => clip(v, CAP.company))
      .filter(Boolean)
      .map(esc)
      .join("  ·  ");
    const salary = clip(job && job.salary, CAP.salary);
    // One short line per field rather than one long  ·  -joined line: a phone
    // client is much narrower than desktop, and a single long line runs past
    // the edge of the message bubble instead of wrapping cleanly.
    lines.push(`${i + 1}. <a href="${esc(url)}"><b>${esc(title)}</b></a>`);
    if (where) lines.push(where);
    if (salary) lines.push(`💰 ${esc(salary)}`);
    lines.push("");
  });
  lines.push(`👉 <a href="${SITE_TARGET}">See all roles on Swapiki</a>`);
  return lines.join("\n");
}

/**
 * Posts the daily digest to the public channel.
 *
 * Same unfurl-on choice as a single job post: link previews are what make a
 * text-only digest scannable. The channel id is whatever the bot was given.
 */
export function sendChannelDigest(token, channelId, items) {
  return callTelegram(token, "sendMessage", {
    chat_id: channelId,
    text: formatChannelDigest(items),
    parse_mode: "HTML",
    disable_web_page_preview: false
  });
}

/**
 * Renders the weekly job-digest DM for one candidate.
 *
 * `items` is [{ job, url }], ranked for this candidate by the caller. The link
 * is to our own job page for the same reason as the channel digest, and the
 * same per-field caps and escaping apply — the receiver's name, and every job
 * field, are attacker-influenced and Telegram's HTML parser is strict.
 */
export function formatCandidateDigest(firstName, items) {
  const lines = [
    `Hi ${esc(firstName || "there")}!`,
    "",
    "Here are some new roles on Swapiki that match your profile:",
    ""
  ];
  (items || []).forEach(({ job, url }, i) => {
    const title = clip(job && job.title, CAP.title) || "(untitled role)";
    const where = [job && job.company, job && job.location]
      .map(v => clip(v, CAP.company))
      .filter(Boolean)
      .map(esc)
      .join("  ·  ");
    const salary = clip(job && job.salary, CAP.salary);
    const parts = [
      `<a href="${esc(url)}"><b>${esc(title)}</b></a>`,
      where,
      salary ? `💰 ${esc(salary)}` : ""
    ].filter(Boolean);
    lines.push(`${i + 1}. ${parts.join("  ·  ")}`);
  });
  lines.push("", `👉 <a href="${SITE_TARGET}">Browse all roles on Swapiki</a>`);
  return lines.join("\n");
}

/**
 * True when `user` is currently a member of `chatId` (any status except left/kicked).
 *
 * Used by the onboarding flow: it only talks about channel membership when the
 * lookup actually succeeded, so a Telegram hiccup does not get reported to the
 * user as "you are not a member".
 */
export async function isChannelMember(token, chatId, userId) {
  const member = await callTelegram(token, "getChatMember", { chat_id: chatId, user_id: userId });
  const status = member && member.status;
  return status === "member" || status === "administrator" || status === "creator" || status === "restricted";
}

/**
 * Builds the message the bot sends when someone opens it (deep link or /start).
 *
 * The nudge depends on where the person actually is: no profile yet, a profile
 * that is not published, or a live profile. Each case gets exactly one primary
 * action pointing back at swapiki.com, so the reply is a next step rather than a
 * wall of links. A `channelUrl` adds a second button back to the channel.
 *
 * `candidate` is the candidate row (or null when the token was unknown/expired,
 * or the user has no profile yet). Only present fields are used, so this renders
 * sensibly for a missing row.
 *
 * @param {object|null} candidate  a candidates row (name, profile_status)
 * @param {{site?: string, channelUrl?: string}} [opts]
 * @returns {{ text: string, reply_markup: { inline_keyboard: Array } }}
 */
export function formatOnboardingMessage(candidate, opts) {
  const site = (opts && opts.site) || "https://swapiki.com";
  const channelUrl = (opts && opts.channelUrl) || "";
  const first = candidate && candidate.name ? String(candidate.name).trim().split(/\s+/)[0] : "";
  const hello = first ? `Hi ${esc(first)}! ` : "";
  const published = Boolean(candidate && candidate.profile_status === "published");

  let text;
  const buttons = [];
  if (!candidate) {
    text =
      `${hello}Thanks for reaching out to Swapiki. Sign in and finish your profile ` +
      `so our job alerts actually match you - it takes a few minutes.`;
    buttons.push({ text: "Create my Swapiki profile", url: `${site}/#dashboard` });
  } else if (!published) {
    text =
      `${hello}Your Swapiki profile is not live yet. Finish it and publish, and we ` +
      `will only send you roles that fit it.`;
    buttons.push({ text: "Finish my profile", url: `${site}/#dashboard` });
  } else {
    text =
      `${hello}Your Swapiki profile is live. Browse the latest roles matched to it - ` +
      `new jobs land here first.`;
    buttons.push({ text: "See jobs for me", url: `${site}/#jobs` });
  }
  if (channelUrl) buttons.push({ text: "Open the jobs channel", url: channelUrl });

  return { text, reply_markup: { inline_keyboard: [buttons] } };
}

/**
 * Rewrites the review card in place, optionally dropping the buttons.
 *
 * Pass an empty reply_markup to remove the keyboard: once a decision is made,
 * leaving the buttons live invites a second press on a stale message.
 */
export function editMessageText(token, chatId, messageId, text, replyMarkup) {
  return callTelegram(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: String(text || "").slice(0, MAX_MESSAGE),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decodes `pub:<uuid>` / `rej:<uuid>`, plus the whole-queue `puball`, or null
 * for anything else.
 *
 * The uuid is validated rather than interpolated on trust: it is echoed straight
 * into a PostgREST `id=eq.<uuid>` filter, and an unvalidated value there would be
 * a filter-injection hole. A button can only ever carry what we put in it, but
 * the webhook is a public endpoint, so "only we can send this" is not an
 * assumption worth making.
 */
export function parseReviewAction(data) {
  if (data === "puball") return { action: "publish_all", jobId: null };
  if (typeof data !== "string") return null;
  const m = data.match(/^(pub|rej):(.+)$/);
  if (!m) return null;
  if (!UUID_RE.test(m[2])) return null;
  return { action: m[1] === "pub" ? "publish" : "reject", jobId: m[2] };
}
