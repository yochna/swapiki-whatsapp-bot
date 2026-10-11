const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const DIGEST_MODULE = pathToFileURL(path.join(ROOT, 'whatsapp-bot', 'src', 'digest.js')).href;
const SLUG_MODULE = pathToFileURL(path.join(ROOT, 'whatsapp-bot', 'src', 'slug.js')).href;
const JOBS_FEED_MODULE = pathToFileURL(path.join(ROOT, 'functions', 'lib', 'jobs-feed.js')).href;

const digestMod = () => import(DIGEST_MODULE);
const slugMod = () => import(SLUG_MODULE);
const jobsFeedMod = () => import(JOBS_FEED_MODULE);

const JOB = {
  id: '3f8a1c2e-9d4b-4a1f-8c7d-2e6b5a4d3c21',
  title: 'Senior React Developer',
  company: 'TechCorp India',
  location: 'Bengaluru',
  category: 'it',
  salary: '₹24,00,000',
  skills: ['react', 'node']
};

test('the whatsapp digest lists each job with a bold title and a tappable link', async () => {
  const { formatWhatsAppDigest } = await digestMod();
  const items = [
    { job: JOB, url: `https://swapiki.com/jobs/senior-react-developer--${JOB.id}` },
    { job: { id: 'a'.repeat(36), title: 'Data Analyst', company: 'FinCo', location: 'Mumbai', salary: '₹18 LPA' }, url: 'https://swapiki.com/jobs/data-analyst--' }
  ];
  const out = formatWhatsAppDigest(items);
  assert.match(out, /^\*New roles on Swapiki\*/);
  assert.ok(out.includes('1. *Senior React Developer*'), 'title must be bolded');
  assert.ok(out.includes('TechCorp India  ·  Bengaluru'), 'company/location separator matches the channel style');
  assert.ok(out.includes('💰 ₹24,00,000'));
  assert.ok(out.indexOf('https://swapiki.com/jobs/senior-react-developer') !== -1, 'the link must be on its own tappable line');
  assert.match(out, /👉 See all roles on Swapiki/);
  assert.match(out, /https:\/\/swapiki\.com\/#jobs/);
  assert.ok(out.indexOf('2. *Data Analyst*') > out.indexOf('1. *Senior React Developer*'), 'items keep their order');
});

test('the digest caps attacker-influenced fields instead of trusting them', async () => {
  const { formatWhatsAppDigest } = await digestMod();
  const job = {
    id: 'f'.repeat(36),
    title: 'T'.repeat(500),
    company: 'C'.repeat(500),
    location: 'L'.repeat(500),
    salary: 'S'.repeat(500)
  };
  const out = formatWhatsAppDigest([{ job, url: 'https://swapiki.com/jobs/x' }]);
  assert.ok(out.includes('...'), 'long fields are clipped with an ellipsis');
  const titleLine = out.split('\n').find((l) => l.includes('*'));
  const bolded = titleLine.match(/\*([^*]+)\*/);
  assert.ok(bolded, 'a bolded title is present');
  assert.ok(bolded[1].length <= 200, `the title stays within its cap, got ${bolded[1].length}`);
});

test('an asterisk in a job title cannot open a WhatsApp *bold* run', async () => {
  const { formatWhatsAppDigest } = await digestMod();
  const job = { id: 'a'.repeat(36), title: 'Engineer * Lead', company: 'X', location: 'Y' };
  const out = formatWhatsAppDigest([{ job, url: 'https://swapiki.com/jobs/x' }]);
  assert.ok(!out.includes('*Lead'), 'the title asterisk must be neutralised, not rendered as markup');
  assert.ok(out.includes('Engineer  Lead') || out.includes('Engineer Lead'), 'and the words must still appear');
});

test('an empty digest renders just the header and footer', async () => {
  const { formatWhatsAppDigest } = await digestMod();
  const out = formatWhatsAppDigest([]);
  assert.match(out, /^\*New roles on Swapiki\*/);
  assert.match(out, /👉 See all roles on Swapiki/);
});

test('MAX_DIGEST_JOBS keeps one digest inside a single readable message', async () => {
  const { MAX_DIGEST_JOBS } = await digestMod();
  assert.equal(MAX_DIGEST_JOBS, 8, 'matches the Telegram channel cap');
});

test('todayKey is the UTC day, so "one digest per day" is per UTC day', async () => {
  const { todayKey } = await digestMod();
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(todayKey(), new Date().toISOString().slice(0, 10));
});

test('the whatsapp service slugs match the live site jobSlug exactly', async () => {
  // The digest links to /jobs/<slug> on swapiki.com. If this copy drifts from
  // functions/lib/jobs-feed.js jobSlug(), every digest link 404s. The service
  // runs on its own host and cannot import from ../functions, so parity is
  // enforced here instead.
  const { jobSlug: waSlug } = await slugMod();
  const { jobSlug: siteSlug } = await jobsFeedMod();
  const rows = [
    JOB,
    { id: '3f8a1c2e-9d4b-4a1f-8c7d-2e6b5a4d3c21', title: 'Senior React Developer', company: 'TechCorp India', location: 'Bengaluru' },
    { id: 'b'.repeat(36), title: 'SENIOR NODE.JS ENGINEER @ STARTUP!', company: '  Two Words  ', location: 'Pune' },
    { id: 'c'.repeat(36), title: 'A title that is far far longer than eighty characters because the feed loves to ramble on and on forever', company: 'Co', location: 'Delhi' },
    { id: 'd'.repeat(36), title: 'مطور', company: '', location: '' },
    { id: 'e'.repeat(36), title: '', company: '', location: '' },
    { id: '', title: 'No id yet', company: 'Co', location: 'Goa' },
    { id: 'g'.repeat(36), title: '  ', company: null, location: undefined }
  ];
  for (const row of rows) {
    assert.equal(waSlug(row), siteSlug(row), `slug mismatch for ${JSON.stringify(row)}`);
  }
});

test('the pending query targets published, unstamped jobs oldest-first', async () => {
  const { pendingQuery } = await digestMod();
  const q = pendingQuery();
  assert.match(q, /status=eq\.published/);
  assert.match(q, /whatsapp_posted_at=is\.null/);
  assert.match(q, /order=first_seen_at\.asc/);
});