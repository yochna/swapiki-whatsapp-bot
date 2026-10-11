(function (global) {
  function normalizeGoogleClientId(value) {
    return (value || '').trim();
  }

  // Keep this in sync with the APEX_DOMAIN constant in js/app.js's Router.
  // It's duplicated (not imported) because these two files load independently
  // and neither currently exports shared config — if you ever move off
  // swapiki.com, update both.
  const APEX_DOMAIN = 'swapiki.com';

  /**
   * True when the current page is a candidate's personal subdomain
   * (e.g. rahul-verma.swapiki.com) rather than the app itself
   * (swapiki.com / www.swapiki.com / localhost / a Cloudflare Pages preview).
   *
   * This matters because Google's "Authorized JavaScript origins" list only
   * accepts exact origins — there's no way to whitelist "*.swapiki.com" for
   * a dynamic, ever-growing set of candidate usernames. So the real Google
   * Sign-In button, which was working fine on swapiki.com, hits an
   * "Access blocked: origin_mismatch" full-page error the moment it runs on
   * someone else's candidate subdomain. That's a Google policy limit, not a
   * bug we can configure our way out of — the fix is to not attempt the
   * real button on these origins at all, and instead route the person to
   * the one origin that IS whitelisted.
   */
  function isPerCandidateSubdomainHost() {
    if (typeof global === 'undefined' || !global.window || !global.window.location) return false;
    const hostname = global.window.location.hostname || '';
    if (hostname === APEX_DOMAIN || !hostname.endsWith('.' + APEX_DOMAIN)) return false;
    const sub = hostname.slice(0, -(APEX_DOMAIN.length + 1));
    return !!sub && sub !== 'www';
  }

  function isDemoGoogleClientId(clientId) {
    const value = normalizeGoogleClientId(clientId);
    if (!value) return true;

    const lower = value.toLowerCase();
    const demoPatterns = [
      /^your[_-]?google[_-]?client[_-]?id$/i,
      /^replace[_-]?with[_-]?your[_-]?google[_-]?client[_-]?id$/i,
      /demo\.apps\.googleusercontent\.com$/i,
      /example\.apps\.googleusercontent\.com$/i,
      /placeholder/i,
      /your[_-]?google[_-]?client[_-]?id/i,
      /-demo\.apps\.googleusercontent\.com$/i,
      /googleusercontent\.com.*(demo|example|placeholder)/i
    ];

    if (demoPatterns.some((pattern) => pattern.test(lower))) {
      return true;
    }

    const validGoogleClientIdPattern = /^[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
    return !validGoogleClientIdPattern.test(lower);
  }

  function getConfiguredGoogleClientId() {
    if (typeof global !== 'undefined' && global.window) {
      const win = global.window;
      const value = normalizeGoogleClientId(
        win.GOOGLE_CLIENT_ID ||
        (win.SWAPIKI_CONFIG && win.SWAPIKI_CONFIG.GOOGLE_CLIENT_ID) ||
        (win.google && win.google.GOOGLE_CLIENT_ID)
      );
      return value;
    }

    if (typeof process !== 'undefined' && process.env && process.env.GOOGLE_CLIENT_ID) {
      return normalizeGoogleClientId(process.env.GOOGLE_CLIENT_ID);
    }

    return '';
  }

  function parseGoogleJwtPayload(token) {
    if (typeof token !== 'string' || !token) return null;

    const segments = token.split('.');
    if (segments.length < 2) return null;

    const payloadSegment = segments[1];
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

    try {
      let decoded = '';
      if (typeof global !== 'undefined' && global.Buffer) {
        decoded = global.Buffer.from(padded, 'base64').toString('utf8');
      } else if (typeof globalThis !== 'undefined' && globalThis.atob) {
        const binary = globalThis.atob(padded);
        decoded = decodeURIComponent(
          Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
        );
      } else {
        return null;
      }
      return JSON.parse(decoded);
    } catch (_error) {
      return null;
    }
  }

  // Google's docs are explicit that accounts.id.initialize() should be
  // called ONCE per page load. Calling it again — e.g. every time a login
  // modal opens — doesn't "refresh" anything; it silently replaces the
  // previous instance mid-flight, which is what was producing the
  // "initialize() is called multiple times" warning and the flaky/failed
  // sign-ins that came with it. So we track init state per callback here,
  // and only ever call initialize() the first time.
  let _initializedClientId = null;

  function ensureGoogleInitialized(clientId, callback) {
    if (typeof global === 'undefined' || !global.window) return false;
    const win = global.window;
    if (!win.google || !win.google.accounts || !win.google.accounts.id) return false;

    if (_initializedClientId === clientId) return true; // already done

    try {
      win.google.accounts.id.initialize({
        client_id: clientId,
        callback: callback,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      _initializedClientId = clientId;
      return true;
    } catch (_error) {
      return false;
    }
  }

  function initGoogleSignIn(containerId, callback) {
    if (typeof global === 'undefined' || !global.window || !global.document) return false;
    const win = global.window;
    const doc = global.document;

    const clientId = getConfiguredGoogleClientId();
    if (isDemoGoogleClientId(clientId)) {
      // No real Client ID configured yet (see config.js) — hide the button
      // slot instead of rendering a broken Google button.
      const container = doc.getElementById(containerId);
      if (container) container.innerHTML = '';
      return false;
    }

    if (isPerCandidateSubdomainHost()) {
      // Rendering the real Google button here would just fail with
      // "Access blocked: origin_mismatch" (see isPerCandidateSubdomainHost
      // above) — so instead show a plain button that takes the visitor to
      // the app's real domain to finish signing in with Google there. It's
      // one extra click/redirect instead of a dead end.
      const container = doc.getElementById(containerId);
      if (container) {
        container.innerHTML = '';
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-slate-300 rounded-full text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors';
        btn.textContent = 'Continue with Google';
        btn.addEventListener('click', () => {
          win.location.href = `https://${APEX_DOMAIN}/#continue-with-google`;
        });
        container.appendChild(btn);
      }
      return true;
    }

    if (!win.google || !win.google.accounts || !win.google.accounts.id) {
      // Google Identity Services script (accounts.google.com/gsi/client)
      // hasn't finished loading yet. Callers re-invoke this on modal open,
      // so it will succeed once the script is ready.
      return false;
    }

    if (!ensureGoogleInitialized(clientId, callback)) return false;

    try {
      const container = doc.getElementById(containerId);
      if (container) {
        container.innerHTML = '';
        win.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: container.offsetWidth || 320
        });
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  const exports = {
    isDemoGoogleClientId,
    getConfiguredGoogleClientId,
    parseGoogleJwtPayload,
    normalizeGoogleClientId,
    initGoogleSignIn,
    isPerCandidateSubdomainHost
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  global.googleAuth = exports;
}(typeof globalThis !== 'undefined' ? globalThis : this));
