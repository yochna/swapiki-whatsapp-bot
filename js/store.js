// Swapiki Data Store with LocalStorage Persistence

const DEFAULT_PROFILE = {
  id: "ananya_sharma",
  username: "ananya-sharma",
  profileStatus: "published",
  name: "Ananya Sharma",
  title: "Lead Product Designer & UI Architect",
  experience: "8+ Years Experience",
  location: "Bengaluru, Karnataka (Remote Ready)",
  status: "Immediate / 15 Days Notice",
  education: "IIT Bombay, B.Des in Communication Design",
  expertise: ["Design Systems", "UPI Payment Flows", "User Research", "Prototyping"],
  avatar: null,
  bio: "Passionate about building scalable fintech design systems and high-converting Indian checkout experiences. Proven track record scaling digital platforms at Swiggy and Razorpay.",
  linkedin: "https://linkedin.com/in/ananya-sharma-ux",
  resumeUrl: null,
  completionScore: 85,
  views: 248,
  audioListenRate: 82,
  shares: 56,
  loginReminderCount: 0,
  voiceVerified: false,
  voiceVerifiedAt: null,
  voiceVerificationCount: 0,
  profileAttestedAt: null,
  profileAttestedName: null,
  projects: [
    {
      id: "p1",
      title: "Razorpay Checkout & Vernacular UPI Flow",
      role: "Lead Product Designer & UI Architect",
      impact: "Reduced payment drop-offs by 34% across 12M monthly transactions",
      tags: ["UPI 2.0", "Figma", "Design Tokens", "Vernacular UI"],
      githubUrl: "https://github.com/example/upi-design-tokens",
      liveUrl: "https://example.com/razorpay-case-study",
      takeaways: [
        "Architected multi-brand token system supporting 6 Indian languages for 12M+ users",
        "Designed one-tap UPI intent flow reducing transaction failure rates by 28%",
        "Led cross-functional design sprints with 45+ engineers across Bengaluru and Mumbai"
      ],
      audioUrl: null, // Synthetic waveform or recorded blob
      audioDuration: "01:45",
      recordedAt: "2 days ago"
    },
    {
      id: "p2",
      title: "Swiggy Instamart Dark Store Logistics Portal",
      role: "Principal UX Researcher & Product Designer",
      impact: "Cut order dispatch preparation time by 3.5 mins per delivery partner",
      tags: ["Supply Chain UX", "Design Systems", "Web Audio API", "B2B SaaS"],
      githubUrl: "https://github.com/example/instamart-logistics-ui",
      liveUrl: "https://example.com/swiggy-case-study",
      takeaways: [
        "Conducted 40+ field interviews with dark store pickers in Bengaluru and Gurugram",
        "Designed voice-assisted inventory audio prompts reducing picker picking errors by 45%",
        "Achieved 94% positive usability score across 120 delivery hub managers"
      ],
      audioUrl: null,
      audioDuration: "01:58",
      recordedAt: "1 week ago"
    }
  ]
};

class SwapikiStore {
  constructor() {
    this.key = "swapiki_candidate_data_v2";
    this.maxProjects = 4;
    // Referral loop (see supabase/referrals_migration.sql): each credited
    // referral — an invited friend who publishes their own profile — unlocks
    // extra proof-project slots. Kept small and capped so a recycled invite
    // can't be farmed into an unlimited profile.
    this.referralBonusPerReferral = 1;
    this.referralBonusCap = 2;
    this.referralStats = { total: 0, credited: 0 };
    this.supabaseUrl = "https://eusbnfgfurrmrccaxbub.supabase.co";
    this.supabaseKey = "sb_publishable_cpyZT7-regpFjo2qmg0uYQ_j6qwoa21";
    this.siteEnv = "prod"; // "prod" | "test" — set by /config at boot
    this.supabase = null;
    this.currentUser = null; // Supabase auth.users row for the logged-in candidate, or null when signed out
    // Set to true once a query proves the repo_notes table has not been migrated
    // yet, so the UI stops claiming the answers reached the account.
    this._repoNotesUnavailable = false;
    this.initSupabase();

    this.data = this.loadData();
    this.normalizeData();
  }

  initSupabase() {
    try {
      if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
        this.supabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        console.log("⚡ Supabase Cloud Database Connected!");
        this.supabase.auth.onAuthStateChange((_event, session) => {
          this.currentUser = session ? session.user : null;
        });
      }
    } catch (e) {
      console.warn("Supabase SDK initialization notice:", e);
    }
  }

  /**
   * Loads environment-specific backend config from /config (served by a
   * Cloudflare Pages Function). Each Pages project points this same build at
   * its own Supabase project via environment variables. Falls back to the
   * hardcoded production defaults without error when the endpoint is absent
   * (local dev, older deployment), so nothing breaks.
   * Called once at app bootstrap (see app.js init()).
   *
   * Boot must never sit behind a network call, so this uses two guards:
   *  1. The latest fetch result is cached in sessionStorage (per-tab), so a
   *     returning visitor reuses it with zero round trips.
   *  2. The first fetch per tab is capped with a 1.2s hard timeout — if the
   *     edge function is cold-starting or the connection is slow, we fall
   *     back to defaults and let the UI paint instead of hanging the loader.
   */
  async applyConfig() {
    const CACHE_KEY = "swapiki:config:v1";

    const applyTo = (cfg) => {
      let changed = false;
      if (cfg.supabaseUrl && cfg.supabaseUrl !== this.supabaseUrl) {
        this.supabaseUrl = cfg.supabaseUrl;
        changed = true;
      }
      if (cfg.supabaseAnonKey && cfg.supabaseAnonKey !== this.supabaseKey) {
        this.supabaseKey = cfg.supabaseAnonKey;
        changed = true;
      }
      if (cfg.siteEnv) this.siteEnv = cfg.siteEnv;
      if (changed) this.initSupabase();
      return true;
    };

    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) return applyTo(JSON.parse(cached));
    } catch (e) { /* no sessionStorage or corrupt cache — ignore */ }

    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 1200) : null;
      let res;
      try {
        res = await fetch('/config', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (!res.ok) return false;
      const cfg = await res.json();
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
      return applyTo(cfg);
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // ADMIN — full visibility and management across every candidate, job and admin action.
  // Only works if this.isAdminUser is true, which the admin_override RLS
  // policies also independently enforce server-side (defense in depth).
  // ---------------------------------------------------------------------

  async adminListCandidates() {
    if (!this.supabase || !this.isAdminUser) return [];

    const { data, error } = await this.supabase
      .from('candidates')
      .select(`
      id,
      user_id,
      username,
      name,
      email,
      phone,
      title,
      experience,
      location,
      status,
      education,
      expertise,
      linkedin,
      portfolio,
      resume_link,
      profile_status,
      completion_score,
      voice_verified,
      voice_verification_count,
      updated_at
    `)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return data || [];
  }

  /**
   * Sets a candidate's profile_status. Valid values are 'draft', 'published' and
   * 'suspended'. 'suspended' is the fraud takedown state: hidden from the public
   * exactly like a draft, but distinct so an admin can tell a takedown from an
   * unfinished profile — and, per supabase/suspend_migration.sql, a candidate
   * cannot restore it themselves.
   */
  async adminSetProfileStatus(candidateId, status) {
    if (!this.supabase || !this.isAdminUser) throw new Error("Admin access required.");
    const { error } = await this.supabase
      .from('candidates')
      .update({ profile_status: status })
      .eq('id', candidateId);
    if (error) throw error;
  }

  async adminDeleteCandidate(candidateId) {
    if (!this.supabase || !this.isAdminUser) throw new Error("Admin access required.");
    const { error } = await this.supabase
      .from('candidates')
      .delete()
      .eq('id', candidateId);
    if (error) throw error;
  }

  async adminListAdmins() {
    if (!this.supabase || !this.isAdminUser) return [];
    const { data, error } = await this.supabase
      .from('admins')
      .select('user_id, email, created_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /** Promotes an already-registered user to admin, via the secure server-side function. */
  async adminPromoteByEmail(email) {
    if (!this.supabase || !this.currentUser) throw new Error("You must be logged in.");
    const { data: sessionData } = await this.supabase.auth.getSession();
    const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : null;
    if (!accessToken) throw new Error("Your session has expired. Please log in again.");

    const res = await fetch('/api/admin-promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ email })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Could not grant admin access.');
    return result;
  }

  async adminRemoveAdmin(userId) {
    if (!this.supabase || !this.isAdminUser) throw new Error("Admin access required.");
    const { error } = await this.supabase.from('admins').delete().eq('user_id', userId);
    if (error) throw error;
  }

  /**
   * Mints a one-time deep link that joins this account to its Telegram profile
   * when the bot opens, via POST /api/tg-link. Returns { token, deepLink }.
   *
   * A signed-in user needs this because the deep link is what lets the bot tie a
   * Telegram user id back to their candidate row — the channel itself never
   * reveals its members, so the link has to start from our side.
   */
  async getTelegramLink() {
    if (!this.supabase || !this.currentUser) throw new Error("You must be logged in to link Telegram.");
    const { data: sessionData } = await this.supabase.auth.getSession();
    const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : null;
    if (!accessToken) throw new Error("Your session has expired. Please log in again.");

    const res = await fetch('/api/tg-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Could not create the Telegram link.');
    return result;
  }

  /**
   * Total users, published vs. unpublished, and space utilized —
   * all computed in one Postgres round trip by the get_admin_stats() function
   * (see supabase/admin_stats_migration.sql). The function re-checks admin
   * status itself server-side, so this is safe even though it's callable by
   * any authenticated client.
   */
  async adminGetStats() {
    if (!this.supabase || !this.isAdminUser) return null;
    const { data, error } = await this.supabase.rpc('get_admin_stats');
    if (error) throw error;
    return data;
  }

  async adminGetJobsStats() {
    if (!this.supabase || !this.isAdminUser) return { configured: false };
    const { data: sessionData } = await this.supabase.auth.getSession();
    const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : null;
    if (!accessToken) throw new Error("Your session has expired. Please log in again.");

    const res = await fetch('/api/admin-jobs-stats', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Could not load jobs stats.');
    return result;
  }

  /**
   * Average time spent per session (last 30 days), sourced from PostHog via
   * the admin-time-stats serverless function. Returns { configured: false }
   * if PostHog env vars haven't been set up on this deployment yet — that's
   * expected, not an error, so callers should render "—" for it rather than
   * failing the whole dashboard.
   */
  async adminGetTimeStats() {
    if (!this.supabase || !this.isAdminUser) return { configured: false };
    const { data: sessionData } = await this.supabase.auth.getSession();
    const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : null;
    if (!accessToken) throw new Error("Your session has expired. Please log in again.");

    const res = await fetch('/api/admin-time-stats', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Could not load time-spent stats.');
    return result;
  }

  /** Restores an existing session (e.g. on page reload) and updates currentUser. */
  async getSession() {
    if (!this.supabase) return null;
    try {
      const { data } = await this.supabase.auth.getSession();
      this.currentUser = data && data.session ? data.session.user : null;
      if (this.currentUser) {
        await this.loadProfileForUser(this.currentUser);
        // Load the referral counts before the dashboard first paints, so the
        // project-slot meter is right the first time instead of jumping to 5/6
        // after the row loads.
        await this.getReferralStats();
      }
      return data ? data.session : null;
    } catch (e) {
      return null;
    }
  }

  async signUpWithPassword(email, password, fullName) {
    if (!this.supabase) throw new Error("Authentication service is unavailable right now. Please refresh and try again.");
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;
    this.currentUser = data.user || null;
    return data; // { user, session } — session is null if email confirmation is required
  }

  /** Verify the 6-digit email OTP from the signup confirmation email.
   *  Requires "Confirm email" ON and the Confirm signup email template to
   *  render {{ .Token }}. On success the email is confirmed and a session is
   *  issued in the same response. Tries 'signup' then 'email' token types to
   *  match however Supabase tagged the token. */
  async verifyEmailOtp(email, token) {
    if (!this.supabase) throw new Error("Authentication service is unavailable right now. Please refresh and try again.");
    let lastError = null;
    for (const type of ['signup', 'email']) {
      try {
        const { data, error } = await this.supabase.auth.verifyOtp({ email, token, type });
        if (!error) {
          this.currentUser = data.user || null;
          return data; // { user, session }
        }
        lastError = error;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error("Could not verify the code.");
  }

  /** Resend the signup confirmation email (with a fresh OTP). */
  async resendEmailOtp(email) {
    if (!this.supabase) throw new Error("Authentication service is unavailable right now. Please refresh and try again.");
    const { data, error } = await this.supabase.auth.resend({
      type: 'signup',
      email
    });
    if (error) throw error;
    return data;
  }

  async signInWithPassword(email, password) {
    if (!this.supabase) throw new Error("Authentication service is unavailable right now. Please refresh and try again.");
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.currentUser = data.user || null;
    return data;
  }

  async signInWithGoogleIdToken(idToken) {
    if (!this.supabase) throw new Error("Authentication service is unavailable right now. Please refresh and try again.");
    const { data, error } = await this.supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken
    });
    if (error) throw error;
    this.currentUser = data.user || null;
    return data;
  }

  async signOut() {
    if (this.supabase) {
      try { await this.supabase.auth.signOut(); } catch (e) { }
    }
    this.currentUser = null;
    try { localStorage.removeItem(this.key); } catch (e) { }
    this.data = { ...DEFAULT_PROFILE };
    if (typeof window !== 'undefined' && window.posthog && typeof window.posthog.reset === 'function') {
      try { window.posthog.reset(); } catch (e) { }
    }
    return true;
  }

  /** Blank slate for a brand-new authenticated candidate (no demo data). */
  emptyProfileTemplate() {
    return {
      id: null,
      userId: null,
      username: "",
      profileStatus: "draft",
      name: "",
      email: "",
      phone: "",
      title: "",
      experience: "",
      location: "",
      status: "",
      education: "",
      expertise: [],
      avatar: null,
      bio: "",
      linkedin: "",
      twitter: "",
      resumeLink: "",
      portfolio: "",
      locked: false,
      resumeUrl: null,
      loginReminderCount: 0,
      // These match fromSupabaseRow()'s own fallbacks below. Without them
      // here too, a brand-new candidate's very first Dashboard render (before
      // they've saved anything, so recalculateScore() hasn't run yet) shows
      // "undefined%" for Profile Completeness Score instead of 30%.
      completionScore: 30,
      views: 0,
      shares: 0,
      audioListenRate: 0,
      projects: [],
      // Live-recording confirmation state - see recordVoiceVerification().
      voiceVerified: false,
      voiceVerifiedAt: null,
      voiceVerificationCount: 0,
      // Last "this profile is true" attestation from the Edit Profile form: the
      // name as typed at that moment, and when it happened. Recorded so the
      // statement is evidence for a specific save rather than decoration.
      profileAttestedAt: null,
      profileAttestedName: null,
    }
  }
  fromSupabaseRow(row) {
    return {
      id: row.id,
      userId: row.user_id,
      username: row.username || "",
      profileStatus: row.profile_status || "draft",
      name: row.name || "",
      title: row.title || "",
      experience: row.experience || "",
      location: row.location || "",
      bio: row.bio || "",
      linkedin: row.linkedin || "",
      twitter: row.twitter || "",
      resumeLink: row.resume_link || "",
      portfolio: row.portfolio || "",
      locked: row.locked || false,
      avatar: row.avatar || null,
      resumeUrl: row.resume_url || null,
      education: row.education || "",
      status: row.status || "",
      expertise: row.expertise || [],
      email: row.email || "",
      phone: row.phone || "",
      completionScore: row.completion_score ?? 30,
      views: row.views ?? 0,
      shares: row.shares ?? 0,
      audioListenRate: row.audio_listen_rate ?? 0,
      loginReminderCount: row.login_reminder_count ?? 0,
      voiceVerified: row.voice_verified ? true : false,
      voiceVerifiedAt: row.voice_verified_at || null,
      voiceVerificationCount: row.voice_verification_count || 0,
      profileAttestedAt: row.profile_attested_at || null,
      profileAttestedName: row.profile_attested_name || null
    };
  }

  /**
   * Fetches a candidate's PUBLIC profile + projects by username — for
   * anonymous visitors (or anyone) landing on <username>.swapiki.com or
   * /sites/<username>. This is separate from loadProfileForUser/getProfile,
   * which always operate on whoever is currently logged in on this device.
   * Without this, the public link only ever showed whatever profile
   * happened to already be cached locally — the visitor's own profile if
   * they were logged in as someone else, or the empty demo template if not.
   * Returns null if not found or not published (RLS enforces that too).
   *
   * Pass { includeUnpublished: true } for the admin panel's "view profile"
   * link — admins need to preview drafts too, and Supabase's RLS already
   * grants admin accounts read access to every candidate row regardless of
   * status, so this is just removing our own extra filter for that case,
   * not opening up anything the database wouldn't already allow.
   */
  async getProfileByUsername(username, { includeUnpublished = false } = {}) {
    if (!this.supabase || !username) return null;
    console.log('[DEBUG] getProfileByUsername called with', { username, includeUnpublished });
    try {
      let query = this.supabase.from('candidates').select('*').eq('username', username);
      if (!includeUnpublished) query = query.eq('profile_status', 'published');
      // Order newest-first and cap at 1 so a stray duplicate username never
      // trips maybeSingle's "multiple rows returned" and misreports the link
      // as "Profile not found" (a real failure mode we've hit before).
      const { data: row, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
      console.log('[DEBUG] getProfileByUsername result', { row, error });
      if (error) console.warn('[DEBUG] getProfileByUsername Supabase error:', error);
      if (!row) return null;

      const profile = { ...this.emptyProfileTemplate(), ...this.fromSupabaseRow(row) };
      profile.projects = [];

      try {
        const { data: projectRows } = await this.supabase
          .from('projects')
          .select('*')
          .eq('candidate_id', row.id)
          .order('position', { ascending: true });
        if (Array.isArray(projectRows)) {
          profile.projects = projectRows.map(r => this.fromSupabaseProjectRow(r));
        }
      } catch (e) { /* profile still renders, just without projects */ }

      return profile;
    } catch (e) {
      console.warn('[DEBUG] getProfileByUsername threw:', e);
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // JOBS BOARD
  // ---------------------------------------------------------------------

  /**
   * Published jobs for the end-user board. Served exclusively by the
   * get_published_jobs() RPC, which enforces the 80%-completion gate
   * server-side (admin-only table writes; no public read path).
   */
  async getPublishedJobs() {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase.rpc('get_published_jobs');
      if (error) { console.warn('[getPublishedJobs] Supabase error:', error); return []; }
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('[getPublishedJobs] threw:', e);
      return [];
    }
  }

  /**
   * The public board, for visitors who are not signed in or not yet at 80%.
   *
   * getPublishedJobs() reads the get_published_jobs() RPC, which the server
   * gates behind a completed profile, so it returns nothing before sign-in.
   * The listings themselves are public regardless - /jobs.json, /feed.xml,
   * /sitemap.xml and every /jobs/<slug> page are all crawlable without a
   * session - so this reads the same public feed the board's crawlers do.
   * `apply_url` is deliberately dropped: a visitor applies through their proof
   * profile, not a raw outbound link, so the card routes to sign-in instead of
   * straight off-site.
   */
  async getPublicJobs() {
    try {
      const res = await fetch('/jobs.json', { headers: { Accept: 'application/json' } });
      if (!res || !res.ok) return [];
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data && Array.isArray(data.jobs) ? data.jobs : []);
      return rows.map(r => ({
        id: r.id,
        title: r.title,
        company: r.company,
        location: r.location,
        category: r.category,
        description: r.description,
        salary: r.salary,
        salary_min: r.salaryInrPerYear ? r.salaryInrPerYear.min : null,
        salary_max: r.salaryInrPerYear ? r.salaryInrPerYear.max : null,
        first_seen_at: r.datePosted
      }));
    } catch (e) {
      console.warn('[getPublicJobs] threw:', e);
      return [];
    }
  }

  /**
   * Public: submit a job for review from the jobs page.
   *
   * Deliberately not a Supabase insert. `jobs` is admin-insert-only under RLS, and
   * loosening that would let anyone write into the table the public board is
   * rendered from. The write goes through POST /api/submit-job instead, which
   * hardcodes status='draft' and source='user-submission' server-side, so there is
   * no client path to publishing at all.
   *
   * Works signed out. An employer posting an opening has no profile, and gating
   * this behind sign-in or the 80% wall would mean only members could ever
   * contribute a listing.
   */
  async submitJob(input = {}) {
    let res;
    try {
      res = await fetch('/api/submit-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: input.title || '',
          company: input.company || '',
          location: input.location || '',
          salary: input.salary || '',
          category: input.category || 'any',
          contact: input.contact || '',
          description: input.description || '',
          rawText: input.rawText || '',
          skills: Array.isArray(input.skills) ? input.skills : (input.skills ? [input.skills] : []),
          honeypot: input.honeypot || ''
        })
      });
    } catch (e) {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true) {
      // Server validation names the missing fields; a network or 5xx failure does
      // not. Both are surfaced as a single sentence the poster can act on.
      const detail = body && Array.isArray(body.errors) && body.errors.length
        ? body.errors.join(' ')
        : (body && body.error) || `Submission failed (${res.status}).`;
      throw new Error(detail);
    }
    return body;
  }

  /** Admin: full job list (drafts + published + auto-rejected), newest first. */
  async adminListJobs() {
    if (!this.supabase || !this.isAdminUser) return [];
    try {
      const { data, error } = await this.supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('[adminListJobs] threw:', e);
      return [];
    }
  }

  /**
   * Records real candidate interest in a listing (tap on "Apply on the job
   * site"). One click per candidate per job per day (DB unique key) so a
   * single user can't inflate a listing's weekly rank. Fire-and-forget — a
   * tracking hiccup must never block the apply action.
   */
  async recordJobClick(jobId) {
    if (!this.supabase || !this.currentUser || !this.currentUser.id || !jobId) return;
    try {
      await this.supabase
        .from('job_clicks')
        .upsert({
          job_id: jobId,
          user_id: this.currentUser.id,
          day: new Date().toISOString().slice(0, 10),
          device: (navigator && navigator.userAgent ? navigator.userAgent : '').slice(0, 80)
        }, {
          onConflict: 'job_id,user_id,day',
          ignoreDuplicates: true
        });
    } catch (e) {
      console.warn('[recordJobClick] threw:', e);
    }
  }

  /**
   * Records what people are typing into the job-board search box, so the
   * nudge emails can show real "trending searches" (what candidates are
   * actually looking for this week) instead of guesses. Fire-and-forget and
   * throttled by the caller — a tracking hiccup must never slow the board.
   */
  recordSearchEvent(query) {
    if (!this.supabase || !query) return;
    const clean = String(query).trim().slice(0, 60);
    if (clean.length < 2) return;
    this.supabase
      .from('search_events')
      .insert({ query: clean })
      .then(({ error }) => {
        if (error) console.warn('[recordSearchEvent] not recorded:', error.message);
      })
      .catch(() => { });
  }

  // ---------------------------------------------------------------------
  // GITHUB REPO NOTES  ("what did you actually do in this repo?")
  // ---------------------------------------------------------------------

  /**
   * A missing repo_notes table is a deployment state, not a bug: the app keeps
   * working on the device copy either way. Remember that we know, so we stop
   * re-asking on every keystroke, and let the UI say "saved on this device".
   */
  noteRepoNotesUnavailable(error) {
    const code = ((error && error.code) || '') + ' ' + ((error && error.message) || '');
    if (/42P01|PGRST2|does not exist|not found/i.test(code)) {
      if (!this._repoNotesUnavailable) {
        console.warn('[repo notes] not available in the database yet - keeping notes on this device. Run supabase/repo_notes_migration.sql.');
      }
      this._repoNotesUnavailable = true;
      return;
    }
    console.warn('[repo notes] not synced:', error && error.message);
  }

  /** Only the five known fields, as trimmed strings, each capped. Defence in depth for the client-side sanitizing. */
  cleanRepoNotes(notes) {
    const src = notes || {};
    const out = {};
    ['problem', 'role', 'stack', 'hard', 'result'].forEach(k => {
      const v = String(src[k] || '').replace(/\s+/g, ' ').trim().slice(0, 400);
      if (v) out[k] = v;
    });
    return out;
  }

  /**
   * Every note this candidate has written, as { repoName: { notes, updatedAt } }.
   * Returns {} when signed out or the table is missing, so the caller can fall
   * back to the device copy without having to know why.
   */
  async fetchRepoNotes() {
    if (!this.supabase || !this.currentUser) return {};
    const { data, error } = await this.supabase
      .from('repo_notes')
      .select('repo_name, notes, updated_at');
    if (error) {
      this.noteRepoNotesUnavailable(error);
      return {};
    }
    const out = {};
    (data || []).forEach(row => {
      if (row && row.repo_name) {
        out[row.repo_name] = { notes: this.cleanRepoNotes(row.notes), updatedAt: row.updated_at || null };
      }
    });
    return out;
  }

  /**
   * Upserts one repo's notes. Resolves true only when it actually reached the
   * database, so the caller can tell the candidate the truth about where their
   * words are living.
   */
  async saveRepoNote(repoName, notes) {
    const name = String(repoName || '').trim().slice(0, 100);
    if (!name || !this.supabase || !this.currentUser) return false;
    const { error } = await this.supabase
      .from('repo_notes')
      .upsert({
        user_id: this.currentUser.id,
        repo_name: name,
        notes: this.cleanRepoNotes(notes),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,repo_name' });
    if (error) {
      this.noteRepoNotesUnavailable(error);
      return false;
    }
    this._repoNotesUnavailable = false;
    return true;
  }

  /** Forgets one repo's notes on this device and in the account. */
  async deleteRepoNote(repoName) {
    const name = String(repoName || '').trim();
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem('swapiki_repo_notes_' + name); } catch (e) { }
    if (!name || !this.supabase || !this.currentUser) return false;
    const { error } = await this.supabase
      .from('repo_notes')
      .delete()
      .eq('user_id', this.currentUser.id)
      .eq('repo_name', name);
    if (error) {
      this.noteRepoNotesUnavailable(error);
      return false;
    }
    return true;
  }

  /** Admin: publish or unpublish a single job. */
  async adminSetJobStatus(jobId, status) {
    if (!this.supabase || !this.isAdminUser) throw new Error("Admin access required.");
    const { error } = await this.supabase
      .from('jobs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (error) throw error;
  }

  /**
   * Admin: pin or unpin one job above every other listing.
   *
   * A fixed pin, not a ranking signal - see supabase/swaniki_jobs_migration.sql.
   * The board, the weekly digest and the nudge emails all read the same column,
   * so one write here moves a listing in all three.
   *
   * The uuid is checked before it reaches the query, as in the bulk setter: this
   * is admin-only, but it is the one path in the app where a value built from
   * markup is interpolated into a filter.
   */
  async adminSetJobFeatured(jobId, featured) {
    if (!this.supabase || !this.isAdminUser) throw new Error("Admin access required.");
    const id = String(jobId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error('That is not a job id.');
    }
    const { error } = await this.supabase
      .from('jobs')
      .update({ featured: !!featured, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true;
  }

  /**
   * Admin: set the status of many jobs in one write.
   *
   * Bulk is one update, not a loop, because a queue of forty drafts reviewed by
   * hand is exactly the case where forty round trips start failing halfway and
   * leave the reviewer guessing which half landed. One statement is atomic, so
   * the queue is either fully decided or not decided at all.
   *
   * The ids are checked before they reach the query rather than interpolated
   * blind: this is an admin-only path, but it is the one place in the app where
   * a list of values is built from markup.
   */
  async adminSetJobStatusBulk(jobIds, status) {
    if (!this.supabase || !this.isAdminUser) throw new Error("Admin access required.");
    const ids = (Array.isArray(jobIds) ? jobIds : [jobIds])
      .filter(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim()));
    if (!ids.length) throw new Error("No valid job selected.");
    const { error, count } = await this.supabase
      .from('jobs')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', ids)
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    // A short write means some selected rows were not found or not updatable.
    // Reporting the real number is the difference between "Approved 12" and a
    // queue that quietly disagrees with the admin's own selection.
    if (typeof count === 'number' && count !== ids.length) {
      throw new Error(`Only ${count} of ${ids.length} selected jobs could be updated.`);
    }
    return count;
  }

  /** Admin: delete a job. */
  async adminDeleteJob(jobId) {
    if (!this.supabase || !this.isAdminUser) throw new Error("Admin access required.");
    const { error } = await this.supabase.from('jobs').delete().eq('id', jobId);
    if (error) throw error;
  }

  fromSupabaseProjectRow(row) {
    return {
      id: row.id,
      title: row.title || "",
      role: row.role || "",
      impact: row.impact || "",
      tags: row.tags || [],
      githubUrl: row.github_url || "",
      liveUrl: row.live_url || "",
      takeaways: row.takeaways || [],
      audioUrl: row.audio_url || null,
      audioDuration: row.audio_duration || null,
      recordedAt: row.updated_at ? this.timeAgo(row.updated_at) : "Just now"
    };
  }

  timeAgo(isoString) {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return "Just now";
      if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
      const days = Math.floor(hrs / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    } catch (e) {
      return "recently";
    }
  }

  /**
   * Uploads a real file (avatar, resume, project audio) to Supabase Storage
   * and returns its public URL. Replaces the old fake /api/upload stub and
   * giant base64 data URLs stored inline in the database.
   */
  async uploadFile(file, folder) {
    if (!this.supabase || !this.currentUser) {
      throw new Error("You must be logged in to upload files.");
    }
    const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const path = `${this.currentUser.id}/${folder}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await this.supabase
      .storage
      .from('candidate-files')
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data } = this.supabase.storage.from('candidate-files').getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Loads (or initializes) the profile tied to an authenticated Supabase user,
   * so a candidate signing in on a new device gets their real profile back
   * instead of the shared demo profile.
   */
  // -------------------------------------------------------------------------
  // Reconciling the cloud row against what this browser already has
  // -------------------------------------------------------------------------

  /**
   * The fields the Edit Profile form owns. Only these are ever rescued from the
   * local copy: identity and infrastructure (id, username, avatar, status,
   * lock) stay cloud-authoritative, because resurrecting a stale username or a
   * profile status would be worse than losing it.
   */
  static get RECONCILED_FIELDS() {
    return ['name', 'title', 'experience', 'location', 'status', 'education',
      'bio', 'linkedin', 'twitter', 'resumeLink', 'portfolio', 'expertise'];
  }

  _isBlank(value) {
    if (value == null) return true;
    if (Array.isArray(value)) return value.length === 0;
    return String(value).trim() === '';
  }

  /**
   * True when `value` is exactly what the shared demo profile (DEFAULT_PROFILE,
   * "Ananya Sharma") holds for `field`.
   */
  _isDemoValue(field, value) {
    const demo = DEFAULT_PROFILE[field];
    if (this._isBlank(value) || this._isBlank(demo)) return false;
    const norm = v => (Array.isArray(v) ? v.join(',') : String(v)).trim().toLowerCase();
    return norm(value) === norm(demo);
  }

  /**
   * Does this profile carry the demo candidate's data? Judged by the bio and
   * LinkedIn URL, which nobody would ever type verbatim, rather than by fields
   * like location or availability that a real candidate could legitimately
   * share with the demo.
   */
  _hasDemoFingerprint(profile) {
    if (!profile) return false;
    return profile.id === DEFAULT_PROFILE.id
      || profile.username === DEFAULT_PROFILE.username
      || this._isDemoValue('bio', profile.bio)
      || this._isDemoValue('linkedin', profile.linkedin);
  }

  /**
   * Blanks demo values out of a real candidate's profile (in place). Heals
   * accounts that were already contaminated: the cloud row and this browser
   * both hold the demo headline, skills, location, bio and LinkedIn as if the
   * candidate had typed them. The name is never touched - it is the real one.
   */
  _stripDemoValues(profile) {
    if (!this._hasDemoFingerprint(profile)) return false;
    let changed = false;
    SwapikiStore.RECONCILED_FIELDS.forEach(f => {
      if (f === 'name') return;
      if (this._isDemoValue(f, profile[f])) {
        profile[f] = Array.isArray(DEFAULT_PROFILE[f]) ? [] : '';
        changed = true;
      }
    });
    return changed;
  }

  /**
   * Last-write-wins, with one deliberate exception.
   *
   * Taking the cloud row wholesale used to destroy anything the browser had but
   * the cloud did not. That is not a rare race: the profile upsert is
   * fire-and-forget and only logs its failures, so a save that RLS rejects, a
   * dropped connection or an unapplied migration leaves the cloud permanently
   * behind — and then every page load overwrote the user's own edits with the
   * empty cloud copy and saved that back over localStorage. Unrecoverable.
   *
   * So: the newer copy wins, judged by timestamp. A local copy with no
   * timestamp at all predates this rule and cannot prove it is newer, and there
   * the cloud must not blank a field the browser still has a value for — losing
   * data is permanent, keeping a possibly-stale value is not.
   */
  _reconcileProfileWithLocal(cloudData, cloudUpdatedAt) {
    const local = this.data || {};
    const localAt = local.updatedAt ? Date.parse(local.updatedAt) : 0;
    const cloudAt = cloudUpdatedAt ? Date.parse(cloudUpdatedAt) : 0;
    const cloud = { ...cloudData, updatedAt: cloudUpdatedAt || cloudData.updatedAt || null };
    const canArbitrate = localAt > 0 && cloudAt > 0;

    // 1. This browser is demonstrably ahead of the cloud.
    if (canArbitrate && localAt > cloudAt) {
      return { ...local, projects: Array.isArray(local.projects) ? local.projects : [] };
    }

    // 2. The cloud is demonstrably newer, or the same copy: take it whole.
    if (canArbitrate) return cloud;

    // 3. We cannot tell which is newer - a row written before this rule existed,
    // or one whose updated_at never landed. Undecidable must not mean "the
    // cloud wins", because that is the branch that ate people's profiles. So
    // merge conservatively: the cloud leads, and a field it holds empty is
    // filled back in from the browser rather than blanked.
    const merged = { ...cloud };
    let rescued = false;
    // A fresh browser (or one that just signed someone out) holds the shared
    // demo profile in memory. It is not this candidate's data, so it must never
    // be "rescued" into a real account - that is how the demo headline, skills,
    // location, bio and LinkedIn ended up pre-filled for brand-new sign-ups.
    if (this._hasDemoFingerprint(local)) return merged;
    SwapikiStore.RECONCILED_FIELDS.forEach(f => {
      if (this._isBlank(merged[f]) && !this._isBlank(local[f])) {
        merged[f] = local[f];
        rescued = true;
      }
    });
    // A projects embed that came back empty must not silently delete the
    // candidate's proof projects either.
    const cloudProjects = Array.isArray(cloud.projects) ? cloud.projects : [];
    const localProjects = Array.isArray(local.projects) ? local.projects : [];
    if (!cloudProjects.length && localProjects.length) {
      merged.projects = localProjects;
      rescued = true;
    }
    if (rescued) {
      // Stamped so the next load can arbitrate by timestamp instead of falling
      // back here. Persisting is the caller's job - loadProfileForUser ends in
      // saveData(), which writes once and syncs once, rather than this method
      // issuing a second identical upsert of its own.
      merged.updatedAt = new Date().toISOString();
    }
    return merged;
  }

  async loadProfileForUser(user, preferredUsername) {
    if (!user) return this.data;

    // These three only depend on user.id, not on each other — fire them
    // together instead of one-after-another. On a mobile connection each
    // round trip to Supabase can easily cost 200-400ms, so doing this in
    // parallel instead of in sequence is the difference between a ~1.2s
    // and a ~400ms wait every time someone logs in or refreshes the page.
    //
    // The candidates query also embeds `projects(*)` in the same request
    // (a single PostgREST call with a nested select) instead of firing a
    // second, sequential "fetch projects" query once we know the candidate
    // row's id. That second round trip used to run AFTER this whole
    // Promise.all resolved, adding its own 200-400ms on top for every
    // returning user — this removes it entirely for the common case.
    const [profileResult, adminResult] = this.supabase
      ? await Promise.all([
          Promise.resolve(
            this.supabase
              .from('candidates')
              .select('*, projects(*)')
              .eq('user_id', user.id)
              .order('position', { referencedTable: 'projects', ascending: true })
              .order('updated_at', { ascending: false })
              .limit(1)
          ).catch((err) => ({ data: null, error: err })),
          Promise.resolve(this.supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle())
            .catch(() => ({ data: null }))
        ])
      : [{ data: null }, { data: null }];

    // `.limit(1)` returns an array, and `.maybeSingle()` would throw on the
    // rare-but-real case of two rows sharing the same user_id (which has
    // happened — a broken lookup used to silently create a fresh blank row).
    // Picking the most recently updated row breaks that deadlock instead of
    // silently dropping the user into an empty 0%-complete profile.
    const profileRows = Array.isArray(profileResult && profileResult.data) ? profileResult.data : null;
    const remoteProfile = (profileRows && profileRows.length > 0) ? profileRows[0] : null;
    // "The query failed" and "this candidate has no profile yet" are different
    // things, and the old code could not tell them apart: any error, any
    // unexpected shape, or a `projects(*)` embed rejected for a missing column
    // produced no rows, which fell into the branch below that builds a brand
    // new blank profile and saves it over localStorage. One flaky request
    // therefore replaced a real candidate's whole profile with an empty draft.
    const lookupFailed = !!((profileResult && profileResult.error) || (profileRows === null && profileResult && profileResult.data != null));

    if (remoteProfile) {
      const fromCloud = { ...this.emptyProfileTemplate(), ...this.fromSupabaseRow(remoteProfile) };
      fromCloud.projects = Array.isArray(remoteProfile.projects)
        ? remoteProfile.projects.map(r => this.fromSupabaseProjectRow(r))
        : [];
      this.data = this._reconcileProfileWithLocal(fromCloud, remoteProfile.updated_at);
    } else if (lookupFailed) {
      // Keep what this browser already has rather than inventing a new profile.
      console.warn("Profile load failed; keeping the profile already on this device.",
        (profileResult.error && profileResult.error.message) || profileResult.error || 'unexpected response');
    } else {
      const fallbackName = (user.user_metadata && user.user_metadata.full_name) || (user.email || '').split('@')[0];
      const baseUsername = preferredUsername || this.formatNickname(fallbackName);
      // The previous version assigned baseUsername directly with no check
      // against the actual candidates table — only against a per-browser
      // localStorage cache (isNicknameTakenSync), which does nothing to stop
      // two different people signing up from two different devices/browsers
      // from landing on the exact same username. That's exactly how two
      // real accounts both ended up as "yochna-rao", which then made their
      // public profile links (and admin preview) fail with a Postgres
      // "multiple rows returned" error instead of showing either profile.
      const username = await this.findAvailableUsername(baseUsername);
      this.data = {
        ...this.emptyProfileTemplate(),
        id: user.id,
        username,
        name: fallbackName,
        email: user.email || ""
      };
    }

    this.data.userId = user.id;
    if (!Array.isArray(this.data.projects)) this.data.projects = [];
    // Accounts created before the guard above already hold the demo values.
    this._stripDemoValues(this.data);
    this.saveData(this.data);

    // Tie PostHog's anonymous session to this real user, so "time spent"
    // stats on the admin dashboard reflect actual accounts, not one-off
    // anonymous visitors. Safe no-op if PostHog isn't configured.
    if (typeof window !== 'undefined' && window.posthog && typeof window.posthog.identify === 'function') {
      try { window.posthog.identify(user.id, { email: user.email || null }); } catch (e) { }
    }

    this.isAdminUser = !!(adminResult && adminResult.data);

    // A visitor who arrived through someone's ?ref= link carries that intent in
    // localStorage (captureReferralFromUrl, called at boot). Now that the
    // account exists, hand it to the database once. Fire and forget — a
    // referral bookkeeping failure must never block a login.
    if (this.supabase) {
      this.recordReferralIfPending(user).catch(() => {});
    }

    return this.data;
  }

  normalizeData() {
    if (!Array.isArray(this.data.projects)) {
      this.data.projects = [];
    }
    if (!this.data.username) this.data.username = this.data.id || "candidate";
    if (!this.data.profileStatus) this.data.profileStatus = "draft";
    // Live-recording fields are new; older locally-cached profiles lack them.
    // Backfill defaults so nothing downstream reads `undefined`.
    if (typeof this.data.voiceVerified !== 'boolean') this.data.voiceVerified = false;
    if (!this.data.voiceVerifiedAt) this.data.voiceVerifiedAt = null;
    if (typeof this.data.voiceVerificationCount !== 'number') this.data.voiceVerificationCount = 0;
    if (!this.data.profileAttestedAt) this.data.profileAttestedAt = null;
    if (!this.data.profileAttestedName) this.data.profileAttestedName = null;
    // The MFCC "voiceprint" is gone. Drop it from any profile cached by an older
    // build so we stop persisting a biometric we no longer read.
    if (this.data.voiceSignature) delete this.data.voiceSignature;
    this.data.projects = this.data.projects.slice(0, this.getMaxProjects());
    this.saveData(this.data);
  }

  loadData() {
    const raw = localStorage.getItem(this.key);
    if (!raw) {
      this.saveData(DEFAULT_PROFILE);
      return DEFAULT_PROFILE;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse stored Swapiki data, resetting to default.", e);
      this.saveData(DEFAULT_PROFILE);
      return DEFAULT_PROFILE;
    }
  }

  saveData(data) {
    this.data = data;
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (e) {
      console.warn("LocalStorage quota exceeded, retaining memory state.", e);
    }
    this.syncWithApi(data);
  }

  async syncWithApi(data) {
    try {
      // Only push to Supabase once a real authenticated user is attached —
      // the RLS policies require auth.uid() === user_id, so anonymous/demo
      // browsing stays purely local and never hits the cloud table.
      if (this.supabase && this.currentUser) {
        this.supabase.from('candidates').upsert({
          id: data.id || this.currentUser.id,
          user_id: this.currentUser.id,
          username: data.username || 'ananya-sharma',
          name: data.name,
          title: data.title,
          experience: data.experience,
          location: data.location,
          bio: data.bio,
          linkedin: data.linkedin,
          twitter: data.twitter || "",
          resume_link: data.resumeLink || "",
          portfolio: data.portfolio || "",
          locked: data.locked || false,
          email: data.email || null,
          phone: data.phone || null,
          profile_status: data.profileStatus || 'draft',
          avatar: data.avatar || null,
          resume_url: data.resumeUrl || null,
          education: data.education || "",
          status: data.status || "",
          expertise: data.expertise || [],
          completion_score: data.completionScore ?? 30,
          views: data.views ?? 0,
          shares: data.shares ?? 0,
          audio_listen_rate: data.audioListenRate ?? 0,
          updated_at: new Date()
        }).then(({ error }) => {
          if (!error) console.log("☁️ Candidate profile synced to Supabase Cloud Database!");
          else console.warn("Supabase sync notice:", error.message);
        }).catch(() => { });
      }

    } catch (e) { }
  }
  getProfile() {
    return this.data;
  }

  /**
   * Increments this account's login-reminder counter and persists it to
   * Supabase via its own dedicated update (kept separate from the big
   * profile upsert in syncWithApi, so a schema issue with this one column
   * can never block the rest of the profile from saving). Falls back to
   * localStorage too, so the count still works locally even if the
   * Supabase write fails. Returns the new count.
   */
  incrementLoginReminderCount() {
    const next = (this.data.loginReminderCount || 0) + 1;
    this.data = { ...this.data, loginReminderCount: next };
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { }

    if (this.supabase && this.currentUser) {
      this.supabase
        .from('candidates')
        .update({ login_reminder_count: next })
        .eq('user_id', this.currentUser.id)
        .then(({ error }) => {
          if (error) {
            console.warn(
              '⚠️ Could not save login_reminder_count to Supabase. If this says the column does not exist, run: ' +
              'alter table candidates add column login_reminder_count integer not null default 0;',
              error.message
            );
          } else {
            console.log(`☁️ login_reminder_count synced to Supabase: ${next}`);
          }
        })
        .catch((e) => console.warn('⚠️ login_reminder_count Supabase update threw:', e));
    } else {
      console.warn('⚠️ login_reminder_count NOT synced to Supabase — no active Supabase session (this.supabase / this.currentUser missing).');
    }

    return next;
  }

  /**
   * Server-enforced daily allowance for the two accelerator tools: five distinct
   * job posts a day, shared across resume draft and interview prep.
   *
   * The count-and-insert is a single SECURITY DEFINER function in the database
   * (supabase/tool_usage_migration.sql) so two tabs cannot both slip past the
   * limit, and so the browser has no direct write path to the table. The client
   * here only relays the verdict.
   *
   * Returns {allowed, used, remaining, limit, reset_at}. Before the migration
   * has run there is no function to call: that answers {allowed:true,
   * unavailable:true} and the tools keep working (the console names the file).
   * Any *other* failure returns {allowed:false, error} - the client refuses to
   * spend an allowance it could not verify rather than silently allow it.
   */
  async claimToolUsage(jobId, tool) {
    if (!jobId) return { allowed: false, reason: 'missing-job' };
    if (!this.supabase || !this.currentUser) return { allowed: false, reason: 'unauthenticated' };
    try {
      const { data, error } = await this.supabase.rpc('claim_tool_usage', {
        p_job_id: String(jobId),
        p_tool: tool === 'interview' ? 'interview' : 'resume'
      });
      if (error) {
        if (this._isMissingFunction(error)) {
          console.warn(
            '⚠️ claim_tool_usage is not in the database yet; the daily job-post limit is not enforced. ' +
            'Run supabase/tool_usage_migration.sql.',
            error.message
          );
          return { allowed: true, unavailable: true };
        }
        console.warn('⚠️ claim_tool_usage failed:', error.message);
        return { allowed: false, error: error.message || 'tool_usage_unavailable' };
      }
      return (data && typeof data === 'object') ? data : { allowed: true, unavailable: true };
    } catch (e) {
      console.warn('⚠️ claim_tool_usage threw:', e);
      return { allowed: false, error: (e && e.message) || 'tool_usage_unavailable' };
    }
  }

  /** Today's allowance without spending one. Null when signed out or unavailable. */
  async getToolUsageStatus() {
    if (!this.supabase || !this.currentUser) return null;
    try {
      const { data, error } = await this.supabase.rpc('tool_usage_status');
      if (error) return null;
      return data || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * True when the error means the RPC was never created, as opposed to a real
   * failure. PostgREST reports a missing function as PGRST202 ("schema cache")
   * and Postgres as 42883 ("function ... does not exist"); older/newer builds
   * phrase it slightly differently, hence the message fallback.
   */
  _isMissingFunction(error) {
    if (!error) return false;
    const code = String(error.code || '');
    if (code === 'PGRST202' || code === '42883') return true;
    return /does not exist|could not find the function|schema cache/i.test(String(error.message || ''));
  }

  /**
   * First-touch referral capture. If this visit arrived through someone's
   * invite link (https://swapiki.com/?ref=<username>), remember the handle so
   * it can be attributed once an account is actually created. Deliberately
   * first-touch: an existing attribution is never overwritten, so a later link
   * click on the same browser can't steal credit. The value is sanitized to the
   * same slug shape as a username and ignored if it isn't one.
   */
  captureReferralFromUrl() {
    try {
      const href = (typeof window !== 'undefined' && window.location && window.location.href)
        ? String(window.location.href) : '';
      if (!href) return null;
      // Matches ?ref=x, &ref=x and a #hash?ref=x all at once; no URL dependency
      // so this also runs under the Node test sandbox.
      const match = /[?&#]ref=([^&#]+)/.exec(href);
      if (!match) return null;
      const ref = decodeURIComponent(match[1]).trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(ref)) return null;
      if (!localStorage.getItem('swapiki_ref')) {
        localStorage.setItem('swapiki_ref', ref);
      }
      return ref;
    } catch (e) {
      return null;
    }
  }

  /**
   * Attributes a stored invite to the now-signed-in account, once. The database
   * function takes the referred id from auth.uid() and rejects self-referrals,
   * so this is a relay, not an authority. Returns a small verdict object; a
   * missing migration is reported (so the console names the file) but never
   * throws into the login path.
   */
  async recordReferralIfPending(user) {
    try {
      if (!this.supabase || !user || !user.id) {
        return { recorded: false, reason: 'unauthenticated' };
      }
      let ref = null;
      try { ref = localStorage.getItem('swapiki_ref'); } catch (e) { ref = null; }
      if (!ref) return { recorded: false, reason: 'no-ref' };

      // Belt-and-braces: never let someone attribute a referral to themselves.
      const ownUsername = String((this.data && this.data.username) || '').toLowerCase();
      if (ownUsername && ref === ownUsername) {
        try { localStorage.removeItem('swapiki_ref'); } catch (e) {}
        return { recorded: false, reason: 'self' };
      }

      const flagKey = 'swapiki_ref_recorded:' + user.id;
      try { if (localStorage.getItem(flagKey)) return { recorded: false, reason: 'already-recorded' }; } catch (e) {}

      const { data, error } = await this.supabase.rpc('record_referral', { p_referrer_username: ref });
      if (error) {
        if (this._isMissingFunction(error)) {
          console.warn(
            '⚠️ record_referral is not in the database yet; referrals are not being tracked. ' +
            'Run supabase/referrals_migration.sql.',
            error.message
          );
        } else {
          console.warn('⚠️ record_referral failed:', error.message);
        }
        return { recorded: false, error: (error && error.message) || 'referral_unavailable' };
      }

      try {
        localStorage.setItem(flagKey, '1');
        localStorage.removeItem('swapiki_ref');
      } catch (e) {}
      return (data && typeof data === 'object') ? data : { recorded: true };
    } catch (e) {
      console.warn('⚠️ recordReferralIfPending threw:', e);
      return { recorded: false, error: (e && e.message) || 'referral_unavailable' };
    }
  }

  /**
   * This account's referral counts: { total, credited }. Cached on the instance
   * so getReferralBonus()/getMaxProjects() can stay synchronous. Returns zeros
   * (and leaves the previous cache untouched) when signed out or when the
   * migration hasn't run, so callers never have to special-case it.
   */
  async getReferralStats() {
    if (!this.supabase || !this.currentUser) return { total: 0, credited: 0 };
    try {
      const { data, error } = await this.supabase.rpc('my_referral_stats');
      if (error) {
        if (!this._isMissingFunction(error)) {
          console.warn('⚠️ my_referral_stats failed:', error.message);
        }
        return { total: 0, credited: 0 };
      }
      const credited = Math.max(0, Number(data && data.credited) || 0);
      const total = Math.max(0, Number(data && data.total) || 0);
      this.referralStats = { total: total, credited: credited };
      return this.referralStats;
    } catch (e) {
      return { total: 0, credited: 0 };
    }
  }

  /** Extra project slots earned from credited referrals, capped. */
  getReferralBonus() {
    const credited = (this.referralStats && this.referralStats.credited) || 0;
    return Math.min(credited * this.referralBonusPerReferral, this.referralBonusCap);
  }

  /** Effective project-slot cap: the base four plus any referral bonus. */
  getMaxProjects() {
    return this.maxProjects + this.getReferralBonus();
  }

  updateProfile(updates) {
    this.data = { ...this.data, ...updates };
    this.recalculateScore();
    this.saveData(this.data);
    return this.data;
  }

  publishProfile() {
    this.data.profileStatus = "published";
    this.saveData(this.data);
    return this.data;
  }

  unpublishProfile() {
    this.data.profileStatus = "draft";
    this.saveData(this.data);
    return this.data;
  }

  /** Fire-and-forget upsert of one project row to the cloud, mirroring the local edit just made. */
  syncProjectToCloud(project) {
    if (!this.supabase || !this.currentUser || !this.data.id) return;
    this.supabase.from('projects').upsert({
      id: project.id,
      candidate_id: this.data.id,
      user_id: this.currentUser.id,
      title: project.title,
      role: project.role,
      impact: project.impact,
      tags: project.tags || [],
      github_url: project.githubUrl,
      live_url: project.liveUrl,
      takeaways: project.takeaways || [],
      audio_url: project.audioUrl,
      audio_duration: project.audioDuration,
      position: this.data.projects.findIndex(p => p.id === project.id),
      updated_at: new Date()
    }).then(({ error }) => {
      if (error) console.warn("Project sync notice:", error.message);
    }).catch(() => { });
  }

  addProject(project) {
    const maxProjects = this.getMaxProjects();
    if (this.data.projects.length >= maxProjects) {
      throw new Error(`A profile can contain no more than ${maxProjects} projects.`);
    }
    const newProject = {
      id: "p_" + Date.now(),
      recordedAt: "Just now",
      takeaways: project.takeaways || [],
      tags: project.tags || [],
      ...project
    };
    this.data.projects.unshift(newProject);
    this.recalculateScore();
    this.saveData(this.data);
    this.syncProjectToCloud(newProject);
    return newProject;
  }

  updateProject(projectId, updatedFields) {
    const projIndex = this.data.projects.findIndex(p => p.id === projectId);
    if (projIndex !== -1) {
      this.data.projects[projIndex] = {
        ...this.data.projects[projIndex],
        ...updatedFields,
        updatedAt: "Just now"
      };
      this.recalculateScore();
      this.saveData(this.data);
      this.syncProjectToCloud(this.data.projects[projIndex]);
      return this.data.projects[projIndex];
    }
    throw new Error("Project not found.");
  }

  updateProjectAudio(projectId, audioBlobUrl, durationStr) {
    const proj = this.data.projects.find(p => p.id === projectId);
    if (proj) {
      proj.audioUrl = audioBlobUrl;
      proj.audioDuration = durationStr || "01:30";
      proj.recordedAt = "Just now";
      this.recalculateScore();
      this.saveData(this.data);
      this.syncProjectToCloud(proj);
    }
  }

  /** Uploads a recorded/selected audio file to Storage and attaches its real URL to the project. */
  async uploadProjectAudio(projectId, audioFile, durationStr) {
    const url = await this.uploadFile(audioFile, `projects/${projectId}`);
    this.updateProjectAudio(projectId, url, durationStr);
    return url;
  }

  // ---------------------------------------------------------------------
  // VOICE IDENTITY VERIFICATION
  // The anti-fraud layer (js/audioEngine.js) produces a per-recording result;
  // this persists it to the candidate profile. The cloud write is deliberately
  // isolated from the big profile upsert in syncWithApi (same pattern as
  // incrementLoginReminderCount) so a schema mismatch — e.g. the
  // voice_verification_migration.sql hasn't been run yet in a given Supabase
  // project — degrades to a console warning instead of blocking the entire
  // profile save.
  // ---------------------------------------------------------------------

  /**
   * Records one live-recording check outcome for this candidate.
   * { verified } - true only when a real microphone captured audio that spoke
   * this attempt's random code. There is no enrolled voiceprint and no
   * similarity score: this says nothing about WHO spoke, only that the recording
   * was made live and is not a replay.
   */
  recordVoiceVerification({ verified, verifiedAt }) {
    const count = (this.data.voiceVerificationCount || 0) + 1;
    const now = verifiedAt || new Date().toISOString();

    this.data.voiceVerificationCount = count;
    this.data.voiceVerified = !!verified;
    if (verified) {
      this.data.voiceVerifiedAt = now;
    }
    this.data = { ...this.data };
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { }

    if (this.supabase && this.currentUser) {
      const payload = {
        voice_verified: this.data.voiceVerified,
        voice_verified_at: this.data.voiceVerifiedAt,
        voice_verification_count: this.data.voiceVerificationCount
      };
      this.supabase
        .from('candidates')
        .update(payload)
        .eq('user_id', this.currentUser.id)
        .then(({ error }) => {
          if (error) {
            console.warn(
              '⚠️ Could not sync voice-verification fields to Supabase. If this says the column does not exist, run ' +
              'supabase/voice_verification_migration.sql in the Supabase SQL editor.',
              error.message
            );
          } else {
            console.log(`☁️ Voice verification synced: verified=${this.data.voiceVerified}, attempt #${count}`);
          }
        })
        .catch((e) => console.warn('⚠️ Voice verification Supabase update threw:', e));
    }

    return this.data;
  }

  /**
   * Records the Edit Profile form's "these details are true and my own work"
   * attestation: the name as typed now, and the time.
   *
   * Kept in its own isolated Supabase update rather than in the big profile
   * upsert. That upsert is the main save path, so if the attestation columns
   * have not been migrated yet, a combined write would fail the whole profile
   * sync. This way a missing column only skips the attestation and logs a
   * warning, exactly like recordVoiceVerification() and the login reminder.
   */
  recordProfileAttestation({ name, attestedAt } = {}) {
    const now = attestedAt || new Date().toISOString();
    const signedName = typeof name === 'string' ? name.trim() : '';

    this.data = { ...this.data };
    this.data.profileAttestedAt = now;
    this.data.profileAttestedName = signedName || null;
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { }

    if (this.supabase && this.currentUser) {
      this.supabase
        .from('candidates')
        .update({
          profile_attested_at: this.data.profileAttestedAt,
          profile_attested_name: this.data.profileAttestedName
        })
        .eq('user_id', this.currentUser.id)
        .then(({ error }) => {
          if (error) {
            console.warn(
              'Could not sync the profile attestation to Supabase. If this says the column does not exist, run ' +
              'supabase/profile_attestation_migration.sql in the Supabase SQL editor.',
              error.message
            );
          } else {
            console.log('Profile attestation synced:', this.data.profileAttestedAt);
          }
        })
        .catch((e) => console.warn('Profile attestation Supabase update threw:', e));
    }

    return this.data;
  }

  /**
   * In-app feedback, local-first. Always persists to localStorage
   * (swapiki_feedback) so a visitor's feedback survives even if the cloud
   * write fails; then syncs to the feedback table in an isolated call (same
   * pattern as recordVoiceVerification) so a missing migration can never
   * break the rest of the app — it only logs a console warning.
   */
  submitFeedback({ category, message, email, name, url } = {}) {
    const entry = {
      id: "fb_" + Date.now(),
      user_id: this.currentUser ? this.currentUser.id : null,
      name: name || (this.data && this.data.name) || (this.currentUser && this.currentUser.user_metadata && this.currentUser.user_metadata.full_name) || null,
      email: email || (this.data && this.data.email) || (this.currentUser && this.currentUser.email) || null,
      category: category || 'general',
      message: String(message || '').trim(),
      url: url || (typeof window !== 'undefined' ? window.location.pathname + window.location.hash : ''),
      created_at: new Date().toISOString()
    };
    if (!entry.message) return { ok: false, error: "Message is required." };

    try {
      const raw = localStorage.getItem('swapiki_feedback');
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(entry);
      localStorage.setItem('swapiki_feedback', JSON.stringify(list));
    } catch (e) { }

    if (this.supabase) {
      this.supabase
        .from('feedback')
        .insert({
          user_id: entry.user_id,
          name: entry.name,
          email: entry.email,
          category: entry.category,
          message: entry.message,
          url: entry.url
        })
        .then(({ error }) => {
          if (error) {
            console.warn(
              '⚠️ Could not sync feedback to Supabase. If this says the table does not exist, run ' +
              'supabase/feedback_migration.sql in the Supabase SQL editor.',
              error.message
            );
          } else {
            console.log('☁️ Feedback synced to Supabase Cloud Database.');
          }
        })
        .catch((e) => console.warn('⚠️ Feedback Supabase insert threw:', e));
    }

    return { ok: true, id: entry.id };
  }

  /**
   * Sends a visitor's report about a public profile to the team.
   *
   * The write goes through the Pages Function at POST /api/report-profile, which
   * stores the row with the service role and pings the admin's Telegram. So the
   * public client needs no write policy on profile_reports and the report lands
   * even for a logged-out visitor. Returns { ok, id } or { ok: false, error }.
   */
  async reportProfile({ candidateId, reason, details, email, pageUrl } = {}) {
    if (!candidateId) return { ok: false, error: 'No profile to report.' };
    try {
      const res = await fetch('/api/report-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          reason: reason || 'other',
          details: details || '',
          email: email || '',
          page_url: pageUrl || ''
        })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.ok === false) {
        return { ok: false, error: out.error || 'Could not send the report.' };
      }
      return { ok: true, id: out.id };
    } catch (e) {
      return { ok: false, error: 'Network error — please try again.' };
    }
  }

  /** The open profile reports, newest first (requires isAdminUser, enforced by RLS too). */
  async adminListProfileReports() {
    if (!this.supabase || !this.isAdminUser) return [];
    const { data, error } = await this.supabase
      .from('profile_reports')
      .select('id, candidate_id, reason, details, reporter_email, page_url, status, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  }

  /** Marks a profile report resolved — 'dismissed' when groundless, 'actioned' when acted on. */
  async adminResolveProfileReport(reportId, status) {
    if (!this.supabase || !this.isAdminUser) throw new Error('Admin access required.');
    const { error } = await this.supabase
      .from('profile_reports')
      .update({ status: status || 'reviewed', reviewed_at: new Date().toISOString() })
      .eq('id', reportId);
    if (error) throw error;
  }

  /** Admin view of all submitted feedback (requires isAdminUser, enforced by RLS too). */
  async adminListFeedback() {
    if (!this.supabase || !this.isAdminUser) return [];
    const { data, error } = await this.supabase
      .from('feedback')
      .select('id, user_id, name, email, category, message, url, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  }

  /**
   * Stores the per-project audit trail of the live-recording check (challenge
   * session, spoken code, what the recogniser heard) on the project object —
   * local only, so it survives in localStorage without requiring any new cloud
   * column.
   */
  markProjectVoiceCheck(projectId, checkMeta) {
    const proj = this.data.projects.find(p => p.id === projectId);
    if (!proj) return null;
    proj.voiceCheck = {
      status: checkMeta.status || 'unknown',
      reason: checkMeta.reason || null,
      sessionId: checkMeta.sessionId || null,
      code: checkMeta.code || null,
      phrase: checkMeta.phrase || null,
      durationSeconds: checkMeta.durationSeconds || null,
      liveMic: !!checkMeta.liveMic,
      speechSupported: checkMeta.speechSupported != null ? !!checkMeta.speechSupported : null,
      transcript: typeof checkMeta.transcript === 'string' ? checkMeta.transcript.slice(0, 500) : null,
      missingWords: Array.isArray(checkMeta.missingWords) ? checkMeta.missingWords : null,
      checkedAt: new Date().toISOString()
    };
    this.data = { ...this.data };
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { }
    this.syncProjectToCloud(proj);
    return proj.voiceCheck;
  }

  deleteProject(projectId) {
    this.data.projects = this.data.projects.filter(p => p.id !== projectId);
    this.recalculateScore();
    this.saveData(this.data);
    if (this.supabase && this.currentUser) {
      this.supabase.from('projects').delete().eq('id', projectId).eq('user_id', this.currentUser.id)
        .then(({ error }) => { if (error) console.warn("Project delete notice:", error.message); })
        .catch(() => { });
    }
  }

  recalculateScore() {
    let score = 30;
    if (this.data.name && this.data.title) score += 20;
    if (this.data.projects.length > 0) score += 25;
    if (this.data.projects.some(p => p.audioUrl || p.audioDuration)) score += 25;
    this.data.completionScore = Math.min(100, score);
    // Stamped here because this runs on exactly the paths that mutate the
    // profile, and nowhere on load - stamping inside saveData() instead would
    // make every page load look newer than the cloud and push a stale copy back
    // up on every visit.
    this.data.updatedAt = new Date().toISOString();
  }

  incrementViews() {
    this.data.views = (this.data.views || 0) + 1;
    this.saveData(this.data);
  }

  incrementShares() {
    this.data.shares = (this.data.shares || 0) + 1;
    this.saveData(this.data);
  }

  recordShareEvent(type, referrer) {
    if (!Array.isArray(this.data.shareEvents)) this.data.shareEvents = [];
    this.data.shareEvents.push({
      type,
      referrer: referrer || document.referrer || "direct",
      timestamp: new Date().toISOString()
    });
    this.incrementShares();

    if (this.supabase && this.data.id) {
      this.supabase.from('share_events').insert({
        candidate_id: this.data.id,
        type,
        referrer: referrer || (typeof document !== 'undefined' ? document.referrer : "") || "direct"
      }).then(({ error }) => {
        if (error) console.warn("Share event log notice:", error.message);
      }).catch(() => { });
    }
  }

  /**
   * Logs that someone's PUBLIC profile was opened, recorded against the profile
   * that was opened rather than the person doing the opening.
   *
   * recordShareEvent() above logs the other direction - "I shared MY profile" -
   * under this.data.id, which is the sharer's own row. A view is the mirror
   * image: the row that needs the number is the one being looked at, and the
   * viewer is usually a logged-out recruiter whose id we do not have. The
   * share_events insert policy is deliberately open to anonymous visitors
   * ("write-only analytics"), so the event is durable even though the visitor
   * cannot be identified.
   *
   * WHY NO VIEWER ID IS STORED: the table has nowhere to put one. That means
   * "unique visitors" is not answerable from these rows, and the admin dashboard
   * reports total views rather than inventing a distinct count it cannot
   * support. The referrer is the signal that tells you WHERE they arrived from,
   * which is the actionable half of the same question.
   */
  recordProfileView(profileId, referrer) {
    if (!this.supabase || !profileId) return;
    this.supabase
      .from('share_events')
      .insert({
        candidate_id: profileId,
        type: 'view',
        referrer: referrer || (typeof document !== 'undefined' ? document.referrer : '') || 'direct'
      })
      .then(({ error }) => {
        if (error) console.warn('Profile view log notice:', error.message);
      })
      .catch(() => { });
  }

  formatNickname(nick) {
    if (!nick) return '';
    // Allow alphanumeric characters, underscores (_), and hyphens (-)
    return nick.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * Registration rule: a handle can only be registered/locked once it
   * contains at least one letter (the "name" part) AND at least one
   * number — e.g. "rahul92", "priya-k7". Pure names or pure numbers
   * are not enough on their own.
   */
  handleHasNameAndNumber(cleanNick) {
    if (!cleanNick) return false;
    return /[a-z]/.test(cleanNick) && /[0-9]/.test(cleanNick);
  }

  /**
   * Picks a username for a brand-new candidate that's actually guaranteed
   * free in the database — not just "probably free according to this one
   * browser's localStorage", which is all the older isNicknameTakenSync()
   * check above could ever verify. Tries "base", then "base-2", "base-3",
   * etc. until it finds one with no existing row in `candidates`.
   */
  async findAvailableUsername(base) {
    const clean = this.formatNickname(base) || 'candidate';
    if (!this.supabase) return clean; // offline/demo mode — nothing to check against

    for (let suffix = 0; suffix < 50; suffix++) {
      const candidate = suffix === 0 ? clean : `${clean}-${suffix + 1}`;
      try {
        const { data, error } = await this.supabase
          .from('candidates')
          .select('id')
          .eq('username', candidate)
          .limit(1);
        if (!error && (!data || data.length === 0)) return candidate;
      } catch (e) {
        // If the check itself fails (network blip, etc.), fall back to the
        // plain candidate name rather than blocking signup entirely — worst
        // case is the same collision risk as before, not a broken signup.
        return candidate;
      }
    }
    // Extremely unlikely fallback: 50 collisions in a row. Append a short
    // random suffix so signup can never get permanently stuck here.
    return `${clean}-${Math.random().toString(36).slice(2, 6)}`;
  }

  isNicknameTakenSync(nickname, currentUserId) {
    const cleanNick = this.formatNickname(nickname);
    if (!cleanNick) return false;

    // Disallow reserved handles (admin, administrator, test, api, etc.)
    const reserved = ['admin', 'administrator', 'test', 'api', 'dashboard', 'sites', 'profile', 'landing', 'recruiter', 'support', 'help', 'app', 'root', 'user'];
    if (reserved.includes(cleanNick)) return true;

    // Disallow numbers-only handles
    if (/^\d+$/.test(cleanNick)) return true;

    // Check LocalStorage taken list
    const activeUserId = currentUserId || this.data.id || 'ananya_sharma';
    const takenRaw = localStorage.getItem('swapiki_taken_nicknames');
    let takenMap = { 'rahul-verma': 'rahul_verma', 'priya-patel': 'priya_patel' };
    if (this.data.username) {
      takenMap[this.data.username] = activeUserId;
    }

    try {
      if (takenRaw) takenMap = { ...takenMap, ...JSON.parse(takenRaw) };
    } catch (e) { }

    // Check if taken by ANOTHER user
    const ownerId = takenMap[cleanNick];
    if (ownerId && ownerId !== activeUserId) {
      return true;
    }
    return false;
  }

  async isNicknameTaken(nickname, currentUserId) {
    const cleanNick = this.formatNickname(nickname);
    if (!cleanNick) return false;

    // 1. Instant local check (0ms)
    if (this.isNicknameTakenSync(cleanNick, currentUserId)) {
      return true;
    }

    // 2. Fast bounded Supabase check (max 150ms timeout)
    if (this.supabase) {
      try {
        const queryPromise = this.supabase
          .from('candidates')
          .select('id, username')
          .eq('username', cleanNick);
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ data: null }), 150));
        const res = await Promise.race([queryPromise, timeoutPromise]);
        if (res && res.data && res.data.length > 0) {
          const matched = res.data.find(c => c.id !== (currentUserId || this.data.id));
          if (matched) return true;
        }
      } catch (e) { }
    }

    return false;
  }

  registerNickname(nickname, userId) {
    const cleanNick = this.formatNickname(nickname);
    if (!cleanNick) return;
    const takenRaw = localStorage.getItem('swapiki_taken_nicknames');
    let takenMap = { 'ananya-sharma': 'ananya_sharma', 'rahul-verma': 'rahul_verma', 'priya-patel': 'priya_patel' };
    try {
      if (takenRaw) takenMap = { ...takenMap, ...JSON.parse(takenRaw) };
    } catch (e) { }
    takenMap[cleanNick] = userId || this.data.id;
    try {
      localStorage.setItem('swapiki_taken_nicknames', JSON.stringify(takenMap));
    } catch (e) { }
  }
}

window.swapikiStore = new SwapikiStore();
