// Machine-readable exports of the published board.
//
// Two routes render the same rows in two formats - /jobs.json for programs and
// /feed.xml for feed readers - and if each built its own view they would drift:
// a job in one and not the other, a date in one format and not the other. The
// shared shaping lives here so a change to what is published lands on both.
//
// These are deliberately NOT JSON-LD. The JobPosting graph already exists on
// /jobs and on every /jobs/<slug> page, which is where structured data belongs
// because that is the URL an engine will cite. Duplicating 500+ postings into a
// second document would double the payload to say what the first one already
// says. This file exists for the other half of the problem: an engine that wants
// to enumerate, count or diff the board without fetching 500 pages.

import { esc, jobMetaDescription, jobSlug, safeApplyUrl } from "./jobs-feed.js";
import { numericOrNull } from "./postgrest.js";

export const BOARD_URL = "https://swapiki.com/jobs";
export const SITE_URL = "https://swapiki.com";

/** Newest first, using the arrival date the feed recorded - never the render time. */
export const newestFirst = (jobs) =>
  [...jobs].sort((a, b) => {
    const av = String(a.first_seen_at || "");
    const bv = String(b.first_seen_at || "");
    if (av === bv) return String(a.id).localeCompare(String(b.id));
    return bv.localeCompare(av);
  });

/** How many rows carry each value of `key`, most common first. */
const tally = (jobs, key) => {
  const counts = new Map();
  for (const j of jobs) {
    const raw = j[key];
    const value = raw == null ? "" : String(raw).trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .reduce((acc, [name, count]) => {
      acc[name] = count;
      return acc;
    }, {});
};

/** The public, citable facts about one job. Nothing here is inferred. */
const jobRecord = (j) => {
  const record = {
    id: String(j.id),
    title: j.title || "",
    company: j.company || "",
    location: j.location || "",
    category: j.category || "any",
    datePosted: String(j.first_seen_at || "").slice(0, 10) || null,
    url: `${SITE_URL}/jobs/${jobSlug(j)}`,
    description: jobMetaDescription(j)
  };
  if (j.salary) record.salary = j.salary;
  const min = numericOrNull(j.salary_min);
  const max = numericOrNull(j.salary_max);
  // Numeric bounds are separate from the display string on purpose: a program
  // that wants to filter on pay cannot parse "₹12,00,000 - ₹18,00,000", and a
  // bound the employer did not state is null rather than guessed.
  if (min !== null || max !== null) {
    record.salaryInrPerYear = {};
    if (min !== null) record.salaryInrPerYear.min = min;
    if (max !== null) record.salaryInrPerYear.max = max;
  }
  const applyUrl = safeApplyUrl(j.apply_url);
  if (applyUrl) record.applyUrl = applyUrl;
  return record;
};

/**
 * /jobs.json
 *
 * `count` and every facet are computed from the rows that were actually read.
 * When the fetch fails the rows are empty, so this reports zero rather than a
 * stale number - a feed that claims 500 jobs while serving none is worse than a
 * feed that admits it has nothing.
 */
export const buildJobsJson = (jobs, now = new Date()) => {
  const ordered = newestFirst(jobs);
  return {
    name: "Open roles on Swapiki",
    description:
      "IT, BFSI and other openings across India. Applications are taken by each employer's own system, not by Swapiki.",
    site: SITE_URL,
    board: BOARD_URL,
    sitemap: `${SITE_URL}/sitemap.xml`,
    feed: `${SITE_URL}/feed.xml`,
    documentation: `${SITE_URL}/llms.txt`,
    generatedAt: now.toISOString(),
    count: ordered.length,
    country: "India",
    salary: { currency: "INR", period: "YEAR" },
    facets: {
      category: tally(ordered, "category"),
      location: tally(ordered, "location"),
      company: tally(ordered, "company")
    },
    jobs: ordered.map(jobRecord)
  };
};

const rssDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toUTCString();
};

/**
 * /feed.xml — RSS 2.0, the 50 newest roles.
 *
 * Capped at 50 rather than the whole board: a feed is a "what's new" surface,
 * and a reader pulling 500+ items on every poll is a worse experience than a
 * link to the full index. guid is the permalink, so a re-published job does not
 * reappear in a reader's unread set.
 */
export const buildFeedXml = (jobs, now = new Date(), limit = 50) => {
  const items = newestFirst(jobs).slice(0, limit);
  const rows = items
    .map((j) => {
      const url = `${SITE_URL}/jobs/${jobSlug(j)}`;
      return [
        "    <item>",
        `      <title>${esc(j.title || "")}</title>`,
        `      <link>${esc(url)}</link>`,
        `      <guid isPermaLink="true">${esc(url)}</guid>`,
        `      <pubDate>${esc(rssDate(j.first_seen_at))}</pubDate>`,
        `      <description>${esc(jobMetaDescription(j))}</description>`,
        "    </item>"
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${esc("Latest open roles on Swapiki")}</title>`,
    `    <link>${esc(BOARD_URL)}</link>`,
    `    <description>${esc(
      "IT, BFSI and other openings across India, newest first. Applications go to each employer's own system."
    )}</description>`,
    '    <language>en-IN</language>',
    `    <lastBuildDate>${esc(now.toUTCString())}</lastBuildDate>`,
    `    <atom:link href="${esc(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    items.length ? rows : "",
    "  </channel>",
    "</rss>"
  ]
    .filter((line) => line !== "")
    .join("\n");
};
