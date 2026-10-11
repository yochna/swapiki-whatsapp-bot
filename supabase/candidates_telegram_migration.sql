-- Migration: let a Telegram user be linked to their Swapiki profile.
--
-- The public channel flow has two halves:
--   1. /api/tg-link mints a short random link token for a logged-in user and
--      returns a t.me/<bot>?start=<token> deep link.
--   2. When the user presses Start, the bot webhook looks the candidate up by
--      that token, records their Telegram id, and sends a profile-aware
--      onboarding message. A later channel join (chat_member) can then DM them
--      because we already know their chat id.
--
-- Telegram only reveals a member's identity through a chat_member update to a
-- bot that is a channel admin; it never exposes the full member list. That is
-- why the link is established from our side via the deep link, not by reading
-- the channel.
--
-- The token is stored (random, single-use) rather than HMAC-signed because a
-- Telegram start parameter may only contain [A-Za-z0-9_-] and is capped at 64
-- bytes - too short for a signature over a uuid - and a stored nonce is simpler
-- to revoke.

alter table public.candidates
  add column if not exists telegram_id bigint,
  add column if not exists telegram_username text,
  add column if not exists telegram_linked_at timestamptz,
  add column if not exists channel_joined_at timestamptz,
  add column if not exists telegram_link_token text,
  add column if not exists telegram_link_expires_at timestamptz;

-- The webhook looks a candidate up by token on /start and by id on a join.
create index if not exists candidates_telegram_link_token_idx
  on public.candidates (telegram_link_token)
  where telegram_link_token is not null;

create index if not exists candidates_telegram_id_idx
  on public.candidates (telegram_id)
  where telegram_id is not null;

comment on column public.candidates.telegram_id is
  'Telegram user id, set when the user opens the bot via a /api/tg-link deep link. Null until then.';
comment on column public.candidates.telegram_link_token is
  'Single-use random nonce embedded in the bot deep link. Cleared once the bot sees it.';
comment on column public.candidates.channel_joined_at is
  'When the linked user was seen joining the public channel (chat_member update).';