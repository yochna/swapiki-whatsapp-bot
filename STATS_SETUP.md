# Swapiki Admin Statistics — Setup Guide

What changed: the Admin Dashboard now shows six stat cards at the top —
**Published**, **Unpublished**, **Total Users**, **Recruiters**, **Space
Utilized**, and **Avg. Time Spent**.

Five of these come straight from Postgres (fast, free, no third-party
service). Only "Avg. Time Spent" needs PostHog, because session/engagement
duration isn't something a database column can hold — it's the one thing
PostHog is actually built for. If you skip the PostHog setup, the other five
cards still work fine; that card just shows "—".

## 1. Run the stats migration (required for the 5 DB-backed cards)

1. Go to your Supabase project → **SQL Editor**.
2. Open `supabase/admin_stats_migration.sql` from this repo, paste it in, and run it.
3. This adds one function, `get_admin_stats()`, that returns total users,
   total recruiters, published/unpublished counts, and storage space used —
   all in a single query. It's `SECURITY DEFINER` (so it can read
   `auth.users` and `storage.objects`, which clients can't query directly)
   but re-checks admin status itself before returning anything, the same way
   `is_admin()` already does elsewhere in this project.

Without this step, the dashboard falls back to counting the candidate/
recruiter lists it already has in memory — so it still shows *something*,
just without the "Space Utilized" number (that one has no fallback since it
requires reading `storage.objects`).

## 2. Connect PostHog (optional, powers "Avg. Time Spent" only)

**A. Create a PostHog project**
1. Go to [posthog.com](https://posthog.com) → sign up (free tier covers this).
2. Create a project. Note whether you're on the **US** or **EU** cloud — it
   changes the host URLs below.

**B. Get your public Project API Key (for the frontend)**
1. PostHog → **Project Settings → Project API Key**. It looks like `phc_...`.
2. Open `index.html` in this repo and fill it in:
   ```js
   window.SWAPIKI_POSTHOG_CONFIG = {
     POSTHOG_KEY: "phc_your_real_key_here",
     POSTHOG_HOST: "https://us.i.posthog.com" // or https://eu.i.posthog.com
   };
   ```
   This key is safe to ship publicly — it identifies your project, it
   doesn't authenticate anything sensitive on its own.

**C. Get your Personal API Key + Project ID (for the backend query)**
1. PostHog → **Project Settings → Personal API Keys → Create.** Give it
   **"Query read"** access only (nothing more is needed).
2. PostHog → **Project Settings → Project ID** (a short number).
3. In your hosting provider (Cloudflare Pages → Settings → Environment
   variables), add:
   - `POSTHOG_PERSONAL_API_KEY` — the key from step 1
   - `POSTHOG_PROJECT_ID` — the ID from step 2
   - `POSTHOG_HOST` — `https://us.posthog.com` or `https://eu.posthog.com`
     (note: **no** `.i.` here — that's only for the frontend ingestion host)

These three are server-side secrets, same pattern as
`SUPABASE_SERVICE_ROLE_KEY` — never put them in `index.html` or any file
that ships to the browser.

**D. That's it**
Once both the public key (step B) and the three env vars (step C) are set,
redeploy. The dashboard's "Avg. Time Spent" card will start showing the
average session duration over the last 30 days.

## What you get after this

- **Published / Unpublished** — live counts from `candidates.profile_status`
- **Total Users** — every account in `auth.users` (candidates, recruiters, and plain logins alike)
- **Recruiters** — count of `recruiters` rows
- **Space Utilized** — total bytes in the `candidate-files` storage bucket (avatars, resumes, audio), formatted as B/KB/MB/GB
- **Avg. Time Spent** — average time between first and last event per session, last 30 days, via a PostHog HogQL query
- Users are automatically identified to PostHog by their Supabase user ID on login (and reset on logout), so sessions tie to real accounts instead of staying anonymous

## Files touched

- `supabase/admin_stats_migration.sql` — new, run this in Supabase SQL Editor
- `functions/api/admin-time-stats.js` — new, admin-gated PostHog query endpoint
- `js/store.js` — added `adminGetStats()`, `adminGetTimeStats()`, PostHog identify/reset on login/logout
- `js/app.js` — `renderAdminDashboard()` now fetches and renders the stat cards; added `renderAdminStatCards()`, `formatBytes()`, `formatDuration()` helpers
- `index.html` — PostHog snippet (loads only if `POSTHOG_KEY` is filled in)
