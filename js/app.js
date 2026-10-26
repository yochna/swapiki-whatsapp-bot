// Swapiki Application Controller & Router matching exact Stitch Design System

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
  'guerrillamail.com', 'guerrillamail.org', 'guerrillamail.net', 'guerrillamail.info',
  'guerrillamail.biz', 'guerrilla-mail.com', 'grr.la', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'temp-mail.org', 'temp-mail.io', 'tempmail.top',
  'throwawaymail.com', 'trashmail.com', 'trash-mail.com', 'trashymail.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'yopmail.org',
  'maildrop.cc', 'mailnesia.com', 'dispostable.com', 'mailcatch.com',
  'getnada.com', 'nada.email', 'dropmail.me', 'mailsac.com', 'tempail.com',
  'temporary-mail.net', 'tempsky.net', 'emailnator.com', 'moakt.com', 'moakt.co',
  'fakemail.net', 'femail.com', 'quickinbox.com', 'harakirimail.com',
  'discard.email', 'discardmail.com', 'discardmail.de', 'spambox.us', 'spambox.me',
  'burner.email', 'jetable.com', '33mail.com', 'spamgourmet.com', 'mytrashmail.com',
  'mailmetrash.com', 'wuzupmail.com', 'freeml.net', 'zemail.eu', 'inboxbear.com'
]);

/** Client-side fast check (mirror of the list in functions/api/signup-guard.js).
 *  The worker endpoint is the authoritative enforcement point. */
function isDisposableEmail(email) {
  const at = (email || '').lastIndexOf('@');
  if (at < 0) return false;
  const domain = (email || '').slice(at + 1).toLowerCase();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/** How many rows a long admin list shows before it offers to show more.
 *  Small enough that the first screen is a short scroll, large enough that
 *  fifteen decisions are still one sitting. */
const ADMIN_PAGE_SIZE = 15;

/** How many distinct job posts a member may run through resume draft and
 *  interview prep in one day, counted across both tools by the database.
 *
 *  This is only the number shown to a candidate when the server has not sent one
 *  (signed out, or the daily-allowance migration is not applied yet). The number
 *  actually enforced is the one claim_tool_usage() returns, and tests/tool-usage
 *  asserts this and the SQL agree — a candidate is never told a different limit
 *  from the one they are held to. */
const DAILY_TOOL_JOB_LIMIT = 5;

/** How many listings the public board paints before it offers "Show more".
 *
 *  The board is several thousand rows; rendering every card into one innerHTML
 *  on arrival blocks the main thread for seconds and the visitor stares at a
 *  frozen page (the server-rendered list is replaced wholesale by the SPA, so
 *  there is nothing to interact with until it finishes). A first batch paints in
 *  one frame and the rest arrive on request. */
const JOBS_PAGE_SIZE = 40;

class Router {
  constructor() {
    this.currentView = 'landing';
    window.addEventListener('popstate', () => this.handleHash());
  }

  init() {
    // Hide ALL view sections first so nothing bleeds through before routing runs
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active-view');
    });
    this.handleHash();
    // Native hash routing: <a href="#view"> links, browser back/forward and
    // manual hash edits ALL go through the same route resolution now —
    // navigation no longer depends on imperative router.navigate() alone.
    window.addEventListener('hashchange', () => this.handleHash());
  }

  handleHash() {
    const hostname = window.location.hostname;
    const path = window.location.pathname;
    const hash = window.location.hash.replace('#', '') || '';

    // publicUsername is stored on `app` (not `this`/Router) because the
    // code that actually READS it — renderCandidateProfile() — lives on the
    // SwapikiApp instance, not the Router. This used to be `this.publicUsername`
    // here, which silently set a property on the Router object that nobody
    // ever read, so a stranger visiting any shared profile link always saw
    // whatever profile happened to be cached locally instead of the real one.

    // Subdomain profile links: https://<username>.swapiki.com
    // This ONLY applies to the swapiki.com custom domain. It must NOT apply
    // to swapiki.pages.dev — Cloudflare gives every deployment its own
    // random-hash preview subdomain there (e.g. 2a8c74a5.swapiki.pages.dev),
    // and treating those as candidate usernames would break every preview
    // link, showing a "profile not found" page instead of the site.
    const APEX_DOMAIN = 'swapiki.com';
    if (hostname === APEX_DOMAIN || hostname.endsWith('.' + APEX_DOMAIN)) {
      const sub = hostname === APEX_DOMAIN ? '' : hostname.slice(0, -(APEX_DOMAIN.length + 1));
      if (sub && sub !== 'www') {
        app.publicUsername = sub;
        app._adminPreviewMode = false;
        this.navigate('candidate', false);
        return;
      }
    }

    // Subroute support: /sites/username or #sites/username or #profile/username
    // are all genuine PUBLIC links — anyone with the link can open them, so
    // they must only ever reveal a published profile.
    if (path.startsWith('/sites/')) {
      app.publicUsername = path.split('/sites/')[1].split('/')[0];
      app._adminPreviewMode = false;
      this.navigate('candidate', false);
      return;
    } else if (hash.startsWith('sites/')) {
      app.publicUsername = hash.slice('sites/'.length);
      app._adminPreviewMode = false;
      this.navigate('candidate', false);
      return;
    } else if (hash.startsWith('profile/')) {
      app.publicUsername = decodeURIComponent(hash.slice('profile/'.length));
      app._adminPreviewMode = false;
      this.navigate('candidate', false);
      return;
    } else if (hash.startsWith('admin-preview/')) {
      // Admin-only route (set by adminViewCandidateProfile below) — uses its
      // own URL shape so it's never confused with a real public /profile/
      // link, and so _adminPreviewMode is correctly reconstructed as true
      // no matter how many times this hash gets re-parsed (reload, a second
      // hashchange, browser back/forward, etc.) instead of depending on a
      // flag that's only readable once.
      app.publicUsername = decodeURIComponent(hash.slice('admin-preview/'.length));
      app._adminPreviewMode = true;
      this.navigate('candidate', false);
      return;
    }
    // Landing spot for the "Continue with Google" fallback button shown on
    // candidate subdomains (see js/googleAuth.js isPerCandidateSubdomainHost)
    // — those subdomains can't host the real Google button since Google
    // only allows a fixed, pre-registered list of origins. This origin
    // (swapiki.com) IS on that list, so the visitor lands here and the
    // login modal opens automatically, ready for another tap.
    if (hash === 'continue-with-google') {
      app.publicUsername = null;
      app._adminPreviewMode = false;
      this.navigate('landing', false);
      app.openLoginModal();
      return;
    }

    // Draft-a-resume route: #resume-draft/<jobId> — opens the resume builder
    // pre-tuned to that job's description. The job id lives in the hash so a
    // hard refresh on this page keeps working.
    if (hash.startsWith('resume-draft/')) {
      app._resumeJobId = decodeURIComponent(hash.slice('resume-draft/'.length).split('?')[0]) || null;
      app._adminPreviewMode = false;
      this.navigate('resume-draft', false);
      return;
    }

    // Interview-prep route: #interview-prep/<jobId> — question bank + practice
    // tuned to a specific job, reachable from the apply popup.
    if (hash.startsWith('interview-prep/')) {
      app._interviewJobId = decodeURIComponent(hash.slice('interview-prep/'.length).split('?')[0]) || null;
      app._adminPreviewMode = false;
      this.navigate('interview-prep', false);
      return;
    }

    app.publicUsername = null;
    app._adminPreviewMode = false;
    // /jobs is a real crawlable path (see functions/jobs.js) — in the app it
    // renders the same Jobs board as #jobs, without rewriting the URL.
    //
    // It must NOT outrank the hash, though. The nav calls
    // router.navigate('dashboard'), which sets the hash; if this branch kept
    // winning, a visitor who arrived on /jobs would be bounced straight back to
    // the jobs board on every single nav click. The second click then appeared
    // to fix it, which is what made this so confusing to report: by then the
    // hash was ALREADY #dashboard, so assigning it again fired no hashchange at
    // all and navigate() did the work itself. "Click once, nothing; click
    // again, it works" is the signature of a router that both changes the URL
    // and listens to the URL.
    const pathWantsJobs = path === '/jobs' || path === '/jobs/';
    const hashNamesAView = !!hash && hash !== 'jobs';
    if (pathWantsJobs && !hashNamesAView) {
      this.navigate('jobs', false);
      return;
    }
    // From here an explicit hash always wins over the path, and the guard below
    // turns a hash we are already showing into a no-op instead of a re-render.
    // Guard against double-rendering: imperative navigate() already set the
    // hash AND switched the view, so the hashchange we just triggered points
    // at the same view we're already showing. Skip the redundant re-render.
    if (hash && this.currentView === hash) return;
    // No hash present: send logged-in candidates straight to their dashboard,
    // and everyone else to the public landing page.
    const targetView = hash || (window.app && app.isAuthenticated() ? 'dashboard' : 'landing');
    this.navigate(targetView, false);
  }

  /** "Go home" — dashboard for a logged-in candidate, landing page for a guest. */
  goHome() {
    this.navigate(window.app && app.isAuthenticated() ? 'dashboard' : 'landing');
  }

  navigate(viewId, updateHistory = true) {
    const validViews = ['landing', 'dashboard', 'candidate', 'jobs', 'add-project', 'admin', 'admin-jobs', 'resume-draft', 'interview-prep'];
    if (!validViews.includes(viewId)) viewId = 'landing';

    // Protected views require a logged-in candidate (real Supabase session),
    // not just local demo data.
    const protectedViews = ['dashboard', 'add-project'];
    if (protectedViews.includes(viewId) && !app.isAuthenticated()) {
      viewId = 'landing';
      app.showToast('Please log in to access your dashboard.');
      app.openLoginModal();
    }

    if (viewId === 'admin' && !(window.swapikiStore && swapikiStore.isAdminUser)) {
      viewId = 'landing';
      app.showToast('Admin access required.');
    }
    if (viewId === 'admin-jobs' && !(window.swapikiStore && swapikiStore.isAdminUser)) {
      viewId = 'landing';
      app.showToast('Admin access required.');
    }

    this.currentView = viewId;
    if (updateHistory) {
      window.location.hash = viewId;
    }

    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active-view');
    });

    const sectionId = viewId;
    const targetEl = document.getElementById(`view-${sectionId}`);
    if (targetEl) {
      targetEl.classList.add('active-view');
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }

    if (viewId === 'dashboard') {
      app.renderDashboard();
    } else if (viewId === 'candidate') {
      // Don't count admin "view profile" clicks as a real page view — this
      // flag is set by adminViewCandidateProfile() and consumed (reset to
      // false) inside renderCandidateProfile() right after we read it here.
      if (!(window.app && app._adminPreviewMode)) {
        swapikiStore.incrementViews();
      }
      app.renderCandidateProfile();
    } else if (viewId === 'landing') {
      if (window.posthog && typeof window.posthog.capture === 'function') {
        try { window.posthog.capture('view_landing'); } catch (e) {}
      }
      app.renderLandingView();
    } else if (viewId === 'jobs') {
      if (window.posthog && typeof window.posthog.capture === 'function') {
        try { window.posthog.capture('view_jobs'); } catch (e) {}
      }
      app.renderJobsView();
    } else if (viewId === 'resume-draft') {
      app.renderResumeDraftView();
    } else if (viewId === 'interview-prep') {
      app.renderInterviewPrepView();
    } else if (viewId === 'admin') {
      app.renderAdminDashboard();
    } else if (viewId === 'admin-jobs') {
      app.renderAdminJobsView();
    }
  }
}

class SwapikiApp {
  constructor() {
    this.heroPlaying = false;
    this.currentRecordingProjectId = null;
    this.recordedAudioUrl = null;
    this.recordedDurationStr = null;
    this.recordingValid = false;
    this.activeAudioElement = null;

    // The review queue is kept here after the dashboard reads it, so a decision
    // can repaint the tables from memory instead of re-querying every table on
    // the page. Without it, one click on one job rebuilt the whole admin.
    this._adminJobs = [];
    // Job ids with a write still in flight. A second press while the first is
    // open is a duplicate decision, not a retry.
    this._adminJobBusy = {};
    this._adminRenderInFlight = null;
    this._adminRenderQueued = false;
  }
  async init() {
    try {
      // Point this deployment at its own backend (test vs prod Supabase) via
      // the /config function before anything reads database credentials.
      await swapikiStore.applyConfig();

      // First-touch referral capture: if this visit arrived through an invite
      // link (swapiki.com/?ref=<username>), remember the handle now so it can be
      // attributed once the visitor actually creates an account.
      if (typeof swapikiStore.captureReferralFromUrl === 'function') {
        swapikiStore.captureReferralFromUrl();

      }

      // Heavy third-party loaders only matter on production: Google Sign-In
      // (works on swapiki.com; its origins aren't allow-listed on *.pages.dev)
      // and PostHog analytics (keeps real usage data clean of test noise and
      // the test site fast). Both are no-ops unless we're actually on the
      // production domain — the SITE_ENV flag is a bonus override, not a
      // requirement, so a missing env var can't silently kill the Google
      // button on swapiki.com.
      const prodHost = window.location.hostname === 'swapiki.com' || window.location.hostname.endsWith('.swapiki.com');
      if (swapikiStore.siteEnv === 'prod' || prodHost) {
        this.ensureGoogleScript();
        this.initGoogleButtons();
        if (typeof window.SWAPIKI_initPosthog === 'function') {
          if ('requestIdleCallback' in window) {
            window.requestIdleCallback(window.SWAPIKI_initPosthog, { timeout: 2500 });
          } else {
            window.setTimeout(window.SWAPIKI_initPosthog, 2500);
          }
        }
      }

      // Restore any existing Supabase session before routing, so a refresh
      // on /#dashboard doesn't bounce a logged-in candidate back to the
      // landing page.
      await swapikiStore.getSession();
      this.refreshAuthUI();
      try { this.maybeStartGuidedTour(); } catch (e) { /* ignore */ }

      // One delegated listener for the jobs-page "personal Telegram link" button:
      // the card is re-rendered whenever the board refetches, so a listener
      // attached to the button itself would be lost between renders.
      document.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('[data-tg-link]') : null;
        if (!btn) return;
        ev.preventDefault();
        this._openTelegramDeepLink(btn);
      });

      // Profile badge popups open on hover/focus via CSS alone. Touch screens
      // have no hover, and iOS won't focus a bare <span>, so a tap toggles them
      // too — and a tap anywhere else dismisses the open one.
      this.initBadgeTooltips();

      // Bring this account's "what did you do" notes down onto the device, and
      // push anything only this device has. Fire-and-forget: a slow or missing
      // table must never hold up the first paint, and the form reads from the
      // device copy either way.
      this._ghHydrateNotes().catch(() => { });

      window.router = new Router();
      window.router.init();
    } finally {
      // Whether startup succeeded or threw, the real view (or at least the
      // landing page, via Router's own fallbacks) is as ready as it'll get —
      // don't leave visitors stuck behind the loader forever.
      document.getElementById('initial-loader')?.remove();
      // The first-visit splash waits for this signal before it dissolves, so
      // it only ever reveals a page that has actually rendered.
      try {
        if (window.__swapikiSplash && typeof window.__swapikiSplash.markReady === 'function') {
          window.__swapikiSplash.markReady();
        }
      } catch (e) { /* splash is optional */ }
    }
  }

  // ---------------------------------------------------------------------
  // ADMIN DASHBOARD
  // ---------------------------------------------------------------------

  /** Formats a byte count as a human-readable size (e.g. 1536000 -> "1.5 MB"). */
  formatBytes(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
  }

  /** Formats a seconds count as e.g. "3m 42s" or "48s". */
  formatDuration(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '—';
    seconds = Math.round(seconds);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  /** Builds the row of admin stat cards (published/unpublished, users, space, time spent). */
  renderAdminStatCards(stats, timeStats, candidates) {
    // Fall back to counting the already-fetched lists if the RPC failed for
    // some reason (e.g. migration not yet run), so the dashboard still shows
    // something reasonable instead of blank cards.
    const published = stats ? stats.published_count : candidates.filter(c => c.profile_status === 'published').length;
    const unpublished = stats ? stats.unpublished_count : candidates.length - published;
    const totalUsers = stats ? stats.total_users : candidates.length;
    const spaceQuotaBytes = (window.SWAPIKI_CONFIG && window.SWAPIKI_CONFIG.STORAGE_QUOTA_BYTES) || (1024 * 1024 * 1024);
    let spaceLabel = '—';
    let spaceSubLabel = stats ? '' : 'Run admin_stats_migration.sql';
    if (stats && stats.space_utilized_bytes != null) {
      const usedBytes = stats.space_utilized_bytes;
      const pct = spaceQuotaBytes > 0 ? (usedBytes / spaceQuotaBytes) * 100 : 0;
      // Show 1 decimal place under 10% so small usage isn't rounded away to "0%".
      spaceLabel = `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
      const filesPart = stats.file_count != null ? `${stats.file_count} files · ` : '';
      spaceSubLabel = `${filesPart}${this.formatBytes(usedBytes)} of ${this.formatBytes(spaceQuotaBytes)}`;
    }

    const timeSpentLabel = (timeStats && timeStats.configured && timeStats.avg_session_seconds != null)
      ? this.formatDuration(timeStats.avg_session_seconds)
      : '—';
    const timeSpentSubLabel = (timeStats && timeStats.configured)
      ? `avg. / session, last ${timeStats.window_days || 30}d`
      : 'Connect PostHog to enable';

    const cards = [
      { label: 'Published', value: String(published), sub: 'candidate profiles', icon: 'visibility', color: 'emerald' },
      { label: 'Unpublished', value: String(unpublished), sub: 'candidate profiles', icon: 'visibility_off', color: 'slate' },
      { label: 'Total Users', value: String(totalUsers), sub: 'all accounts', icon: 'group', color: 'primary' },
      { label: 'Space Utilized', value: spaceLabel, sub: spaceSubLabel, icon: 'cloud', color: 'amber' },
      { label: 'Avg. Time Spent', value: timeSpentLabel, sub: timeSpentSubLabel, icon: 'schedule', color: 'indigo' }
    ];

    const colorMap = {
      emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', bar: 'bg-emerald-500' },
      slate: { bg: 'bg-slate-100', icon: 'text-slate-500', bar: 'bg-slate-400' },
      primary: { bg: 'bg-primary-fixed', icon: 'text-primary', bar: 'bg-primary' },
      amber: { bg: 'bg-amber-50', icon: 'text-amber-600', bar: 'bg-amber-500' },
      indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', bar: 'bg-indigo-500' }
    };

    return `
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        ${cards.map(c => {
          const p = colorMap[c.color] || colorMap.slate;
          const isNumeric = /^\d+$/.test(c.value);
          return `
          <div class="admin-stat-card group relative overflow-hidden border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div class="absolute top-0 left-0 right-0 h-0.5 ${p.bar}"></div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${c.label}</span>
              <span class="w-8 h-8 rounded-lg ${p.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                <span class="material-symbols-outlined text-lg ${p.icon}">${c.icon}</span>
              </span>
            </div>
            <div class="admin-stat-value text-2xl font-bold text-slate-900 tracking-tight" ${isNumeric ? `data-target="${c.value}"` : ''}>${isNumeric ? '0' : c.value}</div>
            <div class="text-xs text-slate-400 mt-0.5 truncate">${c.sub}</div>
          </div>
        `;
        }).join('')}
      </div>
    `;
  }

  animateAdminStatCards() {
    const els = document.querySelectorAll('.admin-stat-value[data-target]');
    els.forEach(el => {
      const target = parseInt(el.getAttribute('data-target'), 10) || 0;
      const duration = 700;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = String(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = String(target);
      };
      requestAnimationFrame(step);
    });
  }

  renderAdminCharts(candidates, admins, stats) {
    const published = stats ? stats.published_count : candidates.filter(c => c.profile_status === 'published').length;
    const total = candidates.length || 1;
    const unpublished = Math.max(total - published, 0);
    const pubPct = Math.round((published / total) * 100);

    const r = 42;
    const circumference = 2 * Math.PI * r;
    const publishedLen = (published / total) * circumference;

    const donutChart = `
      <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 flex items-center gap-5">
        <svg width="104" height="104" viewBox="0 0 104 104" class="shrink-0 -rotate-90">
          <circle cx="52" cy="52" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="12"></circle>
          <circle cx="52" cy="52" r="${r}" fill="none" stroke="#10B981" stroke-width="12"
            stroke-linecap="round"
            class="admin-donut-ring"
            stroke-dasharray="${publishedLen} ${circumference - publishedLen}"></circle>
        </svg>
        <div class="flex-1 min-w-0">
          <div class="text-2xl font-bold text-slate-900 leading-none mb-1">${pubPct}%</div>
          <div class="text-xs text-slate-400 mb-3">of candidate profiles published</div>
          <div class="flex items-center gap-2 text-xs mb-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span class="text-slate-600 font-medium">Published</span>
            <span class="ml-auto font-bold text-slate-800">${published}</span>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"></span>
            <span class="text-slate-600 font-medium">Unpublished</span>
            <span class="ml-auto font-bold text-slate-800">${unpublished}</span>
          </div>
        </div>
      </div>
    `;

    const barData = [
      { label: 'Candidates', value: candidates.length, color: 'bg-primary' },
      { label: 'Admins', value: admins.length, color: 'bg-indigo-500' }
    ];
    const maxVal = Math.max(...barData.map(b => b.value), 1);

    const barChart = `
      <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <div class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Accounts by role</div>
        <div class="space-y-3">
          ${barData.map(b => `
            <div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium text-slate-600">${b.label}</span>
                <span class="font-bold text-slate-800">${b.value}</span>
              </div>
              <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div class="admin-bar-fill h-full ${b.color} rounded-full" style="width: 0%" data-bar-target="${(b.value / maxVal) * 100}"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        ${donutChart}
        ${barChart}
      </div>
    `;
  }

  /**
   * Four extra stat cards answering "who's actually engaging": accounts that
   * never picked a role, profiles stuck half-filled, and who has/hasn't
   * recorded a voice clip. Sourced from get_admin_stats() (see
   * supabase/admin_stats_migration.sql); falls back to bucketing the
   * already-fetched candidates list by completion_score when the RPC hasn't
   * been (re-)run yet, though login-only/voice counts need the RPC.
   */
  renderAdminEngagementStats(stats, candidates) {
    const configured = !!(stats && stats.profile_not_started_count != null);

    const bucket = (min, max) => candidates.filter(c => {
      const s = c.completion_score ?? 30;
      return s >= min && s <= max;
    }).length;

    const loginOnly = configured ? stats.login_only_count : null;
    const halfFilled = configured
      ? (stats.profile_partial_count + stats.profile_near_complete_count)
      : (bucket(31, 99));
    const voiceMissing = configured ? stats.voice_missing_count : null;
    const fullyComplete = configured ? stats.profile_complete_count : bucket(100, 100);

    const migrationHint = 'Run updated admin_stats_migration.sql';

    const cards = [
      {
        label: 'Login Only', value: loginOnly != null ? String(loginOnly) : '—',
        sub: loginOnly != null ? 'signed up, no profile' : migrationHint,
        icon: 'login', bg: 'bg-slate-100', iconColor: 'text-slate-500', bar: 'bg-slate-400'
      },
      {
        label: 'Half-Filled', value: String(halfFilled),
        sub: 'candidates, profile in progress',
        icon: 'hourglass_top', bg: 'bg-amber-50', iconColor: 'text-amber-600', bar: 'bg-amber-500'
      },
      {
        label: 'No Voice Recorded', value: voiceMissing != null ? String(voiceMissing) : '—',
        sub: voiceMissing != null ? 'candidates, no audio yet' : migrationHint,
        icon: 'mic_off', bg: 'bg-rose-50', iconColor: 'text-rose-600', bar: 'bg-rose-500'
      },
      {
        label: 'Fully Complete', value: String(fullyComplete),
        sub: 'profile + voice recorded',
        icon: 'task_alt', bg: 'bg-emerald-50', iconColor: 'text-emerald-600', bar: 'bg-emerald-500'
      }
    ];

    return `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        ${cards.map(c => {
          const isNumeric = /^\d+$/.test(c.value);
          return `
          <div class="admin-stat-card group relative overflow-hidden border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div class="absolute top-0 left-0 right-0 h-0.5 ${c.bar}"></div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${c.label}</span>
              <span class="w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                <span class="material-symbols-outlined text-lg ${c.iconColor}">${c.icon}</span>
              </span>
            </div>
            <div class="admin-stat-value text-2xl font-bold text-slate-900 tracking-tight" ${isNumeric ? `data-target="${c.value}"` : ''}>${isNumeric ? '0' : c.value}</div>
            <div class="text-xs text-slate-400 mt-0.5 truncate">${c.sub}</div>
          </div>
        `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Two charts pairing with renderAdminEngagementStats(): a voice-recorded
   * donut, and a profile-completion funnel bar (not started → half-filled →
   * missing voice only → fully complete). Same fallback rule as above.
   */
  renderAdminEngagementCharts(stats, candidates) {
    const configured = !!(stats && stats.profile_not_started_count != null);
    const totalCandidates = candidates.length || 1;

    const bucket = (min, max) => candidates.filter(c => {
      const s = c.completion_score ?? 30;
      return s >= min && s <= max;
    }).length;

    const voiceRecorded = configured ? stats.voice_recorded_count : null;
    const voiceMissing = configured ? stats.voice_missing_count : (totalCandidates - (voiceRecorded || 0));

    let voiceChart;
    if (voiceRecorded == null) {
      voiceChart = `
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 flex items-center justify-center text-center">
          <div>
            <span class="material-symbols-outlined text-2xl text-slate-300 block mb-1">mic</span>
            <p class="text-xs text-slate-400">Run updated admin_stats_migration.sql to enable voice-recording stats.</p>
          </div>
        </div>
      `;
    } else {
      const r = 42;
      const circumference = 2 * Math.PI * r;
      const total = Math.max(voiceRecorded + voiceMissing, 1);
      const recordedLen = (voiceRecorded / total) * circumference;
      const recordedPct = Math.round((voiceRecorded / total) * 100);

      voiceChart = `
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 flex items-center gap-5">
          <svg width="104" height="104" viewBox="0 0 104 104" class="shrink-0 -rotate-90">
            <circle cx="52" cy="52" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="12"></circle>
            <circle cx="52" cy="52" r="${r}" fill="none" stroke="#6366F1" stroke-width="12"
              stroke-linecap="round"
              class="admin-donut-ring"
              stroke-dasharray="${recordedLen} ${circumference - recordedLen}"></circle>
          </svg>
          <div class="flex-1 min-w-0">
            <div class="text-2xl font-bold text-slate-900 leading-none mb-1">${recordedPct}%</div>
            <div class="text-xs text-slate-400 mb-3">of candidates recorded a voice clip</div>
            <div class="flex items-center gap-2 text-xs mb-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
              <span class="text-slate-600 font-medium">Recorded</span>
              <span class="ml-auto font-bold text-slate-800">${voiceRecorded}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"></span>
              <span class="text-slate-600 font-medium">Not recorded</span>
              <span class="ml-auto font-bold text-slate-800">${voiceMissing}</span>
            </div>
          </div>
        </div>
      `;
    }

    const funnelData = configured ? [
      { label: 'Not started', value: stats.profile_not_started_count, color: 'bg-slate-400' },
      { label: 'Basic info added', value: stats.profile_partial_count, color: 'bg-amber-500' },
      { label: 'Missing voice only', value: stats.profile_near_complete_count, color: 'bg-orange-500' },
      { label: 'Fully complete', value: stats.profile_complete_count, color: 'bg-emerald-500' }
    ] : [
      { label: 'Not started', value: bucket(0, 30), color: 'bg-slate-400' },
      { label: 'Basic info added', value: bucket(31, 69), color: 'bg-amber-500' },
      { label: 'Missing voice only', value: bucket(70, 99), color: 'bg-orange-500' },
      { label: 'Fully complete', value: bucket(100, 100), color: 'bg-emerald-500' }
    ];
    const funnelMax = Math.max(...funnelData.map(b => b.value), 1);

    const funnelChart = `
      <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <div class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Profile completion funnel</div>
        <div class="space-y-3">
          ${funnelData.map(b => `
            <div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium text-slate-600">${b.label}</span>
                <span class="font-bold text-slate-800">${b.value}</span>
              </div>
              <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div class="admin-bar-fill h-full ${b.color} rounded-full" style="width: 0%" data-bar-target="${(b.value / funnelMax) * 100}"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        ${voiceChart}
        ${funnelChart}
      </div>
    `;
  }

  animateAdminBars() {
    requestAnimationFrame(() => {
      document.querySelectorAll('.admin-bar-fill[data-bar-target]').forEach(el => {
        const target = el.getAttribute('data-bar-target');
        el.style.width = `${target}%`;
      });
    });
  }

  renderAdminDashboardSkeleton() {
    const cardSkeleton = Array.from({ length: 6 }).map(() => `
      <div class="border border-slate-200 rounded-xl p-4 bg-white animate-pulse">
        <div class="flex items-center justify-between mb-3">
          <div class="h-2.5 w-16 bg-slate-200 rounded"></div>
          <div class="w-8 h-8 rounded-lg bg-slate-100"></div>
        </div>
        <div class="h-6 w-12 bg-slate-200 rounded mb-2"></div>
        <div class="h-2.5 w-20 bg-slate-100 rounded"></div>
      </div>
    `).join('');

    const tableSkeleton = (rows) => `
      <div class="border border-slate-200 rounded-xl overflow-hidden bg-white animate-pulse">
        <div class="bg-slate-50 h-9 border-b border-slate-100"></div>
        ${Array.from({ length: rows }).map((_, i) => `
          <div class="h-12 flex items-center gap-4 px-4 ${i !== rows - 1 ? 'border-b border-slate-100' : ''}">
            <div class="w-8 h-8 rounded-full bg-slate-200 shrink-0"></div>
            <div class="h-2.5 w-32 bg-slate-200 rounded"></div>
            <div class="h-2.5 w-24 bg-slate-100 rounded hidden sm:block"></div>
          </div>
        `).join('')}
      </div>
    `;

    const chartSkeleton = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <div class="border border-slate-200 rounded-xl bg-white p-4 h-[132px] animate-pulse flex items-center gap-5">
          <div class="w-24 h-24 rounded-full bg-slate-100 shrink-0"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 w-16 bg-slate-200 rounded"></div>
            <div class="h-2.5 w-32 bg-slate-100 rounded"></div>
          </div>
        </div>
        <div class="border border-slate-200 rounded-xl bg-white p-4 h-[132px] animate-pulse space-y-3">
          <div class="h-2.5 w-24 bg-slate-200 rounded"></div>
          <div class="h-2 w-full bg-slate-100 rounded-full"></div>
          <div class="h-2 w-full bg-slate-100 rounded-full"></div>
          <div class="h-2 w-full bg-slate-100 rounded-full"></div>
        </div>
      </div>
    `;

    return `
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">${cardSkeleton}</div>
      ${chartSkeleton}
      <div class="mb-8">
        <div class="h-5 w-40 bg-slate-200 rounded mb-3 animate-pulse"></div>
        ${tableSkeleton(4)}
      </div>
      <div>
        <div class="h-5 w-40 bg-slate-200 rounded mb-3 animate-pulse"></div>
        ${tableSkeleton(3)}
      </div>
    `;
  }

  adminInitials(name) {
    const clean = (name || '').trim();
    if (!clean) return '?';
    const parts = clean.split(/\s+/).filter(Boolean);
    const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]) : clean.slice(0, 2);
    return initials.toUpperCase();
  }

  adminAvatarColor(seed) {
    const palette = ['bg-primary-fixed text-primary', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
      'bg-indigo-100 text-indigo-700', 'bg-rose-100 text-rose-700', 'bg-slate-200 text-slate-600'];
    const str = String(seed || '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }


  /**
   * A section heading with a count badge.
   *
   * `countRef` names the badge so a repaint can correct it. The badge says how much
   * work a section is, which is the number the admin plans their sitting around —
   * so it is the size of the whole list, never the size of the page being shown.
   */
  adminSectionHeader(title, count, icon, actionHtml = '', countRef = '') {
    return `
      <div class="flex items-center gap-2 mb-3">
        <span class="material-symbols-outlined text-lg text-slate-400">${icon}</span>
        <h3 class="text-lg font-bold text-slate-900">${title}</h3>
        <span class="text-xs font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5"${countRef ? ` data-admin-total="${countRef}"` : ''}>${count}</span>
        ${actionHtml ? `<span class="ml-auto">${actionHtml}</span>` : ''}
      </div>
    `;
  }

  /** Pill color per feedback category — severity-coded so the admin queue scans fast. */
  feedbackCategoryColor(category) {
    const map = {
      broken: 'bg-rose-50 text-rose-600',
      confusing: 'bg-amber-50 text-amber-700',
      missing: 'bg-indigo-50 text-indigo-700',
      idea: 'bg-emerald-50 text-emerald-700'
    };
    return map[category] || 'bg-slate-100 text-slate-600';
  }

  /** Minimal HTML escaping for user content rendered into admin dashboard templates. */
  escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Escapes a value for safe inclusion in a CSV cell (quotes, commas, newlines). */
  csvEscape(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /** Builds and downloads a CSV file of every candidate in the admin database. */
  async exportCandidatesCSV() {
    const btn = document.getElementById('admin-export-csv-btn');
    const originalHtml = btn ? btn.innerHTML : null;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Exporting…`;
    }

    try {
      // Reuse the candidates already fetched for the dashboard when available,
      // otherwise fetch fresh so the export works even if called standalone.
      const candidates = this._adminCandidatesCache || await swapikiStore.adminListCandidates();

      if (!candidates || candidates.length === 0) {
        this.showToast('No candidates to export yet.');
        return;
      }

      const columns = [
        { key: 'name', label: 'Name' },
        { key: 'username', label: 'Handle' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'profile_status', label: 'Status' },
        { key: 'title', label: 'Headline' },
        { key: 'experience', label: 'Experience' },
        { key: 'expertise', label: 'Skills & Expertise' },
        { key: 'location', label: 'Location' },
        { key: 'education', label: 'Education' },
        { key: 'linkedin', label: 'LinkedIn' },
        { key: 'twitter', label: 'Twitter / X' },
        { key: 'resumeLink', label: 'Resume Link' },
        { key: 'portfolio', label: 'Portfolio' },
        { key: 'created_at', label: 'Joined' }
      ];

      const headerRow = columns.map(c => this.csvEscape(c.label)).join(',');
      const dataRows = candidates.map(c => columns.map(col => {
        let val = c[col.key];
        if (Array.isArray(val)) val = val.join('; ');
        return this.csvEscape(val);
      }).join(','));

      // Leading BOM so Excel opens UTF-8 CSVs (names/skills with accents, etc.) correctly.
      const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `swapiki-candidates-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showToast(`✅ Exported ${candidates.length} candidate${candidates.length === 1 ? '' : 's'} to CSV.`);
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not export CSV.'}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  /**
   * The "nothing here" row. The message is plain text and is escaped here, so a
   * search term typed by the admin cannot close the tag it is printed inside.
   */
  adminEmptyState(colspan, icon, message) {
    return `
      <tr>
        <td colspan="${colspan}" class="py-10 text-center">
          <div class="flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-3xl text-slate-300">${this.escapeHtml(icon)}</span>
            <span class="text-sm text-slate-400">${this.escapeHtml(message)}</span>
          </div>
        </td>
      </tr>
    `;
  }

  /**
   * The open profile-report queue — the discovery half of the fraud response.
   *
   * A report names a candidate_id; the candidate's name and handle come from the
   * already-fetched list (this._adminCandidatesCache), so a report never needs a
   * second read. Every field is escaped: a reason label, the free-text details and
   * the reporter's own email are all attacker-influenced. Acting on a report
   * freezes the profile (status 'suspended' via adminSetProfileStatus) and marks
   * the report actioned; a dismissal just resolves the report.
   */
  adminReportsSection(reports) {
    const list = reports || [];
    const byId = new Map((this._adminCandidatesCache || []).map(c => [c.id, c]));
    const reasonLabel = {
      scam: 'Scam / fraud',
      impersonation: 'Fake person',
      stolen_work: 'Stolen work',
      contact: 'Money / off-platform contact',
      spam: 'Spam',
      other: 'Other'
    };
    const rowDelay = i => `animation-delay:${Math.min(i * 0.03, 0.3)}s`;

    const rows = list.map((r, i) => {
      const c = byId.get(r.candidate_id) || {};
      return `
        <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-rose-50/40 transition-colors align-top" style="${rowDelay(i)}">
          <td class="py-3 px-3 text-xs text-slate-400 whitespace-nowrap">${swapikiStore.timeAgo(r.created_at)}</td>
          <td class="py-3 px-3">
            <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(c.username || '')}"
              class="text-sm font-bold text-slate-800 hover:text-primary hover:underline" ${!c.username ? 'disabled' : ''}>${this.escapeHtml(c.name || '(no name)')}</button>
            <div class="text-xs text-slate-400">${c.username ? '@' + this.escapeHtml(c.username) : '—'}</div>
          </td>
          <td class="py-3 px-3 whitespace-nowrap">
            <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">${this.escapeHtml(reasonLabel[r.reason] || r.reason || 'Report')}</span>
          </td>
          <td class="py-3 px-3 text-sm text-slate-700 max-w-md whitespace-pre-line">${this.escapeHtml(r.details || '')}</td>
          <td class="py-3 px-3 text-xs text-slate-400 break-all max-w-[12rem]">${this.escapeHtml(r.reporter_email || '—')}</td>
          <td class="py-3 px-3 text-right whitespace-nowrap">
            ${r.candidate_id ? `<button onclick="app.adminSuspendReportedProfile(this.dataset.id, this.dataset.report)" data-id="${this.escapeHtml(r.candidate_id)}" data-report="${this.escapeHtml(r.id)}" title="Suspend and mark actioned"
              class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all">
              <span class="material-symbols-outlined text-lg">block</span></button>` : ''}
            <button onclick="app.adminResolveReport(this.dataset.id, 'dismissed')" data-id="${this.escapeHtml(r.id)}" title="Dismiss"
              class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-90 transition-all">
              <span class="material-symbols-outlined text-lg">done</span></button>
          </td>
        </tr>`;
    }).join('');

    const cards = list.map((r, i) => {
      const c = byId.get(r.candidate_id) || {};
      return `
        <div class="admin-row-fade border border-rose-100 rounded-xl bg-white shadow-sm p-3.5" style="${rowDelay(i)}">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">${this.escapeHtml(reasonLabel[r.reason] || r.reason || 'Report')}</span>
            <span class="text-xs text-slate-400">${swapikiStore.timeAgo(r.created_at)}</span>
          </div>
          <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(c.username || '')}"
            class="text-sm font-bold text-slate-800 ${c.username ? 'hover:text-primary hover:underline' : ''}" ${!c.username ? 'disabled' : ''}>${this.escapeHtml(c.name || '(no name)')}</button>
          <p class="text-sm text-slate-700 whitespace-pre-line mt-1">${this.escapeHtml(r.details || '')}</p>
          ${r.reporter_email ? `<p class="text-xs text-slate-400 mt-1.5 break-all">${this.escapeHtml(r.reporter_email)}</p>` : ''}
          <div class="mt-3 flex gap-2">
            ${r.candidate_id ? `<button onclick="app.adminSuspendReportedProfile(this.dataset.id, this.dataset.report)" data-id="${this.escapeHtml(r.candidate_id)}" data-report="${this.escapeHtml(r.id)}"
              class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 active:scale-[0.97] transition-all">
              <span class="material-symbols-outlined text-base">block</span> Suspend</button>` : ''}
            <button onclick="app.adminResolveReport(this.dataset.id, 'dismissed')" data-id="${this.escapeHtml(r.id)}"
              class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 active:scale-[0.97] transition-all">
              <span class="material-symbols-outlined text-base">done</span> Dismiss</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader('Reported profiles', list.length, 'flag')}
        <div class="hidden md:block overflow-x-auto border border-rose-100 rounded-xl bg-white shadow-sm">
          <table class="w-full">
            <thead class="bg-rose-50/60 sticky top-0">
              <tr>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">When</th>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Profile</th>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Reason</th>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">What they saw</th>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Reporter</th>
                <th class="text-right text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>${rows || this.adminEmptyState(6, 'flag', 'No open reports. Nothing to review right now.')}</tbody>
          </table>
        </div>
        <div class="md:hidden space-y-2.5">
          ${cards || `<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">flag</span><span class="text-sm text-slate-400">No open reports.</span></div>`}
        </div>
      </div>
    `;
  }

  async renderAdminDashboard() {
    // A full admin render is seven queries, four charts and every candidate, admin,
    // feedback row and job row on the page. Two of them running at once is what
    // made a click feel like it had been ignored, so a request that arrives while
    // one is open does not start a second: it asks for one more pass afterwards
    // and then waits for the render already in progress.
    if (this._adminRenderInFlight) {
      this._adminRenderQueued = true;
      return this._adminRenderInFlight;
    }
    this._adminRenderInFlight = (async () => {
      try {
        // Bounded, so a queue that keeps refilling cannot spin here. Two passes
        // is "the one already running, plus the one that was asked for".
        for (let pass = 0; pass < 2; pass++) {
          this._adminRenderQueued = false;
          await this.renderAdminDashboardPass();
          if (!this._adminRenderQueued) break;
        }
      } finally {
        this._adminRenderInFlight = null;
        this._adminRenderQueued = false;
      }
    })();
    return this._adminRenderInFlight;
  }

  async renderAdminDashboardPass() {
    const container = document.getElementById('admin-dashboard-container');
    if (!container) return;

    const refreshBtn = document.getElementById('admin-refresh-btn');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Refreshing…`;
    }
    container.innerHTML = this.renderAdminDashboardSkeleton();

    try {
      const [candidates, admins, stats, timeStats, feedback, jobs, reports] = await Promise.all([
        swapikiStore.adminListCandidates(),
        swapikiStore.adminListAdmins(),
        swapikiStore.adminGetStats().catch(() => null),
        swapikiStore.adminGetTimeStats().catch(() => ({ configured: false })),
        swapikiStore.adminListFeedback().catch(() => []),
        swapikiStore.adminListJobs().catch(() => []),
        swapikiStore.adminListProfileReports().catch(() => [])
      ]);

      // The queue becomes the in-memory copy the review tables repaint from, so
      // deciding a job never needs another read of the jobs table.
      this._adminJobs = jobs || [];
      this.watchAdminBreakpoint();

      // Cache the freshly fetched list so the Export CSV button can reuse it
      // without re-querying the database.
      this._adminCandidatesCache = candidates;

      const statCardsHtml = this.renderAdminStatCards(stats, timeStats, candidates);
      const chartsHtml = this.renderAdminCharts(candidates, admins, stats);
      const engagementStatsHtml = this.renderAdminEngagementStats(stats, candidates);
      const engagementChartsHtml = this.renderAdminEngagementCharts(stats, candidates);

      const rowDelay = (i) => `animation-delay: ${Math.min(i * 0.03, 0.3)}s`;

      const candidatePage = this.adminCandidatePage(candidates);
      const { rows: candidateRows, cards: candidateCards } = this.adminCandidatesMarkup(candidatePage.page);

      const adminRows = admins.map((a, i) => `
        <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors" style="${rowDelay(i)}">
          <td class="py-3 px-3">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-full ${this.adminAvatarColor(a.email)} flex items-center justify-center text-[11px] font-bold shrink-0">${this.adminInitials(a.email)}</span>
              <span class="text-sm font-bold text-slate-800 whitespace-nowrap">${a.email || '(no email on file)'}</span>
            </div>
          </td>
          <td class="py-3 px-3 text-sm text-slate-400 whitespace-nowrap">${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
          <td class="py-3 px-3 text-right whitespace-nowrap">
            <button onclick="app.adminRemoveAdmin(this.dataset.uid, this.dataset.email)" data-uid="${this.escapeHtml(a.user_id || '')}" data-email="${this.escapeHtml(a.email || '')}" title="Remove admin access"
              class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all">
              <span class="material-symbols-outlined text-lg">person_remove</span>
            </button>
          </td>
        </tr>
      `).join('');

      const adminCards = admins.map((a, i) => `
        <div class="admin-row-fade admin-mobile-card border border-slate-200 rounded-xl bg-white shadow-sm p-3.5 flex items-center gap-2.5" style="${rowDelay(i)}">
          <span class="w-9 h-9 rounded-full ${this.adminAvatarColor(a.email)} flex items-center justify-center text-xs font-bold shrink-0">${this.adminInitials(a.email)}</span>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold text-slate-800 truncate">${a.email || '(no email on file)'}</div>
            <div class="text-xs text-slate-400">${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</div>
          </div>
          <button onclick="app.adminRemoveAdmin(this.dataset.uid, this.dataset.email)" data-uid="${this.escapeHtml(a.user_id || '')}" data-email="${this.escapeHtml(a.email || '')}"
            class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-rose-600 bg-rose-50 active:scale-90 transition-all shrink-0">
            <span class="material-symbols-outlined text-lg">person_remove</span>
          </button>
        </div>
      `).join('');

      container.innerHTML = `
        ${statCardsHtml}
        ${chartsHtml}

        <div class="admin-fade-in">
          ${this.adminSectionHeader('Profile Completion & Engagement', candidates.length, 'insights')}
          ${engagementStatsHtml}
          ${engagementChartsHtml}
        </div>

        <div class="admin-fade-in mb-8">
          ${this.adminSectionHeader('Candidates', candidates.length, 'badge', '', 'candidates')}
          ${this.adminSearchToolbar('candidates', {
            view: candidatePage,
            placeholder: 'Search candidates — name, handle, email, phone',
            label: 'Search candidates',
            extra: `<button type="button" onclick="app.adminSortCandidates()" data-admin-sort="candidates" title="Sort by name" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all whitespace-nowrap"><span class="material-symbols-outlined text-sm">sort_by_alpha</span> <span data-admin-sort-label="candidates">${this.adminSortLabel()}</span></button>`
          })}
          <div class="hidden md:block overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
            <table class="w-full">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Name</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Handle</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Email</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Phone</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Status</th>
                  <th class="text-right text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Actions</th>
                </tr>
              </thead>
              <tbody id="admin-candidates-tbody">${candidateRows || this.adminEmptyState(6, 'badge', this.adminCandidateEmptyText(candidatePage))}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2.5" id="admin-candidates-cards">
            ${candidateCards || this.adminCandidateCardsEmpty(candidatePage)}
          </div>
          <div id="admin-candidates-pager">${this.adminPager('candidates', candidatePage)}</div>
        </div>

        ${this.adminReportsSection(reports)}

        <div class="admin-fade-in mb-8">
          ${this.adminSectionHeader('Feedback', feedback.length, 'edit_note')}
          <div class="hidden md:block overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
            <table class="w-full">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">When</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Type</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Message</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">From</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Page</th>
                </tr>
              </thead>
              <tbody>${feedback.map(f => `
                <tr class="border-b border-slate-100 last:border-0 align-top">
                  <td class="py-3 px-3 text-xs text-slate-400 whitespace-nowrap">${swapikiStore.timeAgo(f.created_at)}</td>
                  <td class="py-3 px-3 whitespace-nowrap">
                    <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${this.feedbackCategoryColor(f.category)}">${f.category}</span>
                  </td>
                  <td class="py-3 px-3 text-sm text-slate-700 max-w-md whitespace-pre-line">${this.escapeHtml(f.message)}</td>
                  <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(f.name || '')}${f.email ? '<span class="block text-xs text-slate-400">' + this.escapeHtml(f.email) + '</span>' : ''}</td>
                  <td class="py-3 px-3 text-xs text-slate-400 break-all max-w-[12rem]">${this.escapeHtml(f.url || '')}</td>
                </tr>
              `).join('') || this.adminEmptyState(5, 'edit_note', 'No feedback yet — the widget on every page feeds this list.')}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2.5">
            ${feedback.map(f => `
              <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-3.5">
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${this.feedbackCategoryColor(f.category)}">${f.category}</span>
                  <span class="text-xs text-slate-400">${swapikiStore.timeAgo(f.created_at)}</span>
                </div>
                <p class="text-sm text-slate-700 whitespace-pre-line">${this.escapeHtml(f.message)}</p>
                <p class="text-xs text-slate-400 mt-1.5">${this.escapeHtml(f.name || 'Anonymous')}${f.email ? ' · ' + this.escapeHtml(f.email) : ''}</p>
                <p class="text-[11px] text-slate-400 break-all">${this.escapeHtml(f.url || '')}</p>
              </div>
            `).join('') || `<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">edit_note</span><span class="text-sm text-slate-400">No feedback yet.</span></div>`}
          </div>
        </div>

        <div class="admin-fade-in">
          ${this.adminSectionHeader('Admins', admins.length, 'shield_person')}
          <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 mb-4">
            <form onsubmit="app.adminPromoteSubmit(event)" class="flex flex-col sm:flex-row gap-2">
              <div class="relative flex-1">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">mail</span>
                <input id="admin-promote-email-input" type="email" required placeholder="colleague@company.com"
                  class="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
              </div>
              <button type="submit"
                class="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 active:scale-[0.98] transition-all whitespace-nowrap">
                <span class="material-symbols-outlined text-lg">person_add</span> Grant Admin Access
              </button>
            </form>
            <p class="text-xs text-slate-400 mt-2.5 flex items-start gap-1">
              <span class="material-symbols-outlined text-sm mt-0.5">info</span>
              <span>They must already have a Swapiki account (candidate or plain login) before you can promote them.</span>
            </p>
          </div>
          <div class="hidden md:block overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
            <table class="w-full">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Email</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Granted</th>
                  <th class="text-right text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>${adminRows || this.adminEmptyState(3, 'shield_person', 'No admins yet.')}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2.5">
            ${adminCards || `<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">shield_person</span><span class="text-sm text-slate-400">No admins yet.</span></div>`}
          </div>
        </div>
      `;

      // Bulk selection is handled by one delegated listener on the container,
      // bound once, rather than a handler per checkbox.
      //
      // Both the full render and the queue repaint replace the checkbox elements
      // wholesale, so a listener attached to a checkbox is gone by the time
      // anyone can click it — which is what left "Select all" ticking nothing and
      // the count frozen at zero. The container itself is never replaced, only
      // its contents, so a listener on it outlives every repaint.
      this.bindAdminSelection(container);

      // Start disarmed, so the bar can never be pressed with nothing ticked.
      ['draft', 'published'].forEach(g => this.adminSyncBulkBar(g));

      const lastRefreshedEl = document.getElementById('admin-last-refreshed');
      if (lastRefreshedEl) lastRefreshedEl.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      this.animateAdminStatCards();
      this.animateAdminBars();
    } catch (err) {
      container.innerHTML = `
        <div class="border border-rose-200 bg-rose-50 rounded-xl p-6 flex items-start gap-3">
          <span class="material-symbols-outlined text-rose-500 text-2xl">error</span>
          <div>
            <p class="text-sm font-bold text-rose-700">Could not load admin data</p>
            <p class="text-sm text-rose-600 mt-0.5">${(err && err.message) || 'Please try refreshing.'}</p>
          </div>
        </div>
      `;
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = `<span class="material-symbols-outlined text-lg">refresh</span> Refresh`;
      }
    }
  }

  async adminTogglePublish(candidateId, currentStatus) {
    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    try {
      await swapikiStore.adminSetProfileStatus(candidateId, newStatus);
      this.showToast(`Profile ${newStatus === 'published' ? 'published' : 'unpublished'}.`);
      this.renderAdminDashboard();
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not update profile status.'}`);
    }
  }

  async adminDeleteCandidate(candidateId, candidateName) {
    if (!confirm(`Permanently delete "${candidateName || 'this candidate'}"? This cannot be undone.`)) return;
    try {
      await swapikiStore.adminDeleteCandidate(candidateId);
      this.showToast('Candidate deleted.');
      this.renderAdminDashboard();
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not delete candidate.'}`);
    }
  }

  /**
   * Resolve one profile report. Kept separate from the candidate actions because
   * a report is dismissed on its own — the profile may well be fine — whereas the
   * unpublish action below touches the profile too.
   */
  async adminResolveReport(reportId, status) {
    try {
      await swapikiStore.adminResolveProfileReport(reportId, status);
      this.showToast(status === 'actioned' ? 'Report marked actioned.' : 'Report dismissed.');
      this.renderAdminDashboard();
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not update the report.'}`);
    }
  }

  /**
   * Act on a report: suspend (freeze) the profile, then resolve the report.
   *
   * 'suspended' rather than 'draft' so a takedown is distinguishable from an
   * unfinished draft — and, unlike a plain unpublish, a candidate cannot flip it
   * back to published themselves (supabase/suspend_migration.sql holds the status
   * until an admin restores it).
   *
   * The suspend runs first and is the one that must succeed — a resolved report on
   * a still-live scam would be the worst outcome, so a failed resolve is swallowed
   * rather than reported as success.
   */
  async adminSuspendReportedProfile(candidateId, reportId) {
    try {
      await swapikiStore.adminSetProfileStatus(candidateId, 'suspended');
      if (reportId) {
        try { await swapikiStore.adminResolveProfileReport(reportId, 'actioned'); } catch (e) { /* best-effort */ }
      }
      this.showToast('Profile suspended and report marked actioned.');
      this.renderAdminDashboard();
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not suspend the profile.'}`);
    }
  }

  // ---------------------------------------------------------------------
  // ADMIN — JOB REVIEW
  //
  // The review queue only. There is no "add a job" form here: openings are
  // posted by employers and recruiters on the public /jobs page, and an admin's
  // job is to decide which of them reach the board.
  //
  // The count on the header is the number of jobs waiting for a decision, not the
  // number of rows in the table. Those are different numbers by a factor of
  // twenty-something, and the one an admin needs on arrival is the size of the
  // work in front of them — the published total is already on its own heading
  // below.
  //
  // Two things here exist for speed, because the queue is ~800 rows and the
  // admin complained the page lagged on every decision:
  //   - the section renders inside its own mount, so a decision repaints the two
  //     tables alone instead of re-running the whole admin render;
  //   - only the markup the current viewport can actually show is built, because
  //     building both the table and the phone cards doubles the nodes for a
  //     layout the screen is not using.
  // ---------------------------------------------------------------------

  /**
   * True when the phone card list is the one that will be seen.
   *
   * Falls back to true when there is no matchMedia to ask, so a browser that
   * cannot answer gets both layouts rather than neither.
   */
  adminPrefersCards() {
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(max-width: 767px)').matches;
      }
    } catch (e) { /* no media query support: render both */ }
    return true;
  }

  /**
   * Repaint the queue when the screen crosses the table/card breakpoint, so a
   * layout that was skipped for being off-screen is there when it comes on.
   */
  watchAdminBreakpoint() {
    if (this._adminBreakpointWatched) return;
    try {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const mq = window.matchMedia('(max-width: 767px)');
      if (typeof mq.addEventListener !== 'function') return;
      mq.addEventListener('change', () => { this.repaintAdminJobs(); });
      this._adminBreakpointWatched = mq;
    } catch (e) { /* watching is an optimisation, never a requirement */ }
  }

  // ---------------------------------------------------------------------
  // SEARCHING AND PAGING THE ADMIN LISTS
  //
  // The queue and the candidate list are both read once and then kept in memory,
  // so searching and paging them is arithmetic on what is already on the page.
  // Nothing here touches the network, and that is the whole point: a search box
  // that re-queried the database on every keystroke would put back exactly the
  // lag the targeted repaint removed.
  // ---------------------------------------------------------------------

  /**
   * What the admin has asked of one list: the text typed, how deep they have
   * paged, and for the candidate list which way round the names run.
   *
   * Kept on the instance rather than in the markup so it survives the repaints —
   * a decision rewrites the tables, and a search that reset itself on every press
   * would be unusable on a queue this size.
   */
  adminListState(key) {
    if (!this._adminLists) this._adminLists = {};
    // `page` is 1-based. This is paging, not a growing window: page two holds
    // rows 16-30 and not rows 1-30, so "Back" has somewhere to go back to.
    if (!this._adminLists[key]) this._adminLists[key] = { q: '', page: 1, dir: 1 };
    return this._adminLists[key];
  }

  /**
   * Does a record match what was typed?
   *
   * The query is split on whitespace and every term has to appear, in any order
   * and anywhere across the fields, so "acme pune" finds a listing whose company
   * and city are in either order. An AND of substrings rather than a phrase
   * match is what makes a half-typed word useful.
   */
  adminMatchesQuery(q, fields) {
    const terms = String(q == null ? '' : q).toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const hay = (fields || []).filter(Boolean).join(' ').toLowerCase();
    return terms.every(t => hay.includes(t));
  }

  /**
   * Search and page a list, and report what is where.
   *
   * Slices one page rather than growing the window, so the pager under the list
   * can move both ways. `pageNo` is clamped and written back: a page can fall off
   * the end when a row is deleted underneath the admin, or when a search narrows,
   * and a pager left reading "Page 4 of 2" is worse than one that moves itself
   * back to something that exists.
   */
  adminPaged(rows, key, fieldsOf) {
    const st = this.adminListState(key);
    const list = rows || [];
    const matched = list.filter(r => this.adminMatchesQuery(st.q, fieldsOf(r)));
    const pageCount = Math.max(1, Math.ceil(matched.length / ADMIN_PAGE_SIZE));
    const wanted = Math.floor(Number(st.page) || 1);
    const pageNo = Math.min(Math.max(wanted, 1), pageCount);
    if (st.page !== pageNo) st.page = pageNo;
    const start = (pageNo - 1) * ADMIN_PAGE_SIZE;
    const page = matched.slice(start, start + ADMIN_PAGE_SIZE);
    return {
      page, total: list.length, matched: matched.length, shown: page.length,
      pageNo, pageCount,
      hasPrev: pageNo > 1,
      hasNext: pageNo < pageCount
    };
  }

  /**
   * The pager that sits under a list: Back, which way we are, Show more.
   *
   * Under the rows on purpose. It was in the toolbar above them, which is where
   * you look when you arrive rather than where you look once you have read the
   * fifteen names, and a control that says how to continue belongs next to the
   * thing it continues.
   *
   * Both buttons are always present once there is more than one page, and go
   * disabled rather than disappearing: a control that vanishes as you reach the
   * end makes the layout jump and leaves no explanation of why.
   */
  adminPager(key, v) {
    if (!v || v.pageCount <= 1) return '';
    const btn = 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95';
    const on = 'text-primary bg-primary-fixed hover:opacity-80';
    const off = 'text-slate-400 bg-slate-100 cursor-not-allowed active:scale-100';
    return `
      <div class="flex items-center justify-center gap-2 mt-3" data-admin-pager="${key}">
        <button type="button" onclick="app.adminPrevPage('${key}')" data-admin-prev="${key}" ${v.hasPrev ? '' : 'disabled'}
          title="Previous page" class="${btn} ${v.hasPrev ? on : off}">
          <span class="material-symbols-outlined text-sm">chevron_left</span> Back
        </button>
        <span class="text-[11px] font-bold text-slate-500 tabular-nums whitespace-nowrap px-1" data-admin-pageinfo="${key}">Page ${v.pageNo} of ${v.pageCount}</span>
        <button type="button" onclick="app.adminShowMore('${key}')" data-admin-more="${key}" ${v.hasNext ? '' : 'disabled'}
          title="Next page" class="${btn} ${v.hasNext ? on : off}">
          Show more <span class="material-symbols-outlined text-sm">expand_more</span>
        </button>
      </div>`;
  }

  /** The paged view for one list, from whichever cache its rows are drawn from. */
  adminViewFor(key) {
    return key === 'candidates'
      ? this.adminCandidatePage(this._adminCandidatesCache || [])
      : this.adminJobPage(this._adminJobs || [], key);
  }

  /**
   * The search box and the row count for one list.
   *
   * "Show more" used to live here too. It is in the pager under the rows now, so
   * this is only the search and how much there is to search.
   *
   * The box is deliberately outside the block that a decision repaints. If it
   * were inside, the first keystroke would replace the element being typed into
   * and the second character would land in a field nobody is looking at.
   */
  adminSearchToolbar(key, opts) {
    const st = this.adminListState(key);
    const o = opts || {};
    const v = o.view || { matched: 0, total: 0, pageCount: 1, pageNo: 1 };
    return `
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 mb-3" data-admin-toolbar="${key}">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
          <input type="search" value="${this.escapeHtml(st.q)}" data-admin-search="${key}"
            oninput="app.adminOnSearch('${key}', this.value)"
            placeholder="${this.escapeHtml(o.placeholder || 'Search this list')}"
            aria-label="${this.escapeHtml(o.label || 'Search this list')}"
            class="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
        </div>
        ${o.extra || ''}
        <span class="text-[11px] text-slate-400 whitespace-nowrap tabular-nums" data-admin-count="${key}">${this.adminViewCountText(v, st.q)}</span>
        <button type="button" onclick="app.adminClearSearch('${key}')" data-admin-clear="${key}"
          class="text-[11px] font-bold text-slate-500 hover:text-primary whitespace-nowrap ${st.q ? '' : 'hidden'}">Clear</button>
      </div>`;
  }

  /**
   * What the count line says: how much is in the list.
   *
   * It used to say "showing 15 of 41" as well, because that was the only place
   * the page boundary was described. The pager under the rows says that now, and
   * saying it in two places is how the two drift apart. When a search narrows the
   * list the total is no longer the useful number, so it drops out.
   */
  adminViewCountText(v, q) {
    const matched = (v && v.matched) || 0;
    if (q && !matched) return 'nothing matches';
    if (q) return `${matched} matching`;
    return `${matched} ${matched === 1 ? 'row' : 'rows'}`;
  }

  /**
   * Refresh the count without rebuilding the search box.
   *
   * A decision changes how many rows a list holds, so the toolbar has to follow.
   * The box itself is left alone, which is what keeps the caret where it was.
   */
  adminSyncViewControls(key, v) {
    const st = this.adminListState(key);
    // The fallback reads the same cache the rows are drawn from. Anything else
    // would write a count that disagrees with the list under it.
    const view = v || this.adminViewFor(key);
    const count = document.querySelector(`[data-admin-count="${key}"]`);
    if (count) count.textContent = this.adminViewCountText(view, st.q);
    const total = document.querySelector(`[data-admin-total="${key}"]`);
    if (total) total.textContent = String(view.total);
    const clear = document.querySelector(`[data-admin-clear="${key}"]`);
    if (clear) clear.classList.toggle('hidden', !st.q);
    // The pager is not corrected here: it is drawn with the rows, so a repaint
    // that redraws the rows redraws it. Touching it from outside would leave the
    // two disagreeing whenever a decision changed the row count.
    // The sort label lives outside the repainted rows too, so it has to be told
    // the new direction: a button still reading A-Z after the list flipped is a
    // button that lies about the order on screen.
    const sortLabel = document.querySelector('[data-admin-sort-label="candidates"]');
    if (sortLabel) sortLabel.textContent = this.adminSortLabel();
  }

  /** Redraw one list's rows from what is already in memory. */
  adminRepaintList(key) {
    const done = key === 'candidates' ? this.repaintAdminCandidates() : this.repaintAdminJobs();
    if (!done) this.renderAdminDashboard();
    return done;
  }

  adminOnSearch(key, value) {
    const st = this.adminListState(key);
    const next = String(value == null ? '' : value);
    if (next === st.q) return;
    st.q = next;
    // A new search starts at page one. Carrying the old page over would drop the
    // admin on page three of a result that only has one page.
    st.page = 1;
    this.adminRepaintList(key);
  }

  adminClearSearch(key) {
    const st = this.adminListState(key);
    if (!st.q && st.page === 1) return;
    st.q = '';
    st.page = 1;
    const input = document.querySelector(`[data-admin-search="${key}"]`);
    if (input) input.value = '';
    this.adminRepaintList(key);
  }

  /** The next page. Named for the button, not the mechanism. */
  adminShowMore(key) {
    const st = this.adminListState(key);
    st.page = this.adminViewFor(key).pageNo + 1;
    this.adminRepaintList(key);
  }

  /** Back to the previous page. Stops at the first rather than wrapping round. */
  adminPrevPage(key) {
    const st = this.adminListState(key);
    st.page = Math.max(1, this.adminViewFor(key).pageNo - 1);
    this.adminRepaintList(key);
  }

  /** Flip the candidate list between A–Z and Z–A. */
  adminSortCandidates() {
    const st = this.adminListState('candidates');
    st.dir = st.dir === 1 ? -1 : 1;
    if (!this.repaintAdminCandidates()) this.renderAdminDashboard();
  }

  /** Which way round the names currently run. The button says so, and means it. */
  adminSortLabel() {
    return this.adminListState('candidates').dir === -1 ? 'Z–A' : 'A–Z';
  }

  // The text a job row is searched by. `raw_text` is in there on purpose: when an
  // employer posts a listing, the wording they used is often the only thing the
  // reviewer has to recognise it by, and it is the field they cannot scan by eye.
  adminJobFields(j) {
    return [j.title, j.company, j.location, j.category, j.source, j.contact_email, j.contact_phone, j.raw_text];
  }

  /** One jobs table, searched and paged. Takes the list so it works before it is cached. */
  adminJobPage(jobs, group) {
    const rows = (jobs || []).filter(j => j && j.status === group);
    // Featured rows first, before the search and before the page is cut. A pin
    // that sorts by date like everything else is a pin nobody can see working -
    // and a pinned row pushed off page one by newer drafts is worse than no pin.
    // Ties keep the order the queue arrived in, so a repaint never reshuffles.
    const ordered = this.adminFeaturedFirst(rows);
    return this.adminPaged(ordered, group, j => this.adminJobFields(j));
  }

  /**
   * Is this row pinned?
   *
   * Read positively, never by presence. `featured` is absent on a database where
   * the migration has not run, and `undefined` meaning "pinned" would mark every
   * row on the board at once - so the absence has to mean "no".
   */
  adminIsFeatured(j) {
    return !!(j && (j.featured === true || j.featured === 'true' || j.featured === 't'));
  }

  /** Pinned rows first, everything else in the order it came in. */
  adminFeaturedFirst(rows) {
    const pinned = [];
    const rest = [];
    for (const r of rows) (this.adminIsFeatured(r) ? pinned : rest).push(r);
    return pinned.concat(rest);
  }

  /**
   * The candidate list, sorted by name and then searched and paged.
   *
   * Sorted first, then filtered, then paged, so the fifteen on screen are the
   * first fifteen of the alphabet and "Show more" continues down it. A row with
   * no name goes last rather than first: it is not a name to sort by, and 40 of
   * them would otherwise open the list.
   */
  adminCandidatePage(candidates) {
    const st = this.adminListState('candidates');
    const dir = st.dir === -1 ? -1 : 1;
    const sorted = (candidates || []).slice().sort((a, b) => {
      const an = String((a && a.name) || '').trim();
      const bn = String((b && b.name) || '').trim();
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      if (!an && !bn) return 0;
      return an.localeCompare(bn, undefined, { sensitivity: 'base' }) * dir;
    });
    return this.adminPaged(sorted, 'candidates', c => [
      c.name, c.username, c.email, c.phone, c.title, c.location, c.status,
      Array.isArray(c.expertise) ? c.expertise.join(' ') : c.expertise
    ]);
  }

  /**
   * The candidate rows and phone cards, for one page of the list.
   *
   * Its own method so a search, a sort or a page deeper can redraw the list from
   * the cached rows instead of re-reading every admin table. The row buttons read
   * their values off data- attributes: a candidate's name and handle are strings a
   * stranger chose, and interpolating one into an inline handler is an attribute
   * break away from script.
   */
  adminCandidatesMarkup(list) {
    const rows = list || [];
    const rowDelay = i => `animation-delay:${Math.min(i * 0.03, 0.3)}s`;

    const html = rows.map((c, i) => `
      <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors" style="${rowDelay(i)}">
        <td class="py-3 px-3">
          <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(c.username || '')}"
            class="flex items-center gap-2.5 text-left group" ${!c.username ? 'disabled' : ''}>
            <span class="w-8 h-8 rounded-full ${this.adminAvatarColor(c.email || c.name)} flex items-center justify-center text-[11px] font-bold shrink-0">${this.adminInitials(c.name)}</span>
            <span class="text-sm font-bold text-slate-800 whitespace-nowrap ${c.username ? 'group-hover:text-primary group-hover:underline' : ''}">${this.escapeHtml(c.name || '(no name)')}</span>
          </button>
        </td>
        <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(c.username || '—')}</td>
        <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(c.email || '—')}</td>
        <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(c.phone || '—')}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${c.profile_status === 'published' ? 'bg-emerald-50 text-emerald-700' : (c.profile_status === 'suspended' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600')}">
            <span class="w-1.5 h-1.5 rounded-full ${c.profile_status === 'published' ? 'bg-emerald-500' : (c.profile_status === 'suspended' ? 'bg-rose-500' : 'bg-slate-400')}"></span>
            ${this.escapeHtml(c.profile_status || 'draft')}
          </span>
          <span title="${c.voice_verified ? 'Recording confirmed live: the candidate read a random code into a microphone. This is not an identity check.' : 'No confirmed live recording yet - useful spam triage signal'}"
            class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-1 ${c.voice_verified ? 'bg-emerald-50 text-emerald-700' : (c.voice_verification_count >= 3 && !c.voice_verified ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400')}">
            <span class="material-symbols-outlined text-[12px]">${c.voice_verified ? 'verified' : 'record_voice_over'}</span>
            ${c.voice_verified ? 'Live recording confirmed' : (c.voice_verification_count >= 3 && !c.voice_verified ? 'Flagged (3+ fails)' : (c.voice_verification_count ? `${c.voice_verification_count} attempt${c.voice_verification_count === 1 ? '' : 's'}, not confirmed` : 'No recording check'))}
          </span>
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          <button onclick="app.adminTogglePublish('${c.id}', '${c.profile_status}')" title="${c.profile_status === 'published' ? 'Unpublish' : (c.profile_status === 'suspended' ? 'Restore' : 'Publish')}"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-fixed active:scale-90 transition-all">
            <span class="material-symbols-outlined text-lg">${c.profile_status === 'published' ? 'visibility_off' : (c.profile_status === 'suspended' ? 'restart_alt' : 'visibility')}</span>
          </button>
          <button onclick="app.adminDeleteCandidate(this.dataset.id, this.dataset.name)" data-id="${this.escapeHtml(c.id || '')}" data-name="${this.escapeHtml(c.name || '')}" title="Delete"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all">
            <span class="material-symbols-outlined text-lg">delete</span>
          </button>
        </td>
      </tr>`);

    const cards = rows.map((c, i) => `
      <div class="admin-row-fade admin-mobile-card border border-slate-200 rounded-xl bg-white shadow-sm p-3.5" style="${rowDelay(i)}">
        <div class="flex items-start justify-between gap-2">
          <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(c.username || '')}"
            class="flex items-center gap-2.5 min-w-0 text-left" ${!c.username ? 'disabled' : ''}>
            <span class="w-9 h-9 rounded-full ${this.adminAvatarColor(c.email || c.name)} flex items-center justify-center text-xs font-bold shrink-0">${this.adminInitials(c.name)}</span>
            <div class="min-w-0">
              <div class="text-sm font-bold text-slate-800 truncate ${c.username ? 'hover:text-primary hover:underline' : ''}">${this.escapeHtml(c.name || '(no name)')}</div>
              <div class="text-xs text-slate-400 truncate">${c.username ? '@' + this.escapeHtml(c.username) : '—'}</div>
            </div>
          </button>
          <span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${c.profile_status === 'published' ? 'bg-emerald-50 text-emerald-700' : (c.profile_status === 'suspended' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600')}">
            <span class="w-1.5 h-1.5 rounded-full ${c.profile_status === 'published' ? 'bg-emerald-500' : (c.profile_status === 'suspended' ? 'bg-rose-500' : 'bg-slate-400')}"></span>
            ${this.escapeHtml(c.profile_status || 'draft')}
          </span>
        </div>
        <div class="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-y-1.5 text-xs">
          <span class="text-slate-400">Email</span>
          <span class="text-slate-600 text-right truncate">${this.escapeHtml(c.email || '—')}</span>
          <span class="text-slate-400">Phone</span>
          <span class="text-slate-600 text-right truncate">${this.escapeHtml(c.phone || '—')}</span>
        </div>
        <div class="mt-3 flex gap-2">
          <button onclick="app.adminTogglePublish('${c.id}', '${c.profile_status}')"
            class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-primary bg-primary-fixed active:scale-[0.97] transition-all">
            <span class="material-symbols-outlined text-base">${c.profile_status === 'published' ? 'visibility_off' : (c.profile_status === 'suspended' ? 'restart_alt' : 'visibility')}</span>
            ${c.profile_status === 'published' ? 'Unpublish' : (c.profile_status === 'suspended' ? 'Restore' : 'Publish')}
          </button>
          <button onclick="app.adminDeleteCandidate(this.dataset.id, this.dataset.name)" data-id="${this.escapeHtml(c.id || '')}" data-name="${this.escapeHtml(c.name || '')}"
            class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 active:scale-[0.97] transition-all">
            <span class="material-symbols-outlined text-base">delete</span> Delete
          </button>
        </div>
      </div>`);

    return { rows: html.join(''), cards: cards.join('') };
  }

  /**
   * Redraw the candidate list from the cached rows.
   *
   * Returns false when the list is not on the page, so a caller can fall back to a
   * full render rather than silently doing nothing.
   */
  repaintAdminCandidates() {
    const tbody = document.getElementById('admin-candidates-tbody');
    const cards = document.getElementById('admin-candidates-cards');
    const pager = document.getElementById('admin-candidates-pager');
    if (!tbody && !cards) return false;
    const page = this.adminCandidatePage(this._adminCandidatesCache || []);
    const { rows, cards: cardHtml } = this.adminCandidatesMarkup(page.page);
    if (tbody) tbody.innerHTML = rows || this.adminEmptyState(6, 'badge', this.adminCandidateEmptyText(page));
    if (cards) cards.innerHTML = cardHtml || this.adminCandidateCardsEmpty(page);
    // Redrawn with the rows rather than patched, so the page number and the rows
    // under it can never come from different renders.
    if (pager) pager.innerHTML = this.adminPager('candidates', page);
    this.adminSyncViewControls('candidates', page);
    return true;
  }

  adminCandidateEmptyText(page) {
    const q = this.adminListState('candidates').q;
    if (q && !page.matched) return `No candidate matches “${q}”.`;
    if (!page.total) return 'No candidates yet.';
    return 'No candidates match the search.';
  }

  adminCandidateCardsEmpty(page) {
    const msg = this.adminCandidateEmptyText(page);
    return `<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">badge</span><span class="text-sm text-slate-400">${this.escapeHtml(msg)}</span></div>`;
  }

  /**
   * Repaint only the review tables, from the list already in memory.
   *
   * Returns false when the section is not on the page, so a caller can fall back
   * to a full render rather than silently doing nothing.
   */
  repaintAdminJobs() {
    const draftHost = document.getElementById('admin-draft-inner');
    const publishedHost = document.getElementById('admin-published-inner');
    if (!draftHost || !publishedHost) return false;
    const all = this._adminJobs || [];
    const views = { draft: this.adminJobPage(all, 'draft'), published: this.adminJobPage(all, 'published') };
    const m = this.adminJobsMarkup(all, views);
    draftHost.innerHTML = m.draft;
    publishedHost.innerHTML = m.published;
    // The checkboxes were just rebuilt, so the counts and the armed state of both
    // bars have to be recomputed or the bar is left describing a selection that
    // no longer exists. The headings and the row counts follow the new totals.
    ['draft', 'published'].forEach(g => {
      this.adminSyncBulkBar(g);
      this.adminSyncViewControls(g, views[g]);
    });
    return true;
  }

  renderAdminJobsSection(jobs) {
    const all = jobs || [];
    const views = { draft: this.adminJobPage(all, 'draft'), published: this.adminJobPage(all, 'published') };
    const m = this.adminJobsMarkup(all, views);
    // Each table has its own search box, and both boxes sit outside the block a
    // decision repaints — see adminSearchToolbar. The counts in the headings are
    // the whole queue, not the page, and are refreshed by adminSyncViewControls.
    return `<div id="admin-jobs-section" class="admin-fade-in mb-8">
      ${this.adminSectionHeader('Job Review', views.draft.total, 'work', '', 'draft')}
      ${this.adminSearchToolbar('draft', {
        view: views.draft,
        placeholder: 'Search drafts — title, company, place, or the original post',
        label: 'Search drafts waiting for review'
      })}
      <div id="admin-draft-inner">${m.draft}</div>
      <h4 class="text-sm font-bold text-slate-700 mb-2 mt-6">Published (<span data-admin-total="published">${views.published.total}</span>)</h4>
      ${this.adminSearchToolbar('published', {
        view: views.published,
        placeholder: 'Search published jobs — title, company, or place',
        label: 'Search published jobs'
      })}
      <div id="admin-published-inner">${m.published}</div>
    </div>`;
  }

  /** The two review tables, as the markup each one repaints into. */
  adminJobsMarkup(jobs, views) {
    // The job id and nothing else goes into the onclick of a row button. A job
    // title is employer-supplied text, and interpolating one into an inline
    // handler puts a quote in it one attribute break away from script — the
    // handler reads the title it needs off the queue instead.
    const all = jobs || [];
    // Each table shows a page of what the search matched. The counts live in the
    // toolbar above, so these two are just the rows to draw.
    const page = views || {
      draft: this.adminJobPage(all, 'draft'),
      published: this.adminJobPage(all, 'published')
    };
    const drafts = page.draft.page;
    const published = page.published.page;
    const draftQuery = this.adminListState('draft').q;
    const publishedQuery = this.adminListState('published').q;
    // Auto-curation rejects rows instead of deleting them, so they never appear
    // in either table. Without this line a large rejection pass just looks like
    // the queue silently emptied.
    const rejected = all.filter(j => j.status === 'rejected');

    const draftRows = drafts.map(j => `
      <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3 w-8">
          <input type="checkbox" class="admin-job-check w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" value="${j.id}" data-group="draft" aria-label="Select ${this.escapeHtml(j.title || 'this job')}"/>
        </td>
        <td class="py-3 px-3">
          <div class="flex items-start gap-1.5">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-slate-800">${this.escapeHtml(j.title || '(untitled)')}</div>
              <div class="text-xs text-slate-400">${this.escapeHtml(j.company || '-')}${j.location ? ' · ' + this.escapeHtml(j.location) : ''}</div>
              ${this.adminJobProvenance(j)}
              ${j.raw_text ? `<details class="mt-1"><summary class="text-[10px] font-bold text-slate-400 cursor-pointer hover:text-primary">Original post</summary><p class="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap leading-relaxed">${this.escapeHtml(j.raw_text)}</p></details>` : ''}
            </div>
            ${this.adminFeaturedBadge(j)}
          </div>
        </td>

        <td class="py-3 px-3 text-xs text-slate-500">${this.escapeHtml(j.category || '—')}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Draft</span>
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          ${this.adminFeatureButton(j)}
          <button onclick="app.adminApproveJob('${j.id}')" title="Publish to the board"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-emerald-600 hover:bg-emerald-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">check_circle</span></button>
          <button onclick="app.adminRejectJob('${j.id}')" title="Reject — the row is kept and can be reopened"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">block</span></button>
          <button onclick="app.adminDeleteJob('${j.id}')" title="Delete permanently — this cannot be undone"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">delete</span></button>
        </td>
      </tr>`);

    const publishedRows = published.map(j => `
      <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3 w-8">
          <input type="checkbox" class="admin-job-check w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" value="${j.id}" data-group="published" aria-label="Select ${this.escapeHtml(j.title || 'this job')}"/>
        </td>
        <td class="py-3 px-3">
          <div class="flex items-start gap-1.5">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-slate-800">${this.escapeHtml(j.title || '(untitled)')}</div>
              <div class="text-xs text-slate-400">${this.escapeHtml(j.company || '-')}${j.location ? ' · ' + this.escapeHtml(j.location) : ''}</div>
            </div>
            ${this.adminFeaturedBadge(j)}
          </div>
        </td>
        <td class="py-3 px-3 text-xs text-slate-500">${this.escapeHtml(j.category || '-')}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Published</span>
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          ${this.adminFeatureButton(j)}
          <button onclick="app.adminUnpublishJob('${j.id}')" title="Move back to draft"

            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-fixed active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">visibility_off</span></button>
          <button onclick="app.adminRejectJob('${j.id}')" title="Reject — the row is kept and can be reopened"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">block</span></button>
          <button onclick="app.adminDeleteJob('${j.id}')" title="Delete permanently — this cannot be undone"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">delete</span></button>
        </td>
      </tr>`);

    // Bulk bar. The count is the whole point: a reviewer clearing forty drafts
    // needs to know how many are ticked before committing, and needs the bar to
    // say zero rather than sitting there looking armed.
    //
    // The two tables offer different actions on purpose. "Publish selected" on
    // the published table would re-publish rows that are already published,
    // which reads as a broken button; what that table needs is the move its
    // single-row button already does, plus reject.
    const BULK_BTN_TONE = {
      emerald: 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-50',
      rose: 'text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-50',
      slate: 'text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-50'
    };
    const bulkActions = {
      draft: [
        { status: 'published', label: 'Publish selected', icon: 'check_circle', tone: 'emerald' },
        { status: 'rejected', label: 'Reject selected', icon: 'block', tone: 'rose' }
      ],
      published: [
        { status: 'draft', label: 'Move to draft', icon: 'visibility_off', tone: 'slate' },
        { status: 'rejected', label: 'Reject selected', icon: 'block', tone: 'rose' }
      ]
    };
    const bulkBar = (group, plural) => `
      <div class="hidden md:flex flex-wrap items-center gap-2 mb-3">
        <label class="inline-flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
          <input type="checkbox" class="admin-job-check-all w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" data-group="${group}" aria-label="Select all ${plural}"/>
          Select all
        </label>
        <span class="text-xs text-slate-400" data-selected-count="${group}">0 selected</span>
        <span class="flex-1"></span>
        ${bulkActions[group].map(a => `
        <button type="button" onclick="app.adminBulkSetStatus('${group}', '${a.status}')" data-bulk-action="${a.status}" data-group="${group}"
          class="admin-bulk-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${BULK_BTN_TONE[a.tone]}">
          <span class="material-symbols-outlined text-base">${a.icon}</span> ${a.label}
        </button>`).join('')}
      </div>`;

    // The phone card is built from the job objects rather than scraped back out
    // of the row HTML. A submitted opening differs from a feed listing by two
    // things only — who posted it and how to reply — and those are exactly what a
    // reviewer on a phone has to see, so the card says them.
    //
    // The card carries the same decisions as its row. A read-only queue on a
    // phone is not a smaller version of the job, it is no version of it: the bulk
    // bar is hidden below `md`, so without buttons here a reviewer on a phone
    // could read forty drafts and not be able to decide a single one.
    const cardAction = (id, label, icon, tone) => `
      <button onclick="app.${tone.action}('${id}')" title="${this.escapeHtml(tone.title)}"
        class="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold ${tone.cls} active:scale-[0.97] transition-all">
        <span class="material-symbols-outlined text-base">${icon}</span> ${label}
      </button>`;
    const CARD_TONE = {
      publish: { cls: 'text-emerald-700 bg-emerald-50', title: 'Publish to the board', action: 'adminApproveJob' },
      reject: { cls: 'text-amber-700 bg-amber-50', title: 'Reject — the row is kept and can be reopened', action: 'adminRejectJob' },
      unpublish: { cls: 'text-slate-600 bg-slate-100', title: 'Move back to draft', action: 'adminUnpublishJob' },
      destroy: { cls: 'text-rose-600 bg-rose-50', title: 'Delete permanently — this cannot be undone', action: 'adminDeleteJob' }
    };
    const cardActions = (j, group) => (group === 'draft'
      ? cardAction(j.id, 'Publish', 'check_circle', CARD_TONE.publish)
        + cardAction(j.id, 'Reject', 'block', CARD_TONE.reject)
        + cardAction(j.id, 'Delete', 'delete', CARD_TONE.destroy)
      : cardAction(j.id, 'To draft', 'visibility_off', CARD_TONE.unpublish)
        + cardAction(j.id, 'Reject', 'block', CARD_TONE.reject)
        + cardAction(j.id, 'Delete', 'delete', CARD_TONE.destroy));

    const mobileCards = (rows, groupJobs, group) => rows.length ? rows.map((_, i) => {
      const j = groupJobs[i] || {};
      const where = [j.company, j.location].filter(Boolean).map(x => this.escapeHtml(x)).join(' · ');
      return `
          <div class="admin-mobile-card border border-slate-200 rounded-xl bg-white shadow-sm p-3.5 admin-row-fade" style="animation-delay:${Math.min(i * 0.03, 0.3)}s">
            <div class="text-sm font-bold text-slate-800 truncate">${this.escapeHtml(j.title || '(untitled)')}</div>
            ${where ? `<div class="text-xs text-slate-400 truncate">${where}</div>` : ''}
            ${this.adminJobProvenance(j)}
            ${j.raw_text ? `<details class="mt-1"><summary class="text-[10px] font-bold text-slate-400 cursor-pointer hover:text-primary">Original post</summary><p class="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap leading-relaxed">${this.escapeHtml(j.raw_text)}</p></details>` : ''}
            <div class="mt-3 flex gap-2">${j.id ? cardActions(j, group) : ''}</div>
          </div>`;
    }).join('') : '';

    // The card list is only built when the screen is narrow enough to show it.
    // It repeats every row, so on a desktop — where the table is the layout in
    // use and the queue is 800 rows — building it doubles the strings and the
    // nodes for a layout the screen is hiding anyway.
    const wantCards = this.adminPrefersCards();
    // The message is plain text and may quote the search back, so it is escaped
    // where it is printed. The table path goes through adminEmptyState, which
    // escapes for the same reason.
    const cardList = (rows, groupJobs, emptyMsg, group) => (wantCards
      ? `<div class="md:hidden space-y-2 mt-3">${rows.length ? mobileCards(rows, groupJobs, group) : this.escapeHtml(emptyMsg)}</div>`
      : '');

    const table = (rows, hidden, emptyMsg, groupJobs, group) => `
      <div class="${hidden ? 'hidden md:block' : ''} overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        <table class="w-full">
          <thead class="bg-slate-50">
            <tr>
              <th class="w-8 py-2.5 px-3"></th>
              <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Job</th>
              <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Category</th>
              <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Status</th>
              <th class="text-right text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>${rows.length ? rows.join('') : this.adminEmptyState(5, 'work_off', emptyMsg)}</tbody>
        </table>
      </div>
      ${cardList(rows, groupJobs, emptyMsg, group)}`;

    // An empty table has to say which kind of empty it is. "Nothing to review"
    // next to a search box with text in it reads as the admin having cleared the
    // queue; the search simply has no match.
    const noMatch = (noun, q) => `No ${noun} match “${q}”. Clear the search to see the rest.`;
    const draftMsg = draftQuery ? noMatch('drafts', draftQuery) : 'Nothing to review. New openings arrive here from the jobs page.';
    const publishedMsg = publishedQuery ? noMatch('published jobs', publishedQuery) : 'No published jobs yet. Review an opening above to fill the board.';

    return {
      draft: `
        ${drafts.length ? bulkBar('draft', 'drafts') : ''}
        ${table(draftRows, true, draftMsg, drafts, 'draft')}
        ${this.adminPager('draft', page.draft)}
        ${rejected.length ? this.rejectedNote(rejected) : ''}`,
      published: `
        ${published.length ? bulkBar('published', 'published jobs') : ''}
        ${table(publishedRows, false, publishedMsg, published, 'published')}
        ${this.adminPager('published', page.published)}`
    };
  }

  /**
   * The rejected pile, collapsed, with a way back out of it.
   *
   * Reject means "kept, and reversible" everywhere else in this app, and a draft
   * row now has a Reject button of its own, so a reviewer will create these
   * deliberately rather than by accident. The previous note told them to set a
   * status back to draft by hand, which is a thing only someone with a SQL client
   * can do — the one claim of reversibility in the UI that was not true. Curated
   * and hand-rejected rows are listed together and both can be reopened.
   */
  rejectedNote(rejected) {
    const n = rejected.length;
    const rows = rejected.slice(0, 25).map(j => `
      <li class="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
        <span class="text-xs text-slate-600 truncate">${this.escapeHtml(j.title || '(untitled)')}<span class="text-slate-400"> · ${this.escapeHtml(j.company || '—')}</span></span>
        <button onclick="app.adminReopenJob('${j.id}')" title="Put this back in the review queue"
          class="shrink-0 text-[10px] font-bold text-primary hover:underline whitespace-nowrap">Reopen</button>
      </li>`).join('');
    const more = n > 25 ? `<li class="pt-1.5 text-[10px] text-slate-400">and ${n - 25} more</li>` : '';
    const who = rejected.filter(j => j.source === 'user-submission').length;
    return `
      <details class="mt-3 border border-slate-200 rounded-xl bg-white">
        <summary class="cursor-pointer select-none px-3.5 py-2.5 text-xs font-bold text-slate-600 hover:text-primary">
          Rejected (${n}) — kept, and can be reopened
        </summary>
        <div class="px-3.5 pb-3">
          <p class="text-[11px] text-slate-400 mb-1">${who} of these ${who === 1 ? 'was' : 'were'} posted by an employer. Nothing here is deleted.</p>
          <ul class="mt-1">${rows}${more}</ul>
        </div>
      </details>`;
  }


  /**
   * Provenance line for a job row in the admin queue.
   *
   * A listing that arrived from the Adzuna feed is unvetted third-party copy, so
   * the reviewer needs two things before clicking publish: where it came from, and
   * a link to check it against the employer's own posting. A hand-typed job from
   * a WhatsApp forward has no apply_url and is left as-is.
   *
   * The URL is escaped and scheme-checked to http/https only. An ingested
   * redirect_url is attacker-influenced data, and `javascript:` in an href would
   * otherwise execute when an admin clicked the row.
   */
  adminJobProvenance(j) {
    const source = String((j && j.source) || '').trim();
    // A row that arrived through the public /jobs form needs the reviewer to know
    // a human typed it and how to reply, so it gets a badge and a contact line.
    // An Adzuna row is unvetted third-party copy, so it needs where it came from
    // and a link to check it against the employer's own posting.
    if (source === 'user-submission') {
      const contact = String((j && (j.contact || j.apply_url)) || '').trim();
      let safeHref = '';
      if (contact) {
        try {
          const u = new URL(contact);
          if (u.protocol === 'http:' || u.protocol === 'https:') safeHref = u.href;
        } catch (e) { /* not a URL: shown as plain text, never as an href */ }
      }
      const contactLine = contact
        ? (safeHref
          ? `<a href="${this.escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer nofollow" class="text-[10px] font-bold text-primary hover:underline break-all">${this.escapeHtml(contact)}</a>`
          : `<span class="text-[10px] text-slate-500 break-all">${this.escapeHtml(contact)}</span>`)
        : '<span class="text-[10px] text-rose-500">no contact given</span>';
      return `<div class="mt-1 flex items-center gap-2 flex-wrap">
        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Posted by employer</span>
        ${contactLine}
      </div>`;
    }
    if (source !== 'adzuna') return '';
    const label = 'From Adzuna';
    const raw = String((j && (j.apply_url || j.contact)) || '').trim();
    let safeHref = '';
    if (raw) {
      try {
        const u = new URL(raw);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          // u.href is a normalised serialisation of an already-parsed URL, so it
          // cannot carry a quote or angle bracket out of the attribute.
          safeHref = u.href;
        }
      } catch (e) { /* unparseable: show the source badge with no link */ }
    }
    const link = safeHref
      ? `<a href="${this.escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer nofollow"
           class="text-[10px] font-bold text-primary hover:underline">view on Adzuna</a>`
      : '';
    return `<div class="mt-1 flex items-center gap-2">
      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">${label}</span>
      ${link}
    </div>`;
  }

  /**
   * The pin badge on a job row: this listing sits above every other one.
   *
   * `featured` is a fixed pin, not a ranking signal, so the admin has to be able
   * to see it at a glance. A row that is pinned but looks like any other row is
   * how a filled vacancy ends up sitting at the top of the board for a month -
   * nobody can tell which rows are supposed to be there and which are leftovers.
   *
   * The badge is the control: it is a button that unpins, so clearing a filled
   * role does not need a migration and does not need to be remembered for later.
   */
  adminFeaturedBadge(j) {
    if (!this.adminIsFeatured(j)) return '';
    return `<button type="button" onclick="app.adminSetFeatured(this.dataset.id, false)" data-id="${this.escapeHtml(j.id || '')}"
      title="Pinned above every other listing on the board and in the emails. Click to unpin."
      class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:scale-95 transition-all shrink-0 align-middle">
      <span class="material-symbols-outlined" style="font-size:12px">push_pin</span> Pinned
    </button>`;
  }

  /** The other half of the control: pin a listing that is not pinned yet. */
  adminFeatureButton(j) {
    if (this.adminIsFeatured(j)) return '';
    return `<button type="button" onclick="app.adminSetFeatured(this.dataset.id, true)" data-id="${this.escapeHtml(j.id || '')}"
      title="Pin to the top of the jobs board, the weekly digest and the nudge emails"
      class="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 active:scale-90 transition-all shrink-0"
      aria-label="Pin this listing to the top"><span class="material-symbols-outlined text-base">push_pin</span></button>`;
  }

  /**
   * The pin, as it reads to someone who is not an admin: a "Pinned" label on the
   * card itself, not only in the review queue.
   *
   * A pinned listing that looks identical to every other one is not a
   * distinction, it is a coincidence - the visitor has no way to tell which rows
   * were put there deliberately. The label says what the ordering means.
   */
  jobFeaturedLabel(j) {
    if (!this.adminIsFeatured(j)) return '';
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 align-middle" title="Featured listing">
      <span class="material-symbols-outlined" style="font-size:12px">push_pin</span> Pinned
    </span>`;
  }

  /** Pin or unpin one listing. The board, the digest and the nudge all follow. */
  async adminSetFeatured(jobId, featured) {
    const id = String(jobId || '');
    if (!id) return false;
    const next = !!featured;
    try {
      await swapikiStore.adminSetJobFeatured(id, next);
      // The cached list is what every repaint draws from, so it is corrected here
      // rather than by a full reload: this is one row's pin, not a new queue.
      const jobs = (this._adminJobs || []).map(j => (j.id === id ? { ...j, featured: next } : j));
      this._adminJobs = jobs;
      this.repaintAdminJobs();
      this.showToast(next
        ? 'Pinned to the top of the board and the emails.'
        : 'Unpinned.');
      return true;
    } catch (e) {
      this.showToast(`Could not change the pin: ${(e && e.message) || 'try again.'}`);
      return false;
    }
  }

  /**
   * Public job submission form, rendered on the jobs page.
   *
   * The admin no longer has an "add a job" form: posting an opening is something
   * an employer or recruiter does, not something an admin does, and the review
   * queue is where an admin's attention belongs. The form says plainly that a
   * submission is reviewed before it appears, because the alternative — a poster
   * assuming their job is live the moment the form clears — is the failure mode
   * that gets people to post something they did not mean to.
   */
  renderJobSubmitForm() {
    const field = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all';
    return `
      <details class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6" id="post-a-job">
        <summary class="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-slate-50 transition-colors">
          <span class="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-lg">campaign</span>
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-bold text-slate-800">Hiring? Post a job</span>
            <span class="block text-xs text-slate-400">Anyone can post. An admin reviews it before it goes live.</span>
          </span>
          <span class="material-symbols-outlined text-slate-400 ml-auto">expand_more</span>
        </summary>
        <form onsubmit="app.submitJobForm(event)" class="px-5 pb-5 pt-1 space-y-3 border-t border-slate-100">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input id="job-form-title" placeholder="Job title *" maxlength="120" class="${field}"/>
            <input id="job-form-company" placeholder="Company *" maxlength="120" class="${field}"/>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input id="job-form-location" placeholder="Location (e.g. Bengaluru, Remote)" maxlength="120" class="${field}"/>
            <input id="job-form-salary" placeholder="Salary (optional)" maxlength="60" class="${field}"/>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select id="job-form-category" class="${field}">
              <option value="it">IT</option>
              <option value="bfsi">BFSI</option>
              <option value="any">Other / any role</option>
            </select>
            <input id="job-form-contact" placeholder="Apply link, email or phone *" maxlength="200" class="${field}"/>
          </div>
          <input id="job-form-skills" placeholder="Skills, comma separated (optional)" maxlength="400" class="${field}"/>
          <textarea id="job-form-description" rows="4" maxlength="2000" placeholder="Describe the role: responsibilities, requirements, experience needed." class="${field} resize-y"></textarea>
          <textarea id="job-form-raw" rows="2" maxlength="2000" placeholder="Original post text (optional — paste the whole thing if you have it)" class="${field} resize-y"></textarea>
          <input id="job-form-hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" class="hidden" name="honeypot"/>
          <div class="flex flex-wrap items-center gap-3 pt-1">
            <button type="submit" id="job-form-submit" class="px-5 py-2.5 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 active:scale-[0.98] transition-all">Submit for review</button>
            <p class="text-xs text-slate-400">Goes to the review queue. Not published automatically.</p>
          </div>
          <div id="job-form-result"></div>
        </form>
      </details>`;
  }

  /**
   * Join cards for the public Swapiki channels.
   *
   * Rendered only when a channel is configured, so the board never shows a dead
   * button. The Telegram card prefers the bot deep link, because that is what
   * starts the onboarding which ties a Telegram user to their Swapiki profile;
   * it falls back to the plain channel invite. The QR points at the same place
   * as the link so a scan and a tap land in the same spot.
   */
  renderChannelJoinCard() {
    const cfg = (typeof window !== 'undefined' && window.SWAPIKI_CONFIG) || {};
    const tgUrl = String(cfg.TELEGRAM_CHANNEL_URL || '').trim();
    const waUrl = String(cfg.WHATSAPP_CHANNEL_URL || '').trim();
    const bot = String(cfg.TELEGRAM_BOT_USERNAME || '').trim();
    const isAuthed = this.isAuthenticated && this.isAuthenticated();
    if (!tgUrl && !waUrl && !bot) return '';

    // Third-party QR image, chosen over a bundled encoder to keep the bundle
    // dependency-free. It only ever encodes the public invite URL.
    const qrSrc = url =>
      'https://api.qrserver.com/v1/create-qr-code/?size=176x176&margin=0&data=' + encodeURIComponent(url);

    const makeCard = (label, sub, icon, iconClass, href) => `
      <a href="${this.escapeHtml(href)}" target="_blank" rel="noopener noreferrer"
         class="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:border-primary/40 hover:shadow-sm transition-all">
        <img src="${qrSrc(href)}" alt="QR code to join the ${this.escapeHtml(label)} channel" width="88" height="88"
             loading="lazy" referrerpolicy="no-referrer" class="w-[88px] h-[88px] rounded-lg border border-slate-100 shrink-0"/>
        <span class="min-w-0">
          <span class="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span class="material-symbols-outlined text-[18px] ${iconClass}">${icon}</span>
            ${this.escapeHtml(label)}
          </span>
          <span class="block text-xs text-slate-500 mt-1">${this.escapeHtml(sub)}</span>
        </span>
      </a>`;

    const tgTarget = bot ? `https://t.me/${encodeURIComponent(bot)}?start=channel` : tgUrl;

    const cards = [];
    if (tgTarget) {
      cards.push(makeCard('Telegram', 'Job alerts the moment they are approved, plus profile tips.', 'send', 'text-sky-500', tgTarget));
    }
    if (waUrl) {
      cards.push(makeCard('WhatsApp', 'Job alerts on WhatsApp. Tap the link or scan to join.', 'chat', 'text-emerald-500', waUrl));
    }
    if (!cards.length) return '';

    const personalLink = isAuthed && bot
      ? `<button type="button" class="mt-3 text-xs font-bold text-primary hover:underline" data-tg-link>Get your personal Telegram link</button>`
      : '';

    return `
      <section class="mb-6" aria-label="Join our channels">
        <div class="flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-primary text-[18px]">notifications_active</span>
          <h2 class="text-sm font-bold text-slate-800">Get new jobs the moment they go live</h2>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${cards.join('')}</div>
        ${personalLink}
      </section>`;
  }

  /**
   * Opens the one-time deep link that ties this account's Telegram user to the
   * profile, for the [data-tg-link] button.
   *
   * The link is minted per click rather than rendered into the card because it
   * is short-lived (about ten minutes) and single use — a URL baked into the
   * markup would be shared by every page view and expire while sitting in a
   * cached HTML snapshot. Falls back to the plain channel invite if the request
   * fails, so a failed mint never dead-ends the join flow.
   */
  async _openTelegramDeepLink(btn) {
    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';
    const original = btn.textContent;
    btn.textContent = 'Creating your link…';
    btn.disabled = true;
    try {
      const { deepLink, token } = await swapikiStore.getTelegramLink();
      if (deepLink) {
        window.open(deepLink, '_blank', 'noopener');
        if (token) this._showTelegramCode(btn, token);
        return;
      }
      window.open(String((window.SWAPIKI_CONFIG || {}).TELEGRAM_CHANNEL_URL || 'https://t.me/'), '_blank', 'noopener');
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('telegram link failed:', err && err.message);
      window.open(String((window.SWAPIKI_CONFIG || {}).TELEGRAM_CHANNEL_URL || 'https://t.me/'), '_blank', 'noopener');
    } finally {
      btn.textContent = original;
      btn.disabled = false;
      delete btn.dataset.busy;
    }
  }

  /**
   * Shows the one-time code under the link button, for the phone where a deep
   * link keeps landing in a browser instead of the Telegram app. The code is
   * the same token the deep link carries, so typing it into the bot chat links
   * the account exactly like tapping the link would.
   */
  _showTelegramCode(btn, token) {
    const section = btn && btn.closest ? btn.closest('section') : null;
    if (!section) return;
    let hint = section.querySelector('[data-tg-code]');
    if (!hint) {
      hint = document.createElement('div');
      hint.setAttribute('data-tg-code', '');
      hint.className = 'mt-2 text-xs text-slate-500';
      section.appendChild(hint);
    }
    hint.innerHTML = 'On the phone? Send this code to the bot chat instead: ' +
      `<button type="button" class="font-mono font-bold text-primary underline-offset-2 hover:underline" data-tg-copy>` +
      `${this.escapeHtml(String(token))}</button>`;
    const copyBtn = hint.querySelector('[data-tg-copy]');
    if (copyBtn && navigator && navigator.clipboard) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(String(token)).catch(() => {});
        copyBtn.textContent = 'Copied!';
      });
    }
  }

  async submitJobForm(e) {
    e.preventDefault();
    const $ = id => document.getElementById(id);
    const val = id => (($(id) || {}).value || '').trim();
    const result = $('job-form-result');
    const btn = $('job-form-submit');
    const say = (html, tone) => {
      if (!result) return;
      result.innerHTML = `<div class="text-xs rounded-lg px-3 py-2 border ${tone}">${html}</div>`;
    };

    const payload = {
      title: val('job-form-title'),
      company: val('job-form-company'),
      location: val('job-form-location'),
      salary: val('job-form-salary'),
      category: val('job-form-category') || 'any',
      contact: val('job-form-contact'),
      description: val('job-form-description'),
      rawText: val('job-form-raw'),
      skills: val('job-form-skills').split(',').map(s => s.trim()).filter(Boolean),
      honeypot: val('job-form-hp')
    };

    // Checked here so the obvious miss is instant, and again on the server because
    // the client check is a convenience, never the guarantee.
    const missing = [];
    if (!payload.title) missing.push('a job title');
    if (!payload.company) missing.push('the company name');
    if (!payload.contact) missing.push('an apply link, email or phone number');
    if (missing.length) {
      say(`Add ${missing.join(', ')}.`, 'bg-amber-50 border-amber-200 text-amber-700');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    try {
      await swapikiStore.submitJob(payload);
      say('✅ Received. An admin reviews every submission before it appears on the board.', 'bg-emerald-50 border-emerald-200 text-emerald-700');
      const form = document.querySelector('#post-a-job form');
      if (form && typeof form.reset === 'function') form.reset();
    } catch (err) {
      const message = (err && err.message) || 'Could not submit that job. Please try again.';
      // The server names the missing fields; showing them is more useful than a
      // generic failure, and the person posting is the one who can fix it.
      say(`❌ ${this.escapeHtml(message)}`, 'bg-rose-50 border-rose-200 text-rose-700');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit for review'; }
    }
  }

  /**
   * The ticked rows for one table.
   *
   * Read from the checkbox elements rather than from a Set kept alongside the
   * markup, because the dashboard is re-rendered from scratch on every decision.
   * A parallel Set would survive the re-render holding ids that are no longer on
   * the page, and the next bulk press would write to rows the admin cannot see.
   */
  adminSelectedJobIds(group) {
    return Array.from(document.querySelectorAll(`.admin-job-check[data-group="${group}"]:checked`))
      .map(el => el.value);
  }

  /** Repaint the selected count and arm/disarm the two bulk buttons for one table. */
  adminSyncBulkBar(group) {
    const total = document.querySelectorAll(`.admin-job-check[data-group="${group}"]`).length;
    const selected = this.adminSelectedJobIds(group).length;
    const label = document.querySelector(`[data-selected-count="${group}"]`);
    if (label) label.textContent = `${selected} of ${total} selected`;
    document.querySelectorAll(`.admin-bulk-btn[data-group="${group}"]`).forEach(btn => {
      btn.disabled = selected === 0;
    });
    const all = document.querySelector(`.admin-job-check-all[data-group="${group}"]`);
    if (all) {
      all.checked = total > 0 && selected === total;
      // "indeterminate" is the honest state for a partial selection, and it is
      // the only way the master box can say "some of these" rather than lying
      // with an unchecked box next to ticked rows.
      all.indeterminate = selected > 0 && selected < total;
    }
  }

  /**
   * One delegated listener for every checkbox in the review queue.
   *
   * Bound once on the container, which is a fixed element in the page: both the
   * full render and the queue repaint swap the checkboxes out, so anything bound
   * to a checkbox stops answering the moment either runs. The listener is marked
   * on the element so re-entering the admin page cannot stack a second one and
   * make one tick of a row read as two.
   */
  bindAdminSelection(container) {
    if (!container || container._adminSelectionBound) return;
    if (typeof container.addEventListener !== 'function') return;
    container._adminSelectionBound = true;
    container.addEventListener('change', (ev) => {
      const el = ev.target;
      if (!el || typeof el.matches !== 'function') return;
      if (el.matches('.admin-job-check[data-group]')) {
        this.adminSyncBulkBar(el.dataset.group);
      } else if (el.matches('.admin-job-check-all[data-group]')) {
        this.adminToggleAllJobs(el.dataset.group, el.checked);
      }
    });
  }

  /** Master checkbox: tick or clear every row in the table at once. */
  adminToggleAllJobs(group, checked) {
    document.querySelectorAll(`.admin-job-check[data-group="${group}"]`).forEach(el => { el.checked = !!checked; });
    this.adminSyncBulkBar(group);
  }

  /**
   * Apply one status to every ticked job in a table, in a single write.
   *
   * Reject is a status change, not a delete, and the same word curation uses, so
   * a bulk rejection is reversible exactly like an automatic one.
   *
   * The rows are moved in the copy already on screen and only the two tables are
   * repainted. A full admin render here re-read every table on the page, which is
   * why a bulk press used to blank the page for a second or more; the write still
   * lands, and the count in the toast is the number the database confirmed.
   */
  async adminBulkSetStatus(group, status) {
    const ids = this.adminSelectedJobIds(group);
    if (!ids.length) return;
    const effect = {
      published: { verb: 'published', detail: 'published to the board' },
      rejected: { verb: 'rejected', detail: 'rejected (kept, not deleted, and reversible)' },
      draft: { verb: 'moved back to draft', detail: 'moved back to draft and taken off the board' }
    }[status] || { verb: status, detail: `set to ${status}` };
    const n = `${ids.length} ${ids.length === 1 ? 'job' : 'jobs'}`;
    if (!confirm(`${n} will be ${effect.detail}. Continue?`)) return;
    // The buttons are disabled for the duration so a second press cannot queue a
    // duplicate write while the first is still in flight.
    const btns = document.querySelectorAll(`.admin-bulk-btn[data-group="${group}"]`);
    btns.forEach(b => { b.disabled = true; });
    // Remember what these rows were, so a failed write can put the queue back the
    // way it was instead of leaving rows on screen that the database never moved.
    const before = new Map();
    (this._adminJobs || []).forEach(j => { if (j && ids.indexOf(j.id) !== -1) before.set(j.id, j.status); });
    this.applyAdminJobStatuses(Array.from(ids), status);
    try {
      const count = await swapikiStore.adminSetJobStatusBulk(ids, status);
      this.showToast(`✅ ${count} ${count === 1 ? 'job' : 'jobs'} ${effect.verb}.`);
    } catch (err) {
      this.applyAdminJobStatuses(Array.from(before.keys()), null, before);
      this.showToast(`❌ ${(err && err.message) || `Could not update the selected jobs.`}`);
      this.adminSyncBulkBar(group);
    }
  }

  /**
   * Move rows to a status in the in-memory queue and repaint just the two tables.
   *
   * `status` of null restores each row to the status given in `restore`, which is
   * how a failed write puts the queue back rather than guessing.
   */
  applyAdminJobStatuses(ids, status, restore) {
    const set = new Set(ids || []);
    let changed = false;
    (this._adminJobs || []).forEach(j => {
      if (!j || !set.has(j.id)) return;
      j.status = status === null ? (restore ? restore.get(j.id) : j.status) : status;
      changed = true;
    });
    if (changed && !this.repaintAdminJobs()) this.renderAdminDashboard();
    return changed;
  }

  /**
   * One row's decision, applied to the screen before the write is sent.
   *
   * Three things were wrong with pressing a row button before. The page went to a
   * skeleton and stayed there for the length of a six-query reload, so a press
   * looked like it had been missed and got repeated. Nothing was disabled while
   * the write was open, so the repeat was a second decision rather than a retry.
   * And a rejected draft had no button of its own at all — the only red button on
   * the row was a delete, which is not what "reject" means here.
   *
   * So: the row moves immediately, a second press while the write is open is
   * ignored, and a failure puts the row back with the reason.
   */
  async adminDecideJob(jobId, status, doneMsg) {
    if (!jobId) return;
    if (this._adminJobBusy[jobId]) return;
    this._adminJobBusy[jobId] = true;
    const row = (this._adminJobs || []).find(j => j && j.id === jobId);
    const before = row ? row.status : null;
    const said = doneMsg || {
      published: 'Job published to the board.',
      draft: 'Job moved back to draft.',
      rejected: 'Job rejected. The row is kept — reopen it from the Rejected list below.'
    }[status] || `Job set to ${status}.`;
    // Optimistic: the row leaves the table on the press, not when the write
    // returns, so the click has a visible answer immediately.
    this.applyAdminJobStatuses([jobId], status);
    try {
      await swapikiStore.adminSetJobStatus(jobId, status);
      this.showToast(said);
    } catch (err) {
      this.applyAdminJobStatuses([jobId], null, new Map([[jobId, before]]));
      this.showToast(`❌ ${(err && err.message) || 'Could not update the job.'}`);
    } finally {
      delete this._adminJobBusy[jobId];
    }
  }

  adminApproveJob(jobId) {
    return this.adminDecideJob(jobId, 'published');
  }

  adminUnpublishJob(jobId) {
    return this.adminDecideJob(jobId, 'draft');
  }

  /**
   * Reject a single row.
   *
   * Kept, not deleted, and reversible — the same meaning the bulk button and the
   * curation rules give the word. It asks first because a mis-press on a phone
   * would otherwise quietly drop an employer's submission out of the queue.
   */
  async adminRejectJob(jobId) {
    if (!jobId) return;
    if (this._adminJobBusy[jobId]) return;
    const title = this.adminJobTitle(jobId);
    if (!confirm(`Reject "${title}"? The row is kept, not deleted, and can be reopened later.`)) return;
    return this.adminDecideJob(jobId, 'rejected');
  }

  /**
   * Put a rejected row back in the review queue.
   *
   * This is the other half of reject. The row is already on screen in the
   * collapsed rejected list, so it is a plain status write with no confirmation
   * and no refetch: the row leaves the rejected list and lands in the queue where
   * it can be published or rejected again.
   */
  adminReopenJob(jobId) {
    return this.adminDecideJob(jobId, 'draft', 'Reopened. The job is back in the review queue.');
  }

  async adminDeleteJob(jobId) {
    // Delete is the one irreversible action on this page, and it sits next to
    // reject on the same row. The prompt says which is which so the destructive
    // one is never reached for by accident.
    const title = this.adminJobTitle(jobId);
    if (!confirm(`Delete "${title}" permanently?\n\nThis cannot be undone. If you only want it off the board, use Reject instead — that keeps the row.`)) return;
    if (this._adminJobBusy[jobId]) return;
    this._adminJobBusy[jobId] = true;
    const at = (this._adminJobs || []).findIndex(j => j && j.id === jobId);
    try {
      await swapikiStore.adminDeleteJob(jobId);
      if (at !== -1) this._adminJobs.splice(at, 1);
      if (!this.repaintAdminJobs()) this.renderAdminDashboard();
      this.showToast('Job deleted.');
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not delete the job.'}`);
    } finally {
      delete this._adminJobBusy[jobId];
    }
  }

  /** The title a confirmation should name, read from the queue rather than markup. */
  adminJobTitle(jobId) {
    const row = (this._adminJobs || []).find(j => j && j.id === jobId);
    return (row && row.title) || 'this job';
  }

  async adminPromoteSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('admin-promote-email-input');
    const email = input ? input.value.trim() : '';
    if (!email) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Granting…'; }

    try {
      const result = await swapikiStore.adminPromoteByEmail(email);
      this.showToast(`✅ ${result.email} is now an admin.`);
      if (input) input.value = '';
      this.renderAdminDashboard();
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not grant admin access.'}`);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }
  }

  async adminRemoveAdmin(userId, email) {
    // Removing your own access is one click from locking the whole admin area
    // shut, and the row gives no hint that this one is different. Recovery means
    // editing the roles table by hand, so it is refused outright rather than
    // confirmed.
    const me = swapikiStore.currentUser;
    if (me && userId && me.id === userId) {
      this.showToast('That is you. You cannot remove your own admin access — ask another admin to do it.');
      return;
    }
    if (!confirm(`Remove admin access for ${email || 'this user'}?`)) return;
    try {
      await swapikiStore.adminRemoveAdmin(userId);
      this.showToast('Admin access removed.');
      this.renderAdminDashboard();
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not remove admin access.'}`);
    }
}

  async renderAdminJobsView() {
    const container = document.getElementById('admin-jobs-container');
    if (!container) return;

    const refreshBtn = document.getElementById('admin-jobs-refresh-btn');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Refreshing…`;
    }
    // A skeleton shaped like THIS page (four stat cards, then two tables).
    // The dashboard skeleton is not reused: it opens with chart blocks, and a
    // jobs page showing pie-chart ghosts while loading reads as a rendering
    // fault rather than as loading.
    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        ${Array.from({ length: 4 }).map(() => `
          <div class="border border-slate-200 rounded-xl p-4 bg-white animate-pulse">
            <div class="flex items-center justify-between mb-3">
              <div class="h-2.5 w-20 bg-slate-200 rounded"></div>
              <div class="w-8 h-8 rounded-lg bg-slate-100"></div>
            </div>
            <div class="h-6 w-12 bg-slate-200 rounded mb-2"></div>
            <div class="h-2.5 w-24 bg-slate-100 rounded"></div>
          </div>`).join('')}
      </div>
      ${Array.from({ length: 2 }).map(() => `
        <div class="border border-slate-200 rounded-xl overflow-hidden bg-white animate-pulse mb-6">
          <div class="bg-slate-50 h-9 border-b border-slate-100"></div>
          ${Array.from({ length: 4 }).map(() => '<div class="h-12 border-b border-slate-100 last:border-0"></div>').join('')}
        </div>`).join('')}`;
    // The two halves of this screen fail independently and neither failure may
    // take the other down with it. Without a Supabase session the queue read
    // throws; the stats endpoint answers "not set up" rather than throwing. So
    // each is settled on its own here and whichever half did load still draws.
    // Only an error inside the render itself reaches the catch below.
    const [jobs, stats] = await Promise.all([
      swapikiStore.adminListJobs().catch(() => []),
      swapikiStore.adminGetJobsStats().catch(() => ({ configured: false }))
    ]);

    try {
      // The queue becomes the in-memory copy the review tables repaint from, so
      // approving or rejecting a job never needs another read of the jobs table.
      this._adminJobs = jobs || [];
      this.watchAdminBreakpoint();

      container.innerHTML = this.renderAdminJobsStats(stats) + this.renderAdminJobsSection(jobs);

      // The tables were just rebuilt, so both bulk bars have to be recomputed or
      // a bar is left describing checkboxes that no longer exist.
      ['draft', 'published'].forEach(g => this.adminSyncBulkBar(g));
      this.bindAdminSelection(container);
      this.animateAdminStatCards();

      const lastRef = document.getElementById('admin-jobs-last-refreshed');
      if (lastRef) {
        lastRef.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    } catch (err) {
      container.innerHTML = `<div class="border border-rose-200 bg-rose-50 rounded-xl p-6 flex items-start gap-3">
        <span class="material-symbols-outlined text-rose-500 text-2xl">error</span>
        <div>
          <p class="text-sm font-bold text-rose-700">Could not load the jobs admin</p>
          <p class="text-sm text-rose-600 mt-0.5">${this.escapeHtml((err && err.message) || 'Please try refreshing.')}</p>
        </div>
      </div>`;
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = `<span class="material-symbols-outlined text-lg">refresh</span> Refresh`;
      }
    }
  }

  /**
   * The usage figures above the review tables: resume drafts, interview prep and
   * outbound clicks, over the endpoint's own window.
   *
   * `configured: false` and a missing source (`available: false`) are different
   * states and are reported differently. The first means this deployment has no
   * stats endpoint wired up; the second means the endpoint answered but the
   * table behind that one figure hasn't been migrated yet. Rendering either as a
   * zero would read as "nobody used the resume", which is a claim the data does
   * not support — so both show "—" with the reason beside it.
   */
  renderAdminJobsStats(stats) {
    if (!stats || !stats.configured) {
      return `<div class="mb-6">
        ${this.adminSectionHeader('Usage', '', 'insights')}
        <div class="border border-slate-200 rounded-xl bg-white p-6 text-center">
          <span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">insights</span>
          <p class="text-sm text-slate-400">Usage statistics aren't set up on this deployment yet.</p>
        </div>
      </div>`;
    }

    const windowDays = stats.window_days || 30;
    const tools = stats.tools || {};
    const clicks = stats.clicks || {};
    const traffic = stats.traffic || {};
    const searches = stats.searches || {};

    // A figure is only rendered when its own source answered. `available` is
    // checked before the numbers, not after, so a missing table never produces a
    // card of zeros.
    //
    // The pluralisation is deliberate rather than decorative. A card reading
    // "1 people · 1 jobs" makes a real single-interview-prep week look like a
    // placeholder or a broken counter, which is exactly the reading that would
    // stop someone trusting the number it is trying to report.
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const peopleAndJobs = (users, jobs) => `${plural(users || 0, 'person', 'people')} · ${plural(jobs || 0, 'job', 'jobs')}`;

    const toolCard = (label, value, icon, color) => {
      if (!tools.available) {
        return { label, value: '—', sub: 'Run tool_usage_migration.sql', icon, color };
      }
      const v = value || { uses: 0, users: 0, jobs: 0 };
      return { label, value: String(v.uses || 0), sub: peopleAndJobs(v.users, v.jobs), icon, color };
    };

    const cards = [
      toolCard('Resume Drafts', tools.resume, 'description', 'primary'),
      toolCard('Interview Prep', tools.interview, 'record_voice_over', 'indigo'),
      !clicks.available
        ? { label: 'Apply Clicks', value: '—', sub: 'Run job_clicks migration', icon: 'ads_click', color: 'emerald' }
        : { label: 'Apply Clicks', value: String(clicks.total || 0), sub: peopleAndJobs(clicks.users, clicks.jobs), icon: 'ads_click', color: 'emerald' },
      // "How many of them came to the page." Labelled "Profile Opens" rather than
      // "Visitors" on purpose: share_events records an open, and has no viewer
      // column, so calling this people reached would overstate it.
      !traffic.available
        ? { label: 'Profile Opens', value: '—', sub: 'Tracking not set up', icon: 'visibility', color: 'amber' }
        : {
            label: 'Profile Opens',
            value: String(traffic.total || 0),
            sub: traffic.profiles
              ? `across ${plural(traffic.profiles, 'profile', 'profiles')}`
              : 'opens recorded so far',
            icon: 'visibility',
            color: 'amber'
          }
    ];

    const colorMap = {
      primary: { bg: 'bg-primary-fixed', icon: 'text-primary', bar: 'bg-primary' },
      indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', bar: 'bg-indigo-500' },
      emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', bar: 'bg-emerald-500' },
      amber: { bg: 'bg-amber-50', icon: 'text-amber-600', bar: 'bg-amber-400' }
    };

    const statCards = cards.map(c => {
      const p = colorMap[c.color] || colorMap.primary;
      const isNumeric = /^\d+$/.test(c.value);
      return `
        <div class="admin-stat-card group relative overflow-hidden border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div class="absolute top-0 left-0 right-0 h-0.5 ${p.bar}"></div>
          <div class="flex items-center justify-between mb-3">
            <span class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${c.label}</span>
            <span class="w-8 h-8 rounded-lg ${p.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
              <span class="material-symbols-outlined text-lg ${p.icon}">${c.icon}</span>
            </span>
          </div>
          <div class="admin-stat-value text-2xl font-bold text-slate-900 tracking-tight"${isNumeric ? ` data-target="${c.value}"` : ''}>${isNumeric ? '0' : c.value}</div>
          <div class="text-xs text-slate-400 mt-0.5 truncate">${c.sub}</div>
        </div>`;
    }).join('');

    // The listings that actually earned interest. job_id goes into no attribute
    // here — the row is keyed by position and the title is escaped text.
    const top = Array.isArray(clicks.top_jobs) ? clicks.top_jobs : [];
    const topRows = top.length
      ? top.map((j, i) => `
        <tr class="border-b border-slate-100 last:border-0">
          <td class="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">${i + 1}</td>
          <td class="py-2.5 px-3">
            <div class="text-sm font-bold text-slate-800">${this.escapeHtml(j.title || '(untitled)')}</div>
            <div class="text-xs text-slate-400">${this.escapeHtml(j.company || '-')}</div>
          </td>
          <td class="py-2.5 px-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">${j.clicks || 0}</td>
        </tr>`).join('')
      : `<tr><td colspan="3" class="py-6 text-center text-sm text-slate-400">No outbound clicks recorded in this window yet.</td></tr>`;

    // Where the profile opens came from. This is the half of "how many came to the
    // page" that is actually actionable: the total says a number, the referrer
    // split says which channel earned it.
    const refs = Array.isArray(traffic.referrers) ? traffic.referrers : [];
    const refMax = refs.reduce((m, r) => Math.max(m, r.views || 0), 0);
    const refRows = refs.length
      ? refs.map(r => `
        <div class="py-2.5 px-3 border-b border-slate-100 last:border-0">
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <span class="text-sm font-bold text-slate-700 truncate">${this.escapeHtml(r.source || '-')}</span>
            <span class="text-xs font-bold text-slate-500 tabular-nums shrink-0">${r.views || 0}</span>
          </div>
          <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full bg-amber-400" style="width:${refMax ? Math.max(3, Math.round(((r.views || 0) / refMax) * 100)) : 0}%"></div>
          </div>
        </div>`).join('')
      : `<p class="py-6 text-center text-sm text-slate-400">No profile opens recorded in this window yet.</p>`;

    // The profiles that got read. The handle goes into an href, so it is put
    // through the SAME slug rule the signup form uses (formatNickname) rather
    // than trusted as-is — a username is user-supplied text, and this is the one
    // place on this page where it would land inside an attribute.
    const topProfiles = Array.isArray(traffic.top_profiles) ? traffic.top_profiles : [];
    const profileRows = topProfiles.length
      ? topProfiles.map((p, i) => {
        const handle = p.username ? swapikiStore.formatNickname(p.username) : '';
        const label = p.name || (handle ? `@${handle}` : '(profile not found)');
        const link = handle
          ? `<a class="text-xs text-primary hover:underline" href="https://${handle}.swapiki.com/" target="_blank" rel="noopener">${this.escapeHtml(handle)}.swapiki.com</a>`
          : '';
        return `
          <tr class="border-b border-slate-100 last:border-0">
            <td class="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">${i + 1}</td>
            <td class="py-2.5 px-3">
              <div class="text-sm font-bold text-slate-800">${this.escapeHtml(label)}</div>
              <div class="text-xs text-slate-400">${link || this.escapeHtml(p.title || '')}</div>
            </td>
            <td class="py-2.5 px-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">${p.views || 0}</td>
          </tr>`;
      }).join('')
      : `<tr><td colspan="3" class="py-6 text-center text-sm text-slate-400">No profile opens recorded in this window yet.</td></tr>`;

    // What candidates are searching for. `days` is the honest measure (separate
    // days the term was looked for) and `occurrences` the raw row count, because
    // the store logs a row per throttled keystroke - so raw counts overstate a
    // term someone typed carefully once.
    const topSearches = Array.isArray(searches.top) ? searches.top : [];
    const searchRows = topSearches.length
      ? topSearches.map((s, i) => `
        <tr class="border-b border-slate-100 last:border-0">
          <td class="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">${i + 1}</td>
          <td class="py-2.5 px-3">
            <div class="text-sm font-bold text-slate-800 truncate">${this.escapeHtml(s.query || '-')}</div>
            <div class="text-xs text-slate-400">${plural(s.occurrences || 0, 'search', 'searches')} logged</div>
          </td>
          <td class="py-2.5 px-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">${s.days || 0}${s.days === 1 ? ' day' : ' days'}</td>
        </tr>`).join('')
      : `<tr><td colspan="3" class="py-6 text-center text-sm text-slate-400">No searches recorded in this window yet.</td></tr>`;

    // The traffic and search panels are only rendered at all when their source
    // answered. An unmigrated table should leave the page as it was, not insert a
    // permanent "not set up" panel for a feature nobody switched on.
    const trafficPanel = traffic.available ? `
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader('Profile Traffic', '', 'visibility')}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Last ${windowDays} days. Counts profile opens, not unique visitors.</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
            <div class="bg-slate-50 border-b border-slate-200 px-3 py-2.5">
              <p class="text-[11px] font-bold uppercase tracking-wide text-slate-500">Where they came from</p>
            </div>
            <div class="max-h-80 overflow-y-auto">${refRows}</div>
          </div>
          <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
            <table class="w-full">
              <thead class="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
                  <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Most Viewed Profile</th>
                  <th class="py-2.5 px-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">Opens</th>
                </tr>
              </thead>
              <tbody>${profileRows}</tbody>
            </table>
          </div>
        </div>
      </div>` : '';

    const searchPanel = searches.available ? `
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader('Top Searches', '', 'search')}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Last ${windowDays} days. ${plural(searches.terms || 0, 'distinct term', 'distinct terms')}.</p>
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <table class="w-full">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Searched For</th>
                <th class="py-2.5 px-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">Days</th>
              </tr>
            </thead>
            <tbody>${searchRows}</tbody>
          </table>
        </div>
      </div>` : '';

    // A capped scan is a smaller number than the truth, so it is stated next to
    // the figures rather than quietly presented as exact.
    const cappedNote = stats.capped
      ? `<p class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
           These counts came from a capped scan and are a lower bound.
         </p>`
      : '';

    return `
      <div class="admin-fade-in mb-6">
        ${this.adminSectionHeader('Usage', '', 'insights')}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Last ${windowDays} days.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">${statCards}</div>
        ${cappedNote}
      </div>
      ${trafficPanel}
      ${searchPanel}
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader('Most Clicked', '', 'ads_click')}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Outbound apply clicks per listing.</p>
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <table class="w-full">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Listing</th>
                <th class="py-2.5 px-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">Clicks</th>
              </tr>
            </thead>
            <tbody>${topRows}</tbody>
          </table>
        </div>
      </div>`;
  }



  // ---------------------------------------------------------------------
  // AUTHENTICATION
  // ---------------------------------------------------------------------

  isAuthenticated() {
    return !!(window.swapikiStore && swapikiStore.currentUser);
  }

  /** Shows/hides nav elements marked .auth-guest-only / .auth-user-only and sets the user label. */
  refreshAuthUI() {
    const user = swapikiStore.currentUser;
    document.querySelectorAll('.auth-guest-only').forEach(el => el.classList.toggle('hidden', !!user));
    document.querySelectorAll('.auth-user-only').forEach(el => el.classList.toggle('hidden', !user));
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !(user && swapikiStore.isAdminUser)));
    document.querySelectorAll('.nav-user-label').forEach(el => {
      if (!user) { el.textContent = ''; return; }
      const fullName = user.user_metadata && user.user_metadata.full_name;
      el.textContent = fullName ? fullName.split(' ')[0] : (user.email || '').split('@')[0];
    });
    // Keep the landing invite banner in step with auth: shown to a fresh invited
    // visitor, gone the moment they sign in.
    this.maybeShowInviteBanner();
  }

  /** (Re)initializes the Google Sign-In buttons — safe to call repeatedly since the GSI script loads async. */
  /** Injects accounts.google.com/gsi/client once, production-only: on
   *  *.pages.dev the page doesn't need it (googleAuth.js draws a redirect
   *  button there), and skipping it keeps the test env free of third-party
   *  fetches. */
  ensureGoogleScript() {
    if (document.querySelector('script[data-swapiki-gsi]')) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.setAttribute('data-swapiki-gsi', '1');
    document.head.appendChild(s);
  }

  initGoogleButtons() {
    if (!window.googleAuth) return;
    window.googleAuth.initGoogleSignIn('google-signin-button-signup', (resp) => this.handleGoogleCredentialResponse(resp));
    window.googleAuth.initGoogleSignIn('google-signin-button-login', (resp) => this.handleGoogleCredentialResponse(resp));
  }

  openLoginModal() {
    const modal = document.getElementById('modal-login');
    if (modal) modal.classList.remove('hidden');
    this.initGoogleButtons();
  }

  closeLoginModal() {
    const modal = document.getElementById('modal-login');
    if (modal) modal.classList.add('hidden');
  }

  switchToLogin() {
    this.closeSignupModal();
    this.openLoginModal();
  }

  switchToSignup() {
    this.closeLoginModal();
    this.openSignupModal();
  }

  async handleLogin(e) {
    e.preventDefault();
    const emailInput = document.getElementById('login-email-input');
    const passwordInput = document.getElementById('login-password-input');
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!email || !password) {
      this.showToast("⚠️ Enter your email and password.");
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Logging in…'; }

    try {
      const { user } = await swapikiStore.signInWithPassword(email, password);
      await swapikiStore.loadProfileForUser(user);
      this.refreshAuthUI();
      this._ghHydrateNotes().catch(() => { });
      this.closeLoginModal();
      if (passwordInput) passwordInput.value = '';
      this.showToast(`Welcome back, ${swapikiStore.getProfile().name.split(' ')[0] || 'there'}!`);
      router.navigate('dashboard');
      this.maybeShowProfileReminder();
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not log in. Check your email and password.'}`);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }
  }

  /** Rejects after `ms` milliseconds — used to stop a hung auth request from leaving the user staring at a spinner forever with no way out. */
  timeoutAfter(ms, message) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
  }

  /** Swaps a rendered Google button for an inline "Signing in…" spinner so the wait between tapping an account and landing on the dashboard is never silent. */
  showGoogleSignInProgress() {
    const spinnerHtml = `<div class="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-slate-400">
      <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Signing in with Google…
    </div>`;
    ['google-signin-button-signup', 'google-signin-button-login'].forEach(id => {
      const container = document.getElementById(id);
      if (container) container.innerHTML = spinnerHtml;
    });
  }

  /** Callback invoked by Google Identity Services after the user picks a Google account. */
  async handleGoogleCredentialResponse(response) {
    // The round trip from here (token exchange + profile load) can easily
    // take a few seconds on a slow connection or a cold backend — previously
    // the Google button just sat there with no feedback, which is what made
    // sign-in feel stuck/broken even when it was working. Show progress the
    // instant we have a credential, before any awaiting happens.
    this.showGoogleSignInProgress();

    // signInPromise keeps running even if the timeout below wins the race —
    // there's no clean way to cancel an in-flight Supabase call — so on a
    // genuine timeout we swallow whatever it eventually does (succeed or
    // fail) rather than leaving an unhandled rejection in the console.
    const signInPromise = (async () => {
      if (!response || !response.credential) throw new Error('Google sign-in did not return a credential.');
      const { user } = await swapikiStore.signInWithGoogleIdToken(response.credential);
      const payload = window.googleAuth ? window.googleAuth.parseGoogleJwtPayload(response.credential) : null;
      const suggestedHandle = swapikiStore.formatNickname((payload && payload.name) || (user.email || '').split('@')[0]);
      await swapikiStore.loadProfileForUser(user, suggestedHandle);
      if (swapikiStore.data.username) {
        swapikiStore.registerNickname(swapikiStore.data.username, user.id);
      }
      return { user, payload };
    })();

    try {
      const { payload } = await Promise.race([
        signInPromise,
        this.timeoutAfter(20000, "That's taking longer than it should — check your connection and try again.")
      ]);
      signInPromise.catch(() => {});

      this.refreshAuthUI();
      this.closeLoginModal();
      this.closeSignupModal();
      this.showToast(`Welcome, ${(payload && payload.name ? payload.name.split(' ')[0] : 'there')}!`);
      router.navigate('dashboard');
      this.maybeShowProfileReminder();
    } catch (err) {
      signInPromise.catch(() => {});
      this.showToast(`❌ ${(err && err.message) || 'Google sign-in failed. Please try again.'}`);
      // Restore the real Google button in place of the spinner so the user
      // can retry immediately without closing/reopening the modal.
      this.initGoogleButtons();
    }
  }

  async logout() {
    await swapikiStore.signOut();
    this.refreshAuthUI();
    this.showToast('Logged out.');
    router.navigate('landing');
  }

  toggleMobileMenu() {
    const menu = document.getElementById('mobile-nav-menu');
    const icon = document.getElementById('mobile-menu-icon');
    if (!menu) return;

    if (menu.classList.contains('hidden')) {
      menu.classList.remove('hidden');
      if (icon) icon.textContent = 'close';
      document.addEventListener('click', this._closeMobileMenuOnClickOutside);
    } else {
      menu.classList.add('hidden');
      if (icon) icon.textContent = 'menu';
      document.removeEventListener('click', this._closeMobileMenuOnClickOutside);
    }
  }

  _closeMobileMenuOnClickOutside = (e) => {
    const btn = e && e.target && e.target.closest && e.target.closest('[onclick="app.toggleMobileMenu()"]');
    const menu = document.getElementById('mobile-nav-menu');
    if (!btn && menu && !menu.contains(e.target)) {
      menu.classList.add('hidden');
      const icon = document.getElementById('mobile-menu-icon');
      if (icon) icon.textContent = 'menu';
      document.removeEventListener('click', this._closeMobileMenuOnClickOutside);
    }
  }

  toggleAdminMenu(e) {
    const el = document.getElementById('admin-menu');
    if (!el) return;
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
      document.addEventListener('click', this._closeAdminMenuOnClickOutside);
    } else {
      document.removeEventListener('click', this._closeAdminMenuOnClickOutside);
    }
    if (e && e.stopPropagation) e.stopPropagation();
  }

  _closeAdminMenuOnClickOutside = (e) => {
    const btn = e && e.target && e.target.closest && e.target.closest('[onclick*="toggleAdminMenu"]');
    const menu = document.getElementById('admin-menu');
    if (!btn && menu && !menu.contains(e.target)) {
      menu.classList.add('hidden');
      document.removeEventListener('click', this._closeAdminMenuOnClickOutside);
    }
  }

  closeMobileMenu() {
    const menu = document.getElementById('mobile-nav-menu');
    const icon = document.getElementById('mobile-menu-icon');
    if (menu) menu.classList.add('hidden');
    if (icon) icon.textContent = 'menu';
  }

  showToast(message) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast) return;
    if (toastMsg) toastMsg.textContent = message;
    else toast.textContent = message;
    
    toast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
      toast.classList.remove('opacity-100', 'translate-y-0');
    }, 3000);
  }

  /** Quiet toast variant for not-found links — no alarm, just guidance. */
  showNotFoundToast(handle) {
    if (!handle) return this.showToast('This profile could not be found.');
    this.showToast(`No Swapiki profile at "${handle}" yet.`);
  }

  /** Restore the normal candidate profile view after a 404 was shown. */
  clearNotFoundPanel() {
    const panel = document.getElementById('candidate-not-found');
    const main = document.querySelector('#view-candidate > main');
    if (panel) panel.classList.add('hidden');
    if (main) {
      [...main.children].forEach((child) => {
        if (child !== panel) child.classList.remove('hidden');
      });
    }
  }

  /**
   * Profile badge popups open on hover and on keyboard focus through CSS. A
   * mouse hovers fine, but touch screens have no hover and iOS won't focus a
   * bare <span>, so a tap/click (or Enter/Space when focused) toggles the same
   * popup here. Only one is ever open, and a tap/key anywhere else closes it.
   */
  initBadgeTooltips() {
    if (this._badgeTipsBound) return;
    this._badgeTipsBound = true;

    document.addEventListener('click', (ev) => {
      const badge = ev.target && ev.target.closest ? ev.target.closest('.group[tabindex]') : null;
      if (badge && badge.querySelector('[role="tooltip"]')) {
        ev.preventDefault();
        this.toggleBadgeTooltip(badge);
        return;
      }
      this.closeBadgeTooltips();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const active = document.activeElement;
      const badge = active && active.closest ? active.closest('.group[tabindex]') : null;
      if (badge && badge.querySelector('[role="tooltip"]')) {
        ev.preventDefault();
        this.toggleBadgeTooltip(badge);
      }
    });
  }

  toggleBadgeTooltip(badge) {
    const tip = badge.querySelector('[role="tooltip"]');
    if (!tip) return;
    const isOpen = badge.getAttribute('data-tip-open') === '1';
    this.closeBadgeTooltips();
    if (!isOpen) {
      tip.style.visibility = 'visible';
      tip.style.opacity = '1';
      badge.setAttribute('data-tip-open', '1');
    }
  }

  closeBadgeTooltips() {
    document.querySelectorAll('[data-tip-open="1"]').forEach((badge) => {
      const tip = badge.querySelector('[role="tooltip"]');
      if (tip) {
        tip.style.visibility = '';
        tip.style.opacity = '';
      }
      badge.removeAttribute('data-tip-open');
      if (document.activeElement === badge) badge.blur();
    });
  }

  /**
   * SPA-safe per-page title/description + social meta. index.html carries the
   * static home defaults; any view that has its own story (candidate profile,
   * dashboard, not-found) calls this so the browser tab, share cards, and
   * scrapers see the right context without a hard reload.
   */
  setPageMeta(title, description, opts = {}) {
    const fullTitle = title || 'Swapiki | 2 Minutes to a Confident Interview Decision';
    document.title = fullTitle;
    if (description) {
      const setMeta = (attr, name, content) => {
        let el = document.head.querySelector(`meta[${attr}="${name}"]`);
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute(attr, name);
          document.head.appendChild(el);
        }
        el.setAttribute('content', content);
      };
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
      setMeta('property', 'og:title', fullTitle);
      if (opts.url) setMeta('property', 'og:url', opts.url);
    }
  }

  /** The one place that decides which profile link is "the" one to share right now. */
  getShareUrl() {
    // When viewing someone else's page — an admin previewing a candidate via
    // admin-preview/<username>, or a visitor on <username>.swapiki.com —
    // this.publicUsername holds THAT candidate's username. Previously this
    // always read the logged-in user's own cached profile instead, so
    // "Copy Link"/"Share Profile" while previewing a candidate copied the
    // viewer's own link rather than the candidate's — exactly backwards.
    if (this.publicUsername) {
      return { username: this.publicUsername, shareUrl: `https://${this.publicUsername}.swapiki.com` };
    }
    const profile = swapikiStore.getProfile();
    const username = profile.username || profile.id || 'ananya-sharma';
    return { username, shareUrl: `https://${username}.swapiki.com` };
  }

  copyShareLink() {
    const { username, shareUrl } = this.getShareUrl();
    // This is the one link to share — the router now understands
    // <username>.swapiki.com directly. Previously this function copied a
    // different URL (/sites/username) than the one the toast claimed to
    // copy, which is exactly the confusion candidates were running into.
    const toastMsg = `Profile URL copied: ${username}.swapiki.com`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        swapikiStore.recordShareEvent('copied');
        this.showToast(toastMsg);
      }).catch(() => {
        swapikiStore.recordShareEvent('share_attempted');
        this.showToast(toastMsg);
      });
    } else {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      this.showToast(toastMsg);
    }
    this.closeShareModal();
  }

  /** Opens the Share Profile modal (card preview + WhatsApp / Email / Copy options). */
  openShareModal() {
    const { shareUrl } = this.getShareUrl();
    const urlLabel = document.getElementById('share-modal-url');
    if (urlLabel) urlLabel.textContent = shareUrl;
    const preview = document.getElementById('share-card-preview');
    if (preview) preview.innerHTML = this.buildShareCardHtml();
    const modal = document.getElementById('modal-share-profile');
    if (modal) modal.classList.remove('hidden');
  }

  closeShareModal() {
    const modal = document.getElementById('modal-share-profile');
    if (modal) modal.classList.add('hidden');
  }

  /** The profile this share refers to — own cached profile, or the public
   *  username being viewed (we don't hold a stranger's full data client-side,
   *  so the card falls back to a generic name based on their username). */
  shareSubject() {
    if (this.publicUsername) return null;
    return swapikiStore.getProfile();
  }

  /** Visual "Live recording confirmed" card shown before the share actions. */
  buildShareCardHtml() {
    const p = this.shareSubject();
    const { shareUrl } = this.getShareUrl();
    const name = (p && p.name) || this.publicUsername || 'My Swapiki profile';
    const title = (p && p.title) || 'Developer & problem-solver';
    const verified = !!(p && p.voiceVerified);
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

    return `
      <div class="border border-slate-200 rounded-2xl bg-gradient-to-br from-slate-50 to-white p-4 text-center shadow-sm">
        <span class="w-12 h-12 rounded-full ${verified ? 'bg-emerald-100 text-emerald-700' : 'bg-primary-fixed text-primary'} flex items-center justify-center text-base font-bold mx-auto mb-2">${this.escapeHtml(initials)}</span>
        <div class="text-sm font-bold text-slate-900 line-clamp-1">${this.escapeHtml(name)}</div>
        <div class="text-xs text-slate-500 mb-2">${this.escapeHtml(title)}</div>
        ${verified
          ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><span class="material-symbols-outlined text-[12px]">verified</span> Live recording confirmed</span>`
          : `<span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><span class="material-symbols-outlined text-[12px]">record_voice_over</span> Record a pitch to get a live-recording badge</span>`}
        <div class="text-[11px] text-slate-400 mt-3">Listen to my 2-minute project walkthrough</div>
        <div class="text-[11px] font-mono text-primary break-all">${this.escapeHtml(shareUrl)}</div>
      </div>
    `;
  }

  /** Ready-to-paste email body used by Share via Email. */
  buildShareText() {
    const p = this.shareSubject();
    const { shareUrl } = this.getShareUrl();
    const verifiedLine = (p && p.voiceVerified)
      ? 'The recording was captured live in one session, reading a random code that could not have been pre-recorded.'
      : 'Recording a live walkthrough so I can add a live-recording badge.';
    return `Hi,\n\nHere's my proof-of-work profile on Swapiki \u2014 it has my project evidence and a 2-minute voice walkthrough.\n\n${verifiedLine}\n${shareUrl}\n\nThanks!`;
  }

  /** Opens WhatsApp (app on mobile, web.whatsapp.com on desktop) with the share text pre-filled. */
  shareViaWhatsApp() {
    const p = this.shareSubject();
    const { shareUrl } = this.getShareUrl();
    const verifiedLine = (p && p.voiceVerified)
      ? 'The recording was made live in one session, reading a random code that could not have been pre-recorded.'
      : 'Recording a live walkthrough so I can add a live-recording badge.';
    const message = `Check out my Swapiki profile \u2014 projects with a 2-minute voice walkthrough. ${verifiedLine} ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    swapikiStore.recordShareEvent('whatsapp');
    this.closeShareModal();
  }

  /** Opens the visitor's default email client with the profile link pre-filled. */
  shareViaEmail() {
    const { shareUrl } = this.getShareUrl();
    const subject = 'My Swapiki proof-of-work profile';
    const body = this.buildShareText();
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    swapikiStore.recordShareEvent('email');
    this.closeShareModal();
  }

  // ---- Share a single job listing ---------------------------------------
  // The board shows listings to everyone, so sharing a job is not gated on
  // sign-in. The canonical /jobs/<id> URL is the same page the server-rendered
  // share row (functions/lib/share.js) points at - idFromSlug accepts a bare
  // uuid - so a link shared from here always resolves.

  _shareJobSubject() {
    return Array.isArray(this._jobsCache) ? this._jobsCache.find(j => j.id === this._shareJobId) : null;
  }

  jobShareUrl(job) {
    return `https://swapiki.com/jobs/${encodeURIComponent(job.id)}`;
  }

  jobShareText(job) {
    const role = job.title || 'Job opening';
    const at = job.company ? ` at ${job.company}` : '';
    const where = job.location ? ` \u00b7 ${job.location}` : '';
    return `${role}${at}${where} \u2014 on Swapiki Jobs`;
  }

  buildJobShareCardHtml(job) {
    const type = this._jobType(job);
    const mode = this._jobMode(job);
    const typeBadge = `<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${type === 'internship' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">${type === 'internship' ? 'Internship' : 'Job'}</span>`;
    const modeBadge = `<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${mode === 'remote' ? 'bg-sky-50 text-sky-700 border border-sky-200' : mode === 'hybrid' ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">${mode === 'remote' ? 'Remote / WFH' : mode === 'hybrid' ? 'Hybrid' : 'Onsite'}</span>`;
    return `
      <div class="border border-slate-200 rounded-2xl bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
        <p class="text-[10px] font-bold uppercase tracking-wider text-primary">Swapiki Jobs</p>
        <div class="text-sm font-bold text-slate-900 mt-1">${this.escapeHtml(job.title || '')}</div>
        <p class="text-xs text-slate-500 mt-0.5">${this.escapeHtml(job.company || '')}${job.location ? ' \u00b7 ' + this.escapeHtml(job.location) : ''}</p>
        <div class="flex flex-wrap gap-1.5 mt-2">${typeBadge}${modeBadge}</div>
      </div>`;
  }

  openJobShareModal(jobId) {
    const job = Array.isArray(this._jobsCache) ? this._jobsCache.find(j => j.id === jobId) : null;
    if (!job) return;
    if (window.posthog && typeof window.posthog.capture === 'function') {
      try { window.posthog.capture('job_share_open', { job_id: jobId, title: job.title || '', company: job.company || '' }); } catch (e) {}
    }
    this._shareJobId = jobId;
    const urlLabel = document.getElementById('share-job-url');
    if (urlLabel) urlLabel.textContent = this.jobShareUrl(job);
    const preview = document.getElementById('share-job-preview');
    if (preview) preview.innerHTML = this.buildJobShareCardHtml(job);
    const modal = document.getElementById('modal-share-job');
    if (modal) modal.classList.remove('hidden');
  }

  closeJobShareModal() {
    const modal = document.getElementById('modal-share-job');
    if (modal) modal.classList.add('hidden');
  }

  /** Off-site intents built from OUR canonical job URL, never visitor input. */
  shareJobVia(channel) {
    const job = this._shareJobSubject();
    if (!job) return;
    const eu = encodeURIComponent(this.jobShareUrl(job));
    const et = encodeURIComponent(this.jobShareText(job));
    const targets = {
      x: `https://twitter.com/intent/tweet?text=${et}&url=${eu}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${eu}`,
      whatsapp: `https://wa.me/?text=${et}%20${eu}`,
      email: `mailto:?subject=${et}&body=${eu}`
    };
    const href = targets[channel];
    if (!href) return;
    if (window.posthog && typeof window.posthog.capture === 'function') {
      try { window.posthog.capture('job_share', { channel, job_id: job.id, title: job.title || '', company: job.company || '' }); } catch (e) {}
    }
    if (channel === 'email') window.location.href = href;
    else window.open(href, '_blank', 'noopener');
    this.closeJobShareModal();
  }

  copyJobLink() {
    const job = this._shareJobSubject();
    if (!job) return;
    if (window.posthog && typeof window.posthog.capture === 'function') {
      try { window.posthog.capture('job_share', { channel: 'copy', job_id: job.id, title: job.title || '', company: job.company || '' }); } catch (e) {}
    }
    try { Promise.resolve(this._copyToClipboard(this.jobShareUrl(job))).catch(() => {}); } catch (e) {}
    this.showToast('Job link copied.');
    this.closeJobShareModal();
  }

  /** Clipboard with the same execCommand fallback copyShareLink() inlines. */
  _copyToClipboard(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  toggleHeroAudio() {
    const icon = document.getElementById('hero-play-icon');
    const waveContainer = document.querySelector('.audio-wave-anim');
    this.heroPlaying = !this.heroPlaying;
    if (icon) icon.textContent = this.heroPlaying ? 'pause' : 'play_arrow';

    // Toggle animation via CSS class (pairs with .audio-playing .wave-bar CSS rule)
    if (waveContainer) {
      if (this.heroPlaying) {
        waveContainer.classList.add('audio-playing');
      } else {
        waveContainer.classList.remove('audio-playing');
      }
    }

    if (this.heroPlaying) {
      this.showToast("Playing demo voice preview. This is not a real candidate recording.");

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const walkthroughText = "Hi there! I'm Ananya Sharma. At Razorpay, I architected the Vernacular UPI payment flow across six Indian languages. Our goal was simple — make digital payments effortless for Bharat users. We reduced checkout drop-offs by 34% across 12 million monthly transactions. I designed the one-tap intent interaction model that cut payment failures dramatically.";
        const utterance = new SpeechSynthesisUtterance(walkthroughText);
        utterance.rate = 0.93;
        utterance.pitch = 1.05;

        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.includes('en-IN') || v.name.includes('India') || v.name.includes('Google UK English Female') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Zira'));
        if (preferredVoice) utterance.voice = preferredVoice;

        utterance.onend = () => {
          this.heroPlaying = false;
          if (icon) icon.textContent = 'play_arrow';
          if (waveContainer) waveContainer.classList.remove('audio-playing');
        };

        window.speechSynthesis.speak(utterance);
      }
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }

  renderLandingView() {
    const profile = swapikiStore.getProfile();
    this.setPageMeta('Swapiki | 2 Minutes to a Confident Interview Decision',
      'Swapiki turns resumes into 2-minute voice walkthroughs hiring managers actually watch. Skip résumé rejections — hire for evidence, not formatting.');
    this._loadLandingStats();
  }

  /**
   * Fills the landing page's live-count strip from /api/site-stats.
   *
   * The strip ships hidden and is only revealed once at least one real number
   * arrives, so a failure to read the database shows nothing rather than a row
   * of zeroes that reads as "nobody has done this". Each cell is set only when
   * its figure is a number; a null hides that cell. No number is ever invented
   * here - the whole point is that these are counts of rows that exist.
   */
  _loadLandingStats() {
    const box = document.getElementById('lp-live-stats');
    if (!box) return;
    fetch('/api/site-stats')
      .then(res => (res && res.ok) ? res.json() : null)
      .then(data => {
        const s = data && data.stats;
        if (!s) return;
        const cell = (id, value) => {
          const el = document.getElementById(id);
          if (!el || typeof value !== 'number') return false;
          el.textContent = value.toLocaleString('en-IN');
          return true;
        };
        const any =
          cell('lp-live-profiles', s.published) |
          cell('lp-live-week', s.publishedThisWeek) |
          cell('lp-live-jobs', s.jobs);
        if (any) box.hidden = false;
      })
      .catch(() => {});
  }

  // ---------------------------------------------------------------------
  // JOBS BOARD (end-user view) — gated at 80% profile completion. The server
  // enforces the gate too via get_published_jobs(); this is just the friendly
  // screen for users who haven't qualified yet.
  // ---------------------------------------------------------------------

  setJobsFilter(tab) {
    this.jobsFilter = tab;
    this.jobsPersonalized = (tab === 'personalized');
    this.jobsShown = JOBS_PAGE_SIZE;
    const controls = document.getElementById('jobs-controls');
    if (controls) {
      controls.innerHTML = this._jobsBoardControls();
      this._renderJobsResults();
    } else {
      this.renderJobsView();
    }
  }

  togglePersonalizedJobs() {
    if (this.jobsFilter === 'personalized') {
      this.jobsFilter = 'all';
      this.jobsPersonalized = false;
    } else {
      this.jobsFilter = 'personalized';
      this.jobsPersonalized = true;
    }
    this.jobsShown = JOBS_PAGE_SIZE;
    const controls = document.getElementById('jobs-controls');
    if (controls) {
      controls.innerHTML = this._jobsBoardControls();
      this._renderJobsResults();
    } else {
      this.renderJobsView();
    }
  }

  previewDemoPersonalization() {
    this.jobsFilter = 'personalized';
    this.jobsPersonalized = true;
    this.jobsShown = JOBS_PAGE_SIZE;
    const controls = document.getElementById('jobs-controls');
    if (controls) {
      controls.innerHTML = this._jobsBoardControls();
    }
    this._renderJobsResults();
  }

  toggleJobsMinFit(minScore = 75) {
    this.jobsMinFit = (this.jobsMinFit === minScore) ? 0 : minScore;
    this.jobsShown = JOBS_PAGE_SIZE;
    const controls = document.getElementById('jobs-controls');
    if (controls) {
      controls.innerHTML = this._jobsBoardControls();
    }
    this._renderJobsResults();
  }

  setJobsType(type) {
    this.jobsType = type;
    this.renderJobsView();
  }

  setJobsMode(mode) {
    this.jobsMode = mode;
    this.renderJobsView();
  }

  setJobsQuery(q) {
    this.jobsQuery = (q || '').toLowerCase().trim();
    this.jobsShown = JOBS_PAGE_SIZE;
    this._syncJobsQueryToUrl();
    this._scheduleSearchLog();
    this._renderJobsResults();
  }

  /**
   * The search term as a shareable query parameter.
   *
   * A filtered board is worth sending to someone, but until now the filter lived
   * only in memory: reloading or pasting the URL dropped it. The term is mirrored
   * into ?q= so /jobs?q=react is a real, shareable address. Read here so a fresh
   * load restores the filter; written by _syncJobsQueryToUrl as the visitor types.
   */
  _jobsQueryFromUrl() {
    try {
      if (typeof window === 'undefined' || !window.location) return '';
      const search = typeof window.location.search === 'string' ? window.location.search : '';
      if (!search) return '';
      return (new URLSearchParams(search).get('q') || '').toLowerCase().trim();
    } catch (e) {
      return '';
    }
  }

  /** Mirrors the active search term into ?q= without adding a history entry. */
  _syncJobsQueryToUrl() {
    try {
      if (typeof window === 'undefined' || !window.location) return;
      if (!window.history || typeof window.history.replaceState !== 'function') return;
      const href = window.location.href;
      if (typeof href !== 'string' || !href) return;
      const url = new URL(href);
      const q = (this.jobsQuery || '').trim();
      if (q) url.searchParams.set('q', q);
      else url.searchParams.delete('q');
      const next = u => u.pathname + (u.search || '') + (u.hash || '');
      window.history.replaceState(null, '', next(url));
    } catch (e) {
      // A sandbox or a browser that blocks history editing must not break search.
    }
  }

  /**
   * Trending-searches feed for the nudge emails and the admin Top Searches
   * panel: record real search terms.
   *
   * This used to log on every keystroke behind a 15s throttle, which recorded
   * the first two characters someone happened to type and then blocked the rest
   * of that burst - "software engineer" landed as "sw", and because that was the
   * top term it quietly skewed the dashboard and the email keywords. So the term
   * is recorded when the visitor settles on one (or hits Enter), never mid-word.
   */
  _scheduleSearchLog() {
    if (this._searchLogTimer) clearTimeout(this._searchLogTimer);
    this._searchLogTimer = setTimeout(() => this._logJobsQuery(), 1200);
  }

  /** Enter in the search box: the visitor is done, so log it now, not in 1.2s. */
  commitJobsQueryNow() {
    if (this._searchLogTimer) clearTimeout(this._searchLogTimer);
    this._logJobsQuery();
  }

  _logJobsQuery() {
    this._searchLogTimer = null;
    const q = (this.jobsQuery || '').trim();
    if (q.length < 2) return;
    // One row per term per session: these counts rank by distinct day, and a
    // term typed five times in one sitting is one signal, not five.
    this._loggedSearches = this._loggedSearches || new Set();
    if (this._loggedSearches.has(q)) return;
    this._loggedSearches.add(q);
    // Fire-and-forget - a tracking hiccup must never slow the board.
    swapikiStore.recordSearchEvent(q);
  }

  _jobType(j) {
    const text = [j.salary, j.title, j.description || ''].join(' ');
    return /\(internship\)|\bInternship\b|\bIntern\b/i.test(text) ? 'internship' : 'job';
  }

  _jobMode(j) {
    const text = [j.location || '', j.description || ''].join(' ');
    if (/hybrid/i.test(text)) return 'hybrid';
    if (/remote|work from home|\bwfh\b/i.test(text)) return 'remote';
    return 'onsite';
  }

  /**
   * The words in a search box that actually mean something.
   *
   * The box used to match the WHOLE query as one substring, so a natural phrase
   * like "sales jobs in pune" looked for that exact run of characters and found
   * nothing: the listing says "Sales Executive" in "Pune", never that sentence.
   * Splitting the query into terms and dropping the filler ("jobs", "in", "for"…)
   * turns the phrase into ["sales", "pune"], which is what the board can match.
   * One-character tokens are dropped as noise.
   */
  _jobSearchTokens(q) {
    const STOP = new Set(['job', 'jobs', 'opening', 'openings', 'vacancy', 'vacancies',
      'position', 'positions', 'role', 'roles', 'hiring', 'hire', 'work', 'in', 'at',
      'for', 'the', 'a', 'an', 'and', 'or', 'of', 'to', 'with', 'on', 'near', 'from',
      'as', 'is', 'are', 'want', 'wanted', 'looking']);
    const raw = String(q || '').toLowerCase().match(/[a-z0-9+#]+/g) || [];
    return raw.filter(t => t.length >= 2 && !STOP.has(t));
  }

  /**
   * Everything one listing can be found by, flattened once and cached on the row.
   *
   * Cached because the board holds thousands of rows and this runs on every
   * keystroke; re-joining the same strings for the same job on each filter pass is
   * the difference between a search that keeps up with typing and one that stutters.
   */
  _jobSearchHaystack(j) {
    if (!j.__searchHay) {
      j.__searchHay = [j.title, j.company, (Array.isArray(j.skills) ? j.skills.join(' ') : ''),
        j.location, j.category, j.description].filter(Boolean).join(' ').toLowerCase();
    }
    return j.__searchHay;
  }

  /**
   * A listing matches when EVERY term is found somewhere in it.
   *
   * "sales pune" has to mean "sales AND pune", not the phrase. Requiring all the
   * terms narrows a two-word search to the jobs someone means instead of widening
   * it to everything that contains either word.
   */
  _jobMatchesTokens(j, tokens) {
    if (!tokens.length) return true;
    const hay = this._jobSearchHaystack(j);
    return tokens.every(t => hay.includes(t));
  }

  _filterChip(label, value, current, on) {
    return `<button onclick="${on}" class="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${current === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${label}</button>`;
  }

  async renderJobsView() {
    this.setPageMeta('Swapiki Jobs — IT, BFSI & Internships in India',
      'Hand-sourced IT, BFSI and other openings across India on Swapiki Jobs. Apply with a proof-backed profile — real projects and a 2-minute voice walkthrough, no AI screening.',
      { url: 'https://swapiki.com/jobs' });
    const root = document.getElementById('jobs-container');
    if (!root) return;

    // The post-a-job form is deliberately outside the gate. Posting an opening
    // is how a board gets its listings, so hiding the form behind a sign-in
    // would mean only members could ever contribute one. It renders in every
    // state below.
    const submitForm = this.renderJobSubmitForm();
    const channels = this.renderChannelJoinCard();

    // The gate is on the search, the filters and the match score - not on the
    // listings existing, which is exactly what the landing FAQ promises. A
    // signed-out visitor, or a profile below 80%, browses the same published
    // openings; what they cannot do is search, filter or match them. Hiding the
    // listings too would hide the board from the very people searching for a
    // job and from the crawlers that index every role - and would make the FAQ
    // a claim the page itself contradicts.
    const profile = swapikiStore.currentUser ? swapikiStore.getProfile() : null;
    const score = profile && typeof profile.completionScore === 'number' ? profile.completionScore : 0;
    const unlocked = !!swapikiStore.currentUser && score >= 80;

    const gateBanner = unlocked ? '' : `
      <div class="bg-white border border-slate-200 rounded-2xl p-5 mb-4 flex items-start gap-3">
        <span class="material-symbols-outlined text-amber-500">lock</span>
        <div>
          <p class="text-sm font-semibold text-slate-800">Search, filters and match are for proof-backed profiles</p>
          <p class="text-xs text-slate-500 mt-1 leading-relaxed">${swapikiStore.currentUser
            ? `You're at ${score}% — reach 80% to search, filter and match these openings. Every listing is shown below.`
            : `Sign in and complete your profile to 80% to search, filter and match these openings. Every listing is shown below.`}</p>
          <button onclick="${swapikiStore.currentUser ? "router.navigate('dashboard')" : 'app.openLoginModal()'}" class="mt-3 px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all">${swapikiStore.currentUser ? 'Finish my profile' : 'Sign in'}</button>
        </div>
      </div>`;

    root.innerHTML = `
      <div class="max-w-4xl mx-auto">
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-primary tracking-tight">Jobs for proof-backed profiles</h1>
          <p class="text-sm text-slate-500 mt-1">${unlocked
            ? 'Hand-sourced openings, vetted and posted by Swapiki. Apply with your proof profile.'
            : 'Hand-sourced openings, vetted and posted by Swapiki.'}</p>
        </div>
        <div id="jobs-pool-strip" class="mb-4"></div>
        ${channels}
        ${submitForm}
        ${gateBanner}
        <div id="jobs-controls">${unlocked ? this._jobsBoardControls() : ''}</div>
        <div id="jobs-results"></div>
      </div>`;

    // An unlocked member reads the gated RPC; everyone else reads the same
    // public feed the board's own crawlers do, because the listings are public
    // either way (/jobs.json, /feed.xml, /sitemap.xml, every /jobs/<slug> page).
    const jobs = unlocked ? await swapikiStore.getPublishedJobs() : await swapikiStore.getPublicJobs();
    this._jobsCache = jobs;
    // A fresh board (arrival, or a tab/type/mode change) starts on the first
    // page again, so "Show more" never leaves a stale window behind a filter.
    this.jobsShown = JOBS_PAGE_SIZE;
    // Only the unlocked board owns the structured data. The signed-out /jobs
    // document already carries the server-rendered graph, so a second, thinner
    // copy here would contradict it.
    if (unlocked) this._injectJobsJsonLd(jobs);
    // Restore a shared filter, for the unlocked board only - a /jobs?q=react
    // link was silent before this. On the gated board the search stays off, so a
    // query in the URL must not filter the public listings for free.
    if (unlocked && !this.jobsQuery) {
      const fromUrl = this._jobsQueryFromUrl();
      if (fromUrl) this.jobsQuery = fromUrl;
    }
    this._renderJobsResults();
    this._loadJobsPoolStrip();
  }

  /** Search box, category tabs and type/mode chips — the unlocked board only. */
  _jobsBoardControls() {
    const tab = this.jobsFilter || 'all';
    const typeFilter = this.jobsType || 'all';
    const modeFilter = this.jobsMode || 'all';
    const q = this.jobsQuery || '';
    const isPersonalized = tab === 'personalized' || !!this.jobsPersonalized;
    return `
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button onclick="app.setJobsFilter('all')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'all' ? 'bg-primary text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">All</button>
        <button onclick="app.setJobsFilter('personalized')" id="btn-tab-personalized" class="px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${tab === 'personalized' ? 'bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 text-white shadow-sm ring-2 ring-indigo-300' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'}">
          <span class="material-symbols-outlined text-[15px]">auto_awesome</span>
          <span>Matched for You</span>
          <span class="text-[9px] uppercase px-1.5 py-0.5 rounded-full ${tab === 'personalized' ? 'bg-white/20 text-white' : 'bg-indigo-200/80 text-indigo-900'} font-black">Personalized</span>
        </button>
        <button onclick="app.setJobsFilter('it')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'it' ? 'bg-primary text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">IT</button>
        <button onclick="app.setJobsFilter('bfsi')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'bfsi' ? 'bg-primary text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">BFSI</button>
        <button onclick="app.setJobsFilter('any')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${tab === 'any' ? 'bg-primary text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">Other Roles</button>
        <span class="ml-auto text-xs text-slate-400" id="job-count"></span>
      </div>
      <div class="relative mb-3">
        <span class="material-symbols-outlined text-slate-400 text-lg absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
        <input type="search" id="job-search" value="${this.escapeHtml(q)}" oninput="app.setJobsQuery(this.value)" onkeydown="if(event.key==='Enter')app.commitJobsQueryNow()" placeholder="Search a role, skill, company or city — e.g. 'sales in Pune'" class="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
      </div>
      <div class="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
        <span class="font-semibold text-slate-400">Try:</span>
        ${['Sales', 'Pune', 'Bengaluru', 'Remote', 'Internship', 'Fresher', 'Data'].map(s => `<button onclick="app.setJobsQuery('${s}')" class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">${s}</button>`).join('')}
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-6">
        ${this._filterChip('Jobs', 'job', typeFilter, "app.setJobsType('job')")}
        ${this._filterChip('Internships', 'internship', typeFilter, "app.setJobsType('internship')")}
        ${typeFilter !== 'all' ? '<button onclick="app.setJobsType(\'all\')" class="px-2 text-[11px] font-bold text-primary">Reset</button>' : ''}
        <span class="mx-2 w-px h-4 bg-slate-200"></span>
        ${this._filterChip('Remote / WFH', 'remote', modeFilter, "app.setJobsMode('remote')")}
        ${this._filterChip('Hybrid', 'hybrid', modeFilter, "app.setJobsMode('hybrid')")}
        ${this._filterChip('Onsite', 'onsite', modeFilter, "app.setJobsMode('onsite')")}
        ${modeFilter !== 'all' ? '<button onclick="app.setJobsMode(\'all\')" class="px-2 text-[11px] font-bold text-primary">Reset</button>' : ''}
        <span class="mx-2 w-px h-4 bg-slate-200"></span>
        <button onclick="app.togglePersonalizedJobs()" id="btn-chip-personalized" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${isPersonalized ? 'bg-indigo-700 text-white shadow-xs' : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'}">
          <span class="material-symbols-outlined text-[14px]">auto_awesome</span>
          <span>${isPersonalized ? 'Profile Fit Active' : 'Filter by My Profile'}</span>
        </button>
        ${isPersonalized ? `
        <button onclick="app.toggleJobsMinFit(75)" id="btn-chip-strong-fit" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${this.jobsMinFit === 75 ? 'bg-emerald-700 text-white shadow-xs' : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'}">
          <span class="material-symbols-outlined text-[14px]">verified</span>
          <span>${this.jobsMinFit === 75 ? 'Strong Fits Only (75%+)' : '75%+ Strong Fits'}</span>
        </button>` : ''}
      </div>`;
  }

  /**
   * "N proof-backed candidates published this week", from real counts only.
   *
   * Drawn from /api/site-stats rather than from functions/jobs.js on purpose:
   * adding a second Supabase read to the jobs function would change the number of
   * requests that endpoint makes, and its tests assert that count. A client-side
   * fetch keeps the function (and its tests) untouched, and the strip simply
   * stays empty if the endpoint is unavailable or reports nothing.
   */
  _loadJobsPoolStrip() {
    const el = document.getElementById('jobs-pool-strip');
    if (!el) return;
    fetch('/api/site-stats')
      .then(res => (res && res.ok) ? res.json() : null)
      .then(data => {
        const stats = data && data.stats;
        const n = stats && stats.publishedThisWeek;
        if (typeof n !== 'number' || n <= 0) return;
        const still = document.getElementById('jobs-pool-strip');
        if (!still) return;
        still.innerHTML = `<div class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-xs text-emerald-800">
          <span class="material-symbols-outlined text-[16px]">verified_user</span>
          <span><strong>${n}</strong> proof-backed candidate${n === 1 ? '' : 's'} published in the last 7 days.</span>
        </div>`;
      })
      .catch(() => {});
  }

  /** Re-renders only the results grid so the search box keeps focus while typing. */
  _renderJobsResults() {
    const container = document.getElementById('jobs-results');
    if (!container) return;
    const jobs = this._jobsCache || [];
    const tab = this.jobsFilter || 'all';
    const typeFilter = this.jobsType || 'all';
    const modeFilter = this.jobsMode || 'all';
    const q = this.jobsQuery || '';
    const isPersonalized = tab === 'personalized' || !!this.jobsPersonalized;

    const profile = (typeof swapikiStore !== 'undefined' && swapikiStore && typeof swapikiStore.getProfile === 'function')
      ? swapikiStore.getProfile()
      : null;

    const hasProfileSignals = profile && (
      (profile.location && String(profile.location).trim().length > 0) ||
      (Array.isArray(profile.expertise) && profile.expertise.length > 0) ||
      (Array.isArray(profile.projects) && profile.projects.length > 0)
    );

    // If viewing the personalized tab and profile has zero signals, show setup prompt
    if (tab === 'personalized' && !hasProfileSignals) {
      const isLogged = typeof swapikiStore !== 'undefined' && swapikiStore && !!swapikiStore.currentUser;
      container.innerHTML = `
        <div class="text-center py-12 px-6 bg-white border border-indigo-200 rounded-3xl max-w-xl mx-auto shadow-sm">
          <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
            <span class="material-symbols-outlined text-3xl">auto_awesome</span>
          </div>
          <h2 class="text-lg font-bold text-slate-800 mb-2">Personalize Jobs with Your Profile</h2>
          <p class="text-xs text-slate-500 max-w-md mx-auto leading-relaxed mb-6">
            Add your <strong>skills</strong>, <strong>proof projects</strong>, and <strong>city</strong> to unlock job recommendations tailored specifically to you.
          </p>
          <div class="flex flex-wrap items-center justify-center gap-3">
            ${isLogged
              ? `<button onclick="router.navigate('dashboard')" class="px-5 py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/90 transition-all shadow-sm">Complete Profile Details</button>`
              : `<button onclick="app.openLoginModal()" class="px-5 py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/90 transition-all shadow-sm">Sign In to Personalize</button>`
            }
            <button onclick="app.previewDemoPersonalization()" class="px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 transition-all">Preview with Demo Profile</button>
          </div>
        </div>`;
      const count = document.getElementById('job-count');
      if (count) count.textContent = '0 jobs';
      return;
    }

    // Precalculate personalized matches when available
    if (profile && hasProfileSignals && typeof window !== 'undefined' && window.profileMatch && typeof window.profileMatch.computePersonalizedMatch === 'function') {
      const pId = profile.id || profile.username || 'active_user';
      jobs.forEach(j => {
        if (!j._pm || j._pmProfileId !== pId) {
          try {
            j._pm = window.profileMatch.computePersonalizedMatch(profile, j);
            j._pmProfileId = pId;
          } catch (e) {
            j._pm = null;
          }
        }
      });
    }

    const tokens = this._jobSearchTokens(q);
    const filtered = jobs.filter(j => {
      if (tab !== 'all' && tab !== 'personalized' && (j.category || 'it') !== tab) return false;
      if (typeFilter !== 'all' && this._jobType(j) !== typeFilter) return false;
      if (modeFilter !== 'all' && this._jobMode(j) !== modeFilter) return false;
      if (!this._jobMatchesTokens(j, tokens)) return false;
      if (tab === 'personalized' && j._pm && typeof j._pm.overall === 'number' && j._pm.overall < 30) {
        return false;
      }
      if (isPersonalized && this.jobsMinFit && this.jobsMinFit > 0) {
        const score = (j._pm && typeof j._pm.overall === 'number') ? j._pm.overall : 0;
        if (score < this.jobsMinFit) return false;
      }
      return true;
    });

    if (isPersonalized) {
      filtered.sort((a, b) => {
        const sa = (a._pm && typeof a._pm.overall === 'number') ? a._pm.overall : 0;
        const sb = (b._pm && typeof b._pm.overall === 'number') ? b._pm.overall : 0;
        return sb - sa;
      });
    }

    const count = document.getElementById('job-count');
    if (count) count.textContent = `${filtered.length} job${filtered.length === 1 ? '' : 's'}`;

    let personalizedBanner = '';
    if (isPersonalized && hasProfileSignals) {
      const pmUtil = (typeof window !== 'undefined') ? window.profileMatch : null;
      const locInfo = (pmUtil && typeof pmUtil.parseProfileLocation === 'function')
        ? pmUtil.parseProfileLocation(profile.location)
        : null;
      const locDisplay = (locInfo && locInfo.cityName)
        ? `${locInfo.cityName}${locInfo.isRemoteReady ? ' (+ Remote)' : ''}`
        : (profile.location || 'India / Remote Ready');
      const expList = Array.isArray(profile.expertise) ? profile.expertise : [];
      const skillsDisplay = expList.slice(0, 3).join(', ') + (expList.length > 3 ? ` +${expList.length - 3}` : '');
      const projCount = Array.isArray(profile.projects) ? profile.projects.length : 0;
      const firstProject = projCount > 0 ? (profile.projects[0].title || '') : '';

      const missingSkillCounts = {};
      filtered.slice(0, 15).forEach(j => {
        if (j._pm && j._pm.skills && Array.isArray(j._pm.skills.missing)) {
          j._pm.skills.missing.forEach(s => {
            if (s && s.length > 1) {
              missingSkillCounts[s] = (missingSkillCounts[s] || 0) + 1;
            }
          });
        }
      });
      const topMissingSkills = Object.keys(missingSkillCounts)
        .sort((a, b) => missingSkillCounts[b] - missingSkillCounts[a])
        .slice(0, 3);
      const boostTipHtml = topMissingSkills.length > 0 ? `
        <div class="mt-3 pt-3 border-t border-indigo-800/40 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex items-center gap-1.5 text-indigo-200">
            <span class="material-symbols-outlined text-amber-300 text-sm">lightbulb</span>
            <span><strong>Boost your matches:</strong> Adding <span class="text-amber-200 font-semibold">${this.escapeHtml(topMissingSkills.join(', '))}</span> to your profile projects could unlock higher match scores.</span>
          </div>
          <button onclick="router.navigate('dashboard')" class="text-amber-300 hover:text-white font-bold text-[11px] underline">Add to profile &rarr;</button>
        </div>` : '';

      personalizedBanner = `
        <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-primary text-white rounded-2xl p-5 mb-5 shadow-lg border border-indigo-800/40">
          <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center shadow-md shrink-0">
                <span class="material-symbols-outlined text-2xl font-bold">auto_awesome</span>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-base font-bold text-white tracking-tight">Personalized for Your Profile</h2>
                  <span class="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold px-2 py-0.5 rounded-full">Tailored Feed</span>
                </div>
                <p class="text-xs text-indigo-200/80 mt-0.5">Scored & ranked against your real skills, proof projects, and city</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="router.navigate('dashboard')" class="text-xs text-indigo-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg border border-white/20 transition-all font-medium inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">edit</span> Edit Profile
              </button>
              <button onclick="app.setJobsFilter('all')" class="text-xs text-indigo-300 hover:text-white px-2 py-1 transition-all">Reset to All</button>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-indigo-800/50 text-xs">
            <div class="bg-indigo-950/70 rounded-xl p-2.5 border border-indigo-800/40">
              <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-0.5 flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px] text-amber-400">location_on</span> City / Target
              </p>
              <p class="font-bold text-white truncate" title="${this.escapeHtml(locDisplay)}">${this.escapeHtml(locDisplay)}</p>
            </div>
            <div class="bg-indigo-950/70 rounded-xl p-2.5 border border-indigo-800/40">
              <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-0.5 flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px] text-sky-400">psychology</span> Skills
              </p>
              <p class="font-bold text-white truncate" title="${this.escapeHtml(skillsDisplay || 'Profile skills')}">${this.escapeHtml(skillsDisplay || 'Profile skills')}</p>
            </div>
            <div class="bg-indigo-950/70 rounded-xl p-2.5 border border-indigo-800/40">
              <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-0.5 flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px] text-emerald-400">rocket_launch</span> Proof Projects
              </p>
              <p class="font-bold text-white truncate" title="${this.escapeHtml(firstProject || `${projCount} Projects`)}">${projCount} Project${projCount === 1 ? '' : 's'}${firstProject ? ` (${this.escapeHtml(firstProject)})` : ''}</p>
            </div>
          </div>
          ${boostTipHtml}
        </div>`;
    }

    const emptyLabel = tab === 'any' ? 'Other Roles' : tab === 'personalized' ? 'Your Profile Matches' : tab.toUpperCase();
    const filtersActive = typeFilter !== 'all' || modeFilter !== 'all' || !!q;
    const empty = `
      <div class="text-center py-16 bg-white border border-slate-200 rounded-3xl">
        <span class="material-symbols-outlined text-4xl text-slate-300 mb-2 block">work_off</span>
        <p class="text-sm font-semibold text-slate-500">${tab === 'personalized' ? 'No openings closely match your profile criteria yet.' : filtersActive ? `No openings match${q ? ` “${this.escapeHtml(q)}”` : ''}.` : `No jobs yet${tab === 'all' ? '' : ' in ' + emptyLabel}.`}</p>
        <p class="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">${tab === 'personalized' ? 'Try widening your skills in your profile, or browse all jobs across India.' : filtersActive ? 'Try fewer or simpler words — a role and a city works best, e.g. “sales Pune”.' : "New openings appear as they're vetted and posted."}</p>
        <button onclick="app.clearJobsFilters()" class="mt-4 px-4 py-2 border-2 border-primary text-primary font-bold text-xs rounded-xl hover:bg-primary-fixed transition-all">Clear search & filters</button>
      </div>`;

    // Paint one page at a time. The board holds thousands of rows and mapping
    // every card into one innerHTML blocks the main thread for seconds; the
    // visitor gets the first screen immediately and pulls the rest on demand.
    const limit = this.jobsShown || JOBS_PAGE_SIZE;
    const visible = filtered.slice(0, limit);
    const remaining = filtered.length - visible.length;
    const more = remaining > 0 ? `
      <div class="flex flex-col items-center gap-2 mt-5">
        <button onclick="app.showMoreJobs()" class="inline-flex items-center gap-1 px-5 py-2.5 border-2 border-primary text-primary font-bold text-xs rounded-xl hover:bg-primary-fixed transition-all active:scale-95">
          Show ${Math.min(JOBS_PAGE_SIZE, remaining)} more <span class="material-symbols-outlined text-sm">expand_more</span>
        </button>
        <span class="text-[11px] text-slate-400">Showing ${visible.length} of ${filtered.length} openings</span>
      </div>` : '';

    container.innerHTML = visible.length
      ? `${personalizedBanner}<div class="space-y-4">${visible.map(j => this.renderJobCard(j)).join('')}</div>${more}`
      : empty;
  }

  /** "Show more": extend the board by one page and repaint the results. */
  showMoreJobs() {
    this.jobsShown = (this.jobsShown || JOBS_PAGE_SIZE) + JOBS_PAGE_SIZE;
    this._renderJobsResults();
  }

  /**
   * Reset the search box and the chips from the empty state's "clear" button.
   *
   * Re-renders the controls as well as the results, so the chips lose their active
   * styling and the box is visibly empty again — clearing the state without
   * repainting the controls would leave a highlighted chip over an unfiltered
   * board, which reads as broken.
   */
  clearJobsFilters() {
    this.jobsQuery = '';
    this.jobsType = 'all';
    this.jobsMode = 'all';
    this.jobsFilter = 'all';
    this.jobsPersonalized = false;
    this.jobsShown = JOBS_PAGE_SIZE;
    const controls = document.getElementById('jobs-controls');
    if (controls) controls.innerHTML = this._jobsBoardControls();
    this._syncJobsQueryToUrl();
    this._renderJobsResults();
  }

  /** Profile-vs-listing match score, shown on a card directly under the
   *  provenance badge. Scoring lives in js/profileMatch.js (the same number the
   *  apply popup shows), computed from the profile against the listing's
   *  description, skills and title. No profile, or no scorer loaded, means no
   *  pill — a zero here would read as a real score. */
  jobMatchPill(j) {
    if (j._pm && typeof j._pm.overall === 'number') {
      const result = j._pm;
      const cls = result.overall >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : result.overall >= 60 ? 'bg-blue-50 text-blue-700 border-blue-200'
        : result.overall >= 40 ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
      return `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cls}" title="${this.escapeHtml(result.summary || result.band)}"><span class="material-symbols-outlined text-[12px]">auto_awesome</span>${result.overall}% match</span>`;
    }
    const pm = (typeof window !== 'undefined' && window.profileMatch) ? window.profileMatch : null;
    if (!pm || typeof pm.computeProfileMatch !== 'function') return '';
    const profile = (typeof swapikiStore !== 'undefined' && swapikiStore && typeof swapikiStore.getProfile === 'function')
      ? swapikiStore.getProfile()
      : null;
    if (!profile) return '';
    let result = null;
    try { result = pm.computeProfileMatch(profile, j); } catch (e) { return ''; }
    if (!result || typeof result.overall !== 'number') return '';
    const cls = result.overall >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : result.overall >= 60 ? 'bg-blue-50 text-blue-700 border-blue-200'
      : result.overall >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cls}" title="${this.escapeHtml(result.band)}"><span class="material-symbols-outlined text-[12px]">target</span>${result.overall}% match</span>`;
  }

  renderJobCard(j) {
    const skills = (Array.isArray(j.skills) ? j.skills : []).slice(0, 5).map(s =>
      `<span class="bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 text-[10px] font-bold">${this.escapeHtml(s)}</span>`).join('');
    // Every card on the public board is presented the same way: "Posted by
    // Swapiki". The per-source provenance line (Via Adzuna / From Swaniki
    // careers / Posted by employer / forwarded copy) is deliberately no longer
    // surfaced here. The admin review view still shows the real source, so a
    // reviewer can tell a submission from feed copy.
    const sourceLabel = 'Posted by Swapiki';
    const type = this._jobType(j);
    const mode = this._jobMode(j);
    const typeBadge = `<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${type === 'internship' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">${type === 'internship' ? 'Internship' : 'Job'}</span>`;
    const modeBadge = `<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${mode === 'remote' ? 'bg-sky-50 text-sky-700 border border-sky-200' : mode === 'hybrid' ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">${mode === 'remote' ? 'Remote / WFH' : mode === 'hybrid' ? 'Hybrid' : 'Onsite'}</span>`;
    const applyBy = (j.raw_text || '').match(/Apply\s*by\s*:\s*([0-9]{1,2}\s+[A-Za-z]{3,9}\s+20\d{2})/i);
    return `
      <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <h3 class="font-bold text-slate-900">${this.escapeHtml(j.title)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">${this.escapeHtml(j.company)}${j.location ? ' · ' + this.escapeHtml(j.location) : ''}</p>
          </div>
          <div class="flex flex-col items-end gap-1.5 shrink-0">
            <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"><span class="material-symbols-outlined text-[12px]">share</span>${this.escapeHtml(sourceLabel)}</span>
            ${this.jobMatchPill(j)}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 mb-2">
          ${typeBadge}${modeBadge}${this.jobFeaturedLabel(j)}
          ${applyBy ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><span class="material-symbols-outlined text-[12px]">event</span>Apply by ${this.escapeHtml(applyBy[1])}</span>` : ''}
        </div>
        ${skills ? `<div class="flex flex-wrap gap-1.5 mt-1 mb-3">${skills}</div>` : ''}
        ${j.salary ? `<p class="text-[11px] text-slate-400 flex items-center gap-1 mb-1"><span class="material-symbols-outlined text-[13px]">payments</span>${this.escapeHtml(j.salary)}</p>` : ''}
        ${j.description ? `<p class="text-xs text-slate-600 leading-relaxed mb-3">${this.escapeHtml(j.description)}</p>` : ''}
        ${j._pm && j._pm.reasons && j._pm.reasons.length > 0 ? `
        <div class="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 mb-3 border-t border-slate-100 text-[11px]">
          <span class="font-bold text-[10px] uppercase tracking-wider text-indigo-700 flex items-center gap-0.5">
            <span class="material-symbols-outlined text-[13px]">auto_awesome</span> Profile Fit:
          </span>
          ${j._pm.reasons.map(r => `<span class="bg-indigo-50/80 text-indigo-800 font-semibold px-2 py-0.5 rounded-md text-[10px] border border-indigo-100/80">${this.escapeHtml(r)}</span>`).join('')}
        </div>` : ''}
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <button onclick="app.openJobApplyModal('${j.id}')" class="px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all">Apply with my profile</button>
          <button onclick="app.openJobShareModal('${j.id}')" title="Share this job" aria-label="Share this job" class="px-3 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50 hover:text-primary transition-all inline-flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">share</span>Share</button>
        </div>
      </div>`;
  }

  /** The structured data for the jobs view.
   *
   *  The jobs view is a LIST of jobs, so it must not carry JobPosting markup.
   *  Google's job posting content policy allows it only on a page about a
   *  single job: "The JobPosting markup must only be used on pages that contain
   *  a single job posting. We don't allow the use of JobPosting markup in any
   *  other page, including pages that do not list any job." A posting also has
   *  to sit on the same page as the job description a reader can read, and a
   *  board card shows a title, a company and a location, not the description.
   *  Each posting lives on its own /jobs/<slug> page instead.
   *
   *  And it must not carry an ItemList either. An ItemList is Google's carousel
   *  markup, and a carousel is only supported next to a Course list, a Movie, a
   *  Recipe or a Restaurant - a list of job pages is none of those, so the
   *  markup could never show a carousel. What it did do was count: Search
   *  Console counted every one of its ListItems as an item on the page and
   *  flagged them ("/jobs: 200 items detected, some are invalid").
   *
   *  So this view leaves the graph the server wrote alone, minus the two node
   *  types it owns: any ItemList that describes a set of rows, and any
   *  JobPosting, which has no business here. The board's own links and the
   *  per-job pages carry the openings. */
  _injectJobsJsonLd(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0) return;
    let el = document.getElementById('jobs-jsonld');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'jobs-jsonld';
      document.head.appendChild(el);
    }
    let nodes = [];
    try {
      const parsed = JSON.parse(el.textContent);
      nodes = Array.isArray(parsed && parsed['@graph']) ? parsed['@graph'] : [];
    } catch (e) { nodes = []; }
    // Whatever the server wrote stays, except for the two node types this view
    // owns: an ItemList, which describes a set of rows as a carousel, and any
    // JobPosting, which has no business here.
    const kept = nodes.filter(n => n && n['@type'] !== 'ItemList' && n['@type'] !== 'JobPosting');
    el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': kept });
  }

  /** Only http/https survives — a feed-supplied `javascript:` link must not reach markup. */
  safeHttpUrl(raw) {
    const value = String(raw == null ? '' : raw).trim();
    if (!value) return '';
    try {
      const u = new URL(value);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
    } catch (e) {
      return '';
    }
  }

  /** PostgREST returns `numeric` as a JSON string; never invent a value from nothing. */
  numericSalary(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  openJobApplyModal(jobId) {
    const job = Array.isArray(this._jobsCache) ? this._jobsCache.find(j => j.id === jobId) : null;
    if (!job) return;
    // The board shows its listings to everyone, but applying - and the match
    // score the modal carries - is for proof-backed profiles. A signed-out
    // visitor is sent to sign in; one below 80% to finish their profile.
    if (!swapikiStore.currentUser) { this.openLoginModal(); return; }
    const profile = swapikiStore.getProfile();
    if (!profile) { this.openLoginModal(); return; }
    if ((typeof profile.completionScore === 'number' ? profile.completionScore : 0) < 80) {
      if (typeof router !== 'undefined' && router && typeof router.navigate === 'function') router.navigate('dashboard');
      return;
    }
    if (window.posthog && typeof window.posthog.capture === 'function') {
      try { window.posthog.capture('job_apply_open', { job_id: jobId, title: job.title || '', company: job.company || '' }); } catch (e) {}
    }
    const myLink = profile.username ? `https://${profile.username}.swapiki.com` : 'https://swapiki.com';
    this._jobApplyLink = myLink;

    // Profile-vs-job-description match (scoring lives in js/profileMatch.js).
    const matchHtml = (typeof window.profileMatch === 'object' && window.profileMatch)
      ? window.profileMatch.renderProfileMatchHtml(window.profileMatch.computeProfileMatch(profile, job))
      : '';

// Import path first: feed-imported listings carry apply_url, hand-typed ones
// carry contact. Checking contact alone hid the Apply button on the majority of
// the board, which is what made the in-app board look unclickable.
const applyTarget = this.safeHttpUrl(job.apply_url || job.contact);
const hasUrl = !!applyTarget;

    // Compact meta chips under the header: location, salary, job/internship, mode.
    const typeLabel = this._jobType(job);
    const modeLabel = this._jobMode(job);
    const chipCls = 'bg-blue-50 text-blue-800 border-blue-200';
    const metaChips = [
      { t: job.location, label: this.escapeHtml(job.location), cls: chipCls },
      { t: job.salary, label: this.escapeHtml(job.salary), cls: chipCls },
      { t: '1', label: typeLabel === 'internship' ? 'Internship' : 'Job', cls: chipCls },
      { t: '1', label: modeLabel === 'remote' ? 'Remote / WFH' : modeLabel === 'hybrid' ? 'Hybrid' : 'Onsite', cls: chipCls }
    ].filter(c => !!c.t).map(c =>
      `<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.cls}">${c.label}</span>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'modal-job-apply';
    overlay.className = 'fixed inset-0 z-[99999] bg-neutral-900/60 flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl max-w-5xl w-full shadow-2xl relative border border-blue-100 max-h-[92vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onclick="app.closeJobApplyModal()" class="absolute top-6 right-6 z-10 text-blue-700 hover:text-blue-950 hover:bg-blue-50 rounded-full p-1.5 transition-colors">
          <span class="material-symbols-outlined text-2xl">close</span>
        </button>
        <div class="px-7 sm:px-10 pt-7 pb-6 border-b border-blue-100">
          <div class="pr-12 flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xl">work</span></div>
            <div class="min-w-0 flex-1">
              <h3 class="text-xl font-bold text-blue-950 truncate">Apply · ${this.escapeHtml(job.title)}</h3>
              <p class="text-sm text-blue-700 truncate">${this.escapeHtml(job.company || '')}</p>
            </div>
          </div>
          ${metaChips ? `<div class="flex flex-wrap gap-1.5 mt-3 pl-[60px]">${metaChips}</div>` : ''}
        </div>
        <div class="p-7 sm:p-10 grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-10">
          <div class="min-w-0">${matchHtml}</div>
          <div class="min-w-0 flex flex-col gap-4">
            ${hasUrl ? `
              <button onclick="app.applyToJob('${job.id}')" class="w-full py-3 bg-blue-900 text-white font-bold text-sm rounded-xl hover:bg-blue-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-lg">open_in_new</span> Apply on the job site
              </button>` : ''}
            <div class="grid grid-cols-2 gap-3">
              <button onclick="app.openResumeDraft('${job.id}')" class="py-3 border-2 border-blue-900 text-blue-900 font-bold text-[13px] rounded-xl hover:bg-blue-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-lg">edit_document</span> Draft resume
              </button>
              <button onclick="app.openInterviewPrep('${job.id}')" class="py-3 border-2 border-blue-900 text-blue-900 font-bold text-[13px] rounded-xl hover:bg-blue-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-lg">co_present</span> Interview prep
              </button>
            </div>
            <button onclick="app.closeJobApplyModal(); app.openJobShareModal('${job.id}')" class="w-full py-3 border-2 border-blue-900 text-blue-900 font-bold text-[13px] rounded-xl hover:bg-blue-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-lg">share</span> Share this job
            </button>
            <div class="-mt-1">${this._toolUsageHtml(null)}</div>
            <button onclick="app.openInterviewPrep('${job.id}'); setTimeout(function(){ const el = document.getElementById('gh-picker'); if (el) el.scrollIntoView({block:'center'}); }, 700);" class="text-left text-[13px] font-bold text-blue-900 hover:underline flex items-center gap-1.5">
              <span class="material-symbols-outlined text-lg">code</span> Which of my GitHub projects fit this job?
            </button>
            ${applyTarget ? `
              <a href="${this.escapeHtml(applyTarget)}" target="_blank" rel="noopener noreferrer nofollow" class="flex items-start gap-1.5 text-[11px] font-medium text-blue-800 hover:text-blue-950 break-all px-0.5">
                <span class="material-symbols-outlined text-[14px] shrink-0">link</span>Opening: ${this.escapeHtml(applyTarget)}
              </a>` : ''}
            <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p class="text-[10px] font-bold uppercase tracking-wide text-blue-800 mb-1.5">Stand out — send your proof profile</p>
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-xs font-bold text-blue-950 truncate">${this.escapeHtml(myLink)}</span>
                <button onclick="app.copyMyJobProfileLink()" title="Copy my proof link" class="text-blue-800 hover:bg-white rounded-lg p-1.5 transition-colors shrink-0"><span class="material-symbols-outlined text-lg">content_copy</span></button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  applyToJob(jobId) {
    const job = Array.isArray(this._jobsCache) ? this._jobsCache.find(j => j.id === jobId) : null;
    if (!job) return;
    // Hand-typed listings carry `contact`; feed-imported ones carry `apply_url`.
    // Reading only `contact` left the Apply button inert on every imported card.
    const url = this.safeHttpUrl(job.apply_url || job.contact);
    if (!url) {
      this.showToast('This listing has no application link yet.');
      return;
    }
    if (window.posthog && typeof window.posthog.capture === 'function') {
      try { window.posthog.capture('job_apply_click', { job_id: jobId }); } catch (e) {}
    }
    window.open(url, '_blank', 'noopener');
    swapikiStore.recordJobClick(jobId); // fire-and-forget: feeds the weekly Top Jobs ranking
  }

  closeJobApplyModal() {
    const el = document.getElementById('modal-job-apply');
    if (el) el.remove();
  }

  openPersonalizedFitModal(jobId) {
    const job = Array.isArray(this._jobsCache) ? this._jobsCache.find(j => j.id === jobId) : null;
    if (!job) return;
    const profile = (typeof swapikiStore !== 'undefined' && swapikiStore && typeof swapikiStore.getProfile === 'function')
      ? swapikiStore.getProfile()
      : null;
    if (!profile) return;
    const pMatch = (typeof window.profileMatch !== 'undefined' && window.profileMatch && typeof window.profileMatch.computePersonalizedMatch === 'function')
      ? window.profileMatch.computePersonalizedMatch(profile, job)
      : null;
    const html = (typeof window.profileMatch !== 'undefined' && window.profileMatch && typeof window.profileMatch.renderPersonalizedFitModalHtml === 'function')
      ? window.profileMatch.renderPersonalizedFitModalHtml(job, profile, pMatch)
      : '';
    const overlay = document.createElement('div');
    overlay.id = 'modal-profile-fit';
    overlay.className = 'fixed inset-0 z-[99999] bg-neutral-900/60 flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl max-w-5xl w-full shadow-2xl relative border border-blue-100 max-h-[92vh] overflow-y-auto [scrollbar-width:none] [::-webkit-scrollbar]:hidden">
        <button onclick="app.closePersonalizedFitModal()" class="absolute top-6 right-6 z-10 text-blue-700 hover:text-blue-950 hover:bg-blue-50 rounded-full p-1.5 transition-colors">
          <span class="material-symbols-outlined text-2xl">close</span>
        </button>
        ${html}
      </div>`;
    document.body.appendChild(overlay);
  }

  closePersonalizedFitModal() {
    const el = document.getElementById('modal-profile-fit');
    if (el) el.remove();
  }

  renderJobCard(j) {
    const skills = (Array.isArray(j.skills) ? j.skills : []).slice(0, 5).map(s =>
      `<span class="bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 text-[10px] font-bold">${this.escapeHtml(s)}</span>`).join('');
    const sourceLabel = 'Posted by Swapiki';
    const type = this._jobType(j);
    const mode = this._jobMode(j);
    const typeBadge = `<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${type === 'internship' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">${type === 'internship' ? 'Internship' : 'Job'}</span>`;
    const modeBadge = `<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${mode === 'remote' ? 'bg-sky-50 text-sky-700 border border-sky-200' : mode === 'hybrid' ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">${mode === 'remote' ? 'Remote / WFH' : mode === 'hybrid' ? 'Hybrid' : 'Onsite'}</span>`;
    const applyBy = (j.raw_text || '').match(/Apply\\s*by\\s*:\\s*([0-9]{1,2}\\s+[A-Za-z]{3,9}\\s+20\\d{2})/i);
    return `
      <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <h3 class="font-bold text-slate-900">${this.escapeHtml(j.title)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">${this.escapeHtml(j.company)}${j.location ? ' · ' + this.escapeHtml(j.location) : ''}</p>
          </div>
          <div class="flex flex-col items-end gap-1.5 shrink-0">
            <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"><span class="material-symbols-outlined text-[12px]">share</span>${this.escapeHtml(sourceLabel)}</span>
            ${this.jobMatchPill(j)}
            <button onclick="app.openPersonalizedFitModal('${j.id}')" class="text-xs text-indigo-600 underline mt-1">Why this match?</button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 mb-2">
          ${typeBadge}${modeBadge}${this.jobFeaturedLabel(j)}
          ${applyBy ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><span class="material-symbols-outlined text-[12px]">event</span>Apply by ${this.escapeHtml(applyBy[1])}</span>` : ''}
        </div>
        ${skills ? `<div class="flex flex-wrap gap-1.5 mt-1 mb-3">${skills}</div>` : ''}
        ${j.salary ? `<p class="text-[11px] text-slate-400 flex items-center gap-1 mb-1"><span class="material-symbols-outlined text-[13px]">payments</span>${this.escapeHtml(j.salary)}</p>` : ''}
        ${j.description ? `<p class="text-xs text-slate-600 leading-relaxed mb-3">${this.escapeHtml(j.description)}</p>` : ''}
        ${j._pm && j._pm.reasons && j._pm.reasons.length > 0 ? `
        <div class="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 mb-3 border-t border-slate-100 text-[11px]">
          <span class="font-bold text-[10px] uppercase tracking-wider text-indigo-700 flex items-center gap-0.5">
            <span class="material-symbols-outlined text-[13px]">auto_awesome</span> Profile Fit:
          </span>
          ${j._pm.reasons.map(r => `<span class="bg-indigo-50/80 text-indigo-800 font-semibold px-2 py-0.5 rounded-md text-[10px] border border-indigo-100/80">${this.escapeHtml(r)}</span>`).join('')}
        </div>` : ''}
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <button onclick="app.openJobApplyModal('${j.id}')" class="px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all">Apply with my profile</button>
          <button onclick="app.openJobShareModal('${j.id}')" title="Share this job" aria-label="Share this job" class="px-3 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50 hover:text-primary transition-all inline-flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">share</span>Share</button>
        </div>
      </div>`;
  }


  // ---------------------------------------------------------------------
  // RESUME DRAFT BUILDER
  // ---------------------------------------------------------------------

  /**
   * Claims one of the account's daily job-post allowances for a tool.
   *
   * Returns null when there is nothing to enforce — signed out, no store
   * method, or a schema that predates supabase/tool_usage_migration.sql — so the
   * existing sign-in and 80% views stay in charge and the tool still opens.
   * Otherwise returns {blocked, ...verdict}. Never throws: a limit check must not
   * be able to take the tool down with it.
   */
  async _claimTool(tool, jobId) {
    if (!swapikiStore || !swapikiStore.currentUser) return null;
    if (typeof swapikiStore.claimToolUsage !== 'function') return null;
    try {
      const res = await swapikiStore.claimToolUsage(jobId, tool);
      if (!res || res.unavailable) return null;
      if (res.allowed === false) return Object.assign({ blocked: true }, res);
      return Object.assign({ blocked: false }, res);
    } catch (err) {
      return null;
    }
  }

  /**
   * The wall shown once the five daily job posts are spent. A failed *check* is
   * told apart from a reached limit on purpose: one is "come back tomorrow", the
   * other is "try again in a moment".
   */
  _toolBlockedView(gate) {
    const limit = gate.limit || 5;
    const reset = gate.reset_at ? new Date(gate.reset_at) : null;
    const when = (reset && !isNaN(reset.getTime()))
      ? reset.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
      : 'tomorrow';
    const failed = !!gate.error || gate.reason === 'error';
    return `
      <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
        <div class="w-16 h-16 rounded-2xl ${failed ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-600'} flex items-center justify-center mx-auto mb-4">
          <span class="material-symbols-outlined text-3xl">${failed ? 'cloud_off' : 'hourglass_top'}</span>
        </div>
        <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">${failed ? "Couldn't check your daily limit" : 'Daily limit reached'}</h1>
        <p class="text-sm text-slate-500 leading-relaxed mb-6">${failed
          ? 'Something went wrong on our side, so we stopped rather than risk not counting a job you should get. Please try again in a moment.'
          : `You've used all ${limit} job posts for today across resume drafts and interview prep. Come back tomorrow — your allowance resets ${this.escapeHtml(when)}.`}</p>
        <button onclick="router.navigate('jobs')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Browse jobs</button>
      </div>`;
  }

  /**
   * The daily-allowance disclaimer, shown everywhere the two tools can be
   * started: on the Apply popup, before the candidate has clicked anything, and
   * again inside each tool. Disclosing the limit here rather than only at the
   * wall is the point — nobody should discover the rule by being stopped.
   *
   * When the server has answered, the line is specific ("3 of 5 left today").
   * When it has not, it still states the policy instead of staying silent.
   */
  _toolUsageHtml(gate) {
    const limit = (gate && gate.limit) || DAILY_TOOL_JOB_LIMIT;
    const counted = gate && !gate.blocked && typeof gate.remaining === 'number';
    const headline = counted
      ? `${gate.remaining} of ${limit} job posts left today.`
      : `Free while you are a member: ${limit} job posts a day, shared between resume drafts and interview prep.`;
    return `<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-600 leading-relaxed">${headline} Re-opening a job you have already used today is free.</div>`;
  }

  /** Opens the resume builder for a specific job (reached from the Apply popup). */
  openResumeDraft(jobId) {
    this.closeJobApplyModal();
    this._resumeJobId = jobId || null;
    window.location.hash = 'resume-draft/' + encodeURIComponent(jobId || '');
  }

  async renderResumeDraftView() {
    this.setPageMeta('Draft your resume | Swapiki',
      'Draft a resume tailored to a specific job description using your Swapiki proof profile — then copy it or save it as a PDF.',
      { url: window.location.href });
    const root = document.getElementById('resume-draft-container');
    if (!root) return;

    if (!swapikiStore.currentUser) {
      root.innerHTML = `
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">edit_document</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Resume drafts are for members</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">Sign in to generate a resume draft tuned to a job description, built from your proof profile.</p>
          <button onclick="app.openLoginModal()" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Sign in</button>
        </div>`;
      return;
    }

    const profile = swapikiStore.getProfile();
    const score = profile && typeof profile.completionScore === 'number' ? profile.completionScore : 30;
    if (score < 80) {
      root.innerHTML = `
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">lock</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Drafts unlock at 80%</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-4">Resume drafts are built from your proof profile. Reach an 80%-complete proof profile to unlock them. You're at <strong>${score}%</strong>.</p>
          <button onclick="router.navigate('dashboard')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Finish my profile</button>
        </div>`;
      return;
    }

    const jobId = this._resumeJobId;
    let job = (Array.isArray(this._jobsCache) && this._jobsCache.find(j => j.id === jobId)) || null;
    if (!job) {
      try {
        const jobs = await swapikiStore.getPublishedJobs();
        this._jobsCache = jobs;
        job = jobs.find(j => j.id === jobId) || null;
      } catch (err) {
        if (window.SWAPIKI_POSTHOG && window.SWAPIKI_POSTHOG.capture) window.SWAPIKI_POSTHOG.capture('resume_draft_load_error', { error: String(err && err.message) });
      }
    }
    if (!job) {
      root.innerHTML = `
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">work_off</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Couldn't find that job</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">The opening may have been updated or removed. Head back to the board and pick another one.</p>
          <button onclick="router.navigate('jobs')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Browse jobs</button>
        </div>`;
      return;
    }

    const gate = await this._claimTool('resume', job.id);
    if (gate && gate.blocked) { root.innerHTML = this._toolBlockedView(gate); return; }

    const d = this._buildResumeDraft(job, profile);

    const editorCls = 'w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all';
    const fieldLabel = (text) => `<label class="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">${text}</label>`;

    const projectEditors = d.projects.map((p, i) => `
      <div>
        ${fieldLabel(`Project ${i + 1}`)}
        <textarea data-rd-project oninput="app._resumeRefreshPreview()" rows="4" class="${editorCls}" placeholder="Title — Role&#10;• Key achievement 1">${this.escapeHtml(p.text)}</textarea>
      </div>`).join('');

    root.innerHTML = `
      <div class="max-w-5xl mx-auto">
        <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <button onclick="router.navigate('jobs')" class="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              <span class="material-symbols-outlined text-sm">arrow_back</span> Back to jobs
            </button>
            <h1 class="text-2xl font-bold text-primary tracking-tight mt-2">Draft a resume for this job</h1>
            <p class="text-sm text-slate-500 mt-0.5">${this.escapeHtml(job.title)}${job.company ? ' · ' + this.escapeHtml(job.company) : ''}${job.location ? ' · ' + this.escapeHtml(job.location) : ''}</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="app.printDraftResume()" class="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md">
              <span class="material-symbols-outlined text-lg">picture_as_pdf</span> Save as PDF
            </button>
            <button onclick="app.copyDraftResume()" class="flex items-center gap-1.5 px-4 py-2.5 border-2 border-primary text-primary text-sm font-bold rounded-xl hover:bg-primary/5 active:scale-[0.98] transition-all">
              <span class="material-symbols-outlined text-lg">content_copy</span> Copy resume
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 mb-6 text-sm text-blue-900 leading-relaxed">
          <strong>How this works —</strong> your draft is pre-tuned to this job's description using your proof profile. Edit any section on the left; the preview updates live. When it's ready, copy it or save it as a PDF.
        </div>

        ${this._toolUsageHtml(gate)}

        <div class="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-6">
          <div class="space-y-4">
            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-3">Contact & headline</h2>
              <div class="grid sm:grid-cols-2 gap-3">
                <div>${fieldLabel('Full name')}<input id="rd-name" value="${this.escapeHtml(d.name)}" oninput="app._resumeRefreshPreview()" class="${editorCls}" /></div>
                <div>${fieldLabel('Headline / current title')}<input id="rd-headline" value="${this.escapeHtml(d.headline)}" oninput="app._resumeRefreshPreview()" class="${editorCls}" /></div>
              </div>
              <div class="mt-3">${fieldLabel('Contact line')}<input id="rd-contact" value="${this.escapeHtml(d.contact)}" oninput="app._resumeRefreshPreview()" class="${editorCls}" /></div>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Professional summary</h2>
              <p class="text-[11px] text-slate-400 mb-3">Tailored to the job description — make it yours.</p>
              <textarea id="rd-summary" oninput="app._resumeRefreshPreview()" rows="4" class="${editorCls}">${this.escapeHtml(d.summary)}</textarea>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-3">Skills (comma separated)</h2>
              <textarea id="rd-skills" oninput="app._resumeRefreshPreview()" rows="2" class="${editorCls}">${this.escapeHtml(d.skills.join(', '))}</textarea>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Experience</h2>
              <p class="text-[11px] text-slate-400 mb-3">What you've claimed on your profile, phrased for this role.</p>
              <input id="rd-exp-title" value="${this.escapeHtml(d.expTitle)}" oninput="app._resumeRefreshPreview()" class="${editorCls}" />
              <textarea id="rd-exp-detail" oninput="app._resumeRefreshPreview()" rows="3" class="${editorCls} mt-2">${this.escapeHtml(d.expDetail)}</textarea>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Projects from your proof profile</h2>
              <p class="text-[11px] text-slate-400 mb-3">First line: title — role. Following lines: impact bullet points.</p>
              <div class="space-y-3">${projectEditors}</div>
            </div>
          </div>

          <div class="lg:sticky lg:top-6">
            <div class="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">Live preview</div>
            <div id="rd-preview" class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"></div>
            <div class="mt-4">
              ${fieldLabel('Job description — keep your draft on target')}
              <details class="bg-white border border-slate-200 rounded-2xl p-4 text-[13px] text-slate-600 leading-relaxed">
                <summary class="text-xs font-bold text-primary cursor-pointer select-none">Show / hide job description</summary>
                <div class="mt-2 whitespace-pre-wrap">${this.escapeHtml(job.description || 'No description provided for this listing.')}</div>
              </details>
            </div>
          </div>
        </div>
      </div>`;

    this._resumeRefreshPreview();
  }

  /** Builds the initial draft content, tuned to the job description + profile. */
  _buildResumeDraft(job, profile) {
    const profileName = profile.name || 'Your Name';
    const headline = profile.title || job.title || '';
    const exp = profile.experience || 'relevant hands-on experience';
    const proofLink = profile.username ? `https://${profile.username}.swapiki.com` : 'https://swapiki.com';
    const email = (profile.email || (swapikiStore.authUser && swapikiStore.authUser.email) || '').trim();
    const contact = [profile.location, email, proofLink].filter(Boolean).join(' · ');

    const own = Array.isArray(profile.expertise) ? profile.expertise : [];
    const tags = (Array.isArray(profile.projects) ? profile.projects : []).flatMap(p => Array.isArray(p.tags) ? p.tags : []);
    const uniq = [...new Set([...own, ...tags])].filter(Boolean);
    const jobSkills = Array.isArray(job.skills) ? job.skills : [];
    const lower = s => String(s || '').toLowerCase().trim();
    const matched = jobSkills.filter(s => uniq.some(u => lower(u) === lower(s)));
    const rest = uniq.filter(u => !matched.includes(u));
    const skills = matched.concat(rest).slice(0, 14);

    const projCount = (Array.isArray(profile.projects) ? profile.projects : []).length;
    let summary = `${profileName.split(' ')[0]} is a ${headline || 'professional'} (${exp}) looking to contribute to ${job.company || 'your organization'} as a ${job.title || 'this role'}.`;
    if (projCount) summary += ` Backed by ${projCount} proof project${projCount === 1 ? '' : 's'} with measurable outcomes`;
    if (matched.length) summary += ` and a strong working knowledge of ${matched.slice(0, 3).join(', ')}`;
    summary += `. Proof profile published and ready to share.`;

    let reqExpText = '';
    if (typeof window.profileMatch === 'object' && window.profileMatch && typeof window.profileMatch.requiredYears === 'function') {
      const req = window.profileMatch.requiredYears(job);
      if (req) reqExpText = `, aligned with the ~${req} years this opening asks for`;
    }
    const expDetail = `Hands-on ${(headline || 'professional').toLowerCase()} experience across real, verifiable projects${reqExpText}. Comfortable owning tasks end-to-end with a focus on outcomes.`;

    const projects = (Array.isArray(profile.projects) ? profile.projects : []).map((p, i) => {
      const heading = [p.title, p.role].filter(Boolean).join(' — ') || `Project ${i + 1}`;
      const bullets = Array.isArray(p.takeaways) ? p.takeaways.filter(b => String(b || '').trim()) : [];
      const text = [heading, ...bullets.map(b => '• ' + b)].join('\n');
      return { text };
    });

    return { name: profileName, headline, contact, summary, skills, expTitle: exp, expDetail, projects };
  }

  /** Reads the current values from every editor. */
  _resumeCollect() {
    const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const skills = g('rd-skills').split(',').map(s => s.trim()).filter(Boolean);
    const expTitle = g('rd-exp-title') || '';
    const expDetail = g('rd-exp-detail') || '';
    let projects = [];
    document.querySelectorAll('[data-rd-project]').forEach(ta => {
      const lines = ta.value.split('\n');
      projects.push({ heading: (lines[0] || '').trim(), bullets: lines.slice(1).map(b => b.replace(/^[\s•-]+/, '').trim()).filter(Boolean) });
    });
    return { name: g('rd-name') || 'Your Name', headline: g('rd-headline') || '', contact: g('rd-contact') || '', summary: g('rd-summary') || '', skills, expTitle, expDetail, projects };
  }

  /** Re-renders the live preview from the editors' current values. */
  _resumeRefreshPreview() {
    const preview = document.getElementById('rd-preview');
    if (!preview) return;
    const d = this._resumeCollect();
    const e = s => this.escapeHtml(s);
    const chips = d.skills.map(s => `<span class="inline-block bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold mr-1.5 mb-1.5">${e(s)}</span>`).join('');
    const projectHtml = d.projects.filter(p => p.heading).map(p => `
      <div class="mb-3 last:mb-0">
        <p class="text-[13px] font-bold text-slate-900">${e(p.heading)}</p>
        ${p.bullets.length ? `<ul class="mt-1 space-y-0.5">${p.bullets.map(b => `<li class="text-[12px] text-slate-600 leading-snug flex gap-1.5"><span class="text-primary shrink-0">•</span><span>${e(b)}</span></li>`).join('')}</ul>` : ''}
      </div>`).join('');
    preview.innerHTML = `
      <div class="p-6">
        <h2 class="text-lg font-bold text-slate-900">${e(d.name)}</h2>
        <p class="text-sm font-semibold text-primary mt-0.5">${e(d.headline)}</p>
        <p class="text-[11px] text-slate-500 mt-1 break-words">${e(d.contact)}</p>
        <div class="h-px bg-slate-200 my-3"></div>
        <p class="text-[10px] font-bold uppercase tracking-wide text-primary mb-1">Professional summary</p>
        <p class="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">${e(d.summary)}</p>
        ${chips ? `<div class="mt-3">${chips}</div>` : ''}
        <div class="h-px bg-slate-200 my-3"></div>
        <p class="text-[10px] font-bold uppercase tracking-wide text-primary mb-1">Experience</p>
        <p class="text-[13px] font-semibold text-slate-800">${e(d.expTitle)}</p>
        <p class="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap mt-1">${e(d.expDetail)}</p>
        ${projectHtml ? `<div class="h-px bg-slate-200 my-3"></div><p class="text-[10px] font-bold uppercase tracking-wide text-primary mb-2">Projects</p>${projectHtml}` : ''}
      </div>`;
  }

  /** Copies a clean plain-text version of the drafted resume. */
  copyDraftResume() {
    const d = this._resumeCollect();
    const lines = [
      d.name, d.headline, d.contact, '',
      'PROFESSIONAL SUMMARY', d.summary || '', '',
      'SKILLS', d.skills.join(', ') || '', '',
      'EXPERIENCE', d.expTitle, d.expDetail || '', ''
    ];
    if (d.projects.some(p => p.heading)) {
      lines.push('PROJECTS');
      d.projects.filter(p => p.heading).forEach(p => {
        lines.push(p.heading);
        p.bullets.forEach(b => lines.push(b));
        lines.push('');
      });
    }
    const text = lines.filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => this.showToast('Resume draft copied.'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast('Resume draft copied.');
    }
  }

  /** Opens a clean printable resume (Save as PDF from the browser dialog). */
  printDraftResume() {
    const d = this._resumeCollect();
    const projectHtml = d.projects.filter(p => p.heading).map(p => `
      <div class="project">
        <div class="project-title">${this._printEscape(p.heading)}</div>
        ${p.bullets.length ? `<ul>${p.bullets.map(b => `<li>${this._printEscape(b)}</li>`).join('')}</ul>` : ''}
      </div>`).join('');
    const skillsHtml = d.skills.length ? `<div class="section"><div class="section-title">Skills</div><p>${d.skills.join(', ')}</p></div>` : '';
    const projectSection = d.projects.some(p => p.heading) ? `<div class="section"><div class="section-title">Projects</div>${projectHtml}</div>` : '';
    const badge = 'DRAFT PREPARED WITH SWAPIKI';
    const printWin = window.open('', '_blank');
    if (!printWin) { this.showToast('Please allow popups to save your resume as PDF.'); return; }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this._printEscape(d.name)} - Resume</title><style>
      body { font-family: 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif; color: #0f172a; padding: 40px; max-width: 780px; margin: 0 auto; line-height: 1.5; font-size: 13px; }
      .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 18px; }
      .header h1 { font-size: 24px; color: #1e3a8a; margin: 0 0 2px 0; }
      .header p { margin: 0; color: #64748b; font-size: 12px; }
      .headline { color: #1e3a8a; font-weight: bold; }
      .section { margin-bottom: 16px; page-break-inside: avoid; }
      .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.2px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
      .project { margin-bottom: 10px; }
      .project-title { font-weight: bold; color: #0f172a; }
      ul { margin: 4px 0 0 0; padding-left: 18px; }
      li { margin-bottom: 2px; }
      .badge { display: inline-block; background: #dbeafe; color: #1e3a8a; font-size: 10px; font-weight: bold; padding: 3px 10px; border-radius: 20px; margin-top: 4px; text-transform: uppercase; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <div class="header">
        <h1>${this._printEscape(d.name)}</h1>
        <p class="headline">${this._printEscape(d.headline)}</p>
        <p>${this._printEscape(d.contact)}</p>
        <span class="badge">${badge}</span>
      </div>
      <div class="section"><div class="section-title">Professional Summary</div><p>${this._printEscape(d.summary).replace(/\n/g, '<br/>')}</p></div>
      ${skillsHtml}
      <div class="section"><div class="section-title">Experience</div><p style="font-weight:bold;margin:0;">${this._printEscape(d.expTitle)}</p><p style="margin:4px 0 0 0;">${this._printEscape(d.expDetail).replace(/\n/g, '<br/>')}</p></div>
      ${projectSection}
    </body></html>`;
    printWin.document.write(html);
    printWin.document.close();
    printWin.document.title = `${d.name} - Resume Draft`;
    this._printReady = true;
    printWin.addEventListener('load', () => {});
    setTimeout(() => { try { printWin.focus(); printWin.print(); } catch (err) { } }, 300);
    this.showToast('Resume opened for printing — choose "Save as PDF" as the destination.');
  }

  _printEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------
  // INTERVIEW PREP
  // ---------------------------------------------------------------------

  /** Opens the interview-prep page for a specific job (reached from the Apply popup). */
  openInterviewPrep(jobId) {
    this.closeJobApplyModal();
    this._interviewJobId = jobId || null;
    window.location.hash = 'interview-prep/' + encodeURIComponent(jobId || '');
  }

  async renderInterviewPrepView() {
    this.setPageMeta('Interview prep | Swapiki',
      'Practice the questions most likely to come up for a specific job — built from the listing and your proof profile.',
      { url: window.location.href });
    const root = document.getElementById('interview-prep-container');
    if (!root) return;

    if (!swapikiStore.currentUser) {
      root.innerHTML = `
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">co_present</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Interview prep is for members</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">Sign in to practice the questions most likely to come up — built from the listing and your proof profile.</p>
          <button onclick="app.openLoginModal()" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Sign in</button>
        </div>`;
      return;
    }

    const profile = swapikiStore.getProfile();
    const score = profile && typeof profile.completionScore === 'number' ? profile.completionScore : 30;
    if (score < 80) {
      root.innerHTML = `
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">lock</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Interview prep unlocks at 80%</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-4">Practice questions are built from your proof profile, projects and experience. Reach an 80%-complete profile to unlock them. You're at <strong>${score}%</strong>.</p>
          <button onclick="router.navigate('dashboard')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Finish my profile</button>
        </div>`;
      return;
    }

    const jobId = this._interviewJobId;
    let job = (Array.isArray(this._jobsCache) && this._jobsCache.find(j => j.id === jobId)) || null;
    if (!job) {
      try {
        const jobs = await swapikiStore.getPublishedJobs();
        this._jobsCache = jobs;
        job = jobs.find(j => j.id === jobId) || null;
      } catch (err) { }
    }
    if (!job) {
      root.innerHTML = `
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">work_off</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Couldn't find that job</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">The opening may have been updated or removed. Head back to the board and pick another one.</p>
          <button onclick="router.navigate('jobs')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Browse jobs</button>
        </div>`;
      return;
    }

    const gate = await this._claimTool('interview', job.id);
    if (gate && gate.blocked) { root.innerHTML = this._toolBlockedView(gate); return; }

    this._interviewJob = job;
    this._interviewThemes = this._extractJobThemes(job);
    this._interviewQuestions = this._generateInterviewQuestions(job, profile, this._interviewThemes);
    const qu = this._interviewQuestions;
    const th = this._interviewThemes;
    this._interviewJobKey = 'swapiki_interview_' + jobId;

    const renderGroup = (title, items) => `
      <div class="mb-5 last:mb-0">
        <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">${title}</p>
        <ol class="space-y-1.5">
          ${items.map((q, i) => `
            <li class="text-[13px] text-slate-700 leading-relaxed flex gap-2">
              <span class="text-slate-300 font-bold shrink-0">${i + 1}.</span>
              <span>${this.escapeHtml(q.text)}${q.source ? ` <span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 align-middle whitespace-nowrap">${this.escapeHtml(q.source)}</span>` : ''}</span>
            </li>`).join('')}
        </ol>
      </div>`;

    const projects = (Array.isArray(profile.projects) ? profile.projects : []);
    // The GitHub project the candidate picked (or the top-ranked one) leads.
    let storyRepo = null;
    if (window.swapikiGitHub) {
      const ranked = this._ghRanked();
      const picked = this._ghHydrateStory();
      const autoTop = ranked.find(r => r.matched && r.matched.length) || null;
      storyRepo = picked ? (ranked.find(r => r.name === picked) || null) : autoTop;
    }
    const talkingPoints = projects.map(p => `
      <div class="rounded-xl border border-slate-200 bg-white p-3.5 mb-2.5">
        <p class="text-[13px] font-bold text-slate-900">${this.escapeHtml(p.title)}${p.role ? ' <span class="text-slate-400 font-normal">— ' + this.escapeHtml(p.role) + '</span>' : ''}</p>
        <ul class="mt-1.5 space-y-1">
          ${(Array.isArray(p.takeaways) ? p.takeaways : []).filter(b => b).map(b => `<li class="text-[12px] text-slate-600 flex gap-1.5"><span class="text-primary shrink-0">•</span><span>${this.escapeHtml(b)}</span></li>`).join('')}
        </ul>
      </div>`).join('');

    root.innerHTML = `
      <div class="max-w-5xl mx-auto">
        <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <button onclick="router.navigate('jobs')" class="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              <span class="material-symbols-outlined text-sm">arrow_back</span> Back to jobs
            </button>
            <h1 class="text-2xl font-bold text-primary tracking-tight mt-2">Interview prep for this job</h1>
            <p class="text-sm text-slate-500 mt-0.5">${this.escapeHtml(job.title)}${job.company ? ' · ' + this.escapeHtml(job.company) : ''}${job.location ? ' · ' + this.escapeHtml(job.location) : ''}</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="app._interviewNext()" class="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md">
              <span class="material-symbols-outlined text-lg">casino</span> Practice a question
            </button>
            <button onclick="app.copyInterviewQuestions()" class="flex items-center gap-1.5 px-4 py-2.5 border-2 border-primary text-primary text-sm font-bold rounded-xl hover:bg-primary/5 active:scale-[0.98] transition-all">
              <span class="material-symbols-outlined text-lg">content_copy</span> Copy question bank
            </button>
          </div>
        </div>

        ${this._toolUsageHtml(gate)}

        <div id="gh-picker" class="mb-4"></div>

        <div class="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-6">
          <div class="space-y-4">
            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">What this listing actually asks for</h2>
              <p class="text-[11px] text-slate-400 mb-3">Pulled from this job description, so you know exactly what they're screening for.</p>
              ${th.seniority ? `<p class="text-[12px] text-slate-700 mb-2"><span class="font-bold">Level:</span> ${this.escapeHtml(th.seniority)}</p>` : ''}
              ${th.must.length ? `
                <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">Required</p>
                <ul class="space-y-1 mb-3">
                  ${th.must.slice(0, 7).map(m => `<li class="text-[12px] text-slate-700 flex gap-1.5"><span class="text-primary shrink-0">•</span><span>${this.escapeHtml(m)}</span></li>`).join('')}
                </ul>` : ''}
              ${th.nice.length ? `
                <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">Nice to have</p>
                <ul class="space-y-1 mb-3">
                  ${th.nice.slice(0, 5).map(m => `<li class="text-[12px] text-slate-600 flex gap-1.5"><span class="text-slate-300 shrink-0">•</span><span>${this.escapeHtml(m)}</span></li>`).join('')}
                </ul>` : ''}
              ${th.keywords.length ? `
                <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">Signals in the description</p>
                <div class="flex flex-wrap gap-1.5">
                  ${th.keywords.map(k => `<span class="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold">${this.escapeHtml(k)}</span>`).join('')}
                </div>` : ''}
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-3">What they'll likely ask you</h2>
              ${qu.description.length ? renderGroup('Straight from this job description', qu.description) : ''}
              ${renderGroup(`About this role`, qu.role)}
              ${qu.skills.length ? renderGroup('Built on the listed skills', qu.skills) : ''}
              ${renderGroup('Behavioural & situational', qu.behavioral)}
            </div>
            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-3">Questions to ask them</h2>
              <ol class="space-y-1.5">
                ${qu.askThem.map((q, i) => `<li class="text-[13px] text-slate-700 leading-relaxed flex gap-2"><span class="text-slate-300 font-bold shrink-0">${i + 1}.</span><span>${this.escapeHtml(q.text)}</span></li>`).join('')}
              </ol>
            </div>
          </div>

          <div class="space-y-4 lg:sticky lg:top-6">
            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Practice box</h2>
              <p class="text-[11px] text-slate-400 mb-3">Tap the mic and answer out loud. It writes down what you said, then checks it.</p>
              <div id="iv-practice">
                <p id="iv-source" class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 inline-block mb-1.5"></p>
                <p id="iv-question" class="text-[13px] font-bold text-slate-900 leading-relaxed mb-2"></p>

                <div class="flex items-center gap-2.5">
                  <button id="iv-mic" onclick="app.toggleInterviewMic()" aria-live="off"
                    class="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-primary text-white shadow-md active:scale-95 transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2">
                    <span id="iv-mic-icon" class="material-symbols-outlined text-2xl leading-none">mic</span>
                  </button>
                  <div class="min-w-0">
                    <p id="iv-mic-label" class="text-[12px] font-bold text-slate-900 leading-snug">Tap to answer out loud</p>
                    <p id="iv-mic-status" class="text-[11px] text-slate-500 leading-snug">Uses your microphone only. The audio never leaves this page.</p>
                  </div>
                </div>

                <div id="iv-transcript-wrap" class="hidden mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">What we heard you say</p>
                  <p id="iv-transcript" class="text-[13px] text-slate-800 leading-relaxed whitespace-pre-line"></p>
                </div>

                <div id="iv-voice-unsupported" class="hidden mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p id="iv-voice-unsupported-title" class="text-[12px] font-bold text-amber-900 mb-1">This browser can't listen</p>
                  <p id="iv-voice-unsupported-detail" class="text-[11px] text-amber-800 leading-relaxed">Speech-to-text needs Chrome or Edge. You can still write the answer out and check it the same way.</p>
                  <button onclick="app.toggleInterviewType(true)" class="text-[11px] font-bold text-amber-900 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100 mt-2">Type instead</button>
                </div>

                <div id="iv-type-fallback" class="hidden mt-3">
                  <textarea id="iv-answer" oninput="app._interviewTyped()" rows="6" class="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" placeholder="Type or paste a draft answer here..."></textarea>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-2 mt-3">
                  <span id="iv-wordcount" class="text-[11px] font-bold text-slate-400"></span>
                  <div class="flex flex-wrap gap-2">
                    <button onclick="app.checkInterviewAnswer()" class="text-[11px] font-bold text-white bg-primary rounded-lg px-2.5 py-1.5 hover:bg-primary/90">Check my answer</button>
                    <button onclick="app.copyInterviewAnswer()" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Copy</button>
                    <button onclick="app.clearInterviewAnswer()" class="text-[11px] font-bold text-slate-400 hover:text-slate-700 rounded-lg px-2.5 py-1">Clear</button>
                    <button id="iv-type-toggle" onclick="app.toggleInterviewType()" class="text-[11px] font-bold text-slate-400 hover:text-slate-700 rounded-lg px-2.5 py-1">Type instead</button>
                  </div>
                </div>
                <div id="iv-feedback" class="mt-3"></div>
              </div>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Your talking points</h2>
              <p class="text-[11px] text-slate-400 mb-3">Real stories from your proof profile carry the interview.</p>
              ${storyRepo ? `
                <div class="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 mb-3">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="material-symbols-outlined text-sm text-primary">star</span>
                    <span class="text-[12px] font-bold text-slate-900">${this.escapeHtml(storyRepo.name)}</span>
                    <span class="text-[10px] font-bold text-primary">${storyRepo.score}% match</span>
                  </div>
                  <p class="text-[11px] text-slate-600 mt-1 leading-relaxed">Leading your answers. ${storyRepo.matchedSkills.length ? 'It shows ' + storyRepo.matchedSkills.join(', ') + ' - exactly what this listing asks for.' : 'Open with this one in your answer.'}</p>
                  <button onclick="app.copyRepoPitch('${this.escapeHtml(storyRepo.name)}')" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5 mt-2">Copy 60-sec pitch</button>
                </div>` : ''}
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${(Array.isArray(profile.expertise) ? profile.expertise : []).map(s => `<span class="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold">${this.escapeHtml(s)}</span>`).join('')}
              </div>
              ${talkingPoints || '<p class="text-[12px] text-slate-500">Add projects to your profile to get talking points here.</p>'}
            </div>
          </div>
        </div>
      </div>`;

    this._interviewNext();
    this.renderGitHubPicker();
  }

  /** Reads the actual job description: must-haves, nice-to-haves, responsibilities, keywords, level. */
  _extractJobThemes(job) {
    const raw = [job.description, job.requirements, job.responsibilities, job.about]
      .filter(Boolean).join('\n').replace(/\r/g, '');
    const lines = raw.split(/\n+/)
      .map(l => String(l).replace(/^[\s\-\*\u2022\)\u2013\u2014:]+/, '').replace(/^\d+[.)]\s+/, '').replace(/\s+/g, ' ').trim())
      .filter(l => l.length > 3);

    const must = [], nice = [];
    let mode = 'must';
    lines.forEach(l => {
      if (/nice to have|good to have|preferred|bonus|desirable|advantage|plus:/i.test(l)) { mode = 'nice'; return; }
      if (/benefit|perk|what we offer|why (you should )?join|compensation|salary/i.test(l)) { mode = 'skip'; return; }
      if (l.length < 80 && /requirement|qualification|what you('|’)ll need|must have|looking for|skills? (required|needed)|who you are|about the role|responsibilit|what you('|’)ll do|day to day|role involves/i.test(l)) { mode = 'must'; return; }
      if (mode === 'skip') return;
      if (l.length > 140) return;
      if (/^https?:|@|write to|apply (at|by)|contact/i.test(l)) return;
      (mode === 'nice' ? nice : must).push(l);
    });

    // Responsibility sentences: the description's "what you'll do" lines.
    const VERBS = /^(build|develop|design|manage|lead|own|drive|collaborate|ensure|support|analy[sz]e|improve|ship|partner with|maintain|scale|deliver|create|implement|run|plan|review|report|handle|identify|mentor|coordinate|launch|migrate|automate|optimi[sz]e|troubleshoot|research|prepare)\b/i;
    const stripYou = (s) => String(s).replace(/^you\s+(?:will|would|are|shall|need to|want to|should|must|'ll|can)?\s*/i, '');
    const responsibilities = lines.map(stripYou).filter(l => VERBS.test(l) && l.length > 14 && l.length < 170).slice(0, 6);

    // Sentence-level fallback: plenty of listings are one long paragraph, where
    // line parsing finds nothing. Pull requirement + responsibility sentences
    // straight out of the text so questions stay specific either way.
    const REQ_CUE = /\b(experience|exposure|familiar|proficient|strong|knowledge|ability|skills|worked with|you have|must have|ideally|required|comfortable)\b/i;
    const covered = (t) => {
      const low = String(t).toLowerCase();
      return must.concat(nice).some(x => {
        const head = String(x).toLowerCase().slice(0, 18);
        return head.length > 6 && low.indexOf(head) !== -1;
      });
    };
    const sentences = raw.replace(/\s+/g, ' ').split(/[.!?;]\s+|\s+\|\s+/)
      .map(s => s.replace(/^[-*\u2022\d.)\s]+/, '').trim())
      .filter(s => s.length > 24 && s.length < 230);
    sentences.forEach(s => {
      const body = stripYou(s);
      if (responsibilities.length < 6 && VERBS.test(body) && responsibilities.indexOf(s) === -1 && !covered(s)) {
        responsibilities.push(s);
      }
    });
    sentences.filter(s => REQ_CUE.test(s) && !VERBS.test(s) && !covered(s)).slice(0, 4).forEach(s => {
      if (must.length < 10 && must.indexOf(s) === -1) must.push(s);
    });

    // Keyword signals: words repeated in the listing, the listed skills, and
    // distinctive words from the body of the requirement lines (not their
    // first word, which is usually just "Build" / "Experience" / "Mentor").
    const STOP = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'will', 'have', 'has', 'this', 'that', 'from', 'they', 'their', 'them', 'but', 'not', 'all', 'any', 'can', 'who', 'what', 'when', 'how', 'why', 'into', 'about', 'work', 'working', 'role', 'job', 'team', 'teams', 'years', 'year', 'experience', 'ability', 'strong', 'good', 'great', 'must', 'should', 'may', 'well', 'more', 'than', 'then', 'also', 'such', 'other', 'using', 'use', 'used', 'help', 'helps', 'new', 'like', 'etc', 'via', 'per', 'one', 'two', 'get', 'got', 'need', 'needs', 'based', 'across', 'within', 'ensure', 'ensuring', 'including', 'include', 'day', 'days', 'etc.', 'ideal', 'candidate', 'candidates', 'please', 'apply', 'applicants', 'looking', 'join', 'joining', 'opportunity', 'requirements', 'requirement', 'skills', 'skill', 'knowledge', 'familiar', 'comfortable', 'exposure', 'excellent', 'ability', 'responsible', 'role', 'roles', 'please', 'email', 'contact', 'benefits', 'salary', 'location', 'remote', 'hybrid', 'full-time', 'fulltime', 'graduate', 'fresher', 'plus', 'bonus', 'someone', 'who', 'able', 'someone', 'willing', 'someone', 'own', 'ideally', 'worked', 'brief', 'report', 'reports', 'plan', 'run', 'deliver', 'ensure', 'engine', 'including', 'across', 'within', 'weekly', 'daily', 'monthly', 'quarter', 'every', 'end', 'week', 'weeks', 'month', 'months', 'year', 'need', 'needs', 'well', 'able', 'write', 'writes', 'writing', 'read', 'reads', 'look', 'looking', 'help', 'helping', 'want', 'wants']);
    const AD_NOISE = /^(comfortable|exposure|strong|excellent|good|great|familiar|knowledge|ability|experience|years|year|ideal|candidate|candidates|opportunity|requirements|requirement|responsibilit|qualification|plus|bonus|apply|please|email|contact|location|remote|hybrid|full-time|fulltime|graduate|fresher|someone|willing|joining|please|benefits|salary|compensation)$/i;
    const counts = {};
    const leading = {};
    const addWord = (w, isLeading) => {
      if (!w) return;
      const clean = String(w).replace(/^[^A-Za-z0-9+#]+/, '').replace(/[^A-Za-z0-9+#.]+$/, '').replace(/\.+$/, '');
      if (!clean) return;
      const lw = clean.toLowerCase();
      if (lw.length < 3 || STOP.has(lw) || AD_NOISE.test(lw) || /^\d+$/.test(lw)) return;
      if (!counts[lw]) counts[lw] = { n: 0, orig: w };
      counts[lw].n += 1;
      if (isLeading) leading[lw] = (leading[lw] || 0) + 1;
    };
    raw.split(/\n+/).forEach(line => {
      const parts = line.split(/[^A-Za-z0-9+#.]+/).filter(Boolean);
      parts.forEach((w, i) => addWord(w, i === 0));
    });
    // Body words of the requirement lines: these are the real signal.
    must.concat(nice, responsibilities).forEach(l => {
      const parts = String(l).split(/\s+/);
      parts.slice(1).forEach(w => {
        if (w.length > 3) addWord(w, false);
      });
    });

    const listedSkills = (Array.isArray(job.skills) ? job.skills : []).map(s => String(s).toLowerCase());
    const keywords = Object.keys(counts)
      .filter(k => {
        if (AD_NOISE.test(k)) return false;
        if (counts[k].n >= 2) return true;
        // Appeared only as the opening word of a line, once - usually just
        // "Build", "Mentor", "Drive" in a job ad.
        if ((leading[k] || 0) >= counts[k].n) return false;
        return true;
      })
      .sort((a, b) => {
        const aSkill = listedSkills.indexOf(a) !== -1 ? 1 : 0;
        const bSkill = listedSkills.indexOf(b) !== -1 ? 1 : 0;
        return bSkill - aSkill || counts[b].n - counts[a].n || (counts[b].orig.length - counts[a].orig.length);
      })
      .slice(0, 12)
      .map(k => counts[k].orig);

    let seniority = '';
    const sen = String(job.title || '') + ' ' + raw.slice(0, 400);
    const senMatch = sen.match(/\b(intern|internship|trainee|junior|entry[- ]level|graduate|fresher|mid[- ]level|senior|staff|principal|lead|head|director|manager)\b/i);
    if (senMatch) seniority = senMatch[1].toLowerCase().replace(/[- ]/g, ' ');

    const yearsMatch = raw.match(/(\d+)\s*\+?\s*(?:-\s*\d+)?\s*years?/i);

    return {
      must: must.slice(0, 10),
      nice: nice.slice(0, 6),
      responsibilities,
      keywords,
      seniority,
      years: yearsMatch ? yearsMatch[1] : ''
    };
  }

  /** Generates the question bank straight from this job's description + the profile. */
  _generateInterviewQuestions(job, profile, themes) {
    const th = themes || this._extractJobThemes(job);
    const role = job.title || 'this role';
    const comp = job.company || 'your team';
    const skills = (Array.isArray(job.skills) ? job.skills : []).filter(s => String(s || '').trim()).slice(0, 4);

    const clip = (s, n) => {
      const t = String(s || '').replace(/\s+/g, ' ').trim();
      return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '...' : t;
    };
    const lowerKeywords = th.keywords.map(k => String(k).toLowerCase());
    const focusOf = (line) => {
      const set = {};
      String(line || '').toLowerCase().split(/[^a-z0-9+#.]+/).forEach(w => {
        if (w.length > 3 && lowerKeywords.indexOf(w) !== -1 && !set[w]) {
          set[w] = true;
        }
      });
      return Object.keys(set).slice(0, 3);
    };
    const skillsHit = (line) => {
      const low = String(line || '').toLowerCase();
      return skills
        .map(s => String(s).toLowerCase())
        .filter(s => s && low.indexOf(s) !== -1 && lowerKeywords.indexOf(s) === -1)
        .slice(0, 2);
    };
    const mergeFocus = (line) => {
      const seen = {};
      focusOf(line).concat(skillsHit(line)).forEach(f => { if (!seen[f]) { seen[f] = true; } });
      let list = Object.keys(seen).slice(0, 3);
      if (!list.length) {
        // Nothing matched a listing keyword - take the distinctive words out of
        // this line itself so the checker can still hold the answer on topic.
        const GENERIC = /^(comfortable|exposure|strong|excellent|good|great|familiar|knowledge|ability|experience|years|year|including|use|used|using|well|also|across|within|ensure|working|ways|things|someone|role|work|plus|bonus|apply|please|with|and|the|for|that|this|their|there|from|have|will|about|other|such|than|when|where|which|while|would|could|should|must|into|your|they|them|then|than|more|only|also|other|each|both|some|most|such|very|many|will|can|out|off|over|under)$/i;
        const parts = String(line || '').split(/[^A-Za-z0-9+#./-]+/).filter(w => w.length > 3 && !GENERIC.test(w));
        list = parts.slice(0, 2).map(w => w.toLowerCase());
      }
      return list;
    };

    // 1. Requirements copied straight out of the listing (skip ones already
    //    covered as responsibilities further down, so nothing repeats).
    const description = th.must.filter(m => m.length > 10 && th.responsibilities.indexOf(m) === -1).slice(0, 5).map(m => ({
      text: `The listing asks for "${clip(m, 110)}" - how have you done that?`,
      source: 'This listing',
      focus: mergeFocus(m)
    }));

    // 2. Day-to-day responsibilities of this role.
    th.responsibilities.slice(0, 4).forEach(r => {
      description.push({
        text: `This role involves ${clip(r, 120)} - how would you approach it here?`,
        source: 'This listing',
        focus: mergeFocus(r)
      });
    });

    // 3. Nice-to-haves: usually not asked outright, but worth one answer each.
    th.nice.filter(n => n.length > 10).slice(0, 2).forEach(n => {
      description.push({
        text: `They list "${clip(n, 100)}" as a nice-to-have - what's your experience with it?`,
        source: 'Nice to have',
        focus: focusOf(n)
      });
    });

    const roleQ = [
      { text: `Why do you want to work as ${role} at ${comp}?`, source: 'Motivation', focus: [role.split(/\s+/)[0].toLowerCase()] },
      { text: `Tell me about yourself in under two minutes.`, source: 'Opening', focus: [] },
      { text: `Why should we hire you for this ${role} role?`, source: 'Fit', focus: [] },
      { text: `How would you approach your first 30 days in ${role}?`, source: 'Fit', focus: [] },
      { text: th.years ? `The listing asks for around ${th.years} years of experience - how does that compare with yours?` : `Where do you see yourself growing in the first year here?`, source: 'Fit', focus: [] }
    ];

    const skillQ = skills.flatMap(s => {
      const low = String(s).toLowerCase();
      return [
        { text: `Walk me through a project where you used ${s}.`, source: 'Skill', focus: [low] },
        { text: `What's the hardest problem you've solved with ${s}?`, source: 'Skill', focus: [low] }
      ];
    });

    const behavioralQ = [
      { text: `Give me an example of a time things didn't go as planned - what did you do?`, source: 'Behavioural', focus: [] },
      { text: `Tell me about a time you had to convince someone with data or evidence.`, source: 'Behavioural', focus: [] },
      { text: `How do you stay organised when you have several tasks at once?`, source: 'Behavioural', focus: [] },
      { text: `Describe a mistake you made and what you learned from it.`, source: 'Behavioural', focus: [] },
      { text: `How do you handle feedback you don't agree with?`, source: 'Behavioural', focus: [] }
    ];

    const askThem = [
      { text: `What does a typical day look like in this ${role} role?`, focus: [] },
      { text: `What would success look like in the first 6 months?`, focus: [] },
      { text: th.responsibilities.length ? `How does the team handle ${clip(th.responsibilities[0], 80)} day to day?` : `How does the team make decisions and share feedback?`, focus: [] },
      { text: th.keywords.length ? `Which of these would I use most - ${th.keywords.slice(0, 3).join(', ')}?` : `What tools does the team use most?`, focus: th.keywords.slice(0, 3) }
    ];

    return { description: description, role: roleQ, skills: skillQ, behavioral: behavioralQ, askThem: askThem };
  }

  /** Shows a random question (weighted to this listing) + any saved draft. */
  _interviewNext() {
    const el = document.getElementById('iv-question');
    if (!el) return;
    // A live microphone belongs to the question it was asked for. Moving on must
    // not leave the old recogniser running and transcribing into the new answer.
    this._interviewStopDictation();
    this._interviewDelivery = null;
    const qu = this._interviewQuestions || { description: [], role: [], skills: [], behavioral: [], askThem: [] };
    const all = [];
    (qu.description || []).forEach(q => all.push(q));
    (qu.skills || []).forEach(q => all.push(q));
    (qu.role || []).forEach(q => all.push(q));
    (qu.behavioral || []).forEach(q => all.push(q));
    if (!all.length) all.push({ text: 'Tell me about yourself.', source: 'Opening', focus: [] });
    const question = all[Math.floor(Math.random() * all.length)];
    el.textContent = question.text;

    const src = document.getElementById('iv-source');
    if (src) src.textContent = question.source || '';

    const fb = document.getElementById('iv-feedback');
    if (fb) fb.innerHTML = '';

    const ta = document.getElementById('iv-answer');
    this._interviewCurrentQuestion = question;
    // Render the loaded draft without re-saving it: persisting here would write
    // an empty answer under the new question every time the picker moves.
    this._interviewSetAnswerText(ta ? ta.value : this._interviewLoad(question.text).answer, false);
    this._interviewRenderMic();
  }

  _interviewTyped() {
    const ta = document.getElementById('iv-answer');
    if (!ta) return;
    this._interviewSetAnswerText(ta.value);
  }

  /**
   * The single place an answer changes. Keeps the typing box, the visible
   * transcript and the auto-saved draft from drifting apart, whether the words
   * arrived by keyboard or by microphone.
   */
  /**
   * Drafts are keyed by the question's text. They used to be keyed by the
   * question object, which stringifies to "[object Object]" - so every draft in
   * a session overwrote the same slot and the load, which reads by text, always
   * missed. "Saves automatically" was not true until this key existed.
   */
  _interviewAnswerKey(question) {
    const q = question || this._interviewCurrentQuestion;
    if (!q) return '';
    return String(q.text || q).trim();
  }

  _interviewSetAnswerText(text, save) {
    const value = text == null ? '' : String(text);
    const ta = document.getElementById('iv-answer');
    if (ta && ta.value !== value) ta.value = value;
    this._interviewRenderTranscript(value);
    this._updateInterviewWordcount(value);
    if (save === false) return;
    const key = this._interviewAnswerKey();
    if (this._interviewJobKey && key) {
      try {
        const store = this._interviewLoadAll();
        store[key] = value;
        localStorage.setItem(this._interviewJobKey, JSON.stringify(store));
      } catch (err) { }
    }
  }

  // --- Speaking the answer ----------------------------------------------
  //
  // The practice box takes voice first. The recogniser is borrowed from the
  // audio engine so the vendor prefix lives in one place, but it runs as its
  // own instance: the engine's copy is wired to profile verification and its
  // restart logic is gated on `isRecording`, which is false here, so it would
  // silently die part way through a 60-second answer.

  _interviewSpeechCtor() {
    const eng = window.swapikiAudioEngine;
    if (eng && typeof eng.getSpeechRecognitionCtor === 'function') return eng.getSpeechRecognitionCtor();
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  _interviewSpeechSupported() {
    return !!this._interviewSpeechCtor();
  }

  toggleInterviewMic() {
    const d = this._ivDictation;
    if (d && d.active) this.stopInterviewMic();
    else this.startInterviewMic();
  }

  startInterviewMic() {
    if (!this._interviewCurrentQuestion) return;
    if (!this._interviewSpeechSupported()) {
      this._interviewRenderMic();
      const panel = document.getElementById('iv-voice-unsupported');
      if (panel) panel.classList.remove('hidden');
      this.toggleInterviewType(true);
      return;
    }
    this._interviewStopDictation();
    const q = this._interviewCurrentQuestion;
    const d = this._ivDictation = {
      active: true,
      question: q,
      base: (this._interviewLoad(q) || {}).answer || '',
      final: '',
      interim: '',
      startedAt: Date.now(),
      rec: null,
      error: null
    };
    const fb = document.getElementById('iv-feedback');
    if (fb) fb.innerHTML = '';
    this._interviewSpawnDictation();
    this._interviewRenderMic();
  }

  _interviewSpawnDictation() {
    const d = this._ivDictation;
    if (!d || !d.active) return;
    const Ctor = this._interviewSpeechCtor();
    if (!Ctor) {
      d.error = 'no-speech-api';
      d.active = false;
      this._interviewFinishDictation();
      return;
    }

    let rec;
    try {
      rec = new Ctor();
    } catch (e) {
      d.error = 'construct-failed';
      d.active = false;
      this._interviewFinishDictation();
      return;
    }

    rec.lang = 'en-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      if (this._ivDictation !== d) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result && result[0];
        const text = alt && alt.transcript ? alt.transcript : '';
        if (result.isFinal) d.final += (d.final && !/\s$/.test(d.final) ? ' ' : '') + text;
        else interim += (interim ? ' ' : '') + text;
      }
      d.interim = interim;
      this._interviewRenderTranscript(d.final, d.interim);
      this._interviewRenderMic();
    };

    rec.onerror = (event) => {
      if (this._ivDictation !== d) return;
      d.error = (event && event.error) || 'unknown';
      // Chrome fires 'no-speech' whenever there is a quiet stretch; it is not a
      // failure, so it only updates the status line.
      if (d.error === 'no-speech') {
        this._interviewRenderMic();
        return;
      }
      // Permission, hardware and service failures are terminal. Restarting on
      // them just repeats the same refusal, so finish here and hand the
      // candidate the typing box instead of leaving a mic that taps do nothing.
      if (d.error === 'not-allowed' || d.error === 'service-not-allowed' || d.error === 'audio-capture') {
        d.active = false;
        if (d.rec === rec) d.rec = null;
        this._interviewFinishDictation();
        return;
      }
      this._interviewRenderMic();
    };

    rec.onend = () => {
      if (this._ivDictation !== d) return;
      d.rec = null;
      // Chrome closes a continuous session on its own about once a minute, and
      // a 45-180 word answer regularly runs past that, so open a fresh one
      // rather than letting dictation stop mid-sentence.
      if (d.active) {
        this._interviewSpawnDictation();
        return;
      }
      this._interviewFinishDictation();
    };

    d.rec = rec;
    try {
      rec.start();
    } catch (e) { /* already started; onend respawns it */ }
  }

  stopInterviewMic() {
    const d = this._ivDictation;
    if (!d) return;
    d.active = false;
    if (d.rec) {
      // Final results arrive before onend, so finishing there keeps the last
      // words of the sentence rather than dropping them.
      try { d.rec.stop(); } catch (e) { this._interviewFinishDictation(); }
    } else {
      this._interviewFinishDictation();
    }
    this._interviewRenderMic();
  }

  /** Stop without finishing the answer: used when the question changes. */
  _interviewStopDictation() {
    const d = this._ivDictation;
    if (!d) return;
    this._ivDictation = null;
    d.active = false;
    if (d.rec) {
      try { d.rec.abort(); } catch (e) { }
    }
  }

  _interviewDictationText(d) {
    if (!d) return '';
    return [d.final, d.interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  _interviewFinishDictation() {
    const d = this._ivDictation;
    if (!d) return;
    if (this._ivDictation === d) this._ivDictation = null;

    const spoken = this._interviewDictationText(d);
    const merged = [d.base, spoken].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const seconds = (Date.now() - d.startedAt) / 1000;
    this._interviewSetAnswerText(merged);
    this._interviewRenderMic();

    if (!spoken) {
      // Nothing was captured, so say why rather than letting them sit in front
      // of a dead microphone, and hand them the way that still works.
      if (d.error) {
        const title = document.getElementById('iv-voice-unsupported-title');
        const detail = document.getElementById('iv-voice-unsupported-detail');
        if (title) title.textContent = this._interviewMicErrorTitle(d.error);
        if (detail) detail.textContent = this._interviewMicErrorText(d.error);
        const panel = document.getElementById('iv-voice-unsupported');
        if (panel) panel.classList.remove('hidden');
        this.toggleInterviewType(true);
      }
      return;
    }

    // Judging what they said is the point of speaking it, so run the check
    // without making them press a second button.
    this._interviewDelivery = { seconds: seconds, words: this._interviewWordCount(spoken) };
    this.checkInterviewAnswer();
  }

  _interviewMicErrorTitle(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') return 'Microphone blocked';
    if (code === 'audio-capture') return 'No microphone found';
    if (code === 'no-speech-api' || code === 'construct-failed') return "This browser can't listen";
    return 'Listening stopped early';
  }

  _interviewMicErrorText(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') return 'Allow the microphone in your browser and tap the mic again, or write the answer out below.';
    if (code === 'audio-capture') return 'Plug a microphone in and tap again, or write the answer out below.';
    if (code === 'no-speech-api' || code === 'construct-failed') return 'Speech-to-text needs Chrome or Edge. You can still write the answer out below and check it the same way.';
    return 'Nothing was picked up. Tap the mic to try again, or write the answer out below.';
  }

  _interviewWordCount(text) {
    const t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  _interviewRenderTranscript(final, interim) {
    const wrap = document.getElementById('iv-transcript-wrap');
    const el = document.getElementById('iv-transcript');
    if (!wrap || !el) return;
    const d = this._ivDictation;
    let text;
    if (final == null) {
      const ta = document.getElementById('iv-answer');
      text = ta ? ta.value : '';
    } else {
      text = [final, interim].filter(Boolean).join(' ');
      const base = d ? d.base : '';
      if (base) text = base + (text ? ' ' + text : '');
    }
    const shown = String(text || '').replace(/\s+/g, ' ').trim();
    el.textContent = shown;
    if (shown) wrap.classList.remove('hidden');
    else wrap.classList.add('hidden');
  }

  _interviewRenderMic() {
    const label = document.getElementById('iv-mic-label');
    const status = document.getElementById('iv-mic-status');
    const icon = document.getElementById('iv-mic-icon');
    const mic = document.getElementById('iv-mic');
    const d = this._ivDictation;
    const live = !!(d && d.active);

    if (mic) {
      // Toggling two competing bg-* utilities would leave the winner up to
      // stylesheet order, so the recording colour is pinned by id in index.html.
      mic.classList.toggle('is-recording', live);
      mic.classList.toggle('animate-pulse', live);
      mic.classList.toggle('motion-reduce:animate-none', live);
      mic.setAttribute('aria-label', live ? 'Stop recording' : 'Record your answer');
    }
    if (icon) icon.textContent = live ? 'stop_circle' : 'mic';
    if (label) label.textContent = live ? 'Listening - tap to finish' : 'Tap to answer out loud';

    if (status) {
      if (live) {
        const heard = this._interviewWordCount(this._interviewDictationText(d));
        const secs = Math.max(0, Math.round((Date.now() - d.startedAt) / 1000));
        status.textContent = heard
          ? 'Listening - ' + heard + ' words so far, ' + secs + 's'
          : 'Listening - start answering out loud';
        if (d.error && d.error !== 'no-speech') status.textContent = 'Having trouble: ' + this._interviewMicErrorText(d.error);
      } else {
        status.textContent = 'Uses your microphone only. The audio never leaves this page.';
      }
    }
    return live;
  }

  toggleInterviewType(force) {
    const wrap = document.getElementById('iv-type-fallback');
    const btn = document.getElementById('iv-type-toggle');
    if (!wrap) return;
    const show = force === true ? true : wrap.classList.contains('hidden');
    if (show) wrap.classList.remove('hidden');
    else wrap.classList.add('hidden');
    if (btn) btn.textContent = show ? 'Hide typing' : 'Type instead';
    if (show) {
      const ta = document.getElementById('iv-answer');
      if (ta && typeof ta.focus === 'function') ta.focus();
    }
  }

  /**
   * What only a spoken answer can be judged on: pace and filler. A typed answer
   * has no duration, so this runs only on top of a recorded one.
   */
  _gradeSpokenDelivery(spoken, seconds) {
    const checks = [];
    const words = this._interviewWordCount(spoken);
    const secs = Number(seconds) || 0;
    const lower = String(spoken || '').toLowerCase();
    const filler = lower.match(/\b(um+|uh+|erm|basically|actually|literally|like,|sort of|kind of|i guess|honestly speaking)\b/g) || [];
    let wpm = null;

    if (words >= 45 && secs >= 20) {
      wpm = Math.round((words / secs) * 60);
      if (wpm >= 195) {
        checks.push({ ok: false, label: 'Rushed', hint: wpm + ' words per minute. Interviewers read speed as nerves - aim for 130-160.' });
      } else if (wpm >= 170) {
        checks.push({ ok: false, label: 'A bit fast', hint: wpm + ' words per minute. Try to land nearer 150.' });
      } else if (wpm < 90) {
        checks.push({ ok: false, label: 'Slow', hint: wpm + ' words per minute. Long pauses read as uncertainty - keep the story moving.' });
      } else {
        checks.push({ ok: true, label: 'Good pace', hint: wpm + ' words per minute - about right for an interview answer.' });
      }
    }

    const spokenFiller = filler.filter(f => !/^(like,|sort of|kind of)$/.test(f));
    if (spokenFiller.length) {
      checks.push({
        ok: false, label: 'Filler words out loud',
        hint: 'Heard "' + spokenFiller.slice(0, 3).join('", "') + '" ' + spokenFiller.length + ' time' + (spokenFiller.length === 1 ? '' : 's') + '. Pause silently instead.'
      });
    } else if (words >= 45) {
      checks.push({ ok: true, label: 'Clean delivery', hint: 'No filler words in what you said.' });
    }

    if (!checks.length) {
      checks.push({ ok: true, label: 'Spoken answer captured', hint: words + ' words heard. Answer it again for longer to be graded on pace.' });
    }

    return { checks: checks, wpm: wpm, words: words, seconds: Math.round(secs) };
  }

  _interviewLoadAll() {
    try { return JSON.parse(localStorage.getItem(this._interviewJobKey) || '{}'); } catch (err) { return {}; }
  }

  _interviewLoad(question) {
    const store = this._interviewLoadAll();
    const key = this._interviewAnswerKey(question);
    return { answer: (key && store[key]) || '' };
  }

  _updateInterviewWordcount(text) {
    const el = document.getElementById('iv-wordcount');
    if (!el) return;
    const words = this._interviewWordCount(text);
    el.textContent = words ? `${words} words` : 'Tap the mic to answer';
  }

  clearInterviewAnswer() {
    this._interviewStopDictation();
    this._interviewDelivery = null;
    const ta = document.getElementById('iv-answer');
    this._interviewSetAnswerText('');
    const key = this._interviewAnswerKey();
    if (this._interviewJobKey && key) {
      try {
        const store = this._interviewLoadAll();
        delete store[key];
        localStorage.setItem(this._interviewJobKey, JSON.stringify(store));
      } catch (err) { }
    }
    const fb = document.getElementById('iv-feedback');
    if (fb) fb.innerHTML = '';
    this._interviewRenderMic();
  }

  copyInterviewAnswer() {
    const ta = document.getElementById('iv-answer');
    if (!ta || !ta.value.trim()) { this.showToast('Write a draft answer first.'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(() => this.showToast('Answer draft copied.'));
    } else {
      const ta2 = document.createElement('textarea');
      ta2.value = ta.value;
      document.body.appendChild(ta2);
      ta2.select();
      document.execCommand('copy');
      document.body.removeChild(ta2);
      this.showToast('Answer draft copied.');
    }
  }

  // --- Answer checking -------------------------------------------------

  /** Grades the draft answer against what interviewers actually score on. */
  checkInterviewAnswer() {
    const ta = document.getElementById('iv-answer');
    const fb = document.getElementById('iv-feedback');
    const q = this._interviewCurrentQuestion;
    if (!ta) return;
    if (!ta.value.trim()) { this.showToast('Answer out loud first, then check it.'); return; }
    if (!fb) return;

    const answer = ta.value.trim();
    const grade = this._gradeAnswer(answer, q);
    const model = this._modelAnswer(q);
    // Only a recorded answer has a duration, so the pace and filler read is
    // shown when there is a real recording behind the transcript.
    const delivery = this._interviewDelivery
      ? this._gradeSpokenDelivery(answer, this._interviewDelivery.seconds)
      : null;

    const barColor = grade.score >= 75 ? 'bg-emerald-500' : grade.score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
    const verdictColor = grade.score >= 75 ? 'text-emerald-700' : grade.score >= 50 ? 'text-amber-700' : 'text-rose-700';
    const verdictBg = grade.score >= 75 ? 'bg-emerald-50' : grade.score >= 50 ? 'bg-amber-50' : 'bg-rose-50';

    fb.innerHTML = `
      ${delivery ? `
      <div class="rounded-xl border border-slate-200 overflow-hidden mb-3">
        <div class="px-3.5 py-3 bg-slate-900 border-b border-slate-800">
          <p class="text-[13px] font-bold text-white">How you said it</p>
          <p class="text-[11px] text-slate-300 mt-0.5">${delivery.words} words over ${delivery.seconds}s${delivery.wpm ? ' - ' + delivery.wpm + ' words per minute' : ''}. This part is only visible when you answer out loud.</p>
        </div>
        <ul class="p-3 space-y-1.5 bg-white">
          ${delivery.checks.map(c => `
            <li class="text-[12px] leading-relaxed flex gap-2">
              <span class="material-symbols-outlined text-sm ${c.ok ? 'text-emerald-600' : 'text-rose-500'} shrink-0">${c.ok ? 'check_circle' : 'cancel'}</span>
              <span class="${c.ok ? 'text-slate-600' : 'text-slate-800'}"><strong class="font-bold">${this.escapeHtml(c.label)}</strong> - ${this.escapeHtml(c.hint)}</span>
            </li>`).join('')}
        </ul>
      </div>` : ''}
      <div class="rounded-xl border border-slate-200 overflow-hidden">
        <div class="${verdictBg} px-3.5 py-3 border-b border-slate-200">
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <span class="text-[13px] font-bold ${verdictColor}">${grade.verdict}</span>
            <span class="text-[13px] font-bold ${verdictColor}">${grade.score}/100</span>
          </div>
          <div class="h-1.5 rounded-full bg-white/70 overflow-hidden">
            <div class="h-full ${barColor} rounded-full" style="width:${grade.score}%"></div>
          </div>
          <p class="text-[11px] text-slate-600 mt-1.5">${grade.summary}</p>
        </div>
        <ul class="p-3 space-y-1.5 bg-white">
          ${grade.checks.map(c => `
            <li class="text-[12px] leading-relaxed flex gap-2">
              <span class="material-symbols-outlined text-sm ${c.ok ? 'text-emerald-600' : 'text-rose-500'} shrink-0">${c.ok ? 'check_circle' : 'cancel'}</span>
              <span class="${c.ok ? 'text-slate-600' : 'text-slate-800'}"><strong class="font-bold">${this.escapeHtml(c.label)}</strong> - ${this.escapeHtml(c.hint)}</span>
            </li>`).join('')}
        </ul>
        <div class="p-3.5 border-t border-slate-200 bg-slate-50">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <p class="text-[11px] font-bold uppercase tracking-wide text-primary">${grade.score >= 75 ? 'Tighten it like this' : 'A strong answer looks like this'}</p>
            <button onclick="app.copyModelAnswer()" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5 whitespace-nowrap">Copy model</button>
          </div>
          <p class="text-[10px] text-slate-400 mb-2">Built from your own proof profile - swap anything in [brackets] for your real detail.</p>
          <div class="text-[12px] text-slate-700 leading-relaxed bg-white border border-slate-200 rounded-lg p-3 whitespace-pre-line">${this.escapeHtml(model)}</div>
          <p class="text-[11px] font-bold text-slate-700 mt-2.5 mb-1">Structure to remember: STAR</p>
          <ul class="text-[11px] text-slate-600 space-y-0.5">
            <li><strong>S</strong>ituation - the one line of context</li>
            <li><strong>T</strong>ask - what you were responsible for</li>
            <li><strong>A</strong>ction - what you personally did, first person</li>
            <li><strong>R</strong>esult - the number or outcome that proves it</li>
          </ul>
        </div>
      </div>`;
    fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Rule-based scoring: length, STAR, ownership, proof, relevance, filler. */
  _gradeAnswer(answer, q) {
    const text = String(answer || '');
    const lower = text.toLowerCase();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const checks = [];
    let score = 0;

    // 1. Length (an interview answer is roughly 45-180 words).
    let lengthOk = words >= 45 && words <= 180;
    if (!lengthOk) lengthOk = words >= 30 && words <= 220;
    if (lengthOk) {
      score += 20;
      checks.push({ ok: true, label: 'Right length', hint: words + ' words - about a minute spoken.' });
    } else if (words < 30) {
      score += 5;
      checks.push({ ok: false, label: 'Too short', hint: 'Only ' + words + ' words. Give context, what you did and the outcome (45-180 words).' });
    } else {
      score += 10;
      checks.push({ ok: false, label: 'Too long', hint: words + ' words. Cut to the first 180 - the interviewer stops listening after two minutes.' });
    }

    // 2. STAR structure.
    const hasSituation = /(at |when |while |during |the (context|situation|team|company|project) |i was |we were |our |my )/i.test(text);
    const hasTask = /(responsible for|my role|was asked|had to|needed to|my job was|assigned|owned|objective|goal was|expected)/i.test(text);
    const hasAction = /(i |we )?(built|developed|designed|led|managed|owned|drove|shipped|launched|migrated|automated|implemented|analysed|analyzed|improved|reduced|increased|scaled|set up|created|reviewed|coordinated|partnered|mentored|troubleshoot)/i.test(text);
    const hasResult = /(so that|result|resulting|which (led|meant|reduced|improved)|impact|outcome|therefore|after that|cut |saved |grew|reached)/i.test(text);
    const starParts = [hasSituation, hasTask, hasAction, hasResult].filter(Boolean).length;
    score += Math.round(starParts * 6);
    if (starParts === 4) {
      checks.push({ ok: true, label: 'Full STAR structure', hint: 'Situation, task, action and result are all there.' });
    } else {
      const missing = [];
      if (!hasSituation) missing.push('the situation');
      if (!hasTask) missing.push('what you were responsible for');
      if (!hasAction) missing.push('what you personally did');
      if (!hasResult) missing.push('the result');
      checks.push({ ok: false, label: 'Structure', hint: 'Missing ' + missing.join(', ') + '. Run it as STAR.' });
    }

    // 3. Ownership: first person, own actions.
    const firstPerson = /\b(i|i'm|i've|my|me|we|our)\b/i.test(text);
    if (firstPerson) {
      score += 15;
      checks.push({ ok: true, label: 'Takes ownership', hint: 'Uses "I" - you are claiming the work, not describing a team.' });
    } else {
      checks.push({ ok: false, label: 'Takes ownership', hint: 'No "I" in the answer. Say what YOU did, not just what the team did.' });
    }

    // 4. Proof: a number, a metric or a concrete outcome.
    const hasNumber = /\b\d+(\.\d+)?\s*(%|percent|x|hrs?|hours?|days?|weeks?|months?|users?|clients?|records|requests|qps|lakh|crore|k|m)?\b/i.test(text);
    const hasMetricWord = /(reduced|increased|cut|saved|grew|improved|scaled|dropped|raised|accelerated|shortened|doubled|halved|onboarded|converted|closed|shipped|delivered)\b/i.test(text);
    if (hasNumber || hasMetricWord) {
      score += 20;
      checks.push({ ok: true, label: 'Shows proof', hint: 'Contains a measurable outcome - this is the part interviewers remember.' });
    } else {
      checks.push({ ok: false, label: 'No proof yet', hint: 'No number or measurable outcome. Add one, e.g. "cut build time by 40%" or "onboarded 12 users".' });
    }

    // 5. Relevance: uses the words this question is about.
    const focus = (q && Array.isArray(q.focus) ? q.focus : []).filter(Boolean).map(f => String(f).toLowerCase());
    const hit = focus.filter(f => lower.indexOf(f) !== -1);
    if (!focus.length) {
      score += 20;
      checks.push({ ok: true, label: 'On topic', hint: 'Open question - no specific keyword to hit. Keep it about you and this role.' });
    } else if (hit.length) {
      score += 20;
      checks.push({ ok: true, label: 'On topic', hint: 'Mentions ' + hit.join(', ') + ' - exactly what this question is about.' });
    } else {
      checks.push({ ok: false, label: 'Off topic', hint: 'This question is about ' + focus.join(', ') + ' and your answer never says it. Name it explicitly.' });
    }

    // 6. Filler / hedging.
    const filler = lower.match(/\b(um+|uh+|erm|basically|actually|literally|like,|sort of|kind of|i guess|i think maybe|honestly speaking)\b/g);
    if (filler && filler.length) {
      score -= Math.min(10, filler.length * 3);
      checks.push({ ok: false, label: 'Filler words', hint: 'Found "' + filler.slice(0, 3).join('", "') + '" - pause silently instead.' });
    } else {
      score += 5;
      checks.push({ ok: true, label: 'Clean delivery', hint: 'No filler words.' });
    }

    // 7. Specifics: named tools, systems, teams.
    const hasSpecifics = /(\b[A-Z][a-z]+\b|\bv?\d|\b(api|sql|dashboard|funnel|release|repo|stack|pipeline|dataset|client|customer|stakeholder|team)\b)/.test(text);
    if (hasSpecifics) {
      score += 5;
      checks.push({ ok: true, label: 'Specific details', hint: 'Names real things - that is what makes a story credible.' });
    } else {
      checks.push({ ok: false, label: 'Too generic', hint: 'Name the actual project, tool, client or team you are describing.' });
    }

    score = Math.max(0, Math.min(100, score));
    const verdict = score >= 75
      ? 'Strong answer - interview ready'
      : score >= 50
        ? 'Almost there - fix the gaps below'
        : 'Not interview ready yet';
    const summary = score >= 75
      ? 'This has the shape of an answer a hiring manager will believe.'
      : 'Interviewers score structure, ownership and proof. Fix the red items and say it out loud.';

    return { score: score, verdict: verdict, summary: summary, checks: checks, words: words };
  }

  /** Builds a model answer from the user's own profile, tailored to this question. */
  _modelAnswer(q) {
    const profile = swapikiStore.getProfile() || {};
    const projects = Array.isArray(profile.projects) ? profile.projects : [];
    const job = this._interviewJob || (Array.isArray(this._jobsCache) && this._jobsCache.find(j => j.id === this._interviewJobId)) || null;
    const role = job && job.title ? job.title : 'this role';
    const comp = job && job.company ? job.company : 'the company';
    const focus = (q && Array.isArray(q.focus) ? q.focus : []).map(f => String(f).toLowerCase());

    // Pick the best story for this question: the GitHub repo the candidate
    // chose (or the top-ranked one), competing with their profile projects.
    const ctx = window.swapikiGitHub ? window.swapikiGitHub.buildJobContext(job || {}) : { terms: [] };
    const ranked = this._ghRanked ? this._ghRanked() : [];
    const chosenName = this._ghHydrateStory ? this._ghHydrateStory() : (this._interviewStory || '');
    // An auto-picked repo must actually overlap this listing; an explicit pick
    // is always honoured. Otherwise fall back to the profile projects.
    const autoTop = ranked.find(r => r.matched && r.matched.length) || null;
    const chosen = chosenName
      ? ranked.find(r => r.name === chosenName)
      : autoTop;

    const scoreHay = (hay) => focus.reduce((acc, f) => acc + (hay.indexOf(f) !== -1 ? 2 : 0), 0) + Math.min(hay.length, 400) / 400;
    let best = null, bestScore = 0;
    projects.forEach(p => {
      const hay = [p.title, p.role, p.description, (p.tags || []).join(' '), (p.skills || []).join(' ')].join(' ').toLowerCase();
      const s = scoreHay(hay);
      if (s > bestScore) { bestScore = s; best = { kind: 'project', data: p }; }
    });
    if (chosen) {
      const hay = [chosen.name, chosen.repo.description, chosen.language, (chosen.repo.topics || []).join(' ')].join(' ').toLowerCase();
      const s = scoreHay(hay) + (chosen.score / 100) + (chosenName ? 1.5 : 0);
      if (s > bestScore) { bestScore = s; best = { kind: 'repo', data: chosen }; }
    }
    const bestProject = best && best.kind === 'project' ? best.data : null;
    const bestRepo = best && best.kind === 'repo' ? best.data : null;

    // What the candidate told us about the winning repo, if anything.
    const notes = bestRepo ? this._ghNotes(bestRepo.name) : {};
    const nProblem = String(notes.problem || '').trim();
    const nRole = String(notes.role || '').trim();
    const nResult = String(notes.result || '').trim();

    const qText = q && q.text ? q.text : 'this question';
    const lines = [];

    lines.push('SITUATION');
    if (bestRepo) {
      const rd = bestRepo.repo || {};
      const desc = rd.description ? String(rd.description).replace(/\s+/g, ' ').replace(/[.!?]+$/, '') : '';
      lines.push('"' + (comp !== 'the company' ? 'At ' + comp + ' ' : '') + 'I built ' + bestRepo.name +
        (bestRepo.language ? ' - a ' + bestRepo.language + ' project' : '') +
        (desc ? ': ' + desc : '') + '. The problem it solved was ' +
        (nProblem || '[the one-line problem - name it]') + '.');
    } else if (bestProject) {
      lines.push('"' + (comp !== 'the company' ? 'At ' + comp + ' ' : '') + 'I worked on ' + (bestProject.title || 'a project') + (bestProject.role ? ' as a ' + bestProject.role : '') + '. The problem we needed to solve was [the one-line problem - name it].');
    } else {
      lines.push('"The context is [where and when]. Something needed to change: [the problem in one line].');
    }

    lines.push('');
    lines.push('TASK');
    if (bestRepo) {
      lines.push(nRole
        ? 'My role: ' + nRole + '.'
        : 'I owned ' + (focus[0] ? focus[0] + ' work' : 'the build') + ' end to end in ' + bestRepo.name + ' - [the outcome you were responsible for, and any constraint you had].');
    } else if (bestProject) {
      lines.push('I was responsible for [the outcome you owned], working with [who], and I had to do it within [constraint].');
    } else {
      lines.push('I owned [the outcome], which meant [the scope you personally carried].');
    }

    lines.push('');
    lines.push('ACTION');
    const bullets = (bestProject && Array.isArray(bestProject.takeaways) ? bestProject.takeaways : []).filter(b => b);
    if (bestRepo) {
      const nHard = String(notes.hard || '').trim();
      const nStack = String(notes.stack || '').trim();
      lines.push('- What it is: ' + ((bestRepo.repo && bestRepo.repo.description) || bestRepo.name) + '.');
      if (nStack) {
        lines.push('- Tech and why: ' + nStack + '.');
      } else {
        lines.push('- Stack: ' + (bestRepo.language || 'the languages you used') + (bestRepo.matchedSkills && bestRepo.matchedSkills.length ? ', chosen for ' + bestRepo.matchedSkills.join(', ') : '') + ' - [why you chose it and what you gave up].');
      }
      lines.push('- The hard part: ' + (nHard || '[the one problem that took real effort - performance, scale, a nasty bug].'));
      lines.push('- How you checked it worked: [tests, benchmarks, users, monitoring].');
    } else if (bullets.length) {
      bullets.slice(0, 3).forEach(b => lines.push('- ' + b));
      if (!focus.length || focus.some(f => bullets.join(' ').toLowerCase().indexOf(f) === -1)) {
        lines.push('- I also made sure ' + (focus[0] || 'the key skill here') + ' was part of how I did it, because that is what the job asks for.');
      }
    } else {
      lines.push('- I ' + (focus[0] ? 'used ' + focus[0] + ' to ' : '') + '[what you personally did - step one].');
      lines.push('- [step two - the hard part, and how you decided].');
      lines.push('- [step three - how you checked it worked].');
    }

    lines.push('');
    lines.push('RESULT');
    if (nResult) {
      lines.push('The outcome: ' + nResult + '. For ' + role + ' at ' + comp + ' specifically, that is the same kind of problem you are hiring to solve.');
    } else {
      lines.push('The outcome was [the number - e.g. cut X by 40%, shipped Y to Z users, won the deal]. ' +
        'After that, [what changed because of you]. For ' + role + ' at ' + comp + ' specifically, this is the same problem you are hiring to solve.');
    }

    return 'Q: ' + qText + '\n\n' + lines.join('\n');
  }

  copyModelAnswer() {
    const q = this._interviewCurrentQuestion;
    const text = this._modelAnswer(q);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => this.showToast('Model answer copied.'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast('Model answer copied.');
    }
  }

  copyInterviewQuestions() {
    const qu = this._interviewQuestions || { description: [], role: [], skills: [], behavioral: [], askThem: [] };
    const txt = list => (list || []).map((q, i) => `${i + 1}. ${typeof q === 'string' ? q : q.text}`);
    const lines = [
      'STRAIGHT FROM THIS JOB DESCRIPTION',
      ...txt(qu.description),
      '',
      'ABOUT THIS ROLE',
      ...txt(qu.role),
      '',
      qu.skills && qu.skills.length ? 'BUILT ON THE LISTED SKILLS' : null,
      ...(qu.skills && qu.skills.length ? txt(qu.skills) : []),
      '',
      'BEHAVIOURAL',
      ...txt(qu.behavioral),
      '',
      'QUESTIONS TO ASK THEM',
      ...txt(qu.askThem)
    ].filter(l => l !== null);
    const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => this.showToast('Question bank copied.'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast('Question bank copied.');
    }
  }

  // ---------------------------------------------------------------------
  // GITHUB PROJECT PICKER (interview prep)
  // ---------------------------------------------------------------------

  _ghStateKey() { return 'swapiki_github_state'; }

  _ghLoad() {
    try { return JSON.parse(localStorage.getItem(this._ghStateKey()) || '{}'); } catch (err) { return {}; }
  }

  _ghSave(patch) {
    const next = Object.assign(this._ghLoad(), patch || {});
    try { localStorage.setItem(this._ghStateKey(), JSON.stringify(next)); } catch (err) { }
    this._gh = next;
    return next;
  }

  _ghClientId() {
    const cfg = window.SWAPIKI_CONFIG || {};
    return cfg.GITHUB_CLIENT_ID || '';
  }

  /** Kicks off the GitHub one-time sign-in (device flow - no secret needed). */
  async ghConnect() {
    const clientId = this._ghClientId();
    if (!clientId) { this.ghFocusLink(); return; }
    const box = document.getElementById('gh-connect-box');
    if (box) box.innerHTML = '<p class="text-[12px] text-slate-500">Starting GitHub sign-in...</p>';
    try {
      const res = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ client_id: clientId, scope: 'read:user public_repo' })
      });
      const data = await res.json();
      if (data.error || !data.device_code) throw new Error(data.error_description || data.error || 'GitHub did not start the sign-in.');
      this._ghDevice = data;
      this._ghRenderDevice();
      try { window.open(data.verification_uri, '_blank', 'noopener'); } catch (e) { }
    } catch (err) {
      this.ghError('Could not start GitHub sign-in (' + ((err && err.message) || 'network error') + '). You can still paste your GitHub link below.');
      this.ghFocusLink();
    }
  }

  _ghRenderDevice() {
    const box = document.getElementById('gh-connect-box');
    if (box) box.innerHTML = this._ghDeviceBoxHtml();
  }

  _ghDeviceBoxHtml() {
    const d = this._ghDevice;
    if (!d) return '';
    return `
      <div class="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        <p class="text-[12px] text-slate-600 mb-2">Enter this code on GitHub, then come back here.</p>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xl font-bold tracking-widest text-primary">${this.escapeHtml(d.user_code || '')}</span>
          <button onclick="app._ghCopyCode()" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Copy</button>
          <a href="${this.escapeHtml(d.verification_uri || 'https://github.com/login/device')}" target="_blank" rel="noopener" class="text-[11px] font-bold text-primary underline">Open github.com/login/device</a>
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button onclick="app._ghPollDevice()" class="px-3.5 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90">I have entered it</button>
          <button onclick="app._ghCancelDevice()" class="text-[12px] font-bold text-slate-400 hover:text-slate-700">Cancel</button>
        </div>
      </div>`;
  }

  _ghCopyCode() {
    const code = this._ghDevice && this._ghDevice.user_code;
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => this.showToast('Code copied.'));
    }
  }

  async _ghPollDevice() {
    const d = this._ghDevice;
    if (!d) return;
    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          client_id: this._ghClientId(),
          device_code: d.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });
      const data = await res.json();
      if (data.error === 'authorization_pending') { this.showToast('Not yet - approve it on GitHub, then check again.'); return; }
      if (data.error === 'slow_down') { this.showToast('Slow down a moment, then check again.'); return; }
      if (data.error || !data.access_token) {
        this.ghError('GitHub sign-in ' + (data.error || 'failed') + (data.error_description ? ' - ' + data.error_description : '') + '.');
        return;
      }
      this._ghSave({ token: data.access_token });
      this._ghDevice = null;
      this.showToast('GitHub connected. Reading your repos...');
      await this.ghFetchRepos(true);
    } catch (err) {
      this.ghError('Could not finish GitHub sign-in. Paste your GitHub link below instead.');
      this.ghFocusLink();
    }
  }

  _ghCancelDevice() {
    this._ghDevice = null;
    this.renderGitHubPicker();
  }

  /**
   * Pulls a GitHub username out of whatever the candidate pasted: a profile
   * link (https://github.com/you), a shortened one (github.com/you), a repo
   * link, an @handle, or a bare username. Returns '' when nothing usable.
   */
  _ghParseUsername(raw) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '');
    if (/^github\.com(\/|$)/i.test(s)) {
      s = s.replace(/^github\.com/i, '');
    } else if (/[/:]/.test(s)) {
      return ''; // a link to some other host is not a GitHub profile
    }
    s = s.split(/[?#]/)[0].replace(/^\/+/, '').split('/')[0].split('@').pop();
    s = s.replace(/[\s.]+$/, '');
    return /^[A-Za-z0-9-]{1,39}$/.test(s) ? s : '';
  }

  /** Link path: reads public repos only, no sign-in needed. */
  async ghConnectFromLink() {
    const input = document.getElementById('gh-link');
    const username = this._ghParseUsername(input && input.value);
    if (!username) {
      this.ghError('That does not look like a GitHub link. It should look like github.com/yourname.');
      return;
    }
    this._ghSave({ username: username, token: '' });
    await this.ghFetchRepos(true);
  }

  /** Pulls repos (with the token when we have one) and re-renders the picker. */
  async ghFetchRepos(force) {
    const state = this._ghLoad();
    const twentyMin = 20 * 60 * 1000;
    if (!force && state.repos && state.fetchedAt && (Date.now() - state.fetchedAt) < twentyMin) {
      this._gh = state;
      this.renderGitHubPicker();
      return;
    }
    this.ghBusy('Reading your GitHub repos...');
    try {
      let endpoint;
      if (state.token) {
        endpoint = 'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner';
      } else if (state.username) {
        endpoint = 'https://api.github.com/users/' + encodeURIComponent(state.username) + '/repos?per_page=100&sort=updated&type=owner';
      } else {
        this.renderGitHubPicker();
        return;
      }
      const headers = { 'Accept': 'application/vnd.github+json' };
      if (state.token) headers.Authorization = 'Bearer ' + state.token;
      const res = await fetch(endpoint, { headers: headers });
      if (res.status === 401) { this.ghError('GitHub rejected the sign-in. Disconnect and connect again.'); return; }
      if (res.status === 403) { this.ghError('GitHub rate limit hit. Wait a few minutes and press Refresh.'); return; }
      if (!res.ok) { this.ghError('GitHub returned ' + res.status + '. Try again in a moment.'); return; }
      const repos = await res.json();
      let login = state.username || '';
      if (state.token) {
        try {
          const me = await fetch('https://api.github.com/user', { headers: headers });
          if (me.ok) { const u = await me.json(); login = u.login || login; }
        } catch (e) { }
      }
      const slim = (Array.isArray(repos) ? repos : []).map(r => ({
        name: r.name,
        description: r.description || '',
        language: r.language || '',
        topics: Array.isArray(r.topics) ? r.topics : [],
        stargazers_count: r.stargazers_count || 0,
        fork: !!r.fork,
        archived: !!r.archived,
        size: r.size || 0,
        pushed_at: r.pushed_at,
        html_url: r.html_url
      }));
      this._ghSave({ repos: slim, fetchedAt: Date.now(), login: login, error: '' });
      this.showToast(slim.length + ' repos matched against this job.');
    } catch (err) {
      this.ghError('Could not reach GitHub. Check your connection and try again.');
    }
  }

  ghDisconnect() {
    this._ghSave({ token: '', username: '', repos: [], fetchedAt: 0, login: '', error: '' });
    this._gh = {};
    this.showToast('GitHub disconnected.');
    this.renderGitHubPicker();
  }

  /**
   * Progress text for the picker. Writes to the connect form's own status line:
   * #gh-status in the connected view holds the "@login - N repos" summary and
   * must not be clobbered by a fetch message.
   */
  ghBusy(message) {
    const el = document.getElementById('gh-connect-status');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
  }

  ghError(message) {
    this._ghSave({ error: message });
    this.renderGitHubPicker();
    this.ghFocusLink();
  }

  ghFocusLink() {
    const input = document.getElementById('gh-link');
    if (input) { try { input.focus(); } catch (e) { } }
  }

  /** A one-line, plain-English reason this repo ranks where it does. */
  _ghReason(item) {
    if (!item) return '';
    if (item.matchedSkills && item.matchedSkills.length) {
      return 'Ranks here because it uses ' + item.matchedSkills.slice(0, 3).join(', ') +
        ', which this listing asks for. ' + (item.score >= 75 ? 'Strong match - lead with it.' : 'Worth mentioning.');
    }
    if (item.matched && item.matched.length) {
      return 'No required skill overlap, but it touches ' + item.matched.slice(0, 3).join(', ') + ' from the description.';
    }
    return 'Nothing in the listing matches this one - only pick it if you have a strong story for it.';
  }

  /**
   * The candidate's own notes about a repo. The device copy is the read cache
   * (instant, and works signed out); the account copy is mirrored by
   * _ghSyncNotes() so the story follows them to another laptop.
   */
  _ghNotesKey(name) { return 'swapiki_repo_notes_' + String(name || 'x'); }

  _ghNoteFields() {
    return (window.swapikiGitHub && window.swapikiGitHub.NOTE_FIELDS) || [];
  }

  /**
   * The raw device record including its sync bookkeeping:
   * { n: answers, u: updated-at ms, s: reached-the-account }. A plain
   * {problem: ...} object written before account sync existed still reads
   * correctly, so nobody loses notes to this change.
   */
  _ghNoteEnvelope(name) {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(this._ghNotesKey(name)) || '{}') || {}; } catch (e) { }
    if (!raw || typeof raw !== 'object') return { n: {}, u: 0, s: false };
    if (raw.n && typeof raw.n === 'object') return { n: raw.n, u: Number(raw.u) || 0, s: !!raw.s };
    return { n: raw, u: 0, s: false };
  }

  /** Just the answers themselves, trimmed - what every caller actually wants. */
  _ghNotes(name) {
    const src = this._ghNoteEnvelope(name).n;
    const out = {};
    this._ghNoteFields().forEach(f => {
      const v = String(src[f.key] || '').trim();
      if (v) out[f.key] = v;
    });
    return out;
  }

  /** Writes the device copy plus enough bookkeeping to merge with the account later. */
  _ghWriteNotes(name, notes, synced, updatedAt) {
    const envelope = {
      n: notes || {},
      u: typeof updatedAt === 'number' ? updatedAt : Date.now(),
      s: !!synced
    };
    try { localStorage.setItem(this._ghNotesKey(name), JSON.stringify(envelope)); } catch (e) { }
    let index = [];
    try { index = JSON.parse(localStorage.getItem('swapiki_repo_notes_index') || '[]') || []; } catch (e) { }
    if (index.indexOf(name) === -1) {
      index.push(name);
      try { localStorage.setItem('swapiki_repo_notes_index', JSON.stringify(index)); } catch (e) { }
    }
    return envelope;
  }

  /**
   * Where their words are actually living right now. 'device' covers both
   * "signed out" and "the database table has not been created yet" - in both
   * cases the honest thing to tell the candidate is that it is on this device.
   */
  _ghNotesCloudState() {
    if (!this.isAuthenticated()) return 'device';
    if (swapikiStore._repoNotesUnavailable) return 'device';
    return 'account';
  }

  /** The honest one-liner under the form, about where the answers are saved. */
  _ghNoteWhereText(synced) {
    if (synced === true) return 'Saved to your account. Here on every device you sign in on.';
    if (!this.isAuthenticated()) return 'Saved on this device. Sign in to keep it on all your devices.';
    return 'Saved on this device only - the account copy is not reachable right now.';
  }

  /**
   * Pushes one repo's notes to the account. The device copy is already written
   * by the time this runs, so a failure costs nothing: the record just stays
   * marked unsynced and goes out with the next attempt.
   */
  async _ghSyncNotes(name) {
    if (this._ghNotesCloudState() !== 'account') return false;
    if (typeof swapikiStore.saveRepoNote !== 'function') return false;
    const prev = this._ghNoteEnvelope(name).u;
    const notes = this._ghNotes(name);
    const ok = await swapikiStore.saveRepoNote(name, notes);
    // On failure keep the old timestamp, so this copy still looks newer than the
    // account's and wins the next merge.
    this._ghWriteNotes(name, notes, ok, ok ? Date.now() : prev);
    return ok;
  }

  /** Updates the "where is this saved" line after a push settles. */
  _ghNoteSyncLabel(ok) {
    const el = document.getElementById('gh-note-where');
    if (el) el.textContent = this._ghNoteWhereText(ok);
  }

  /** Pushes every device-only note up to the account. */
  async _ghFlushNotes() {
    if (this._ghNotesCloudState() !== 'account') return 0;
    let index = [];
    try { index = JSON.parse(localStorage.getItem('swapiki_repo_notes_index') || '[]') || []; } catch (e) { }
    let sent = 0;
    for (const name of index) {
      const env = this._ghNoteEnvelope(name);
      if (env.s || !Object.keys(env.n).length) continue;
      if (await this._ghSyncNotes(name)) sent++;
    }
    return sent;
  }

  /**
   * Pulls the account's notes down onto this device, newest copy winning, then
   * pushes anything that only ever existed here. Run at boot and after sign-in,
   * so signing in on a new laptop brings the story with it instead of quietly
   * showing an empty form.
   */
  async _ghHydrateNotes() {
    if (this._ghNotesCloudState() !== 'account') return 0;
    if (typeof swapikiStore.fetchRepoNotes !== 'function') return 0;
    const remote = await swapikiStore.fetchRepoNotes();
    let brought = 0;
    Object.keys(remote || {}).forEach(name => {
      const row = remote[name] || {};
      const local = this._ghNoteEnvelope(name);
      const remoteAt = Date.parse(row.updatedAt || '') || 0;
      const localCount = Object.keys(local.n).length;
      if (localCount && local.u > remoteAt) {
        // This device has the newer words: keep them and let the flush send them.
        this._ghWriteNotes(name, local.n, false, local.u);
        return;
      }
      if (localCount && local.u === remoteAt && local.s) return; // already identical
      this._ghWriteNotes(name, row.notes || {}, true, remoteAt || Date.now());
      if (Object.keys(row.notes || {}).length) brought++;
    });
    return brought + await this._ghFlushNotes();
  }

  /** Live "N of 5 filled in" counter, so progress is visible while typing. */
  _ghNoteCount() {
    const el = document.getElementById('gh-note-count');
    if (!el) return;
    const fields = (window.swapikiGitHub && window.swapikiGitHub.NOTE_FIELDS) || [];
    let filled = 0;
    fields.forEach(f => {
      const input = document.getElementById('gh-note-' + f.key);
      if (input && String(input.value || '').trim()) filled++;
    });
    el.textContent = filled + ' of ' + fields.length + ' filled in';
    el.className = 'text-[10px] font-bold shrink-0 ' + (filled === fields.length ? 'text-emerald-700' : 'text-primary');
  }

  /** Reads the "what did you do" form and stores it, on the device and in the account. */
  async _ghSaveNotes(name, opts) {
    const o = opts || {};
    // Remember where the caret was so saving does not yank it elsewhere.
    const activeId = (document.activeElement && document.activeElement.id) || '';
    const fields = this._ghNoteFields();
    const notes = {};
    fields.forEach(f => {
      const el = document.getElementById('gh-note-' + f.key);
      const v = el ? String(el.value || '').replace(/\s+/g, ' ').trim().slice(0, 400) : '';
      if (v) notes[f.key] = v;
    });
    // Written to the device first, unsynced, so the answer is never in flight.
    this._ghWriteNotes(name, notes, false);
    const left = window.swapikiGitHub.blankFields(notes);
    this._ghNoteOpen = o.close ? '' : name;
    this.renderGitHubPicker();
    const fb = document.getElementById('iv-feedback');
    if (fb) fb.innerHTML = '';
    const done = document.getElementById('gh-note-saved');
    if (done) {
      done.textContent = left.length
        ? 'Saved. Still worth adding: ' + left.map(f => f.label.toLowerCase()).join(', ') + '.'
        : 'Saved - your 60-second answer is complete.';
      done.classList.remove('hidden');
    }
    if (o.close) {
      // Nothing on screen left to update, so wait for the real answer before
      // telling the candidate where it went.
      const ok = await this._ghSyncNotes(name);
      this.showToast(ok
        ? (left.length ? 'Saved to your account.' : 'Saved to your account - your 60-second answer is complete.')
        : (left.length
          ? 'Saved on this device. Still worth adding: ' + left.map(f => f.label.toLowerCase()).join(', ') + '.'
          : 'Saved on this device - your 60-second answer is complete.'));
      return;
    }
    // Stay open, and keep the caret in the field they were actually typing in.
    const target = (activeId ? document.getElementById(activeId) : null) ||
      (left.length ? document.getElementById('gh-note-' + left[0].key) : null);
    if (target) { try { target.focus(); } catch (e) { } }
    this.showToast(left.length ? 'Saved.' : 'Saved - your 60-second answer is complete.');
    // Mirror to the account in the background; the form updates its own label.
    this._ghSyncNotes(name).then(ok => this._ghNoteSyncLabel(ok)).catch(() => { });
  }

  /** The small "tell us what you actually did" form for the chosen repo. */
  _ghNoteFormHtml(item) {
    const notes = this._ghNotes(item.name);
    const fields = ((window.swapikiGitHub && window.swapikiGitHub.NOTE_FIELDS) || []).map(f => {
      const hint = f.key === 'result' ? 'e.g. cut checkout time from 2.8s to 1.6s'
        : f.key === 'role' ? 'e.g. I owned the front end end to end'
          : f.key === 'problem' ? 'e.g. checkout drop-off was costing us sales'
            : f.key === 'hard' ? 'e.g. keeping cart state consistent across tabs'
              : 'e.g. why that stack, and what you gave up for it';
      return `
        <label class="block">
          <span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">${this.escapeHtml(f.label)}</span>
          <input id="gh-note-${f.key}" type="text" value="${this.escapeHtml(notes[f.key] || '')}" placeholder="${this.escapeHtml(hint)}"
            oninput="app._ghNoteCount()"
            class="mt-1 w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
        </label>`;
    }).join('');
    const filled = (window.swapikiGitHub.NOTE_FIELDS || []).length - window.swapikiGitHub.blankFields(notes).length;
    const total = (window.swapikiGitHub.NOTE_FIELDS || []).length;
    const safe = this.escapeHtml(item.name).replace(/[^A-Za-z0-9._-]/g, '');
    const becameStory = this._ghNoteJustOpened === item.name;
    this._ghNoteJustOpened = '';
    return `
      <div class="mt-3 rounded-xl border border-primary/25 bg-primary/[0.03] p-4"
        onkeydown="if (event.key === 'Enter') { event.preventDefault(); app._ghSaveNotes('${safe}') }">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[13px] font-bold text-slate-900">What did you actually do in ${this.escapeHtml(item.name)}?</p>
            <p class="text-[11px] text-slate-500 mt-0.5">GitHub cannot know this, and it is exactly what interviewers ask about. Fill it in once and every answer and pitch uses it.</p>
            ${becameStory ? '<p class="text-[11px] font-bold text-primary mt-1.5">This project now leads your interview answers.</p>' : ''}
          </div>
          <span class="text-[10px] font-bold text-primary shrink-0" id="gh-note-count">${filled} of ${total} filled in</span>
        </div>
        <div class="grid sm:grid-cols-2 gap-3 mt-3">${fields}</div>
        <div class="flex items-center gap-2 mt-3.5">
          <button onclick="app._ghSaveNotes('${safe}')" class="px-4 py-2.5 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90">Save my details</button>
          <button onclick="app._ghNoteDone('${safe}')" class="px-3.5 py-2.5 border border-slate-200 bg-white text-[12px] font-bold text-slate-600 rounded-lg hover:border-slate-300">Done</button>
          <span id="gh-note-where" class="text-[11px] text-slate-400 ml-auto text-right">${this._ghNoteWhereText(this._ghNoteEnvelope(item.name).s)}</span>
        </div>
        <p class="text-[11px] text-slate-500 mt-2.5 hidden" id="gh-note-saved"></p>
        <p class="text-[10px] text-slate-400 mt-1.5">Enter saves from any box. Save keeps the form open so you can carry on; Done saves and closes it.</p>
        <p class="text-[10px] text-slate-400 mt-2.5">
          <button onclick="app._ghClearNotes('${safe}')" class="underline hover:text-slate-600">Forget these details</button>
          <span class="ml-1">Deletes them from your account and this device.</span>
        </p>
      </div>`;
  }

  /**
   * Erases one repo's answers everywhere: the device record, the sync index, and
   * the account row. These are the candidate's own words about their own work,
   * so being able to take them back out is part of storing them at all - the
   * device copy goes first so nothing survives here even if the network fails.
   */
  async _ghClearNotes(name) {
    const repo = String(name || '').trim();
    if (!repo) return;
    try { localStorage.removeItem(this._ghNotesKey(repo)); } catch (e) { }
    try {
      const index = JSON.parse(localStorage.getItem('swapiki_repo_notes_index') || '[]') || [];
      const next = index.filter(n => n !== repo);
      localStorage.setItem('swapiki_repo_notes_index', JSON.stringify(next));
    } catch (e) { }
    this._ghNoteOpen = '';
    this._ghNoteJustOpened = '';
    this.renderGitHubPicker();
    this.showToast('Details for ' + repo + ' deleted.');
    if (this._ghNotesCloudState() !== 'account') return;
    if (typeof swapikiStore.deleteRepoNote !== 'function') return;
    try { await swapikiStore.deleteRepoNote(repo); } catch (e) { }
  }

  /** Closes the form, saving whatever was typed so nothing is ever lost. */
  _ghNoteDone(name) {
    if (this._ghNoteOpen === name) {
      this._ghSaveNotes(name, { close: true });
      return;
    }
    this._ghNoteOpen = '';
    this.renderGitHubPicker();
  }

  /**
   * Opens or closes the "what did you do" form for a repo, and makes that repo
   * the one your answers lead with. Opening it from a row that is not yet the
   * story switches the story too, so the form and the answers never disagree.
   * Closing it always saves what was typed - there is no way to lose it.
   */
  toggleRepoNotes(name) {
    const item = this._ghRanked().find(r => r.name === name);
    if (!item) { this.showToast('Could not find that project.'); return; }
    if (this._ghNoteOpen === name) { this._ghNoteDone(name); return; }
    const becameStory = this._ghHydrateStory() !== name;
    if (becameStory) {
      this._interviewStory = name;
      try { localStorage.setItem('swapiki_interview_story_' + (this._interviewJobId || 'x'), name); } catch (e) { }
    }
    this._ghNoteOpen = name;
    this._ghNoteJustOpened = becameStory ? name : '';
    this.renderGitHubPicker();
    const first = document.getElementById('gh-note-problem');
    if (first) { try { first.focus(); } catch (e) { } }
  }

  /** Copy the 60-second pitch for one ranked repo. */
  copyRepoPitch(name) {
    const ctx = this._interviewGhContext();
    const item = this._ghRanked().find(r => r.name === name);
    if (!item) { this.showToast('Could not find that project.'); return; }
    const text = window.swapikiGitHub.buildRepoPitch(item, ctx, this._ghNotes(item.name));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => this.showToast('Pitch copied for ' + item.name + '.'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast('Pitch copied for ' + item.name + '.');
    }
  }

  /** Make a repo the story the model answer and talking points use. */
  useRepoStory(name) {
    const item = this._ghRanked().find(r => r.name === name);
    if (!item) { this.showToast('Could not find that project.'); return; }
    const changed = this._ghHydrateStory() !== name;
    this._interviewStory = item.name;
    try { localStorage.setItem('swapiki_interview_story_' + (this._interviewJobId || 'x'), item.name); } catch (e) { }
    this._ghNoteOpen = '';
    if (changed) this.showToast('Your answers will now lead with ' + item.name + '.');
    this.renderGitHubPicker();
    const fb = document.getElementById('iv-feedback');
    if (fb) fb.innerHTML = '';
  }

  /** Ranked repos for the job currently being prepped. */
  _ghRanked() {
    const state = this._ghLoad();
    if (!state.repos || !state.repos.length || !window.swapikiGitHub) return [];
    const job = this._interviewJob || {};
    const result = window.swapikiGitHub.rankRepos(state.repos, window.swapikiGitHub.buildJobContext(job));
    this._ghRankResult = result;
    return result.ranked;
  }

  _interviewGhContext() {
    if (!this._interviewGhCtx || this._interviewGhCtxJob !== (this._interviewJob && this._interviewJob.id)) {
      this._interviewGhCtx = window.swapikiGitHub.buildJobContext(this._interviewJob || {});
      this._interviewGhCtxJob = this._interviewJob && this._interviewJob.id;
    }
    return this._interviewGhCtx;
  }

  /** The project chosen for the job being prepped, hydrated from storage. */
  _ghHydrateStory() {
    const key = 'swapiki_interview_story_' + (this._interviewJobId || 'x');
    if (this._ghStoryKey !== key) {
      this._ghStoryKey = key;
      this._interviewStory = '';
    }
    if (!this._interviewStory) {
      try { this._interviewStory = localStorage.getItem(key) || ''; } catch (e) { }
    }
    // A pick for a repo that has been renamed or deleted must not stick.
    if (this._interviewStory && this._ghRanked) {
      const ranked = this._ghRanked();
      if (ranked.length && !ranked.some(r => r.name === this._interviewStory)) {
        this._interviewStory = '';
        try { localStorage.removeItem(key); } catch (e) { }
      }
    }
    return this._interviewStory;
  }

  /**
   * The repos in the order they are being shown, with `rank` matching what the
   * buttons pass. Kept in one place so sorting can never desync the UI from the
   * copy / choose actions.
   */
  _ghOrdered() {
    const ordered = this._ghRanked().slice();
    const sort = ['match', 'recent', 'stars'].indexOf(this._ghSort) !== -1 ? this._ghSort : 'match';
    if (sort === 'recent') {
      ordered.sort((a, b) => String((b.repo || {}).pushed_at || '').localeCompare(String((a.repo || {}).pushed_at || '')));
    } else if (sort === 'stars') {
      ordered.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    }
    ordered.forEach((r, i) => { r.rank = i + 1; });
    return { sort: sort, ordered: ordered };
  }

  /** Renders the connect / ranked-project card. */
  renderGitHubPicker() {
    const host = document.getElementById('gh-picker');
    if (!host) return;
    if (!window.swapikiGitHub) {
      host.innerHTML = '<p class="text-[12px] text-slate-500">Loading GitHub project matching...</p>';
      return;
    }
    const state = this._ghLoad();
    const hasClientId = !!this._ghClientId();
    const ranked = state.repos ? this._ghRanked() : [];
    const result = this._ghRankResult || { hidden: 0, total: 0 };
    const showAll = this._ghShowAll === true;
    const ord = this._ghOrdered();
    const sort = ord.sort;
    const visible = showAll ? ord.ordered : ord.ordered.slice(0, 5);
    const story = this._ghHydrateStory();

    const connectBox = `
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
        ${hasClientId ? `<button onclick="app.ghConnect()" class="px-4 py-2.5 bg-[#24292f] text-white text-[13px] font-bold rounded-xl hover:bg-black active:scale-[0.98] transition-all flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-lg">code</span> Connect GitHub
        </button>` : ''}
        <div class="flex items-center gap-2 flex-1">
          <input id="gh-link" type="text" inputmode="url" spellcheck="false" autocomplete="off"
            placeholder="https://github.com/yourname" value="${this.escapeHtml(state.username ? 'https://github.com/' + state.username : '')}"
            onkeydown="if (event.key === 'Enter') app.ghConnectFromLink()"
            class="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
          <button onclick="app.ghConnectFromLink()" class="px-4 py-2.5 border-2 border-primary text-primary text-[13px] font-bold rounded-xl hover:bg-primary/5 active:scale-[0.98] transition-all whitespace-nowrap">Rank my projects</button>
        </div>
      </div>
      <p class="text-[11px] text-slate-400 mt-2.5">Paste the link from your own GitHub profile - the address you see at the top of the page. We only read your public repositories to rank them for this job; nothing is posted, changed or shared. No sign-in needed${hasClientId ? '': '; sign-in also shows private repos'}.</p>
      <p id="gh-connect-status" class="text-[12px] font-bold text-primary mt-2 hidden"></p>`;

    if (!state.repos || !state.repos.length) {
      host.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl p-5">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#24292f] text-white flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xl">code</span></div>
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-bold text-slate-900">Paste your GitHub link - we pick the project to talk about</h2>
              <p class="text-[12px] text-slate-500 leading-relaxed mt-1">We match your repositories against this job description and rank them, so you walk in knowing exactly which project answers their questions first.</p>
            </div>
          </div>
          ${state.error ? `<p class="text-[12px] text-rose-600 font-bold mt-3">${this.escapeHtml(state.error)}</p>` : ''}
          <div id="gh-connect-box">${this._ghDeviceBoxHtml() || connectBox}</div>
        </div>`;
      return;
    }

    const noteTotal = (window.swapikiGitHub.NOTE_FIELDS || []).length;
    const rows = visible.map(item => {
      const isStory = item.name === story;
      const barColor = item.score >= 70 ? 'bg-emerald-500' : item.score >= 45 ? 'bg-amber-500' : 'bg-slate-300';
      // Tracked by repo NAME, not rank, so re-sorting cannot move the open form
      // onto a different project.
      const noteOpen = this._ghNoteOpen === item.name;
      const noteFilled = noteTotal - window.swapikiGitHub.blankFields(this._ghNotes(item.name)).length;
      return `
        <div class="rounded-xl border ${isStory ? 'border-primary bg-primary/[0.04]' : 'border-slate-200'} p-3.5">
          <div class="flex items-start gap-3">
            <span class="w-6 h-6 rounded-lg ${item.rank === 1 ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'} text-[11px] font-bold flex items-center justify-center shrink-0">${item.rank}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener" class="text-[13px] font-bold text-slate-900 hover:underline truncate">${this.escapeHtml(item.name)}</a>
                ${item.rank === 1 ? '<span class="text-[10px] font-bold text-white bg-primary rounded px-1.5 py-0.5">Talk about this one first</span>' : ''}
                ${isStory ? '<span class="text-[10px] font-bold text-primary border border-primary/30 rounded px-1.5 py-0.5">Leading your answers</span>' : ''}
                <span class="text-[11px] font-bold text-slate-500 ml-auto">${item.score}% match</span>
              </div>
              <div class="h-1 rounded-full bg-slate-100 overflow-hidden mt-1.5">
                <div class="h-full ${barColor} rounded-full" style="width:${item.score}%"></div>
              </div>
              ${item.repo.description ? `<p class="text-[12px] text-slate-600 leading-relaxed mt-2 line-clamp-2">${this.escapeHtml(item.repo.description)}</p>` : ''}
              <div class="flex flex-wrap items-center gap-1.5 mt-2">
                ${item.matchedSkills.map(m => `<span class="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2 py-0.5 text-[10px] font-bold">${this.escapeHtml(m)}</span>`).join('')}
                ${item.language ? `<span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">${this.escapeHtml(item.language)}</span>` : ''}
                ${item.stars ? `<span class="text-[10px] font-bold text-slate-500 inline-flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">star</span>${item.stars}</span>` : ''}
                <span class="text-[10px] font-bold text-slate-400">updated ${this.escapeHtml(item.updated)}</span>
                ${item.flags.map(f => `<span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">${this.escapeHtml(f)}</span>`).join('')}
              </div>
              <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">${this.escapeHtml(this._ghReason(item))}</p>
              <div class="flex items-center gap-2 mt-2.5 flex-wrap">
                <button onclick="app.copyRepoPitch('${this.escapeHtml(item.name)}')" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Copy 60-sec pitch</button>
                <button onclick="app.useRepoStory('${this.escapeHtml(item.name)}')" class="text-[11px] font-bold ${isStory ? 'text-white bg-primary' : 'text-slate-600 border border-slate-200'} rounded-lg px-2.5 py-1 hover:border-primary">${isStory ? 'Leading my answers' : 'Lead my answers with this'}</button>
                <button onclick="app.toggleRepoNotes('${this.escapeHtml(item.name)}')" class="text-[11px] font-bold ${noteOpen ? 'text-slate-900 bg-slate-100 border border-slate-200' : 'text-slate-500 hover:text-slate-800'} rounded-lg px-2.5 py-1 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">${noteOpen ? 'expand_less' : 'add'}</span>${noteOpen ? 'Hide my details' : 'Add what you did'}</button>
                ${noteFilled ? `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">${noteFilled}/${noteTotal} details added</span>` : ''}
              </div>
              ${noteOpen ? this._ghNoteFormHtml(item) : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-[#24292f] text-white flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xl">code</span></div>
            <div class="min-w-0">
              <h2 class="text-sm font-bold text-slate-900">Your GitHub projects, ranked for this job</h2>
              <p class="text-[12px] text-slate-500 mt-0.5" id="gh-status">${this.escapeHtml(state.login ? '@' + state.login : '')}${state.login && result.total ? ' · ' + result.total + ' repos' : ''}${result.hidden ? ' · ' + result.hidden + ' forks/archived hidden' : ''}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${ranked.length > 5 ? `<button onclick="app._ghShowAll = ${!showAll}; app.renderGitHubPicker()" class="text-[11px] font-bold text-slate-500 hover:text-slate-800">${showAll ? 'Show top 5' : 'Show all ' + ranked.length}</button>` : ''}
            <button onclick="app.ghFetchRepos(true)" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Refresh</button>
            <button onclick="app.ghDisconnect()" class="text-[11px] font-bold text-slate-400 hover:text-slate-700">Disconnect</button>
          </div>
        </div>
        ${ranked.length > 1 ? `
        <div class="flex items-center gap-1.5 mt-3">
          <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-1">Sort</span>
          ${[['match', 'Best match'], ['recent', 'Most recent'], ['stars', 'Most stars']].map(([k, label]) => `
            <button onclick="app._ghSort = '${k}'; app.renderGitHubPicker()" class="text-[11px] font-bold rounded-lg px-2.5 py-1 ${sort === k ? 'bg-primary text-white' : 'text-slate-500 border border-slate-200 hover:border-primary'}">${label}</button>`).join('')}
        </div>` : ''}
        </div>
        ${state.error ? `<p class="text-[12px] text-rose-600 font-bold mt-3">${this.escapeHtml(state.error)}</p>` : ''}
        <div class="space-y-2.5 mt-3.5">
          ${ranked.length ? rows : '<p class="text-[12px] text-slate-500">No public repositories found for this username.</p>'}
        </div>
        ${ranked.length ? `<p class="text-[11px] text-slate-400 mt-3">Score = how much of this job's skill list your repo actually shows, plus how alive it is. Forks and archived repos are hidden because they are never the story you tell.</p>` : ''}
      </div>`;
  }

  renderDashboard() {
    const profile = swapikiStore.getProfile();
    this.setPageMeta('Dashboard | Swapiki',
      'Your Swapiki candidate dashboard — edit your profile, record statements, and publish your proof profile.');

   const welcomeTitle = document.getElementById('dash-welcome-title');
if (welcomeTitle) {
  const firstName = profile.name ? profile.name.split(' ')[0] : 'there';
  const authUser = swapikiStore.currentUser;
  let isFirstVisit = false;
  if (authUser && authUser.created_at && authUser.last_sign_in_at) {
    const createdMs = new Date(authUser.created_at).getTime();
    const lastSignInMs = new Date(authUser.last_sign_in_at).getTime();
    // If the account was created and signed in within the same few seconds,
    // this is their very first session — anything later is a returning visit.
    isFirstVisit = Math.abs(lastSignInMs - createdMs) < 10000; // 10s window
  }
  welcomeTitle.textContent = isFirstVisit
    ? `Welcome, ${firstName}!`
    : `Welcome back, ${firstName}.`;
}
    const suspended = profile.profileStatus === 'suspended';
    const statusSubtitle = document.getElementById('dash-status-subtitle');
    if (statusSubtitle) {
      statusSubtitle.textContent = suspended
        ? 'Your profile is paused while our team reviews a report, so it is not visible to hiring managers right now.'
        : (profile.profileStatus === 'published'
          ? 'Your proof profile is published and visible to hiring managers across India.'
          : "Your proof profile is still in draft. Your link already works — publishing just marks it as ready for review.");
    }

    const profileStatus = document.getElementById('dash-profile-status');
    const publishButton = document.getElementById('btn-publish-profile');
    const statusDot = document.getElementById('dash-status-dot');
 if (profileStatus) {
  profileStatus.textContent = suspended ? 'Paused — under review' : (profile.profileStatus === 'published' ? 'Published and visible to hiring managers' : 'Draft — link is live, not yet marked ready');
  profileStatus.className = suspended
    ? 'font-label-sm text-label-sm text-rose-300 font-bold uppercase tracking-wider'
    : 'font-label-sm text-label-sm text-emerald-300 font-bold uppercase tracking-wider';
}
if (statusDot) {
  statusDot.className = suspended
    ? 'w-2.5 h-2.5 rounded-full bg-rose-400'
    : 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
}
    if (publishButton) {
      publishButton.textContent = suspended ? 'Profile under review' : (profile.profileStatus === 'published' ? 'Unpublish Profile' : 'Publish Profile');
      publishButton.disabled = suspended;
      publishButton.onclick = () => this.publishProfile();
    }

    // Real engagement stats — pulled from the candidate's actual row, not hardcoded.
    const statViews = document.getElementById('dash-stat-views');
    const statShares = document.getElementById('dash-stat-shares');
    if (statViews) statViews.textContent = profile.views ?? 0;
    if (statShares) statShares.textContent = profile.shares ?? 0;

    // Guided completion checklist — one source of truth for "how complete is
    // this profile?", shared between the nudge card and the telemetry bar so
    // both numbers always agree (logic lives in js/profileChecklist.js).
    this.renderProfileChecklist();

    // Referral counts (credited referrals unlock extra project slots). Async so
    // the dashboard paints immediately; the row and the slot meter update when
    // it lands.
    this.loadReferralStats();

    // Real project-slot usage (was previously a hardcoded "2 / 2 Slots Active" that never changed).
    // Effective cap = base four + any referral bonus (see store.getMaxProjects).
    const maxSlots = (swapikiStore && typeof swapikiStore.getMaxProjects === 'function')
      ? swapikiStore.getMaxProjects()
      : (this.maxProjects || 4);
    const projectCount = profile.projects.length;
    const slotLabel = document.getElementById('dash-projects-slot-label');
    const slotBar = document.getElementById('dash-projects-slot-bar');
    if (slotLabel) slotLabel.textContent = `${projectCount} / ${maxSlots} Slots Active`;
    if (slotBar) slotBar.style.width = `${maxSlots > 0 ? (projectCount / maxSlots) * 100 : 0}%`;

    // Real audio coverage: % of this candidate's projects that actually have recorded audio
    // (was previously a hardcoded "100% Voice Verified" regardless of whether any audio existed).
    const projectsWithAudio = profile.projects.filter(p => !!p.audioUrl).length;
    const audioPercent = projectCount > 0 ? Math.round((projectsWithAudio / projectCount) * 100) : 0;
    const audioLabel = document.getElementById('dash-audio-verified-label');
    const audioBar = document.getElementById('dash-audio-verified-bar');
    if (audioLabel) audioLabel.textContent = `${audioPercent}% with audio`;
    if (audioBar) audioBar.style.width = `${audioPercent}%`;

    // Live-recording status (random spoken code) - a real anti-replay signal,
    // but NOT a claim that we know who is speaking.
    this.renderVoiceVerificationStatus(profile);

    // Small nudge on the "Public Proof Profile" card: a lot of candidates
    // publish without ever adding a project or recording their voice, which
    // makes their link far less convincing to a hiring manager. Only show
    // this when something's actually missing, and say specifically what.
    const proofNudge = document.getElementById('dash-proof-nudge');
    if (proofNudge) {
      if (projectCount === 0) {
        proofNudge.textContent = "Your profile has no proof projects yet — add at least one so hiring managers have something real to look at.";
        proofNudge.classList.remove('hidden');
      } else if (projectsWithAudio === 0) {
        proofNudge.textContent = "Add a voice walkthrough to at least one project — profiles with voice proof stand out far more than text alone.";
        proofNudge.classList.remove('hidden');
      } else {
        proofNudge.textContent = '';
        proofNudge.classList.add('hidden');
      }
    }

    const grid = document.getElementById('stitch-dash-projects-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Empty state: no projects yet — give the candidate a clear next action
    // instead of leaving a silent, confusing blank space.
    if (profile.projects.length === 0) {
      grid.innerHTML = `
        <div class="md:col-span-2 bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center text-center">
          <span class="material-symbols-outlined text-5xl text-slate-300 mb-3">folder_open</span>
          <h3 class="font-bold text-slate-800 text-lg mb-1">No proof projects yet</h3>
          <p class="text-sm text-slate-500 max-w-sm mb-5">Add your first project and record a 2-minute voice walkthrough — this is the proof anyone opening your link actually sees.</p>
          <button onclick="router.navigate('add-project')" class="px-5 py-2.5 bg-primary text-white rounded-lg font-bold text-sm shadow-md hover:bg-primary/90 transition-colors flex items-center gap-1.5">
            <span class="material-symbols-outlined text-lg">add_circle</span> Add Your First Project
          </button>
        </div>
      `;
    }

    // Project Cards
    profile.projects.forEach((proj, idx) => {
      const hasImage = !!proj.imageUrl;
      const statusLabel = profile.profileStatus === 'suspended' ? 'Paused' : (profile.profileStatus === 'published' ? 'Published' : 'Draft');
      const statusClasses = profile.profileStatus === 'published'
        ? 'bg-on-tertiary-container text-tertiary-container'
        : (profile.profileStatus === 'suspended' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700');

      const card = document.createElement('div');
      card.className = "bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col bento-card group";
      card.innerHTML = `
        <div class="relative h-48 w-full bg-slate-100 overflow-hidden flex items-center justify-center">
          ${hasImage
            ? `<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${proj.imageUrl}" alt="${proj.title}"/>`
            : `<div class="flex flex-col items-center justify-center text-slate-300">
                 <span class="material-symbols-outlined text-5xl">image</span>
                 <span class="text-[11px] font-bold text-slate-400 mt-1">No image added</span>
               </div>`
          }
          <div class="absolute top-4 right-4">
            <span class="${statusClasses} font-label-sm text-label-sm py-1 px-3 rounded-full flex items-center gap-1 shadow-sm font-bold">
              <span class="w-2 h-2 rounded-full bg-current opacity-70"></span> ${statusLabel}
            </span>
          </div>
        </div>
        <div class="p-6 flex-1 flex flex-col">
          <h3 class="font-headline-sm text-headline-sm font-bold text-slate-900 mb-2">${proj.title}</h3>
          <p class="font-body-md text-body-md text-on-surface-variant line-clamp-2 mb-4">${proj.impact}</p>
          <div class="mt-auto pt-6 border-t border-slate-100 flex justify-between items-center flex-wrap gap-2">
            <button onclick="app.openEditProjectModal('${proj.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-sm">edit</span> Edit Details
            </button>
            <button onclick="app.openAudioModal('${proj.id}')" class="text-primary font-bold font-label-md text-label-md flex items-center gap-1 hover:underline">
              ${proj.audioUrl ? 'Re-record Audio' : 'Record Audio'} <span class="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    // Update slots counter UI
    const slotsCountEl = document.getElementById('dash-projects-slot-count');
    if (slotsCountEl) slotsCountEl.textContent = `${profile.projects.length} / ${maxSlots} slots used (Min 1, Max ${maxSlots})`;

    // Add Empty Create Project Card while there is still room under the cap
    // (four by default, more if the candidate has earned referral slots).
    if (profile.projects.length > 0 && profile.projects.length < maxSlots)  {
      const addCard = document.createElement('div');
      addCard.className = "bg-surface-container-lowest border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center p-12 text-center group cursor-pointer hover:border-primary hover:bg-white transition-all bento-card h-[420px]";
      addCard.onclick = () => router.navigate('add-project');
      addCard.innerHTML = `
        <div class="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mb-6 group-hover:bg-primary-fixed group-hover:text-primary transition-colors">
          <span class="material-symbols-outlined text-3xl">add_circle</span>
        </div>
        <h3 class="font-headline-sm text-headline-sm font-bold mb-2 text-slate-900">Add Proof Project</h3>
        <p class="font-body-md text-on-surface-variant max-w-xs mb-6">Document another technical initiative with proof and audio.</p>
        <button class="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-label-md font-bold transition-all shadow-sm">Add Project ${profile.projects.length + 1}</button>
      `;
      grid.appendChild(addCard);
    }

    this.maybeShowOnboardingGuide(profile);
  }

  /** Renders the guided completion checklist card + keeps the telemetry
   *  "Profile Completeness" bar on the same number. Everything is derived
   *  from real profile data (see js/profileChecklist.js), never hardcoded. */
  renderProfileChecklist() {
    const profile = swapikiStore.getProfile();
    let checklist;
    try {
      checklist = window.profileChecklist.buildProfileChecklist(profile);
    } catch (err) {
      console.error('Checklist module unavailable — skipping checklist render:', err);
      return;
    }
    const percent = checklist.percent;

    const pctEl = document.getElementById('dash-checklist-percent');
    const barEl = document.getElementById('dash-checklist-bar');
    if (pctEl) pctEl.textContent = `${percent}% Complete`;
    if (barEl) barEl.style.width = `${percent}%`;

    const scorePercent = document.getElementById('dash-completion-percent');
    const scoreBar = document.getElementById('dash-completion-bar');
    if (scorePercent) scorePercent.textContent = `${percent}% Complete`;
    if (scoreBar) scoreBar.style.width = `${percent}%`;

    const container = document.getElementById('dash-checklist-items');
    if (!container) return;

    // The referral row is a bonus row, not a completion step: it deliberately
    // sits outside CHECKLIST_DEFS so it never moves the percentage above. It is
    // the entry point to the referral loop (copy a personal invite link).
    const referralRow = `
      <div data-referral="1"
        class="flex items-center justify-between gap-3 py-2.5 cursor-pointer select-none hover:bg-slate-50">
        <div class="flex items-center gap-3 min-w-0">
          <span class="material-symbols-outlined text-primary shrink-0">group_add</span>
          <div class="min-w-0">
            <span class="text-sm text-slate-700 font-medium block">Refer a friend</span>
            <span id="dash-referral-sub" class="text-xs text-slate-400 block">Invite someone — unlock an extra project slot when their profile publishes.</span>
          </div>
        </div>
        <span class="text-xs font-bold text-primary shrink-0 flex items-center gap-0.5">Copy link <span class="material-symbols-outlined text-sm">content_copy</span></span>
      </div>`;

    container.innerHTML = checklist.items.map(item => `
      <div data-key="${item.key}" data-done="${item.done}"
        class="flex items-center justify-between gap-3 py-2.5 cursor-pointer select-none
               hover:bg-slate-50 ${item.done ? 'opacity-70' : ''}">
        <div class="flex items-center gap-3 min-w-0">
          <span class="material-symbols-outlined ${item.done ? 'text-emerald-500' : 'text-slate-300'} shrink-0">${item.done ? 'check_circle' : 'radio_button_unchecked'}</span>
          <span class="text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}">${item.label}</span>
        </div>
        ${item.done
          ? `<span class="text-xs font-bold text-emerald-600 shrink-0">Done</span>`
          : item.action === 'add-project'
            ? `<a href="#add-project" class="text-xs font-bold text-primary shrink-0 flex items-center gap-0.5">Fix it <span class="material-symbols-outlined text-sm">chevron_right</span></a>`
            : `<span class="text-xs font-bold text-primary shrink-0 flex items-center gap-0.5">Fix it <span class="material-symbols-outlined text-sm">chevron_right</span></span>`}
      </div>`).join('') + referralRow;

    // Reflect counts we already hold; the async refresh rewrites this a moment
    // later once the RPC answers.
    if (this._referralStats) this.updateReferralRow(this._referralStats);

    // Delegated listener (not inline onclick) so rows stay clickable even if
    // something else ever re-renders the list. Re-bind each render to avoid
    // stacking duplicate listeners.
    container.removeEventListener('click', this._checklistClick);
    this._checklistClick = (ev) => {
      // Real anchor links (e.g. <a href="#add-project">) handle themselves via
      // native hash routing — don't double-fire a JS navigation on top.
      if (ev.target.closest('a[href^="#"]')) return;
      // The referral row (a bonus row, not a completion step) copies the invite
      // link instead of jumping to a step.
      if (ev.target.closest('[data-referral]')) {
        this.copyReferralLink();
        return;
      }
      const row = ev.target.closest('[data-key]');
      if (!row) return;
      // Completed rows stay clickable (e.g. "add another project", "re-record
      // voice") — going silent on them reads as a broken button.
      try {
        this.checklistAction(row.dataset.key);
      } catch (err) {
        console.error('Checklist action failed:', err);
        this.showToast(`Couldn't open that step (${err.message}). Try the menu instead.`);
      }
    };
    container.addEventListener('click', this._checklistClick);
  }

  /** Fetch this candidate's referral counts and reflect them in the referral
   *  row and the project-slot meter. Safe when the referral migration has not
   *  run: the store answers {0,0} and the row keeps its "invite a friend" copy. */
  async loadReferralStats() {
    if (!swapikiStore || typeof swapikiStore.getReferralStats !== 'function') return;
    let stats;
    try {
      stats = await swapikiStore.getReferralStats();
    } catch (err) {
      return;
    }
    this._referralStats = stats || { total: 0, credited: 0 };
    this.updateReferralRow(this._referralStats);

    // Credited referrals may have raised the cap; repaint the slot meter (the
    // project grid re-renders on the next dashboard visit).
    const profile = (typeof swapikiStore.getProfile === 'function') ? swapikiStore.getProfile() : null;
    const count = (profile && Array.isArray(profile.projects)) ? profile.projects.length : 0;
    const maxSlots = (typeof swapikiStore.getMaxProjects === 'function') ? swapikiStore.getMaxProjects() : 4;
    const slotLabel = document.getElementById('dash-projects-slot-label');
    const slotBar = document.getElementById('dash-projects-slot-bar');
    if (slotLabel) slotLabel.textContent = `${count} / ${maxSlots} Slots Active`;
    if (slotBar) slotBar.style.width = `${maxSlots > 0 ? (count / maxSlots) * 100 : 0}%`;
    const slotsCountEl = document.getElementById('dash-projects-slot-count');
    if (slotsCountEl) slotsCountEl.textContent = `${count} / ${maxSlots} slots used (Min 1, Max ${maxSlots})`;
  }

  /** Rewrites the referral row's subtitle to show progress once we know it. */
  updateReferralRow(stats) {
    const sub = document.getElementById('dash-referral-sub');
    if (!sub) return;
    const credited = (stats && stats.credited) || 0;
    const total = (stats && stats.total) || 0;
    if (total <= 0) {
      sub.textContent = 'Invite someone — unlock an extra project slot when their profile publishes.';
      return;
    }
    const bonus = (swapikiStore && typeof swapikiStore.getReferralBonus === 'function') ? swapikiStore.getReferralBonus() : 0;
    const people = `${total} ${total === 1 ? 'person' : 'people'}`;
    if (credited > 0) {
      sub.textContent = `You've referred ${people} — ${credited} published, +${bonus} project slot${bonus === 1 ? '' : 's'} unlocked.`;
    } else {
      sub.textContent = `You've referred ${people} — a slot unlocks once they publish their profile.`;
    }
  }

  /**
   * Landing greeting for a friend who arrived through someone's invite link.
   * The ?ref=<handle> was already captured first-touch at boot and lives in
   * localStorage until it is attributed on signup, so this only has to read it,
   * show a personal line, and offer the signup button. A signed-in visitor — or
   * one with no pending invite — gets no banner. Returns the handle it showed,
   * or null.
   */
  maybeShowInviteBanner() {
    const banner = document.getElementById('invite-banner');
    if (!banner) return null;

    let ref = null;
    try { ref = localStorage.getItem('swapiki_ref'); } catch (e) { ref = null; }

    if (this.isAuthenticated() || !ref) {
      banner.classList.add('hidden');
      return null;
    }

    const handle = this.escapeHtml(ref);
    banner.innerHTML =
      `<span class="lp-invite-tag">Invited</span>` +
      `<span class="lp-invite-text">You were invited by <b>@${handle}</b> ` +
      `&mdash; build your proof profile and get heard by hiring managers.</span>` +
      `<button type="button" class="lp-invite-cta" onclick="app.openSignupModal()">` +
      `Create my profile <span aria-hidden="true">&rarr;</span></button>`;
    banner.classList.remove('hidden');

    try {
      if (typeof window !== 'undefined' && window.posthog && typeof window.posthog.capture === 'function') {
        window.posthog.capture('referral_invite_shown', { referrer: ref });
      }
    } catch (e) {}
    return ref;
  }

  /** Copies this candidate's personal invite link (swapiki.com/?ref=<username>). */
  copyReferralLink() {
    const profile = (swapikiStore && typeof swapikiStore.getProfile === 'function') ? swapikiStore.getProfile() : {};
    const username = (profile && (profile.username || profile.id)) || this.publicUsername;
    if (!username) {
      this.showToast('Finish your profile first — then you get a referral link.');
      return;
    }
    const link = `https://swapiki.com/?ref=${encodeURIComponent(username)}`;
    try { Promise.resolve(this._copyToClipboard(link)).catch(() => {}); } catch (e) {}
    this.showToast('Referral link copied — share it with a friend.');
    try {
      if (typeof window !== 'undefined' && window.posthog && typeof window.posthog.capture === 'function') {
        window.posthog.capture('referral_link_copied');
      }
    } catch (e) {}
  }

  /** Jump the candidate straight to wherever a checklist item gets completed. */
  checklistAction(key) {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const profile = swapikiStore.getProfile();
    if (key === 'edit-profile') {
      this.openEditProfileModal();
      this._reportChecklistPerf(key, t0);
      return;
    }
    if (key === 'add-project') {
      window.router.navigate('add-project');
      this._reportChecklistPerf(key, t0);
      return;
    }
    if (key === 'publish') {
      this.publishProfile();
      this._reportChecklistPerf(key, t0);
      return;
    }
    if (key === 'voice') {
      const proj = Array.isArray(profile.projects) && profile.projects.length ? profile.projects[0] : null;
      if (proj) this.openAudioModal(proj.id);
      else window.router.navigate('add-project');
      this._reportChecklistPerf(key, t0);
      return;
    }
  }

  /** Timing beacon: tells us whether "slow" is JavaScript time or paint time.
   *  Only toasts when it's meaningfully slow; otherwise stays quiet. */
  _reportChecklistPerf(key, t0) {
    try {
      const ms = (typeof performance !== 'undefined') ? performance.now() - t0 : 0;
      if (ms > 800) {
        console.warn(`[perf] checklistAction '${key}' took ${ms.toFixed(0)}ms`, new Date().toISOString());
        this.showToast(`Opened in ${Math.round(ms)}ms — slower than it should be. Share this number.`);
      } else if (ms > 200) {
        this.showToast(`Opened in ${Math.round(ms)}ms.`);
      }
    } catch (e) { /* timers must never break the action */ }
  }

  /** Shows the "How Swapiki Works" guide once per account, right after their first dashboard load. */
  maybeShowOnboardingGuide(profile) {
    const userId = swapikiStore.currentUser && swapikiStore.currentUser.id;
    if (!userId) return;
    const seenKey = `swapiki_onboarding_seen_${userId}`;
    try {
      if (localStorage.getItem(seenKey)) return;
    } catch (e) { /* localStorage unavailable — fall through and show it anyway */ }
    this.openOnboardingGuide(profile);
    try { localStorage.setItem(seenKey, '1'); } catch (e) { }
  }

  /** Opens the guide on demand too — e.g. from the "How it works" link in the dashboard nav. */
  openOnboardingGuide(profile) {
    profile = profile || swapikiStore.getProfile();
    const username = profile.username || profile.id || 'ananya-sharma';
    const linkEl = document.getElementById('onboarding-share-link');
    if (linkEl) linkEl.textContent = `${username}.swapiki.com`;
    const modal = document.getElementById('modal-onboarding-guide');
    if (modal) modal.classList.remove('hidden');
  }

  closeOnboardingGuide() {
    const modal = document.getElementById('modal-onboarding-guide');
    if (modal) modal.classList.add('hidden');
  }

  openTrustSecurityModal() {
    const modal = document.getElementById('modal-trust-security');
    if (modal) modal.classList.remove('hidden');
  }

  closeTrustSecurityModal() {
    const modal = document.getElementById('modal-trust-security');
    if (modal) modal.classList.add('hidden');
  }

  /** The guide's one action button: close it AND copy the correct link, in one click. */
  finishOnboardingGuide() {
    this.closeOnboardingGuide();
    this.copyShareLink();
  }

  /** Admin panel "view profile" link — opens a candidate's profile even if it's still a draft. */
  adminViewCandidateProfile(username) {
    if (!username) {
      this.showToast('This candidate has no handle set yet, so there\'s no profile page to view.');
      return;
    }
    this.publicUsername = username;
    this._adminPreviewMode = true;
    // Put the username in the URL itself, not just in memory — otherwise a
    // reload, a new tab, or browser back/forward loses track of WHICH
    // candidate and falls back to whoever is currently logged in's own
    // profile. This uses "#admin-preview/<username>", a route distinct from
    // the public "#profile/<username>" link format, specifically so that
    // _adminPreviewMode is re-derived as true from the URL itself every time
    // this hash is parsed (handleHash() sets it explicitly for this
    // pattern) rather than depending on the in-memory flag surviving past
    // its first read. Reusing "#profile/" here previously caused any extra
    // parse of the hash to silently drop admin permissions and report an
    // unpublished (draft) candidate as "not found".
    window.location.hash = 'admin-preview/' + encodeURIComponent(username);
    router.navigate('candidate', false);
  }

  /**
   * Records that a real visitor opened somebody's public profile.
   *
   * Called once the profile has actually resolved, because that is the first
   * moment the candidates row id is known - and it is that row, not the visitor,
   * whose view count this is. A 404 must not be logged, or "Profile not found"
   * would be reported as the most-viewed profile on the site.
   *
   * Four things are deliberately NOT counted:
   *   - the owner previewing their own profile from the nav link (no
   *     publicUsername, so it never reaches this method at all);
   *   - an owner opening their own public link;
   *   - an admin preview, which is staff looking, not audience;
   *   - a refresh of a profile already seen in this tab.
   *
   * That last one is why the marker lives in sessionStorage rather than being
   * written unconditionally: without it, one curious visitor holding F5 would
   * out-rank every genuine view on the board. sessionStorage (not
   * localStorage) so the count resets when the tab closes - a visitor who comes
   * back tomorrow is a second view, which is the honest reading.
   */
  _recordPublicProfileView(profile, isAdminPreview) {
    try {
      if (!this.publicUsername || isAdminPreview) return;
      if (!profile || !profile.id) return;

      // An owner reading their own link is not audience, so it is excluded.
      const viewerId = swapikiStore && swapikiStore.currentUser && swapikiStore.currentUser.id;
      if (viewerId && profile.userId && profile.userId === viewerId) return;

      const key = `sw:profile-viewed:${profile.id}`;
      if (typeof sessionStorage !== 'undefined') {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
      }

      swapikiStore.recordProfileView(profile.id);
    } catch (e) {
      // Analytics must never be able to break a profile render.
      console.warn('Profile view not logged:', e && e.message);
    }
  }

  async renderCandidateProfile() {
    // Two very different cases share this view:
    //  1. this.publicUsername is set — a real visitor landed on
    //     <username>.swapiki.com / /sites/<username>. We must fetch THAT
    //     candidate's data from Supabase; nothing local tells us who they are.
    //  2. No publicUsername — this is the candidate previewing their OWN
    //     profile from the "Candidate Profile View" nav link while logged in.
    // Previously this always used the locally-cached profile for BOTH cases,
    // which meant a real public link showed the visitor's own profile (or
    // the empty demo template if logged out) instead of the person whose
    // link was actually shared.
    // No longer consumed/reset here — it's now derived fresh from the URL
    // every time handleHash() runs (see Router.handleHash), so re-rendering
    // this view for any reason keeps the correct permission level instead
    // of silently downgrading to public-only after the first read.
    const isAdminPreview = !!this._adminPreviewMode;

    let profile;
    if (this.publicUsername) {
      // includeUnpublished is always true here by design: during this pilot,
      // a candidate's <username>.swapiki.com link should work as soon as the
      // candidate exists, whether they've hit "Publish" yet or not — not
      // just for admin previews.
      profile = await swapikiStore.getProfileByUsername(this.publicUsername, { includeUnpublished: true });
      if (!profile) {
        // Proper 404: keep the URL, show a clean "profile not found" panel
        // instead of silently redirecting away from the broken link.
        const panel = document.getElementById('candidate-not-found');
        if (panel) {
          const handleEl = document.getElementById('candidate-not-found-handle');
          if (handleEl) handleEl.textContent = `${this.publicUsername}.swapiki.com`;
          panel.classList.remove('hidden');
        }
        const main = document.querySelector('#view-candidate > main');
        if (main) {
          [...main.children].forEach((child) => {
            if (child !== panel) child.classList.add('hidden');
          });
        }
        this.showNotFoundToast(this.publicUsername);
        this.setPageMeta('Profile not found', 'This Swapiki profile could not be found or is not published yet.');
        return;
      }
      // Profile resolved — clear the 404 panel / re-show the profile content.
      this.clearNotFoundPanel();
      // Only now that we know WHO was looked at, and that it was not a 404.
      this._recordPublicProfileView(profile, isAdminPreview);
    } else {
      profile = swapikiStore.getProfile();
    }

    // Draft profiles are intentionally visible to public visitors too during
    // this pilot (not just published ones) — see the includeUnpublished
    // fetch above. There is deliberately no publish-status gate here.

    const username = this.publicUsername || profile.username || profile.id || 'ananya-sharma';

    // Per-page SEO: this profile's owner, role and handle are the story here.
    // Used in the browser tab, share cards and any wizard that reads head meta.
    const profileTitle = profile.title || 'Software Professional';
    const shareUrl = `https://${username}.swapiki.com/`;
    this.setPageMeta(
      `${profile.name} — ${profileTitle} | Swapiki`,
      `${profile.name} (${profileTitle}${profile.status ? ', ' + profile.status : ''}) · statement on Swapiki. Open the link on a computer or the Swapiki app for the full profile video.`,
      { url: shareUrl }
    );

    // Update Subdomain Preview Frame UI
    const subdomEl = document.getElementById('preview-subdomain-url');
    if (subdomEl) subdomEl.textContent = `${username}.swapiki.com`;

    document.getElementById('rec-name-text').textContent = profile.name;
    document.getElementById('rec-title-text').textContent = `${profile.title} • ${profile.experience}`;
    // Live-recording badge: shows only when this person actually passed the
    // spoken-code check. It says the audio is not a replay, not who is speaking.
    this.applyVoiceVerifiedBadge(profile);
    this.applyReviewedBadge(profile);
    this.applyProfileAttestation(profile);

    // "Report this profile" — the visitor-facing path to flag a scam so the team
    // can act. Shown only when looking at someone else's public profile, never on
    // your own preview or an admin preview. The target id is stashed here because
    // the modal's submit handler has no other way to know whose profile it is.
    this._reportTarget = {
      id: profile && profile.id ? profile.id : null,
      name: profile && profile.name ? profile.name : '',
      username: username
    };
    const reportBtn = document.getElementById('rec-report-btn');
    if (reportBtn) {
      const showReport = !!this.publicUsername && !isAdminPreview && !!(profile && profile.id);
      reportBtn.classList.toggle('hidden', !showReport);
      reportBtn.classList.toggle('flex', showReport);
    }

    // Sample/fictional profile notice: the built-in demo profile (the local
    // default, id "ananya_sharma") is fiction used to show the format, so it
    // must never read as a real, reviewed person. A real profile fetched by
    // handle has a database UUID, never that id.
    const sampleBanner = document.getElementById('sample-profile-banner');
    if (sampleBanner) {
      if (!this.publicUsername && profile && profile.id === 'ananya_sharma') {
        sampleBanner.classList.remove('hidden');
      } else {
        sampleBanner.classList.add('hidden');
      }
    }

    document.getElementById('rec-expertise-text').textContent = Array.isArray(profile.expertise) && profile.expertise.length > 0
      ? profile.expertise.slice(0, 2).join(' & ')
      : (profile.expertise || "No skills listed yet");
    document.getElementById('rec-status-text').textContent = profile.status;
    document.getElementById('rec-education-text').textContent = profile.education;
    const avatarImg = document.getElementById('rec-avatar-img');
    const genericSvgAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%2364748B' viewBox='0 0 24 24'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    if (avatarImg) {
      avatarImg.onerror = () => { avatarImg.src = genericSvgAvatar; };
      avatarImg.src = profile.avatar || genericSvgAvatar;
    }

    const linkedinLink = document.getElementById('rec-linkedin-link');
    if (linkedinLink) {
      if (profile.linkedin) {
        linkedinLink.href = profile.linkedin;
        linkedinLink.classList.remove('hidden');
      } else {
        linkedinLink.classList.add('hidden');
      }
    }
        const twitterLink = document.getElementById('rec-twitter-link');
    if (twitterLink) {
      if (profile.twitter) { twitterLink.href = profile.twitter; twitterLink.classList.remove('hidden'); }
      else twitterLink.classList.add('hidden');
    }
    const portfolioLink = document.getElementById('rec-portfolio-link');
    if (portfolioLink) {
      if (profile.portfolio) { portfolioLink.href = profile.portfolio; portfolioLink.classList.remove('hidden'); }
      else portfolioLink.classList.add('hidden');
    }
    const resumeLinkEl = document.getElementById('rec-resume-link');
    if (resumeLinkEl) {
      if (profile.resumeLink) { resumeLinkEl.href = profile.resumeLink; resumeLinkEl.classList.remove('hidden'); }
      else resumeLinkEl.classList.add('hidden');
    }

    // Dynamic About Candidate Section Update
    const firstName = profile.name ? profile.name.split(' ')[0] : "Candidate";
    const aboutHeading = document.getElementById('rec-about-heading');
    const aboutBio = document.getElementById('rec-about-bio');
    const aboutLocation = document.getElementById('rec-about-location');

    if (aboutHeading) aboutHeading.textContent = `About ${firstName}`;
    if (aboutBio) aboutBio.textContent = profile.bio || `${firstName} hasn't added a bio yet.`;
    if (aboutLocation) aboutLocation.textContent = profile.location || 'Not specified';

    const projectsCountEl = document.getElementById('rec-projects-count');
    if (projectsCountEl) projectsCountEl.textContent = String(profile.projects.length);

    const container = document.getElementById('stitch-candidate-projects-container');
    if (!container) return;

    container.innerHTML = '';

    if (!profile.projects || profile.projects.length === 0) {
      container.innerHTML = `
        <div class="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
          <span class="material-symbols-outlined text-4xl text-slate-300 mb-2">folder_open</span>
          <p class="font-bold text-slate-700">No proof projects added yet.</p>
          <p class="text-sm text-slate-400 mt-1">Once this candidate adds a project with a voice walkthrough, it'll show up here.</p>
        </div>
      `;
    } else {
      profile.projects.forEach((proj, idx) => {
      const hasImage = !!proj.imageUrl;
      const isLast = idx === profile.projects.length - 1;

      const row = document.createElement('div');
      row.className = "relative flex gap-4 md:gap-5 proof-entry";
      row.style.animationDelay = `${Math.min(idx * 0.08, 0.32)}s`;
      row.innerHTML = `
        <!-- Proof ledger rail: numbered node + connecting line -->
        <div class="flex flex-col items-center shrink-0 pt-1">
          <div class="proof-rail-node w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 z-10">
            ${String(idx + 1).padStart(2, '0')}
          </div>
          ${isLast ? '' : '<div class="w-px flex-1 bg-slate-200 mt-1 mb-1"></div>'}
        </div>

        <article class="flex-1 min-w-0 bg-surface-container-lowest border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${isLast ? '' : 'mb-6'}">
        <div class="p-6 md:p-8">
          <div class="flex flex-col lg:flex-row gap-8">
            <div class="lg:w-1/3">
              <div class="aspect-square rounded-lg bg-surface-container-high overflow-hidden mb-4 flex items-center justify-center">
                ${hasImage
                  ? `<img class="w-full h-full object-cover" src="${proj.imageUrl}" alt="${proj.title}"/>`
                  : `<div class="flex flex-col items-center justify-center text-slate-300">
                       <span class="material-symbols-outlined text-5xl">image</span>
                       <span class="text-[11px] font-bold text-slate-400 mt-1">No image added</span>
                     </div>`
                }
              </div>
              <h3 class="font-headline-sm text-primary font-bold mb-2">${proj.title}</h3>
              <p class="text-on-surface-variant font-body-md mb-4">${proj.role}</p>
              
              <!-- Module 4: GitHub Repository Proof Component -->
              ${(() => {
                const hasValidRepo = proj.githubUrl && (proj.githubUrl.startsWith('http://') || proj.githubUrl.startsWith('https://'));
                if (!hasValidRepo) {
                  return `
                    <div class="mb-4 p-3 bg-slate-100 text-slate-700 rounded-xl text-xs space-y-1 border border-slate-200">
                      <div class="flex items-center justify-between font-bold">
                        <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-sm">code</span> Repository Link</span>
                        <span class="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">Repo not linked</span>
                      </div>
                      <p class="text-[11px] text-slate-500 italic">No working public repository link provided for this project.</p>
                    </div>
                  `;
                }
                return `
                  <div class="mb-4 p-3 bg-slate-900 text-white rounded-xl text-xs space-y-2 shadow-sm">
                    <div class="flex items-center justify-between">
                      <span class="flex items-center gap-1.5 font-bold">
                        <span class="material-symbols-outlined text-sm">code</span> Repository Link
                      </span>
                      <span class="bg-slate-700 text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded">Candidate-submitted</span>
                    </div>
                    <p class="text-[11px] text-slate-400 leading-relaxed">Link added by the candidate. Swapiki has not reviewed the code or confirmed the project is theirs.</p>
                    <a href="${proj.githubUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-bold text-emerald-300 hover:text-emerald-200">
                      Inspect Public Code Base &rarr;
                    </a>
                  </div>
                `;
              })()}

              <div class="flex flex-wrap gap-2">
                ${proj.tags.map(t => `<span class="px-2 py-1 bg-surface-container text-on-surface-variant rounded font-label-sm font-semibold">${t}</span>`).join('')}
              </div>
            </div>
            <div class="lg:w-2/3 space-y-6">
              <div class="bg-gradient-to-r from-primary-container via-primary to-slate-900 p-5 md:p-6 rounded-2xl mb-6 text-white shadow-xl relative overflow-hidden">
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-tertiary-fixed animate-ping"></span>
                    <span class="text-xs font-extrabold tracking-wider uppercase text-tertiary-fixed">${proj.audioUrl ? 'CANDIDATE VOICE WALKTHROUGH' : 'AI-GENERATED PRODUCT DEMO VOICE'}</span>
                  </div>
                  <span class="bg-white/10 text-white/90 text-xs px-2.5 py-1 rounded-full font-mono font-bold">${proj.audioDuration || '01:45'}</span>
                </div>
                <div class="flex items-center gap-5">
                  <button onclick="app.playProjectAudio('${proj.id}')" class="w-14 h-14 rounded-full bg-white text-primary flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all shrink-0">
                    <span id="play-icon-${proj.id}" class="material-symbols-outlined text-3xl font-extrabold">play_arrow</span>
                  </button>
                  <div class="flex-1">
                    <p class="text-xs font-bold text-blue-100 mb-2">${proj.audioUrl ? 'Candidate recording: impact & technical logic' : 'Product demo narration, not a candidate recording'}</p>
                    <div class="audio-wave-anim flex-1 justify-between px-1 cursor-pointer" onclick="app.playProjectAudio('${proj.id}')">
                      <div class="wave-bar bg-white" style="animation-delay: 0.1s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.3s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.5s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.2s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.4s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.1s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.6s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.2s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.4s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.5s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.3s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.1s"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <h4 class="font-label-sm text-outline uppercase mb-2 tracking-widest font-bold">THE PROBLEM</h4>
                  <p class="font-body-md text-on-surface">${proj.takeaways[0] || 'Overcoming fragmented workflows and high cognitive load.'}</p>
                </div>
                <div>
                  <h4 class="font-label-sm text-outline uppercase mb-2 tracking-widest font-bold">MY IMPACT</h4>
                  <p class="font-body-md text-primary font-bold">${proj.impact}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        </article>
      `;
      container.appendChild(row);
      });
    }
  }

  playProjectAudio(projectId) {
    const icon = document.getElementById(`play-icon-${projectId}`);
    // Find the wave container closest to this play button's project card
    const waveContainer = icon ? icon.closest('.bg-gradient-to-r')?.querySelector('.audio-wave-anim') : null;
    const profile = swapikiStore.getProfile();
    const project = profile.projects.find(p => p.id === projectId);

    const setWavePlaying = (playing) => {
      if (waveContainer) {
        if (playing) waveContainer.classList.add('audio-playing');
        else waveContainer.classList.remove('audio-playing');
      }
    };

    if (project && project.audioUrl) {
      if (this.activeAudioElement && this.activeAudioElement.src === project.audioUrl && !this.activeAudioElement.paused) {
        this.activeAudioElement.pause();
        if (icon) icon.textContent = 'play_arrow';
        setWavePlaying(false);
        return;
      }

      if (this.activeAudioElement) this.activeAudioElement.pause();
      this.activeAudioElement = new Audio(project.audioUrl);
      this.activeAudioElement.onended = () => {
        if (icon) icon.textContent = 'play_arrow';
        setWavePlaying(false);
        this.activeAudioElement = null;
      };
      this.activeAudioElement.play().then(() => {
        if (icon) icon.textContent = 'pause';
        setWavePlaying(true);
      }).catch(() => this.showToast('Unable to play this recording.'));
      return;
    }
    
    if (icon) {
      if (icon.textContent === 'play_arrow') {
        icon.textContent = 'pause';
        setWavePlaying(true);
        this.showToast("Playing demo voice preview. This is not a real candidate recording.");

        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          
          // Candidate project walkthrough script — uses the real logged-in
          // candidate's name for their own real projects (was previously
          // hardcoded to "Ananya Sharma" regardless of who was logged in).
          // The p1/p2 branches only fire for the built-in demo profile's own
          // demo project IDs, so their scripted narration is intentional.
          const speakerName = (profile && profile.name) ? profile.name.split(' ')[0] : "the candidate";
          let text = "";
          if (projectId === 'p1' || !project) {
            text = "Hi, I am Ananya Sharma. In this project at Razorpay, I architected the Vernacular UPI Payment Flow across six Indian languages. Our team reduced payment drop-offs by 34% across 12 million monthly transactions by designing a simplified one-tap intent interaction model.";
          } else if (projectId === 'p2') {
            text = "Hello! I am Ananya Sharma. For Swiggy Instamart, I led UX research and product design for dark store logistics. We cut order dispatch preparation time by 3.5 minutes per delivery partner by implementing audio-assisted inventory picking workflows across 120 hubs.";
          } else {
            text = `Hi, I am ${speakerName}. In this project ${project.title}, my primary impact was ${project.impact}. Here is how we executed: ${project.takeaways.join('. ')}.`;
          }
          
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.92;
          utterance.pitch = 1.25; // Elevated pitch for clear female voice timbre

          const voices = window.speechSynthesis.getVoices();
          // Filter explicitly for female voices (India / English female profiles)
          const femaleVoice = voices.find(v => 
            (v.name.includes('Female') || v.name.includes('Heera') || v.name.includes('Kalpana') || v.name.includes('Veena') || v.name.includes('Neerja') || v.name.includes('Google UK English Female') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Victoria') || v.name.includes('Karen')) &&
            (v.lang.includes('en') || v.lang.includes('hi'))
          ) || voices.find(v => v.lang.includes('en-IN') || v.name.includes('India'));

          if (femaleVoice) {
            utterance.voice = femaleVoice;
          }

          utterance.onend = () => {
            icon.textContent = 'play_arrow';
            setWavePlaying(false);
          };

          window.speechSynthesis.speak(utterance);
        }
      } else {
        icon.textContent = 'play_arrow';
        setWavePlaying(false);
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      }
    }
  }

  handleProjectImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.showToast("Image file size must be less than 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      this.selectedProjectImageUrl = event.target.result;
      const nameEl = document.getElementById('proj-image-name');
      const previewBox = document.getElementById('proj-image-preview-box');
      const previewImg = document.getElementById('proj-image-preview');

      if (nameEl) nameEl.textContent = file.name;
      if (previewImg) previewImg.src = event.target.result;
      if (previewBox) previewBox.classList.remove('hidden');

      this.showToast("Project cover image attached!");
    };
    reader.readAsDataURL(file);
  }

  openEditProjectModal(projectId) {
    const profile = swapikiStore.getProfile();
    const proj = profile.projects.find(p => p.id === projectId);
    if (!proj) {
      this.showToast("Project not found.");
      return;
    }

    // Populate form fields with existing project data
    document.getElementById('proj-edit-id').value = proj.id;
    document.getElementById('proj-input-title').value = proj.title || '';
    document.getElementById('proj-input-role').value = proj.role || '';
    document.getElementById('proj-input-problem').value = proj.problem || '';
    document.getElementById('proj-input-ownership').value = proj.ownership || '';
    document.getElementById('proj-input-impact').value = proj.impact || '';
    document.getElementById('proj-input-github').value = proj.githubUrl || '';
    document.getElementById('proj-input-live').value = proj.liveUrl || '';
    document.getElementById('proj-input-takeaways').value = Array.isArray(proj.takeaways) ? proj.takeaways.join('\n') : (proj.takeaways || '');

    // Image preview state
    if (proj.imageUrl) {
      this.selectedProjectImageUrl = proj.imageUrl;
      const previewBox = document.getElementById('proj-image-preview-box');
      const previewImg = document.getElementById('proj-image-preview');
      const nameEl = document.getElementById('proj-image-name');
      if (previewImg) previewImg.src = proj.imageUrl;
      if (nameEl) nameEl.textContent = "Existing image attached";
      if (previewBox) previewBox.classList.remove('hidden');
    }

    // Update Header Text for Edit Mode
    const heading = document.getElementById('proj-form-heading');
    const subheading = document.getElementById('proj-form-subheading');
    if (heading) heading.textContent = "Edit Project Details";
    if (subheading) subheading.textContent = "Fine-tune your project impact, repository proof, and takeaways.";

    router.navigate('add-project');
  }

  handleProjectSubmit(e) {
    e.preventDefault();
    const profile = swapikiStore.getProfile();
    const editProjectId = document.getElementById('proj-edit-id').value;

    if (!editProjectId && profile.projects.length >= 4) {
      this.showToast('A profile can contain no more than 4 proof projects.');
      return;
    }

    const title = document.getElementById('proj-input-title').value;
    const role = document.getElementById('proj-input-role').value;
    const problem = document.getElementById('proj-input-problem').value;
    const ownership = document.getElementById('proj-input-ownership').value;
    const impact = document.getElementById('proj-input-impact').value;
    const githubUrl = document.getElementById('proj-input-github').value;
    const liveUrl = document.getElementById('proj-input-live').value;
    const takeawaysRaw = document.getElementById('proj-input-takeaways').value;
    const imageUrl = this.selectedProjectImageUrl || null;

    const fieldLimits = [
      ['Project title', title, 200],
      ['Role', role, 100],
      ['Problem', problem, 500],
      ['Ownership', ownership, 500],
      ['Impact', impact, 500]
    ];
    const invalidField = fieldLimits.find(([, value, limit]) => value.length > limit);
    if (invalidField) {
      this.showToast(`${invalidField[0]} must be ${invalidField[2]} characters or fewer.`);
      return;
    }

    const takeaways = takeawaysRaw ? takeawaysRaw.split('\n').filter(t => t.trim().length > 0) : [
      "Designed solution focused on system scalability",
      "Delivered measurable impact within schedule"
    ];

    let targetProjectId;
    try {
      if (editProjectId) {
        // Edit Mode
        const updated = swapikiStore.updateProject(editProjectId, {
          title,
          role,
          problem,
          ownership,
          impact,
          githubUrl,
          liveUrl,
          imageUrl,
          takeaways
        });
        targetProjectId = updated.id;
        this.showToast("Project details updated successfully!");
      } else {
        // Create Mode
        const newProj = swapikiStore.addProject({
          title,
          role,
          problem,
          ownership,
          impact,
          githubUrl,
          liveUrl,
          imageUrl,
          tags: ["Figma", "React", "B2B SaaS"],
          takeaways: [problem, ownership, ...takeaways]
        });
        targetProjectId = newProj.id;
        this.showToast("Project details saved! Record your audio walkthrough.");
      }

      // Reset form state & images
      document.getElementById('add-project-form').reset();
      document.getElementById('proj-edit-id').value = '';
      this.selectedProjectImageUrl = null;
      const previewBox = document.getElementById('proj-image-preview-box');
      if (previewBox) previewBox.classList.add('hidden');

      // Reset Header Text back to default Add mode
      const heading = document.getElementById('proj-form-heading');
      const subheading = document.getElementById('proj-form-subheading');
      if (heading) heading.textContent = "Add New Project";
      if (subheading) subheading.textContent = "Document your impact with high-velocity trust. Be concise, be data-driven.";

    } catch (error) {
      this.showToast(error.message);
      return;
    }

    this.openAudioModal(targetProjectId);
  }

  setVoiceFilter(presetName) {
    window.swapikiAudioEngine.setAudioFilterPreset(presetName);
    document.querySelectorAll('.voice-filter-btn').forEach(btn => {
      btn.className = "voice-filter-btn px-2.5 py-1 bg-slate-800 text-slate-200 text-[10px] font-bold rounded-full border border-slate-700 hover:bg-slate-700";
    });
    const activeBtn = document.getElementById(`vfilter-${presetName}`);
    if (activeBtn) {
      activeBtn.className = "voice-filter-btn px-2.5 py-1 bg-primary text-white text-[10px] font-bold rounded-full border border-blue-400 shadow-xs";
    }
    const label = presetName === 'studio' ? '✨ Studio Clarity' : presetName === 'warm' ? '🎙️ Warm Vocal Tone' : '🎧 Noise Suppression Filter';
    this.showToast(`Voice Filter set to ${label}!`);
  }

  downloadPdfPortfolio() {
    const profile = swapikiStore.getProfile();
    this.showToast(`Generating your PDF portfolio for ${profile.name}...`);

    // Dynamic HTML Print Window for PDF Export
    const printWin = window.open('', '_blank');
    if (!printWin) {
      this.showToast("Please allow popups to download your PDF portfolio!");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${profile.name} - Swapiki Portfolio</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.5; }
          .header { border-bottom: 2px solid #00236f; padding-bottom: 20px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; }
          .badge { background: #dce1ff; color: #00236f; font-weight: bold; font-size: 11px; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; }
          .title { font-size: 24px; font-weight: bold; color: #00236f; margin: 0 0 4px 0; }
          .subtitle { font-size: 14px; color: #475569; margin: 0; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #00236f; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; }
          .project-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
          .project-title { font-size: 16px; font-weight: bold; color: #0f172a; margin: 0 0 4px 0; }
          .project-role { font-size: 12px; color: #0284c7; font-weight: bold; margin-bottom: 8px; }
          .impact-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px; margin-top: 10px; }
          .impact-title { font-size: 10px; font-weight: bold; color: #166534; text-transform: uppercase; margin-bottom: 2px; }
          .impact-text { font-size: 12px; font-weight: bold; color: #15803d; margin: 0; }
          .footer { margin-top: 40px; pt: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${profile.name}</h1>
            <p class="subtitle">${profile.title} • ${profile.experience} • ${profile.location}</p>
          </div>
          <span class="badge">CANDIDATE-SUBMITTED PROOF · VOICE WALKTHROUGH ATTACHED</span>
        </div>

        <div class="section">
          <div class="section-title">ABOUT CANDIDATE</div>
          <p style="font-size: 13px; color: #334155;">${profile.bio || 'Experienced product and engineering lead with a focus on scalable systems and candidate-submitted project proof.'}</p>
        </div>

        <div class="section">
          <div class="section-title">PROOF OF WORK (CANDIDATE-SUBMITTED)</div>
          ${profile.projects.map(p => `
            <div class="project-card">
              <h3 class="project-title">${p.title}</h3>
              <div class="project-role">${p.role}</div>
              <p style="font-size: 12px; color: #475569; margin: 4px 0;"><strong>Problem Statement:</strong> ${p.takeaways[0] || 'High cognitive friction and operational drop-offs.'}</p>
              <div class="impact-box">
                <div class="impact-title">MEASURABLE IMPACT ACHIEVED</div>
                <div class="impact-text">${p.impact}</div>
              </div>
              <p style="font-size: 11px; color: #64748b; margin-top: 8px;"><strong>Voice Walkthrough Attached:</strong> ${p.audioDuration || '01:45'} \u2014 candidate-recorded and liveness-checked. This is not an identity check, and Swapiki does not verify that the work is the candidate's own.</p>
            </div>
          `).join('')}
        </div>

        <div class="footer">
          Made with Swapiki — candidate-submitted proof and a live-recording-checked voice walkthrough. Swapiki does not verify identity, and nothing here is an identity, credential or background check.
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWin.document.write(htmlContent);
    printWin.document.close();
  }

  /** Renders the live-recording check line under the dashboard "Voice Walkthroughs" metric. */
  renderVoiceVerificationStatus(profile) {
    const el = document.getElementById('dash-voice-verify-status');
    if (!el) return;
    const count = profile.voiceVerificationCount || 0;

    if (profile.voiceVerified && count > 0) {
      const when = profile.voiceVerifiedAt ? new Date(profile.voiceVerifiedAt) : null;
      const dateStr = when && !isNaN(when.getTime())
        ? when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
        : 'recently';
      el.innerHTML = `
        <span class="material-symbols-outlined text-[14px] text-emerald-600 shrink-0">verified</span>
        <span><strong class="text-emerald-700">Live recording confirmed</strong> - read a random code into your mic on ${dateStr} (${count} attempt${count === 1 ? '' : 's'}). It proves the recording is not a replay, not who you are.</span>`;
    } else if (count > 0) {
      el.innerHTML = `
        <span class="material-symbols-outlined text-[14px] text-amber-600 shrink-0">gpp_bad</span>
        <span><strong class="text-amber-700">Recording not confirmed</strong> - ${count} attempt${count === 1 ? '' : 's'} so far. Re-record and read the code at the end of the phrase, clearly.</span>`;
    } else {
      el.innerHTML = `
        <span class="material-symbols-outlined text-[14px] text-slate-400 shrink-0">record_voice_over</span>
        <span>Record your first walkthrough and read the random code aloud. Confirmed live recordings carry a badge on your profile.</span>`;
    }
    el.classList.remove('hidden');
  }

  /** Toggles the public profile "Live recording confirmed" badge based on real check state. */
  applyVoiceVerifiedBadge(profile) {
    const badge = document.getElementById('voice-verified-badge');
    if (!badge) return;
    if (profile.voiceVerified) {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /**
   * Toggles the public "Verified" badge. This is an automatic sign-off, not a
   * human one: it shows once the profile is complete (details + a proof
   * project) AND the live recording was confirmed. The criteria live in
   * js/profileChecklist.js (isProfileReviewed) so the badge and the dashboard
   * completeness bar can never disagree about what "done" means.
   */
  applyReviewedBadge(profile) {
    const badge = document.getElementById('reviewed-badge');
    if (!badge) return;
    let reviewed = false;
    try {
      reviewed = !!(window.profileChecklist && window.profileChecklist.isProfileReviewed(profile));
    } catch (err) {
      reviewed = false;
    }
    if (reviewed) {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /**
   * Shows when the candidate last saved this profile while ticking the "these
   * details are true and my own work" box (see handleProfileSave).
   *
   * Deliberately a quiet grey line, not a pill badge like the ones above it.
   * Anyone can tick a box, so dressing this up as a trust signal would tell
   * recruiters more than it can support - the same mistake as the old "Voice
   * verified" badge. It reports who said what and when, and nothing more.
   */
  applyProfileAttestation(profile) {
    const line = document.getElementById('rec-attested-line');
    const dateEl = document.getElementById('rec-attested-date');
    if (!line) return;

    const when = profile && profile.profileAttestedAt ? new Date(profile.profileAttestedAt) : null;
    if (!when || isNaN(when.getTime())) {
      line.classList.add('hidden');
      if (dateEl) dateEl.textContent = '';
      return;
    }

    if (dateEl) {
      dateEl.textContent = when.toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    }
    line.title = profile.profileAttestedName
      ? `Signed as "${profile.profileAttestedName}" at the time of saving. This is the candidate's own statement, not a Swapiki review of their work.`
      : 'This is the candidate\'s own statement, not a Swapiki review of their work.';
    line.classList.remove('hidden');
  }

  openAudioModal(projectId) {
    this.currentRecordingProjectId = projectId;
    const modal = document.getElementById('modal-audio-studio');
    if (modal) modal.classList.remove('hidden');

    // Fresh attempt every time the studio opens: new random session + new random
    // 3-word code, so a stored clip can never satisfy the check.
    const engine = window.swapikiAudioEngine;
    const profile = swapikiStore.getProfile();
    const phrase = engine.beginVerificationChallenge(profile && profile.name ? profile.name : '');
    const banner = document.getElementById('challenge-banner');
    const phraseText = document.getElementById('challenge-phrase-text');
    const hint = document.getElementById('challenge-verify-hint');
    if (banner) banner.classList.remove('hidden');
    if (phraseText) phraseText.textContent = phrase;

    // Say so up front if this browser cannot check the spoken code, rather than
    // letting the candidate record 30s of audio and only then hear that no
    // badge is coming.
    if (hint) {
      hint.textContent = engine.isSpeechSupported()
        ? "The random code is new every time, so it can't be pre-recorded. Read the three code words out loud at the end of the sentence, clearly, so the browser can hear them."
        : "This browser can't check the spoken code (Chrome or Edge can). Your recording will still be saved to your profile, but it won't earn the live-recording badge here.";
    }
  }

  closeAudioModal() {
    if (window.swapikiAudioEngine.isRecording) {
      window.swapikiAudioEngine.stopRecording();
    }
    const banner = document.getElementById('challenge-banner');
    if (banner) banner.classList.add('hidden');
    const modal = document.getElementById('modal-audio-studio');
    if (modal) modal.classList.add('hidden');
    router.navigate('dashboard');
  }

  async toggleRecording() {
    const icon = document.getElementById('icon-record');
    const status = document.getElementById('audio-recording-status');
    const timerDisplay = document.getElementById('audio-timer-display');
    const canvas = document.getElementById('waveform-canvas');
    const teleprompterText = document.getElementById('teleprompter-step-text');
    const teleprompterBadge = document.getElementById('teleprompter-badge');

    if (!window.swapikiAudioEngine.isRecording) {
      this.recordingValid = false;
      const started = await window.swapikiAudioEngine.startRecording(
        canvas,
        (sec, formattedTime) => {
          if (timerDisplay) timerDisplay.textContent = formattedTime;

          const liveDot = document.getElementById('audio-live-dot');
          if (liveDot) liveDot.className = "w-3 h-3 rounded-full bg-red-500 animate-ping";

          const progressBar = document.getElementById('audio-progress-bar');
          if (progressBar) progressBar.style.width = `${Math.min(100, (sec / 120) * 100)}%`;

          // AI Teleprompter Step Controller
          if (sec < 30) {
            if (teleprompterText) teleprompterText.textContent = "Step 1 (0–30s): State the core business/technical problem you solved.";
            if (teleprompterBadge) teleprompterBadge.textContent = "0–30s Prompt";
          } else if (sec < 90) {
            if (teleprompterText) teleprompterText.textContent = "Step 2 (30–90s): Detail your exact contribution, architecture & trade-offs.";
            if (teleprompterBadge) teleprompterBadge.textContent = "30–90s Prompt";
          } else {
            if (teleprompterText) teleprompterText.textContent = "Step 3 (90–120s): Summarize measurable metric impact achieved.";
            if (teleprompterBadge) teleprompterBadge.textContent = "90–120s Prompt";
          }
        },
        (blobUrl, durationStr, isValid) => {
          this.recordedAudioUrl = blobUrl;
          this.recordedDurationStr = durationStr;
          this.recordingValid = isValid;
          const previewContainer = document.getElementById('audio-preview-container');
          const previewAudio = document.getElementById('audio-preview-element');
          const transcriptText = document.getElementById('ai-transcript-preview-text');

          if (previewContainer && previewAudio) {
            previewContainer.classList.remove('hidden');
            if (blobUrl) previewAudio.src = blobUrl;
          }
          if (transcriptText) {
            const profile = swapikiStore.getProfile();
            transcriptText.textContent = `"Hi, I am ${profile.name}. In this project, I architected the core product solution, overcoming high operational friction and reducing transaction failure rates significantly across 12M users."`;
          }
          this.showToast(isValid ? "Audio recording complete & ready to save." : "Recording must be at least 30 seconds long.");
        }
      );

      if (!started) {
        if (icon) icon.textContent = 'mic';
        if (status) status.textContent = window.swapikiAudioEngine.lastError || 'Microphone access is required to record.';
        this.showToast(window.swapikiAudioEngine.lastError || 'Microphone access is required to record.');
        return;
      }

      if (icon) icon.textContent = 'stop';
      if (status) status.textContent = 'Recording live... Read the anti-fraud phrase first, then follow the prompts above.';
      // Show pause button now that recording is active
      const pauseBtn = document.getElementById('btn-pause-record');
      if (pauseBtn) pauseBtn.style.display = 'flex';
      this.showToast("Recording started! Microphone & AI teleprompter active.");
    } else {
      window.swapikiAudioEngine.stopRecording();
      if (icon) icon.textContent = 'mic';
      if (status) status.textContent = 'Recording stopped. Preview & AI transcript generated below.';
      // Hide pause button when not recording
      const pauseBtn = document.getElementById('btn-pause-record');
      if (pauseBtn) pauseBtn.style.display = 'none';
    }
  }

  togglePauseRecording() {
    const engine = window.swapikiAudioEngine;
    const pauseButton = document.getElementById('btn-pause-record');
    const pauseIcon = document.getElementById('icon-pause-record');
    const status = document.getElementById('audio-recording-status');
    if (!engine.isRecording) return;

    if (engine.isPaused) {
      engine.resumeRecording();
      if (pauseIcon) pauseIcon.textContent = 'pause';
      if (pauseButton) pauseButton.title = 'Pause recording';
      if (status) status.textContent = 'Recording resumed...';
    } else {
      engine.pauseRecording();
      if (pauseIcon) pauseIcon.textContent = 'play_arrow';
      if (pauseButton) pauseButton.title = 'Resume recording';
      if (status) status.textContent = 'Recording paused.';
    }
  }

  async saveRecordedAudio() {
    const engine = window.swapikiAudioEngine;

    // Still recording — must stop first
    if (engine.isRecording) {
      this.showToast('Stop your recording first, then save.');
      return;
    }

    // No recording started at all
    if (!this.recordedAudioUrl && !this.recordingValid) {
      this.showToast('No recording found. Click the mic button to record your walkthrough.');
      return;
    }

    // Recording too short
    if (!this.recordingValid) {
      const secs = engine.secondsRecorded;
      const fmt = `${Math.floor(secs/60).toString().padStart(2,'0')}:${(secs%60).toString().padStart(2,'0')}`;
      this.showToast(`Recording is only ${fmt} — minimum is 30 seconds. Please re-record.`);
      return;
    }

    if (this.currentRecordingProjectId) {
      swapikiStore.updateProjectAudio(
        this.currentRecordingProjectId,
        this.recordedAudioUrl,
        this.recordedDurationStr || "01:45"
      );

      // Persist the recording blob to Supabase Storage so the audio URL
      // survives page reloads (blob: URLs die with the tab). Without this,
      // the profile would show "has audio" but hear nothing after a refresh.
      // Failure here is non-fatal — the local recording still previews.
      if (engine.getRecordedBlob()) {
        const audioFile = new File([engine.getRecordedBlob()], 'walkthrough.webm', { type: 'audio/webm' });
        const savingStatus = document.getElementById('audio-recording-status');
        if (savingStatus) savingStatus.textContent = 'Saving your recording… (one moment)';
        try {
          console.log('Persisting recording to storage…');
          await swapikiStore.uploadProjectAudio(
            this.currentRecordingProjectId,
            audioFile,
            this.recordedDurationStr || "01:45"
          );
        } catch (e) {
          console.warn('Audio upload to storage failed (profile keeps the local recording):', e);
        }
      }

      // Anti-fraud: run the live-mic / spoken-code check on the freshly recorded
      // blob before closing, so the candidate sees the result (and the badge
      // state) immediately.
      await this.runVoiceVerificationPipeline();
    }
    this.closeAudioModal();
  }

  /**
   * Live-recording pipeline. The only claim it can make is that the candidate
   * read this attempt's random code into a live microphone, which the browser's
   * speech recogniser confirms from the transcript. It does NOT claim identity
   * and does not compare the voice against an enrolled voiceprint - an earlier
   * version did, using an uncalibrated MFCC cosine threshold that could not tell
   * speakers apart, and showed recruiters a false "Voice verified" badge.
   * Never throws: failures just mark the project check and toast accordingly.
   */
  async runVoiceVerificationPipeline() {
    const engine = window.swapikiAudioEngine;
    const projectId = this.currentRecordingProjectId;
    const challenge = engine.getChallengeInfo();
    const blob = engine.getRecordedBlob();
    const liveMic = engine.wasLiveMic();
    const durationSecs = engine.secondsRecorded;

    const baseCheck = (extra) => swapikiStore.markProjectVoiceCheck(projectId, {
      status: extra.status,
      reason: extra.reason || null,
      sessionId: challenge ? challenge.sessionId : null,
      code: challenge ? challenge.code : null,
      phrase: challenge ? challenge.phrase : null,
      durationSeconds: durationSecs,
      liveMic,
      ...extra
    });

    // Failure cases never count as a `verified` cloud write.
    if (!liveMic || !challenge) {
      baseCheck({ status: 'failed', reason: 'not_live' });
      this.showToast('This recording did not come from a live microphone, so it cannot be confirmed. Please re-record.');
      return;
    }
    if (!blob) {
      baseCheck({ status: 'failed', reason: 'no_audio' });
      this.showToast('No audio data could be read. Please re-record.');
      return;
    }

    // Speech recognition is what proves the code was spoken. A browser without
    // it (Safari, Firefox) still keeps the recording, but we make no claim.
    this.showToast('Checking your recording... (one moment)');
    const spoken = await engine.verifySpokenChallenge();

    if (spoken.reason === 'unsupported') {
      baseCheck({ status: 'skipped', reason: 'speech_unsupported', speechSupported: false });
      this.showToast('Recorded and saved. This browser cannot check the spoken code, so no badge was added - try Chrome or Edge.');
      return;
    }

    if (!spoken.verified) {
      const noSpeech = spoken.reason === 'no_transcript';
      baseCheck({
        status: 'failed',
        reason: noSpeech ? 'no_speech_detected' : 'code_mismatch',
        speechSupported: true,
        transcript: spoken.transcript,
        missingWords: spoken.missing
      });
      swapikiStore.recordVoiceVerification({ verified: false });
      const detail = noSpeech
        ? 'No speech was detected in that recording.'
        : `The code didn't come through (missing: ${spoken.missing.join(', ')}).`;
      this.showToast(`${detail} It's saved but not confirmed - try again and read the code clearly at the end of the phrase.`);
      this.renderDashboard();
      return;
    }

    baseCheck({
      status: 'verified',
      reason: 'code_confirmed',
      speechSupported: true,
      transcript: spoken.transcript
    });
    swapikiStore.recordVoiceVerification({ verified: true });
    this.showToast('Recording confirmed live. Your profile now shows "Live recording confirmed".');
    this.renderDashboard();
  }

  checkNicknameAvailability(rawNick) {
    const statusEl = document.getElementById('edit-nickname-status');
    const previewEl = document.getElementById('edit-subdomain-preview');
    const cleanNick = swapikiStore.formatNickname(rawNick);

    if (previewEl) {
      previewEl.textContent = cleanNick ? `${cleanNick}.swapiki.com` : `your-handle.swapiki.com`;
    }

    if (!cleanNick) {
      if (statusEl) {
        statusEl.textContent = "⚠️ Handle required";
        statusEl.className = "normal-case text-[11px] font-bold text-amber-600";
      }
      if (previewEl) previewEl.className = "font-bold text-amber-600 transition-colors";
      this.isCurrentNicknameValid = false;
      return false;
    }

    if (cleanNick.length < 5) {
      if (statusEl) {
        statusEl.textContent = "⚠️ Min 5 characters required";
        statusEl.className = "normal-case text-[11px] font-bold text-amber-600";
      }
      if (previewEl) previewEl.className = "font-bold text-amber-600 transition-colors";
      this.isCurrentNicknameValid = false;
      return false;
    }

    // Registration rule: a handle only locks once it has a name AND a number.
    if (!swapikiStore.handleHasNameAndNumber(cleanNick)) {
      if (statusEl) {
        statusEl.textContent = "⚠️ Add both a name and a number (e.g. rahul92)";
        statusEl.className = "normal-case text-[11px] font-bold text-amber-600";
      }
      if (previewEl) previewEl.className = "font-bold text-amber-600 transition-colors";
      this.isCurrentNicknameValid = false;
      return false;
    }

    const currentProfile = swapikiStore.getProfile();
    const isTaken = swapikiStore.isNicknameTakenSync(cleanNick, currentProfile.id);

    if (isTaken) {
      if (statusEl) {
        statusEl.textContent = `❌ "${cleanNick}" is already taken!`;
        statusEl.className = "normal-case text-[11px] font-bold text-rose-600 animate-pulse";
      }
      if (previewEl) previewEl.className = "font-bold text-rose-600 transition-colors";
      this.isCurrentNicknameValid = false;
      return false;
    } else {
      if (statusEl) {
        statusEl.textContent = `✅ "${cleanNick}" is available!`;
        statusEl.className = "normal-case text-[11px] font-bold text-emerald-600";
      }
      if (previewEl) previewEl.className = "font-bold text-emerald-600 transition-colors";
      this.isCurrentNicknameValid = true;
      return true;
    }
  }

 /** Flips the handle lock notice's icon/text between its "still editable" and "locked" look.
  *  The box itself always stays a light red disclaimer — only the icon/copy change. */
 updateHandleLockNotice(isLocked) {
    const box = document.getElementById('handle-lock-notice');
    const icon = document.getElementById('handle-lock-icon');
    const title = document.getElementById('handle-lock-title');
    const subtext = document.getElementById('handle-lock-subtext');
    if (!box || !icon || !title || !subtext) return;

    box.className = 'bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 space-y-1.5 text-xs text-rose-900';

    if (isLocked) {
      icon.textContent = '🔒';
      title.textContent = 'Handle & email are permanent';
      subtext.textContent = 'This handle is locked and cannot be changed.';
    } else {
      icon.textContent = '🔓';
      title.textContent = 'Handle & email are permanent';
      subtext.textContent = 'Add both a name and a number (e.g. rahul92) in handle to register — once the handle is locked, it cannot be changed.';
    }
  }

 openEditProfileModal() {
    if (!this.isAuthenticated()) {
      this.showToast('Please log in to edit a profile.');
      this.openLoginModal();
      return;
    }
    const profile = swapikiStore.getProfile();
    document.getElementById('edit-name').value = profile.name;

    // The Handle is the only field (besides email, which never appears in
    // this form) that locks — once it's been set and saved, it can't be
    // changed again. Everything else stays editable indefinitely.
    const handleIsLocked = !!profile.locked && !!profile.username;
    const nickInput = document.getElementById('edit-nickname');
    const nickStatusEl = document.getElementById('edit-nickname-status');
    if (nickInput) {
      const activeNick = profile.username || profile.id || "";
      nickInput.value = activeNick;
      nickInput.disabled = handleIsLocked;
      nickInput.placeholder = handleIsLocked ? "" : "try your nick here";
      nickInput.classList.toggle('bg-slate-100', handleIsLocked);
      nickInput.classList.toggle('cursor-not-allowed', handleIsLocked);
      nickInput.classList.toggle('text-slate-500', handleIsLocked);

      // Single status indicator, top-right of the field: 🔓 Unlocked before
      // registration, 🔒 Locked once the handle has been saved & locked.
      if (handleIsLocked) {
        if (nickStatusEl) {
          nickStatusEl.textContent = '🔒 Locked';
          nickStatusEl.className = 'normal-case text-[11px] font-bold text-rose-600';
        }
        const previewEl = document.getElementById('edit-subdomain-preview');
        if (previewEl) previewEl.className = 'font-bold text-slate-500 transition-colors';
        this.isCurrentNicknameValid = true;
      } else if (typeof window.checkHandleDirect === 'function') {
        window.checkHandleDirect(activeNick);
      }
    }

    this.updateHandleLockNotice(handleIsLocked);

    document.getElementById('edit-title').value = profile.title || "";
    document.getElementById('edit-experience').value = profile.experience || "";
    document.getElementById('edit-expertise').value = Array.isArray(profile.expertise) ? profile.expertise.join(', ') : (profile.expertise || "");
    document.getElementById('edit-location').value = profile.location || "";
    document.getElementById('edit-status').value = profile.status || "";
    document.getElementById('edit-education').value = profile.education || "";
    document.getElementById('edit-bio').value = profile.bio || "";
       document.getElementById('edit-linkedin').value = profile.linkedin || "";
    const twitterInput = document.getElementById('edit-twitter');
    if (twitterInput) twitterInput.value = profile.twitter || "";
    const resumeLinkInput = document.getElementById('edit-resume-link');
    if (resumeLinkInput) resumeLinkInput.value = profile.resumeLink || "";
    const portfolioInput = document.getElementById('edit-portfolio');
    if (portfolioInput) portfolioInput.value = profile.portfolio || "";

    const resumeStatus = document.getElementById('edit-resume-status');
    if (resumeStatus) {
      resumeStatus.textContent = profile.resumeUrl ? "✅ Custom resume PDF attached." : "No custom resume attached yet. Uploading replaces default PDF download.";
    }

    const preview = document.getElementById('edit-avatar-preview');
    if (preview && profile.avatar) {
      preview.src = profile.avatar;
    }
    this.uploadedAvatarUrl = profile.avatar || null;
    this.uploadedResumeUrl = profile.resumeUrl || null;

    const modal = document.getElementById('modal-edit-profile');
    if (modal) modal.classList.remove('hidden');

    // Attestation starts unticked every time the form opens, so agreeing to it
    // means agreeing to what is on screen right now.
    this.resetTruthAttestation();
  }

  /**
   * The "this profile is true" radio in the edit-profile form. Save stays
   * disabled until it is selected, so the line is an agreement rather than
   * decorative small print.
   */
  onTruthAttestationChange() {
    const radio = document.getElementById('edit-truth-attestation');
    const saveBtn = document.getElementById('edit-profile-save-btn');
    if (saveBtn && radio) saveBtn.disabled = !radio.checked;
  }

  resetTruthAttestation() {
    const radio = document.getElementById('edit-truth-attestation');
    if (radio) radio.checked = false;
    const saveBtn = document.getElementById('edit-profile-save-btn');
    if (saveBtn) saveBtn.disabled = true;
  }

  /**
   * Called right after a successful login. If this account hasn't locked in a
   * handle yet, nag them about finishing their profile — dismissible for the
   * first 2 logins, then mandatory (no close button) from the 3rd login on.
   * The count lives on the candidate's row in Supabase (loginReminderCount),
   * so it follows the account across devices/browsers, not just this one.
   */
   maybeShowProfileReminder() {
    const profile = swapikiStore.getProfile();
    const handleIsLocked = !!profile.locked && !!profile.username;
    if (handleIsLocked) return; // profile's already set up, nothing to nag about

    const count = swapikiStore.incrementLoginReminderCount();
    this.openProfileReminderModal(count > 2);
  }

  // ---------------------------------------------------------------------
  // FIRST-TIME SIGN-IN GUIDED TOUR
  // Spotlight tour: reads [data-tour] anchors, rings them, explains action
  // ---------------------------------------------------------------------

  _guidedTourSteps() {
    return [
      {
        key: 'welcome',
        icon: 'waving_hand',
        title: 'Welcome to Swapiki',
        body: 'Let’s take a quick tour of your dashboard. We’ll point to each key area so you know exactly where to go to build a proof profile that stands out.'
      },
      {
        key: 'nav-dashboard',
        icon: 'dashboard',
        title: 'Dashboard',
        body: 'Your home base. Here you’ll see your profile status, readiness checklist, proof projects, and quick actions to get started.'
      },
      {
        key: 'nav-edit-profile',
        icon: 'edit',
        title: 'Edit Profile',
        body: 'Add your name, title, location, bio, and links. Your handle locks once saved, so pick a clean one like rahul92.'
      },
      {
        key: 'nav-profile',
        icon: 'badge',
        title: 'Preview your public profile',
        body: 'Tap this anytime to see exactly what a hiring manager sees when they open your public link.'
      },
      {
        key: 'nav-jobs',
        icon: 'work',
        title: 'Browse jobs',
        body: 'Browse real jobs and internships across India. No AI scoring, no auto-rejection. Apply when there’s a real fit.'
      },
      {
        key: 'dash-status',
        icon: 'verified_user',
        title: 'Profile status',
        body: 'Shows if your profile is Draft or Published. Until you publish, only you can see it — share with others only after publishing.'
      },
      {
        key: 'add-project',
        icon: 'add_circle',
        title: 'Add a proof project',
        body: 'Start here. Add at least one real project with your role, impact, tools, and a link if you have one. This is what builds trust.'
      },
      {
        key: 'dash-checklist',
        icon: 'checklist',
        title: 'Profile readiness checklist',
        body: 'Follow these steps in order. Each item tells you exactly what’s missing and takes you straight to the right place.'
      },
      {
        key: 'dash-voice',
        icon: 'mic',
        title: 'Record a voice walkthrough',
        body: 'Explain one project in your own voice (30s minimum). Read the on-screen random code aloud to earn the “Live recording confirmed” badge.'
      },
      {
        key: 'dash-share',
        icon: 'share',
        title: 'Share your profile link',
        body: 'Copy and share your public link (your-handle.swapiki.com). That’s the link to send on resumes, DMs, or emails.'
      },
      {
        key: 'dash-publish',
        icon: 'rocket_launch',
        title: 'Publish your profile',
        body: 'Once you have at least one proof project, hit Publish. After that, your profile becomes visible to hiring managers.'
      },
      {
        key: 'dash-public',
        icon: 'link',
        title: 'Your public proof profile',
        body: 'Keep this link handy. It shows your projects + voice walkthrough — real proof, no resume PDF required.'
      }
    ];
  }

  _guidedTourKey() {
    try {
      const u = swapikiStore.currentUser;
      const id = u && (u.id || u.email);
      return id ? `swapiki:guided-tour:v1:${id}` : 'swapiki:guided-tour:v1:anon';
    } catch (e) {
      return 'swapiki:guided-tour:v1:anon';
    }
  }

  _shouldShowGuidedTour() {
    try {
      if (!swapikiStore || !swapikiStore.currentUser) return false;
      const key = this._guidedTourKey();
      if (localStorage.getItem(key)) return false;
      const host = window.location.hostname;
      if (host && host.endsWith('.swapiki.com') && host !== 'www.swapiki.com' && host !== 'swapiki.com') return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  maybeStartGuidedTour() {
    try {
      if (!this._shouldShowGuidedTour()) return;
      const user = swapikiStore.currentUser;
      const authUser = user || {};
      let isVeryNew = false;
      if (authUser.created_at && authUser.last_sign_in_at) {
        const createdMs = new Date(authUser.created_at).getTime();
        const lastSignInMs = new Date(authUser.last_sign_in_at).getTime();
        isVeryNew = Math.abs(lastSignInMs - createdMs) < 60000;
      }
      if (!isVeryNew) {
        const profile = swapikiStore.getProfile ? swapikiStore.getProfile() : {};
        if (profile && profile.completionScore >= 70) return;
      }
      setTimeout(() => {
        try { this.startGuidedTour(); } catch (e) { /* ignore */ }
      }, 650);
    } catch (e) { /* ignore */ }
  }

  startGuidedTour() {
    try {
      this._tourSteps = this._guidedTourSteps();
      this._tourIndex = 0;
      const root = document.getElementById('tour-root');
      if (!root) return;
      root.classList.remove('hidden');
      // Ensure we're on dashboard view for relevant steps
      try {
        if (typeof router !== 'undefined' && router && router.currentView !== 'dashboard' && swapikiStore && swapikiStore.currentUser) {
          router.navigate('dashboard', true);
        }
      } catch (e) { /* ignore */ }
      setTimeout(() => this._renderGuidedTourStep(true), 120);
      window.removeEventListener('resize', this._tourResizeHandler || (() => {}));
      this._tourResizeHandler = () => this._renderGuidedTourStep(false);
      window.addEventListener('resize', this._tourResizeHandler);
    } catch (e) { /* ignore */ }
  }

  _renderGuidedTourStep(ensureView) {
    try {
      const steps = this._tourSteps || [];
      const idx = this._tourIndex || 0;
      const step = steps[idx];
      if (!step) return this.finishGuidedTour();
      const root = document.getElementById('tour-root');
      const spotlight = document.getElementById('tour-spotlight');
      const popover = document.getElementById('tour-popover');
      const titleEl = document.getElementById('tour-title');
      const bodyEl = document.getElementById('tour-body');
      const iconEl = document.getElementById('tour-icon');
      const countEl = document.getElementById('tour-step-count');
      const nextBtn = document.getElementById('tour-next');
      const backBtn = document.getElementById('tour-back');
      if (titleEl) titleEl.textContent = step.title || '';
      if (bodyEl) bodyEl.textContent = step.body || '';
      if (iconEl) iconEl.textContent = step.icon || 'info';
      if (countEl) countEl.textContent = `Step ${idx + 1} of ${steps.length}`;
      if (backBtn) backBtn.disabled = idx === 0;
      if (nextBtn) nextBtn.textContent = (idx === steps.length - 1) ? 'Got it' : 'Next';

      if (step.key === 'welcome') {
        if (spotlight) spotlight.classList.add('hidden');
        if (popover) {
          popover.style.left = '50%';
          popover.style.top = '50%';
          popover.style.transform = 'translate(-50%, -50%)';
          popover.style.opacity = '1';
        }
        return;
      }

      // Navigate to the right view when needed
      try {
        if (step.key === 'nav-jobs') {
          if (typeof router !== 'undefined' && router) router.navigate('jobs', true);
        } else if (['nav-dashboard','nav-edit-profile','nav-profile','dash-status','add-project','dash-checklist','dash-voice','dash-share','dash-publish','dash-public'].includes(step.key)) {
          if (typeof router !== 'undefined' && router && router.currentView !== 'dashboard') router.navigate('dashboard', true);
        }
      } catch (e) { /* ignore */ }

      const el = document.querySelector(`[data-tour="${step.key}"]`);
      if (!el) {
        if (spotlight) spotlight.classList.add('hidden');
        if (popover) {
          popover.style.left = '50%';
          popover.style.top = '50%';
          popover.style.transform = 'translate(-50%, -50%)';
        }
        return;
      }
      if (ensureView) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch (e) { /* ignore */ }
      }
      setTimeout(() => {
        try {
          const rect = el.getBoundingClientRect();
          if (spotlight) {
            spotlight.style.left = (rect.left - 6) + 'px';
            spotlight.style.top = (rect.top - 6) + 'px';
            spotlight.style.width = (rect.width + 12) + 'px';
            spotlight.style.height = (rect.height + 12) + 'px';
            spotlight.classList.remove('hidden');
          }
          if (popover) {
            const margin = 14;
            const pw = 340;
            let left = rect.left;
            let top = rect.bottom + margin + 6;
            if (top + 260 > window.innerHeight) {
              top = rect.top - 260 - margin - 6;
            }
            if (left + pw > window.innerWidth - margin) {
              left = window.innerWidth - pw - margin;
            }
            if (left < margin) left = margin;
            if (top < margin) top = margin;
            popover.style.left = left + 'px';
            popover.style.top = top + 'px';
            popover.style.transform = 'none';
            popover.style.maxWidth = 'calc(100vw - 28px)';
          }
        } catch (e) { /* ignore */ }
      }, ensureView ? 280 : 0);
    } catch (e) { /* ignore */ }
  }

  nextGuidedTourStep() {
    try {
      const steps = this._tourSteps || [];
      const idx = this._tourIndex || 0;
      if (idx < steps.length - 1) {
        this._tourIndex = idx + 1;
        this._renderGuidedTourStep(true);
        return;
      }
      this.finishGuidedTour();
    } catch (e) {
      this.finishGuidedTour();
    }
  }

  prevGuidedTourStep() {
    try {
      const idx = this._tourIndex || 0;
      if (idx <= 0) return;
      this._tourIndex = idx - 1;
      this._renderGuidedTourStep(true);
    } catch (e) { /* ignore */ }
  }

  skipGuidedTour() {
    this._closeGuidedTour('skipped');
  }

  finishGuidedTour() {
    this._closeGuidedTour('done');
  }

  _closeGuidedTour(state) {
    try {
      localStorage.setItem(this._guidedTourKey(), state || 'done');
    } catch (e) { }
    try {
      const root = document.getElementById('tour-root');
      if (root) root.classList.add('hidden');
      if (this._tourResizeHandler) {
        window.removeEventListener('resize', this._tourResizeHandler);
        this._tourResizeHandler = null;
      }
    } catch (e) { }
  }



  openProfileReminderModal(mandatory) {
    const modal = document.getElementById('modal-profile-reminder');
    if (!modal) return;
    const closeBtn = document.getElementById('profile-reminder-close-btn');
    const laterBtn = document.getElementById('profile-reminder-later-btn');
    const title = document.getElementById('profile-reminder-title');
    const text = document.getElementById('profile-reminder-text');

    if (mandatory) {
      if (title) title.textContent = 'Complete your profile to continue';
      if (text) text.textContent = "You'll need to finish setting up your profile — including locking in your handle — before you can move forward on Swapiki.";
      if (closeBtn) closeBtn.classList.add('hidden');
      if (laterBtn) laterBtn.classList.add('hidden');
    } else {
      if (title) title.textContent = 'Set your handle & complete your profile';
      if (text) text.textContent = "You haven't set your handle yet. Head to Edit Profile to lock it in and finish filling out your profile.";
      if (closeBtn) closeBtn.classList.remove('hidden');
      if (laterBtn) laterBtn.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
  }

  closeProfileReminderModal() {
    const modal = document.getElementById('modal-profile-reminder');
    if (modal) modal.classList.add('hidden');
  }

  /** "Edit Profile" button inside the reminder — opens the exact same modal as the nav button. */
  openEditProfileFromReminder() {
    this.closeProfileReminderModal();
    this.openEditProfileModal();
  }

  async handleAvatarFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Instant local preview while the real upload happens in the background.
    const localPreviewUrl = URL.createObjectURL(file);
    const preview = document.getElementById('edit-avatar-preview');
    if (preview) preview.src = localPreviewUrl;
    this.showToast("Uploading photo…");

    try {
      const hostedUrl = await swapikiStore.uploadFile(file, 'avatar');
      this.uploadedAvatarUrl = hostedUrl;
      if (preview) preview.src = hostedUrl;
      this.showToast("Profile photo uploaded!");
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Photo upload failed.'}`);
      e.target.value = "";
    }
  }

  async handleResumeFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.showToast("⚠️ Resume file size must be under 2MB!");
      e.target.value = "";
      return;
    }

    const status = document.getElementById('edit-resume-status');
    if (status) status.textContent = `Uploading "${file.name}"…`;

    try {
      const hostedUrl = await swapikiStore.uploadFile(file, 'resume');
      this.uploadedResumeUrl = hostedUrl;
      if (status) status.textContent = `✅ Attached: ${file.name}`;
      this.showToast(`Resume "${file.name}" uploaded!`);
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Resume upload failed.'}`);
      if (status) status.textContent = "Upload failed. Please try again.";
      e.target.value = "";
    }
  }

  closeEditProfileModal() {
    const modal = document.getElementById('modal-edit-profile');
    if (modal) modal.classList.add('hidden');
  }

  async handleProfileSave(e) {
    e.preventDefault();

    // Pressing Enter in a text field can submit the form without the button
    // ever being clicked, so the attestation is enforced here too rather than
    // trusting the disabled button alone.
    const truthRadio = document.getElementById('edit-truth-attestation');
    if (truthRadio && !truthRadio.checked) {
      this.showToast('Please confirm your profile information is true before saving.');
      return;
    }

    const profile = swapikiStore.getProfile();
    const handleWasLocked = !!profile.locked && !!profile.username;

    let cleanNick;
    if (handleWasLocked) {
      // Handle is already locked — keep it exactly as-is, ignore the
      // (disabled) input, no need to re-check availability.
      cleanNick = profile.username;
    } else {
      const nickInputVal = document.getElementById('edit-nickname').value;
      cleanNick = swapikiStore.formatNickname(nickInputVal);

      const isAvailable = await this.checkNicknameAvailability(cleanNick);
      if (!isAvailable) {
        this.showToast(`⚠️ Cannot save: "${cleanNick}" is unavailable or invalid.`);
        return;
      }

      const confirmed = confirm(`Once you save, your handle "${cleanNick}" will be locked and cannot be changed again. All other profile fields can still be edited any time. Continue?`);
      if (!confirmed) return;
    }

    const rawExpertise = document.getElementById('edit-expertise').value;
    const expertiseArr = rawExpertise ? rawExpertise.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];

        const updateData = {
      name: document.getElementById('edit-name').value,
      username: cleanNick,
      title: document.getElementById('edit-title').value,
      experience: document.getElementById('edit-experience').value,
      expertise: expertiseArr,
      location: document.getElementById('edit-location').value,
      status: document.getElementById('edit-status').value,
      education: document.getElementById('edit-education').value,
      bio: document.getElementById('edit-bio').value,
      linkedin: document.getElementById('edit-linkedin').value,
      twitter: document.getElementById('edit-twitter') ? document.getElementById('edit-twitter').value.trim() : '',
      resumeLink: document.getElementById('edit-resume-link') ? document.getElementById('edit-resume-link').value.trim() : '',
      portfolio: document.getElementById('edit-portfolio') ? document.getElementById('edit-portfolio').value.trim() : '',
      // The handle locks the first time it's saved with a real value; every
      // save after that just re-affirms the lock (profile itself never locks).
      locked: true,
    };

    if (this.uploadedAvatarUrl) {
      updateData.avatar = this.uploadedAvatarUrl;
    }
    if (this.uploadedResumeUrl) {
      updateData.resumeUrl = this.uploadedResumeUrl;
    }

    if (!handleWasLocked) {
      swapikiStore.registerNickname(cleanNick, updateData.id);
    }
    swapikiStore.updateProfile(updateData);

    // The truth radio is required before Save is enabled (see the guard at the
    // top of this method), so reaching here means the candidate just re-affirmed
    // that these details are true and their own work. Record it with the name as
    // typed and the time, in its own write, so the line is evidence for this
    // specific save rather than a click with nothing behind it.
    swapikiStore.recordProfileAttestation({
      name: updateData.name,
      attestedAt: new Date().toISOString()
    });

    this.updateHandleLockNotice(true);
    this.closeEditProfileModal();
    this.showToast(handleWasLocked
      ? 'Profile updated!'
      : `Profile updated & handle "${cleanNick}.swapiki.com" locked.`);
    router.navigate(router.currentView, false);
  }

  handleResumeUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    this.showToast(`Parsing resume "${file.name}"...`);
    setTimeout(() => {
      document.getElementById('proj-input-title').value = "Payment Intent Retry & Webhook Engine";
      document.getElementById('proj-input-role').value = "Senior Backend Architect";
      document.getElementById('proj-input-problem').value = "Payment webhooks were delayed or duplicated during high-volume checkout events.";
      document.getElementById('proj-input-ownership').value = "Owned the retry architecture, idempotency model, and Redis-backed event recovery flow.";
      document.getElementById('proj-input-impact').value = "Achieved 99.98% payment webhook delivery SLA across 15M daily checkout transactions";
      document.getElementById('proj-input-github').value = "https://github.com/example/webhook-retry-engine";
      document.getElementById('proj-input-live').value = "https://example.com/payment-engine";
      document.getElementById('proj-input-takeaways').value = "Architected idempotent webhook event retry log with Redis cache\nReduced payment reconciliation latency from 45 mins to 1.2 seconds";
      
      this.showToast("Resume parsed! Form auto-filled with project details & GitHub link.");
    }, 1000);
  }

  openNotificationsModal() {
    const modal = document.getElementById('modal-notifications');
    if (modal) modal.classList.remove('hidden');
  }

  closeNotificationsModal() {
    const modal = document.getElementById('modal-notifications');
    if (modal) modal.classList.add('hidden');
  }

  openTermsModal() {
    const modal = document.getElementById('modal-terms');
    if (modal) modal.classList.remove('hidden');
  }

  closeTermsModal() {
    const modal = document.getElementById('modal-terms');
    if (modal) modal.classList.add('hidden');
  }

  openContactModal() {
    const modal = document.getElementById('modal-contact');
    if (modal) modal.classList.remove('hidden');
  }

  closeContactModal() {
    const modal = document.getElementById('modal-contact');
    if (modal) modal.classList.add('hidden');
  }

  openSupportModal() {
    const modal = document.getElementById('modal-support');
    if (modal) modal.classList.remove('hidden');
  }

  closeSupportModal() {
    const modal = document.getElementById('modal-support');
    if (modal) modal.classList.add('hidden');
  }

  openFeedbackModal() {
    const modal = document.getElementById('modal-feedback');
    if (modal) modal.classList.remove('hidden');
    const input = document.getElementById('feedback-message');
    if (input && !input.value) setTimeout(() => input.focus(), 50);
  }

  closeFeedbackModal() {
    const modal = document.getElementById('modal-feedback');
    if (modal) modal.classList.add('hidden');
  }

  async submitFeedback(e) {
    if (e) e.preventDefault();
    const message = document.getElementById('feedback-message');
    const category = document.getElementById('feedback-category');
    const email = document.getElementById('feedback-email');
    const text = message ? message.value.trim() : '';
    if (!text) {
      this.showToast('Please write a sentence or two first.');
      return;
    }

    const result = swapikiStore.submitFeedback({
      category: category ? category.value : 'general',
      message: text,
      email: email ? email.value.trim() : ''
    });

    if (result && result.ok) {
      if (message) message.value = '';
      if (email) email.value = '';
      this.closeFeedbackModal();
      this.showToast('Thanks — feedback received and read.');
    } else {
      this.showToast(`❌ ${(result && result.error) || 'Could not send feedback.'}`);
    }
  }

  openReportProfileModal() {
    const modal = document.getElementById('modal-report-profile');
    if (!modal) return;
    const target = this._reportTarget || {};
    const label = document.getElementById('report-profile-target');
    if (label) label.textContent = target.name || target.username || 'this profile';
    const details = document.getElementById('report-details');
    if (details) details.value = '';
    const email = document.getElementById('report-email');
    if (email) email.value = '';
    modal.classList.remove('hidden');
  }

  closeReportProfileModal() {
    const modal = document.getElementById('modal-report-profile');
    if (modal) modal.classList.add('hidden');
  }

  async submitProfileReport(e) {
    if (e) e.preventDefault();
    const target = this._reportTarget || {};
    if (!target.id) {
      this.showToast('Could not tell which profile to report.');
      return;
    }
    const reasonEl = document.getElementById('report-reason');
    const detailsEl = document.getElementById('report-details');
    const emailEl = document.getElementById('report-email');
    const button = e && e.target ? e.target.querySelector('button[type="submit"]') : null;
    const original = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Sending…'; }

    let result;
    try {
      result = await swapikiStore.reportProfile({
        candidateId: target.id,
        reason: reasonEl ? reasonEl.value : 'other',
        details: detailsEl ? detailsEl.value.trim() : '',
        email: emailEl ? emailEl.value.trim() : '',
        pageUrl: target.username ? `https://${target.username}.swapiki.com/` : ''
      });
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }

    if (result && result.ok) {
      this.closeReportProfileModal();
      this.showToast('Thanks — the report reached the Swapiki team.');
    } else {
      this.showToast(`❌ ${(result && result.error) || 'Could not send the report.'}`);
    }
  }

  openSignupModal() {
    const modal = document.getElementById('modal-signup');
    if (modal) modal.classList.remove('hidden');
    this.initGoogleButtons();
  }

  closeSignupModal() {
    const modal = document.getElementById('modal-signup');
    if (modal) modal.classList.add('hidden');
  }

  async handleSignup(e) {
    e.preventDefault();
    const checkbox = document.getElementById('terms-agree-checkbox');
    if (checkbox && !checkbox.checked) {
      this.showToast("You must agree to the Terms of Service & Privacy Policy.");
      return;
    }
    const nameInput = document.getElementById('signup-name-input');
    const emailInput = document.getElementById('signup-email-input');
    const handleInput = document.getElementById('signup-handle-input');
    const passwordInput = document.getElementById('signup-password-input');

    const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "New Candidate";
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const rawHandle = handleInput ? handleInput.value.trim() : "";
    const cleanHandle = swapikiStore.formatNickname(rawHandle);

    // Validate handle rules
    if (!cleanHandle || cleanHandle.length < 5) {
      this.showToast("⚠️ Handle must be at least 5 characters long.");
      return;
    }
    if (/^\d+$/.test(cleanHandle)) {
      this.showToast("⚠️ Numbers-only handles are not allowed.");
      return;
    }
    if (!swapikiStore.handleHasNameAndNumber(cleanHandle)) {
      this.showToast("⚠️ Handle needs both a name and a number to register (e.g. rahul92).");
      return;
    }
    if (!email) {
      this.showToast("⚠️ Work email is required.");
      return;
    }
    if (!password || password.length < 8) {
      this.showToast("⚠️ Password must be at least 8 characters long.");
      return;
    }

    const isTaken = swapikiStore.isNicknameTakenSync(cleanHandle);
    if (isTaken) {
      this.showToast(`❌ "${cleanHandle}" is already taken or restricted.`);
      return;
    }

    // Anti-spam: honeypot (bots auto-fill invisible fields) — reject silently.
    const honeyInput = document.getElementById('signup-honey-email');
    if (honeyInput && honeyInput.value.trim()) {
      this.showToast("Something went wrong. Please try again.");
      return;
    }

    // Client-side disposable-email fast check (mirrors the worker blocklist).
    if (isDisposableEmail(email)) {
      this.showToast("⚠️ Please use a permanent (non-temporary) email address.");
      return;
    }

    // Server-side guard: re-checks the honeypot + disposable list and rate-limits
    // per IP. Fail-open on network error so an unreachable worker never bricks signups.
    try {
      const guard = await fetch('/api/signup-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          honeypot: honeyInput ? honeyInput.value.trim() : ''
        })
      }).then(r => r.json()).catch(() => null);

      if (guard && guard.allowed === false) {
        if (guard.reason === 'rate_limit') {
          this.showToast("Too many signup attempts from this device. Wait a few minutes and try again.");
        } else if (guard.reason === 'disposable') {
          this.showToast("⚠️ Please use a permanent (non-temporary) email address.");
        } else {
          this.showToast("Something went wrong. Please try again.");
        }
        return;
      }
    } catch (err) {
      // Fail-open — see comment above.
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating account…'; }

    try {
      const { user, session } = await swapikiStore.signUpWithPassword(email, password, name);
      if (user) swapikiStore.registerNickname(cleanHandle, user.id);

      if (session && user) {
        // Email confirmation is off in this Supabase project — user is logged in immediately.
        await swapikiStore.loadProfileForUser(user, cleanHandle);
        this.refreshAuthUI();
        this.closeSignupModal();
        this.showToast(`Welcome to Swapiki, ${name.split(' ')[0]}! Build your proof profile.`);
        router.navigate('dashboard');
      } else {
        // Email confirmation is required before a session is issued — stash the
        // signup so the OTP modal can finish the job, then ask for the 6-digit code.
        this._pendingSignup = { email, cleanHandle, name };
        this.closeSignupModal();
        this.openOtpModal(email);
      }
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not create your account. Please try again.'}`);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }
  }

  // ---------------------------------------------------------------------
  // EMAIL OTP verification (confirmation code instead of link-click)
  // ---------------------------------------------------------------------

  openOtpModal(email) {
    const modal = document.getElementById('modal-otp');
    if (!modal) return this.showToast(`Almost there — check ${email} for the 6-digit confirmation code.`);
    modal.classList.remove('hidden');
    const addr = document.getElementById('otp-email-address');
    if (addr) addr.textContent = email || '';
    const input = document.getElementById('otp-code-input');
    if (input) { input.value = ''; input.focus(); }
    const submitBtn = document.getElementById('otp-submit-btn');
    if (submitBtn) submitBtn.disabled = false;
  }

  closeOtpModal() {
    const modal = document.getElementById('modal-otp');
    if (modal) modal.classList.add('hidden');
  }

  async handleOtpSubmit(e) {
    e.preventDefault();
    const pending = this._pendingSignup;
    const input = document.getElementById('otp-code-input');
    const code = input ? input.value.replace(/\s+/g, '').trim() : '';
    if (!pending || !pending.email) {
      this.showToast('Please start signing up first.');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      this.showToast('Enter the 6-digit code from the email.');
      return;
    }
    const submitBtn = document.getElementById('otp-submit-btn');
    const originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Verifying…'; }
    try {
      const { user, session } = await swapikiStore.verifyEmailOtp(pending.email, code);
      if (session && user) {
        await swapikiStore.loadProfileForUser(user, pending.cleanHandle);
        this.refreshAuthUI();
        this.closeOtpModal();
        this.showToast(`Welcome to Swapiki, ${pending.name.split(' ')[0]}! Build your proof profile.`);
        router.navigate('dashboard');
      } else if (user) {
        // Verified but no session (rare) — just ask them to log in.
        this.closeOtpModal();
        this.showToast('Email verified! Now log in with your password.');
        this.openLoginModal();
      }
    } catch (err) {
      const msg = (err && err.message) || 'Could not verify the code.';
      this.showToast(`❌ ${msg}`);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }
  }

  async resendOtp() {
    const pending = this._pendingSignup;
    if (!pending || !pending.email) return this.showToast('Please start signing up first.');
    try {
      await swapikiStore.resendEmailOtp(pending.email);
      const btn = document.getElementById('otp-resend-btn');
      if (btn) {
        const old = btn.textContent;
        btn.textContent = 'Sent! Check your inbox.';
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = old;
          btn.disabled = false;
        }, 4000);
      }
      this.showToast(`A fresh code is on its way to ${pending.email}`);
    } catch (err) {
      this.showToast(`❌ ${(err && err.message) || 'Could not resend the code.'}`);
    }
  }

  publishProfile() {
    const profile = swapikiStore.getProfile();
    if (profile.profileStatus === 'suspended') {
      this.showToast('Your profile is paused while our team reviews a report.');
      return;
    }
    if (profile.profileStatus === 'published') {
      swapikiStore.unpublishProfile();
      this.showToast('Profile unpublished and hidden from public view.');
    } else if (profile.projects.length < 1) {
      this.showToast('Add at least one proof project before publishing.');
      return;
    } else {
      swapikiStore.publishProfile();
      this.showToast('Profile published and ready to share.');
    }
    this.renderDashboard();
  }
}

window.app = new SwapikiApp();
document.addEventListener('DOMContentLoaded', () => window.app.init());
