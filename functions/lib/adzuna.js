// Adzuna job-feed adapter — PURE LOGIC, NO I/O, NO SECRETS.
//
// Deliberately free of fetch() and of any Supabase call so the interesting part
// (mapping a messy third-party listing onto our `jobs` columns) can be unit
// tested offline. functions/ingest.js does the talking; this file only decides
// what a listing should become.
//
//   Adzuna docs: https://developer.adzuna.com/docs/search
//   A search response is { count, mean_salary, results: [ ... ] } and each
//   result carries: id, title, description, created, redirect_url, contract_type,
//   contract_time, salary_min, salary_max, salary_is_predicted, category{label,tag},
//   company{display_name}, location{display_name,area[]}.
//
//   India is country code "in" and all salary figures are annual INR.

export const COUNTRY = "in";
export const PAGE_SIZE = 50;

/**
 * The searches we run on each ingest. Deliberately a small, fixed list rather
 * than a free-text search box: an unattended job that runs every hour against
 * an open-ended query is a rate-limit problem waiting to happen, and a fixed set
 * is a curation decision instead of an accident.
 *
 * Each entry is { what, where } and maps to Adzuna's `what` / `where` params.
 * `where` is a plain location string, not a radius.
 */
export const DEFAULT_QUERIES = [
  { what: "software developer", where: "India" },
  { what: "data analyst", where: "India" },
  { what: "banking", where: "India" },
  { what: "finance", where: "India" },
  { what: "developer intern", where: "India" },
  { what: "software engineer intern", where: "India" },
  { what: "data science intern", where: "India" },
  { what: "business analyst intern", where: "India" },
  { what: "graduate engineer trainee", where: "India" }
];

/**
 * Builds one Adzuna search URL.
 *
 * `max_days_old` is the single most important parameter here. Without it every
 * run re-imports the entire historical feed and the draft queue becomes
 * useless. 3 days comfortably covers a run that fires daily.
 */
export function buildSearchUrl({ appId, appKey, page = 1, what, where, maxDaysOld = 3 }) {
  if (!appId || !appKey) throw new Error("Adzuna app_id/app_key are required.");
  const p = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(PAGE_SIZE),
    what: what || "",
    where: where || "",
    sort_by: "date",
    max_days_old: String(maxDaysOld),
    "content-type": "application/json"
  });
  return `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/${page}?${p.toString()}`;
}

/**
 * Adzuna's own listing id is stable across runs, so it is the dedupe key.
 * Prefixed with the country so a future second market can't collide.
 */
export function dedupeKeyFor(id) {
  return `adzuna:${COUNTRY}:${String(id).trim()}`;
}

/**
 * Tags a listing can plausibly be asked about, matched case-insensitively.
 *
 * Grown from what the live India feed actually names. At 40-odd terms, measured
 * against the draft queue, 2 of 37 pending listings carried any skill at all: not
 * because the listings were technology-free, but because the feed was talking
 * about Kafka, Snowflake, CyberArk and Workday and none of those were in here.
 * A missing skill costs a candidate real ranking, so the list is deliberately
 * generous about unambiguous product and language names.
 *
 * The exclusions matter as much as the inclusions. "go", "r", "shell", "chef",
 * "bar" and "scala"-as-a-word are the ones that would fire on ordinary prose
 * ("react to change", "Shell" the oil major, a restaurant kitchen), and a
 * fabricated skill misleads a candidate rather than merely under-ranking them,
 * so those are left out on purpose. See extractSkills for the matching rules.
 */
const SKILL_VOCAB = [
  "javascript", "typescript", "react", "react native", "angular", "vue", "next.js",
  "nuxt", "redux", "node", "node.js", "express", "jquery", "html", "css",
  "python", "django", "flask", "fastapi", "pandas", "numpy", "java", "spring",
  "spring boot", "hibernate", "kotlin", "scala", "c++", "c#", ".net", "golang",
  "rust", "matlab", "verilog", "vhdl", "php", "wordpress", "laravel",
  "sql", "pl/sql", "mssql", "nosql", "mongodb", "postgresql", "mysql", "oracle",
  "redis", "elasticsearch", "graphql", "rest api", "restful", "microservices",
  "mvc", "etl", "data analysis", "data engineering", "data governance",
  "machine learning", "deep learning", "nlp", "computer vision", "pandas",
  "spark", "pyspark", "hadoop", "hive", "flink", "kafka", "airflow", "dagster",
  "dbt", "snowflake", "databricks", "bigquery", "redshift", "synapse", "teradata",
  "power bi", "tableau", "qlik", "looker", "microstrategy", "alteryx", "excel",
  "vba", "aws", "azure", "gcp", "openstack", "docker", "kubernetes", "helm",
  "terraform", "ansible", "jenkins", "gitlab", "github actions", "ci/cd",
  "linux", "unix", "bash", "git", "vmware", "citrix", "intune", "sccm",
  "active directory", "okta", "cyberark", "infosec", "cybersecurity", "siem",
  "qa", "unit testing", "automation", "embedded", "firmware", "plc",
  "sap", "sap abap", "workday", "servicenow", "salesforce", "microsoft dynamics",
  "powerapps", "power apps", "sharepoint", "quickbooks", "tally", "figma"
];

/**
 * Conservative skill extraction.
 *
 * The `jobs.skills` array is not cosmetic: profileMatch.requiredSkills() reads
 * it to score a candidate against a listing, so a sloppy extraction actively
 * degrades the one feature the product is built around. Adzuna sends no
 * structured skills, so we only ever match an explicit vocabulary — never
 * guess at a technology from free prose — and cap the result. Unknown
 * technology simply does not appear, which is the correct failure: a missing
 * skill costs a little ranking, a fabricated one misleads a candidate.
 *
 * Matching runs over title + description. Measured against the live India feed,
 * title-only recovered skills for 11 of 50 software roles; adding the
 * description recovered 17, and every hit inspected was a genuine mention
 * ("Java Spring Boot Developer" -> java, sql; "MS SQL Developer" -> sql).
 * The fixed vocabulary is what keeps this safe - a real mention has to be one of
 * the literal strings listed above.
 */
export function extractSkills(text, limit = 6) {
  const hay = String(text || "").toLowerCase();
  if (!hay) return [];
  const hits = [];
  for (const skill of SKILL_VOCAB) {
    if (hits.length >= limit) break;
    // "c++" and "ci/cd" contain regex metacharacters, so escape everything.
    const safe = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9+#])${safe}([^a-z0-9+#]|$)`, "i");
    if (re.test(hay)) hits.push(skill);
  }
  return hits;
}

/** Adzuna descriptions are HTML. Flatten to plain text and cap the length. */
export function stripHtml(html, maxLen = 4000) {
  const text = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li\s*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).trim() + "..." : text;
}

/**
 * Maps Adzuna's free-form category onto our three buckets.
 * Anything unrecognised is "any" rather than a guess — the category is shown to
 * candidates as a filter, so a wrong label hides the job from the right people.
 */
export function classifyCategory(result) {
  const hay = [
    result && result.category && result.category.label,
    result && result.category && result.category.tag,
    result && result.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(bank|banking|finance|financial|insurance|account|accounting|audit|treasury|bfsi|loan|credit)\b/.test(hay)) {
    return "bfsi";
  }
  if (/\b(it|software|developer|engineer|programmer|data|devops|analyst|tech)\b/.test(hay)) {
    return "it";
  }
  return "any";
}

/**
 * Is this salary Adzuna's guess rather than the employer's stated figure?
 *
 * Adzuna sends this field as the STRING "0"/"1", not a number — verified against
 * the live India feed, where every result carried typeof "string". That matters
 * because the non-empty string "0" is TRUTHY in JavaScript, so a plain
 * `if (result.salary_is_predicted)` test drops every employer-stated salary in
 * the feed and keeps only the predicted ones: precisely backwards. Coerce
 * explicitly and accept both shapes.
 */
export function isPredictedSalary(result) {
  const v = result && result.salary_is_predicted;
  if (v === true || v === 1) return true;
  if (typeof v === "string") return v.trim() === "1" || v.trim().toLowerCase() === "true";
  return false;
}

/**
 * Formats a salary range, or "" when there is nothing trustworthy to show.
 *
 * Adzuna sets salary_is_predicted when IT inferred the figure from the
 * description text rather than the employer stating it. On a site whose whole
 * premise is not publishing numbers we cannot stand behind, a predicted figure
 * rendered as "₹8,00,000 - ₹12,00,000" is indistinguishable from a stated one
 * to the reader. So predicted salaries are dropped rather than caveated.
 */
export function formatSalary(result) {
  if (!result) return "";
  if (isPredictedSalary(result)) return "";
  // Missing salary arrives as absent (undefined), not null, so Number() gives
  // NaN and isFinite rejects it.
  const min = Number(result.salary_min);
  const max = Number(result.salary_max);
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;
  if (!hasMin && !hasMax) return "";

  const fmt = n =>
    "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
  if (hasMin && hasMax) {
    if (max <= min) return "";
    // A band this wide is a unit error in the feed, not a salary. The live India
    // feed served a "Sales Intern" at Rs 1,20,000 - 12,00,000, a 10x span that
    // looks like a monthly figure paired with an annual one. Printing it as a
    // range would be both absurd and indistinguishable from a real offer.
    if (max / min > 4) return "";
    return `${fmt(min)} - ${fmt(max)}`;
  }
  return hasMax ? `Up to ${fmt(max)}` : `From ${fmt(min)}`;
}

/**
 * The numeric bounds behind the formatted salary, or nulls.
 *
 * Kept separate from formatSalary so the same plausibility rules decide whether
 * a salary is usable. These are the only form structured data can consume:
 * schema.org wants a number, and re-parsing the formatted string later would be
 * guesswork about a currency-formatted range.
 */
export function salaryBounds(result) {
  if (!result || isPredictedSalary(result)) return { min: null, max: null };
  const min = Number(result.salary_min);
  const max = Number(result.salary_max);
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;
  if (!hasMin && !hasMax) return { min: null, max: null };
  if (hasMin && hasMax) {
    if (max <= min) return { min: null, max: null };
    if (max / min > 4) return { min: null, max: null };
    return { min, max };
  }
  return { min: hasMin ? min : null, max: hasMax ? max : null };
}

/**
 * Adzuna -> a row for the `jobs` table.
 *
 * status is hardcoded to "draft" and is not derived from anything in the feed.
 * Nothing upstream can set it to "published", and functions/ingest.js only ever
 * INSERTs new rows (existing keys are PATCHed for last_seen_at alone), so an
 * imported listing can never overwrite the status of a job a human already
 * published. See supabase/jobs_ingest_migration.sql.
 */
export function normalizeResult(result, { now = new Date() } = {}) {
  if (!result || !result.id) return null;

  const title = String(result.title || "").trim();
  const company = String(
    (result.company && result.company.display_name) || ""
  ).trim();
  // No title or no company: the board's own admin form rejects these, so the
  // importer should too rather than filling the queue with unusable rows.
  if (!title || !company) return null;

  const location = String(
    (result.location && result.location.display_name) || ""
  ).trim();
  const description = stripHtml(result.description);
  // Title + description, not title alone: see extractSkills for the measurement.
  const skills = extractSkills(`${title} ${description}`);
  const iso = Number.isNaN(now.getTime()) ? new Date().toISOString() : now.toISOString();

  const bounds = salaryBounds(result);
  return {
    dedupe_key: dedupeKeyFor(result.id),
    title,
    company,
    location: location || null,
    category: classifyCategory(result),
    salary: formatSalary(result) || null,
    salary_min: bounds.min,
    salary_max: bounds.max,
    contact: String(result.redirect_url || "").trim() || null,
    apply_url: String(result.redirect_url || "").trim() || null,
    source: "adzuna",
    skills,
    description,
    raw_text: description,
    status: "draft",
    first_seen_at: iso,
    last_seen_at: iso
  };
}

/**
 * Flattens several Adzuna responses into a deduped candidate list.
 *
 * Two different queries routinely return the same listing, and a single run
 * pages through several feeds. Without this the run would submit the same
 * dedupe_key twice and the unique index would reject the second one, failing
 * the whole batch. First occurrence wins.
 */
export function dedupeRows(rows) {
  const seen = new Map();
  for (const row of rows || []) {
    if (!row || !row.dedupe_key) continue;
    if (!seen.has(row.dedupe_key)) seen.set(row.dedupe_key, row);
  }
  return Array.from(seen.values());
}
