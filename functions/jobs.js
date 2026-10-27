// Cloudflare Pages Function — Route: GET /jobs
//
// /jobs is the real, crawlable URL for the jobs board, and it serves the SAME
// interactive board the app shows at /#jobs: the search box, the
// Jobs/Internships and Remote/Hybrid/Onsite chips, match-to-profile scoring,
// the draft-resume builder and the GitHub repo ranking all live in js/app.js,
// and none of them can exist without the SPA booting.
//
// This function used to render its own bare list of cards here instead. A Pages
// Function wins over the static asset on its route, so index.html was never
// served at /jobs and the app never booted — a visitor who opened /jobs got a
// dead page with no search, no filters and no apply button, while the board
// they remembered was only reachable at /#jobs. The fix is to serve index.html
// and let the router route it (js/app.js handleHash() maps /jobs to 'jobs').
//
// What the function still owns is the one thing the SPA cannot do before login:
// crawlers and chat-preview bots do not sign in, so the JobPosting structured
// data is rendered here, server-side, from the published jobs, and injected
// into the served index.html. A visitor who later signs in and passes the 80%
// gate gets the app's own version (js/app.js _injectJobsJsonLd), which reuses
// this same #jobs-jsonld element rather than adding a second one.
//
// Because the board is no longer gated (every listing shows to a signed-out
// visitor; only search, filters and match sit behind the profile), the SPA and a
// JS-rendering crawler both see real listings here. What the SPA still cannot do
// without booting is show anything to a reader or crawler that runs no JS at
// all, so this function now also writes the server-rendered board into
// #jobs-container. The SPA replaces that container wholesale on boot, so this is
// progressive enhancement, not duplicate content - and a no-JS crawler (or an
// asset binding that misbehaves) gets visible listings plus a real link into
// every per-job page instead of an empty div. Those per-job pages are still
// indexed from the sitemap and from each other - see functions/jobs/[slug].js
// and functions/sitemap.xml.js.
//
// Reading published jobs server-side requires SUPABASE_SERVICE_ROLE_KEY
// (Cloudflare Pages -> Settings -> Environment variables) because the jobs
// table's RLS is admin-only and the public read path is the get_published_jobs()
// RPC, which needs a candidate session. Without the key the page still serves
// the board — it just carries no structured salary or listing data.

import {
  DEFAULT_SUPABASE_URL, esc, safeApplyUrl, jsonLdBlock, fetchPublishedJobs, fetchBoardPage, jobSlug
} from "./lib/jobs-feed.js";
import { shareRow } from "./lib/share.js";
import { injectJobCount } from "./lib/job-count.js";
import { cacheMatch, cachePut, cacheState, withCacheState } from "./lib/page-cache.js";

export const META = {
  title: "Swapiki Jobs — IT, BFSI &amp; Internships in India",
  description:
    "Hand-sourced IT, BFSI and other openings across India on Swapiki Jobs. Apply with a proof-backed profile — real projects and a 2-minute voice walkthrough, no AI screening."
};

// The board draws this many cards, and fetches exactly this many rows - one
// request, one page, never the whole corpus. The exact published total comes
// back with that same request, so the page can still say "the first 200 of N"
// instead of pretending there are only 200.
//
// What the cap leaves out stays crawlable elsewhere: every job has its own
// /jobs/<slug> page carrying its own JobPosting, and functions/sitemap.xml.js
// lists all of them. The graph on this page must not describe several thousand
// jobs a reader cannot see - structured data that disagrees with the visible
// page is what earns a structured-data penalty, and at 6,000+ jobs it also cost
// this route seconds of server time and a multi-megabyte document.
const SHELL_LIST_CAP = 200;

const CATEGORY_ORDER = ["it", "bfsi", "any"];
const CATEGORY_LABEL = { it: "IT & Engineering", bfsi: "BFSI", any: "Other roles" };

/**
 * The published jobs, bucketed the way a job seeker browses them.
 *
 * Grouped by category because that is how the feed buckets them and how the
 * board is read - one flat wall of several hundred rows is not browsable. The
 * order is fixed so sections never reshuffle between requests, and a category we
 * do not recognise gets its own section rather than being dropped silently.
 */
const groupJobs = (jobs) => {
  const groups = [];
  for (const key of CATEGORY_ORDER) {
    const list = jobs.filter((j) => (j.category || "any") === key);
    if (list.length) groups.push({ key, label: CATEGORY_LABEL[key], jobs: list });
  }
  for (const key of [...new Set(jobs.map((j) => j.category || "any"))]) {
    if (!CATEGORY_ORDER.includes(key) && !groups.some((g) => g.key === key)) {
      groups.push({ key, label: CATEGORY_LABEL[key] || key, jobs: jobs.filter((x) => (x.category || "any") === key) });
    }
  }
  return groups;
};

/**
 * One listing as plain HTML.
 *
 * The job's own page is the link, and the apply button goes off-site. A
 * whole-card anchor would make the category and salary text look selectable but
 * be unclickable, and nesting the apply link inside it is invalid HTML.
 */
const jobCard = (j) => {
  const applyUrl = safeApplyUrl(j.apply_url);
  const title = esc(j.title);
  const href = `/jobs/${jobSlug(j)}`;
  // Share the job's own page, not the board — that is the URL a reader passes on
  // and the one the per-job page canonicalises to. Rendered here as well as in
  // the SPA because this board is what a no-JS visitor sees before the app boots.
  const share = shareRow(`https://swapiki.com${href}`, `${j.title}${j.company ? " at " + j.company : ""}`);
  return `
      <div style="border:1px solid #E1D9CB;border-radius:14px;padding:18px 20px;margin-bottom:14px;background:#fff;">
        <a href="${esc(href)}"
           style="font-weight:700;font-size:17px;color:#17130E;text-decoration:none;">${title}</a>
        <div style="font-size:13px;color:#5A5046;margin:4px 0 8px;">${esc(j.company)}${j.location ? " &middot; " + esc(j.location) : ""}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          <span style="font-size:11px;font-weight:700;background:#FBEDE6;color:#B9491F;padding:4px 10px;border-radius:999px;border:1px solid #F7DFD2;">${esc((j.category || "any").toUpperCase())}</span>
          ${j.salary ? `<span style="font-size:12px;color:#6B6156;">${esc(j.salary)}</span>` : ""}
          ${
            applyUrl
              ? `<a href="${esc(applyUrl)}" target="_blank" rel="noopener noreferrer nofollow"
                   style="margin-left:auto;font-size:12px;font-weight:700;color:#B9491F;text-decoration:none;border:1px solid #F7DFD2;background:#FBEDE6;padding:6px 14px;border-radius:999px;">Apply &rarr;</a>`
              : ""
          }
        </div>
        ${share}
      </div>`;
};

/**
 * The grouped, server-rendered card list. Shared by the injected shell and the
 * standalone no-JS fallback so the two can never drift apart.
 */
const renderBoardRows = (jobs) => (jobs.length
  ? groupJobs(jobs).map((g) => `
      <h2 style="font-size:20px;font-weight:700;color:#17130E;margin:28px 0 4px;">${esc(g.label)} <span style="font-size:13px;font-weight:600;color:#6B6156;">(${g.jobs.length})</span></h2>
      ${g.jobs.map(jobCard).join("")}`).join("")
  : `<p style="font-size:14px;color:#6B6156;">No open positions right now. Check back soon, or open the live board &mdash; new vetted openings are added regularly.</p>`);

/**
 * Rewrites index.html for the /jobs route: correct title/description/canonical
 * for the board (index.html is the site-wide shell, so its own canonical points
 * at the homepage), the server-rendered JobPosting JSON-LD, and the
 * server-rendered board written into #jobs-container so a no-JS reader or
 * crawler gets visible listings and a link into every per-job page.
 *
 * Every substitution is a no-op if the expected tag is missing, and the JSON-LD
 * is appended before </head> — or before </body>, or at the end — so a markup
 * change upstream degrades to "correct tags, missing structured data" rather
 * than a broken or empty page.
 */
export const injectJobsShell = (html, jobs, total) => {
  const shown = jobs.slice(0, SHELL_LIST_CAP);
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${META.title}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${esc(META.description)}" />`
    )
    .replace(
      /<link rel="canonical" href="[^"]*"\s*\/?>/i,
      '<link rel="canonical" href="https://swapiki.com/jobs" />'
    )
    .replace(
      /<meta property="og:url" content="[^"]*"\s*\/?>/i,
      '<meta property="og:url" content="https://swapiki.com/jobs" />'
    );

  // index.html is the site-wide shell, so it carries the homepage's "500+ job
  // listings" copy into this route too. Rewrite it with the exact total read
  // from the same board request — the same figure functions/index.js writes on
  // /. A no-op when the total is unavailable, so this never states a wrong size.
  out = injectJobCount(out, total);

  // Fill the mount point only when there are listings to show. Injecting the
  // empty-state message into a page that will boot the SPA would flash "No open
  // positions" at every visitor whenever the board read failed, which is a claim
  // about the world this request cannot make. The SPA replaces the container
  // wholesale on boot, so a visitor with JS still gets the interactive board.
  if (shown.length) {
    // The number shown is the number fetched, so the honest part of this line is
    // `total`, read from the same request. When the count is unavailable the line
    // is dropped rather than printed with a total the route does not have.
    const more =
      total > shown.length
        ? `<p style="font-size:13px;color:#6B6156;margin-top:20px;">Showing the first ${shown.length} of ${total} openings. <a href="/#jobs" style="color:#B9491F;font-weight:700;text-decoration:none;">Open the live board</a> to search them all.</p>`
        : "";
    out = out.replace(
      /<div id="jobs-container"><\/div>/i,
      `<div id="jobs-container">${renderBoardRows(shown)}${more}</div>`
    );
  }

  const block = jsonLdBlock();
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `  ${block}\n</head>`);
  if (/<\/body>/i.test(out)) return out.replace(/<\/body>/i, `  ${block}\n</body>`);
  return out + block;
};

/**
 * The whole document when the asset binding cannot serve index.html. The same
 * grouped card list the shell gets, wrapped in a standalone page.
 *
 * Titles point at the job's own page instead of straight off-site. That turns
 * the one page a no-JS crawler can read into an index of every per-job page,
 * which is the only internal link into that set that does not depend on the
 * board being ungated.
 */
const renderStaticFallback = (jobs) => {
  const rowsHtml = renderBoardRows(jobs);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${META.title}</title>
<meta name="description" content="${esc(META.description)}"/>
<meta name="robots" content="index, follow"/>
<link rel="canonical" href="https://swapiki.com/jobs"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="Swapiki"/>
<meta property="og:title" content="${META.title}"/>
<meta property="og:description" content="${esc(META.description)}"/>
<meta property="og:url" content="https://swapiki.com/jobs"/>
<meta property="og:image" content="https://swapiki.com/assets/og-image.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${META.title}"/>
<meta name="twitter:description" content="${esc(META.description)}"/>
<meta name="twitter:image" content="https://swapiki.com/assets/og-image.png"/>
${jsonLdBlock()}
</head>
<body style="margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#F7F3EC;color:#17130E;">
  <div style="max-width:800px;margin:0 auto;padding:32px 20px 64px;">
    <a href="/" style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;">
      <svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" rx="22" fill="#17130E"/>
        <rect x="40" y="17.5" width="20" height="35" rx="10" fill="#F7F3EC"/>
        <path d="M 26 47.5 A 24 24 0 0 0 74 47.5 L 67.5 47.5 A 17.5 17.5 0 0 1 32.5 47.5 Z" fill="#F7F3EC"/>
        <rect x="47" y="63" width="6" height="16.5" fill="#F7F3EC"/>
        <rect x="34" y="79" width="32" height="6.5" rx="3.25" fill="#F7F3EC"/>
      </svg>
      <span style="font-weight:800;font-size:20px;color:#17130E;">Swapiki</span>
    </a>

    <h1 style="font-size:32px;line-height:1.25;margin:32px 0 8px;color:#17130E;">Swapiki Jobs — IT, BFSI &amp; other roles in India</h1>
    <p style="font-size:15px;line-height:1.6;color:#5A5046;max-width:640px;margin:0 0 28px;">
      Hand-sourced openings shared by hiring teams. Every candidate applies with a <strong>proof-backed profile</strong> &mdash; real
      projects and a 2-minute voice walkthrough for human review. No AI screening bots.
    </p>

    ${rowsHtml}

    <div style="margin-top:24px;text-align:center;">
      <a href="/#jobs" style="display:inline-block;background:#E85D2A;color:#17130E;font-weight:700;font-size:15px;padding:13px 28px;border-radius:12px;text-decoration:none;">Open the live jobs board</a>
      <p style="font-size:12px;color:#8C8175;margin-top:12px;">Sign in and complete your profile to 80% to search, filter and match openings.</p>
    </div>
  </div>
</body>
</html>`;
};

export async function onRequestGet(context) {
  const { env, request } = context;
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=600",
    // HIT, MISS or OFF - see functions/lib/page-cache.js. Every one of these
    // routes answers the same way; the header is how a fetch can tell a warmed
    // edge from a route that had nowhere warm to look.
    "x-swapiki-cache": cacheState(context)
  };

  // A warm edge copy answers without running anything below. Every hit for the
  // next ten minutes is one lookup instead of a database round trip.
  const warm = await cacheMatch(context);
  if (warm) return withCacheState(warm, "HIT");

  const shellUrl = new URL("/index.html", request ? request.url : "https://swapiki.com/jobs");
  let res = null;
  try {
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      const assetRes = await env.ASSETS.fetch(shellUrl);
      if (assetRes && assetRes.ok) {
        const html = await assetRes.text();
        if (html && /jobs-container/.test(html)) {
          // One request for the rows this page draws and the exact total. The
          // whole published corpus is not read just to render 200 cards.
          const { jobs, total } = await fetchBoardPage(supabaseUrl, serviceKey, SHELL_LIST_CAP);
          res = new Response(injectJobsShell(html, jobs, total), { headers });
        }
      }
      if (!res) {
        console.warn("[jobs] could not load index.html from assets; serving the static board instead.");
      }
    }
  } catch (err) {
    console.warn("[jobs] index.html fetch threw:", err && err.message);
  }

  if (res) {
    await cachePut(context, res);
    return res;
  }

  // Asset binding broken: this page is the only board a visitor gets, so it does
  // need every published job. It is not cached - a degraded page served from the
  // edge for ten minutes is worse than a slow one served once.
  const jobs = await fetchPublishedJobs(supabaseUrl, serviceKey);
  return new Response(renderStaticFallback(jobs), { headers });
}
