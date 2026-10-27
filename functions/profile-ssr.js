// Server-side rendering for public candidate profiles.
//
// The candidate profile lives at https://<handle>.swapiki.com/. That app is a
// single-page application, so without this a crawler only ever sees the shell:
// the profile's name, role and projects do not exist in the HTML until the
// client script runs. Google renders JS for many pages, but social cards,
// answer engines and light crawlers do not, and a shared profile link is
// exactly the kind of URL that gets pasted into chat and search.
//
// So we fetch the deployed shell (index.html) and rewrite just its <head>:
// title, description, canonical, Open Graph, Twitter and a Person JSON-LD block
// all describe the profile instead of the marketing site. The body is left
// untouched, which means every visitor still gets the full SPA once the script
// boots — the SSR output is the same page with honest social/SEO metadata.

import { shareRow } from "./lib/share.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_cpyZT7-regpFjo2qmg0uYQ_j6qwoa21";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

// A stalled Supabase request must not stall the page itself: this lookup runs
// in front of the HTML document, so without a bound a slow upstream is a blank
// tab for the visitor. On timeout the fetch aborts and throws, which the
// middleware already treats as "could not tell" and answers by serving the
// plain SPA shell (the browser then loads the profile itself, with a retry).
const LOOKUP_TIMEOUT_MS = 4000;

async function fetchWithTimeout(url, init = {}, ms = LOOKUP_TIMEOUT_MS) {
  if (typeof AbortController === "undefined") return fetch(url, init);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches a candidate + their projects by username.
 *
 * Only PUBLISHED profiles are returned. The SPA deliberately shows drafts on
 * the subdomain during the pilot, but a draft has not been approved by its
 * owner to be a public, indexable page, so SSR must not publish it — the
 * middleware falls back to the SPA, which shows the draft privately as before.
 */
export async function getProfileForHandle(handle, env = {}) {
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_ANON_KEY;
  if (!handle) return null;

  const candUrl = supabaseUrl +
    "/rest/v1/candidates?username=eq." + encodeURIComponent(handle) +
    "&select=*&limit=1";

  // A transport or HTTP failure is NOT "no such profile" — it means we could
  // not tell. It is thrown so the caller can fall through to the SPA without
  // ever marking a real profile's page noindex. Only an empty result set or a
  // draft returns null (a definitive "not a published profile").
  const timeoutMs = Number(env.LOOKUP_TIMEOUT_MS) > 0 ? Number(env.LOOKUP_TIMEOUT_MS) : LOOKUP_TIMEOUT_MS;
  const res = await fetchWithTimeout(candUrl, {
    headers: { apikey: anonKey, Authorization: "Bearer " + anonKey }
  }, timeoutMs);
  if (!res.ok) throw new Error("candidates lookup failed: " + res.status);
  const candRows = await res.json();
  if (!Array.isArray(candRows) || candRows.length === 0) return null;

  const cand = candRows[0];
  if (!cand || (cand.profile_status && cand.profile_status !== "published")) return null;

  let projects = [];
  try {
    const projUrl = supabaseUrl +
      "/rest/v1/projects?candidate_id=eq." + encodeURIComponent(cand.id) +
      "&select=*&order=position.asc&limit=20";
    const res = await fetchWithTimeout(projUrl, {
      headers: { apikey: anonKey, Authorization: "Bearer " + anonKey }
    }, timeoutMs);
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) projects = rows;
    }
  } catch (e) {
    // A profile without projects still renders.
  }

  return { cand, projects };
}

function profileCopy(handle, profile) {
  const name = profile.cand.name || handle;
  const title = profile.cand.title || "Software Professional";
  const url = "https://" + handle + ".swapiki.com/";
  const bits = [name, title].filter(Boolean).join(" \u2014 ");
  const location = profile.cand.location ? " Based in " + profile.cand.location + "." : "";
  const projectCount = profile.projects.length;
  const description =
    bits + " on Swapiki." + location + " " +
    (projectCount === 1 ? "1 project" : projectCount + " projects") +
    " with a recorded walkthrough in their own voice.";
  return { name, title, url, description };
}

function personJsonLd(handle, profile) {
  const { name, title, url, description } = profileCopy(handle, profile);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    jobTitle: title,
    description,
    url,
    ...(profile.cand.location ? { address: profile.cand.location } : {}),
    knowsAbout: Array.isArray(profile.cand.expertise) ? profile.cand.expertise.slice(0, 12) : undefined
  };
}

/**
 * Rewrites the shell's <head> for one profile, leaving the <body> (and therefore
 * the SPA boot) exactly as deployed.
 */
export function injectProfileMeta(html, handle, profile) {
  const { name, title, url, description } = profileCopy(handle, profile);
  const fullTitle = name + " \u2014 " + title + " | Swapiki";
  const e = esc;
  const jsonLd = JSON.stringify(personJsonLd(handle, profile)).replace(/</g, "\\u003c");

  let out = html;

  out = out.replace(/<title>[\s\S]*?<\/title>/i,
    "<title>" + e(fullTitle) + "</title>");

  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    '<meta name="description" content="' + e(description) + '">'
  );

  out = out.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    '<link rel="canonical" href="' + e(url) + '">'
  );

  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    '<meta property="og:title" content="' + e(fullTitle) + '">'
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    '<meta property="og:description" content="' + e(description) + '">'
  );
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    '<meta property="og:url" content="' + e(url) + '">'
  );
  out = out.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
    '<meta property="og:type" content="profile">'
  );

  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    '<meta name="twitter:title" content="' + e(fullTitle) + '">'
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    '<meta name="twitter:description" content="' + e(description) + '">'
  );

  out = out.replace(/<\/head>/i,
    '<script type="application/ld+json">' + jsonLd + "</script>\n</head>");

  // Give crawlers that do not run JS the profile itself, not the marketing
  // shell. The SPA's Router.init() strips `active-view` from every
  // `.view-section` before it routes, so this section is visible to a crawler
  // (and to a human before the script boots) and then handed off to the real
  // candidate view the moment the app runs. The landing section is demoted so
  // the initial paint is the profile, not the homepage.
  out = out.replace(/(<body\b[^>]*>)/i, "$1\n" + renderProfileBody(handle, profile));
  out = out.replace(
    /<section id="view-landing"([^>]*?)class="([^"]*)\bactive-view\b([^"]*)"/i,
    '<section id="view-landing"$1class="$2$3"'
  );

  return out;
}

/**
 * A semantic, crawlable block describing the candidate. Rendered into the body
 * of the SSR page; the SPA hides it on boot, so it is never shown twice. Kept
 * deliberately plain (no fabricated badges, no verification language) so a
 * non-JS reader gets exactly the facts a JS reader gets.
 */
export function renderProfileBody(handle, profile) {
  const { name, title, url } = profileCopy(handle, profile);
  const cand = profile.cand || {};
  const bio = cand.bio || cand.summary || "";
  const location = cand.location || "";
  const expertise = Array.isArray(cand.expertise) ? cand.expertise.filter(Boolean) : [];

  const projectItems = (profile.projects || []).slice(0, 6).map((p) => {
    const t = p.title || "Project";
    const blurb = p.impact || p.problem || (Array.isArray(p.takeaways) ? p.takeaways[0] : "");
    return "<li><h3>" + esc(t) + "</h3>" + (blurb ? "<p>" + esc(blurb) + "</p>" : "") + "</li>";
  }).join("");

  return '<section id="view-ssr-profile" class="view-section active-view">\n' +
    '<main class="pt-8 px-margin-mobile md:px-gutter max-w-container-max mx-auto">\n' +
    "<h1>" + esc(name) + "</h1>\n" +
    "<p>" + esc(title) + (location ? " \u2014 " + esc(location) : "") + "</p>\n" +
    (bio ? "<p>" + esc(bio) + "</p>\n" : "") +
    (expertise.length ? "<p>Skills: " + esc(expertise.join(", ")) + "</p>\n" : "") +
    (projectItems ? "<h2>Selected projects</h2>\n<ul>\n" + projectItems + "</ul>\n" : "") +
    '<p><a href="' + esc(url) + '">' + esc(name) + " on Swapiki</a> \u00b7 " +
    '<a href="/jobs">Browse open roles</a></p>\n' +
    shareRow(url, name + " on Swapiki") + "\n" +
    "</main>\n</section>";
}

/**
 * Marks the shell as a soft-404: the subdomain/handle resolves but there is no
 * published profile behind it. The SPA is left intact so a draft owner can still
 * preview their own page, but crawlers are told not to index it and the
 * homepage canonical is dropped so this URL cannot be folded into the homepage.
 */
export function injectNoindex(html) {
  let out = html.replace(
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
    '<meta name="robots" content="noindex, nofollow">'
  );
  if (!/name="robots"/i.test(out)) {
    out = out.replace(/<\/head>/i, '<meta name="robots" content="noindex, nofollow">\n</head>');
  }
  out = out.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>\s*/i, "");
  return out;
}

/**
 * A self-contained fallback used only when the shell cannot be fetched (an
 * asset failure). It still gives a crawler the honest facts rather than a
 * bare shell, and offers a link back into the app.
 */
export function renderProfileHTML(handle, profile) {
  const { name, title, url, description } = profileCopy(handle, profile);
  const items = profile.projects.slice(0, 5).map((p) => {
    const t = p.title || "Project";
    const impact = p.impact || (Array.isArray(p.takeaways) ? p.takeaways[0] : "");
    return "<li><strong>" + esc(t) + "</strong>" + (impact ? " \u2014 " + esc(impact) : "") + "</li>";
  }).join("");
  const jsonLd = JSON.stringify(personJsonLd(handle, profile)).replace(/</g, "\\u003c");
  return "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n" +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    "<title>" + esc(name + " \u2014 " + title + " | Swapiki") + "</title>\n" +
    '<link rel="canonical" href="' + esc(url) + '">\n' +
    '<meta name="description" content="' + esc(description) + '">\n' +
    '<meta property="og:type" content="profile">\n' +
    '<meta property="og:title" content="' + esc(name + " \u2014 " + title + " | Swapiki") + '">\n' +
    '<meta property="og:description" content="' + esc(description) + '">\n' +
    '<meta property="og:url" content="' + esc(url) + '">\n' +
    '<script type="application/ld+json">' + jsonLd + "</script>\n</head>\n<body>\n<main>\n" +
    "<h1>" + esc(name) + "</h1>\n<p>" + esc(title) + "</p>\n" +
    (items ? "<h2>Selected projects</h2><ul>" + items + "</ul>" : "") +
    '<p><a href="/">Open this profile on Swapiki</a></p>\n</main>\n</body>\n</html>';
}