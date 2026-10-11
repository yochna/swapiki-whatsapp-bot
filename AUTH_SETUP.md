# Swapiki Authentication — Setup Guide

What changed: signup/login now go through **Supabase Auth** (email/password +
Google Sign-In), instead of just writing a name into localStorage. Sessions
persist across visits, `dashboard`/`add-project` are protected routes, and
candidate profiles are locked to their owner via Row Level Security (RLS).

Two things need to be configured before this works in production. Both are
free and take about 10 minutes total.

## 1. Run the database migration (required for signup/login to work at all)

1. Go to your Supabase project → **SQL Editor**.
2. Open `supabase/auth_migration.sql` from this repo, paste it in, and run it.
3. This adds a `user_id` column to `candidates`, turns on Row Level Security,
   and adds policies so users can only read/write their own profile (except
   published profiles, which stay publicly readable for recruiters).

Without this step, email/password signup will still work (Supabase Auth is
separate from your table), but profile data won't sync to the cloud — it'll
silently stay local-only, since the RLS policy will reject the writes.

## 2. Turn on Google Sign-In (optional, but you asked for it)

**A. Create a Google OAuth Client ID**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. **APIs & Services → OAuth consent screen** — set it up (External, add your app name/logo).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**
   - Authorized JavaScript origins: your site's URL, e.g. `https://swapiki.vercel.app` and `http://localhost:3000` for local testing
   - You do **not** need a redirect URI for this (we use Google Identity Services' credential flow, not classic redirect OAuth).
4. Copy the generated **Client ID** (looks like `123456-abc.apps.googleusercontent.com`).

**B. Enable Google in Supabase**
1. Supabase Dashboard → **Authentication → Providers → Google** → toggle on.
2. Paste in the same Client ID, plus the **Client Secret** shown next to it in Google Cloud Console.
3. Save.

**C. Tell the frontend about it**
Open `config.js` in this repo and replace the placeholder:

```js
window.SWAPIKI_CONFIG = {
  GOOGLE_CLIENT_ID: "123456-abc.apps.googleusercontent.com" // <- your real ID
};
```

Until you do this, the Google button quietly doesn't render (email/password
still works fine) — it never shows a broken button.

## 3. Email confirmation setting (your call)

Supabase Dashboard → **Authentication → Providers → Email → "Confirm email".**
- **Off**: users are logged in immediately after signup (matches the old instant-signup feel).
- **On**: users get a confirmation email first, then log in. The frontend already
  handles both cases (`js/app.js` → `handleSignup`).

## 4. Voice identity verification migration (recommended — powers the "Voice Verified" badge)

Open `supabase/voice_verification_migration.sql` in SQL Editor and run it. This
adds `voice_verified`, `voice_verified_at`, `voice_signature`, and
`voice_verification_count` to `candidates`. Without it, the anti-fraud voice
check still runs but its result is only stored locally (the app logs a clear
warning pointing here), so the badge won't appear on your public profiles.

## What you get after this

- Real accounts: email/password or Google, via Supabase Auth
- Sessions persist across reloads/devices (no more "profile disappears in a new browser")
- `dashboard` and `add-project` routes require login and bounce to the Login modal otherwise
- Logout button in the nav (desktop + mobile) when signed in
- Each candidate's row in `candidates` is locked to their `user_id` via RLS — one user can't overwrite another's profile
- Public candidate pages (`/sites/:username`, `/profile/:username`) stay fully public — no login required to view a published profile
- Anti-fraud voice identity: random challenge phrase + voiceprint consistency; passing candidates show a "Voice Verified" badge

## Files touched

- `config.js` — new, holds your public Google Client ID
- `js/googleAuth.js` — added `initGoogleSignIn()` to actually render/init the Google button (was previously dead code)
- `js/store.js` — added Supabase Auth methods (`signUpWithPassword`, `signInWithPassword`, `signInWithGoogleIdToken`, `signOut`, `getSession`, `loadProfileForUser`), scoped cloud sync to the logged-in user
- `js/app.js` — login modal, Google callback, logout, route protection, auth-aware nav
- `index.html` — Google Identity Services script, login modal, nav login/logout state, password field on signup now actually used
- `supabase/auth_migration.sql` — new, run this in Supabase SQL Editor
- `tests/google-auth.test.js` — added coverage for the new button-init helper
