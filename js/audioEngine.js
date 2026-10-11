// Swapiki Audio Engine - Real-time browser audio recording & dynamic visualizer
// Also hosts the anti-fraud "live recording" layer:
//
//   1. Live microphone - audio must come from a real getUserMedia stream.
//      Synthetic/demo recordings never set this flag.
//   2. Spoken code check - every attempt mints a random 3-word code that the
//      candidate must read aloud. The browser's speech recogniser transcribes the
//      recording and we require the code words to actually appear in it, so a clip
//      recorded minutes or days ago cannot satisfy a code that did not exist when
//      it was recorded.
//
// What this layer deliberately does NOT do is claim identity. An earlier version
// compared MFCC mean/std signatures against an enrolled "voiceprint" using a
// hardcoded 0.80 cosine threshold, and showed recruiters a "Voice verified" badge.
// That was wrong: MFCC means describe the phonetics of the sentence far more than
// the speaker, the threshold was never calibrated against a single real impostor,
// and the tests only compared toy vectors. It has been deleted, not parked.
//
// The code-word/ASR helpers are pure and Node-requireable
// (see tests/voice-verification.test.js).

// ---------------------------------------------------------------------------
// Spoken-code verification - pure functions, no DOM/browser dependencies
// ---------------------------------------------------------------------------

// Anti-replay: every phrase is unique to (attempt, name, date and a random
// 3-word spoken code). A pre-recorded clip can never contain a code minted after
// it was recorded, and a cloned voice cannot know the words ahead of time.
const CHALLENGE_TEMPLATES = [
  'Today is {date}, I am {name}, and I am recording this live voice check on Swapiki. Verification code: {code}.',
  'My name is {name}. I recorded this proof walkthrough live on Swapiki on {date}. Verification code: {code}.',
  '{name} here, speaking to you live on {date}. Everything on this profile is my own work. Verification code: {code}.'
];

// Word codes, not letter/number codes. Speech recognisers transcribe ordinary
// English words far more reliably than spoken letter pairs: "K 7 X B" lands
// somewhere between "kay seven ex bee" and "kasey sex ex bee", and that ambiguity
// would reject honest candidates, which is the one failure mode a verification
// step must not have. Short, phonetically distinct, easy to say clearly.
const CODE_WORDS = [
  'anchor', 'autumn', 'badge', 'bamboo', 'beacon', 'bishop', 'boulder', 'brave',
  'bronze', 'cabin', 'cactus', 'candle', 'canvas', 'cedar', 'cobalt', 'comet',
  'copper', 'coral', 'crane', 'crimson', 'delta', 'drift', 'ember', 'falcon',
  'feather', 'fjord', 'forest', 'garnet', 'glacier', 'harbor', 'harvest',
  'hazel', 'heron', 'hickory', 'indigo', 'island', 'ivory', 'jasper', 'jungle',
  'kayak', 'lantern', 'lagoon', 'lichen', 'lotus', 'maple', 'marble', 'meadow',
  'mosaic', 'basalt', 'nickel', 'nimbus', 'oasis', 'otter', 'pebble', 'pepper',
  'pillar', 'planet', 'plume', 'prairie', 'quartz', 'quiver', 'rapid', 'raven',
  'ribbon', 'river', 'rocket', 'saffron', 'salmon', 'shadow', 'silver',
  'summit', 'thunder', 'timber', 'topaz', 'tulip', 'tundra', 'velvet', 'walnut',
  'willow', 'yarrow', 'zenith'
];

function randomIndex(max) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = crypto.getRandomValues(new Uint8Array(1));
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function generateSecurityCode(wordCount) {
  const n = wordCount || 3;
  const picked = [];
  for (let i = 0; i < n; i++) {
    let word = CODE_WORDS[randomIndex(CODE_WORDS.length)];
    while (picked.indexOf(word) !== -1) word = CODE_WORDS[randomIndex(CODE_WORDS.length)];
    picked.push(word);
  }
  return picked.join(' ');
}

function formatChallengeDate(now) {
  const d = now.getDate().toString().padStart(2, '0');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function generateChallengePhrase(name, now, code) {
  const date = now || new Date();
  const idx = randomIndex(CHALLENGE_TEMPLATES.length);
  const securityCode = code || generateSecurityCode(3);
  const template = CHALLENGE_TEMPLATES[idx];
  return template
    .replace('{name}', (name || 'the candidate').trim())
    .replace('{date}', formatChallengeDate(date))
    .replace('{code}', securityCode);
}

function generateSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

// Lowercase, strip punctuation, collapse whitespace. ASR returns prose
// ("verification code: amber harbor lantern.") so both sides are normalised
// before comparison.
function normalizeSpokenText(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein distance for short (word-sized) strings.
function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[n];
}

// A spoken word counts as the code word on an exact match, or within one edit for
// longer words ("harbour" ~= "harbor", "marbal" ~= "marble"). Words under five
// letters demand an exact match: fuzzy-matching a short word accepts wrong words
// often enough to stop being evidence.
function wordMatches(token, word) {
  if (token === word) return true;
  if (word.length < 5) return false;
  return editDistance(token, word) <= 1;
}

/**
 * Decides whether a transcript proves the candidate spoke this attempt's code.
 *
 * Every code word must be present. There is no partial credit: the words are the
 * only unpredictable part of the phrase, so one of three is not proof of
 * anything.
 *
 * Returns { verified, matched, missing, reason } where reason is
 * 'ok' | 'unsupported' | 'no_code' | 'no_transcript' | 'code_missing'.
 */
function verifySpokenCode(transcript, code, opts) {
  const speechSupported = opts && typeof opts.speechSupported === 'boolean'
    ? opts.speechSupported
    : true;

  if (!speechSupported) {
    return { verified: false, matched: [], missing: [], reason: 'unsupported' };
  }

  const words = normalizeSpokenText(code).split(' ').filter(Boolean);
  if (words.length === 0) {
    return { verified: false, matched: [], missing: [], reason: 'no_code' };
  }

  const tokens = normalizeSpokenText(transcript).split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return { verified: false, matched: [], missing: words, reason: 'no_transcript' };
  }

  const matched = [];
  const missing = [];
  for (const word of words) {
    if (tokens.some((token) => wordMatches(token, word))) matched.push(word);
    else missing.push(word);
  }

  return {
    verified: missing.length === 0,
    matched,
    missing,
    reason: missing.length === 0 ? 'ok' : 'code_missing'
  };
}

// BIG NOTE: the class below is instantiated in the browser and exposed on
// `window.swapikiAudioEngine`.
class SwapikiAudioEngine {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.filterNode = null;
    this.audioFilterPreset = 'studio'; // 'studio', 'warm', 'noise_suppress'
    this.animFrameId = null;
    this.isRecording = false;
    this.isPaused = false;
    this.secondsRecorded = 0;
    this.timerInterval = null;
    this.minDurationSeconds = 30;
    this.maxDurationSeconds = 120; // 2 minutes MVP hard limit
    this.recordedBlob = null;
    this.recordedBlobUrl = null;

    // Anti-fraud state (see beginVerificationChallenge / markLiveRecording).
    this.verification = null;
    this.liveMic = false;

    // Spoken-code verification (see startSpeechRecognition / verifySpokenChallenge).
    this.speechRecognition = null;
    this.speech = {
      supported: null, // null = not probed yet
      active: false,
      finalText: '',
      interimText: '',
      error: null
    };
  }

  setAudioFilterPreset(presetName) {
    this.audioFilterPreset = presetName;
    if (this.filterNode && this.audioContext) {
      if (presetName === 'studio') {
        this.filterNode.type = 'peaking';
        this.filterNode.frequency.value = 3000;
        this.filterNode.Q.value = 1;
        this.filterNode.gain.value = 4; // High clarity boost
      } else if (presetName === 'warm') {
        this.filterNode.type = 'lowshelf';
        this.filterNode.frequency.value = 250;
        this.filterNode.gain.value = 6; // Vocal warmth boost
      } else if (presetName === 'noise_suppress') {
        this.filterNode.type = 'highpass';
        this.filterNode.frequency.value = 120; // Cut low-frequency hum & fan noise
        this.filterNode.Q.value = 1;
        this.filterNode.gain.value = 0;
      }
    }
  }

  /**
   * Begins a fresh anti-fraud attempt. Returns the challenge phrase that the
   * candidate MUST read aloud once recording starts. A new random session id and
   * a new random 3-word code are minted every time this is called (i.e. every
   * time the audio studio opens), so a stored clip from a past attempt can never
   * satisfy it.
   */
  beginVerificationChallenge(name) {
    this.discardSpeech();
    this.liveMic = false;
    this.recordedBlob = null;
    this.recordedBlobUrl = null;
    this.speech = {
      supported: this.isSpeechSupported(),
      active: false,
      finalText: '',
      interimText: '',
      error: null
    };
    const code = generateSecurityCode(3);
    this.verification = {
      sessionId: generateSessionId(),
      code,
      phrase: generateChallengePhrase(name, null, code),
      shownAt: new Date().toISOString(),
      status: 'pending'
    };
    return this.verification.phrase;
  }

  getChallengeInfo() {
    return this.verification || null;
  }

  /** True only when audio was actually captured from a live getUserMedia stream. */
  wasLiveMic() {
    return !!this.liveMic;
  }

  getRecordedBlob() {
    return this.recordedBlob;
  }

  // Called the moment a real microphone stream starts - synthetic/demo
  // recordings never set this, so they can never be marked confirmed.
  markLiveRecording() {
    this.liveMic = true;
    if (!this.verification) return;
    this.verification.recordStartedAt = new Date().toISOString();
    this.verification.mimeType = (this.mediaRecorder && this.mediaRecorder.mimeType) || 'unknown';
    let settings = {};
    try {
      if (this.stream && this.stream.getAudioTracks().length) {
        settings = this.stream.getAudioTracks()[0].getSettings() || {};
      }
    } catch (e) { /* getSettings not supported in older browsers */ }
    this.verification.trackSettings = {
      echoCancellation: !!settings.echoCancellation,
      noiseSuppression: !!settings.noiseSuppression,
      autoGainControl: !!settings.autoGainControl
    };
    this.verification.singleSession = true;
  }

  // -------------------------------------------------------------------------
  // Speech recognition (Web Speech API) - Chrome and Edge today
  // -------------------------------------------------------------------------

  getSpeechRecognitionCtor() {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  /**
   * Whether this browser can check the spoken code. Safari and Firefox have no
   * Web Speech implementation, so recordings there are still saved but cannot be
   * confirmed - we say so rather than quietly passing them.
   */
  isSpeechSupported() {
    if (this.speech.supported != null) return this.speech.supported;
    this.speech.supported = !!this.getSpeechRecognitionCtor();
    return this.speech.supported;
  }

  startSpeechRecognition() {
    this.discardSpeech();
    this.speech = {
      supported: this.isSpeechSupported(),
      active: true,
      finalText: '',
      interimText: '',
      error: null
    };
    if (!this.speech.supported) return false;
    this.spawnSpeechRecognition();
    return true;
  }

  spawnSpeechRecognition() {
    if (!this.speech.active) return;
    const Ctor = this.getSpeechRecognitionCtor();
    if (!Ctor) {
      this.speech.supported = false;
      this.speech.active = false;
      return;
    }

    let rec;
    try {
      rec = new Ctor();
    } catch (e) {
      this.speech.error = 'construct-failed';
      this.speech.active = false;
      return;
    }

    rec.lang = 'en-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result && result[0];
        const text = alt && alt.transcript ? alt.transcript : '';
        if (result.isFinal) this.speech.finalText += ' ' + text;
        else interim += ' ' + text;
      }
      this.speech.interimText = interim;
      if (this.verification) this.verification.transcriptSoFar = this.getSpeechTranscript();
    };

    rec.onerror = (event) => {
      this.speech.error = (event && event.error) || 'unknown';
      // Permission and service errors are terminal. Retrying just repeats them.
      if (this.speech.error === 'not-allowed' || this.speech.error === 'service-not-allowed') {
        this.speech.supported = false;
        this.speech.active = false;
      }
    };

    rec.onend = () => {
      if (this.speechRecognition === rec) this.speechRecognition = null;
      // Chrome ends a continuous session on its own every ~60s and a 2-minute
      // recording is normal here, so start another and keep accumulating.
      if (this.speech.active && this.isRecording) this.spawnSpeechRecognition();
    };

    this.speechRecognition = rec;
    try {
      rec.start();
    } catch (e) { /* already started; onend will restart it */ }
  }

  /**
   * Stop recognising at the end of a real recording but leave the instance alive
   * so its last result can still finalise (the code is spoken at the very end of
   * the phrase, which is exactly where interim results live).
   */
  finishSpeech() {
    this.speech.active = false;
    const rec = this.speechRecognition;
    if (rec) {
      try { rec.stop(); } catch (e) { /* not running */ }
    }
  }

  /** Tear recognition down immediately, discarding anything still in flight. */
  discardSpeech() {
    this.speech.active = false;
    const rec = this.speechRecognition;
    this.speechRecognition = null;
    if (rec) {
      try { rec.abort(); } catch (e) { /* not running */ }
    }
  }

  getSpeechTranscript() {
    return [this.speech.finalText, this.speech.interimText].join(' ').trim();
  }

  /**
   * Waits briefly for the recogniser to emit its trailing result before the
   * transcript is read. Resolves with whatever text we have either way, so a
   * slow or silent recogniser can never hang the pipeline.
   */
  settleSpeech(maxWaitMs) {
    const rec = this.speechRecognition;
    if (!rec) return Promise.resolve(this.getSpeechTranscript());
    const wait = maxWaitMs == null ? 1500 : maxWaitMs;
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(this.getSpeechTranscript());
      };
      const timer = setTimeout(finish, wait);
      if (typeof rec.addEventListener === 'function') {
        rec.addEventListener('end', finish, { once: true });
      }
    });
  }

  /**
   * The whole claim: did this recording actually speak this attempt's code?
   * Returns { verified, matched, missing, reason, transcript, speechSupported }.
   */
  async verifySpokenChallenge() {
    const transcript = await this.settleSpeech();
    const challenge = this.getChallengeInfo();
    const result = verifySpokenCode(transcript, challenge ? challenge.code : '', {
      speechSupported: this.isSpeechSupported()
    });
    return Object.assign({ transcript }, result);
  }

  async startRecording(canvasElement, timeUpdateCallback, onFinishCallback) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];
      this.secondsRecorded = 0;
      this.isRecording = true;
      this.isPaused = false;
      this.onTimeUpdate = timeUpdateCallback;

      this.markLiveRecording();
      this.startSpeechRecognition();

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.recordedBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.recordedBlobUrl = URL.createObjectURL(this.recordedBlob);
        if (onFinishCallback) {
          onFinishCallback(this.recordedBlobUrl, this.getFormattedDuration(), this.secondsRecorded >= this.minDurationSeconds);
        }
      };

      this.mediaRecorder.start();

      // Audio Context setup with Equalizer Filter & Analyser
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.filterNode = this.audioContext.createBiquadFilter();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;

      this.setAudioFilterPreset(this.audioFilterPreset);

      source.connect(this.filterNode);
      this.filterNode.connect(this.analyser);

      if (canvasElement) {
        this.drawWaveform(canvasElement);
      }

      // Timer
      this.timerInterval = setInterval(() => {
        this.secondsRecorded++;
        if (this.onTimeUpdate) {
          this.onTimeUpdate(this.secondsRecorded, this.getFormattedDuration());
        }
        if (this.secondsRecorded >= this.maxDurationSeconds) {
          this.stopRecording();
        }
      }, 1000);

      return true;
    } catch (err) {
      console.error("Microphone permission denied or not available:", err);
      this.isRecording = false;
      this.isPaused = false;
      this.liveMic = false;
      this.discardSpeech();
      this.lastError = err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Microphone is not available in this browser.';
      return false;
    }
  }

  startSyntheticRecording(canvasElement, timeUpdateCallback, onFinishCallback) {
    this.isRecording = true;
    this.isPaused = false;
    this.secondsRecorded = 0;
    this.onTimeUpdate = timeUpdateCallback;

    // Synthetic/demo recordings are NOT live - never mark them confirmed, and
    // never let a recogniser run over generated audio.
    this.liveMic = false;
    this.discardSpeech();

    // Animate canvas synthetically
    const ctx = canvasElement ? canvasElement.getContext('2d') : null;
    const raf = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);
    const animateSynth = () => {
      if (!this.isRecording) return;
      if (ctx && canvasElement) {
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        const bars = 24;
        const barWidth = canvasElement.width / bars - 3;
        for (let i = 0; i < bars; i++) {
          const h = Math.random() * (canvasElement.height * 0.8) + 10;
          ctx.fillStyle = '#2170e4';
          ctx.fillRect(i * (barWidth + 3), (canvasElement.height - h) / 2, barWidth, h);
        }
      }
      this.animFrameId = raf(animateSynth);
    };
    animateSynth();

    this.timerInterval = setInterval(() => {
      this.secondsRecorded++;
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.secondsRecorded, this.getFormattedDuration());
      }
      if (this.secondsRecorded >= this.maxDurationSeconds) {
        this.stopRecording();
      }
    }, 1000);

    this.onSyntheticFinish = onFinishCallback;
    return true;
  }

  pauseRecording() {
    if (!this.isRecording || this.isPaused) return false;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
    this.isPaused = true;
    if (this.timerInterval) clearInterval(this.timerInterval);
    return true;
  }

  resumeRecording() {
    if (!this.isRecording || !this.isPaused) return false;
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
    this.isPaused = false;
    this.timerInterval = setInterval(() => {
      this.secondsRecorded++;
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.secondsRecorded, this.getFormattedDuration());
      }
      if (this.secondsRecorded >= this.maxDurationSeconds) {
        this.stopRecording();
      }
    }, 1000);
    return true;
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.animFrameId) {
      try {
        if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.animFrameId);
      } catch (e) { /* older browsers / non-browser runtimes */ }
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.finishSpeech();
      this.mediaRecorder.stop();
    } else if (this.onSyntheticFinish) {
      // Synthetic fallback finish - no real audio was produced.
      this.discardSpeech();
      this.recordedBlob = null;
      this.recordedBlobUrl = null;
      const durationStr = this.getFormattedDuration();
      this.onSyntheticFinish(null, durationStr, this.secondsRecorded >= this.minDurationSeconds);
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
  }

  drawWaveform(canvasElement) {
    if (!canvasElement || !this.analyser) return;
    const ctx = canvasElement.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      if (!this.isRecording) return;
      this.animFrameId = requestAnimationFrame(render);
      this.analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      const barWidth = (canvasElement.width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvasElement.height;
        ctx.fillStyle = '#2170e4';
        ctx.fillRect(x, canvasElement.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };
    render();
  }

  getFormattedDuration() {
    const mins = Math.floor(this.secondsRecorded / 60);
    const secs = this.secondsRecorded % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

const verificationExports = {
  CHALLENGE_TEMPLATES,
  CODE_WORDS,
  generateChallengePhrase,
  generateSecurityCode,
  generateSessionId,
  normalizeSpokenText,
  editDistance,
  verifySpokenCode,
  SwapikiAudioEngine
};

// Expose SwapikiAudioEngine's consumer-facing methods (used by index.html/app.js)
// on the window singleton, mirroring the old `window.swapikiAudioEngine` API.
if (typeof module !== 'undefined' && module.exports) {
  verificationExports.SwapikiAudioEngine = SwapikiAudioEngine;
  module.exports = verificationExports;
}

if (typeof window !== 'undefined' && !window.swapikiAudioEngine) {
  window.swapikiAudioEngine = new SwapikiAudioEngine();
}
if (typeof globalThis !== 'undefined') {
  try { globalThis.swapikiVoice = verificationExports; } catch (e) { }
}
