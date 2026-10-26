// Shared schema.org entity graph.
//
// Why this file exists: every surface used to describe Swapiki in a way that
// stood alone. The homepage said "WebApplication", the board said "568
// unconnected JobPostings", and a job page said "JobPosting". Search engines
// reconcile those by fuzzy string matching. Answer engines do not - they build a
// knowledge graph and follow typed edges. A posting whose hiringOrganization is
// a bare string and whose publisher is absent is a node with no path back to the
// product, so it is much weaker as a citable answer than the same posting wired
// into one coherent graph.
//
// So every surface now emits the SAME two canonical nodes, referenced by stable
// @id, and hangs its own nodes off them. Identical @id values are what let an
// engine merge the descriptions instead of treating them as separate entities.
//
// What is deliberately NOT here:
//   - sameAs. The only social URLs in the repo are `<input placeholder>`
//     attributes on the profile editor. Pointing an Organization node at
//     "github.com/username" would be a fabricated identity claim, which is
//     worse than having no cross-reference at all. Add real profile URLs here
//     once they exist.
//   - foundingDate, numberOfEmployees, aggregateRating, address. None are
//     established anywhere in the product, and inventing any of them is the
//     exact failure mode rich-results penalties are issued for.
//   - "Voice Verified" as a real credential. The landing page deliberately
//     describes it as a liveness check, not a verification, and the schema must
//     not claim more than the page does.

export const SITE_URL = "https://swapiki.com";

/** Stable fragment @ids. Fragments, not paths, because / is the WebSite itself. */
export const ORG_ID = `${SITE_URL}/#organization`;
export const SITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#app`;

/**
 * The company behind the product. This is the node every other entity points
 * back to, and the one an answer engine resolves "what is Swapiki" against.
 */
export const organization = () => ({
  "@type": "Organization",
  "@id": ORG_ID,
  name: "Swapiki",
  url: `${SITE_URL}/`,
  description:
    "Swapiki is a skill-highlighting hiring platform where candidates present real project proof with a short recorded voice walkthrough, and recruiters review that work directly instead of an AI-screened resume.",
  logo: {
    "@type": "ImageObject",
    url: `${SITE_URL}/assets/logo/logo-horizontal.svg`
  },
  // The product is India-facing: every published listing is an Indian role, and
  // the salary figures are INR.
  areaServed: { "@type": "Country", name: "India" }
});

/** The site itself, with the publisher edge that ties pages back to the org. */
export const website = () => ({
  "@type": "WebSite",
  "@id": SITE_ID,
  name: "Swapiki",
  url: `${SITE_URL}/`,
  inLanguage: "en-IN",
  publisher: { "@id": ORG_ID }
});

/**
 * The application node. The description is the one the landing page already
 * makes and the existing tests already police - notably that the audio is never
 * scored and nothing is presented as independently verified. It is reused
 * verbatim rather than restated, so the two cannot drift apart.
 */
export const webApplication = ({ description, offers } = {}) => ({
  "@type": "WebApplication",
  "@id": APP_ID,
  name: "Swapiki",
  url: `${SITE_URL}/`,
  ...(description ? { description } : {}),
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any (web-based)",
  publisher: { "@id": ORG_ID },
  isPartOf: { "@id": SITE_ID },
  ...(offers ? { offers } : {})
});

/** The free-pilot offer. Price is zero for the whole pilot, so no currency guess. */
export const freePilotOffer = () => ({
  "@type": "Offer",
  price: "0",
  priceCurrency: "INR",
  description: "Free during the current pilot phase"
});

/* NOTE: there is deliberately no ItemList helper here any more.
 *
 * An ItemList is not a neutral "here is an ordered set" annotation - in Google's
 * structured data it IS the carousel markup, and it is only supported next to
 * one of four content types:
 *
 *   "To be eligible for a host carousel rich result for your site, add ItemList
 *    structured data in combination with one of the following supported
 *    structured data features: Course list, Movie, Recipe, Restaurant."
 *    (https://developers.google.com/search/docs/appearance/structured-data/carousel)
 *
 * A job board is none of those, so a list of job pages can never become a valid
 * carousel item. What it did become was a report: Search Console counted every
 * ListItem as an item on the page and flagged them - "/jobs: 200 items detected,
 * some are invalid" - because a carousel of JobPostings is not a carousel
 * Google can show. The markup bought nothing and cost the board a clean report.
 *
 * The jobs pages therefore declare no ItemList at all. The set of openings is
 * still stated the way Google reads it for jobs: one canonical page per posting
 * (JobPosting on the leaf), linked from the board, and listed in the sitemap.
 */

/**
 * The FAQ graph, built from answers that already exist as visible text in
 * index.html. Schema.org requires a question/answer pair to be present in the
 * page's content too, so the caller must pass the same wording that renders -
 * the test for this asserts the JSON-LD questions appear verbatim in the HTML.
 */
export const faqPage = (pairs, { id = `${SITE_URL}/#faq` } = {}) => ({
  "@type": "FAQPage",
  "@id": id,
  mainEntity: pairs.map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a }
  }))
});

/** Wraps nodes in one document so the @ids in them resolve against each other. */
export const graph = (nodes) => ({
  "@context": "https://schema.org",
  "@graph": nodes.filter(Boolean)
});

/** The plain-text facts an answer engine can lift without parsing HTML. */
export const KEY_FACTS = [
  "Swapiki is a skill-highlighting hiring platform for India-focused hiring.",
  "Candidates publish one or two real projects plus a recorded voice walkthrough of under two minutes.",
  "The voice recording is never scored, ranked or sentiment-analysed; only an on-screen phrase is read to confirm a live microphone.",
  "Swapiki does not verify identity and does not mark any profile or project as verified.",
  "The jobs board is gated at 80% profile completeness; the listings themselves are public.",
  "Swapiki is free for the duration of its pilot phase.",
  "Each job has its own public page at /jobs/<title>-<company>--<id>, and all of them are listed in /sitemap.xml."
];
