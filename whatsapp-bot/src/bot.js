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

import makeWASocket, { DisconnectReason, initAuthCreds, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { loadSession, saveSession } from "./session.js";

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
  let booting = null;

  /** The QR currently being offered, or null when already paired/connecting. */
  const qr = () => latestQr;

  /** True when the socket has a live WhatsApp connection. */
  const connected = () => isOpen;

  /** The current WA Web client version, or null (Baileys' bundled value) if unfetchable. */
async function currentWaVersion() {
  try {
    const { version } = await fetchLatestBaileysVersion();
    return Array.isArray(version) && version.length === 3 ? version : null;
  } catch {
    return null;
  }
}

async function connect() {
    if (booting) return booting;
    booting = (async () => {
      if (stopped) return;
      const auth = await loadAuthState(db);
      // WhatsApp periodically raises the minimum accepted Web client version; when
      // Baileys' bundled number goes stale, the link handshake fails on the phone
      // with "Couldn't link devices". Resolve the current version at boot so the
      // QR offered is actually accepted by the phone.
      const version = await currentWaVersion();
      const socket = makeWASocket({
        version,
        auth: auth.state,
        printQRInTerminal: false,
        browser: ["Swapiki Jobs", "Chrome", "Linux"],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        keepAliveIntervalMs: 30000
      });
      sock = socket;
      socket.ev.on("creds.update", auth.save);
      socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr: qrCode } = update;
        if (typeof qrCode === "string" && qrCode.length > 0) latestQr = qrCode;
        if (connection === "open") {
          isOpen = true;
          latestQr = null;
          console.log("[whatsapp] connected as " + (socket.user?.id || "wa"));
        }
        if (connection === "close") {
          isOpen = false;
          sock = null;
          const code = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          console.log(`[whatsapp] socket closed (code=${code || "?"})`);
          if (loggedOut) {
            // The number unlinked this device; drop the session so a fresh QR
            // is offered instead of retrying a dead credential.
            console.log("[whatsapp] device logged out - session cleared, re-pair required");
            latestQr = null;
            await saveSession(db, { creds: {}, keys: {} }).catch(() => {});
          }
          if (!stopped) {
            // Wait a second so a crash-loop cannot spin the socket, then bring it
            // back — keeps the digest sender ready through Render restarts.
            setTimeout(() => { booting = null; connect().catch(() => {}); }, 1000);
          }
        }
      });
    })();
    return booting;
  }

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
    if (sock) sock.end(new Error("service stopping"));
  }

  connect().catch((err) => console.error(`[whatsapp] boot failed: ${err.message || err}`));

  return { qr, connected, sendText, waitOpen, stop };
}