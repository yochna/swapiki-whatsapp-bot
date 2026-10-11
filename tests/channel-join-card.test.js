// The channel join card on the jobs board: the invite links, the QR, and the
// signed-in shortcut to a personal deep link.
//
// What these hold in place:
//   1. Nothing is rendered when no channel is configured, so the board never
//      shows a dead "join" button pointing at an empty URL.
//   2. The Telegram card prefers the bot deep link (?start=channel) over the
//      plain invite, because that is what opens the onboarding conversation.
//   3. The QR and the link go to the SAME place, or a scan and a tap land in
//      different rooms.
//   4. The "personal link" button only appears for a signed-in user, and a
//      configured URL is escaped before it is written into the href.
const test = require('node:test');
const assert = require('node:assert');
const { bootApp, makeStorage } = require('./helpers/app-sandbox');

const CHAT_URL = 'https://t.me/swapiki_jobs';
const BOT = 'swapiki_bot';

const card = (config, { signedIn = false } = {}) => {
  const { app, sandbox } = bootApp(makeStorage(), config);
  if (signedIn) sandbox.swapikiStore.currentUser = { id: 'user-1' };
  return app.renderChannelJoinCard();
};

test('an unconfigured deployment renders nothing rather than a dead button', () => {
  assert.strictEqual(card({ TELEGRAM_BOT_USERNAME: '', TELEGRAM_CHANNEL_URL: '', WHATSAPP_CHANNEL_URL: '' }), '');
  assert.strictEqual(card(undefined), '');
});

test('the Telegram card links to the bot deep link, and the QR matches it', () => {
  const html = card({ TELEGRAM_BOT_USERNAME: BOT, TELEGRAM_CHANNEL_URL: CHAT_URL, WHATSAPP_CHANNEL_URL: CHAT_URL });
  const deepLink = `https://t.me/${BOT}?start=channel`;

  assert.ok(html.includes(deepLink), 'the card opens the onboarding conversation');
  assert.ok(html.includes('qrserver.com'), 'a QR is offered');
  const qr = html.match(/api\.qrserver\.com[^"]*data=([^&"]+)/);
  assert.ok(qr, 'the QR encodes a URL');
  assert.strictEqual(decodeURIComponent(qr[1]), deepLink, 'scan and tap must land in the same place');
  assert.ok(html.includes(CHAT_URL), 'the WhatsApp-style invite is also offered');
});

test('the personal-link button only shows for a signed-in user', () => {
  const anon = card({ TELEGRAM_BOT_USERNAME: BOT, TELEGRAM_CHANNEL_URL: CHAT_URL });
  const signedIn = card({ TELEGRAM_BOT_USERNAME: BOT, TELEGRAM_CHANNEL_URL: CHAT_URL }, { signedIn: true });

  assert.ok(!anon.includes('data-tg-link'), 'a visitor has no profile to link');
  assert.ok(signedIn.includes('data-tg-link'), 'a signed-in user is offered the personal link');
  assert.ok(/Get your personal Telegram link/.test(signedIn));
});

test('a configured URL cannot break out of the href', () => {
  const html = card({
    TELEGRAM_BOT_USERNAME: '',
    TELEGRAM_CHANNEL_URL: 'https://x.example/" onmouseover="alert(1)',
    WHATSAPP_CHANNEL_URL: ''
  });
  assert.ok(!html.includes('onmouseover="alert'), 'the quote escaped the attribute');
  assert.ok(html.includes('&quot;'));
});