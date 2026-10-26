// Shared server-side pieces for the public jobs pages.
//
// Two routes need the same things and must not disagree: /jobs (the board) and
// /jobs/<slug> (one job). Everything both need - escaping, the apply-link guard,
// the JSON-LD shaping, the schema-narrowing fetch and the slug - lives here so
// a structured-data fix cannot land on one page and miss the other.

import { isMissingColumnError, numericOrNull } from "./postgrest.js";
import {
  SITE_URL, ORG_ID, SITE_ID, graph, organization, website
} from "./schema.js";

export const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

// ---------------------------------------------------------------------------
// Mojibake repair.
//
// A handful of feed rows arrive with UTF-8 bytes that were decoded as latin-1,
// so an en dash renders as "â" and a lightning bolt as "â¡". Google indexes
// those bytes verbatim, so a job page titled "Full Stack Developer â SaaS"
// reads as broken text in search results.
//
// The repair is a latin-1 -> UTF-8 round trip, but it is deliberately
// conservative. It only runs when the string actually contains bytes in the
// C1/latin-1 range, and it gives up untouched if any character is outside
// byte range (real non-latin text, not mojibake) or if decoding fails. A
// round trip cannot corrupt a title that was already correct.
//
// The shape this fixes is a full multi-byte sequence decoded as latin-1: an
// en dash arrives as the three characters U+00E2 U+0080 U+0093, and the round
// trip reads those three bytes as the one UTF-8 character they were.
//
// A truncated lead byte whose continuation was lost (a bare U+00C2, which
// renders as "Â") is left alone on purpose. It is invalid UTF-8, so the decode
// throws - and there is no safe way to tell it apart from a real "Â", which in
// a correctly decoded string is exactly U+00C2. Stripping the codepoint would
// repair one row while silently corrupting any genuine accented character in
// the corpus, which is the worse trade.
export const fixMojibake = (s) => {
  const raw = String(s == null ? "" : s);
  if (!/[\u0080-\u009f\u00c2-\u00f4][\u0080-\u00bf]*/.test(raw)) return raw;
  const bytes = [];
  for (const ch of raw) {
    const cp = ch.codePointAt(0);
    if (cp > 0xff) return raw;
    bytes.push(cp);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch (e) {
    return raw;
  }
};

// Applies the repair to the human-readable fields of a feed row, in place, so
// every surface downstream - board cards, hub cards, job pages, JSON-LD, the
// sitemap - shows the same corrected text. Slugs are unaffected: jobSlug()
// strips every non-alphanumeric character, and the mojibake sequence collapses
// to the same "-" that the repaired en dash does.
const TEXT_FIELDS = ["title", "company", "location", "salary", "description"];

// How long a listing stands after the feed was last seen to carry it. This is
// the board's own rule, and it is the window `validThrough` is read from.
const LISTING_WINDOW_DAYS = 30;
export const cleanJobRow = (row) => {
  if (!row || typeof row !== "object") return row;
  for (const field of TEXT_FIELDS) {
    if (typeof row[field] === "string") row[field] = fixMojibake(row[field]);
  }
  return row;
};
export const cleanJobRows = (rows) => (Array.isArray(rows) ? rows.map(cleanJobRow) : rows);

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
 * The date the posting went live, as YYYY-MM-DD, or undefined.
 *
 * Three sources, in order of how close they are to what `datePosted` means:
 *
 *  1. `first_seen_at` - the arrival date, written by the importer the moment
 *     the listing was first pulled from the feed.
 *  2. `created_at` - the row's creation date. Four listings submitted through
 *     the board's own form have no arrival date at all, because they never
 *     came through the importer, and Google rejects a JobPosting without
 *     `datePosted`. Their creation date is the real day the posting was
 *     published, so it is a fact about the listing rather than an invention.
 *  3. `date_posted` - an explicit date the listing itself carries.
 *
 * The render date is never used. A posting that appears on the board today did
 * not necessarily appear today, and dating it as if it did is the one thing
 * that gets a job board's structured data flagged.
 */
export const jobDatePosted = (j) => {
  const raw = j && (j.first_seen_at || j.created_at || j.date_posted);
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return undefined;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
};

/**
 * One schema.org JobPosting per job. Every field is either stated by the feed or
 * omitted:
 *
 *  - `directApply` is always false: the apply link is the employer's own
 *    system, reached off-site.
 *  - `datePosted` is a real stored timestamp - the arrival date, or the row's
 *    creation date when a listing was submitted through the board's own form
 *    and never went through the importer. Never the render date.
 *  - `baseSalary` only when the employer stated numbers. PostgREST returns
 *    `numeric` as a JSON string, so both bounds go through numericOrNull.
 *  - `employmentType` is only ever read out of the employer's own title. The
 *    feed carries a contract_time but it is not stored, and asserting
 *    "FULL_TIME" for every posting is exactly the sort of unverifiable claim
 *    Google penalises. A title that says "Intern" does state the type.
 *  - `validThrough` is 30 days past the last time the feed was seen carrying
 *    the listing - a fact we hold, not a guess about the employer's closing
 *    date. Google says: "If a job posting never expires, or you do not know
 *    when the job will expire, do not include this property." We do know when
 *    the listing stops standing, and it is when the feed stops serving it.
 *
 * This markup belongs on the job's own page and nowhere else. Google's job
 * posting content policy is explicit: "The JobPosting markup must only be used
 * on pages that contain a single job posting. We don't allow the use of
 * JobPosting markup in any other page, including pages that do not list any
 * job." So the board describes the collection and each /jobs/<slug> page
 * describes its posting.
 *
 * The shape of the node follows Google's own example for a job posting: a
 * JobPosting that stands on its own, with no `@id`, no `mainEntity` and no
 * `mainEntityOfPage` tying it to the page around it.
 *
 * That is not fussiness. A `@id` plus a `mainEntity` edge from the page's
 * WebPage node is the schema.org.org way of saying "this page is about that
 * thing", and a parser that resolves the reference will fold the posting into
 * the page entity - the schema.org validator does exactly that, and the
 * posting stops being an item of its own in the report. Google documents its
 * job postings as a standalone node, and a standalone node is the one shape
 * every parser agrees on.
 *
 * It used to carry `publisher: { "@id": ORG_ID }`, naming Swapiki as the
 * publisher of every posting. JobPosting sits under Thing > Intangible, NOT
 * under CreativeWork, and `publisher` is a CreativeWork property - so the
 * field is an unknown one on a JobPosting, and the schema.org validator says
 * so outright. The posting reaches the organisation anyway, through the page
 * that carries it.
 */

/**
 * How long the posting stands, as YYYY-MM-DD, or undefined when we do not know.
 *
 * The date is the last time we had evidence of the listing, and the evidence
 * comes from wherever it comes:
 *
 *  1. `last_seen_at` - the date the importer last saw this listing in the
 *     source feed. The importer bumps it every time the feed re-serves a job it
 *     already has, and never for a job it has not seen, so it is a fact about
 *     this board: "we last confirmed this listing on this date".
 *  2. `first_seen_at` - the arrival date, for a feed listing the feed has not
 *     re-served since it was imported.
 *  3. `created_at` - the day the posting went live, for the listings published
 *     through the board's own form. There the publication IS the evidence: we
 *     put it up, and we have not taken it down.
 *
 * The window is 30 days past that evidence, which is this board's standing rule
 * for when a listing stops standing. That is a real policy rather than an
 * invented expiry, and it is more accurate than the alternative Google would
 * apply on its own: Google assumes a posting expires 30 days after `datePosted`,
 * so a listing the feed served for a fortnight - and is still serving - would be
 * written off as expired on its arrival date rather than on its last sighting.
 * With the sighting in hand, the expiry moves forward every time the feed
 * proves the listing is still there, and a listing the feed has quietly dropped
 * ages back is the one that expires.
 *
 * It is also the only way to keep a corpus of this age alive under Google's own
 * rule. Every listing here was first seen inside the last month, so Google's
 * default would start expiring the oldest third of them within a week.
 *
 * A date that lands before the posting's own `datePosted` means the two
 * timestamps disagree, and a claim built on disagreement is worse than no
 * claim: that case is left out rather than guessed at. A row with no timestamp
 * of any kind is left out too - there is nothing to build a date from.
 */
export const jobValidThrough = (j) => {
  const raw = j && (j.last_seen_at || j.first_seen_at || j.created_at);
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return undefined;
  const seen = new Date(value);
  if (Number.isNaN(seen.getTime())) return undefined;
  const iso = new Date(seen.getTime() + LISTING_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const posted = jobDatePosted(j);
  if (posted && iso < posted) return undefined;
  return iso;
};

/**
 * The employment types the employer's own title states, as Google's vocabulary.
 *
 * Google accepts exactly these case-sensitive values - FULL_TIME, PART_TIME,
 * CONTRACTOR, TEMPORARY, INTERN, VOLUNTEER, PER_DIEM, OTHER - and allows more
 * than one on the same posting, e.g. ["FULL_TIME", "CONTRACTOR"]. Anything
 * outside that list is not a value Google recognises, so a title that says
 * "Trainee" is reported as the internship-type role it is rather than as a
 * token nobody's parser expects.
 *
 * Only the titles that literally name a type produce one. Everything else is
 * left blank: a posting that says "Backend Engineer" does not say whether it
 * is full time, so guessing "FULL_TIME" would be a claim nobody made.
 */
export const employmentTypeFromTitle = (title) => {
  const t = String(title == null ? "" : title).toLowerCase();
  const types = [];
  // Order is the order of certainty, not of appearance: a title can name more
  // than one type ("Marketing Intern (Part Time)"), and the one it names first
  // in the employer's own words is not more true than the other - so all of
  // them are reported.
  if (/\bpart[\s-]?time\b/.test(t)) types.push("PART_TIME");
  if (/\bfull[\s-]?time\b/.test(t)) types.push("FULL_TIME");
  if (/\b(intern|internship|trainee|apprentice)\b/.test(t)) types.push("INTERN");
  // "Contract" only counts when it is the word in front of the role, so
  // "Contract Engineer" is a contract role and "Contract Management Analyst"
  // is not - that one manages contracts, it is not one.
  if (/\b(contractor|freelance|freelancer)\b/.test(t)) types.push("CONTRACTOR");
  if (/\bcontractual\b/.test(t)) types.push("CONTRACTOR");
  if (/\bcontract\s+(role|position|engineer|developer|designer|analyst|consultant|architect|specialist|manager|qa|tester|test|worker|staff|professional)\b/.test(t)) types.push("CONTRACTOR");
  if (/\b(volunteer|unpaid)\b/.test(t)) types.push("VOLUNTEER");
  if (/\btemporary\b/.test(t)) types.push("TEMPORARY");
  if (/\bper[\s-]?diem\b/.test(t)) types.push("PER_DIEM");
  return types;
};

/**
 * The job's location, split into the parts Google's jobLocation wants.
 *
 * The feed's location is a display string ("Bangalore, Karnataka", "Remote
 * (India)"), and Google wants a locality, a region and a country. Everything
 * on this board is an India listing - the importer reads the Adzuna India feed
 * and the board's own form only takes India roles - so the country is stated
 * as IN for every posting rather than left blank.
 *
 * A remote posting is handled separately: it has no site to sit in, so it gets
 * a TELECOMMUTE location type and an applicant-location requirement instead.
 */
export const jobLocationFor = (location) => {
  const raw = String(location == null ? "" : location).trim();
  if (!raw) return null;
  if (/\bremote\b|\bwork\s*from\s*home\b|\bwfh\b|\banywhere\b/i.test(raw)) {
    return {
      type: "TELECOMMUTE",
      // No physical place to sit in, so the place is the country itself and
      // the requirement says who may apply. Both are stated facts: the board
      // only carries remote roles open to candidates in India.
      place: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "IN" } },
      applicantLocationRequirements: { "@type": "Country", name: "India" }
    };
  }
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const address = { "@type": "PostalAddress", addressCountry: "IN" };
  // Extract possible postal code (5-6 digit Indian PIN) and remove it from parts
  let postalCode = null;
  const filtered = [];
  for (const part of parts) {
    if (/^\d{5,6}$/.test(part)) {
      postalCode = part;
    } else {
      filtered.push(part);
    }
  }
  if (filtered.length > 1) {
    address.addressLocality = filtered[0];
    address.addressRegion = filtered.slice(1).join(", ");
  } else if (filtered.length === 1 && !/^india$/i.test(filtered[0])) {
    // A listing whose whole location is the country has no city to put in
    // addressLocality, and putting "India" there would claim a locality that
    // does not exist. The country alone is the truth.
    address.addressLocality = filtered[0];
  }
  if (postalCode) {
    address.postalCode = postalCode;
  }
  return { type: "", place: { "@type": "Place", address }, applicantLocationRequirements: null };
};

/**
 * The description as HTML, which is what Google's job posting markup wants.
 *
 * Google's rule: "The description in the structured data must match the visible
 * content of the page", and it has to be "a complete representation of the job,
 * including job responsibilities, qualifications, skills, working hours,
 * education requirements, and experience requirements". So this is the whole
 * listing, not the 180-character lead the meta description is allowed to be.
 * Google also insists the description is not the same as the title, which the
 * leading "Title at Company in Location" line guarantees.
 *
 * The feed's text is HTML in places, so it is flattened to paragraphs here: tags
 * are stripped, entities decoded, and each paragraph re-escaped and wrapped in
 * <p>. Nothing from the feed can smuggle a tag of its own into the markup.
 */
const plainText = (raw) =>
  String(raw == null ? "" : raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The employer's own text, as plain paragraphs.
 *
 * The page and the markup both render this, so the words a reader sees on the
 * job's page are the words the structured data claims. The feed's text is HTML
 * in places, so it is flattened here: tags are stripped, entities decoded, and
 * blank lines kept as paragraph breaks.
 */
export const jobBodyParagraphs = (j) => {
  const body = plainText(j && j.description);
  if (!body) return [];
  return body
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean);
};

/**
 * The description as plain paragraphs, shared by the markup and the page.
 *
 * Google wants the structured description to be the same words the reader can
 * read on the page, so the two are built from this one list rather than from
 * two separate formatters that would drift apart.
 *
 * The opening line states the facts the page shows above the description -
 * the role, the employer, where it is, and what it pays - and the rest is the
 * employer's own text. A listing with no description of its own still needs
 * one: `description` is a required field, so the fallback is the facts, said
 * as a sentence, which is all that is actually known about the role.
 */
export const jobDescriptionParagraphs = (j) => {
  const title = String((j && j.title) || "").trim();
  const company = String((j && j.company) || "").trim();
  const location = String((j && j.location) || "").trim();
  const salary = String((j && j.salary) || "").trim();
  const category = String((j && j.category) || "").trim();

  const lead = [
    title && company ? `${title} at ${company}` : (title || company),
    location ? `in ${location}` : "",
    salary ? `| ${salary}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  const paragraphs = [];
  if (lead) paragraphs.push(lead);
  paragraphs.push(...jobBodyParagraphs(j));
  if (paragraphs.length) return paragraphs;

  // No description and no title to lead with: say the one thing that is known.
  const fallback = [
    title ? `${title}${company ? ` at ${company}` : ""} is open` : "A role is open",
    location ? `in ${location}` : "in India",
    category ? `in the ${category} category` : "",
    salary ? `| ${salary}` : ""
  ]
    .filter(Boolean)
    .join(" ");
  return [fallback];
};

export const jobPostingDescription = (j) => {
  const paragraphs = jobDescriptionParagraphs(j);
  if (!paragraphs.length) return "";
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
};

export const jobPostingFor = (j) => {
  const title = j && j.title ? String(j.title).trim() : "";
  const company = j && j.company ? String(j.company).trim() : "";
  const desc = jobPostingDescription(j);
  const datePosted = jobDatePosted(j);

  const g = {
    "@type": "JobPosting",
    // The posting's own address, which is the page that carries it.
    url: `${SITE_URL}/jobs/${jobSlug(j)}`,
    name: title || company,
    title: title || company,
    description: desc,
    hiringOrganization: { "@type": "Organization", name: company },
    identifier: {
      "@type": "PropertyValue",
      name: company ? `${company} - ${title}` : title,
      // The value is what makes an identifier an identifier: Google's own
      // example is a name plus a number. The row's uuid is the one handle
      // Swapiki has for this posting that never changes and never repeats.
      value: j && j.id ? String(j.id) : undefined
    },
    datePosted
  };
  if (g.identifier.value === undefined) delete g.identifier.value;
  if (g.datePosted === undefined) delete g.datePosted;

  const employmentTypes = employmentTypeFromTitle(title);
  if (employmentTypes.length === 1) g.employmentType = employmentTypes[0];
  else if (employmentTypes.length > 1) g.employmentType = employmentTypes;

  const validThrough = jobValidThrough(j);
  if (validThrough !== undefined) g.validThrough = validThrough;

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
  const loc = jobLocationFor(j.location);
  if (loc) {
    g.jobLocation = loc.place;
    if (loc.type) g.jobLocationType = loc.type;
    if (loc.applicantLocationRequirements) {
      g.applicantLocationRequirements = loc.applicantLocationRequirements;
    }
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
 * the page points back at them by @id, so the whole document resolves as a
 * single connected entity.
 *
 * There are deliberately NO JobPosting nodes here. The board is a list of jobs,
 * and Google's job posting content policy says so in as many words: "The
 * JobPosting markup must only be used on pages that contain a single job
 * posting. We don't allow the use of JobPosting markup in any other page,
 * including pages that do not list any job." Their technical guidelines say the
 * same from the other side - put the markup on the most detailed leaf page
 * possible, not on a page that presents a list. A posting also has to sit "on
 * the same page as the job description that job seekers can read in their
 * browser", and a board card shows a title, a company and a location, not the
 * job's description.
 *
 * So each posting lives on its own /jobs/<slug> page, which is the leaf page
 * that does carry the description. That is also the shape Google can actually
 * use: a hundred postings on one list URL all share a single canonical address,
 * while a leaf page gives each job its own address to be indexed and cited under.
 *
 * There are deliberately NO ItemList nodes here either, and that is a decision
 * with evidence behind it. An ItemList is Google's carousel markup, and it is
 * only supported next to a Course list, a Movie, a Recipe or a Restaurant. A
 * list of job pages is none of those, so the board's ItemList could never
 * become a carousel - it could only become a report. Search Console counted
 * every one of its ListItems as an item on the page and flagged them:
 * "/jobs: 200 items detected, some are invalid". The board's own openings are
 * still described, the way Google reads a job board: one canonical page per
 * posting (JobPosting on the leaf), a link to each from here, and every leaf in
 * the sitemap.
 *
 * The SPA's own signed-in version replaces this block, which is why it carries an
 * id - js/app.js reuses #jobs-jsonld rather than adding a second graph.
 */
export const jsonLdBlock = () => {
  const page = {
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/jobs#webpage`,
    url: `${SITE_URL}/jobs`,
    name: "Swapiki Jobs — IT, BFSI & Other Roles in India",
    isPartOf: { "@id": SITE_ID },
    about: { "@id": ORG_ID }
  };

  const payload = graph([
    organization(),
    website(),
    page
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
// `created_at` is selected alongside `first_seen_at` because four listings
// submitted through the board's own form carry no arrival date, and Google
// rejects a JobPosting with no `datePosted`. Their creation date is when the
// posting actually went live, so it is a fact about the listing rather than
// the render date the schema must never be given.
const BOARD_COLUMNS = "id,title,company,location,category,salary,first_seen_at,created_at,apply_url,salary_min,salary_max,featured";
const BOARD_NO_FEATURED = "id,title,company,location,category,salary,first_seen_at,created_at,apply_url,salary_min,salary_max";
const BOARD_FALLBACK = "id,title,company,location,category,salary,first_seen_at,created_at,apply_url";

// The single-job page also wants the body text, which is far too large to inline
// for the whole board. `id` is not optional in any shape: it is the lookup key
// and the slug's tail, so a shape without it cannot produce a URL.
//
// `last_seen_at` rides in the widest shape because the posting's `validThrough`
// is read from it - the last date the feed was seen carrying the listing, which
// is the only expiry fact this board holds. It is a long-standing column that
// the importer writes on every run, so it is safe to ask for; and if it ever
// were not, the narrow fallback below still serves the page, just without an
// expiry date.
//
// Shape order is widest-useful-first, NOT most-columns-first. employment_type is
// tried LAST and on its own: it is not in the production table, and asking for
// it in the first shape made every single-job request fail its first query and
// fall back to a shape without the salary bounds - so a job whose employer did
// publish a salary showed no structured pay on its own page, while the board
// (whose shapes never asked for it) did. A column that is not in the schema
// should cost one narrow retry, not the whole payload.
const ONE_COLUMNS = "id,title,company,location,category,salary,description,first_seen_at,created_at,last_seen_at,apply_url,salary_min,salary_max";
const ONE_WITH_TYPE = `${ONE_COLUMNS},employment_type`;
const ONE_FALLBACK = "id,title,company,location,category,salary,description,first_seen_at,created_at,apply_url";

const authHeaders = (serviceKey) => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`
});

// The board's shapes and order, shared by the full-corpus fetch (the sitemap,
// the no-JS fallback) and the single-page fetch the served board uses.
//
// `featured` leads the order, which is what keeps the studio's own openings at
// the top of the board. The sort is read out of the SHAPE rather than out of the
// retry count: asking PostgREST to sort on a column the same request does not
// select fails on exactly the column the retry just dropped, which used to burn
// a third round trip on every board page whenever the pin was missing from the
// schema. A shape without the pin sorts without it, and the next request picks
// the pin back up only when it comes back.
const BOARD_SHAPES = [BOARD_COLUMNS, BOARD_NO_FEATURED, BOARD_FALLBACK];
const ORDER_FEATURED = "featured.desc,created_at.desc,id.asc";
const ORDER_PLAIN = "created_at.desc,id.asc";
const orderFor = (select) => (String(select).includes("featured") ? ORDER_FEATURED : ORDER_PLAIN);

/**
 * The total out of a PostgREST `Content-Range`, or 0 when there is none.
 *
 * Both forms the database serves are read: a range like "0-199/6352" when rows
 * come back, and the same shape with a bare count when only the total was asked
 * for. A missing header is a real answer too - it means the count was not
 * requested or not honoured - and it comes back as 0 rather than a guess, so a
 * caller can tell "unknown" from "no jobs" and stop claiming a total it does not
 * have.
 */
const totalFromRange = (header) => {
  const m = /\/(\d+|\*)\s*$/.exec(String(header || ""));
  if (!m || m[1] === "*") return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
};

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
const fetchPage = async (base, shapes, headers, orderFor, select, offset, limit = 500) => {
  const url =
    `${base}/rest/v1/jobs?status=eq.published&select=${select}` +
    `&order=${orderFor(select)}&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers });
  const narrow = nextShape(shapes, select, res);
  const next = await narrow();
  if (next === null) return { res, select };
  // orderFor is re-applied to the NEW shape rather than carried over. Sorting on
  // a column the retry just dropped fails the whole query, so the two have to fall
  // back together - and carrying the old order down makes every attempt fail.
  return fetchPage(base, shapes, headers, orderFor, shapes[next], offset, limit);
};

/**
 * The one page of jobs the served board actually displays, plus the exact
 * published total, in a single request.
 *
 * The board renders at most SHELL_LIST_CAP cards, so fetching the whole corpus
 * to draw 200 of them was the reason /jobs took seconds of server time before
 * its first byte. One page plus `Prefer: count=exact` says everything the page
 * needs: the rows it shows and how many there really are, so "the first 200 of
 * N" stays truthful instead of silently truncating.
 *
 * The full corpus is not going away - every job still has its own page and its
 * own place in the sitemap, which is where the rest of the board is discovered
 * from (see functions/sitemap.xml.js and functions/jobs/[slug].js).
 */
export async function fetchBoardPage(supabaseUrl, serviceKey, limit) {
  if (!serviceKey) return { jobs: [], total: 0 };
  const headers = { ...authHeaders(serviceKey), Prefer: "count=exact" };
  let select = BOARD_SHAPES[0];
  try {
    const { res, select: ok } = await fetchPage(supabaseUrl, BOARD_SHAPES, headers, orderFor, select, 0, limit);
    select = ok;
    if (!res.ok) {
      console.warn("[jobs] board page fetch failed:", res.status);
      return { jobs: [], total: 0 };
    }
    const jobs = cleanJobRows(await res.json());
    return { jobs: jobs, total: totalFromRange(res.headers.get("content-range")) || jobs.length };
  } catch (err) {
    console.warn("[jobs] board page fetch threw:", err && err.message);
    return { jobs: [], total: 0 };
  }
}

/**
 * One filtered page of the board plus its exact total, in a single request.
 *
 * Used by the city hubs (/jobs/in/<city>). Filtering happens in the database,
 * not in the handler: a hub that read the whole published corpus to keep a
 * hundred rows would cost the same dozen round trips the board used to, on a
 * route that is crawled far more often than the board's cold path ever was.
 *
 * `filter` is a raw PostgREST query fragment such as `or=(location.ilike...)`
 * — see cityOrParam in functions/lib/job-hubs.js, which is the only caller and
 * the only place the encoding is worked out. The same column-shape walk the
 * rest of this module uses still applies, because a filter does not make the
 * salary columns appear if the migration has not run.
 */
export async function fetchJobsMatchingFilter(supabaseUrl, serviceKey, filter, limit) {
  if (!serviceKey || !filter) return { jobs: [], total: 0 };
  const headers = { ...authHeaders(serviceKey), Prefer: "count=exact" };
  for (const select of BOARD_SHAPES) {
    const url =
      `${supabaseUrl}/rest/v1/jobs?status=eq.published&${filter}&select=${select}` +
      `&order=${orderFor(select)}&limit=${limit}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      // A missing column is the migration not having run and is retried on the
      // next shape. Anything else is a real failure and must not be retried
      // into an empty hub that looks like "no jobs in this city".
      const body = await res.clone().text().catch(() => "");
      if (res.status === 400 && isMissingColumnError(body)) continue;
      console.warn("[jobs] filtered board fetch failed:", res.status);
      return { jobs: [], total: 0 };
    }
    const jobs = cleanJobRows(await res.json());
    return { jobs: jobs, total: totalFromRange(res.headers.get("content-range")) || jobs.length };
  }
  return { jobs: [], total: 0 };
}

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
  const headers = authHeaders(serviceKey);
  const PAGE_SIZE = 500;
  const MAX_PAGES = 20;

  let jobs = [];
  try {
    // Carried out of the loop once a page has told us what the schema is.
    let select = BOARD_SHAPES[0];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { res, select: ok } = await fetchPage(supabaseUrl, BOARD_SHAPES, headers, orderFor, select, page * PAGE_SIZE, PAGE_SIZE);
      select = ok;
      if (!res.ok) {
        // Losing the first page blanks the board, which is the failure these
        // handlers exist to avoid, so it is reported rather than swallowed.
        console.warn("[jobs] published jobs fetch failed:", res.status);
        return [];
      }
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) break;
      jobs = jobs.concat(cleanJobRows(rows));
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
      return Array.isArray(rows) && rows.length ? cleanJobRow(rows[0]) : null;
    }
  } catch (err) {
    console.warn("[jobs] job fetch threw:", err && err.message);
  }
  return null;
}
