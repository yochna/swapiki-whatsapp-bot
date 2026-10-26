// Crawlable marketing/content pages: /for-recruiters, /how-it-works, /about.
//
// These exist for two reasons that are the same reason: search engines and
// answer engines need pages to rank and cite, and the landing page is one big
// document whose copy is optimised to be read, not to match a query. A recruiter
// searching "how Swapiki works for hiring managers" has nowhere to land on a
// one-page site, and an answer engine asked "what is Swapiki" gets one candidate
// paragraph instead of a small set of pages that agree with each other.
//
// Every page here is server-rendered plain HTML with no dependency on the SPA, so
// a crawler with scripting off reads the whole thing. The copy is written to say
// only what the product does: no invented statistics, no verification claims, no
// source attribution. The same honesty rules the landing page is tested against
// apply here, and a test enforces them.
//
// The pages are also linked from the shared footer, which is the internal link a
// crawler needs to discover them without relying on the sitemap alone.

import { SITE_URL, ORG_ID, SITE_ID, graph, organization, website } from "./schema.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const H = SITE_URL;

// The content pages are listed here once, so the sitemap and the footer cannot
// disagree about what exists. `path` is the canonical route.
export const CONTENT_PAGES = {
  "for-recruiters": {
    path: "/for-recruiters",
    title: "For Recruiters: Review Proof, Not Resumes | Swapiki",
    description:
      "Swapiki sends you a candidate's project proof and a two-minute voice walkthrough instead of a resume. No AI screening, no keyword filters - a person reads the work.",
    eyebrow: "For recruiters",
    h1: "Review the work, not the formatting",
    lead:
      "Swapiki is a skill-highlighting hiring platform. A candidate publishes one or two proof projects and records a two-minute walkthrough of their reasoning, and you open one link that contains the work itself.",
    sections: [
      {
        h2: "What you actually receive",
        paras: [
          "A single page at a candidate's own address. It holds the problem they worked on, what they personally owned, and the metric that moved - then the walkthrough, in their own voice.",
          "There is no score attached to any of it and no automated verdict. You decide from what the candidate said and built, which is the entire point of the format."
        ]
      },
      {
        h2: "What Swapiki does not do",
        paras: [
          "It does not screen, rank, reject or keyword-filter candidates. Nothing is scored by AI, and the audio is never sentiment-analysed or graded.",
          "It does not verify identity, and nothing is stamped as verified. The walkthrough confirms a live recording - a liveness check - not who the person is. Identity belongs at interview and reference stage, which is where it stays."
        ]
      },
      {
        h2: "Why the jobs board is public",
        paras: [
          "Swapiki also runs a board of IT, BFSI and other openings across India. The listings are readable by anyone at /jobs, and every role has its own page with its own address, so a candidate can find a specific opening and answer it with the same proof profile."
        ]
      }
    ],
    cta: { href: "/jobs", label: "Browse the jobs board", note: "Free during the pilot" }
  },
  "how-it-works": {
    path: "/how-it-works",
    title: "How Swapiki Works: A Proof Profile in Three Steps",
    description:
      "Document one or two real projects, record a two-minute voice walkthrough, and share one link. No AI scoring, no keyword games - a person reviews the work.",
    eyebrow: "How it works",
    h1: "Two minutes. Three steps.",
    lead:
      "A proof-backed profile is a small set of things a person can read and hear in a few minutes. Here is exactly what it takes to publish one.",
    sections: [
      {
        h2: "1. Document one or two proof projects",
        paras: [
          "For each project, write the problem, what you personally owned, and one metric that actually moved. Four slots are available and no essay is required - the point is evidence, not volume."
        ]
      },
      {
        h2: "2. Record a two-minute walkthrough",
        paras: [
          "Talk through your logic in your own words. Read the on-screen phrase to confirm it is a live recording - the recording is never scored, ranked or sentiment-analysed, and the check is not stored against your profile."
        ]
      },
      {
        h2: "3. Share one link",
        paras: [
          "Your profile lives at your-handle.swapiki.com. Send that one address to a hiring manager; they open it and read the work directly. The same link answers every opening on the board."
        ]
      },
      {
        h2: "What unlocks the jobs board",
        paras: [
          "The jobs board itself is public - every listing exists and has its own page. The search, the filters and the match score open once your profile reaches 80% complete. Seven things count towards that: your name and title, your location, a LinkedIn or portfolio link, your first proof project, a voice walkthrough, a second project, and publishing the profile."
        ]
      }
    ],
    faqs: [
      ["Is my voice scored or analysed by AI?", "No. Your audio is never scored, ranked or sentiment-analysed, and we do not grade how you sound. The on-screen phrase is checked only to confirm a live microphone, and that check is not stored against your profile."],
      ["How long does it take?", "Two minutes to record the walkthrough, and roughly ten minutes to publish the whole profile end to end."],
      ["Is Swapiki free?", "Yes - free for the whole pilot, with no card step anywhere in the flow."]
    ],
    cta: { href: "/signup", label: "Start your profile", note: "Publish in about ten minutes" }
  },
  about: {
    path: "/about",
    title: "About Swapiki | A Proof Portfolio for India Hiring",
    description:
      "Swapiki is a skill-highlighting hiring platform for India-focused hiring: candidates publish project proof and a two-minute voice walkthrough that hiring managers review directly.",
    eyebrow: "About",
    h1: "What Swapiki is",
    lead:
      "Swapiki is a skill-highlighting hiring platform for India-focused hiring. Candidates publish proof of real projects alongside a two-minute recorded voice walkthrough, and hiring managers review that proof directly instead of screening a resume.",
    sections: [
      {
        h2: "What it stands for",
        paras: [
          "A resume is cheap to produce and easy to polish, which makes it weak evidence. A short piece of work, explained out loud by the person who did it, is harder to fake and faster to judge. Swapiki exists to make that the unit of hiring.",
          "It does not use AI to score, rank or reject anyone, and it does not verify identity - nothing is stamped as verified. The goal is to give a person on the other end the material to decide, not to automate the decision."
        ]
      },
      {
        h2: "The pilot",
        paras: [
          "Swapiki is running a free pilot. Every feature is free for the duration, with no card step. The pilot's feedback is published verbatim on the landing page, critical reviews included."
        ]
      },
      {
        h2: "Who runs it",
        paras: [
          "Swapiki is a sub-product of Swaniki LLP. For contact and support, use the links in the footer of any page."
        ]
      }
    ],
    cta: { href: "/jobs", label: "See the jobs board", note: "IT, BFSI and other openings across India" }
  }
};

const head = (p) => {
  const jsonLdNodes = [
    organization(),
    website(),
    {
      "@type": "WebPage",
      "@id": `${H}${p.path}#webpage`,
      url: `${H}${p.path}`,
      name: p.title,
      description: p.description,
      isPartOf: { "@id": SITE_ID },
      about: { "@id": ORG_ID }
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${H}${p.path}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${H}/` },
        { "@type": "ListItem", position: 2, name: p.eyebrow, item: `${H}${p.path}` }
      ]
    }
  ];
  if (Array.isArray(p.faqs) && p.faqs.length) {
    jsonLdNodes.push({
      "@type": "FAQPage",
      "@id": `${H}${p.path}#faq`,
      mainEntity: p.faqs.map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a }
      }))
    });
  }
  const jsonLd = JSON.stringify(graph(jsonLdNodes))
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return `<script type="application/ld+json">${jsonLd}</script>`;
};

const footer = () => {
  const links = Object.values(CONTENT_PAGES)
    .map((p) => `<a href="${p.path}" style="color:#475569;text-decoration:none;">${esc(p.eyebrow)}</a>`)
    .join('<span style="color:#CBD5E1;">&middot;</span>');
  const hubs = [
    ["bangalore", "Bangalore"],
    ["hyderabad", "Hyderabad"],
    ["pune", "Pune"],
    ["mumbai", "Mumbai"],
    ["delhi-ncr", "Delhi NCR"],
    ["chennai", "Chennai"],
    ["remote", "Remote"]
  ]
    .map(([slug, name]) => `<a href="/jobs/in/${slug}" style="color:#475569;text-decoration:none;">Jobs in ${esc(name)}</a>`)
    .join('<span style="color:#CBD5E1;">&middot;</span>');
  return `<footer style="margin-top:56px;border-top:1px solid #E2E8F0;padding-top:20px;font-size:13px;">
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
      ${links}
      <span style="color:#CBD5E1;">&middot;</span>
      <a href="/jobs" style="color:#475569;text-decoration:none;">Jobs</a>
      <span style="color:#CBD5E1;">&middot;</span>
      <a href="/" style="color:#475569;text-decoration:none;">Home</a>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:12px;">
      ${hubs}
    </div>
    <p style="color:#94A3B8;margin:14px 0 0;">Swapiki is a sub-product of Swaniki LLP. Nothing on this page claims verification of a person or their work.</p>
  </footer>`;
};

export function renderContentPage(p) {
  const sections = (p.sections || []).map((s) => `
    <section style="margin:34px 0 0;">
      <h2 style="font-size:21px;line-height:1.3;color:#0F172A;margin:0 0 10px;">${esc(s.h2)}</h2>
      ${(s.paras || []).map((t) => `<p style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 12px;">${esc(t)}</p>`).join("")}
    </section>`).join("");

  const faqs = Array.isArray(p.faqs) && p.faqs.length
    ? `<section style="margin:40px 0 0;">
         <h2 style="font-size:21px;color:#0F172A;margin:0 0 12px;">Questions</h2>
         ${p.faqs.map(([q, a]) => `<details style="border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin:0 0 10px;background:#fff;">
             <summary style="font-size:15px;font-weight:700;color:#0F172A;cursor:pointer;">${esc(q)}</summary>
             <p style="font-size:14px;line-height:1.65;color:#334155;margin:10px 0 0;">${esc(a)}</p>
           </details>`).join("")}
       </section>`
    : "";

  const cta = p.cta
    ? `<p style="margin:36px 0 0;">
         <a href="${esc(p.cta.href)}" style="display:inline-block;background:#1E3A8A;color:#fff;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px;text-decoration:none;">${esc(p.cta.label)}</a>
         ${p.cta.note ? `<span style="display:inline-block;margin-left:12px;font-size:13px;color:#64748B;">${esc(p.cta.note)}</span>` : ""}
       </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<link rel="canonical" href="${H}${esc(p.path)}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="Swapiki"/>
<meta property="og:title" content="${esc(p.title)}"/>
<meta property="og:description" content="${esc(p.description)}"/>
<meta property="og:url" content="${H}${esc(p.path)}"/>
<meta property="og:image" content="${H}/assets/og-image.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(p.title)}"/>
<meta name="twitter:description" content="${esc(p.description)}"/>
<meta name="twitter:image" content="${H}/assets/og-image.png"/>
${head(p)}
</head>
<body style="margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#F8FAFC;color:#0F172A;">
  <div style="max-width:760px;margin:0 auto;padding:32px 20px 64px;">
    <a href="/" style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;">
      <svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="100" height="100" rx="22" fill="#0B1E45"/>
        <rect x="40" y="17.5" width="20" height="35" rx="10" fill="#ffffff"/>
        <path d="M 26 47.5 A 24 24 0 0 0 74 47.5 L 67.5 47.5 A 17.5 17.5 0 0 1 32.5 47.5 Z" fill="#ffffff"/>
        <rect x="47" y="63" width="6" height="16.5" fill="#ffffff"/>
        <rect x="34" y="79" width="32" height="6.5" rx="3.25" fill="#ffffff"/>
      </svg>
      <span style="font-weight:800;font-size:20px;color:#1E3A8A;">Swapiki</span>
    </a>
    <p style="margin:28px 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748B;">${esc(p.eyebrow)}</p>
    <h1 style="font-size:32px;line-height:1.2;color:#0F172A;margin:0 0 12px;">${esc(p.h1)}</h1>
    <p style="font-size:16px;line-height:1.7;color:#334155;margin:0;">${esc(p.lead)}</p>
    ${sections}
    ${faqs}
    ${cta}
    ${footer()}
  </div>
</body>
</html>`;
}

/** Route handlers share this: render one named page or 404. */
export function contentPageResponse(name) {
  const p = CONTENT_PAGES[name];
  if (!p) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  return new Response(renderContentPage(p), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400"
    }
  });
}