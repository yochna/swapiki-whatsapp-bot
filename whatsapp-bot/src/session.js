//   Persisted Baileys (WhatsApp Web) auth state, backed by Supabase.
//
//   Baileys needs its multi-device credentials to survive restarts. The host is
//   expected to have an ephemeral disk (Render free), so the standard
//   useMultiFileAuthState() would lose the pairing on every redeploy and
//   re-print a QR. Instead the whole { creds, keys } blob is stored in the
//   whatsapp_session table (see supabase/whatsapp_digest_migration.sql) and
//   reloaded at boot.
//
//   The shape matches what Baileys' own multi-file store keeps: credentials plus
//   a flat map of signal keys keyed by "type|id".

import { rest } from "./supabase.js";

const TABLE = "whatsapp_session";
const SELECT = `${TABLE}?select=payload&id=eq.1`;

/** The saved auth blob, or null the first time before any pairing. */
export async function loadSession(db) {
  const rows = await rest(db.url, db.key, SELECT);
  const row = rows && rows[0];
  return (row && row.payload) || null;
}

/** Upserts the whole auth blob. Failures are swallowed: a lost session only re-prints a QR. */
export async function saveSession(db, payload) {
  await rest(db.url, db.key, TABLE, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: 1, payload, updated_at: new Date().toISOString() })
  });
}