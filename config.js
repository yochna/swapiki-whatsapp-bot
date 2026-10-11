// Swapiki runtime configuration.
//
// Replace GOOGLE_CLIENT_ID below with your real OAuth 2.0 Web Client ID from
// Google Cloud Console (APIs & Services > Credentials > Create Credentials >
// OAuth client ID > Application type: Web application).
//
// This value is PUBLIC by design (it identifies your app to Google, it does
// not authenticate anything on its own) and is safe to ship in frontend code.
// Do not put your Google "Client Secret" here — Google Identity Services
// (One Tap / Sign In With Google) never needs it.
//
// If you deploy on Vercel and want to inject this per-environment instead of
// hardcoding it, you can replace this file with a tiny serverless route that
// returns `window.SWAPIKI_CONFIG = {...}` populated from an environment
// variable, and load that route's URL instead of config.js in index.html.

window.SWAPIKI_CONFIG = {
  GOOGLE_CLIENT_ID: "962062498493-51dfvusjp2mub32jmslnoqo4lqksat8m.apps.googleusercontent.com",

  // GitHub OAuth App client ID, used by the interview-prep project picker so a
  // candidate can sign in with one click and have BOTH public and private repos
  // ranked against a job description.
  //
  // This app has "Device flow" enabled, so the picker can start a sign-in with
  // no client secret and no callback URL. Verified working 2026-09-28.
  //
  // The client ID is PUBLIC by design (it only identifies the app) and the
  // device flow needs no client secret, so nothing secret is ever shipped to
  // the browser. Leave it empty and the picker falls back to reading a user's
  // PUBLIC repos from a pasted profile link, which needs no sign-in at all.
  GITHUB_CLIENT_ID: "Ov23li2Fyc3oOvs68K6C",

  // Total storage allotted for the `candidate-files` Supabase bucket (avatars,
  // resumes, audio). Used only to turn the raw "Space Utilized" byte count
  // shown on the Admin Dashboard into a percentage. Defaults to 1 GB, which
  // matches Supabase's free-tier storage limit — bump it if you are on a
  // paid plan with a bigger bucket quota.
  STORAGE_QUOTA_BYTES: 1024 * 1024 * 1024,

  // Public channels the jobs board is broadcast to. Everything here is public
  // by design (these are invite links anyone can open), so they belong in
  // frontend config rather than a secret.
  //
  // TELEGRAM_BOT_USERNAME is the @handle without the @ (e.g. "SwapikiJobsBot").
  // It is what builds the t.me/<bot>?start=<token> deep link that ties a
  // Telegram user to their Swapiki account for onboarding.
  //
  // Leave any value empty and its join card is simply not rendered, so the
  // board never ships a dead button.
  TELEGRAM_BOT_USERNAME: "Swapiki_bot",
  TELEGRAM_CHANNEL_URL: "https://t.me/Swapiki_job",
  WHATSAPP_CHANNEL_URL: "https://whatsapp.com/channel/0029VbEiJCcAO7R8ULsjfQ3v"
};
