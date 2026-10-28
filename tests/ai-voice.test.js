// Swapiki does not allow AI voices on a profile. Two things used to put one there:
//
//   1. A project with no saved recording still showed a player. Pressing play made
//      the visitor's browser read the candidate's typed text aloud in a synthetic
//      voice ("Hi, I am <name>. In this project ...") - an AI voice speaking AS the
//      candidate, on a real candidate's page.
//   2. Nothing asked a candidate to say the recording was their own live voice.
//
// The built-in fictional sample profile is the only place a demo voice remains,
// and it is labelled as one.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bootApp, fakeEl } = require('./helpers/app-sandbox');

function boot(profile, { publicUsername = 'priyanshu-007' } = {}) {
  const booted = bootApp();
  const { app, els, sandbox } = booted;
  const rows = [];
  els['stitch-candidate-projects-container'] = Object.assign(fakeEl(), { appendChild: (r) => rows.push(r) });
  sandbox.document.createElement = () => fakeEl();
  Object.assign(sandbox.swapikiStore, {
    getProfileByUsername: () => Promise.resolve(profile),
    toList: (v) => (Array.isArray(v) ? v : []),
    recordProfileView: () => {}
  });
  const spoken = [];
  sandbox.window.speechSynthesis = {
    speak: (u) => spoken.push(u), cancel() {}, getVoices: () => []
  };
  sandbox.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const toasts = [];
  app.showToast = (m) => toasts.push(String(m));
  app.publicUsername = publicUsername;
  return { ...booted, rows, spoken, toasts };
}

const realProfile = (projects) => ({
  id: 'c1', name: 'Priyanshu Kumar', title: 'Developer', experience: '1y', status: '', education: '',
  expertise: ['React'], linkedin: '', twitter: '', portfolio: '', resumeLink: '', projects
});

const noAudio = { id: 'p9', title: 'CRM', role: 'Dev', impact: '2x faster', tags: ['react'], takeaways: ['Built it'], audioUrl: null };
const withAudio = { ...noAudio, id: 'p8', title: 'Billing', audioUrl: 'https://cdn.example/real.webm' };

test('pressing play on a real candidate project with no recording never speaks', async () => {
  const { app, els, spoken, toasts } = boot(realProfile([noAudio]));
  await app.renderCandidateProfile();
  els['play-icon-p9'] = Object.assign(fakeEl(), { closest: () => null });
  els['play-icon-p9'].textContent = 'play_arrow';
  app.playProjectAudio('p9');
  assert.strictEqual(spoken.length, 0, 'no synthetic voice is produced for a real candidate');
  assert.ok(toasts.some(t => /no voice recording/i.test(t)), 'the visitor is told there is no recording');
});

test('a project with no recording shows a plain note, not an AI-voice player', async () => {
  const { app, rows } = boot(realProfile([noAudio, withAudio]));
  await app.renderCandidateProfile();
  assert.strictEqual(rows.length, 2);
  const [without, withRec] = rows.map(r => r.innerHTML);
  assert.ok(!/AI-GENERATED/i.test(without), 'no "AI-generated demo voice" label on a real profile');
  assert.ok(!without.includes('playProjectAudio'), 'no play button when there is nothing to play');
  assert.ok(/No voice walkthrough has been recorded/.test(without));
  assert.ok(withRec.includes('CANDIDATE VOICE WALKTHROUGH'), 'a real recording still gets its player');
  assert.ok(withRec.includes("playProjectAudio('p8')"));
});

test('the built-in fictional sample keeps its labelled demo voice', async () => {
  const sample = realProfile([{ ...noAudio, id: 'p1' }]);
  sample.id = 'ananya_sharma';
  const { app, els, sandbox, rows, spoken } = boot(sample, { publicUsername: null });
  // With no handle in the URL the page shows the viewer's own (here: the sample) profile.
  sandbox.swapikiStore.getProfile = () => sample;
  await app.renderCandidateProfile();
  assert.ok(/AI-GENERATED PRODUCT DEMO VOICE/.test(rows[0].innerHTML), 'the demo is labelled as AI');
  els['play-icon-p1'] = Object.assign(fakeEl(), { closest: () => null });
  els['play-icon-p1'].textContent = 'play_arrow';
  app.playProjectAudio('p1');
  assert.strictEqual(spoken.length, 1, 'the labelled sample demo may still speak');
});

test('saving a recording needs the own-voice declaration', async () => {
  const { app, els, sandbox, toasts } = boot(realProfile([noAudio]));
  els['audio-own-voice'] = Object.assign(fakeEl(), { checked: false });
  let saved = 0;
  sandbox.swapikiStore.updateProjectAudio = () => { saved++; };
  await app.saveRecordedAudio();
  assert.strictEqual(saved, 0, 'nothing is saved without the declaration');
  assert.ok(toasts.some(t => /own live voice/i.test(t)));
});

test('the declaration and the report reason are in the page and on the server', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('id="audio-own-voice"'), 'the recording screen has the declaration');
  assert.ok(/AI voice, voice cloning or text-to-speech/.test(html));
  assert.ok(html.includes('value="ai_voice"'), 'a visitor can report an AI voice');
  const server = fs.readFileSync(path.join(root, 'functions', 'api', 'report-profile.js'), 'utf8');
  assert.ok(/"ai_voice"/.test(server), 'the server accepts that reason');
});

test('opening the recording screen clears the declaration', () => {
  const { app, els } = boot(realProfile([noAudio]));
  els['audio-own-voice'] = Object.assign(fakeEl(), { checked: true });
  try { app.openAudioModal('p9'); } catch (e) { /* the engine stub may not cover every call */ }
  assert.strictEqual(els['audio-own-voice'].checked, false, 'each attempt starts unticked');
});
