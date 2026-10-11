// Boots js/store.js in a minimal browser-ish sandbox so the store's own
// persistence + cloud-sync wiring can be unit tested (the individual app.js
// features are covered by the other helpers).
//
// The fake Supabase client records every write so tests can assert exactly
// which columns each code path sends — notably that the attestation does NOT
// ride along in the big profile upsert, where a missing migration column would
// break the whole profile save.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const noop = () => {};

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
 * A chainable Supabase stand-in. Every terminal call resolves to
 * { data, error } where `error` is whatever `nextError` is set to, so a test
 * can simulate "column does not exist" for one write and success for another.
 * Recorded writes land in `calls`.
 */
function makeFakeSupabase() {
  const calls = [];
  const state = { nextError: null };
  const makeBuilder = (kind) => {
    const builder = {
      _kind: kind,
      select() { return builder; },
      order() { return builder; },
      eq() { return builder; },
      upsert(payload) { calls.push({ kind: 'upsert', payload }); return builder; },
      update(payload) { calls.push({ kind: 'update', payload }); return builder; },
      then(resolve) {
        return Promise.resolve({ data: null, error: state.nextError }).then(resolve);
      },
      catch(reject) {
        return Promise.resolve({ data: null, error: state.nextError }).catch(reject);
      }
    };
    return builder;
  };
  return {
    calls,
    state,
    from() { const b = makeBuilder('from'); return b; }
  };
}

/**
 * Returns { store, storage, supabase }. Pass `opts.supabase` (or the default
 * fake) and `opts.user` to simulate a signed-in candidate; without a user the
 * store stays purely local, like an anonymous visitor.
 */
function bootStore(opts) {
  const options = opts || {};
  const storage = options.storage || makeStorage();
  const supabase = options.supabase || null;

  const sandbox = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: storage,
    sessionStorage: makeStorage(),
    navigator: {},
    location: { pathname: '/', hash: '', href: 'https://swapiki.com/' },
    document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [] },
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
    AbortController,
    performance: { now: () => 0 },
    requestIdleCallback: noop
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = noop;
  vm.createContext(sandbox);

  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'store.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'store.js' });

  const store = sandbox.window.swapikiStore;
  if (supabase) store.supabase = supabase;
  if (options.user) store.currentUser = options.user;
  return { store, storage, supabase, sandbox };
}

module.exports = { bootStore, makeStorage, makeFakeSupabase };
