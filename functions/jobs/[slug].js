// Cloudflare Pages Function — Route: GET /jobs/<slug>
//
// One page per published job.
//
// This exists because of how the board works. The 80% gate means the SPA never
// renders job text for a signed-out visitor, and js/app.js replaces
// #jobs-container wholesale when it boots, so a crawler following the real
// /jobs page sees a sign-in wall with nothing in it but a JSON-LD blob. Every
// one of the several hundred openings therefore shared a single URL, and that
// one URL had to rank for every query at once - "software engineer jobs",
// "BFSI openings in Pune", one company's careers page - which is the worst
// possible shape for it.
//
// A per-job page fixes the three things that page cannot do. It has its own
// address, so it can rank for its own title, company and location instead of
// competing with every other job on one URL. It has real HTML text, because
// nothing here depends on the SPA booting. And it can be listed in the sitemap
// and linked from its neighbours, which is how a crawler finds any of it.
//
// The listing board is NOT the discovery path and this route does not pretend to
// be one. The board stays gated, and the crawls run sitemap -> job page ->
// related job pages.

import {
  DEFAULT_SUPABASE_URL, esc, safeApplyUrl, jsonForScript, jsonLdBlock,
  fetchPublishedJobById, fetchPublishedJobs, jobSlug, idFromSlug, jobPostingFor
} from "../lib/jobs-feed.js";
import {
  SITE_URL, ORG_ID, SITE_ID, graph, itemList, organization, website
} from "../lib/schema.js";
import { shareRow } from "../lib/share.js";

const SITE = SITE_URL;

/**
 * Feed markup reduced to plain text.
 *
 * Returns UNESCAPED text: tags are dropped and entities decoded, and the caller
 * escapes exactly once. Escaping here as well would double-encode - a literal
 * "&" would reach the page as "&amp;amp;" and render as "&amp;" in the meta
 * description, which is what Google reads.
 */
const textOnly = (raw) => String(raw == null ? "" : raw)
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, " ")
  .trim();

/**
 * The one-line summary under the title.
 *
 * Built only from fields the feed stated. A description is trimmed to a length
 * that fits a search result rather than padded out to hit a target, and when
 * the feed gave no description at all the sentence is just the facts - which is
 * a weaker listing, not a broken one.
 */
const metaDescriptionFor = (j) => {
  const bits = [];
  if (j.company) bits.push(j.company);
  if (j.location) bits.push(`in ${j.location}`);
  if (j.salary) bits.push(j.salary);
  const lead = bits.length ? `${bits.join(", ")}.` : "";
  const body = textOnly(j.description).slice(0, 140);
  const trimmed = body.length > 140 ? `${body.slice(0, 137).replace(/\s+\S*$/, "")}...` : body;
  const sentence = `${lead} ${trimmed}`.replace(/\s+/g, " ").trim();
  return (
    sentence.slice(0, 300) ||
    `${j.title || "This role"} on Swapiki. Apply with a proof-backed profile.`
  );
};

const pageTitleFor = (j) => {
  const company = j.company ? ` at ${j.company}` : "";
  const place = j.location ? `, ${j.location}` : "";
  return `${j.title || "Open role"}${company}${place} | Swapiki Jobs`;
};

/**
 * Related openings, same category first.
 *
 * Two purposes and both matter: a visitor who landed on one job from search has
 * somewhere to go next, and each job page passes internal links to its
 * neighbours, which is what turns a pile of pages into something a crawler can
 * walk. The count is small on purpose - a page that links to 300 jobs is a page
 * nobody reads to the end.
 */
const relatedFor = (all, job, limit = 8) => {
  const sameCat = all.filter((o) => o.id !== job.id && (o.category || "any") === (job.category || "any"));
  // Neighbours from the other categories top the list up to `limit`, so a job in
  // a thin category still hands the crawler somewhere to go instead of dead-ending
  // on one or two links. Same-category jobs always come first.
  const rest = all.filter((o) => o.id !== job.id && (o.category || "any") !== (job.category || "any"));
  return sameCat.concat(rest).slice(0, limit);
};

const shell = (title, description, canonical, jsonLd, crumbText, bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<link rel="canonical" href="${esc(canonical)}"/>
<meta property="og:type" content="article"/>
<meta property="og:site_name" content="Swapiki"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:image" content="${SITE}/assets/og-image.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(description)}"/>
<meta name="twitter:image" content="${SITE}/assets/og-image.png"/>
${jsonLd}
</head>
<body style="margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#F8FAFC;color:#0F172A;">
  <div style="max-width:760px;margin:0 auto;padding:28px 20px 72px;">
    <a href="/" style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;">
      <span style="font-weight:800;font-size:20px;color:#1E3A8A;">Swapiki</span>
    </a>
    <nav aria-label="Breadcrumb" style="font-size:12px;color:#64748B;margin:22px 0 0;">
      <a href="/jobs" style="color:#1E3A8A;">Jobs in India</a>
      <span aria-hidden="true"> / </span>${esc(crumbText)}
    </nav>
${bodyHtml}
  </div>
</body>
</html>`;

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = (params && (params.slug || params["*"] || params.path)) || "";
  const id = idFromSlug(slug);

  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";

  // A path that carries no uuid cannot be a job. Answering 404 immediately keeps
  // a crawler from treating /jobs/anything-at-all as a soft 404 worth retrying.
  if (!id) {
    return new Response(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Job not found | Swapiki</title>` +
        `<meta name="robots" content="noindex, follow"/><link rel="canonical" href="${SITE}/jobs"/></head>` +
        `<body style="font-family:system-ui;padding:40px"><h1>That job link isn't valid</h1>` +
        `<p><a href="/jobs">Browse all open jobs</a></p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } }
    );
  }

  const job = await fetchPublishedJobById(supabaseUrl, serviceKey, id);

  if (!job) {
    return new Response(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Job no longer open | Swapiki</title>` +
        `<meta name="robots" content="noindex, follow"/><link rel="canonical" href="${SITE}/jobs"/></head>` +
        `<body style="font-family:system-ui;padding:40px"><h1>This role is no longer listed</h1>` +
        `<p>It may have been filled or withdrawn.</p>` +
        `<p><a href="/jobs">Browse all open jobs</a></p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600" } }
    );
  }

  // The canonical is derived from the CURRENT title, so a listing Adzuna has
  // since renamed is served at its old address too and points search engines at
  // the one true URL instead of leaving two pages to compete.
  const canonical = `${SITE}/jobs/${jobSlug(job)}`;
  const title = pageTitleFor(job);
  const description = metaDescriptionFor(job);
  const applyUrl = safeApplyUrl(job.apply_url);
  const bodyText = textOnly(job.description);
  const related = await relatedList(env, supabaseUrl, serviceKey, job);

  const postingId = `${canonical}#posting`;
  const postedOn = String(job.first_seen_at || "").slice(0, 10) || "";

  // One connected graph: the org and the site, the page itself pointing at both,
  // the breadcrumb trail, the posting, and the neighbours as an ordered list.
  //
  // The page node exists so `mainEntity` can point at the posting by @id, which
  // is what lets an answer engine treat this document as the source FOR that job
  // rather than two facts that happen to share a page. The neighbours are an
  // ItemList because that section really is an ordered set, and an ordered set
  // is what makes "similar roles" answerable instead of just linkable.
  const jsonLd = `<script type="application/ld+json" id="job-jsonld">${jsonForScript(
    graph([
      organization(),
      website(),
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        isPartOf: { "@id": SITE_ID },
        about: { "@id": ORG_ID },
        mainEntity: { "@id": postingId },
        ...(postedOn ? { datePublished: postedOn, dateModified: postedOn } : {})
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Jobs in India", item: `${SITE}/jobs` },
          { "@type": "ListItem", position: 3, name: job.title || "Open role", item: canonical }
        ]
      },
      jobPostingFor(job),
      related.length
        ? itemList(
            `Other open roles alongside ${job.title || "this role"}`,
            related.map((o) => ({ url: `${SITE}/jobs/${jobSlug(o)}`, name: o.title })),
            { id: `${canonical}#related` }
          )
        : null
    ])
  )}</script>`;

  const facts = [
    jLabel("Company", job.company),
    jLabel("Location", job.location),
    jLabel("Salary", job.salary),
    jLabel("Category", job.category ? String(job.category).toUpperCase() : "")
  ].filter(Boolean).join("");

  const bodyHtml = `
    <article style="margin:22px 0 0;">
      <h1 style="font-size:30px;line-height:1.22;margin:0 0 6px;color:#0F172A;">${esc(job.title || "Open role")}</h1>
      <p style="font-size:15px;color:#475569;margin:0 0 18px;">${esc(job.company || "Employer not stated")}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 24px;">
        ${facts}
        ${
          applyUrl
            ? `<a href="${esc(applyUrl)}" target="_blank" rel="noopener noreferrer nofollow"
                 style="margin-left:auto;font-size:13px;font-weight:700;color:#fff;background:#1E3A8A;padding:11px 22px;border-radius:999px;text-decoration:none;">Apply on the job site &rarr;</a>`
            : `<span style="margin-left:auto;font-size:12px;color:#64748B;">No direct apply link &mdash; ask the hiring team</span>`
        }
      </div>

      <h2 style="font-size:19px;margin:28px 0 8px;color:#0F172A;">About this role</h2>
      <div style="font-size:15px;line-height:1.72;color:#334155;">
        ${
          bodyText
            ? esc(bodyText)
            : `<p style="color:#64748B;">The employer has not published a description for this role. The facts above come straight from the listing.</p>`
        }
      </div>

      <h2 style="font-size:19px;margin:34px 0 10px;color:#0F172A;">How to apply on Swapiki</h1>
      <p style="font-size:15px;line-height:1.72;color:#334155;margin:0;">
        Send a proof-backed profile instead of a CV: real projects with what you built, plus a
        2-minute voice walkthrough so a hiring manager can hear you explain it. No AI screening
        and no automated ranking &mdash; a person reads it.
      </p>
      <p style="margin:16px 0 0;">
        <a href="/signup" style="display:inline-block;background:#1E3A8A;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:999px;text-decoration:none;">Create your profile</a>
      </p>
      ${shareRow(canonical, `${job.title || "Open role"}${job.company ? " at " + job.company : ""} — Swapiki Jobs`)}
    </article>

    ${
      related.length
        ? `<section style="margin-top:48px;border-top:1px solid #E2E8F0;padding-top:28px;">
             <h2 style="font-size:19px;margin:0 0 14px;color:#0F172A;">Other open roles</h2>
             <ul style="list-style:none;margin:0;padding:0;">
               ${related
                 .map(
                   (o) => `<li style="border-bottom:1px solid #E2E8F0;padding:11px 0;">
                     <a href="/jobs/${esc(jobSlug(o))}" style="font-size:15px;font-weight:600;color:#1E3A8A;text-decoration:none;">${esc(o.title || "Open role")}</a>
                     <div style="font-size:13px;color:#64748B;">${esc(o.company || "")}${o.location ? " &middot; " + esc(o.location) : ""}</div>
                   </li>`
                 )
                 .join("")}
             </ul>
             <p style="margin:18px 0 0;"><a href="/jobs" style="font-size:14px;font-weight:700;color:#1E3A8A;">See all jobs in India &rarr;</a></p>
           </section>`
        : `<p style="margin-top:48px;"><a href="/jobs" style="font-size:14px;font-weight:700;color:#1E3A8A;">See all jobs in India &rarr;</a></p>`
    }`;

  return new Response(shell(title, description, canonical, jsonLd, job.title || "Open role", bodyHtml), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=1800"
    }
  });
}

function jLabel(k, v) {
  if (!v) return "";
  return `<span style="font-size:12px;color:#334155;background:#EEF2FF;border:1px solid #C7D2FE;padding:5px 12px;border-radius:999px;">${esc(k)}: ${esc(v)}</span>`;
}

/**
 * The neighbour list needs the board, and the board needs the service key.
 * Without it the page still renders in full - a job page with no "other roles"
 * section is a slightly shorter page, not a broken one.
 */
async function relatedList(env, supabaseUrl, serviceKey, job) {
  if (!serviceKey) return [];
  try {
    const all = await fetchPublishedJobs(supabaseUrl, serviceKey);
    return relatedFor(all, job);
  } catch {
    return [];
  }
}
