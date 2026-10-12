//   Baileys socket lifecycle for the digest bot.
//
//   Baileys implements the WhatsApp Web multi-device protocol: a Node process
//   with a persistent WebSocket connection acts as one of the number's linked
//   devices. Because the connection must stay open, this service CANNOT live in
//   Cloudflare Pages/Workers — it runs on its own always-on Node host and is
//   triggered there by an HTTP call from the Cloudflare scheduler.
//
//   The first run has no saved session, so Baileys emits a QR code
//   (`connection.update` carrying `qr`). Scan it with the bot's WhatsApp number,
//   wait for `connection === "open"`, and from then on the session blob is kept
//   in Supabase and the socket reconnects by itself (with an auto-reconnect on
//   any drop, so a Render restart does not need a human).

import makeWASocket, {
  DisconnectReason,
  initAuthCreds,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  Browsers
} from "@whiskeysockets/baileys";
import httpsProxyAgent from "https-proxy-agent";
import { loadSession, saveSession } from "./session.js";

const { HttpsProxyAgent } = httpsProxyAgent;

/** Small auth-state adapter between Baileys' keyed signal store and our blob. */
async function loadAuthState(db) {
  const saved = await loadSession(db).catch(() => null);
  // A fresh (or partial/corrupt) session has no keys: seeding the creds with
  // initAuthCreds() gives Baileys the noiseKey/identityKey/signedPreKey it will
  // need for the very first handshake. Without it creds.noiseKey is undefined
  // and processHandshake crashes before a pairing QR is ever emitted.
  const creds = saved && saved.creds && saved.creds.noiseKey ? saved.creds : initAuthCreds();
  const map = new Map(Object.entries((saved && saved.keys) || {}));
  const keys = {
    async get(type, ids) {
      const out = {};
      for (const id of ids || []) {
        const value = map.get(`${type}|${id}`);
        if (value !== undefined) out[id] = value;
      }
      return out;
    },
    async set(type, data) {
      for (const [id, value] of Object.entries(data || {})) map.set(`${type}|${id}`, value);
    }
  };
  return {
    state: { creds, keys },
    save: async () => {
      await saveSession(db, { creds, keys: Object.fromEntries(map) }).catch(() => {});
    }
  };
}

export function createBot(db) {
  let sock = null;
  let stopped = false;
  let isOpen = false;
  let latestQr = null;
  let latestQrAt = 0;
  let lastUpdateAt = Date.now();
  let lastDisconnectCode = null;
  let reconnectAttempts = 0;
  let booting = null;
  let proxyAgentP = null;
  // The in-flight session write. A pairing "restart required" (515) arrives
  // immediately after pair-success, so we must let this finish before
  // reconnecting or the new socket loads creds without `me` and pairs again.
  let pendingSave = Promise.resolve();

  /**
   * A proxy agent for the WhatsApp connection, from db.proxyUrl. WhatsApp
   * blocks new-device linking from many datacenter IPs (Render included), so
   * routing the socket through a residential/mobile proxy is what makes a
   * cloud-hosted bot link at all. Supports http(s):// and socks(5):// URLs.
   */
  function getProxyAgent() {
    if (!db.proxyUrl) return Promise.resolve(null);
    if (!proxyAgentP) {
      proxyAgentP = (async () => {
        const scheme = new URL(db.proxyUrl).protocol;
        if (scheme === "socks:" || scheme === "socks5:" || scheme === "socks4:") {
          const { SocksProxyAgent } = await import("socks-proxy-agent");
          console.log("[whatsapp] using SOCKS proxy");
          return new SocksProxyAgent(db.proxyUrl);
        }
        console.log("[whatsapp] using HTTP(S) proxy");
        return new HttpsProxyAgent(db.proxyUrl);
      })().catch((err) => {
        console.warn(`[whatsapp] proxy setup failed, connecting directly: ${err.message || err}`);
        return null;
      });
    }
    return proxyAgentP;
  }

  /** The QR currently being offered, or null when already paired/connecting. */
  const qr = () => latestQr;

  /** Age of the QR currently on offer, in ms (null when no QR is offered). */
  const qrAgeMs = () => (latestQr ? Date.now() - latestQrAt : null);

  /** True when the socket has a live WhatsApp connection. */
  const connected = () => isOpen;

  /**
   * The WA Web client version to present. WhatsApp rejects a new-device link
   * offered with a stale Web build ("Couldn't link device" on the phone), and
   * Baileys' bundled `fetchLatestBaileysVersion()` goes stale for months.
   * `fetchLatestWaWebVersion()` reads the live build straight from
   * web.whatsapp.com/sw.js, which is what the phone actually checks against.
   */
  async function currentWaVersion(proxyAgent) {
    const opts = proxyAgent ? { httpsAgent: proxyAgent, httpAgent: proxyAgent, proxy: false } : {};
    for (const fetchVersion of [fetchLatestWaWebVersion, fetchLatestBaileysVersion]) {
      try {
        const { version } = await fetchVersion(opts);
        if (Array.isArray(version) && version.length === 3) {
          console.log(`[whatsapp] WA Web version ${version.join(".")} (${fetchVersion.name})`);
          return version;
        }
      } catch (err) {
        console.warn(`[whatsapp] ${fetchVersion.name} failed: ${err.message || err}`);
      }
    }
    return null;
  }

  function connect() {
    if (booting) return booting;
    booting = (async () => {
      if (stopped) return null;
      lastUpdateAt = Date.now();
      const auth = await loadAuthState(db);
      const proxyAgent = await getProxyAgent();
      const version = await currentWaVersion(proxyAgent);
      const socket = makeWASocket({
        version,
        auth: auth.state,
        printQRInTerminal: false,
        // Format is [os, browser, osVersion]. A made-up first element (e.g. the
        // app name) is not a real Web sub-platform and WhatsApp refuses to link
        // it; use a valid desktop descriptor instead.
        browser: Browsers.ubuntu("Chrome"),
        // Route the socket (and media fetches) through the proxy when set.
        agent: proxyAgent || undefined,
        fetchAgent: proxyAgent || undefined,
        // Re-issue the QR every 20s instead of the 60s default so a QR on
        // screen is never more than a few seconds from WhatsApp's current ref.
        qrTimeout: 20000,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        keepAliveIntervalMs: 30000
      });
      const startedAt = Date.now();
      sock = socket;
      socket.ev.on("creds.update", () => { pendingSave = auth.save(); });
      socket.ev.on("connection.update", async (update) => {
        lastUpdateAt = Date.now();
        const { connection, lastDisconnect, qr: qrCode } = update;
        if (typeof qrCode === "string" && qrCode.length > 0) {
          if (qrCode !== latestQr) console.log("[whatsapp] pairing QR issued");
          latestQr = qrCode;
          latestQrAt = Date.now();
        } else if ("qr" in update && !qrCode && !isOpen) {
          // Baileys explicitly clears the QR during (re)connect and after a
          // successful pair. Stop serving the old one as if it were live.
          latestQr = null;
        }
        if (connection === "open") {
          isOpen = true;
          latestQr = null;
          reconnectAttempts = 0;
          console.log("[whatsapp] connected as " + (socket.user?.id || "wa"));
        }
        if (connection === "close") {
          isOpen = false;
          sock = null;
          const code = lastDisconnect?.error?.output?.statusCode;
          lastDisconnectCode = code || null;
          const loggedOut = code === DisconnectReason.loggedOut;
          console.log(`[whatsapp] socket closed (code=${code || "?"})`);
          if (loggedOut) {
            // The number unlinked this device; drop the session so a fresh QR
            // is offered instead of retrying a dead credential.
            console.log("[whatsapp] device logged out - session cleared, re-pair required");
            latestQr = null;
            await saveSession(db, { creds: {}, keys: {} }).catch(() => {});
          }
          if (stopped) return;
          await pendingSave.catch(() => {});
          // Back off when the socket keeps dropping fast, so we never hammer
          // WhatsApp (rapid retries can prolong a link block); but a 515 pair
          // restart must reconnect at once so the pairing lands.
          let delayMs;
          if (code === DisconnectReason.restartRequired) {
            delayMs = 250;
          } else {
            const livedMs = Date.now() - startedAt;
            reconnectAttempts = livedMs > 60000 ? 1 : reconnectAttempts + 1;
            delayMs = Math.min(1000 * 2 ** Math.min(reconnectAttempts, 6), 120000);
          }
          console.log(`[whatsapp] reconnecting in ${Math.round(delayMs / 1000)}s`);
          setTimeout(() => { booting = null; connect().catch(() => {}); }, delayMs);
        }
      });
      return socket;
    })();
    // Let a failed boot be retried instead of pinning a rejected promise.
    booting.catch(() => { booting = null; });
    return booting;
  }

  /**
   * Wipes the stored session and starts a fresh pairing session, so the pairing
   * page serves a new QR. Used after a bad/partial link attempt, or when the
   * phone says "scan the QR again".
   */
  async function reset() {
    console.log("[whatsapp] session reset requested");
    latestQr = null;
    latestQrAt = 0;
    reconnectAttempts = 0;
    await saveSession(db, { creds: {}, keys: {} }).catch(() => {});
    if (sock) { try { sock.end(new Error("session reset")); } catch { /* ignore */ } }
    sock = null;
    booting = null;
    connect().catch(() => {});
  }

  const usingProxy = () => Boolean(db.proxyUrl);
  const lastDisconnect = () => lastDisconnectCode;

  // Watchdog: a half-open socket can stall without ever emitting "close",
  // leaving the last QR frozen on the pairing page forever (and the phone
  // rejecting it). If we are unpaired and nothing has moved for a while, tear
  // the socket down and start a fresh pairing session.
  const watchdog = setInterval(() => {
    if (stopped || isOpen) return;
    const idleMs = Date.now() - lastUpdateAt;
    const qrStale = latestQr && Date.now() - latestQrAt > 90000;
    if (idleMs > 90000 || qrStale) {
      console.warn(`[whatsapp] watchdog: pairing idle ${Math.round(idleMs / 1000)}s - restarting socket`);
      latestQr = null;
      if (sock) { try { sock.end(new Error("stale pairing socket")); } catch { /* ignore */ } }
      sock = null;
      booting = null;
      connect().catch(() => {});
    }
  }, 15000);
  if (typeof watchdog.unref === "function") watchdog.unref();

  /** Waits until the socket is open, or false after `timeoutMs`. */
  async function waitOpen(timeoutMs) {
    const start = Date.now();
    while (!isOpen && !stopped) {
      if (Date.now() - start > timeoutMs) return false;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return isOpen;
  }

  /**
   * Sends one plain-text message to `jid` (a group ends in @g.us).
   *
   * Not connected / still pairing times out rather than hanging forever, so the
   * HTTP layer can answer 503 "not paired yet" instead of wedging a request.
   */
  async function sendText(jid, text, timeoutMs = 60000) {
    const socket = await connect();
    if (!socket || !(await waitOpen(timeoutMs))) {
      throw new Error("WhatsApp is not connected. Scan the QR code on the pairing page first.");
    }
    await socket.sendMessage(jid, { text: String(text) }, { linkPreview: true });
  }

  /** Closes the socket for good (shutdown path). */
  function stop() {
    stopped = true;
    clearInterval(watchdog);
    if (sock) sock.end(new Error("service stopping"));
  }

  connect().catch((err) => console.error(`[whatsapp] boot failed: ${err.message || err}`));

  return { qr, qrAgeMs, connected, usingProxy, lastDisconnect, sendText, waitOpen, reset, stop };
}