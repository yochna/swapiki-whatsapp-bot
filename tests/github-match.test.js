const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildJobContext, scoreRepo, rankRepos, buildRepoPitch, formatRelative, termHit
} = require('../js/githubMatch.js');

const job = () => ({
  title: 'Senior Frontend Engineer',
  company: 'Flipkart',
  skills: ['React', 'TypeScript', 'Next.js'],
  description: [
    'Requirements',
    '- 4+ years of experience building production React applications',
    '- Strong TypeScript and Next.js experience',
    '- Experience with performance optimisation and Core Web Vitals',
    'Responsibilities',
    '- Build and maintain reusable React components used by 12 teams'
  ].join('\n')
});

const repo = (over) => Object.assign({
  name: 'checkout-app',
  description: 'Production React and TypeScript app with performance optimisation',
  language: 'TypeScript',
  topics: ['react', 'performance'],
  stargazers_count: 12,
  fork: false,
  archived: false,
  size: 2400,
  pushed_at: '2026-09-01T00:00:00Z',
  html_url: 'https://github.com/me/checkout-app'
}, over || {});

test('termHit handles plurals and simple words', () => {
  assert.equal(termHit('built with react and typescript', 'react'), true);
  assert.equal(termHit('python scripts', 'python'), true);
  assert.equal(termHit('a django api', 'flask'), false);
});

test('formatRelative reads as human freshness', () => {
  const now = new Date('2026-09-28T00:00:00Z').getTime();
  assert.equal(formatRelative('2026-09-27T00:00:00Z', now), 'yesterday');
  assert.equal(formatRelative('2026-06-28T00:00:00Z', now), '3 months ago');
  assert.equal(formatRelative('2024-09-28T00:00:00Z', now), '2 years ago');
  assert.equal(formatRelative(null, now), 'unknown');
});

test('buildJobContext pulls skills, title words and description keywords', () => {
  const ctx = buildJobContext(job());
  assert.deepEqual(ctx.skills, ['react', 'typescript', 'next.js']);
  assert.ok(ctx.terms.some(t => t.term === 'react' && t.skill));
  assert.ok(ctx.terms.some(t => t.term === 'frontend'));
  assert.ok(ctx.keywords.length > 0);
  assert.ok(ctx.languages.indexOf('typescript') !== -1);
});

test('a repo that matches the listing beats an unrelated repo', () => {
  const ctx = buildJobContext(job());
  const good = scoreRepo(repo(), ctx);
  const bad = scoreRepo(repo({
    name: 'recipe-notes',
    description: 'A notes app for storing recipes I cook at home',
    language: 'Python',
    topics: ['cooking'],
    stargazers_count: 0,
    pushed_at: '2021-01-01T00:00:00Z'
  }), ctx);
  assert.ok(good.score > bad.score, `expected ${good.score} > ${bad.score}`);
  assert.equal(good.talking, true);
  assert.ok(good.matchedSkills.indexOf('react') !== -1);
  assert.ok(good.matchedSkills.indexOf('typescript') !== -1);
  assert.equal(bad.talking, false);
});

test('forks, archived and boilerplate repos are penalised or hidden', () => {
  const ctx = buildJobContext(job());
  const fork = scoreRepo(repo({ fork: true }), ctx);
  assert.ok(fork.score < 50);
  assert.ok(fork.flags.indexOf('Fork') !== -1);

  const boiler = scoreRepo(repo({ name: 'awesome-python-tutorial' }), ctx);
  assert.ok(boiler.flags.indexOf('Practice / boilerplate') !== -1);

  const { ranked, hidden } = rankRepos([
    repo({ name: 'a-fork', fork: true }),
    repo({ name: 'b-archived', archived: true }),
    repo({ name: 'c-real' })
  ], ctx);
  assert.equal(hidden, 2);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].name, 'c-real');
  assert.equal(ranked[0].rank, 1);
});

test('rankRepos orders by score and assigns ranks', () => {
  const ctx = buildJobContext(job());
  const { ranked } = rankRepos([
    repo({ name: 'unrelated-things', description: 'offline chess clock', language: 'C', topics: [], stargazers_count: 0 }),
    repo({ name: 'react-dashboard', description: 'React TypeScript dashboard for Core Web Vitals monitoring' }),
    repo({ name: 'middling-tool', description: 'A small CLI for JSON formatting', language: 'JavaScript', topics: [] })
  ], ctx);
  assert.equal(ranked[0].name, 'react-dashboard');
  assert.deepEqual(ranked.map(r => r.rank), [1, 2, 3]);
  assert.ok(ranked[0].score >= ranked[1].score);
  assert.ok(ranked[1].score >= ranked[2].score);
});

test('an empty repo list is safe', () => {
  const ctx = buildJobContext({});
  const { ranked, hidden, total } = rankRepos(null, ctx);
  assert.deepEqual(ranked, []);
  assert.equal(hidden, 0);
  assert.equal(total, 0);
  assert.equal(scoreRepo(null, ctx).score, 0);
});

test('pitch is built from the repo and names the matching skills', () => {
  const ctx = buildJobContext(job());
  const item = scoreRepo(repo(), ctx);
  const pitch = buildRepoPitch(item, ctx);
  assert.ok(pitch.indexOf('PROJECT: checkout-app') === 0);
  assert.ok(pitch.indexOf('https://github.com/me/checkout-app') !== -1);
  assert.ok(pitch.indexOf('Why it fits this job') !== -1);
  assert.ok(pitch.indexOf('60-SECOND PITCH') !== -1);
  assert.ok(pitch.indexOf('60-SECOND PITCH') < pitch.indexOf('EXPECTED FOLLOW-UPS'));
  assert.ok(pitch.indexOf('[the number') !== -1, 'must leave a result placeholder');
});

test('pitch falls back when the repo has no description', () => {
  const ctx = buildJobContext(job());
  const item = scoreRepo(repo({ description: '' }), ctx);
  const pitch = buildRepoPitch(item, ctx);
  assert.ok(pitch.indexOf('What it is: A typescript project called checkout-app') !== -1);
});
