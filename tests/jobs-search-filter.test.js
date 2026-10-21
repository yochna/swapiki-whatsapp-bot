/**
 * The job board search used to match the WHOLE query as one substring, so the
 * natural way people type — "sales jobs in pune" — returned nothing: no listing
 * contains that exact sentence, it says "Sales Executive" in "Pune". The fix is
 * to split the query into terms, drop the filler words, and require every term
 * to appear somewhere on the listing.
 *
 * These tests pin that behaviour so it cannot quietly regress to substring
 * matching, and cover the empty-state "clear" reset.
 */
const test = require('node:test');
const assert = require('node:assert');
const { bootApp } = require('./helpers/app-sandbox');

function tokens(app, q) {
  // The token list is built inside the vm sandbox, so it is a cross-realm array
  // and deepStrictEqual would compare prototypes. Compare the contents instead.
  return app._jobSearchTokens(q).join(' ');
}

test('a query is split into meaningful terms, filler removed', () => {
  const { app } = bootApp();
  assert.strictEqual(tokens(app, 'sales jobs in pune'), 'sales pune');
  assert.strictEqual(tokens(app, 'React Native Developer'), 'react native developer');
  assert.strictEqual(tokens(app, '  Software   Engineer '), 'software engineer');
});

test('filler-only and one-character queries leave every listing matching', () => {
  const { app } = bootApp();
  assert.strictEqual(tokens(app, 'jobs in'), '');
  assert.strictEqual(tokens(app, 'a'), '');
  assert.strictEqual(tokens(app, ''), '');
  assert.strictEqual(tokens(app, '   '), '');
});

test('symbols that are part of a skill survive tokenising', () => {
  const { app } = bootApp();
  assert.strictEqual(tokens(app, 'C++'), 'c++');
  assert.strictEqual(tokens(app, 'c#'), 'c#');
});

test('a listing matches only when every term is present', () => {
  const { app } = bootApp();
  const job = {
    title: 'Sales Executive',
    company: 'Acme',
    location: 'Pune, Maharashtra',
    skills: ['CRM', 'Negotiation'],
    description: 'Field sales role'
  };

  // The reported case: a natural phrase has to find the role AND the city.
  assert.strictEqual(app._jobMatchesTokens(job, app._jobSearchTokens('sales jobs in pune')), true);
  // The same query against a city the listing is not in must not match on
  // "sales" alone - otherwise every sales job in the country floods the result.
  assert.strictEqual(app._jobMatchesTokens(job, app._jobSearchTokens('sales hyderabad')), false);
  assert.strictEqual(app._jobMatchesTokens(job, app._jobSearchTokens('react')), false);
  // Terms can land in any field: title, company, skills or location.
  assert.strictEqual(app._jobMatchesTokens(job, app._jobSearchTokens('acme')), true);
  assert.strictEqual(app._jobMatchesTokens(job, app._jobSearchTokens('crm')), true);
  // No meaningful terms means no filtering.
  assert.strictEqual(app._jobMatchesTokens(job, app._jobSearchTokens('the job')), true);
});

test('the board shows "sales in pune" results, not the literal phrase', () => {
  const booted = bootApp();
  // The debounced search logger fires later; keep it from touching the stub store.
  booted.sandbox.swapikiStore.recordSearchEvent = () => {};
  const { app, els } = booted;
  app._jobsCache = [
    { id: '1', title: 'Sales Executive', company: 'Acme', location: 'Pune', category: 'any', skills: ['CRM'], description: 'Field sales' },
    { id: '2', title: 'Backend Engineer', company: 'Beta', location: 'Bengaluru', category: 'it', skills: ['Node'], description: 'APIs' }
  ];

  app.setJobsQuery('sales jobs in pune');
  const html = els['jobs-results'].innerHTML;
  assert.match(html, /Sales Executive/, 'the sales role in Pune should be listed');
  assert.ok(!html.includes('Backend Engineer'), 'an unrelated role must not appear');

  if (app._searchLogTimer) clearTimeout(app._searchLogTimer);
});

test('no term match falls back to the helpful empty state, and clear resets it', () => {
  const booted = bootApp();
  booted.sandbox.swapikiStore.recordSearchEvent = () => {};
  const { app, els } = booted;
  app._jobsCache = [
    { id: '1', title: 'Sales Executive', company: 'Acme', location: 'Pune', category: 'any', skills: ['CRM'], description: 'Field sales' },
    { id: '2', title: 'Backend Engineer', company: 'Beta', location: 'Bengaluru', category: 'it', skills: ['Node'], description: 'APIs' }
  ];

  app.setJobsQuery('sales hyderabad');
  const empty = els['jobs-results'].innerHTML;
  assert.match(empty, /No openings match/, 'the empty state should explain itself');
  assert.ok(!empty.includes('Sales Executive'), 'a non-matching role must not be shown');

  app.clearJobsFilters();
  const back = els['jobs-results'].innerHTML;
  assert.match(back, /Sales Executive/, 'clearing the search restores the full board');
  assert.match(back, /Backend Engineer/, 'clearing the search restores the full board');

  if (app._searchLogTimer) clearTimeout(app._searchLogTimer);
});

test('the board provides personalized jobs option matching profile projects, skills and city', () => {
  const booted = bootApp();
  const { app, els, sandbox } = booted;
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'profileMatch.js'), 'utf8'),
    sandbox,
    { filename: 'profileMatch.js' }
  );

  sandbox.swapikiStore.getProfile = () => ({
    name: 'Ananya Sharma',
    location: 'Bengaluru, Karnataka (Remote Ready)',
    expertise: ['Design Systems', 'Figma', 'Prototyping'],
    projects: [
      { title: 'Razorpay UPI Flow', tags: ['Design Tokens', 'Figma'], role: 'UI Architect' }
    ]
  });

  app._jobsCache = [
    {
      id: '1',
      title: 'Senior Product Designer',
      company: 'Razorpay',
      location: 'Bengaluru',
      category: 'it',
      skills: ['Figma', 'Design Systems'],
      description: 'Lead design tokens and checkout UX in Bengaluru.'
    },
    {
      id: '2',
      title: 'Java Backend Architect',
      company: 'Legacy Corp',
      location: 'Chandigarh',
      category: 'it',
      skills: ['Java', 'Spring'],
      description: 'Maintain Java batch services.'
    }
  ];

  app.setJobsFilter('personalized');
  const html = els['jobs-results'].innerHTML;
  assert.match(html, /Personalized for Your Profile/, 'personalized banner should appear');
  assert.match(html, /Bengaluru/, 'candidate city should be recognized');
  assert.match(html, /Senior Product Designer/, 'matching role should be listed');
  assert.ok(!html.includes('Java Backend Architect'), 'unrelated role should be filtered out from personalized tab');
  assert.match(html, /Profile Fit:/, 'job card should explain why it matches');

  // Toggle off personalization
  app.togglePersonalizedJobs();
  const resetHtml = els['jobs-results'].innerHTML;
  assert.match(resetHtml, /Java Backend Architect/, 'turning off personalization restores all roles');
});
