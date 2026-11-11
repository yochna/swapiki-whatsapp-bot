// Swapiki runtime configuration.
//
// Values below are intentionally empty defaults. Each deployment injects its own
// values via Cloudflare Pages environment variables (or by replacing this file
// with a server route that reads env vars). Never hardcode production IDs here.

window.SWAPIKI_CONFIG = {
  // Google OAuth 2.0 Web Client ID (APIs & Services > Credentials > OAuth client ID).
  // Public by design; safe in frontend code. Never ship the Client Secret here.
  GOOGLE_CLIENT_ID: "",

  // GitHub OAuth App client ID, used by the interview-prep project picker.
  // Public by design; device flow needs no client secret.
  GITHUB_CLIENT_ID: "",

  // Total storage allotted for the `candidate-files` Supabase bucket (avatars,
  // resumes, project audio). Used only to turn the raw "Space Utilized" byte
  // count shown on the Admin Dashboard into a percentage. Defaults to 1 GB,
  // matching Supabase's free-tier storage limit.
  STORAGE_QUOTA_BYTES: 1024 * 1024 * 1024,

  // Public channels the jobs board is broadcast to. Everything here is public
  // by design (invite links anyone can open), so they belong in frontend config.
  //
  // Leave any value empty and its join card is simply not rendered.
  TELEGRAM_BOT_USERNAME: "Swapiki_bot",
  TELEGRAM_CHANNEL_URL: "https://t.me/Swapiki_job",
  WHATSAPP_CHANNEL_URL: "https://whatsapp.com/channel/0029VbEiJCcAO7R8ULsjfQ3v"
};
