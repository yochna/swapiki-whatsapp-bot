const test = require('node:test');
const assert = require('node:assert/strict');

const { computeProfileMatch, profileYears, requiredYears, requiredSkills, candidateSkills } = require('../js/profileMatch.js');

const profile = () => ({
  title: 'Full Stack Developer',
  experience: '3+ Years Experience',
  expertise: ['React', 'Node.js', 'PostgreSQL', 'AWS'],
  projects: [
    { title: 'RecipeFinder', tags: ['React', 'REST APIs'], role: 'Full Stack Developer' },
    { title: 'Swapiki', tags: ['Supabase', 'Node.js'], role: 'Backend Intern' }
  ]
});

const job = () => ({
  id: 'j1',
  title: 'Full Stack Developer',
  company: 'Nudge AI',
  skills: ['React', 'Node.js', 'PostgreSQL'],
  description: '3+ years experience building React and Node.js apps with PostgreSQL. Responsible for end-to-end features.',
  raw_text: 'Full Stack Developer at Nudge AI. 3+ years required.'
});

const fresherProfile = () => ({
  ...profile(),
  experience: 'Fresher',
  expertise: ['Python', 'SQL'],
  projects: []
});

const backendJob = () => ({
  id: 'j2',
  title: 'Backend Engineer',
  company: 'X',
  skills: ['Go', 'Kubernetes', 'gRPC'],
  description: '',
  raw_text: 'Backend Engineer. 2-4 years experience.'
});

test('profile years parse: 3+ -> 3, Fresher -> 0, unknown -> null', () => {
  assert.equal(profileYears(profile()), 3);
  assert.equal(profileYears(fresherProfile()), 0);
  assert.equal(profileYears({ experience: '' }), null);
});

test('required years parse: range, single, fresher, none', () => {
  assert.deepEqual(requiredYears(backendJob()), { min: 2, max: 4 });
  assert.deepEqual(requiredYears(job()), { min: 3, max: 3 });
  assert.deepEqual(requiredYears({ title: 'SDE Intern', description: 'great for freshers and entry level' }), { min: 0, max: 1 });
  assert.equal(requiredYears({ title: 'SDE', description: 'no experience requirement mentioned' }), null);
});

test('required skills come from the skills array (not title words)', () => {
  const rs = requiredSkills(job());
  assert.deepEqual(rs.sort(), ['node.js', 'postgresql', 'react'].sort());
  assert.ok(!rs.includes('developer')); // role fit is scored separately
});

test('candidate skills come from expertise + project tags', () => {
  const cs = candidateSkills(profile());
  assert.ok(cs.includes('react'));
  assert.ok(cs.includes('rest apis'));
  assert.ok(cs.includes('supabase'));
});

test('strong match is a strong match', () => {
  const r = computeProfileMatch(profile(), job());
  assert.ok(r.overall >= 80, `expected strong, got ${r.overall}`);
  assert.equal(r.band, 'Strong match');
  assert.ok(r.matched.includes('react') && r.matched.includes('node.js') && r.matched.includes('postgresql'));
  assert.equal(r.missing.length, 0);
  assert.equal(r.part.length, 3);
});

test('weak fit lists missing skills and a low band', () => {
  const r = computeProfileMatch(fresherProfile(), backendJob());
  assert.ok(r.overall < 60, `expected weak, got ${r.overall}`);
  assert.ok(r.missing.includes('go') || r.missing.includes('go') || r.missing.some(m => backendJob().skills.some(s => s.toLowerCase() === m)));
  assert.ok(r.part.find(p => p.key === 'skills').pct < 50);
});

test('no skills declared on the listing stays neutral for the skills row', () => {
  const r = computeProfileMatch(profile(), { id: 'j3', title: 'Program Manager', description: 'no skill list here' });
  assert.equal(r.part.find(p => p.key === 'skills').pct, 50);
  assert.ok(r.overall >= 0 && r.overall <= 100);
});

test('fresher-friendly listing gives full experience credit to a fresher', () => {
  const r = computeProfileMatch(fresherProfile(), { id: 'j4', title: 'SDE Intern', skills: ['Python'], description: 'ideal for freshers' });
  assert.equal(r.part.find(p => p.key === 'experience').pct, 100);
});

test('overall is bounded 0..100 in all cases', () => {
  for (const pr of [profile(), fresherProfile(), {}]) {
    for (const jb of [job(), backendJob(), {}, { title: '', description: '' }]) {
      const r = computeProfileMatch(pr, jb);
      assert.ok(r.overall >= 0 && r.overall <= 100, `overall ${r.overall}`);
      assert.equal(typeof r.band, 'string');
      assert.equal(r.part.length, 3);
    }
  }
});