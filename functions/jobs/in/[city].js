// Cloudflare Pages Function — Route: GET /jobs/in/<city>
//
// One hub page per city the board actually has openings in.
//
// Why this exists: /jobs is a single URL carrying every role in India, so it
// can only ever compete for the head term "jobs" — and that SERP is Indeed,
// LinkedIn, Naukri and Google for Jobs, none of which a new board displaces.
// The queries a new job board can genuinely win are the long ones: "software
// engineer jobs in bangalore", "fresher jobs in pune". Those need a page per
// city, with the city's real openings on it, its own title and description, its
// own place in the sitemap and links into every job it lists.
//
// Why a standalone document and not an index.html injection: the board injects
// itself into the SPA shell because it needs the app's search, filters and
// match scoring to be useful. A hub needs none of that. A document that renders
// fully without JavaScript arrives faster, costs less server time, and is read
// the same way by a crawler, a link preview and a reader with scripts blocked.
//
// How the numbers stay honest: the count on the page, the "first N of M" line
// and the sitemap entry all come from the same location filter, so they cannot
// disagree. The hub links to exactly the cards the reader can see - never more -
// and the structured data says no more than that: no ItemList, because an
// ItemList is Google's carousel markup, and carousels are only supported next
// to a Course list, a Movie, a Recipe or a Restaurant. A list of job pages is
// none of those, so on a hub it could only ever register as invalid items.

import {
  DEFAULT_SUPABASE_URL, esc, safeApplyUrl, jsonForScript,
  fetchJobsMatchingFilter, jobSlug
} from "../../lib/jobs-feed.js";
import {
  SITE_URL, ORG_ID, SITE_ID, graph, organization, website, faqPage
} from "../../lib/schema.js";
import { cityBySlug, cityOrParam, fmtCount, JOB_CITIES } from "../../lib/job-hubs.js";
import { cacheMatch, cachePut, cacheState, withCacheState } from "../../lib/page-cache.js";

const SITE = SITE_URL;

// How many cards a hub draws, and therefore how many rows it fetches. A hub
// with 1,715 openings is not a page anyone reads end to end; a hundred cards is
// enough to be a real index into the job pages and small enough that the
// document stays a few tens of kilobytes. Everything past the cap stays
// reachable from /jobs and from each job's own page.
const HUB_LIST_CAP = 100;

const jobCard = (j) => {
  const applyUrl = safeApplyUrl(j.apply_url);
  const href = `/jobs/${jobSlug(j)}`;
  return `
      <div style="border:1px solid #E1D9CB;border-radius:14px;padding:16px 18px;margin-bottom:12px;background:#fff;">
        <a href="${esc(href)}" style="font-weight:700;font-size:16px;color:#17130E;text-decoration:none;">${esc(j.title || "Open role")}</a>
        <div style="font-size:13px;color:#5A5046;margin:3px 0 8px;">${esc(j.company || "")}${j.location ? " &middot; " + esc(j.location) : ""}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          <span style="font-size:11px;font-weight:700;background:#FBEDE6;color:#B9491F;padding:4px 10px;border-radius:999px;border:1px solid #F7DFD2;">${esc(String(j.category || "any").toUpperCase())}</span>
          ${j.salary ? `<span style="font-size:12px;color:#6B6156;">${esc(j.salary)}</span>` : ""}
          ${
            applyUrl
              ? `<a href="${esc(applyUrl)}" target="_blank" rel="noopener noreferrer nofollow"
                   style="margin-left:auto;font-size:12px;font-weight:700;color:#B9491F;text-decoration:none;border:1px solid #F7DFD2;background:#FBEDE6;padding:6px 14px;border-radius:999px;">Apply &rarr;</a>`
              : ""
          }
        </div>
      </div>`;
};

/**
 * The <title>. The synonym goes in parentheses so a page that answers "jobs in
 * bengaluru" also carries the word "bangalore" in its title, which is how the
 * same page ranks for both spellings instead of one of them winning and the
 * other never matching.
 */
const pageTitleFor = (city, n) =>
  `Jobs in ${city.name} — ${fmtCount(n)} Open Roles${city.synonyms.length ? ` (${city.synonyms[0]})` : ""} | Swapiki`;

const metaDescriptionFor = (city, n) =>
  `${fmtCount(n)} open jobs in ${city.name} on Swapiki — IT, engineering, BFSI and other roles, added daily. ` +
  `Apply with a proof-backed profile: real projects and a 2-minute voice walkthrough.`;

/**
 * The three questions every city hub answers, with answers that are true for
 * any city and any count.
 *
 * No apostrophes and no em-dashes on purpose: these strings are both the
 * visible FAQ text and the FAQPage schema's answers, and schema.org requires
 * the two to be the same words. Keeping them free of characters that HTML
 * escaping transforms is what lets a test assert they are identical rather
 * than approximately equal.
 */
const faqPairsFor = (city, n) => [
  [
    `How many jobs are open in ${city.name} right now?`,
    `${fmtCount(n)} openings are listed on this page right now. New roles are added to the Swapiki board daily, so the count moves as hiring teams post.`
  ],
  [
    `How do I apply for a job in ${city.name} on Swapiki?`,
    `Open any role above and use its Apply link to reach the application page on the employer site. Every listing on this page is a live opening on the Swapiki jobs board.`
  ],
  [
    `Do I need a CV to apply through Swapiki?`,
    `No. Swapiki candidates apply with a proof-backed profile instead: one or two real projects with what you built, plus a 2-minute voice walkthrough so a hiring manager can hear you explain it. Nothing is AI-screened or auto-ranked, so a person reads it.`
  ]
];

/** The other hubs, in demand order, skipping this one. */
const relatedCities = (city, limit = 8) => JOB_CITIES.filter((c) => c.slug !== city.slug).slice(0, limit);

const shell = (city, title, description, canonical, jsonLd, bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<link rel="canonical" href="${esc(canonical)}"/>
<meta property="og:type" content="website"/>
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
<body style="margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#F7F3EC;color:#17130E;">
  <div style="max-width:760px;margin:0 auto;padding:28px 20px 72px;">
    <a href="/" style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;">
      <span style="font-weight:800;font-size:20px;color:#17130E;">Swapiki</span>
    </a>
    <nav aria-label="Breadcrumb" style="font-size:12px;color:#6B6156;margin:22px 0 0;">
      <a href="/" style="color:#B9491F;">Home</a>
      <span aria-hidden="true"> / </span><a href="/jobs" style="color:#B9491F;">Jobs in India</a>
      <span aria-hidden="true"> / </span>Jobs in ${esc(city.name)}
    </nav>
${bodyHtml}
  </div>
</body>
</html>`;

/** A hub with no service key is a misconfiguration, not "no jobs in this city". */
const unavailableBody = (city) => `
    <h1 style="font-size:30px;line-height:1.22;margin:22px 0 8px;color:#17130E;">Jobs in ${esc(city.name)}</h1>
    <p style="font-size:15px;line-height:1.7;color:#2E2820;">
      The live list of ${esc(city.name)} openings is loading. The full board is always available.
    </p>
    <p style="margin:20px 0 0;"><a href="/jobs" style="display:inline-block;background:#E85D2A;color:#17130E;font-weight:700;font-size:14px;padding:12px 24px;border-radius:999px;text-decoration:none;">Browse all jobs in India</a></p>`;

const notFound = (msg) =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Jobs in that city | Swapiki</title>` +
  `<meta name="robots" content="noindex, follow"/><link rel="canonical" href="${SITE}/jobs"/></head>` +
  `<body style="font-family:system-ui;padding:40px"><h1>${esc(msg)}</h1>` +
  `<p><a href="/jobs">Browse all open jobs</a></p></body></html>`;

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = (params && (params.city || params["*"] || params.path)) || "";
  const city = cityBySlug(slug);

  // A path that names no hub cannot be a city page. Answering 404 immediately
  // keeps a crawler from treating /jobs/in/anything-at-all as a soft 404 worth
  // retrying.
  if (!city) {
    return new Response(notFound("There is no jobs hub at that address."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
    });
  }

  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const canonical = `${SITE}/jobs/in/${city.slug}`;

  const warm = await cacheMatch(context);
  if (warm) return withCacheState(warm, "HIT");

  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    // Shorter than a job page's, because a hub's contents move: the count on
    // the page is a claim about the world that goes stale within the day.
    "Cache-Control": "public, max-age=300, s-maxage=900",
    "x-swapiki-cache": cacheState(context)
  };

  // No key: render the hub rather than a 404, so a misconfiguration costs the
  // listings and not the URL. A 404 here would be cached and de-indexed.
  if (!serviceKey) {
    const res = new Response(
      shell(
        city,
        pageTitleFor(city, 0),
        metaDescriptionFor(city, 0),
        canonical,
        `<script type="application/ld+json" id="city-jsonld">${jsonForScript(graph([organization(), website()]))}</script>`,
        unavailableBody(city)
      ),
      { headers }
    );
    await cachePut(context, res);
    return res;
  }

  const { jobs, total } = await fetchJobsMatchingFilter(supabaseUrl, serviceKey, cityOrParam(city), HUB_LIST_CAP);

  // A known city with nothing live on it is not a page worth serving. The
  // sitemap only lists hubs that clear HUB_MIN_JOBS, so this is the state a
  // hub falls into after its listings dry up — a 404 with a link to the board
  // is the honest answer, and it is not cached for long.
  if (!total) {
    return new Response(notFound(`No open roles in ${city.name} on Swapiki right now.`), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=120" }
    });
  }

  const shown = jobs.slice(0, HUB_LIST_CAP);
  const n = total;
  const title = pageTitleFor(city, n);
  const description = metaDescriptionFor(city, n);
  const faqPairs = faqPairsFor(city, n);
  const others = relatedCities(city);

  // One connected graph: the org and the site, this page pointing at both, the
  // breadcrumb trail, and the FAQ. Every listing the reader can see links to its
  // own page, which is where its JobPosting lives — repeating those here would
  // describe several hundred jobs a reader would have to scroll past. There is
  // no ItemList: an ItemList is Google's carousel markup, and a carousel is only
  // supported next to a Course list, a Movie, a Recipe or a Restaurant. On a hub
  // of job pages it could only ever register as invalid items.
  const jsonLd = `<script type="application/ld+json" id="city-jsonld">${jsonForScript(
    graph([
      organization(),
      website(),
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        isPartOf: { "@id": SITE_ID },
        about: { "@id": ORG_ID }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Jobs in India", item: `${SITE}/jobs` },
          { "@type": "ListItem", position: 3, name: `Jobs in ${city.name}`, item: canonical }
        ]
      },
      faqPage(faqPairs, { id: `${canonical}#faq` })
    ])
  )}</script>`;

  const synonymLine = city.synonyms.length
    ? `<p style="font-size:14px;color:#6B6156;margin:0 0 20px;">Also listed as ${city.synonyms.map((s) => esc(s)).join(", ")} &mdash; the two names are the same hiring market.</p>`
    : "";

  const lede =
    `<h1 style="font-size:30px;line-height:1.22;margin:22px 0 6px;color:#17130E;">Jobs in ${esc(city.name)}</h1>` +
    `<p style="font-size:16px;line-height:1.6;color:#2E2820;margin:0 0 4px;"><strong>${fmtCount(n)} open roles</strong> in ${esc(city.name)} on the Swapiki jobs board right now.</p>` +
    synonymLine +
    `<p style="font-size:15px;line-height:1.7;color:#5A5046;max-width:640px;margin:0 0 26px;">
       Every listing below is a live opening. Open a role to read the full description and use its
       Apply link, or search the whole board with filters and match scoring.
       Candidates apply with a proof-backed profile &mdash; real projects plus a 2-minute voice
       walkthrough, read by a person rather than an AI screener.
     </p>`;

  const list =
    shown.map(jobCard).join("") +
    (n > shown.length
      ? `<p style="font-size:13px;color:#6B6156;margin-top:18px;">Showing the first ${shown.length} of ${fmtCount(n)} openings in ${esc(city.name)}. <a href="/jobs" style="color:#B9491F;font-weight:700;text-decoration:none;">Open the full board</a> to search them all.</p>`
      : `<p style="font-size:13px;color:#6B6156;margin-top:18px;">That is every opening currently listed for ${esc(city.name)}. <a href="/jobs" style="color:#B9491F;font-weight:700;text-decoration:none;">Open the full board</a> to search all roles in India.</p>`);

  const faqHtml = `
    <section style="margin-top:44px;border-top:1px solid #E1D9CB;padding-top:26px;">
      <h2 style="font-size:19px;margin:0 0 16px;color:#17130E;">Jobs in ${esc(city.name)} — questions</h2>
      ${faqPairs
        .map(
          ([q, a]) => `<h3 style="font-size:16px;font-weight:700;margin:18px 0 4px;color:#17130E;">${esc(q)}</h3>
      <p style="font-size:15px;line-height:1.7;color:#2E2820;margin:0;">${esc(a)}</p>`
        )
        .join("")}
    </section>`;

  const hubsHtml = `
    <section style="margin-top:44px;border-top:1px solid #E1D9CB;padding-top:26px;">
      <h2 style="font-size:19px;margin:0 0 14px;color:#17130E;">Job hubs in other Indian cities</h2>
      <ul style="list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px;">
        ${others
          .map(
            (c) => `<li><a href="/jobs/in/${esc(c.slug)}" style="display:inline-block;font-size:13px;font-weight:600;color:#B9491F;text-decoration:none;border:1px solid #F7DFD2;background:#FBEDE6;padding:6px 14px;border-radius:999px;">Jobs in ${esc(c.name)}</a></li>`
          )
          .join("")}
      </ul>
    </section>`;

  const cta = `
    <section style="margin-top:44px;background:#17130E;border-radius:16px;padding:26px 24px;">
      <h2 style="font-size:19px;margin:0 0 8px;color:#fff;">Hiring in ${esc(city.name)}?</h2>
      <p style="font-size:14px;line-height:1.65;color:#F7DFD2;margin:0 0 16px;">
        Swapiki candidates send proof instead of a CV: real projects and a short voice walkthrough.
        No AI screening and no automated ranking &mdash; a person reads every profile.
      </p>
      <a href="/signup" style="display:inline-block;background:#fff;color:#B9491F;font-weight:700;font-size:14px;padding:11px 22px;border-radius:999px;text-decoration:none;">Create your profile</a>
      <a href="/jobs" style="display:inline-block;margin-left:8px;color:#F7DFD2;font-weight:700;font-size:14px;padding:11px 18px;text-decoration:none;">All jobs in India</a>
    </section>`;

  const bodyHtml = `
    <article style="margin:22px 0 0;">
      ${lede}
      <h2 style="font-size:19px;margin:0 0 14px;color:#17130E;">Open roles in ${esc(city.name)}</h2>
      ${list}
    </article>
    ${faqHtml}
    ${hubsHtml}
    ${cta}`;

  const res = new Response(shell(city, title, description, canonical, jsonLd, bodyHtml), { headers });
  await cachePut(context, res);
  return res;
}
