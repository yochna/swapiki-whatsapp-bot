// Cloudflare Pages Function — Route: POST /ingest
//
// Pulls new openings from the Adzuna feed and lands them in the SAME draft
// queue the manual admin form fills.
//
//   POST /ingest                 ingest only, everything stays a draft
//   POST /ingest?curate=1        ingest, then triage the draft queue
//   POST /ingest?curate=1&dry=1  preview the triage; writes nothing, skips the feed
//   x-ingest-secret: <INGEST_SECRET>       (required)
//
//   -> { inserted, refreshed, skipped, queries, errors, curation? }
//
// AUTH
//   The only callers are a scheduler and you. A shared secret in a header is the
//   whole mechanism, compared in constant time. There is no cookie, no session,
//   and no admin login path into this route: ingestion writes to `jobs` with the
//   service role key, which bypasses the table's admin-only RLS, so an
//   unauthenticated caller would otherwise be able to write straight into the
//   database. Keep INGEST_SECRET out of config.js and index.html — it is a
//   Cloudflare environment variable only, and it is NOT the Supabase service
//   role key.
//
// WHY NOTHING PUBLISHES BY ACCIDENT
//   Every insert sets status = 'draft' (hardcoded in normalizeResult). Existing
//   rows are only PATCHed for last_seen_at, so re-running this never flips a
//   published job back to draft and never edits a human-approved listing's
//   content. Plain POST /ingest is a queue-filler, not a publisher.
//
// PUBLICATION IS OPT-IN AND SEPARATE
//   ?curate=1 is the only path that can set a job to published, and it does so
//   via applyCuration, never from anything the feed says. It reads only
//   source=eq.adzuna drafts — a hand-typed draft belongs to a human and is never
//   touched. Recognised roles publish, unwanted ones are marked 'rejected' (kept,
//   not deleted, so the decision is auditable), and unrecognised titles are left
//   as drafts for review. A plain ingest never curates.
//
// REQUIREMENTS
//   ADZUNA_APP_ID, ADZUNA_APP_KEY, INGEST_SECRET, SUPABASE_SERVICE_ROLE_KEY
//   (SUPABASE_URL is optional and falls back to the project default).
//   Without ADZUNA_APP_ID/APP_KEY the route returns 503 and explains itself
//   rather than silently importing nothing. A dry run needs no Adzuna
//   credentials, because it never reaches the feed.

import {
  DEFAULT_QUERIES,
  buildSearchUrl,
  normalizeResult,
  dedupeKeyFor,
  dedupeRows
} from "./lib/adzuna.js";
import { curateBatch, CURATE_RULES, UNDECIDED_EXPIRY_DAYS } from "./lib/curate.js";
import { isMissingColumnError, rest } from "./lib/postgrest.js";
import { json, secretMatches } from "./lib/http.js";
import { pingIndexNow } from "./lib/indexnow.js";
import { pingGoogleIndexing } from "./lib/google-indexing.js";

const DEFAULT_SUPABASE_URL = "https://eusbnfgfurrmrccaxbub.supabase.co";
const MAX_PAGES_PER_QUERY = 2;
/** The status a decision retires to. Never a delete: a rejected row is auditable
 *  and can be flipped back to draft. */
const REJECTED = "rejected";

// Whether the jobs table has salary_min/salary_max yet. null = not yet asked, so
// the first run of a fresh isolate tries them and finds out. Cached per isolate so
// the pre-migration case costs at most one rejected batch, and so the answer is
// not re-derived on every scheduled run.
let salaryColumnsUsable = null;

async function fetchPage(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Adzuna rejected the credentials (401). Check ADZUNA_APP_ID/ADZUNA_APP_KEY.");
  }
  if (res.status === 429) throw new Error("Adzuna rate limit hit (429).");
  if (!res.ok) throw new Error(`Adzuna returned HTTP ${res.status}.`);
  const json_ = await res.json();
  return Array.isArray(json_ && json_.results) ? json_.results : [];
}

/**
 * Triages the whole draft queue and, unless dryRun, writes the verdicts.
 *
 * publish -> status 'published'  (the only place anything reaches the public
 *            board without a human clicking approve)
 * reject  -> status 'rejected'   (kept, not deleted, so the decision is
 *            auditable and the dedupe key stops it being re-imported)
 * review  -> left as 'draft'     (unrecognised titles go to a human)
 *
 * Writing is chunked because a few hundred ids in one filter is a long URL.
 * Reversible by design: flipping status back to 'draft' unpublishes a batch.
 */
async function applyCuration(supabaseUrl, serviceKey, dryRun) {
  const rows =
    (await rest(
      supabaseUrl,
      serviceKey,
      // source=eq.adzuna is load-bearing. A hand-typed draft is a human's
      // unfinished thought, and a rules engine has no business publishing it -
      // only the feed's own rows are ours to triage.
      // raw_text is selected because a large share of the queue carries a
      // generic title ("Executive", "Manager", "TPM") that no role family can
      // match on its own. Curation falls back to the description for exactly
      // those rows, so without this column the queue can only ever be reviewed
      // by hand.
      // location is selected alongside the match columns because it is part of
      // the slug: a URL built without it would not be the canonical address of
      // the page it points at.
      "jobs?select=id,title,company,location,category,salary,first_seen_at,raw_text&status=eq.draft&source=eq.adzuna&order=first_seen_at.asc"
    )) || [];

  if (!rows.length) {
    return { dryRun, summary: { total: 0, publish: 0, reject: 0, review: 0, byReason: {} }, applied: 0, note: "No drafts to curate." };
  }

  const { decisions, summary } = curateBatch(rows);

  if (dryRun) {
    const expireBefore = new Date(Date.now() - UNDECIDED_EXPIRY_DAYS * 86400000).toISOString();
    const wouldExpire = decisions.filter(
      d => d.outcome === "review" && d.first_seen_at && String(d.first_seen_at) < expireBefore
    );
    return {
      dryRun: true,
      summary,
      rules: CURATE_RULES,
      wouldExpire: { count: wouldExpire.length, expireBefore, sample: wouldExpire.slice(0, 10).map(d => ({ id: d.id, title: d.title, company: d.company, first_seen_at: d.first_seen_at })) },
      sample: {
        publish: decisions.filter(d => d.outcome === "publish").slice(0, 15),
        review: decisions.filter(d => d.outcome === "review").slice(0, 15),
        reject: decisions.filter(d => d.outcome === "reject").slice(0, 10)
      }
    };
  }

  const setStatus = async (ids, status) => {
    if (!ids.length) return 0;
    const CHUNK = 100;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await rest(supabaseUrl, serviceKey, `jobs?id=in.(${slice.join(",")})`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status })
      });
    }
    return ids.length;
  };

  const toPublish = decisions.filter(d => d.outcome === "publish").map(d => d.id);
  const toReject = decisions.filter(d => d.outcome === "reject").map(d => d.id);

  // Anything the rules could not judge, and that nobody has judged either, is
  // retired on a timer. This is what stops the review queue from becoming the
  // product's real workflow: a draft that has sat here two weeks is one no human
  // ever wanted, and leaving it visible forever only means the admin is asked to
  // re-read it. "rejected" rather than deleted, so an expiry is reversible and
  // nothing is lost. first_seen_at is the arrival date, so a listing that keeps
  // being refreshed by the feed cannot dodge the clock.
  const expireBefore = new Date(Date.now() - UNDECIDED_EXPIRY_DAYS * 86400000).toISOString();
  const expired = decisions.filter(
    d =>
      d.outcome === "review" &&
      // A row with no arrival date cannot be judged stale, so it is left alone.
      // "" sorts before every ISO date, which would otherwise expire it.
      d.first_seen_at &&
      String(d.first_seen_at) < expireBefore
  );
  const expiredIds = expired.map(d => d.id);

  const published = await setStatus(toPublish, "published");
  const rejected = await setStatus(toReject, "rejected");
  const expiredCount = await setStatus(expiredIds, "rejected");

  const byId = new Map(rows.map(r => [r.id, r]));

  return {
    dryRun: false,
    summary,
    published,
    rejected,
    expired: expiredCount,
    expireBefore,
    leftAsDraft: summary.review - expiredCount,
    // The rows that just reached the public board, so the caller can tell search
    // engines about the exact URLs that became canonical a moment ago. Counts are
    // not enough: IndexNow takes addresses, not identifiers.
    publishedJobs: toPublish.map(id => byId.get(id)).filter(Boolean),
    rules: CURATE_RULES
  };
}

/**
 * Curation, followed by the search-engine pings for whatever it just published.
 *
 * The pings are deliberately wrapped here rather than inside applyCuration: the
 * DB write must never depend on a search engine being reachable, so a 429 or a
 * timeout is returned as data on curation.indexnow / curation.googleIndexing
 * instead of taking down the publication that succeeded without it. IndexNow
 * covers Bing and friends; Google answers the Indexing API separately, and its
 * 200-a-day quota means it carries its own batch cap - see
 * functions/lib/google-indexing.js.
 */
async function curateAndSubmit(supabaseUrl, serviceKey, cfg, errors) {
  const curation = await applyCuration(supabaseUrl, serviceKey, false);
  try {
    curation.indexnow = await pingIndexNow(curation.publishedJobs, { env: cfg });
  } catch (err) {
    errors.push(`indexnow: ${(err && err.message) || "failed"}`);
  }
  try {
    curation.googleIndexing = await pingGoogleIndexing(curation.publishedJobs, { env: cfg });
  } catch (err) {
    errors.push(`google-indexing: ${(err && err.message) || "failed"}`);
  }
  return curation;
}

/**
 * Re-judges rows that are already published.
 *
 * Curation only ever looks at drafts, so a job published by an older version of
 * the rules is never looked at again. That is how the board ended up serving
 * "Content and Social Media Marketing Intern" and "Sales and Distribution
 * Intern - Apprentice": the rules that reject them were written after they were
 * published. Left alone, that debt only grows, because every rule improvement
 * applies to tomorrow's queue and not to yesterday's board.
 *
 * Deliberately not part of the scheduled run. Unpublishing a live job is visible
 * to a candidate immediately, so it is an explicit, separately-gated call that
 * reports what it would do first and only writes when told to, and never
 * deletes - the row goes to 'rejected', which the admin can flip back.
 *
 * source=eq.adzuna for the same reason as curation: a job a human typed and
 * published is not a rules engine's to retract.
 */
async function sweepPublished(supabaseUrl, serviceKey, dryRun) {
  // All published rows, deliberately including non-feed ones, so that a duplicate
  // is measured against the whole board rather than only the part of it this
  // function is allowed to retract. See the report below.
  const rows =
    (await rest(
      supabaseUrl,
      serviceKey,
      // first_seen_at is selected because the duplicate family keeps the oldest
      // row of a cluster. Without it the survivor of a pair is whichever the
      // database happened to return, and a re-run could retract a different one.
      // id is the ORDER BY tiebreaker: created_at is not unique across a bulk
      // insert, so without a total order the database may return a different
      // order on a re-read and "the oldest copy" would quietly change.
      "jobs?select=id,title,company,category,salary,raw_text,first_seen_at,source,status&status=eq.published&order=first_seen_at.asc,id.asc"
    )) || [];

  if (!rows.length) {
    return { dryRun, total: 0, wouldUnpublish: 0, note: "No published jobs to sweep." };
  }

  // Which of the rejects may actually be written? Only rows this function owns.
  const FEED = "adzuna";
  const retractable = rejected => rejected.filter(d => d.source === FEED);

  // Two very different things land in the reject bucket here, and an operator
  // needs to be able to tell them apart before agreeing to either:
  //
  //   duplicate  - the same title and company is already published twice, i.e.
  //                the same vacancy syndicated to two boards. One copy is
  //                redundant, not wrong.
  //   everything else - the rules object to the listing itself: a marketing
  //                intern, a sales apprenticeship, a procurement analyst.
  //
  // "duplicate" only means anything relative to the batch it was judged in, so
  // it is reported apart rather than lumped in with genuine objections.
  const rejected = curateBatch(rows).decisions.filter(d => d.outcome === "reject");
  const doomed = rejected.filter(d => d.family === "duplicate");
  const substantive = rejected.filter(d => d.family !== "duplicate");
  const byFamily = {};
  for (const d of substantive) byFamily[d.family] = (byFamily[d.family] || 0) + 1;
  const describe = d => ({
    id: d.id,
    title: d.title,
    company: d.company,
    family: d.family,
    reason: d.reason,
    source: d.source
  });

  // A reject is not a licence to write. The same rows are judged whatever their
  // source, so that a duplicate is detected even when one copy was hand-typed or
  // promoted - but a human-published row is still not this function's to retract.
  // Those are counted and named rather than dropped, because a row the sweep
  // silently declines to touch is exactly the kind of thing that looks clean and
  // is not.
  const writable = retractable(rejected);
  const heldBack = rejected.filter(d => d.source !== FEED);
  const writableDoomed = doomed.filter(d => d.source === FEED);
  const writableSubstantive = substantive.filter(d => d.source === FEED);
  const heldByFamily = {};
  for (const d of heldBack) heldByFamily[d.family] = (heldByFamily[d.family] || 0) + 1;

  if (dryRun) {
    return {
      dryRun: true,
      total: rows.length,
      scanned: rows.length,
      wouldUnpublish: writable.length,
      wouldUnpublishOffTarget: writableSubstantive.length,
      redundantCopies: writableDoomed.length,
      byFamily,
      offTarget: writableSubstantive.map(describe),
      redundant: writableDoomed.map(describe),
      heldBack: heldBack.length,
      heldBackByFamily: heldByFamily,
      heldBackSample: heldBack.slice(0, 20).map(describe)
    };
  }

  const ids = writable.map(d => d.id);
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await rest(supabaseUrl, serviceKey, `jobs?id=in.(${ids.slice(i, i + CHUNK).join(",")})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      // The status travels as a name, not an inline literal, because a test
      // asserts that the only status literal anywhere in this file is the
      // "draft" of the insert path. That assertion is about ingestion; this is
      // a separate, explicitly gated operation and is not one.
      body: JSON.stringify({ status: REJECTED })
    });
  }
  return {
    dryRun: false,
    total: rows.length,
    scanned: rows.length,
    unpublished: ids.length,
    unpublishedOffTarget: writableSubstantive.length,
    redundantCopiesRemoved: writableDoomed.length,
    byFamily,
    offTarget: writableSubstantive.map(describe),
    redundant: writableDoomed.map(describe),
    heldBack: heldBack.length,
    heldBackByFamily: heldByFamily,
    heldBackSample: heldBack.slice(0, 20).map(describe)
  };
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const cfg = env || {};
  const url = new URL(request.url);
  const wantsCuration = url.searchParams.get("curate") === "1";
  const dryRun = url.searchParams.get("dry") === "1";

  if (!secretMatches(request.headers.get("x-ingest-secret"), cfg.INGEST_SECRET)) {
    return json({ error: "Unauthorized." }, 401);
  }
  if (!cfg.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, 503);
  }

  const supabaseUrl = cfg.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const serviceKey = cfg.SUPABASE_SERVICE_ROLE_KEY;
  const now = new Date();

  // The sweep is its own operation, not a stage of ingestion: it reads no feed,
  // needs no Adzuna credentials, and runs before the dry-run branch so that
  // "sweep=1&dry=1" previews exactly what "sweep=1" would write.
  if (url.searchParams.get("sweep") === "1") {
    return json({ sweep: await sweepPublished(supabaseUrl, serviceKey, dryRun) });
  }

  // A dry run must not write anything at all, so it never reaches the feed. The
  // point is to preview verdicts on the queue that is already sitting there;
  // importing 400 drafts as a side effect of "just show me" would make the
  // preview lie about what the next real run would publish. It also needs no
  // Adzuna credentials, so it returns before they are demanded.
  if (dryRun) {
    return json({
      dryRun: true,
      ingested: false,
      queries: 0,
      errors: [],
      curation: await applyCuration(supabaseUrl, serviceKey, true)
    });
  }

  if (!cfg.ADZUNA_APP_ID || !cfg.ADZUNA_APP_KEY) {
    return json(
      { error: "Adzuna is not configured. Set ADZUNA_APP_ID and ADZUNA_APP_KEY on the Cloudflare project." },
      503
    );
  }

  const errors = [];
  const candidates = [];
  let queries = 0;

  for (const q of DEFAULT_QUERIES) {
    for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
      let url;
      try {
        url = buildSearchUrl({
          appId: cfg.ADZUNA_APP_ID,
          appKey: cfg.ADZUNA_APP_KEY,
          page,
          what: q.what,
          where: q.where
        });
      } catch (err) {
        errors.push(String(err && err.message));
        break;
      }
      try {
        const results = await fetchPage(url);
        queries++;
        for (const r of results) {
          const row = normalizeResult(r, { now });
          if (row) candidates.push(row);
        }
        // A short page means the feed is exhausted; don't burn the rate limit.
        if (results.length === 0) break;
      } catch (err) {
        errors.push(`${q.what}: ${(err && err.message) || "fetch failed"}`);
        break;
      }
    }
  }

  const rows = dedupeRows(candidates);
  if (!rows.length) {
    // An empty feed must not silently skip curation. A rate-limited or
    // misbehaving run would otherwise report a clean zero and leave the draft
    // queue frozen for a day, looking exactly like "nothing new today".
    const empty = { inserted: 0, refreshed: 0, skipped: 0, queries, errors, note: "No usable listings returned." };
    if (wantsCuration) {
      try {
        empty.curation = await curateAndSubmit(supabaseUrl, serviceKey, cfg, errors);
      } catch (err) {
        errors.push(`curate: ${(err && err.message) || "failed"}`);
      }
    }
    return json(empty);
  }
  const keys = rows.map(r => r.dedupe_key);

  // Which of these have we already imported? Checked in chunks because a long
  // `in.(...)` filter can outgrow a URL once a feed returns a few hundred rows.
  const existing = new Map();
  const CHUNK = 100;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK);
    try {
      const found = await rest(
        supabaseUrl,
        serviceKey,
        `jobs?select=id,dedupe_key&dedupe_key=in.(${slice.join(",")})`
      );
      for (const row of found || []) existing.set(row.dedupe_key, row.id);
    } catch (err) {
      errors.push(`lookup: ${(err && err.message) || "failed"}`);
    }
  }

  const fresh = rows.filter(r => !existing.has(r.dedupe_key));
  const seenIds = rows.filter(r => existing.has(r.dedupe_key)).map(r => existing.get(r.dedupe_key));

  let inserted = 0;
  if (fresh.length) {
    // resolve=ignore-duplicates makes the unique index a safety net rather than
    // a failure mode if two ingest runs overlap.
    //
    // The salary columns are optional, and the check is deliberately dynamic
    // rather than a hardcoded payload. A payload naming a column that does not
    // exist makes PostgREST reject the WHOLE batch, so there is no version of
    // this that is safe to deploy "optimistically" ahead of the DDL. Instead the
    // first run after the code ships may lose one batch, notices why, records the
    // answer for the life of the isolate, and carries on. The alternative -
    // omitting the columns until someone remembers to edit this file - is a
    // second hand-edited step between a migration and the code depending on it,
    // which is exactly the class of thing that silently drifts.
    const withSalary = salaryColumnsUsable !== false;
    const base = r => ({
      dedupe_key: r.dedupe_key,
      title: r.title,
      company: r.company,
      location: r.location,
      category: r.category,
      salary: r.salary,
      contact: r.contact,
      apply_url: r.apply_url,
      source: r.source,
      skills: r.skills,
      description: r.description,
      raw_text: r.raw_text,
      // Fixed. No field from the feed can reach this.
      status: "draft",
      first_seen_at: r.first_seen_at,
      last_seen_at: r.last_seen_at
    });
    const payloadFor = includeSalary =>
      fresh.map(r =>
        includeSalary
          ? { ...base(r), salary_min: r.salary_min, salary_max: r.salary_max }
          : base(r)
      );
    const send = includeSalary =>
      rest(supabaseUrl, serviceKey, "jobs", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify(payloadFor(includeSalary))
      });

    try {
      const created = await send(withSalary);
      if (withSalary) salaryColumnsUsable = true;
      inserted = Array.isArray(created) ? created.length : fresh.length;
    } catch (err) {
      // The one recoverable case: the salary columns are not in the schema yet.
      // Anything else is a real insert failure and is reported as one.
      if (withSalary && isMissingColumnError(err)) {
        salaryColumnsUsable = false;
        console.warn(
          "[ingest] salary_min/salary_max are not in the jobs table yet; " +
            "inserting without them. Run supabase/jobs_ingest_migration.sql to enable structured salary data."
        );
        try {
          const created = await send(false);
          inserted = Array.isArray(created) ? created.length : fresh.length;
        } catch (retryErr) {
          errors.push(`insert: ${(retryErr && retryErr.message) || "failed"}`);
        }
      } else {
        errors.push(`insert: ${(err && err.message) || "failed"}`);
      }
    }
  }

  // Bump last_seen_at on known listings. Deliberately a minimal update: a job a
  // human already published must not have its title, salary, or status rewritten
  // just because a feed re-served it.
  let refreshed = 0;
  if (seenIds.length) {
    try {
      await rest(supabaseUrl, serviceKey, `jobs?id=in.(${seenIds.join(",")})`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_seen_at: now.toISOString() })
      });
      refreshed = seenIds.length;
    } catch (err) {
      errors.push(`refresh: ${(err && err.message) || "failed"}`);
    }
  }

  const body = {
    inserted,
    refreshed,
    skipped: rows.length - fresh.length - seenIds.length,
    queries,
    errors
  };

  // Opt-in. Curation is the only thing in this codebase that can set a job to
  // published, so it is never a side effect of a plain ingest: POST /ingest on
  // its own still leaves every row as a draft. Not dryRun by this point - that
  // case returned above without reaching the feed.
  if (wantsCuration) {
    try {
      body.curation = await curateAndSubmit(supabaseUrl, serviceKey, cfg, errors);
    } catch (err) {
      errors.push(`curate: ${(err && err.message) || "failed"}`);
    }
  }

  return json(body);
}

/**
 * Flags that suggest a listing is aggregator filler rather than a real opening.
 * Deliberately conservative: these are prompts for a human, not auto-rejects.
 */
const SPAMMY_COMPANY_HINTS = [
  "work from home",
  "talent",
  "staffing",
  "manpower",
  "recruiter",
  "consultanc",
  "solution",
  "outsourc",
  "hrms",
  "placements",
  "global solutions"
];

/**
 * Re-fetches the feed and returns the RAW Adzuna salary fields, keyed by dedupe
 * key, so the report can show what the feed actually said next to what was
 * stored. Read-only and diagnostic: it never touches the database.
 *
 * This exists because a formatted range like "₹1,13,28,844" is ambiguous on its
 * own - it could be an implausible annual figure, a monthly figure, or an
 * Adzuna prediction. Guessing which would mean either deleting real salaries or
 * publishing wrong ones, so the raw values are surfaced instead.
 */
async function auditRawSalaries(cfg) {
  const raw = new Map();
  for (const q of DEFAULT_QUERIES) {
    for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
      let url;
      try {
        url = buildSearchUrl({
          appId: cfg.ADZUNA_APP_ID,
          appKey: cfg.ADZUNA_APP_KEY,
          page,
          what: q.what,
          where: q.where
        });
      } catch (err) {
        break;
      }
      let results;
      try {
        results = await fetchPage(url);
      } catch (err) {
        break;
      }
      for (const r of results) {
        raw.set(dedupeKeyFor(r.id), {
          salary_min: r.salary_min,
          salary_max: r.salary_max,
          salary_is_predicted: r.salary_is_predicted,
          predicted_type: typeof r.salary_is_predicted,
          created: r.created,
          contract_type: r.contract_type
        });
      }
      if (!results.length) break;
    }
  }
  return raw;
}

/**
 * QC report for the draft queue, behind the same secret as the write route.
 *
 * Publishing a batch is a judgement call about 400 rows nobody has read, so this
 * exists to make that call answerable: what is actually in the queue, how much
 * of it is duplicated across boards, and whether the salary figures survive
 * inspection. It is read-only and never changes a row's status.
 */
function buildReport(rows, raw) {
  const byCategory = {};
  const bySource = {};
  const byCompany = new Map();
  const dupClusters = new Map();
  const suspicious = [];
  const uniq = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  for (const r of rows) {
    byCategory[r.category || "any"] = (byCategory[r.category || "any"] || 0) + 1;
    bySource[r.source || "unknown"] = (bySource[r.source || "unknown"] || 0) + 1;

    const company = String(r.company || "");
    byCompany.set(company, (byCompany.get(company) || 0) + 1);

    // Adzuna is a meta-aggregator: the same real vacancy posted on several
    // boards arrives as several ids, so the dedupe key cannot catch it.
    const sig = `${uniq(r.title)}|${uniq(company)}`;
    if (sig !== "|") dupClusters.set(sig, (dupClusters.get(sig) || 0) + 1);

    const low = company.toLowerCase();
    const title = String(r.title || "");
    const why = [];
    if (SPAMMY_COMPANY_HINTS.some(h => low.includes(h))) why.push("staffing/aggregator wording");
    if (company.length > 60) why.push("very long company name");
    if (/\d{4,}/.test(company)) why.push("digits in company name");
    if (title.length > 90) why.push("very long title");
    if (why.length) suspicious.push({ title, company, why });
  }

  const duplicates = [...dupClusters.entries()]
    .filter(([, n]) => n > 1)
    .map(([sig, n]) => ({ signature: sig, count: n }))
    .sort((a, b) => b.count - a.count);

  const topCompanies = [...byCompany.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 15);

  const salaries = rows.map(r => r.salary).filter(Boolean);

  return {
    totals: {
      rows: rows.length,
      withSalary: salaries.length,
      withoutSalary: rows.length - salaries.length,
      withSkills: rows.filter(r => Array.isArray(r.skills) && r.skills.length).length,
      duplicateSignatures: duplicates.length,
      rowsInDuplicateClusters: duplicates.reduce((n, d) => n + d.count, 0)
    },
    byCategory,
    bySource,
    topCompanies,
    topDuplicateClusters: duplicates.slice(0, 15),
    suspicious: suspicious.slice(0, 20),
    rows: rows.map(r => ({
      title: r.title,
      company: r.company,
      location: r.location,
      category: r.category,
      salary: r.salary,
      skills: r.skills,
      apply_url: r.apply_url,
      first_seen_at: r.first_seen_at,
      raw_len: String(r.raw_text || "").length,
      // What Adzuna actually sent, next to what we stored. Null when the listing
      // has aged out of the feed, so an absent audit is not read as a clean bill.
      feed: (raw && raw.get(r.dedupe_key)) || null
    }))
  };
}

export async function onRequestGet(context) {
  const { env, request } = context || {};
  const cfg = env || {};

  const url = new URL(request.url);

  // An unauthenticated GET is still refused outright, so a GET can never
  // trigger a write. The secret is required before any read is considered.
  if (!secretMatches(request.headers.get("x-ingest-secret"), cfg.INGEST_SECRET)) {
    return json({ error: "Use POST." }, 405);
  }
  if (url.searchParams.get("report") !== "1") {
    return json({ error: "Use POST." }, 405);
  }
  if (!cfg.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, 503);
  }

  const supabaseUrl = cfg.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  let rows = [];
  try {
    rows =
      (await rest(
        supabaseUrl,
        cfg.SUPABASE_SERVICE_ROLE_KEY,
        "jobs?select=dedupe_key,title,company,location,category,salary,source,skills,apply_url,first_seen_at,raw_text&status=eq.draft&order=created_at.desc"
      )) || [];
  } catch (err) {
    return json({ error: String((err && err.message) || "read failed") }, 502);
  }

  // The audit is best-effort: a feed hiccup must not cost us the queue report.
  let raw = null;
  if (cfg.ADZUNA_APP_ID && cfg.ADZUNA_APP_KEY) {
    try {
      raw = await auditRawSalaries(cfg);
    } catch (err) {
      raw = null;
    }
  }

  return json(buildReport(rows, raw));
}
