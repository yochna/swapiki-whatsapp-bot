// Profile-vs-job-description match, shown in the "Apply with my profile"
// popup. Pure, DOM-free so it's unit-testable in Node and shared with the
// modal renderer (one source of truth for "how well does my profile fit
// this listing?"). Compares: required skills, experience level, and role
// focus from the profile (expertise, project tags, title, experience string)
// against the listing (skills array, title, description, raw text).

const ROLE_STOPWORDS = new Set([
  'job', 'jobs', 'intern', 'internship', 'internships', 'hiring', 'opening',
  'openings', 'vacancy', 'vacancies', 'role', 'roles', 'position', 'work',
  'the', 'a', 'an', 'in', 'for', 'at', 'with', 'of', 'and', 'or', 'to'
]);

function norm(term) {
  return String(term || '').toLowerCase().trim();
}

function words(term) {
  return norm(term).split(/[^a-z0-9+#.\-]+/).filter(w => w.length >= 2);
}

// Two terms overlap if they're equal, or the shorter one (length >= 3) is a
// substring of the longer one ("react" matches "react js"; "css" matches
// "css/sass"). Substrings shorter than 3 chars are ignored to avoid "ai"
// matching "train".
function termHits(required, candidate) {
  const a = required.length <= candidate.length ? required : candidate;
  const b = required.length <= candidate.length ? candidate : required;
  return (a === b) || (a.length >= 3 && b.includes(a));
}

function collectList(list) {
  const out = new Set();
  (Array.isArray(list) ? list : []).forEach(item => {
    const n = norm(item);
    if (n.length >= 2) out.add(n);
  });
  return out;
}

/** Skills the listing asks for: the curated skills array on the job (title
 *  role words are deliberately excluded — role fit is scored separately by
 *  the "Role focus" row, so "Developer" isn't double-punished as a skill). */
function requiredSkills(job = {}) {
  return [...collectList(job.skills)];
}

/** Skills the candidate has: expertise list + every project tag. */
function candidateSkills(profile = {}) {
  const out = new Set(collectList(profile.expertise));
  (Array.isArray(profile.projects) ? profile.projects : []).forEach(p => {
    collectList(p.tags).forEach(t => out.add(t));
  });
  return [...out];
}

/** Years of experience claimed on the profile ("8+ Years Experience"). */
function profileYears(profile = {}) {
  const m = String(profile.experience || '').match(/(\d+)\s*\+?\s*(?:years?|yrs?\b)/i);
  if (m) return parseInt(m[1], 10);
  if (/\b(fresher|entry[-\s]?level|student)\b/i.test(profile.experience || '')) return 0;
  return null;
}

/** Years the listing requires, parsed from description/raw text/title. */
function requiredYears(job = {}) {
  const text = [job.description, job.raw_text, job.title].join(' ');
  let m = text.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?\b)/i);
  if (m) return { min: parseInt(m[1], 10), max: parseInt(m[2], 10) };
  m = text.match(/(\d+)\s*\+?\s*(?:years?|yrs?\b)/i);
  if (m) { const v = parseInt(m[1], 10); return { min: v, max: v }; }
  if (/\b(fresher|freshers|entry[-\s]?level)\b/i.test(text)) return { min: 0, max: 1 };
  return null;
}

function skillsScore(required, candidate) {
  if (required.length === 0) return { pct: 50, matched: [], missing: [] }; // no declared skills: stay neutral
  const matched = required.filter(r => candidate.some(c => termHits(r, c)));
  return {
    pct: Math.round((matched.length / required.length) * 100),
    matched,
    missing: required.filter(r => !matched.includes(r))
  };
}

function experienceScore(requiredYears, haveYears) {
  if (!requiredYears || haveYears === null) return 60; // unknown on either side
  if (haveYears === 0 && requiredYears.max >= 1) return 100; // fresher-friendly listing
  const needed = requiredYears.max || requiredYears.min;
  if (needed <= 0) return 100;
  return Math.min(100, Math.round((haveYears / needed) * 100));
}

function focusScore(profile, job) {
  const profileText = [profile.title, ...(profile.projects || []).map(p => p.title && typeof p.title === 'string' ? p.title : '')].join(' ');
  const profileWords = new Set(words(profileText).filter(w => w.length >= 3 && !ROLE_STOPWORDS.has(w)));
  const jobWords = words(job.title || '').filter(w => w.length >= 3 && !ROLE_STOPWORDS.has(w));
  if (jobWords.length === 0) return 60;
  const overlap = jobWords.filter(w => [...profileWords].some(c => termHits(w, c))).length;
  return Math.max(35, Math.round((overlap / jobWords.length) * 100));
}

function band(pct) {
  if (pct >= 80) return 'Strong match';
  if (pct >= 60) return 'Good match';
  if (pct >= 40) return 'Fair match';
  return 'Low match';
}

/**
 * Returns the full match analysis for a candidate profile vs a job listing.
 * @returns {{overall:number, band:string, summary:string, part:Array<...>}}
 */
function computeProfileMatch(profile = {}, job = {}) {
  const required = requiredSkills(job);
  const candidate = candidateSkills(profile);
  const sk = skillsScore(required, candidate);
  const ex = experienceScore(requiredYears(job), profileYears(profile));
  const fo = focusScore(profile, job);

  const overall = Math.round(sk.pct * 0.6 + ex * 0.25 + fo * 0.15);

  let summary;
  if (required.length === 0) {
    summary = 'This listing doesn\u2019t list specific skills yet. Rated on experience and role focus.';
  } else if (sk.missing.length === 0) {
    summary = `You already list every required skill (${sk.matched.length}/${required.length}).`;
  } else {
    summary = `You match ${sk.matched.length} of ${required.length} required skills${sk.missing.length ? `; consider highlighting: ${sk.missing.slice(0, 3).join(', ')}${sk.missing.length > 3 ? '…' : ''}` : ''}.`;
  }

  return {
    overall,
    band: band(overall),
    summary,
    part: [
      {
        key: 'skills', label: 'Required skills', pct: sk.pct,
        detail: `${sk.matched.length} of ${required.length} matched${sk.missing.length ? ` (missing: ${sk.missing.join(', ')})` : ''}`
      },
      {
        key: 'experience', label: 'Experience level', pct: ex,
        detail: humanizeExperience(requiredYears(job), profileYears(profile))
      },
      {
        key: 'focus', label: 'Role focus', pct: fo,
        detail: `Your headline${(profile.projects || []).length ? ' and projects' : ''} vs "${job.title || 'this role'}"`
      }
    ],
    matched: sk.matched,
    missing: sk.missing
  };
}

function humanizeExperience(req, have) {
  if (!req) return 'Listing does not state a requirement';
  const range = req.min === req.max ? `${req.min}+ years` : `${req.min}-${req.max} years`;
  if (have === null) return `${range} required`;
  if (req.max >= 1 && have === 0) return `${range} required and open to freshers`;
  return `${range} required; your profile shows ${have} year${have === 1 ? '' : 's'}${have === 0 ? ' (fresher)' : ''}`;
}

function barRow(p) {
  const [trackColor] = p.pct >= 60 ? ['bg-blue-800'] : p.pct >= 40 ? ['bg-blue-600'] : ['bg-blue-400'];
  return `
        <div>
          <div class="flex items-center justify-between text-[11px] mb-1">
            <span class="font-semibold text-blue-950">${p.label}</span>
            <span class="font-bold text-blue-900">${p.pct}%</span>
          </div>
          <div class="h-1.5 rounded-full bg-blue-100 overflow-hidden">
            <div class="h-full rounded-full ${trackColor}" style="width:${p.pct}%"></div>
          </div>
          <p class="text-[10px] text-blue-800 mt-1 leading-snug">${p.detail}</p>
        </div>`;
}

/** HTML for the match card shown in the apply popup (uses existing modal classes). */
function renderProfileMatchHtml(result) {
  if (!result) return '';
  const bandMeta = result.overall >= 60
    ? ['bg-blue-900 text-white', '#1e3a8a']
    : result.overall >= 40
      ? ['bg-blue-600 text-white', '#2563eb']
      : ['bg-blue-500 text-white', '#3b82f6'];
  const [pillColor, ringColor] = bandMeta;
  const R = 30;
  const C = 2 * Math.PI * R;
  const offset = C - (C * result.overall) / 100;
  const ring = `
      <div class="relative w-[86px] h-[86px] shrink-0">
        <svg viewBox="0 0 86 86" class="w-full h-full -rotate-90">
          <circle cx="43" cy="43" r="${R}" fill="none" stroke="#dbeafe" stroke-width="7"/>
          <circle cx="43" cy="43" r="${R}" fill="none" stroke="${ringColor}" stroke-width="7" stroke-linecap="round"
            stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" style="transition: stroke-dashoffset .6s ease"/>
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-xl font-black text-blue-900">${result.overall}%</span>
        </div>
      </div>`;
  const skill = result.part.find(p => p.key === 'skills');
  const others = result.part.filter(p => p.key !== 'skills');
  const bars = `
        ${skill ? barRow(skill) : ''}
        <div class="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          ${others.map(barRow).join('')}
        </div>`;

  const chips = [];
  if (result.matched.length) chips.push(`<span class="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-blue-900 rounded-full px-2.5 py-0.5"><span class="material-symbols-outlined text-[11px]">check</span>${result.matched.slice(0, 6).join(', ')}${result.matched.length > 6 ? ` +${result.matched.length - 6}` : ''}</span>`);
  if (result.missing.length) chips.push(`<span class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-white border border-blue-300 rounded-full px-2.5 py-0.5"><span class="material-symbols-outlined text-[11px]">add_circle</span>${result.missing.slice(0, 6).join(', ')}${result.missing.length > 6 ? ` +${result.missing.length - 6}` : ''}</span>`);

  return `
      <div class="rounded-xl border border-blue-100 bg-white p-5">
        <div class="flex items-center justify-between gap-2 mb-4">
          <p class="text-[10px] font-bold uppercase tracking-wide text-blue-800">Match score</p>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${pillColor}">${result.band}</span>
        </div>
        <div class="flex items-center gap-4 mb-5">
          ${ring}
          <p class="flex-1 text-sm text-blue-900 leading-snug">${result.summary}</p>
        </div>
        <div class="space-y-2.5">${bars}</div>
        ${chips.length ? `<div class="flex flex-wrap gap-1.5 pt-4 mt-4 border-t border-blue-100">${chips.join('')}</div>` : ''}
      </div>`;
}

const KNOWN_CITIES = [
  { slug: "bangalore", name: "Bengaluru", aliases: ["bangalore", "bengaluru", "blr"] },
  { slug: "hyderabad", name: "Hyderabad", aliases: ["hyderabad", "hyd"] },
  { slug: "mumbai", name: "Mumbai", aliases: ["mumbai", "bombay", "navi mumbai"] },
  { slug: "pune", name: "Pune", aliases: ["pune"] },
  { slug: "delhi-ncr", name: "Delhi NCR", aliases: ["delhi", "new delhi", "noida", "gurgaon", "gurugram", "faridabad", "ghaziabad", "ncr"] },
  { slug: "chennai", name: "Chennai", aliases: ["chennai", "madras"] },
  { slug: "kolkata", name: "Kolkata", aliases: ["kolkata", "calcutta"] },
  { slug: "ahmedabad", name: "Ahmedabad", aliases: ["ahmedabad"] },
  { slug: "coimbatore", name: "Coimbatore", aliases: ["coimbatore", "kovai"] },
  { slug: "kochi", name: "Kochi", aliases: ["kochi", "cochin"] },
  { slug: "jaipur", name: "Jaipur", aliases: ["jaipur"] },
  { slug: "indore", name: "Indore", aliases: ["indore"] },
  { slug: "chandigarh", name: "Chandigarh", aliases: ["chandigarh", "mohali", "panchkula"] },
  { slug: "nagpur", name: "Nagpur", aliases: ["nagpur"] },
  { slug: "thane", name: "Thane", aliases: ["thane"] },
  { slug: "vadodara", name: "Vadodara", aliases: ["vadodara", "baroda"] },
  { slug: "lucknow", name: "Lucknow", aliases: ["lucknow"] },
  { slug: "bhopal", name: "Bhopal", aliases: ["bhopal"] },
  { slug: "visakhapatnam", name: "Visakhapatnam", aliases: ["visakhapatnam", "vizag"] }
];

function parseProfileLocation(locationStr = '') {
  const loc = norm(locationStr);
  const isRemoteReady = /\b(remote|wfh|work\s*from\s*home|anywhere|flexible)\b/i.test(locationStr);
  
  const matchedCities = KNOWN_CITIES.filter(c => 
    c.aliases.some(alias => loc.includes(alias))
  );

  const primaryCity = matchedCities.length > 0 ? matchedCities[0] : null;
  let customCity = '';
  if (!primaryCity && loc) {
    const clean = locationStr.split(/[,(/]/)[0].trim();
    if (clean.length >= 3 && !/\b(remote|ready|india)\b/i.test(clean)) {
      customCity = clean;
    }
  }

  return {
    raw: locationStr,
    isRemoteReady,
    matchedCities,
    primaryCity,
    cityName: primaryCity ? primaryCity.name : customCity,
    citySlug: primaryCity ? primaryCity.slug : (customCity ? customCity.toLowerCase() : '')
  };
}

function matchJobLocation(locInfo, job = {}) {
  const jobLoc = norm(job.location);
  const jobDesc = norm(job.description);
  const jobTitle = norm(job.title);
  const combined = `${jobLoc} ${jobTitle} ${jobDesc}`;

  const isJobRemote = /\b(remote|work\s*from\s*home|\bwfh\b|anywhere)\b/i.test(jobLoc) ||
                      /\b(100%\s*remote|fully\s*remote)\b/i.test(combined);

  if (!locInfo || !locInfo.raw) {
    return {
      score: 70,
      isCityMatch: false,
      isRemote: isJobRemote,
      cityName: '',
      reason: isJobRemote ? 'Remote role' : (job.location || 'Pan-India')
    };
  }

  if (isJobRemote) {
    return {
      score: 100,
      isCityMatch: false,
      isRemote: true,
      cityName: '',
      reason: 'Remote / WFH role'
    };
  }

  if (locInfo.matchedCities && locInfo.matchedCities.length > 0) {
    for (const city of locInfo.matchedCities) {
      if (city.aliases.some(alias => jobLoc.includes(alias))) {
        return {
          score: 100,
          isCityMatch: true,
          isRemote: false,
          cityName: city.name,
          reason: `Matches your city (${city.name})`
        };
      }
    }
  } else if (locInfo.cityName) {
    if (jobLoc.includes(locInfo.cityName.toLowerCase())) {
      return {
        score: 100,
        isCityMatch: true,
        isRemote: false,
        cityName: locInfo.cityName,
        reason: `Matches your city (${locInfo.cityName})`
      };
    }
  }

  if (/\b(pan\s*india|all\s*india|across\s*india|^india$)\b/i.test(jobLoc) || !jobLoc) {
    return {
      score: 65,
      isCityMatch: false,
      isRemote: false,
      cityName: '',
      reason: 'Pan-India location'
    };
  }

  if (locInfo.isRemoteReady) {
    return {
      score: 35,
      isCityMatch: false,
      isRemote: false,
      cityName: '',
      reason: `Onsite in ${job.location || 'another city'}`
    };
  }

  return {
    score: 20,
    isCityMatch: false,
    isRemote: false,
    cityName: '',
    reason: `Located in ${job.location || 'another city'}`
  };
}

function matchJobProjects(profile = {}, job = {}) {
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  if (projects.length === 0) {
    return {
      score: 50,
      matchedProjects: [],
      bestProject: null,
      matchedTags: [],
      reason: 'No proof projects added yet'
    };
  }

  const jobHaystack = [
    job.title,
    job.company,
    Array.isArray(job.skills) ? job.skills.join(' ') : '',
    job.category,
    job.description,
    job.raw_text
  ].filter(Boolean).join(' ').toLowerCase();

  const jobWords = new Set(words(jobHaystack).filter(w => w.length >= 3 && !ROLE_STOPWORDS.has(w)));

  let bestScore = 0;
  let bestProject = null;
  const allMatchedProjects = [];
  const allMatchedTags = new Set();

  projects.forEach(p => {
    let pScore = 0;
    const pMatchedTags = [];

    const tags = Array.isArray(p.tags) ? p.tags : [];
    tags.forEach(t => {
      const tn = norm(t);
      if (tn.length >= 2) {
        if (jobHaystack.includes(tn) || [...jobWords].some(jw => termHits(jw, tn))) {
          pMatchedTags.push(t);
          allMatchedTags.add(t);
          pScore += 35;
        }
      }
    });

    const titleWords = words(p.title || '').filter(w => w.length >= 3 && !ROLE_STOPWORDS.has(w));
    titleWords.forEach(tw => {
      if ([...jobWords].some(jw => termHits(jw, tw))) {
        pScore += 15;
      }
    });

    const roleWords = words(p.role || '').filter(w => w.length >= 3 && !ROLE_STOPWORDS.has(w));
    roleWords.forEach(rw => {
      if ([...jobWords].some(jw => termHits(jw, rw))) {
        pScore += 10;
      }
    });

    pScore = Math.min(100, pScore);

    if (pMatchedTags.length > 0 || pScore >= 25) {
      allMatchedProjects.push({
        project: p,
        score: pScore,
        matchedTags: pMatchedTags
      });
    }

    if (pScore > bestScore) {
      bestScore = pScore;
      bestProject = p;
    }
  });

  const finalProjectScore = bestProject ? Math.max(40, bestScore) : 40;

  return {
    score: finalProjectScore,
    matchedProjects: allMatchedProjects.map(m => m.project.title),
    bestProject: bestProject ? { title: bestProject.title, tags: bestProject.tags } : null,
    matchedTags: [...allMatchedTags],
    reason: bestProject && bestScore >= 30
      ? `Matches proof in "${bestProject.title}"`
      : 'Evaluated against candidate projects'
  };
}

function matchJobSkills(profile = {}, job = {}) {
  const req = requiredSkills(job);
  const cand = candidateSkills(profile);

  if (req.length === 0) {
    const jobText = norm([job.title, job.description, job.raw_text].join(' '));
    const matched = cand.filter(c => c.length >= 3 && jobText.includes(c));
    const score = matched.length > 0 ? Math.min(100, 50 + matched.length * 20) : 55;
    return {
      score,
      pct: score,
      matched,
      missing: [],
      reason: matched.length > 0
        ? `Matches ${matched.length} skill${matched.length === 1 ? '' : 's'} (${matched.slice(0, 3).join(', ')})`
        : 'Skills evaluated'
    };
  }

  const sk = skillsScore(req, cand);
  return {
    score: sk.pct,
    pct: sk.pct,
    matched: sk.matched,
    missing: sk.missing,
    reason: sk.matched.length > 0
      ? `Matches ${sk.matched.length} of ${req.length} required skill${req.length === 1 ? '' : 's'} (${sk.matched.slice(0, 3).join(', ')})`
      : `Missing required skills (${sk.missing.slice(0, 3).join(', ')})`
  };
}

function computePersonalizedMatch(profile = {}, job = {}) {
  const locInfo = parseProfileLocation(profile.location);
  const locMatch = matchJobLocation(locInfo, job);
  const skMatch = matchJobSkills(profile, job);
  const prMatch = matchJobProjects(profile, job);
  const foScore = focusScore(profile, job);
  const exScore = experienceScore(requiredYears(job), profileYears(profile));

  const overall = Math.min(100, Math.max(10, Math.round(
    skMatch.score * 0.30 +
    prMatch.score * 0.25 +
    locMatch.score * 0.25 +
    (foScore * 0.6 + exScore * 0.4) * 0.20
  )));

  const reasons = [];
  if (locMatch.isCityMatch) {
    reasons.push(`📍 ${locMatch.cityName || 'City'} match`);
  } else if (locMatch.isRemote) {
    reasons.push('🌐 Remote role');
  }

  if (skMatch.matched && skMatch.matched.length > 0) {
    reasons.push(`🛠️ ${skMatch.matched.length} skill${skMatch.matched.length > 1 ? 's' : ''} (${skMatch.matched.slice(0, 2).join(', ')})`);
  }

  if (prMatch.bestProject && prMatch.score >= 30) {
    reasons.push(`🚀 Proof in "${prMatch.bestProject.title}"`);
  }

  let summary = '';
  if (reasons.length >= 2) {
    summary = reasons.join(' · ');
  } else if (reasons.length === 1) {
    summary = reasons[0];
  } else {
    summary = 'General profile fit';
  }

  return {
    overall,
    band: band(overall),
    summary,
    reasons,
    location: locMatch,
    skills: skMatch,
    projects: prMatch,
    focusScore: foScore,
    experienceScore: exScore,
    profileLocation: locInfo
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeProfileMatch,
    renderProfileMatchHtml,
    profileYears,
    requiredYears,
    requiredSkills,
    candidateSkills,
    computePersonalizedMatch,
    parseProfileLocation,
    matchJobLocation,
    matchJobProjects,
    matchJobSkills
  };
}
if (typeof window !== 'undefined') {
  window.profileMatch = Object.assign(window.profileMatch || {}, {
    computeProfileMatch,
    renderProfileMatchHtml,
    requiredYears,
    profileYears,
    computePersonalizedMatch,
    parseProfileLocation,
    matchJobLocation,
    matchJobProjects,
    matchJobSkills
  });
}