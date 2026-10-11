// A one-click share row for the server-rendered public pages.
//
// Job pages and profile pages are the URLs people actually paste into a chat.
// The SPA has its own share modal (js/app.js getShareUrl), but a crawler- or
// no-JS-visible page cannot open it, and a visitor who lands on a job from a
// search result has no share control at all. This renders the same four
// destinations as plain anchors so it works with the script off.
//
// Every link is an off-site intent URL built from OUR canonical URL, never from
// visitor input, so there is nothing here an attacker can steer. Copy-link is a
// button rather than an anchor because there is no URL for "copy", and it fails
// silently (the anchor row still works) when the Clipboard API is unavailable.

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const BTN = "display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#1E3A8A;" +
  "background:#EEF2FF;border:1px solid #C7D2FE;padding:7px 14px;border-radius:999px;text-decoration:none;";

/**
 * @param {string} url  the canonical URL of the page being shared (our own).
 * @param {string} text a short human label, e.g. the job title or a name.
 * @returns {string} a self-contained share row.
 */
export function shareRow(url, text) {
  const u = esc(url);
  const t = esc(text || url);
  const eu = encodeURIComponent(String(url || ""));
  const et = encodeURIComponent(String(text || ""));
  // wa.me wants the text and the link in one field; the others take them apart.
  const intents = [
    ["X", `https://twitter.com/intent/tweet?text=${et}&url=${eu}`],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${eu}`],
    ["WhatsApp", `https://wa.me/?text=${et}%20${eu}`],
    ["Email", `mailto:?subject=${et}&body=${eu}`]
  ];
  const anchors = intents
    .map(([label, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="${BTN}">${label}</a>`)
    .join("");

  // The URL is double-quoted inside a single-quoted JS string literal; escaping
  // both quote styles keeps it inert whatever the path contains.
  const jsUrl = String(url || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
  const copy =
    `<button type="button" onclick="try{navigator.clipboard&&navigator.clipboard.writeText('${jsUrl}')}catch(e){}" ` +
    `style="${BTN}cursor:pointer;">Copy link</button>`;

  return '<div class="swapiki-share" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:18px 0 0;">' +
    '<span style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748B;">Share</span>' +
    anchors + copy +
    "</div>";
}