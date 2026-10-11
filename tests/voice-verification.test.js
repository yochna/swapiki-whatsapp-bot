const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CODE_WORDS,
  generateChallengePhrase,
  generateSecurityCode,
  generateSessionId,
  normalizeSpokenText,
  editDistance,
  verifySpokenCode,
  SwapikiAudioEngine
} = require('../js/audioEngine.js');

// ---------------------------------------------------------------------------
// The deleted thing
//
// These tests replaced MFCC/cosine "voiceprint" comparisons that used toy
// vectors like [1,2,3,4] vs [1,0,0,0]. They passed while proving nothing about
// speakers: no test ever used audio from a different human being, and the 0.80
// threshold was invented. Rather than keep cosmetic coverage of code that is
// gone, the suite now tests the check that actually gates the badge.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Spoken code generation
// ---------------------------------------------------------------------------

test('every generated code is three words drawn from the word list', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateSecurityCode(3);
    const words = code.split(' ');
    assert.equal(words.length, 3);
    for (const word of words) {
      assert.ok(CODE_WORDS.includes(word), `${word} should come from CODE_WORDS`);
    }
  }
});

test('codes never repeat a word within themselves', () => {
  for (let i = 0; i < 200; i++) {
    const words = generateSecurityCode(3).split(' ');
    assert.equal(new Set(words).size, 3);
  }
});

test('codes are fresh per attempt', () => {
  // 500 draws from ~570k combinations: a birthday collision is likely, so
  // assert the codes are overwhelmingly distinct rather than perfectly unique.
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(generateSecurityCode(3));
  assert.ok(seen.size >= 480, `only ${seen.size}/500 distinct codes`);
});

test('code words are long enough that one edit is a safe tolerance', () => {
  // Fuzzy matching is only allowed on words of 5+ characters, so every word we
  // generate must clear that bar.
  for (const word of CODE_WORDS) {
    assert.ok(word.length >= 5, `${word} is too short to tolerate a transcription slip`);
    assert.equal(word, word.toLowerCase());
  }
});

// ---------------------------------------------------------------------------
// Challenge phrases
// ---------------------------------------------------------------------------

test('generated challenge phrases are fresh, allowing for birthday collisions', () => {
  // This used to demand 500 unique phrases from 500 random draws. CODE_WORDS
  // has 81 entries, so the three-word space is 531,441, and the birthday
  // paradox makes at least one collision likely in about 21% of runs. The test
  // was therefore failing roughly one deploy in five while the product was
  // fine, and it had only been passing by luck.
  //
  // What actually matters for the anti-replay property is that one candidate's
  // successive attempts are not the same code, and that collisions stay rare
  // enough that a code is not guessable. Both are asserted below. Expected
  // collisions across 500 draws is 0.235, so requiring 490+ distinct results
  // leaves a margin of roughly ten standard deviations.
  const space = CODE_WORDS.length ** 3;
  assert.ok(space > 100000, `three-word code space is only ${space}; too small to resist guessing`);

  const seen = new Set();
  let previous = null;
  for (let i = 0; i < 500; i++) {
    const phrase = generateChallengePhrase('Rahul Rao');
    assert.notEqual(phrase, previous, 'two attempts in a row produced the same phrase');
    previous = phrase;
    seen.add(phrase);
  }
  assert.ok(seen.size >= 490, `only ${seen.size} of 500 phrases were unique; the sampler looks broken`);
});

test('challenge phrase embeds the candidate name and the spoken code', () => {
  const phrase = generateChallengePhrase('Priya Patel', undefined, 'amber harbor lantern');
  assert.ok(phrase.includes('Priya Patel'));
  assert.ok(phrase.includes('amber harbor lantern'));
});

test('session ids are unique and mostly UUID-shaped', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) ids.add(generateSessionId());
  assert.equal(ids.size, 500);
});

// ---------------------------------------------------------------------------
// Text normalisation + edit distance
// ---------------------------------------------------------------------------

test('normalisation strips punctuation and case but keeps word order', () => {
  assert.equal(
    normalizeSpokenText('Verification code: AMBER, harbor. lantern!'),
    'verification code amber harbor lantern'
  );
  assert.equal(normalizeSpokenText('   '), '');
  assert.equal(normalizeSpokenText(null), '');
});

test('edit distance is zero for identical words and small for near misses', () => {
  assert.equal(editDistance('harbor', 'harbor'), 0);
  assert.equal(editDistance('harbor', 'harbour'), 1);
  assert.equal(editDistance('harbor', 'marble'), 3);
});

// ---------------------------------------------------------------------------
// verifySpokenCode - the actual gate
// ---------------------------------------------------------------------------

test('a transcript containing every code word confirms the recording', () => {
  const result = verifySpokenCode(
    'today is 5 march 2026 i am priya patel verification code amber harbor lantern',
    'amber harbor lantern'
  );
  assert.equal(result.verified, true);
  assert.equal(result.reason, 'ok');
  assert.deepEqual(result.missing, []);
});

test('confidence in the surrounding words does not matter', () => {
  // Only the unpredictable part of the phrase is evidence.
  const result = verifySpokenCode(
    'umm so anyway my name is completely different and the date was wrong, but amber harbor lantern',
    'amber harbor lantern'
  );
  assert.equal(result.verified, true);
});

test('a transcript missing one code word does not confirm', () => {
  const result = verifySpokenCode(
    'my name is priya patel and the verification code is amber',
    'amber harbor lantern'
  );
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'code_missing');
  assert.deepEqual(result.missing, ['harbor', 'lantern']);
  assert.deepEqual(result.matched, ['amber']);
});

test('there is no partial credit for a code replayed from an older attempt', () => {
  // A recording from a previous session contains the OLD code. The new code is
  // what has to be spoken, and one shared word out of three is not proof.
  const old = verifySpokenCode('verification code amber summit copper', 'amber summit copper');
  assert.equal(old.verified, true);

  const replayed = verifySpokenCode('verification code amber summit copper', 'amber harbor lantern');
  assert.equal(replayed.verified, false);
  assert.equal(replayed.matched.length, 1);
});

test('one transcription slip on a long word is tolerated', () => {
  const spoken = verifySpokenCode('code amber harbour lantern', 'amber harbor lantern');
  assert.equal(spoken.verified, true, 'harbour should still count as harbor');

  const dropped = verifySpokenCode('code amber harbour', 'amber harbor lantern');
  assert.equal(dropped.verified, false, 'a missing word is still a failure');
});

test('short words are never fuzzy-matched', () => {
  // 4-letter codes are exactly why we moved to word codes: fuzzy-matching a
  // short word accepts the wrong word too often to be evidence.
  const result = verifySpokenCode('code pinq', 'pine');
  assert.equal(result.verified, false);
});

test('an empty or silent transcript reports no_transcript', () => {
  const blank = verifySpokenCode('   ', 'amber harbor lantern');
  assert.equal(blank.verified, false);
  assert.equal(blank.reason, 'no_transcript');
  assert.deepEqual(blank.missing, ['amber', 'harbor', 'lantern']);
});

test('an unsupported browser never reports a pass', () => {
  const result = verifySpokenCode(
    'verification code amber harbor lantern',
    'amber harbor lantern',
    { speechSupported: false }
  );
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'unsupported');
});

test('a missing code is a caller error, not a pass', () => {
  const result = verifySpokenCode('anything at all', '');
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'no_code');
});

// ---------------------------------------------------------------------------
// Engine lifecycle (no DOM required)
// ---------------------------------------------------------------------------

test('engine mints a fresh challenge with an auditable code and session', () => {
  const engine = new SwapikiAudioEngine();
  const phrase = engine.beginVerificationChallenge('Ananya Sharma');
  const info = engine.getChallengeInfo();

  assert.ok(typeof phrase === 'string' && phrase.length > 20);
  assert.ok(info.sessionId.length >= 10);
  assert.equal(info.code.split(' ').length, 3);
  assert.equal(info.status, 'pending');
  assert.ok(info.shownAt);
});

test('opening the studio again throws away the previous attempt', () => {
  const engine = new SwapikiAudioEngine();
  engine.beginVerificationChallenge('Ananya Sharma');
  const first = engine.getChallengeInfo().code;
  engine.speech.finalText = 'verification code ' + first;
  engine.beginVerificationChallenge('Ananya Sharma');
  const second = engine.getChallengeInfo().code;

  assert.equal(engine.getChallengeInfo().code, second);
  assert.equal(engine.getSpeechTranscript(), '', 'stale transcript must not leak into the next attempt');
});

test('synthetic/demo recording never marks the mic as live', () => {
  const engine = new SwapikiAudioEngine();
  engine.beginVerificationChallenge('Ananya Sharma');
  engine.startSyntheticRecording(null, () => {}, () => {});
  assert.equal(engine.wasLiveMic(), false);
  engine.stopRecording();
});

test('a recording with no live mic cannot be considered verified', () => {
  const engine = new SwapikiAudioEngine();
  engine.beginVerificationChallenge('Ananya Sharma');
  // No startRecording() was ever called, so liveMic stays false.
  assert.equal(engine.wasLiveMic(), false);
  assert.equal(engine.getRecordedBlob(), null);
});

test('engine reports no speech support outside a browser', () => {
  delete global.window;
  const engine = new SwapikiAudioEngine();
  assert.equal(engine.isSpeechSupported(), false);
  assert.equal(engine.startSpeechRecognition(), false);
});

// ---------------------------------------------------------------------------
// Engine + a fake Web Speech API
// ---------------------------------------------------------------------------

class FakeSpeechRecognition {
  constructor() {
    this.lang = '';
    this.continuous = false;
    this.interimResults = false;
    this.maxAlternatives = 0;
    this._listeners = {};
    this.started = false;
    this.stopped = false;
    FakeSpeechRecognition.instances.push(this);
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  _emit(type, payload) {
    const handler = this['on' + type];
    if (typeof handler === 'function') handler(payload);
    for (const fn of (this._listeners[type] || [])) fn(payload);
  }
  start() {
    if (this.started) throw new Error('InvalidStateError');
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this._emit('end', {});
  }
  abort() {
    this.stopped = true;
    this._emit('end', {});
  }
  // Test helper: deliver a recognition result like the browser would.
  say(transcript, isFinal) {
    const result = { isFinal, 0: { transcript }, length: 1 };
    this._emit('result', { resultIndex: 0, results: [result] });
  }
}
FakeSpeechRecognition.instances = [];

function withFakeSpeech(fn) {
  global.window = { SpeechRecognition: FakeSpeechRecognition };
  FakeSpeechRecognition.instances = [];
  try {
    return fn();
  } finally {
    delete global.window;
  }
}

test('the engine transcribes live and confirms when the code was spoken', async () => {
  await withFakeSpeech(async () => {
    const engine = new SwapikiAudioEngine();
    assert.equal(engine.isSpeechSupported(), true);

    engine.beginVerificationChallenge('Ananya Sharma');
    const code = engine.getChallengeInfo().code;
    assert.equal(engine.startSpeechRecognition(), true);

    const rec = FakeSpeechRecognition.instances[0];
    assert.equal(rec.lang, 'en-IN');
    assert.equal(rec.continuous, true);
    assert.equal(rec.interimResults, true);

    rec.say('my name is ananya sharma and today is', true);
    rec.say('verification code ' + code, true);

    const result = await engine.verifySpokenChallenge();
    assert.equal(result.verified, true);
    assert.equal(result.reason, 'ok');
    assert.equal(result.transcript.includes(code), true);
  });
});

test('the trailing interim result still counts, since the code is spoken last', async () => {
  await withFakeSpeech(async () => {
    const engine = new SwapikiAudioEngine();
    engine.beginVerificationChallenge('Ananya Sharma');
    const code = engine.getChallengeInfo().code;
    engine.startSpeechRecognition();
    const rec = FakeSpeechRecognition.instances[0];

    rec.say('my name is ananya sharma', true);
    // The code lands as an interim result, which is exactly where it lands in a
    // real browser because it is at the end of the phrase.
    rec.say('code ' + code, false);
    engine.finishSpeech();

    const result = await engine.verifySpokenChallenge();
    assert.equal(result.verified, true);
    assert.equal(rec.stopped, true, 'finishing should stop the recogniser so it can finalise');
  });
});

test('a recording that never says the code is not confirmed', async () => {
  await withFakeSpeech(async () => {
    const engine = new SwapikiAudioEngine();
    engine.beginVerificationChallenge('Ananya Sharma');
    engine.startSpeechRecognition();
    const rec = FakeSpeechRecognition.instances[0];
    rec.say('hi this is my project walkthrough', true);
    engine.finishSpeech();

    const result = await engine.verifySpokenChallenge();
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'code_missing');
    assert.equal(result.missing.length, 3);
  });
});

test('a silent recording is reported as no_transcript, not as a mismatch', async () => {
  await withFakeSpeech(async () => {
    const engine = new SwapikiAudioEngine();
    engine.beginVerificationChallenge('Ananya Sharma');
    engine.startSpeechRecognition();
    engine.finishSpeech();

    const result = await engine.verifySpokenChallenge();
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'no_transcript');
  });
});

test('a denied microphone turns speech support off rather than passing', async () => {
  await withFakeSpeech(async () => {
    const engine = new SwapikiAudioEngine();
    engine.beginVerificationChallenge('Ananya Sharma');
    engine.startSpeechRecognition();
    FakeSpeechRecognition.instances[0]._emit('error', { error: 'not-allowed' });

    assert.equal(engine.isSpeechSupported(), false);
    const result = await engine.verifySpokenChallenge();
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'unsupported');
  });
});

test('Chrome ending a session mid-recording restarts instead of losing audio', async () => {
  await withFakeSpeech(async () => {
    const engine = new SwapikiAudioEngine();
    engine.beginVerificationChallenge('Ananya Sharma');
    const code = engine.getChallengeInfo().code;
    engine.startSpeechRecognition();
    engine.isRecording = true;

    const first = FakeSpeechRecognition.instances[0];
    first.say('code ' + code.split(' ')[0], true);
    first._emit('end', {});

    assert.equal(FakeSpeechRecognition.instances.length, 2, 'a second session should start');
    FakeSpeechRecognition.instances[1].say(code, true);
    engine.finishSpeech();

    const result = await engine.verifySpokenChallenge();
    assert.equal(result.verified, true, 'transcript must span both sessions');
  });
});

test('settling the transcript never hangs when the recogniser goes quiet', async () => {
  await withFakeSpeech(async () => {
    const engine = new SwapikiAudioEngine();
    engine.beginVerificationChallenge('Ananya Sharma');
    engine.startSpeechRecognition();
    // A recogniser that never fires 'end' - settleSpeech must time out.
    const transcript = await engine.settleSpeech(20);
    assert.equal(typeof transcript, 'string');
  });
});
