# Fortnightly jobs drop email — setup & first run

Swapiki emails **every member** a jobs drop at most **once every 14 days**. The
top card is "Top jobs & internships · last 14 days", ranked by real candidate
clicks (the "Apply on the job site" buttons) and then re-ranked per user against
their profile skills.

The cadence is enforced by the route itself, not by a schedule: each successful
send is written to `digest_sends`, and a user is skipped until their last send is
14 days old. The scheduler worker can therefore call the route on every two-hour
run and nobody receives two drops in the same fortnight.

Code is in place + deployed; the configuration steps below switch the emails on.

## What was added

1. `supabase/email_digest_migration.sql` — interest tracking (`job_clicks`, one per
   user/job/day) and a send log (`digest_sends`), which now also acts as the
   14-day cooldown tracker.
2. `functions/api/cron-send-digest.js` — the POST endpoint, protected by a shared
   `x-cron-secret`.
3. `worker/scheduler/src/index.js` — step 5 of the two-hourly run calls that
   endpoint. **No pg_cron job is needed.**
4. `js/app.js` + `js/store.js` — every "Apply on the job site" tap records a click
   (fire-and-forget). No config needed; it works as soon as you run the migration.

## Steps

### 1. Run the migration
Supabase → SQL Editor → open `supabase/email_digest_migration.sql` → **Run**.
(Safe to re-run.) Skip the `cron.schedule(...)` block at the bottom — the
scheduler worker drives the email now. If an earlier run already created that
job, remove it: `select cron.unschedule('swapiki-weekly-digest');`

### 2. Get a Resend API key + verify your domain
1. Create an account at https://resend.com (free tier: 3,000 emails/month).
2. Add your domain (`swapiki.com`) and verify DNS.
3. Create an API key → copy it.

### 3. Add the environment variables on Cloudflare Pages
Dashboard → your Pages project → **Settings → Environment variables**:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | `re_...` from step 2 |
| `RESEND_FROM` | `Swapiki <jobs@swapiki.com>` (must be on your verified domain) |
| `DIGEST_CRON_SECRET` | any long random string — **same value on the Worker** |
| `SUPABASE_SERVICE_ROLE_KEY` | if not already set (also used by `/jobs` SEO) |

Remember to **redeploy** (or the next deploy will pick them up).

### 4. Add the secret to the scheduler worker
From `worker/scheduler`:

```
wrangler secret put DIGEST_CRON_SECRET
```

Use the same value as step 3, then `wrangler deploy`.

### 5. Test it
Before waiting for the next run, trigger it manually:

```
curl -X POST "https://swapiki.com/api/cron-send-digest" ^
  -H "x-cron-secret: <DIGEST_CRON_SECRET>"
```

The JSON reply is `{"sent": N, "failed": 0, "skipped": M, ...}`. The first run
emails everyone (`skipped: 0`); an immediate second run returns `sent: 0` with
every user counted as `skipped`. Deliveries are logged in `digest_sends`
(admin-readable).

## Notes / limits
- Per user, not per schedule: one email every 14 days, counted from their last
  send — a missed run only delays the next drop by one run.
- First run after setup emails every user at once (Resend free tier: 3k/month).
- No per-user opt-out yet — every signup receives the drop; a "digest off" toggle
  is a future step (Resend also offers an unsubscribe option if we want it).
- The rank weighs click interest ×4 + skill overlap over the last 14 days; fresh
  openings with zero clicks still make the card if they match your skills.
- Dummy profiles will get the email too — they're purged at promote time.
- Naukri apply links expire; stale listings stay ranked until you unpublish them
  from Admin → Job Review.
