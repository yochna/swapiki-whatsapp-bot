# Test-Before-Production Environment Setup (single-Supabase)

Deploy everything manually to Cloudflare Pages with a **test site first**, then
promote the identical build to production. One codebase, **two Pages projects,
ONE Supabase database** — deliberately simple for pilot scale (usage is ~27 MB
of a 500 MB free limit, so a second database is needless complexity and billing
risk).

```
                  deploy.ps1 -Environment test
  code ───────────────────────────────▶ swapiki-test.pages.dev   (test URL here)
                 deploy.ps1 -Environment prod
  SAME code ─────────────────────────▶ swapiki → your live domain (prod)
                │
                └─ both environments point at the SAME Supabase database
```

## Why this is safe anyway

- The **test site has its own URL** (`swapiki-test.pages.dev`), so you catch
  build/layout/static-function bugs before prod is touched.
- Database writes from the test site go to the same DB, but test users are
  **marked `test-*`** so real data is never mixed up, and a cleanup step removes
  them (see below).
- The live site only ever receives the build you explicitly promote with
  `-Environment prod` — test builds never reach it.
- The `/config` function still exists and works per-project, so if you later
  decide the pilot needs a **separate test database**, just set `SUPABASE_URL`
  + `SUPABASE_ANON_KEY` on the `swapiki-test` project — nothing else changes.

## One-time setup (do once, ~10 minutes)

### 1. Supabase — nothing to create
1. You already have the production project. That's the only database we use.
2. Run every migration file in `supabase/` on it (one `Run` per file, in order):
   `auth_migration.sql` → `full_redesign_migration.sql` →
   `admin_stats_migration.sql` → `voice_verification_migration.sql` →
   `feedback_migration.sql` → `recruiter_verification_migration.sql`
   (Each is guarded with `if not exists` / `drop policy if exists`, so re-running
   after a mistake is safe.)
3. Optional pre-launch: run `seed_dummy_profiles.sql` too. It adds a hidden
   `is_dummy` tag and 56 published profiles (34 IT, 22 BFSI) with Indian
   names/cities so the recruiter directory and public share links look populated.
   The tag is DB-only (never shown in the app). Batch-delete them later with
   `delete from candidates where is_dummy = true;`
4. Optional dummy avatars: run `set_dummy_avatars.sql` (points avatars at
   `photos/dummy/*.svg`, which deploy with the Pages site) and re-deploy so the
   image files are live. Overwrite any file there with a real AI photo of the
   same filename to upgrade an avatar with no code change.

### 2. Test Pages project (Cloudflare)
1. dash.cloudflare.com → **Workers & Pages → Create → Pages → Upload assets**.
2. Project name: **`swapiki-test`** → URL `swapiki-test.pages.dev`.
3. Environment variables — only one is needed:
   - `SITE_ENV` → `test`
   Do NOT set `SUPABASE_URL` / `SUPABASE_ANON_KEY` — leaving them unset makes the
   site fall back to the production database (that's the whole point here).

### 3. Production Pages project
1. In your existing (live) Pages project → **Settings → Environment variables**.
2. Add `SITE_ENV` → `prod`. (Same fallback rule: it has no Supabase override, so
   it stays on the production database forever.)
3. If you add custom domains later, attach them to the **main** branch.

### 4. Install & log in to the deploy tool
```
node -v
npx wrangler --version
npx wrangler login        # opens a browser → click Allow
```

## The daily loop

```
.\deploy.ps1 -Environment test     # build + ship to swapiki-test.pages.dev
.\deploy.ps1 -Environment prod     # build + promote the same code to live site
```

Deployment names live in `deploy.ps1` — tweak the `$project` values if the
prod project isn't literally called `swapiki`.

## Proving the test site works

1. Open the URL wrangler printed (`https://<hash>.swapiki-test.pages.dev`).
2. F12 → Network → refresh → open the `config` response → `siteEnv` should be
   `test` and `supabaseUrl` the production URL (by design).
3. Register a test account like `test-abc99` and run the feature pass.
4. Clean up test data when done (rows only, they sit in the same DB):
   - SQL Editor → delete the test user's `auth.users` row (cascades to
     `candidates`, `feedback`, `recruiter` rows via FK), or
   - leave them — they're clearly prefixed `test-` and counted separately from
     real usage.

## Migrations change?

Run the new SQL once on the single database, deploy test, verify, deploy prod.
No second database to keep in sync.

## Later (optional): real database isolation without extra cost

Set `SUPABASE_URL` + `SUPABASE_ANON_KEY` on `swapiki-test` to point at any
second Supabase database (test or a new free org) — the `functions/config.js`
mechanism supports it with zero code changes. Free-tier limits are per-org, so
putting the test DB in a different free org keeps it cost-free.