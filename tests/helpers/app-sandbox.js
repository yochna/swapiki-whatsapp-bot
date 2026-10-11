// Boots js/app.js in a minimal browser-ish sandbox for app-level unit tests.
// The pure js/githubMatch.js behaviour is covered separately; this helper is for
// the wiring in app.js, which is where the regressions actually lived.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const noop = () => {};

function fakeEl() {
  // A real classList, not a noop: the practice box shows and hides the mic
  // panel by class, so a stub that swallows add/remove makes "is it visible"
  // untestable and hides genuine breakage.
  const classes = new Set();
  const attributes = {};
  const el = {
    innerHTML: '', textContent: '', value: '', style: {}, attributes,
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: c => classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      _all: () => Array.from(classes)
    },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, appendChild: noop, remove: noop, focus: noop,
    scrollIntoView: noop, select: noop
  };
  el.setAttribute = (k, v) => { attributes[k] = v; };
  el.getAttribute = k => (Object.prototype.hasOwnProperty.call(attributes, k) ? attributes[k] : null);
  return el;
}

/** A localStorage stand-in that can be shared across "reloads". */
function makeStorage(initial) {
  const d = Object.assign({}, initial || {});
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
    removeItem: k => { delete d[k]; },
    _dump: () => d
  };
}

/**
 * Returns { app, els, storage, sandbox }. Pass the same `storage` object to a
 * second call to simulate a page reload that keeps localStorage.
 * `config` overrides window.SWAPIKI_CONFIG (e.g. a GitHub client ID).
 */
function bootApp(storage, config) {
  const store = storage || makeStorage();
  const els = {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    // Real URL/URLSearchParams, not stubs. app.js parses URLs (e.g. the
    // adminJobProvenance scheme check) and a missing global makes `new URL(...)`
    // throw a ReferenceError that a surrounding try/catch silently turns into
    // "no link" - so a test can pass for the wrong reason. Handing over the real
    // ones keeps the browser-parity this helper exists to provide.
    URL, URLSearchParams,
    localStorage: store,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    location: { hash: '', href: 'https://swapiki.com/', hostname: 'swapiki.com', pathname: '/' },
    document: {
      addEventListener: noop,
      getElementById: id => (els[id] = els[id] || fakeEl()),
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => fakeEl(), body: fakeEl(), head: fakeEl(),
      readyState: 'complete', documentElement: fakeEl()
    },
    performance: { now: () => 0 },
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
    requestIdleCallback: noop
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = noop;
  sandbox.window.location = sandbox.location;
  sandbox.window.open = () => {};
  sandbox.swapikiStore = {
    getProfile: () => ({
      name: 'Rahul', expertise: ['React'],
      projects: [{ title: 'Legacy CRM', role: 'Dev', tags: [], takeaways: [] }]
    }),
    // The real store exposes this, and the jobs admin calls it to turn a
    // username into a safe profile link. A stub store that omits it makes the
    // admin render crash for a reason that does not exist in the browser.
    formatNickname: nick => String(nick || '').toLowerCase().trim()
      .replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  };
  sandbox.SWAPIKI_CONFIG = Object.assign({ GITHUB_CLIENT_ID: '' }, config || {});
  vm.createContext(sandbox);
  const read = f => fs.readFileSync(path.join(__dirname, '..', '..', 'js', f), 'utf8');
  vm.runInContext(read('githubMatch.js'), sandbox, { filename: 'githubMatch.js' });
  vm.runInContext(read('app.js'), sandbox, { filename: 'app.js' });
  return { app: sandbox.app, els, storage: store, sandbox };
}

module.exports = { bootApp, makeStorage, fakeEl };
