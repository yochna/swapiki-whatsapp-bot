// Cloudflare Pages Function — Route: GET /sitemap.xml
//
// The static sitemap.xml in the repo lists two URLs, which was accurate when the
// board was a single page and has been a lie since it was not. Search engines
// find pages through this file, so every one of the several hundred per-job
// pages was invisible to discovery until now.
//
// It is generated from the published board rather than committed, for the same
// reason the board is: a hand-maintained list of jobs goes stale the moment the
// feed changes, and a sitemap that advertises 404s is worse than a small one.

import { DEFAULT_SUPABASE_URL, fetchPublishedJobs, jobSlug } from "./lib/jobs-feed.js";
import { CONTENT_PAGES } from "./lib/content-pages.js";

const SITE = "https://swapiki.com";

export async function onRequestGet(context) {
  const { env } = context;
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";

  const jobs = await fetchPublishedJobs(supabaseUrl, serviceKey);

  // lastmod is the real arrival date. Falling back to today would tell Google
  // every listing changed on every crawl, which trains it to ignore the field.
  const day = (value) => {
    const d = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  };

  // Published profiles answer at their own subdomain, so that is the URL a
  // crawler should be handed. Dummy seed rows are excluded: they are props for
  // the demo, not people, and should never be indexed.
  let profiles = [];
  try {
    const profUrl = supabaseUrl + "/rest/v1/candidates?profile_status=eq.published&select=username,updated_at,is_dummy&order=updated_at.desc.nullslast&limit=200";
    const profRes = await fetch(profUrl, {
      headers: {
        apikey: serviceKey || (env.SUPABASE_ANON_KEY || ""),
        Authorization: "Bearer " + (serviceKey || (env.SUPABASE_ANON_KEY || ""))
      }
    });
    if (profRes.ok) {
      const rows = await profRes.json();
      if (Array.isArray(rows)) {
        profiles = rows
          .filter((r) => r && r.username && r.is_dummy !== true)
          .map((r) => ({
            loc: `https://${r.username}.swapiki.com/`,
            lastmod: day(r.updated_at),
            changefreq: "weekly",
            priority: "0.6"
          }));
      }
    }
  } catch (e) {
    // A profile-fetch failure must not cost us the job URLs too.
  }

  const staticUrls = [
    { loc: `${SITE}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${SITE}/jobs`, changefreq: "daily", priority: "0.9" }
  ];

  // The content pages are fixed URLs defined once in content-pages.js, so the
  // sitemap and the footer links cannot disagree about what exists.
  const contentUrls = Object.values(CONTENT_PAGES).map((p) => ({
    loc: `${SITE}${p.path}`,
    changefreq: "monthly",
    priority: "0.8"
  }));

  const entries = staticUrls
    .concat(contentUrls)
    .concat(
      jobs.map((j) => ({
        loc: `${SITE}/jobs/${jobSlug(j)}`,
        lastmod: day(j.first_seen_at),
        changefreq: "weekly",
        priority: "0.7"
      }))
    )
    .concat(profiles)
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</loc>` +
        (u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : "") +
        `\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Short enough that a new listing is discoverable the same day, long
      // enough that the board is not refetched on every crawler request.
      "Cache-Control": "public, max-age=900, s-maxage=3600"
    }
  });
}
