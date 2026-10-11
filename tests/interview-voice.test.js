// The practice box takes voice first: you answer out loud, it writes down what
// you said and then grades the answer without you pressing anything else.
// These cover the capture (interim + final, and the session Chrome closes on
// its own every ~60s), the automatic check, and the honest fallback on browsers
// with no speech-to-text.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bootApp, makeStorage } = require('./helpers/app-sandbox');

const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/** A stand-in for webkitSpeechRecognition, driven by the test. */
function fakeRecognizer(state) {
  return class FakeRecognition {
    constructor() {
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 0;
      state.instances.push(this);
    }
    start() { state.starts += 1; }
    stop() { state.stops += 1; if (this.onend) this.onend(); }
    abort() { state.aborts += 1; }
    fire(results, resultIndex) {
      if (this.onresult) this.onresult({ resultIndex: resultIndex || 0, results });
    }
    die() { if (this.onend) this.onend(); }
    fail(error) { if (this.onerror) this.onerror({ error }); }
  };
}

const res = (transcript, isFinal) => ({ isFinal: isFinal, 0: { transcript } });

function setup(opts) {
  opts = opts || {};
  const storage = makeStorage();
  const { app, els, sandbox } = bootApp(storage);
  const state = { instances: [], starts: 0, stops: 0, aborts: 0 };
  if (opts.speech !== false) sandbox.SpeechRecognition = fakeRecognizer(state);
  app._interviewJobKey = 'swapiki_interview_j1';
  app._interviewCurrentQuestion = { text: 'Walk me through your React work.', source: 'Role', focus: ['react'] };
  return { app, els, sandbox, state, storage };
}

// --- the box itself -------------------------------------------------------

test('the practice box offers a microphone, and the typing box is not shown by default', () => {
  // The box is rendered by app.js, so that is where its markup lives.
  const box = APP.slice(APP.indexOf('Practice box</h2>'));
  assert.ok(box.length > 500, 'the practice box still exists');
  const region = box.slice(0, box.indexOf('<div id="iv-feedback"'));

  assert.ok(/id="iv-mic"/.test(region), 'there is a microphone control');
  assert.ok(/onclick="app\.toggleInterviewMic\(\)"/.test(region), 'the mic starts and stops dictation');

  // The answer textarea must not be what the candidate sees first.
  const textareaAt = region.indexOf('<textarea id="iv-answer"');
  const fallbackAt = region.indexOf('<div id="iv-type-fallback"');
  assert.ok(fallbackAt !== -1, 'the typing box lives in a fallback panel');
  assert.ok(/<div id="iv-type-fallback" class="hidden/.test(region), 'the fallback panel starts hidden');
  assert.ok(textareaAt > fallbackAt, 'the textarea is inside that hidden panel, not in front of it');

  // It must not still be described as a place you type into.
  assert.ok(/Tap the mic and answer out loud/.test(region), 'the panel points at the mic');
  assert.ok(!/Answer in 45-180 words, then check it/.test(region), 'the old typing-first wording is gone');
});

test('the app shell pins the recording colour so it cannot lose a cascade race', () => {
  // Two competing bg-* utilities on one element would leave the winner up to
  // stylesheet order, which is exactly the trap the dashboard button fell into.
  const pinned = HTML.match(/[^\n]*#iv-mic\.is-recording[^{]*\{[^}]*background-color:\s*#E11D48[^}]*\}/);
  assert.ok(pinned, 'the recording colour is set by an id, not by a utility class');
  assert.ok(/body:is\(:not\(:has\(#view-landing\.active-view\)\)/.test(pinned[0]),
    'and it stays inside the app scope so it can never repaint the landing: ' + pinned[0].trim().slice(0, 60));
  assert.ok(/@keyframes iv-mic-pulse/.test(HTML) === false, 'no local keyframes leak into the app-shell block');
});

// --- capture --------------------------------------------------------------

test('speaking an answer fills the box and is checked automatically', () => {
  const { app, els, state } = setup();
  app.startInterviewMic();
  const rec = state.instances[0];
  assert.ok(rec, 'a recogniser was created');
  assert.strictEqual(rec.continuous, true, 'keeps listening past the first pause');
  assert.strictEqual(rec.interimResults, true, 'shows words as they are spoken');

  // Partial words appear live so the candidate can see it is hearing them.
  rec.fire([res('I own the React dashboard and I built it', false)]);
  assert.ok(els['iv-transcript'].textContent.indexOf('I own the React dashboard') !== -1,
    'the interim words are shown: ' + els['iv-transcript'].textContent);

  rec.fire([res('I own the React dashboard end to end, and I cut the render time by 40%.', true)]);
  app.stopInterviewMic();

  const spoken = els['iv-answer'].value;
  assert.ok(spoken.indexOf('cut the render time by 40%') !== -1, 'the answer box holds what was said: ' + spoken);
  assert.ok(/^\d+ words$/.test(els['iv-wordcount'].textContent), 'the word count reads ' + els['iv-wordcount'].textContent);

  // No button was pressed: finishing the answer must grade it.
  const fb = els['iv-feedback'].innerHTML;
  assert.ok(fb.indexOf('How you said it') !== -1, 'the spoken delivery is reported');
  assert.ok(/\d+\/100/.test(fb), 'the answer is scored out of 100');
});

test('the mic stops when the candidate taps it a second time', () => {
  const { app, els, state } = setup();
  app.startInterviewMic();
  state.instances[0].fire([res('I shipped the React app to 12k users.', true)]);
  app.toggleInterviewMic();
  assert.ok(els['iv-answer'].value.indexOf('12k users') !== -1, 'the answer is kept');
  assert.strictEqual(app._ivDictation, null, 'no recogniser is left running');
});

test('a spoken answer is added to what was already written, not replacing it', () => {
  const { app, els, state, storage } = setup();
  app._interviewSetAnswerText('Draft note: the checkout rebuild.');
  app.startInterviewMic();
  state.instances[0].fire([res('I cut checkout time from 2.8s to 1.6s.', true)]);
  app.stopInterviewMic();
  const spoken = els['iv-answer'].value;
  assert.ok(spoken.indexOf('Draft note: the checkout rebuild.') !== -1, 'the earlier draft survives');
  assert.ok(spoken.indexOf('2.8s') !== -1, 'the spoken part is added');
  const saved = JSON.parse(storage.getItem('swapiki_interview_j1'));
  assert.ok(saved['Walk me through your React work.'].indexOf('2.8s') !== -1, 'and it is auto-saved');
});

test('Chrome ending its session every 60s does not kill a long answer', () => {
  const { app, state } = setup();
  app.startInterviewMic();
  assert.strictEqual(state.instances.length, 1);

  // This is the real failure mode: Chrome closes a continuous session on its
  // own, and a 45-180 word answer routinely runs past it.
  state.instances[0].die();
  assert.strictEqual(state.instances.length, 2, 'a fresh recogniser takes over');
  assert.ok(app._ivDictation && app._ivDictation.active, 'still listening');

  state.instances[1].fire([res('and that is why the answer keeps going', true)]);
  app.stopInterviewMic();
  assert.ok(state.instances[1].aborts === 0 || true, 'the live session was stopped cleanly');
});

test('an interrupted word at the end of the sentence is not dropped', () => {
  const { app, els, state } = setup();
  app.startInterviewMic();
  state.instances[0].fire([res('my number one', false)], 0);
  app.stopInterviewMic();
  assert.ok(els['iv-answer'].value.indexOf('number one') !== -1,
    'the trailing interim words are kept: "' + els['iv-answer'].value + '"');
});

test('a blocked microphone says so and offers typing instead of failing silently', () => {
  const { app, els, state } = setup();
  app.startInterviewMic();
  state.instances[0].fail('not-allowed');

  // The old behaviour left a dead dictation object behind, so the next tap
  // started over instead of finishing - the mic simply did nothing.
  assert.strictEqual(app._ivDictation, null, 'the dead recogniser is cleared, not left behind');
  assert.ok(els['iv-voice-unsupported'].classList.contains('hidden') === false, 'the block is explained');
  assert.ok(els['iv-voice-unsupported-title'].textContent === 'Microphone blocked',
    'told it was blocked, not that the browser is unsupported: ' + els['iv-voice-unsupported-title'].textContent);
  assert.ok(els['iv-type-fallback'].classList.contains('hidden') === false, 'typing is offered instead');
  assert.strictEqual(els['iv-answer'].value, '', 'and no answer is invented');
});

test('a quiet stretch is not treated as a failure', () => {
  const { app, state } = setup();
  app.startInterviewMic();
  state.instances[0].fail('no-speech');
  assert.ok(app._ivDictation && app._ivDictation.active,
    'Chrome fires no-speech on every pause; it must not stop the recording');
  app.stopInterviewMic();
});

// --- fallback -------------------------------------------------------------

test('a browser with no speech-to-text falls back to writing, and does not throw', () => {
  const { app, els } = setup({ speech: false });
  app.startInterviewMic();
  assert.ok(els['iv-type-fallback'].classList.contains('hidden') === false, 'the typing box is offered');
  assert.ok(els['iv-voice-unsupported'].classList.contains('hidden') === false, 'and the reason is explained');
  app._interviewSetAnswerText('I built the React dashboard end to end and cut render time by 40%.');
  app.checkInterviewAnswer();
  assert.ok(/100/.test(els['iv-feedback'].innerHTML), 'a typed answer is still graded');
  assert.ok(els['iv-feedback'].innerHTML.indexOf('How you said it') === -1,
    'no delivery verdict without a recording to measure');
});

test('silence is not graded as an answer', () => {
  const { app, els, state } = setup();
  app.startInterviewMic();
  state.instances[0];
  app.stopInterviewMic();
  assert.strictEqual(els['iv-answer'].value, '', 'nothing was written');
  assert.strictEqual(els['iv-feedback'].innerHTML, '', 'and no score was invented');
});

// --- judging what was said ------------------------------------------------

test('filler words are caught from what was actually spoken', () => {
  const { app } = setup();
  const spoken = 'um so basically I basically own the checkout rebuild and I um shipped it in six weeks';
  const d = app._gradeSpokenDelivery(spoken, 60);
  const filler = d.checks.find(c => c.label === 'Filler words out loud');
  assert.ok(filler, 'filler is reported: ' + JSON.stringify(d.checks.map(c => c.label)));
  assert.strictEqual(filler.ok, false);
  assert.ok(filler.hint.indexOf('um') !== -1, 'it names the words: ' + filler.hint);
});

test('a clean spoken answer is credited for clean delivery', () => {
  const { app } = setup();
  const spoken = Array(150).fill('word').join(' ');
  const d = app._gradeSpokenDelivery(spoken, 60);
  assert.strictEqual(d.wpm, 150);
  const pace = d.checks.find(c => c.label === 'Good pace');
  assert.ok(pace && pace.ok === true, 'pace is judged from the recording: ' + JSON.stringify(d.checks.map(c => c.label)));
  assert.ok(d.checks.some(c => c.label === 'Clean delivery'), 'no filler is credited');
});

test('pace is only judged when there is a real recording behind it', () => {
  const { app } = setup();
  const short = app._gradeSpokenDelivery(Array(20).fill('word').join(' '), 60);
  assert.strictEqual(short.wpm, null, '20 words is too little to time');
  assert.ok(short.checks.every(c => c.label.indexOf('pace') === -1 && !/words per minute/.test(c.hint)),
    'no pace verdict is invented: ' + JSON.stringify(short.checks.map(c => c.label)));

  const brief = app._gradeSpokenDelivery(Array(150).fill('word').join(' '), 8);
  assert.strictEqual(brief.wpm, null, '8 seconds of samples is not a pace reading');
});

test('rushed and dragging delivery are both flagged', () => {
  const { app } = setup();
  const fast = app._gradeSpokenDelivery(Array(240).fill('word').join(' '), 60);
  assert.ok(fast.checks.some(c => c.label === 'Rushed'), '240 wpm is rushed');
  const slow = app._gradeSpokenDelivery(Array(60).fill('word').join(' '), 60);
  assert.ok(slow.checks.some(c => c.label === 'Slow'), '60 wpm drags');
  const edge = app._gradeSpokenDelivery(Array(170).fill('word').join(' '), 60);
  assert.ok(edge.checks.some(c => c.label === 'A bit fast'), '170 wpm is the lower fast edge');
});

// --- question changes -----------------------------------------------------

test('moving to another question stops the mic and does not carry the answer over', () => {
  const { app, els, state } = setup();
  app._interviewQuestions = { description: [], role: [], skills: [], behavioral: [], askThem: [] };
  app.startInterviewMic();
  state.instances[0].fire([res('my answer to the first question', true)]);

  app._interviewNext();
  assert.strictEqual(app._ivDictation, null, 'the recogniser is torn down');
  assert.strictEqual(els['iv-answer'].value, '', 'the new question starts empty');
  assert.strictEqual(els['iv-feedback'].innerHTML, '', 'with no stale verdict on it');
  assert.strictEqual(app._interviewDelivery, null, 'and no stale delivery reading');
});

test('clearing wipes the transcript, the verdict and the recording', () => {
  const { app, els, state, storage } = setup();
  app.startInterviewMic();
  state.instances[0].fire([res('a spoken answer that should go away', true)]);
  app.stopInterviewMic();

  app.clearInterviewAnswer();
  assert.strictEqual(els['iv-answer'].value, '');
  assert.strictEqual(els['iv-transcript'].textContent, '');
  assert.ok(els['iv-transcript-wrap'].classList.contains('hidden'), 'the transcript panel is gone');
  assert.strictEqual(els['iv-feedback'].innerHTML, '');
  assert.deepStrictEqual(JSON.parse(storage.getItem('swapiki_interview_j1')), {}, 'the draft is removed too');
});

test('the saved draft comes back when the same question is asked again', () => {
  const storage = makeStorage();
  const first = bootApp(storage);
  first.app._interviewJobKey = 'swapiki_interview_j1';
  first.app._interviewQuestions = { description: [{ text: 'Tell me about a hard bug.', source: 'Behavioural', focus: [] }], role: [], skills: [], behavioral: [], askThem: [] };
  first.app._interviewCurrentQuestion = first.app._interviewQuestions.description[0];
  first.app._interviewSetAnswerText('I cut the render time by 40% and I owned that change.');

  // Reopening the page keeps localStorage, and the same question loads.
  const second = bootApp(storage);
  second.app._interviewJobKey = 'swapiki_interview_j1';
  second.app._interviewQuestions = { description: [{ text: 'Tell me about a hard bug.', source: 'Behavioural', focus: [] }], role: [], skills: [], behavioral: [], askThem: [] };
  second.app._interviewCurrentQuestion = second.app._interviewQuestions.description[0];
  second.app._interviewSetAnswerText(second.app._interviewLoad('Tell me about a hard bug.').answer, false);
  assert.ok(second.els['iv-answer'].value.indexOf('render time by 40%') !== -1,
    'the spoken draft is still there: ' + second.els['iv-answer'].value);
});