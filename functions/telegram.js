// Cloudflare Pages Function — Route: /telegram
//
//   POST /telegram   Telegram webhook — job decisions, account linking, joins
//   GET  /telegram   liveness + configuration check (reveals no secrets)
//
// -> { ok: true } on success, { ok: true, ignored: "<why>" } for anything that
//    is not something we are willing to act on
//
// THE FLOW
//   POST /notify sends a review card with ✅ Publish / ❌ Reject buttons. Pressing
//   one makes Telegram call this route with a callback_query whose data is
//   "pub:<uuid>" or "rej:<uuid>". The job is re-read, the status is written, and
//   the same message is edited in place to record the outcome.
//
// WHY THE JOB IS RE-READ AND NOT TRUSTED
//   The callback only names a job; the decision is made against the row as it is
//   now. A button pressed twice, or pressed after the job was already decided in
//   the admin UI, finds status != 'draft' and is answered "already decided"
//   instead of flipping a published job back to rejected. The card is the
//   prompt, never the source of truth.
//
// WHO MAY DECIDE
//   Two checks, both required: the secret header proves the request came from the
//   webhook URL Telegram was configured with rather than from the open internet,
//   and the pressing user's id must equal TELEGRAM_ADMIN_CHAT_ID. The second check
//   is what stops anyone else who somehow reaches the chat from publishing jobs —
//   and in a group it is not redundant, because the presser's id and the chat's id
//   are different people.
//
// THE OTHER TWO UPDATE KINDS
//   /start with a token from the jobs board links this Telegram account to the
//   candidate row, clears the token, and replies with a nudge worded for where
//   they are (no profile / unpublished / live). The same token works bare: the
//   jobs board shows it as a short code, so a user who cannot tap a link can
//   type it straight into the chat. chat_member is what a bot that is an admin
//   of the channel receives when someone joins; it records the join and, only
//   for a user we can already DM, sends the same nudge. Both DMs depend on the
//   receiver having pressed Start on the bot — Telegram will not let a bot
//   initiate a conversation otherwise.
//
// THE REVIEW QUEUE
//   The card the admin decides on can carry a "Publish all pending" button
//   (callback_data "puball") alongside the per-job Publish / Reject. It bulk
//   publishes the queue the cards came from — the very cards /notify is asking
//   about — in one request, then records the count on the pressed card.
//
// ENV
//   TELEGRAM_WEBHOOK_SECRET   the secret given to setWebhook
//   TELEGRAM_ADMIN_CHAT_ID    your Telegram user id
//   TELEGRAM_BOT_TOKEN        from @BotFather
//   TELEGRAM_CHANNEL_ID       the channel, by @handle or numeric id
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   service role, writes status

import { rest, isMissingColumnError } from "./lib/postgrest.js";
import { json, secretMatches } from "./lib/http.js";
import { answerCallbackQuery, editMessageText, parseReviewAction, esc, sendMessage, formatOnboardingMessage, isChannelMember } from "./lib/telegram.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";
const DECISION_COLUMNS = "id,title,company,status";
const VERDICT = { publish: "published", reject: "rejected" };

export async function onRequestGet(context) {
  const { env } = context;
  return json({
    ok: true,
    route: "telegram",
    configured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID),
    webhookSecretSet: Boolean(env.TELEGRAM_WEBHOOK_SECRET)
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Telegram sends the secret it was registered with, so this rejects anything
  // that did not come through the webhook URL we configured.
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  if (update && update.callback_query && update.callback_query.message) {
    return handleDecision(env, update.callback_query);
  }
  if (update && update.message) return handleStart(env, update.message);
  if (update && update.chat_member) return handleJoin(env, update.chat_member);
  return json({ ok: true, ignored: "not a button press" });
}

/** ✅ Publish / ❌ Reject on a review card, from the admin's own press. */
async function handleDecision(env, query) {
  const adminId = String(env.TELEGRAM_ADMIN_CHAT_ID || "");
  const presser = String((query.from && query.from.id) || "");
  const chat = String((query.message.chat && query.message.chat.id) || "");
  if (!adminId || presser !== adminId || chat !== adminId) {
    console.warn(`jobs-telegram: ignored button press from user=${presser} chat=${chat}`);
    await safeAnswer(env, query.id, "Not your queue.");
    return json({ ok: true, ignored: "not the admin" });
  }

  const action = parseReviewAction(query.data);
  if (!action) {
    await safeAnswer(env, query.id, "Unknown action.");
    return json({ ok: true, ignored: "unrecognised callback data" });
  }

  // The whole-queue action works on every pending card at once, not one job, so
  // it skips the per-job read below entirely.
  if (action.action === "publish_all") return handlePublishAll(env, query);

  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not set." }, 503);
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, 503);

  // The uuid was shape-checked in parseReviewAction, which is what makes it safe
  // to interpolate into this PostgREST filter.
  let job;
  try {
    const rows =
      (await rest(
        supabaseUrl,
        serviceKey,
        `jobs?select=${DECISION_COLUMNS}&id=eq.${encodeURIComponent(action.jobId)}`
      )) || [];
    job = rows[0];
  } catch (err) {
    if (isMissingColumnError(err)) {
      return json({ ok: false, error: `jobs table is missing a column: ${err.message}` }, 503);
    }
    return json({ ok: false, error: String(err.message || err) }, 500);
  }

  if (!job) {
    await safeAnswer(env, query.id, "That job is no longer in the queue.");
    return json({ ok: true, ignored: "job not found" });
  }
  if (job.status !== "draft") {
    // Already decided in the admin UI, or by an earlier press on this same card.
    await safeAnswer(env, query.id, `Already ${job.status}.`);
    return json({ ok: true, ignored: "already decided", status: job.status });
  }

  const next = VERDICT[action.action];
  try {
    await rest(supabaseUrl, serviceKey, `jobs?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: next })
    });
  } catch (err) {
    console.error(`jobs-telegram: status write failed for ${job.id}: ${err.message || err}`);
    await safeAnswer(env, query.id, "Could not save that. Try again.");
    return json({ ok: false, error: String(err.message || err) }, 500);
  }

  // Edit the card in place: the outcome is recorded where the decision was made,
  // and the buttons go away so the job cannot be judged twice from a stale card.
  const original = typeof query.message.text === "string" ? query.message.text : esc(job.title);
  const stamp = action.action === "publish" ? "✅ Published" : "❌ Rejected";
  const footer = `${stamp} ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`;
  try {
    await editMessageText(env.TELEGRAM_BOT_TOKEN, chat, query.message.message_id, `${original}\n\n${footer}`, {
      inline_keyboard: []
    });
  } catch (err) {
    // The decision is already committed. A failed edit is cosmetic, so it is
    // logged and swallowed rather than reported as a failed press.
    console.error(`jobs-telegram: could not edit card for ${job.id}: ${err.message || err}`);
  }

  await safeAnswer(env, query.id, stamp);
  console.log(`jobs-telegram: ${job.id} -> ${next}`);
  return json({ ok: true, jobId: job.id, status: next });
}

/** How many cards "Publish all pending" may cover in one press. */
const MAX_PUBLISH_ALL = 200;

/**
 * "✅ Publish all pending" — bulk-publishes the queue /notify is asking about.
 *
 * The queue is the same rows the review cards came from (status=draft from the
 * adzuna feed), re-read on the press rather than trusted from the card. The jobs
 * are published in ONE PostgREST write via `id=in.(...)`, the pressed card is
 * edited to record how many went live, and the buttons are removed so a second
 * press cannot clear the next morning's queue too.
 */
async function handlePublishAll(env, query) {
  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "TELEGRAM_BOT_TOKEN is not set." }, 503);
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, 503);
  const chat = String((query.message.chat && query.message.chat.id) || "");

  let rows;
  try {
    rows =
      (await rest(
        supabaseUrl,
        serviceKey,
        "jobs?select=id,title" + "&status=eq.draft&source=eq.adzuna" + `&limit=${MAX_PUBLISH_ALL}`
      )) || [];
  } catch (err) {
    if (isMissingColumnError(err)) {
      return json({ ok: false, error: `jobs table is missing a column: ${err.message}` }, 503);
    }
    return json({ ok: false, error: String(err.message || err) }, 500);
  }

  const original =
    typeof query.message.text === "string" && query.message.text ? query.message.text : "Job review queue";

  if (!rows.length) {
    await safeAnswer(env, query.id, "Queue is already empty.");
    await editMessageText(env.TELEGRAM_BOT_TOKEN, chat, query.message.message_id, `${original}\n\n✅ Queue is empty.`, {
      inline_keyboard: []
    }).catch(err2 => console.error(`jobs-telegram: could not edit queue card: ${err2.message || err2}`));
    return json({ ok: true, published: 0, ignored: "queue already empty" });
  }

  // `in.(...)` on ids we just read as drafts. A job decided in the tiny window
  // between the read and the write is overwritten back to published rather than
  // double-judged — acceptable for a single thumb-press on a personal queue.
  let published;
  try {
    const ids = rows.map(r => r.id);
    const updated = await rest(
      supabaseUrl,
      serviceKey,
      `jobs?id=in.(${ids.map(encodeURIComponent).join(",")})`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "published" })
      }
    );
    published = Array.isArray(updated) ? updated.length : ids.length;
  } catch (err) {
    console.error(`jobs-telegram: publish-all write failed: ${err.message || err}`);
    await safeAnswer(env, query.id, "Could not publish the queue. Try again.");
    return json({ ok: false, error: String(err.message || err) }, 500);
  }

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const footer = `✅ Published ${published} pending draft${published === 1 ? "" : "s"} ${stamp} UTC`;
  try {
    await editMessageText(env.TELEGRAM_BOT_TOKEN, chat, query.message.message_id, `${original}\n\n${footer}`, {
      inline_keyboard: []
    });
  } catch (err) {
    console.error(`jobs-telegram: could not edit queue card: ${err.message || err}`);
  }

  await safeAnswer(env, query.id, `Published ${published}.`);
  console.log(`jobs-telegram: publish-all -> ${published} published`);
  return json({ ok: true, published });
}

/**
 * `/start`, optionally with the single-use token our own link button carries.
 *
 * A token links this Telegram account to their profile and clears the token, so
 * one press links once. The same token also works bare — no "/start" — so a
 * user on a phone where a deep link keeps opening in a browser can just type the
 * code the jobs board shows into the chat. Without a token (or with a stale one)
 * there is nothing to link, but the user still gets a usable answer rather than
 * silence — a bot that swallows /start looks broken. A bare code that matches
 * nothing gets a short "that code did not match" reply, not the full onboarding,
 * so a typo reads as a typo and not as a welcome.
 */
async function handleStart(env, msg) {
  const text = String(msg.text || "").trim();
  // A bare message is only a link code if it looks like one of ours — Telegram
  // start params are limited to this alphabet, and ours are 12 chars long.
  const bareCode = /^[A-Za-z0-9_-]{8,64}$/.test(text);
  if (!/^\/start\b/i.test(text) && !bareCode) return json({ ok: true, ignored: "not a button press" });

  const token = text.replace(/^\/start\s*/i, "").trim();
  const cand = token ? await findCandidateByToken(env, token) : null;

  if (cand) {
    // Written before the reply so a retry that races the send still keeps the
    // link. The token is cleared in the same write: one press, one link.
    try {
      await rest(env.SUPABASE_URL || DEFAULT_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
        `candidates?id=eq.${encodeURIComponent(cand.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            telegram_id: (msg.from && msg.from.id) || null,
            telegram_username: (msg.from && msg.from.username) || null,
            telegram_linked_at: new Date().toISOString(),
            telegram_link_token: null,
            telegram_link_expires_at: null
          })
        });
    } catch (err) {
      console.error(`jobs-telegram: link write failed: ${err.message || err}`);
    }

    // If they are already in the channel, record that now so a chat_member
    // update that never arrives (Telegram only sends it when the bot is an
    // admin) cannot leave the flag unset.
    if (env.TELEGRAM_CHANNEL_ID && msg.from && msg.from.id) {
      try {
        if (await isChannelMember(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHANNEL_ID, msg.from.id)) {
          await markChannelJoined(env, cand.id);
        }
      } catch (err) {
        console.warn(`jobs-telegram: channel membership check failed for ${cand.id}: ${err.message || err}`);
      }
    }
  }

  const chatId = msg.chat && msg.chat.id;

  if (bareCode && !cand) {
    // The code did not match an unexpired token. Spelled out rather than routed
    // through the generic onboarding so the reply actually answers what they
    // typed.
    try {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "That code didn't match any link. Codes are single use and expire after 10 minutes — " +
          "open swapiki.com, tap \"Get your personal Telegram link\", and send the new code (or link) to me."
      );
    } catch (err) {
      console.error(`jobs-telegram: code reply failed: ${err.message || err}`);
    }
    return json({ ok: true, linked: false, ignored: "unknown code" });
  }

  await sendOnboarding(env, cand, chatId);
  return json({ ok: true, linked: Boolean(cand) });
}

/** Someone joined (or left) a chat while the bot was watching it. */
async function handleJoin(env, cm) {
  const newStat = cm.new_chat_member && cm.new_chat_member.status;
  const oldStat = cm.old_chat_member && cm.old_chat_member.status;
  const isMember = s => s === "member" || s === "administrator" || s === "restricted" || s === "creator";
  const joined = isMember(newStat) && !isMember(oldStat);
  const user = cm.new_chat_member && cm.new_chat_member.user;
  if (!joined || !user || !user.id || !matchesChannel(env.TELEGRAM_CHANNEL_ID, cm.chat)) {
    return json({ ok: true, ignored: "not a join to our channel" });
  }

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json({ ok: true, ignored: "not configured" });

  let cand;
  try {
    const rows = (await rest(env.SUPABASE_URL || DEFAULT_SUPABASE_URL, serviceKey,
      `candidates?select=id,telegram_id,name,profile_status,channel_joined_at&telegram_id=eq.${encodeURIComponent(String(user.id))}`)) || [];
    cand = rows[0];
  } catch (err) {
    console.error(`jobs-telegram: join lookup failed for tg=${user.id}: ${err.message || err}`);
    return json({ ok: false, error: String(err.message || err) }, 500);
  }

  if (!cand || cand.channel_joined_at) return json({ ok: true, ignored: "unknown or already recorded" });

  try {
    await markChannelJoined(env, cand.id);
  } catch (err) {
    console.error(`jobs-telegram: join write failed for ${cand.id}: ${err.message || err}`);
    return json({ ok: false, error: String(err.message || err) }, 500);
  }

  if (!cand.telegram_id) return json({ ok: true, recorded: true, messaged: false });
  await sendOnboarding(env, { name: cand.name, profile_status: cand.profile_status }, cand.telegram_id);
  return json({ ok: true, recorded: true, messaged: true });
}

/** The stored single-use token, read straight from the row it was written to. */
async function findCandidateByToken(env, token) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const rows = (await rest(
      env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      `candidates?select=id,name,profile_status,telegram_link_token,telegram_link_expires_at` +
        `&telegram_link_token=eq.${encodeURIComponent(token)}`
    )) || [];
    return rows.find(r =>
      r.telegram_link_token === token &&
      (!r.telegram_link_expires_at || new Date(r.telegram_link_expires_at) > new Date())
    ) || null;
  } catch (err) {
    console.error(`jobs-telegram: /start token lookup failed: ${err.message || err}`);
    return null;
  }
}

async function markChannelJoined(env, candidateId) {
  await rest(env.SUPABASE_URL || DEFAULT_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    `candidates?id=eq.${encodeURIComponent(candidateId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ channel_joined_at: new Date().toISOString() })
    });
}

/** The nudge, worded for where this person actually is. */
async function sendOnboarding(env, cand, chatId) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return false;
  try {
    const fm = formatOnboardingMessage(cand, { site: "https://swapiki.com", channelUrl: channelUrlFor(env) });
    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fm.text, {
      reply_markup: fm.reply_markup,
      parse_mode: "HTML"
    });
    return true;
  } catch (err) {
    console.error(`jobs-telegram: onboarding reply failed: ${err.message || err}`);
    return false;
  }
}

/**
 * Is `chat` the channel we configured?
 *
 * Telegram hands us a numeric chat id, while we may have configured the channel
 * by @handle (which is what a bot is usually added with). Both are matched, and
 * neither is assumed: a join event from some other channel the bot happens to
 * admin must not write to anyone's profile.
 */
function matchesChannel(channelId, chat) {
  if (!channelId || !chat) return false;
  const want = String(channelId).replace(/^@/, "").toLowerCase();
  if (String(chat.id) === String(channelId)) return true;
  return Boolean(chat.username) && String(chat.username).replace(/^@/, "").toLowerCase() === want;
}

/** The public invite to hand back in an onboarding message. */
function channelUrlFor(env) {
  if (env.TELEGRAM_CHANNEL_URL) return env.TELEGRAM_CHANNEL_URL;
  const id = String(env.TELEGRAM_CHANNEL_ID || "");
  if (id && !/^-?\d/.test(id)) return `https://t.me/${id.replace(/^@/, "")}`;
  return undefined;
}

/**
 * Acknowledges the button press.
 *
 * Telegram shows a spinner on the button until this is answered, and retries the
 * whole update if it never is — so a failure here is swallowed: the caller is
 * already handling a real problem and a throw would turn a decision into a
 * retry storm against the same job.
 */
async function safeAnswer(env, callbackQueryId, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !callbackQueryId) return;
  try {
    await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQueryId, text);
  } catch (err) {
    console.error(`jobs-telegram: answerCallbackQuery failed: ${err.message || err}`);
  }
}
