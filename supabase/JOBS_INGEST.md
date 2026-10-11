## 3e. Telegram review queue

The undecided drafts curation cannot judge are pushed to the admin's Telegram.
Two small routes handle it:

- `POST /notify` — reads `jobs` where `status='draft'`, `source='adzuna'` and
  `review_sent_at` is null, sends a card to `TELEGRAM_ADMIN_CHAT_ID`, then stamps
  `review_sent_at` and `review_message_id`. A row is only stamped after
  Telegram confirms the send, so a transient failure retries next run. Capped to
  100 rows per run to avoid timeouts.
- `POST /telegram` — webhook. When the admin presses **✅ Publish** or **❌ Reject**,
  it re-reads the job by uuid, writes `status='published'` or `rejected` (and
  never deletes a rejected job), edits the same message to record the outcome and
  removes the buttons. The press is only accepted if it comes from the admin and
  the job is still a draft.

Environment variables (Cloudflare Pages):

- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `TELEGRAM_ADMIN_CHAT_ID` — your Telegram user id (discovered from a message to the bot)
- `TELEGRAM_WEBHOOK_SECRET` — random string shared with Telegram (setWebhook)

The Worker needs only `INGEST_SECRET`. Run `supabase/jobs_review_migration.sql` before using this.

### Setup

The script `scripts/telegram-setup.ps1` does the whole dance:

```powershell
.\scripts\telegram-setup.ps1 -Token 123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

It will:
1. Discover your chat id if you haven't passed it (after you message the bot once)
2. Store the three Telegram secrets in Cloudflare Pages
3. Register `https://swapiki.com/telegram` as the webhook, restricted to `callback_query`
4. Verify both ends

To rotate the webhook secret, run it again with `-Secret <new>`.

### How to send the queue once

```bash
curl -X POST https://swapiki.com/notify -H "x-ingest-secret: $INGEST_SECRET"
```

A job is sent exactly once, and a rejection is reversible from the admin UI.

### Design notes

- The callback only names a job. The decision is re-fetched from the database, so
  a double-press or a press on an old message is refused as "already decided"
  instead of flipping a published listing.
- `callback_data` is `pub:<uuid>` or `rej:<uuid>` (<=64 bytes). The uuid is
  shape-validated before interpolation into a PostgREST filter.
- Telegram's secret header and the presser's id are both required. The secret
  does not say who pressed, so the two gates are different.
- A missing `review_sent_at` answers 503 naming the migration rather than a silent
  `sent: 0` that is indistinguishable from a quiet queue.
- Cards are HTML-escaped and clipped per field so a crafted title cannot inject
  markup, and a pathological row cannot produce an unsendable message.

