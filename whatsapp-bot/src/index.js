//   The WhatsApp digest service — a small node:http server.
//
//   Why an HTTP route instead of running Baileys in the Worker: a Cloudflare
//   Worker has a ~30s execution cap and no persistent socket, and Baileys needs
//   an always-open WebSocket. So the Cloudflare scheduler POSTs to
//   /send-digest here (the sender child of the /channel-post design), and this
//   process keeps the WhatsApp connection alive between calls.
//
//   Routes:
//     GET  /             pairing page (shows the QR code until paired)
//     GET  /qr           JSON { qr } — the current pairing QR, if any
//     GET  /status       JSON connection info, for the host dashboard
//     GET  /healthz      { ok: true } — liveness only, ignores the socket
//     POST /send-digest  the daily digest, gated by `x-send-secret`
//
//   Same daily-digest discipline as /channel-post: one post per UTC day, and a
//   row in whatsapp_digests for today means today's is done — whatever is still
//   un-stamped waits for tomorrow. A job is stamped only after WhatsApp
//   confirms the send, so a retry cannot double-post.

import { createBot } from "./bot.js";
import { formatWhatsAppDigest, todayKey, MAX_DIGEST_JOBS, pendingQuery } from "./digest.js";
import { jobSlug } from "./slug.js";
import { rest, isMissingColumnError, isMissingTableError } from "./supabase.js";
import { secretMatches } from "./util.js";
import QRCode from "qrcode";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";
const SITE = "https://swapiki.com";

class HttpError extends Error {
  constructor(status, message, cause) {
    super(message);
    this.status = status;
    this.cause = cause;
  }
}

/** A JSON response that no cache or proxy should keep, since it carries queue state. */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function readConfig(env) {
  return {
    supabaseUrl: env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    groupJid: env.WHATSAPP_GROUP_JID,
    secret: env.WHATSAPP_SECRET,
    proxyUrl: env.WA_PROXY_URL || env.HTTPS_PROXY || env.https_proxy || "",
    port: Number(env.PORT) || 8787
  };
}

let bootLogShown = false;
function logBoot(cfg) {
  if (bootLogShown) return;
  bootLogShown = true;
  const missing = [];
  if (!cfg.serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!cfg.groupJid) missing.push("WHATSAPP_GROUP_JID");
  if (!cfg.secret) missing.push("WHATSAPP_SECRET");
  console.log(`[whatsapp] started on :${cfg.port}`);
  console.log(missing.length
    ? `[whatsapp] NOT configured for sends, missing: ${missing.join(", ")}`
    : "[whatsapp] configured for sends");
  console.log(cfg.proxyUrl
    ? "[whatsapp] routing the WhatsApp socket through WA_PROXY_URL"
    : "[whatsapp] no proxy set — set WA_PROXY_URL if WhatsApp rejects this host's IP");
  console.log("[whatsapp] pairing page: GET / (QR is shown there until paired)");
}

/**
 * The daily digest, mirroring /channel-post: reads published-but-unposted jobs
 * oldest-first, posts ONE message to the group, then stamps each job and writes
 * the day's digest row.
 */
async function sendDigest(cfg, bot) {
  if (!cfg.secret) throw new HttpError(503, "WHATSAPP_SECRET is not set on this service.");
  if (!cfg.groupJid) throw new HttpError(503, "WHATSAPP_GROUP_JID is not set on this service.");
  if (!cfg.serviceKey) throw new HttpError(503, "SUPABASE_SERVICE_ROLE_KEY is not set on this service.");

  let rows;
  try {
    rows = await rest(cfg.supabaseUrl, cfg.serviceKey, pendingQuery());
  } catch (err) {
    if (isMissingColumnError(err)) {
      throw new HttpError(
        503,
        "jobs.whatsapp_posted_at is missing. Run supabase/whatsapp_digest_migration.sql in the Supabase SQL editor.",
        err
      );
    }
    throw new HttpError(500, "could not read the publish queue", err);
  }

  const pending = rows || [];
  const day = todayKey();

  let dayExists = false;
  try {
    const found = await rest(cfg.supabaseUrl, cfg.serviceKey, `whatsapp_digests?select=day&day=eq.${day}`);
    dayExists = Boolean(found && found.length);
  } catch (err) {
    if (isMissingTableError(err, "whatsapp_digests")) {
      throw new HttpError(
        503,
        "whatsapp_digests is missing. Run supabase/whatsapp_digest_migration.sql in the Supabase SQL editor.",
        err
      );
    }
    throw new HttpError(500, "could not read the daily digest marker", err);
  }

  if (dayExists) {
    return { posted: 0, failed: 0, remaining: pending.length, alreadyPosted: true, day };
  }
  if (!pending.length) {
    return { posted: 0, failed: 0, remaining: 0, alreadyPosted: false, day };
  }

  const included = pending.slice(0, MAX_DIGEST_JOBS);
  const restCount = Math.max(0, pending.length - included.length);
  const items = included.map((job) => ({ job, url: `${SITE}/jobs/${jobSlug(job)}` }));
  const text = formatWhatsAppDigest(items);

  try {
    await bot.sendText(cfg.groupJid, text);
  } catch (err) {
    console.error(`[whatsapp] digest send failed: ${err.message || err}`);
    // A not-paired socket is a configuration state, not a data failure.
    if (/not connected/i.test(String(err.message || err))) {
      throw new HttpError(
        503,
        "WhatsApp is not paired yet. Open the pairing page (GET / on this service) and scan the QR with the bot's number.",
        err
      );
    }
    return { posted: 0, failed: included.length, remaining: restCount, alreadyPosted: false, day };
  }

  // Stamped only after WhatsApp confirmed the send. The day row is written even
  // if an individual stamp fails, so a partial stamp can never re-post the same
  // batch later in the day; an unstamped job simply surfaces in a later digest.
  const stamp = new Date().toISOString();
  const errors = [];
  let stamped = 0;
  for (const job of included) {
    try {
      await rest(cfg.supabaseUrl, cfg.serviceKey, `jobs?id=eq.${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ whatsapp_posted_at: stamp })
      });
      stamped++;
    } catch (err) {
      errors.push(`${job.id}: ${String(err.message || err)}`);
    }
  }
  try {
    await rest(cfg.supabaseUrl, cfg.serviceKey, "whatsapp_digests", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ day, posted_at: stamp, job_ids: included.map((j) => j.id) })
    });
  } catch (err) {
    console.error(`[whatsapp] digest marker write failed: ${err.message || err}`);
  }

  const failed = included.length - stamped;
  const remaining = restCount + failed;
  if (included.length) console.log(`[whatsapp] digest day=${day} posted=${stamped} failed=${failed} remaining=${remaining}`);
  for (const e of errors) console.error(`[whatsapp] error: ${e}`);

  return { posted: stamped, failed, remaining, alreadyPosted: false, day };
}

async function handle(request, cfg, bot) {
  const url = new URL(request.url);

  if (url.pathname === "/healthz") {
    return json({ ok: true, connected: bot.connected() });
  }
  if (url.pathname === "/status") {
    return json({
      ok: true,
      connected: bot.connected(),
      pairingQr: Boolean(bot.qr()),
      qrAgeMs: bot.qrAgeMs(),
      usingProxy: bot.usingProxy(),
      lastDisconnectCode: bot.lastDisconnect(),
      ts: new Date().toISOString()
    });
  }
  if (url.pathname === "/qr") {
    return json({ qr: bot.qr() || null });
  }

  // Clears the stored session and restarts pairing, so a fresh QR is served.
  // Protected by the same secret as /send-digest (header or ?token=).
  if (url.pathname === "/reset") {
    if (!cfg.secret) {
      return json({ error: "not configured: WHATSAPP_SECRET must be set to authorize /reset" }, 503);
    }
    const supplied = request.headers.get("x-send-secret") || url.searchParams.get("token");
    if (!secretMatches(supplied, cfg.secret)) {
      return json({
        error: "unauthorized: pass the x-send-secret header or ?token=",
        hint: "Use the same WHATSAPP_SECRET the scheduler sends."
      }, 401);
    }
    await bot.reset();
    return json({ ok: true, reset: true, hint: "Open / for a fresh QR." });
  }

  if (url.pathname === "/") {
    const qr = bot.qr();
    let image = "";
    if (qr) image = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    // While unpaired the page reloads every 4s so the QR on screen is never
    // stale: WhatsApp rotates it ~every 20s and scanning an old one fails with
    // "Couldn't link devices".
    const refresh = bot.connected() ? "" : `<meta http-equiv="refresh" content="4">`;
    const html =
      `<!doctype html><html><head><meta charset="utf-8">${refresh}<title>Swapiki WhatsApp pairing</title></head><body>` +
      `<h1>Swapiki · WhatsApp digest bot</h1>` +
      (bot.connected()
        ? `<p>Connected to WhatsApp. The daily digest is live.</p>`
        : qr
          ? `<p>Scan this QR with the bot&#39;s WhatsApp number<br/>(Settings → Linked devices → Link a device).</p>` +
            `<img src="${image}" alt="pairing QR" style="image-rendering: pixelated"/>` +
            `<p>This code refreshes automatically — scan the code shown right now. An old screenshot will not link.</p>`
          : `<p>Preparing a fresh QR code… this page reloads by itself, no need to refresh.</p>`) +
      `</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  if (url.pathname === "/send-digest" && request.method === "POST") {
    if (!cfg.secret) {
      return json({
        error: "server not configured: WHATSAPP_SECRET is not set on the bot",
        hint: "Set WHATSAPP_SECRET on this service (Render env var or .env) to the same value the scheduler sends."
      }, 503);
    }
    if (!secretMatches(request.headers.get("x-send-secret"), cfg.secret)) {
      return json({
        error: "unauthorized: x-send-secret does not match this service's WHATSAPP_SECRET",
        hint: "The scheduler Worker's WHATSAPP_SECRET must equal the bot's WHATSAPP_SECRET."
      }, 401);
    }
    try {
      return json(await sendDigest(cfg, bot));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const detail = err.cause ? String(err.cause.message || err.cause) : undefined;
      return json({ error: err.message, ...(detail ? { detail } : {}) }, status);
    }
  }

  return json({ error: "not found" }, 404);
}

export async function run() {
  // Node does not read a .env file on its own. Load it when present so a local
  // `npm start` behaves like Render (which injects the vars itself); a missing
  // file is not an error. Existing environment variables always win.
  if (typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(); } catch { /* no .env file present */ }
  }
  const cfg = readConfig(process.env);
  const bot = createBot({ url: cfg.supabaseUrl, key: cfg.serviceKey || "", proxyUrl: cfg.proxyUrl });
  logBoot(cfg);

  const server = (await import("node:http")).createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      const fakeRequest = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]))
      });
      handle(fakeRequest, cfg, bot)
        .then(async (r) => {
          const body = await r.text();
          res.writeHead(r.status, Object.fromEntries(r.headers));
          res.end(body);
        })
        .catch((err) => {
          console.error(`[whatsapp] request failed: ${err.message || err}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "internal" }));
        });
    });
  });

  server.listen(cfg.port, () => console.log(`[whatsapp] http listening on :${cfg.port}`));

  const shutdown = () => {
    bot.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return server;
}

// Start when run directly (npm start). Tests import only src/digest.js, so this
// module is never loaded by the test suite.
run().catch((err) => {
  console.error(`[whatsapp] fatal: ${err.message || err}`);
  process.exit(1);
});