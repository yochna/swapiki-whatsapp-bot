// City hub definitions — the one place a "jobs in <city>" page's address,
// heading and location-matching all come from.
//
// Why a fixed curated list rather than discovering cities at runtime: the
// sitemap and the hub pages have to agree about what exists, and a URL that
// appears and disappears as the feed churns is a URL a crawler indexes once and
// then finds gone. A soft-404 in the sitemap is worse than a hub that is not
// there at all.
//
// Why hubs exist at all: /jobs is one URL for every role in India, so it can
// only ever compete for the head term "jobs" — whose SERP is Indeed, LinkedIn,
// Naukri and Google for Jobs, none of which a new board displaces. The queries
// a new job board can actually win are the long ones: "software engineer jobs
// in bangalore", "fresher jobs in pune". Those need a page per city.
//
// `aliases` are the spellings employers actually write in the location column.
// "Bengaluru" and "Bangalore" are the same city, and a hub that matched only
// one of them would silently miss about half its own listings. Matching is a
// case-insensitive substring test in both places it is used — here for the
// sitemap's counts, and translated into a PostgREST `ilike` pattern for the hub
// page's own query — so the two can never disagree about how many jobs a city
// has.

/**
 * Below this many live openings a city does not get a hub page.
 *
 * A page with three jobs on it is a page a searcher lands on and immediately
 * leaves, which is the opposite of what a hub is for. Every city in JOB_CITIES
 * clears this bar on a normal board; the constant exists so the sitemap can
 * drop a hub that has dried up rather than advertising a near-empty page.
 */
export const HUB_MIN_JOBS = 15;

/**
 * The hubs, ordered by search demand rather than alphabetically — the order is
 * also the order they are listed in on each other's pages, so the biggest
 * markets cross-link first.
 */
export const JOB_CITIES = [
  {
    slug: "bangalore",
    name: "Bangalore",
    // Both names are in active use — the rename is incomplete in practice and
    // a job seeker searches either one.
    synonyms: ["Bengaluru"],
    aliases: ["bangalore", "bengaluru"]
  },
  { slug: "hyderabad", name: "Hyderabad", synonyms: [], aliases: ["hyderabad"] },
  { slug: "chennai", name: "Chennai", synonyms: ["Madras"], aliases: ["chennai", "madras"] },
  { slug: "pune", name: "Pune", synonyms: [], aliases: ["pune"] },
  // Matches "Navi Mumbai, Maharashtra" too, which is the same labour market.
  // Thane and Kalyan are separate cities with their own names and are not
  // claimed here.
  { slug: "mumbai", name: "Mumbai", synonyms: ["Bombay"], aliases: ["mumbai"] },
  // Deliberately NOT folded into the Mumbai hub: Thane is its own labour market
  // with its own search demand, and quietly counting its listings under Mumbai
  // would inflate one page's numbers with jobs a reader would have to commute
  // across a district boundary to reach.
  { slug: "thane", name: "Thane", synonyms: [], aliases: ["thane"] },
  {
    slug: "delhi-ncr",
    name: "Delhi NCR",
    synonyms: ["Delhi", "New Delhi", "Noida", "Gurgaon"],
    aliases: ["delhi", "noida", "gurgaon", "gurugram", "faridabad", "ghaziabad"]
  },
  { slug: "kolkata", name: "Kolkata", synonyms: ["Calcutta"], aliases: ["kolkata", "calcutta"] },
  { slug: "ahmedabad", name: "Ahmedabad", synonyms: [], aliases: ["ahmedabad"] },
  { slug: "coimbatore", name: "Coimbatore", synonyms: ["Kovai"], aliases: ["coimbatore", "kovai"] },
  { slug: "kochi", name: "Kochi", synonyms: ["Cochin"], aliases: ["kochi", "cochin"] },
  { slug: "jaipur", name: "Jaipur", synonyms: [], aliases: ["jaipur"] },
  { slug: "indore", name: "Indore", synonyms: [], aliases: ["indore"] },
  { slug: "vadodara", name: "Vadodara", synonyms: ["Baroda"], aliases: ["vadodara", "baroda"] },
  { slug: "chandigarh", name: "Chandigarh", synonyms: [], aliases: ["chandigarh"] },
  { slug: "nagpur", name: "Nagpur", synonyms: [], aliases: ["nagpur"] },
  { slug: "remote", name: "Remote", synonyms: ["Work from home", "WFH"], aliases: ["remote", "workfromhome", "anywhere"] }
];

/** The hub for a /jobs/in/<slug> path segment, or null when there is no such hub. */
export const cityBySlug = (slug) => {
  const wanted = String(slug == null ? "" : slug).toLowerCase();
  return JOB_CITIES.find((c) => c.slug === wanted) || null;
};

/**
 * Does this job belong on this city's hub?
 *
 * Deliberately the same substring test the sitemap uses, so the hub's own
 * count, the "first N of M" line and the sitemap entry can never drift apart.
 * An empty location matches nothing — a nationwide or unstated listing is not
 * evidence of a city.
 */
export const matchesCity = (job, city) => {
  const loc = String((job && job.location) || "").toLowerCase();
  if (!loc) return false;
  return city.aliases.some((a) => loc.includes(a));
};

/** Every job in the corpus that belongs on this hub, in the corpus's own order. */
export const jobsInCity = (jobs, city) => (Array.isArray(jobs) ? jobs.filter((j) => matchesCity(j, city)) : []);

/**
 * The PostgREST `or=(...)` filter that selects this city's jobs.
 *
 * The `%` wildcards are percent-encoded on purpose. PostgREST URL-decodes the
 * filter before it reaches the LIKE pattern, so a bare `%ba` is read as a hex
 * escape for one byte rather than as "starts with bangalore" — the query would
 * succeed, match nothing, and the hub would render empty with no error
 * anywhere. `%25` survives the decode and arrives as the wildcard it is.
 *
 * Commas and parentheses are left raw because they are the `or` operator's own
 * syntax, not data.
 */
export const cityOrParam = (city) =>
  "or=(" + city.aliases.map((a) => `location.ilike.%25${encodeURIComponent(a)}%25`).join(",") + ")";

/** Human-formatted count — Indian grouping, because every reader here is in India. */
export const fmtCount = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return "0";
  return num.toLocaleString("en-IN");
};
