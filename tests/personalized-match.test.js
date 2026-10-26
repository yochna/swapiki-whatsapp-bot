const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computePersonalizedMatch,
  parseProfileLocation,
  matchJobLocation,
  matchJobProjects,
  matchJobSkills,
  generateVoicePitchTips,
  renderPersonalizedFitModalHtml
} = require('../js/profileMatch.js');

const candidate = () => ({
  id: 'cand1',
  name: 'Ananya Sharma',
  title: 'Lead Product Designer & UI Architect',
  experience: '8+ Years Experience',
  location: 'Bengaluru, Karnataka (Remote Ready)',
  expertise: ['Design Systems', 'UPI Payment Flows', 'User Research', 'Prototyping'],
  projects: [
    {
      id: 'p1',
      title: 'Razorpay Checkout & Vernacular UPI Flow',
      role: 'Lead Product Designer & UI Architect',
      tags: ['UPI 2.0', 'Figma', 'Design Tokens', 'Vernacular UI'],
      takeaways: ['Architected multi-brand token system supporting 6 Indian languages']
    },
    {
      id: 'p2',
      title: 'Swiggy Instamart Dark Store Logistics Portal',
      role: 'Principal UX Researcher & Product Designer',
      tags: ['Supply Chain UX', 'Design Systems', 'Web Audio API', 'B2B SaaS'],
      takeaways: ['Conducted 40+ field interviews with dark store pickers']
    }
  ]
});

test('parseProfileLocation detects city and remote readiness', () => {
  const parsedBlr = parseProfileLocation('Bengaluru, Karnataka (Remote Ready)');
  assert.equal(parsedBlr.primaryCity.slug, 'bangalore');
  assert.equal(parsedBlr.cityName, 'Bengaluru');
  assert.equal(parsedBlr.isRemoteReady, true);

  const parsedPune = parseProfileLocation('Pune, Maharashtra');
  assert.equal(parsedPune.primaryCity.slug, 'pune');
  assert.equal(parsedPune.cityName, 'Pune');
  assert.equal(parsedPune.isRemoteReady, false);

  const parsedDelhi = parseProfileLocation('Noida / Gurgaon / Delhi NCR');
  assert.equal(parsedDelhi.primaryCity.slug, 'delhi-ncr');
  assert.equal(parsedDelhi.cityName, 'Delhi NCR');

  const parsedRemote = parseProfileLocation('Work from Home / Remote');
  assert.equal(parsedRemote.isRemoteReady, true);
});

test('matchJobLocation scores city match 100% and remote 100%', () => {
  const locInfo = parseProfileLocation('Bengaluru, Karnataka (Remote Ready)');

  const blrJob = { location: 'Bangalore, Karnataka' };
  const blrMatch = matchJobLocation(locInfo, blrJob);
  assert.equal(blrMatch.score, 100);
  assert.equal(blrMatch.isCityMatch, true);

  const remoteJob = { location: 'Remote, India' };
  const remoteMatch = matchJobLocation(locInfo, remoteJob);
  assert.equal(remoteMatch.score, 100);
  assert.equal(remoteMatch.isRemote, true);

  const diffCityJob = { location: 'Pune, Maharashtra' };
  const diffMatch = matchJobLocation(locInfo, diffCityJob);
  assert.ok(diffMatch.score < 50);
  assert.equal(diffMatch.isCityMatch, false);
});

test('matchJobProjects identifies matching proof projects based on tags and title', () => {
  const c = candidate();
  const upiJob = {
    title: 'Senior Product Designer - UPI & Checkout',
    company: 'Fintech Co',
    skills: ['Figma', 'Design Systems', 'UPI'],
    description: 'Lead checkout experiences and token design systems'
  };

  const pMatch = matchJobProjects(c, upiJob);
  assert.ok(pMatch.score >= 80, `expected high project score, got ${pMatch.score}`);
  assert.ok(pMatch.bestProject.title.includes('Razorpay Checkout'));
  assert.ok(pMatch.matchedTags.includes('UPI 2.0') || pMatch.matchedTags.includes('Figma') || pMatch.matchedTags.includes('Design Tokens'));
});

test('matchJobSkills scores candidate expertise and project tags against listing', () => {
  const c = candidate();
  const job = {
    title: 'UI Architect',
    skills: ['Design Systems', 'Figma', 'Prototyping']
  };

  const skMatch = matchJobSkills(c, job);
  assert.equal(skMatch.pct, 100);
  assert.equal(skMatch.missing.length, 0);
});

test('computePersonalizedMatch provides comprehensive score and personalized reasons', () => {
  const c = candidate();
  const matchingJob = {
    id: 'job-target',
    title: 'Lead Product Designer',
    company: 'Fintech Unicorn',
    location: 'Bengaluru',
    skills: ['Design Systems', 'Figma', 'Prototyping'],
    description: 'Lead Vernacular UPI and checkout flow interfaces for Bharat users'
  };

  const res = computePersonalizedMatch(c, matchingJob);
  assert.ok(res.overall >= 80, `expected >= 80 for tailored job, got ${res.overall}`);
  assert.equal(res.band, 'Strong match');
  assert.ok(res.reasons.length >= 2, 'should provide multiple personalized reasons');
  assert.ok(res.reasons.some(r => r.includes('City') || r.includes('Bengaluru')));
  assert.ok(res.reasons.some(r => r.includes('skill')));
  assert.ok(res.reasons.some(r => r.includes('Razorpay') || r.includes('Proof')));
});

test('computePersonalizedMatch degrades gracefully for unrelated roles', () => {
  const c = candidate();
  const unrelatedJob = {
    id: 'job-unrelated',
    title: 'Senior Java Backend Engineer',
    company: 'Legacy Corp',
    location: 'Chandigarh',
    skills: ['Java', 'Spring Boot', 'Hibernate', 'Oracle DB'],
    description: 'Maintain banking backend batch processing jobs'
  };

  const res = computePersonalizedMatch(c, unrelatedJob);
  assert.ok(res.overall <= 45, `expected low score for unrelated role, got ${res.overall}`);
});

test('generateVoicePitchTips produces tailored talking points for voice walkthrough', () => {
  const c = candidate();
  const matchingJob = {
    id: 'job-target',
    title: 'Lead Product Designer',
    company: 'Fintech Unicorn',
    location: 'Bengaluru',
    skills: ['Design Systems', 'Figma', 'Prototyping'],
    description: 'Lead Vernacular UPI and checkout flow interfaces for Bharat users'
  };
  const pMatch = computePersonalizedMatch(c, matchingJob);
  const tips = generateVoicePitchTips(c, matchingJob, pMatch);
  assert.equal(tips.length, 3);
  assert.ok(tips[0].includes('Razorpay Checkout') || tips[0].includes('lead project'));
  assert.ok(tips[1].includes('Design Systems') || tips[1].includes('tools') || tips[1].includes('mastery'));
  assert.ok(tips[2].includes('Bengaluru'));
});

test('renderPersonalizedFitModalHtml generates rich modal markup with scores and tips', () => {
  const c = candidate();
  const matchingJob = {
    id: 'job-target',
    title: 'Lead Product Designer',
    company: 'Fintech Unicorn',
    location: 'Bengaluru',
    skills: ['Design Systems', 'Figma', 'Prototyping']
  };
  const pMatch = computePersonalizedMatch(c, matchingJob);
  const html = renderPersonalizedFitModalHtml(matchingJob, c, pMatch);
  assert.ok(html.includes('Compatibility Dimensions'));
  assert.ok(html.includes('Suggested 2-Minute Walkthrough Talking Points'));
  assert.ok(html.includes('Razorpay Checkout'));
  assert.ok(html.includes('Bengaluru'));
});

