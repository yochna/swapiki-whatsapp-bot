// Shared server-side pieces for the public jobs pages.
//
// Two routes need the same things and must not disagree: /jobs (the board) and
// /jobs/<slug> (one job). Everything both need - escaping, the apply-link guard,
// the JSON-LD shaping, the schema-narrowing fetch and the slug - lives here so
// a structured-data fix cannot land on one page and miss the other.

import { isMissingColumnError, numericOrNull } from "./postgrest.js";
import {
  SITE_URL, ORG_ID, SITE_ID, graph, itemList, organization, website
} from "./schema.js";

export const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

/**
 * A job's apply link, or "" if it is unusable.
 *
 * apply_url is the feed's redirect_url: attacker-influenced data rendered into an
 * href on a public page, so a `javascript:` URL would execute for anyone who
 * clicked the card. Only http/https survives, and the value is re-serialised from
 * the parsed URL, which cannot carry a quote or angle bracket into the attribute.
 */
export const safeApplyUrl = (raw) => {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return "";
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
};

/**
 * JSON for embedding inside a <script> element.
 *
 * JSON.stringify escapes quotes but leaves < and > alone, so a job title
 * containing "</script>" closes the tag early and everything after it is parsed
 * as markup. Feeding a feed through JSON-LD without this is a stored XSS hole
 * on the public board. The \u form is valid JSON and parses back to the original
 * string, so the data is unchanged.
 */
export const jsonForScript = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The public URL path for one job.
 *
 * Readable words first, then the row's uuid after "--". The uuid is what makes
 * the lookup unambiguous and, more importantly, what keeps an OLD url working:
 * Adzuna rewrites listing titles now and then, and a slug built from the title
 * alone would move the page out from under its own ranking and 404. Parsing the
 * id back out of any slug means a renamed job resolves at both its old and new
 * address, with a canonical tag pointing at the current one.
 */
export const jobSlug = (j) => {
  const id = String(j && j.id ? j.id : "").trim();
  const words = [j && j.title, j && j.company, j && j.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return words ? `${words}--${id}` : id;
};

/** The uuid carried by a /jobs/<slug> path, or "" if there isn't one. */
export const idFromSlug = (slug) => {
  const raw = String(slug == null ? "" : slug).trim().replace(/^\/+|\/+$/g, "");
  const tail = raw.includes("--") ? raw.slice(raw.lastIndexOf("--") + 2) : raw;
  return UUID.test(tail) ? tail.toLowerCase() : "";
};

/**
 * One or two plain sentences describing the role, for the schema and the meta
 * description. Built from what the feed stated and nothing else: title, company,
 * location, the salary the employer published, and the opening of the
 * description. An answer engine lifting this out has to be able to trust that
 * every clause came from the listing, so nothing is inferred here.
 */
export const jobMetaDescription = (j) => {
  const parts = [];
  if (j.title && j.company) parts.push(`${j.title} at ${j.company}`);
  else if (j.title || j.company) parts.push(String(j.title || j.company));
  if (j.location) parts.push(`in ${j.location}`);
  if (j.salary) parts.push(`| ${j.salary}`);
  const lead = String(j.description == null ? "" : j.description)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:[a-z]+|#\d+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const body = lead.length > 180 ? `${lead.slice(0, 177).replace(/\s+\S*$/, "")}...` : lead;
  const head = parts.join(" ");
  return (head ? `${head}. ` : "") + body;
};

/**
 * One schema.org JobPosting per job. Every field is either stated by the feed or
 * omitted:
 *
 *  - `directApply` is always false: the apply link is the employer's own
 *    system, reached off-site.
 *  - `datePosted` is the real arrival date, never the render date.
 *  - `baseSalary` only when the employer stated numbers. PostgREST returns
 *    `numeric` as a JSON string, so both bounds go through numericOrNull.
 *  - `employmentType` is deliberately NOT hardcoded. The feed carries a
 *    contract_time but it is not stored, and asserting "FULL_TIME" for all
 *    300+ jobs is exactly the sort of unverifiable claim Google penalises.
 */
export const jobPostingFor = (j) => {
  const g = {
    "@type": "JobPosting",
    // Stable, citable identity for this posting, and the anchor that lets the
    // page's own webPage node reference it by @id instead of repeating it.
    "@id": `${SITE_URL}/jobs/${jobSlug(j)}#posting`,
    url: `${SITE_URL}/jobs/${jobSlug(j)}`,
    name: j.title,
    title: j.title,
    description: jobMetaDescription(j),
    hiringOrganization: { "@type": "Organization", name: j.company },
    identifier: { "@type": "PropertyValue", name: `${j.company} - ${j.title}` },
    // Swapiki is the board that published this posting. Naming it as publisher
    // is what gives every posting a typed edge back to the site entity, instead
    // of leaving 500+ postings as orphans with only a company string on them.
    publisher: { "@id": ORG_ID },
    datePosted: String(j.first_seen_at || "").slice(0, 10) || undefined
  };
  if (g.datePosted === undefined) delete g.datePosted;

  const applyUrl = safeApplyUrl(j.apply_url);
  if (applyUrl) {
    // `url` is this job's own page on Swapiki, which is the posting a reader
    // lands on and the page the schema describes. The off-site apply target is
    // not a schema.org field, so it is not invented here - it is rendered as the
    // card's Apply button, and directApply below states the honest relationship.
    //
    // directApply means the applicant applies in the employer's own system.
    // Every listing here links off-site (the feed's redirect_url), so asserting
    // true would be a false claim on all 500+ postings - exactly the kind of
    // inaccurate rich result that earns a structured-data penalty.
    g.directApply = false;
  }
  if (j.location) {
    g.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: j.location } };
  }
  const minValue = numericOrNull(j.salary_min);
  const maxValue = numericOrNull(j.salary_max);
  if (minValue !== null || maxValue !== null) {
    // schema.org allows an open-ended range, so a stated minimum or a stated
    // maximum on its own is emitted rather than completed by guessing the end.
    const value = { "@type": "QuantitativeValue", unitText: "YEAR" };
    if (minValue !== null) value.minValue = minValue;
    if (maxValue !== null) value.maxValue = maxValue;
    // Adzuna's India feed is annual INR by definition (see the header of
    // functions/lib/adzuna.js), which is the only reason a bare numeric bound
    // can be labelled with a currency at all.
    g.baseSalary = { "@type": "MonetaryAmount", currency: "INR", value };
  }
  return g;
};

/**
 * The JSON-LD <script> for the board.
 *
 * One graph, not one loose collection: the org and the site are declared here and
 * every posting points at them by @id, so the whole set resolves as a single
 * connected entity rather than 500+ unrelated nodes. The ItemList is what lets an
 * answer engine treat them as a citable set ("these are the open roles") instead
 * of having to rediscover the membership from 500 separate nodes.
 *
 * The SPA's own signed-in version replaces this block, which is why it carries an
 * id - js/app.js reuses #jobs-jsonld rather than adding a second graph.
 */
export const jsonLdBlock = (jobs) => {
  const postings = jobs.map(jobPostingFor);
  const page = {
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/jobs#webpage`,
    url: `${SITE_URL}/jobs`,
    name: "Swapiki Jobs — IT, BFSI & Other Roles in India",
    isPartOf: { "@id": SITE_ID },
    about: { "@id": ORG_ID }
  };

  // With no rows - which is also what a missing service key produces - there is no
  // ItemList. Emitting an empty one would assert that Swapiki has zero openings,
  // when the truth is that this request could not read them. A page that says
  // nothing about the listings is the honest answer.
  const payload = graph([
    organization(),
    website(),
    page,
    ...(jobs.length
      ? [
          itemList(
            "Open IT, BFSI and other roles in India on Swapiki Jobs",
            jobs.map((j) => ({ url: `${SITE_URL}/jobs/${jobSlug(j)}`, name: j.title })),
            { id: `${SITE_URL}/jobs#joblist` }
          ),
          ...postings
        ]
      : [])
  ]);
  return `<script type="application/ld+json" id="jobs-jsonld">${jsonForScript(payload)}</script>`;
};

// Only columns that actually exist. PostgREST rejects the whole request for one
// unknown column, and these handlers turn a failed fetch into an empty page - so
// a typo here silently blanks the public board. That is not hypothetical: an
// earlier version selected salary_min/salary_max before the migration adding them
// had been run, and the live page rendered empty.
//
// Three shapes are therefore tried, widest first: with the structured salary
// bounds and the featured pin, with the salary bounds alone, and with neither.
// The board loses the pinned ordering and then the structured salary numbers
// until the migrations are applied, but it never loses the jobs.
const BOARD_COLUMNS = "id,title,company,location,category,salary,first_seen_at,apply_url,salary_min,salary_max,featured";
const BOARD_NO_FEATURED = "id,title,company,location,category,salary,first_seen_at,apply_url,salary_min,salary_max";
const BOARD_FALLBACK = "id,title,company,location,category,salary,first_seen_at,apply_url";

// The single-job page also wants the body text, which is far too large to inline
// for the whole board. `id` is not optional in any shape: it is the lookup key
// and the slug's tail, so a shape without it cannot produce a URL.
//
// Shape order is widest-useful-first, NOT most-columns-first. employment_type is
// tried LAST and on its own: it is not in the production table, and asking for
// it in the first shape made every single-job request fail its first query and
// fall back to a shape without the salary bounds - so a job whose employer did
// publish a salary showed no structured pay on its own page, while the board
// (whose shapes never asked for it) did. A column that is not in the schema
// should cost one narrow retry, not the whole payload.
const ONE_COLUMNS = "id,title,company,location,category,salary,description,first_seen_at,apply_url,salary_min,salary_max";
const ONE_WITH_TYPE = `${ONE_COLUMNS},employment_type`;
const ONE_FALLBACK = "id,title,company,location,category,salary,description,first_seen_at,apply_url";

const authHeaders = (serviceKey) => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`
});

/**
 * Walks the column shapes until one the database satisfies answers.
 *
 * A 400 naming a column we asked for means the migration is not applied yet, and
 * anything else is a real failure that must not be retried into silence. Returns
 * the index of the next shape to try, or null for "do not retry" - an index,
 * because 0 is a legal answer here and must not read as "no".
 */
const nextShape = (shapes, select, res) => async () => {
  if (!res || res.status !== 400) return null;
  const body = await res.clone().text().catch(() => "");
  if (!isMissingColumnError(body)) return null;
  const next = shapes.indexOf(select) + 1;
  if (next < 1 || next >= shapes.length) return null;
  if (select === BOARD_COLUMNS || select === BOARD_NO_FEATURED) {
    console.warn(
      "[jobs] salary_min/salary_max are not in the jobs table; serving without structured salary. " +
        "Run supabase/jobs_ingest_migration.sql."
    );
  } else if (select === ONE_COLUMNS) {
    console.warn("[jobs] salary_min/salary_max are not in the jobs table; serving the job page without structured salary.");
  } else if (select === ONE_WITH_TYPE) {
    console.warn("[jobs] jobs.employment_type is not in the table; serving the job page without it.");
  }
  return next;
};

/** One page of jobs, narrowing the column shape until the schema is satisfied. */
const fetchPage = async (base, shapes, headers, orderFor, select, offset) => {
  const url =
    `${base}/rest/v1/jobs?status=eq.published&select=${select}` +
    `&order=${orderFor(select)}&limit=500&offset=${offset}`;
  const res = await fetch(url, { headers });
  const narrow = nextShape(shapes, select, res);
  const next = await narrow();
  if (next === null) return { res, select };
  // orderFor is re-applied to the NEW shape rather than carried over. Sorting on
  // a column the retry just dropped fails the whole query, so the two have to fall
  // back together - and carrying the old order down makes every attempt fail.
  return fetchPage(base, shapes, headers, orderFor, shapes[next], offset);
};

/**
 * Every published job, paged to exhaustion.
 *
 * A single cap was wrong twice over. It was 20, so a feed of several hundred
 * listings looked identical to a board of twenty. Raising it to 500 only moved
 * the cliff: the board crossed 500 published jobs, and because the fetch took the
 * newest page and stopped, the oldest real jobs quietly vanished from the board
 * and from the JobPosting graph with no error anywhere. So the fetch pages to
 * exhaustion instead, and the only remaining ceiling is a loud one.
 */
export async function fetchPublishedJobs(supabaseUrl, serviceKey) {
  if (!serviceKey) return [];
  const shapes = [BOARD_COLUMNS, BOARD_NO_FEATURED, BOARD_FALLBACK];
  // featured leads that order, which is what keeps the studio's own openings at
  // the top of the board. It is dropped together with the column in the retry:
  // asking PostgREST to sort by a column it does not have fails the whole query.
  const ORDER_FEATURED = "featured.desc,created_at.desc,id.asc";
  const ORDER_PLAIN = "created_at.desc,id.asc";
  // featured leads that order, which is what keeps the studio's own openings at
  // the top of the board. It is dropped together with the column in the retry:
  // asking PostgREST to sort by a column it does not have fails the whole query.
  // The order has to be chosen from the shape, not from the retry count: a shape
  // without `featured` cannot be sorted by it, whichever step it was reached at.
  const orderFor = (select) => (select === BOARD_FALLBACK ? ORDER_PLAIN : ORDER_FEATURED);
  const headers = authHeaders(serviceKey);
  const PAGE_SIZE = 500;
  const MAX_PAGES = 20;

  let jobs = [];
  try {
    // Carried out of the loop once a page has told us what the schema is.
    let select = BOARD_COLUMNS;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { res, select: ok } = await fetchPage(supabaseUrl, shapes, headers, orderFor, select, page * PAGE_SIZE);
      select = ok;
      if (!res.ok) {
        // Losing the first page blanks the board, which is the failure these
        // handlers exist to avoid, so it is reported rather than swallowed.
        console.warn("[jobs] published jobs fetch failed:", res.status);
        return [];
      }
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) break;
      jobs = jobs.concat(rows);
      if (rows.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) {
        // Truncating here would be the same silent bug as the old cap, so say so.
        console.warn(
          `[jobs] published board is still paging after ${MAX_PAGES * PAGE_SIZE} jobs; ` +
            "older jobs were left off the page. Raise MAX_PAGES or filter the board at the query."
        );
      }
    }
  } catch (err) {
    console.warn("[jobs] published jobs fetch threw:", err && err.message);
  }
  return jobs;
}

/** One published job by uuid, or null. Used by the per-job page. */
export async function fetchPublishedJobById(supabaseUrl, serviceKey, id) {
  if (!serviceKey || !id) return null;
  const shapes = [ONE_COLUMNS, ONE_WITH_TYPE, ONE_FALLBACK];
  const headers = authHeaders(serviceKey);
  try {
    for (let i = 0; i < shapes.length; i++) {
      const select = shapes[i];
      const res = await fetch(
        `${supabaseUrl}/rest/v1/jobs?status=eq.published&id=eq.${encodeURIComponent(id)}` +
          `&select=${select}&limit=1`,
        { headers }
      );
      if (!res.ok) {
        // 400 naming a column we asked for means the migration has not run; any
        // other status is a real failure and must not be retried into silence.
        const body = await res.clone().text().catch(() => "");
        const missingColumn = res.status === 400 && isMissingColumnError(body);
        if (missingColumn && select === ONE_WITH_TYPE) {
          // Expected in production, and no longer costly: the salary bounds have
          // already been read by this point, so losing this column loses nothing
          // that reaches the page.
          console.warn("[jobs] jobs.employment_type is not in the table; serving the job page without it.");
        }
        if (!missingColumn || i === shapes.length - 1) {
          console.warn("[jobs] job fetch failed:", res.status);
          return null;
        }
        continue;
      }
      const rows = await res.json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    }
  } catch (err) {
    console.warn("[jobs] job fetch threw:", err && err.message);
  }
  return null;
}
