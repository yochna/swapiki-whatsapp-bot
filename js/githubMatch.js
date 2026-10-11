// Matches a candidate's GitHub repositories against a specific job listing, so
// interview prep can say "talk about THIS project first" instead of guessing.
//
// Pure logic only (no network, no DOM) so it can be unit tested in node.
// Loaded in the browser as window.swapikiGitHub.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'will', 'have', 'has',
  'this', 'that', 'from', 'they', 'their', 'them', 'but', 'not', 'all', 'any',
  'can', 'who', 'what', 'when', 'how', 'why', 'into', 'about', 'work', 'working',
  'role', 'job', 'team', 'teams', 'years', 'year', 'experience', 'ability',
  'strong', 'good', 'great', 'must', 'should', 'may', 'well', 'more', 'than',
  'then', 'also', 'such', 'other', 'using', 'use', 'used', 'help', 'helps',
  'new', 'like', 'etc', 'via', 'per', 'one', 'two', 'get', 'got', 'need',
  'needs', 'based', 'across', 'within', 'ensure', 'ensuring', 'including',
  'include', 'day', 'days', 'ideal', 'candidate', 'candidates', 'please',
  'apply', 'applicants', 'looking', 'join', 'joining', 'opportunity',
  'requirements', 'requirement', 'skills', 'skill', 'knowledge', 'familiar',
  'comfortable', 'exposure', 'excellent', 'responsible', 'roles', 'email',
  'contact', 'benefits', 'salary', 'location', 'remote', 'hybrid', 'graduate',
  'fresher', 'plus', 'bonus', 'someone', 'willing', 'own', 'ideally', 'brief',
  'report', 'plan', 'run', 'deliver', 'engine', 'weekly', 'daily', 'monthly',
  'quarter', 'every', 'end', 'week', 'weeks', 'month', 'months', 'write',
  'builds', 'manages', 'works', 'looking', 'help'
]);

// Repo names that are never good interview talking points.
const WEAK_NAME = /(^|[-_.])(config|configs|dotfiles|dotfiles|notes|note|cheatsheet|cheat-sheets|awesome|boilerplate|template|templates|starter|learning|learn|practice|practices|tutorial|tutorials|exercise|exercises|udemy|course|courses|roadmap|interview-questions|dsa|leetcode|settings|backup|misc|stuff|test|scratch|sandbox|demo|examples|snippets)([-_.]|$)/i;

const LANGUAGES = new Set([
  'javascript', 'typescript', 'python', 'java', 'c', 'c++', 'c#', 'go', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'scala', 'r', 'matlab', 'perl', 'elixir',
  'haskell', 'dart', 'julia', 'shell', 'html', 'css', 'sql', 'nosql', 'svelte'
]);

const TECH_ALIASES = {
  'node.js': 'node', 'nodejs': 'node', 'react.js': 'react', 'reactjs': 'react',
  'next.js': 'next', 'nextjs': 'next', 'vue.js': 'vue', 'vuejs': 'vue',
  'postgres': 'postgresql', 'postgresql': 'postgresql', 'mongo': 'mongodb',
  'mongodb': 'mongodb', 'js': 'javascript', 'ts': 'typescript',
  'py': 'python', 'golang': 'go', 'rest': 'rest', 'restful': 'rest',
  'rest api': 'rest', 'rest apis': 'rest', 'apis': 'api', 'api': 'api',
  'aws': 'aws', 'azure': 'azure', 'gcp': 'gcp', 'docker': 'docker',
  'kubernetes': 'kubernetes', 'k8s': 'kubernetes', 'terraform': 'terraform',
  'ci/cd': 'cicd', 'cicd': 'cicd', 'github actions': 'cicd',
  'machine learning': 'ml', 'ml': 'ml', 'deep learning': 'ml',
  'artificial intelligence': 'ml', 'ai': 'ai', 'nlp': 'nlp',
  'data science': 'datascience', 'powerbi': 'power bi', 'power bi': 'power bi',
  'tableau': 'tableau', 'excel': 'excel', 'figma': 'figma'
};

const clean = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9+#.\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
const unique = (arr) => Array.from(new Set(arr));

/** "3 months ago" style freshness label, testable via the now parameter. */
function formatRelative(iso, now) {
  if (!iso) return 'unknown';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'unknown';
  const days = Math.max(0, Math.round(((now || Date.now()) - then) / 86400000));
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  const months = Math.round(days / 30);
  if (months < 12) return months + (months === 1 ? ' month ago' : ' months ago');
  const years = Math.round(months / 12);
  return years + (years === 1 ? ' year ago' : ' years ago');
}

/** Everything we match a repo against, taken from this one job listing. */
function buildJobContext(job) {
  const j = job || {};
  const skills = (Array.isArray(j.skills) ? j.skills : [])
    .map(s => clean(s))
    .filter(Boolean);

  const descRaw = [j.description, j.requirements, j.responsibilities, j.about]
    .filter(Boolean).join(' ');

  // Description keywords: repeated words, plus capitalised / tech-shaped ones.
  const counts = {};
  const leading = {};
  descRaw.split(/\n+/).forEach(line => {
    line.split(/[^A-Za-z0-9+#.]+/).filter(Boolean).forEach((w, i) => {
      const lw = clean(w).replace(/\.+$/, '');
      if (lw.length < 3 || STOPWORDS.has(lw) || /^\d+$/.test(lw)) return;
      if (!counts[lw]) counts[lw] = { n: 0, orig: w };
      counts[lw].n += 1;
      if (i === 0) leading[lw] = (leading[lw] || 0) + 1;
    });
  });
  const keywords = Object.keys(counts)
    .filter(k => counts[k].n >= 2 || (counts[k].n >= 1 && !((leading[k] || 0) >= counts[k].n)))
    .sort((a, b) => counts[b].n - counts[a].n)
    .slice(0, 20)
    .map(k => counts[k].orig);

  // Job-title words are strong signals ("frontend" -> react/vue/css repos).
  const titleWords = clean(j.title).split(' ').filter(w => w.length > 2 && !STOPWORDS.has(w));

  const terms = {};
  const add = (term, weight) => {
    const t = clean(term).replace(/[./]/g, '');
    if (t.length < 2) return;
    if (!terms[t]) terms[t] = { term: t, weight: weight, skill: weight === 3 };
  };
  skills.forEach(s => {
    add(s, 3);
    (TECH_ALIASES[s] ? [TECH_ALIASES[s]] : []).forEach(alias => add(alias, 3));
    s.split(' ').forEach(part => add(part, 3));
  });
  titleWords.forEach(w => add(w, 3));
  keywords.forEach(k => add(k, 1));
  Object.keys(TECH_ALIASES).forEach(k => {
    if (skills.indexOf(k) !== -1 || titleWords.indexOf(k) !== -1) add(TECH_ALIASES[k], 2);
  });

  const list = Object.keys(terms).map(k => terms[k]);
  return {
    title: j.title || '',
    company: j.company || '',
    skills: skills,
    keywords: keywords,
    languages: unique(list.filter(t => LANGUAGES.has(t.term)).map(t => t.term)),
    terms: list
  };
}

/** Loose match: handles plurals, and multi-word terms via substring. */
function termHit(haystack, term) {
  if (!term) return false;
  if (haystack.indexOf(term) !== -1) return true;
  if (term.length > 3 && haystack.indexOf(term + 's') !== -1) return true;
  if (term.length > 3 && /s$/.test(term) && haystack.indexOf(term.slice(0, -1)) !== -1) return true;
  return false;
}

/** Scores one repo 0-100 for how well it proves you can do THIS job. */
function scoreRepo(repo, ctx) {
  if (!repo || !repo.name) {
    return {
      repo: repo || {}, name: 'repo', score: 0, matched: [], matchedSkills: [],
      flags: ['No repo data'], reasons: [], language: '', stars: 0, updated: 'unknown',
      url: '', talking: false
    };
  }
  const r = repo || {};
  const context = ctx && ctx.terms ? ctx : buildJobContext({});
  const topics = Array.isArray(r.topics) ? r.topics : [];
  const haystack = clean([r.name, r.description, r.language, topics.join(' ')].join(' '));
  const flags = [];
  const matched = [];
  let weight = 0;

  (context.terms || []).forEach(t => {
    if (termHit(haystack, t.term)) {
      matched.push(t.term);
      weight += t.weight;
    }
  });
  const matchedSkills = matched.filter(m => context.skills.indexOf(m) !== -1);
  const matchedKeywords = matched.filter(m => context.skills.indexOf(m) === -1);

  let score = 18; // any real, non-fork repo is a starting point
  score += Math.min(42, matchedSkills.length * 14);
  score += Math.min(18, matchedKeywords.length * 3);

  const language = clean(r.language);
  if (language && context.languages.indexOf(language) !== -1) score += 10;
  if (r.description && String(r.description).trim().length > 20) score += 6;
  else flags.push('No description');
  if (topics.length) score += Math.min(6, topics.length * 2);

  const days = r.pushed_at ? Math.max(0, Math.round((Date.now() - new Date(r.pushed_at).getTime()) / 86400000)) : null;
  if (days === null) score += 0;
  else if (days <= 180) score += 10;
  else if (days <= 540) score += 6;
  else if (days <= 1095) score += 2;
  else flags.push('Last push ' + formatRelative(r.pushed_at));

  const stars = Number(r.stargazers_count) || 0;
  if (stars > 0) score += Math.min(6, Math.round(Math.log10(stars + 1) * 2.5));

  // A fork or an archived repo is never the story you tell - make sure it can
  // never reach the "talking point" bar no matter how well it matches.
  if (r.fork) { score -= 60; flags.push('Fork'); }
  if (r.archived) { score -= 50; flags.push('Archived'); }
  if (Number(r.size) > 0 && Number(r.size) < 8) { score -= 8; flags.push('Very small'); }
  if (WEAK_NAME.test(r.name || '')) { score -= 14; flags.push('Practice / boilerplate'); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const reasons = [];
  if (matchedSkills.length) reasons.push('Uses ' + matchedSkills.join(', ') + ' - asked for in this listing');
  else if (matchedKeywords.length) reasons.push('Touches ' + matchedKeywords.slice(0, 3).join(', ') + ' from the job description');
  else reasons.push('No overlap with this listing yet');
  if (language) reasons.push(language);
  if (stars > 0) reasons.push(stars + (stars === 1 ? ' star' : ' stars'));
  if (days !== null && days <= 180) reasons.push('actively worked on (' + formatRelative(r.pushed_at) + ')');

  return {
    repo: r,
    name: r.name || 'repo',
    score: score,
    matched: matched,
    matchedSkills: matchedSkills,
    flags: flags,
    reasons: reasons,
    language: language,
    stars: stars,
    updated: formatRelative(r.pushed_at),
    url: r.html_url || '',
    talking: score >= 60
  };
}

/** Forks and archived repos are never worth practising - hide them entirely. */
function rankRepos(repos, ctx) {
  const list = Array.isArray(repos) ? repos : [];
  const kept = [];
  let hidden = 0;
  list.forEach(r => {
    if (r && (r.fork || r.archived)) { hidden += 1; return; }
    kept.push(scoreRepo(r, ctx));
  });
  kept.sort((a, b) => (b.score - a.score) || String(b.repo.pushed_at || '').localeCompare(String(a.repo.pushed_at || '')));
  kept.forEach((item, i) => { item.rank = i + 1; });
  return { ranked: kept, hidden: hidden, total: list.length };
}

/** Cleans one candidate-written note (single line, length-capped). */
function noteText(v) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return s.length > 400 ? s.slice(0, 400).replace(/\s+\S*$/, '') : s;
}

/** The things a candidate can tell us about a repo, in pitch order. */
const NOTE_FIELDS = [
  { key: 'problem', label: 'The problem it solved' },
  { key: 'role', label: 'What you personally owned' },
  { key: 'stack', label: 'Why that stack' },
  { key: 'hard', label: 'The hardest part' },
  { key: 'result', label: 'The measurable result' }
];

/** Which of those are still empty, so the UI can ask for exactly those. */
function blankFields(notes) {
  const n = notes || {};
  return NOTE_FIELDS.filter(f => !noteText(n[f.key]));
}

/**
 * A 60-second pitch for one repo. With `notes` (what the candidate actually did)
 * it writes the answer out; without them it stays a skeleton with blanks, and
 * says which blanks remain.
 */
function buildRepoPitch(item, ctx, notes) {
  const r = (item && item.repo) || (item || {});
  const name = r.name || 'this project';
  const lang = clean(r.language);
  const what = r.description && String(r.description).trim()
    ? String(r.description).trim().replace(/\s+/g, ' ')
    : 'A ' + (lang || 'code') + ' project called ' + name;
  const matched = (item && item.matchedSkills && item.matchedSkills.length)
    ? item.matchedSkills
    : ((item && item.matched) ? item.matched : []);
  const n = notes || {};
  const problem = noteText(n.problem);
  const role = noteText(n.role);
  const stack = noteText(n.stack);
  const hard = noteText(n.hard);
  const result = noteText(n.result);
  const todo = blankFields(n);

  const lines = [];
  lines.push('PROJECT: ' + name + (r.html_url ? ' (' + r.html_url + ')' : ''));
  lines.push('What it is: ' + what);
  if (lang) lines.push('Built in: ' + lang + (r.stargazers_count ? ' | ' + r.stargazers_count + ' stars' : '') + (r.pushed_at ? ' | updated ' + formatRelative(r.pushed_at) : ''));
  if (matched.length) lines.push('Why it fits this job: it uses ' + matched.join(', ') + (ctx && ctx.title ? ' - exactly what the ' + ctx.title + ' listing asks for.' : '.'));
  lines.push('');
  if (todo.length) {
    lines.push('60-SECOND PITCH (fill in the blanks in brackets)');
    lines.push('1. What it does: ' + what.replace(/[.!?]+$/, '') + '.');
    lines.push('2. Why you built it: ' + (problem || '[the problem you wanted to solve, in one line]'));
    lines.push('3. Your role: ' + (role || '[what you personally owned - "I built", not "we built"]'));
    lines.push('4. Tech choice: ' + (stack || (lang ? 'why ' + lang + ', and what you traded away for it' : '[the stack, and why]')));
    lines.push('5. Hardest part: ' + (hard || '[the one technical problem that took real effort]'));
    lines.push('6. Result: ' + (result || '[the number - users, speed, revenue, % - "no number, no story"]'));
    lines.push('');
    lines.push('STILL TO FILL IN');
    todo.forEach(f => lines.push('- ' + f.label));
  } else {
    lines.push('YOUR 60-SECOND ANSWER (say it in your own words, do not read it)');
    lines.push('1. What it does: ' + what.replace(/[.!?]+$/, '') + '.');
    lines.push('2. Why it existed: ' + problem + '.');
    lines.push('3. My role: ' + role + '.');
    lines.push('4. Tech: ' + (stack || lang) + '.');
    lines.push('5. Hardest part: ' + hard + '.');
    lines.push('6. Result: ' + result + '.');
    if (ctx && ctx.title) {
      lines.push('');
      lines.push('CLOSING LINE FOR THIS ROLE');
      lines.push('That is why I am interested in the ' + ctx.title + ' role - ' +
        (matched.length ? 'it is the same ' + matched.slice(0, 2).join(' and ') + ' work.' : 'it is the same kind of work.'));
    }
  }
  lines.push('');
  lines.push('EXPECTED FOLLOW-UPS');
  lines.push('- Architecture: how it is put together, and why');
  lines.push('- What you would do differently now');
  lines.push('- What you would build next if you had a week');
  lines.push('- The bug that taught you the most');
  return lines.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildJobContext: buildJobContext,
    scoreRepo: scoreRepo,
    rankRepos: rankRepos,
    buildRepoPitch: buildRepoPitch,
    blankFields: blankFields,
    NOTE_FIELDS: NOTE_FIELDS,
    formatRelative: formatRelative,
    termHit: termHit
  };
}

if (typeof window !== 'undefined') {
  window.swapikiGitHub = {
    buildJobContext: buildJobContext,
    scoreRepo: scoreRepo,
    rankRepos: rankRepos,
    buildRepoPitch: buildRepoPitch,
    blankFields: blankFields,
    NOTE_FIELDS: NOTE_FIELDS,
    formatRelative: formatRelative
  };
}
