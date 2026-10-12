# Swapiki Changelog

All notable changes along the path-to-Pilot run. Versioned by date following the
`?v=YYYYMMDDx` cache-buster scheme used on deployed assets.

---

## [0.8.72] · 2026-10-12 — The channel looks current

The digest posted the OLDEST un-stamped roles first. The board publishes hundreds
of roles a day and one message carries a handful, so the channel spent its daily
post advertising roles from a week earlier. It now posts the NEWEST roles.

- **Newest-first, with a freshness window.** `/channel-post` reads
  `order=first_seen_at.desc`, bounded by `first_seen_at=gte.<now - 72h>`. A role
  older than the window is stale by definition and is left un-stamped, so it drops
  out of the query rather than being posted late — a backlog can no longer keep the
  channel behind. The eight-role cap is unchanged: it is Telegram's 4096-char
  limit, not policy. The WhatsApp digest mirrors the change.
- **One short line per field.** Each role's title, company/location and salary now
  sit on their own lines, instead of one long `·`-joined line that ran past the
  edge of a phone's message bubble.
- **Deploy stages only runtime files.** `deploy.ps1` copies the site into a temp
  directory before `wrangler pages deploy`, so untracked large media (a 47 MB wav)
  no longer fails the upload — and `whatsapp-bot/.env` is never published.

## [0.8.71] · 2026-10-08 — Telegram, four at a time

The channel got one message per job, every two hours: a channel people mute. The
candidates who pressed Start on the bot got nothing back unless they spoke first.
Linking depended on a deep link that some phones hand to a browser. And the
review inbox made you decide a backlog of drafts one press at a time. This
release fixes all four, and the plumbing is shared: one scheduler, one secret,
one migration apiece.

- **A daily channel digest.** `/channel-post` collapses everything new into ONE
  post per day — headline, up to eight roles, one link to the board. A new
  `channel_digests` table holds a row per UTC day, so the two-hourly scheduler
  can keep firing and still only post once; jobs beyond the cap wait for
  tomorrow's digest rather than swelling one message past Telegram's limit.
  Every link is to our own job page, never the raw apply URL, and titles are
  escaped like the review card.
- **A weekly personal digest.** New route `POST /telegram-digest`, called by the
  same scheduler as a fourth step (ingest → notify → channel → digest — same
  `23 */2 * * *` cron, no second trigger). Each linked, channel-joined,
  published candidate gets a DM of up to four roles ranked by skill overlap,
  then freshness — and **no overlap at all means no message**, because a digest
  of irrelevant roles is how a bot gets blocked. The weekly cadence lives in a
  `telegram_digest_sent_at` column with a six-day floor, so every run is
  idempotent; at most 40 DMs go out per run, draining a large audience across
  days instead of bursting them. A row is stamped only after Telegram confirms
  the send, so a failure retries next run; an audience with nobody matching
  stays silent rather than getting filler.
- **The code instead of the link.** After minting a Telegram link the board now
  shows the token itself with a copy button, and the bot accepts it as a bare
  message: typing the code behaves exactly like `/start <code>`. A code that
  matches nothing gets "That code didn't match any link…" instead of the
  generic welcome, so a typo cannot look like a successful link. Plain
  non-code messages are still ignored.
- **Publish all.** Review cards now carry the queue: the footer says how many
  drafts are still waiting behind this one, and when there are, a third button
  **Publish all N pending** flips the whole draft queue to published in one
  press — admin-only, one PATCH, capped at 200, outcome recorded on the card,
  buttons cleared. Under it, **Open queue on Swapiki** jumps to the admin
  board. With nothing else pending the button stays off the card, so the
  common single-draft case looks as it did.
- Two migrations, both run in production: `supabase/jobs_channel_digest_migration.sql`
  and `supabase/telegram_digest_migration.sql`. If either is missing the route
  answers 503 naming the file rather than a silent zero.

Full suite: 649 passing.

## [0.8.70] · 2026-10-03 — Real pages: Back, and fifteen rows at a time

"Show more" grew the list: click it and you had thirty, then forty-five, with no
way back except reloading. That is a different thing from paging, and it is the
wrong thing for a review queue, where the question is rarely "show me more" and
more often "take me back to the one I was reading".

So the three admin lists page properly now.

- **Candidates, Job Review and Published** each hold a page of fifteen and show
  a pager under the rows: **Back**, which page you are on, and **Show more**.
- **Show more** moves to the next fifteen. It does not accumulate, and the
  fifteen you were reading are replaced rather than left stacked above.
- **Back** returns to the previous page and stops at the first, rather than
  wrapping round round to the last.
- The pager sits **below the list**, including below the mobile cards. It was in
  the toolbar above the rows, which is where you look when you arrive rather
  than where you look once you have read fifteen names.
- Both buttons stay put and go disabled at each end. A control that vanishes as
  you reach the end makes the layout jump and explains nothing.
- A list of fifteen or fewer gets **no pager at all**, rather than two buttons
  that cannot do anything.
- Searching resets to the first page, and each list keeps its own page, so
  paging Published no longer scrolls the review queue beside it.
- A page that no longer exists — rows deleted, a search narrowed — moves itself
  back to one that does.

One thing changed shape as a result. The count line used to read "showing 15 of
41", which described the page boundary up in the toolbar while the rows were
below it. The pager now says which page you are on, so the count just says how
much there is: "41 rows", or "20 matching" under a search. Describing the
boundary in both places is how the two drift apart.

Tests: 442 passing. Sixteen mutations of the paging logic were tried and all
sixteen were caught, including three that got past the tests first — a pager
that rendered but was wired to nothing, a pager host whose id no longer matched
the one the repaint looks up, and a list that borrowed another list's page count.

---

## [0.8.69] · 2026-10-02 — Reverts the per-row name expander

0.8.68 cut names and job titles to 15 characters with a "Show more" underneath
each row. That was a misreading of the request. What was wanted was paging — 15
rows, then another 15 — which is what the admin tables already did, in all three
lists, with a "Show 15 more" button in each toolbar.

So this release takes 0.8.68 back out. Names and titles are whole again, and
"Show more" means one thing in the admin: the next fifteen rows.

Leaving it in place would have been worse than reverting it. Two controls both
reading "Show more" in the same table is a genuine ambiguity, and the per-row one
was the one that lost the value — cutting a name to 15 characters to protect the
column widths of a table the admin was already paging through.

The paging itself was already correct and is now pinned down by tests, including
one that was weaker than it looked:

- The published table pages fifteen at a time and keeps its own depth, so
  paging it does not scroll the review queue next to it.
- A list of fifteen or fewer hides the button rather than offering a click that
  cannot do anything.
- **A new search now has a test that actually proves it resets to the first
  page.** The old one appeared to cover this but only passed because its search
  happened to match fewer rows than a page — so with the reset deleted it still
  passed. It now pages deep *first*, then searches something with more than a
  page behind it, which is the case where carrying the depth over actually shows
  the wrong number.

Full suite: 432 passing.

## [0.8.68] · 2026-10-02 — Long names you can read

In the admin tables — Candidates, Job Review, and Published — a name or job title
was shown in full. A name long enough to be useful ("Venkataraman Subramanian
Iyer", "Senior Backend Engineer (Payments & Billing)") pushed every other column
off the row, so the one thing the reviewer is scanning for was the thing that
had already broken the layout.

Names and titles now show the first 15 characters with a **Show more** underneath
that reveals the rest in place. The arrow flips down when there is more and up
when you have expanded it, and the button reports its state to assistive tech.
Names of 15 characters or fewer are left alone and get no expander, so the common
case looks exactly as it did.

Both forms are rendered into the page up front with one hidden, rather than the
full name being parked in a `data-` attribute and injected on click. A name is
user-supplied text that has already been escaped once; this way it never has to
be unescaped and re-parsed at click time.

One detail worth stating, because it was the trap in this change: in the
Candidates table the name is itself a button that opens that person's profile, so
the expander cannot live inside it — a button inside a button is invalid HTML,
and the click would open the profile instead of revealing the name. It sits
alongside the name button instead. The mobile candidate card is a
single-column layout where the row is the tap target and already truncates by
width, so it is unchanged.

20 new tests cover the cut, the boundary at exactly 15, escaping of both forms,
the toggle both ways, per-row isolation, and the button-in-button case. Full
suite: 449 passing.

## [0.8.67] · 2026-10-02 — Your profile stops forgetting you

Filling in your name, title and links in Edit Profile, reopening the site, and
finding them gone. That was not a bug you caused and not something you could
have avoided: opening the site was what erased it.

Every page load replaced whatever was on the device with whatever the server
had, then saved that over the browser copy. The server copy was routinely
older, because the save that writes your profile runs without being waited on
and only writes its failures to the console. So one save that RLS rejected, one
dropped connection, one migration that had not been applied yet — and the
server stayed permanently behind. After that, every visit overwrote your own
edits with the empty server copy and made it permanent.

There was a second, blunter version of the same thing. Any error at all while
reading your profile — a flaky request, a rejected permissions check, a nested
project lookup that failed — returned no rows, and no rows was read to mean
"this account has no profile yet". So the site built a brand new blank profile
and saved it on top of yours. One bad response could do it.

Three changes, all aimed at the same asymmetry: losing your data is permanent,
keeping a value that turns out to be stale is not.

- The newer copy now wins, judged by timestamp, instead of the server always
  winning. Editing on your phone and opening the site on your laptop still
  behaves the way you would expect.
- When the two cannot be compared — an older profile saved before this rule
  existed — an empty server field is filled back in from your browser rather
  than blanked, and your projects are not deleted by an empty lookup.
- A failed read is no longer mistaken for an empty profile. If we could not
  get your profile, we keep the one we already have and say so in the console
  instead of inventing a blank one.

A genuinely new account with nothing on the server still gets a profile built
from its own account details, so first sign-in is unchanged.

13 regression tests cover this, including the two failure shapes that caused
the original loss. Full suite: 429 passing.

**One thing this cannot do:** if a profile was already eaten before this
release, the old values are gone from both the server and this browser. This
fix stops it happening again; it does not reconstruct what was lost. Re-enter
what you want to keep.

## [0.8.66] · 2026-10-02 — The practice box listens

The interview practice box asked people to type a spoken answer. The whole
premise of mock practice is saying it out loud, so the box now opens with a
microphone: tap it, answer the question, tap again. It writes down what you said
and grades it by itself — no second button to remember.

**It checks the answer, and how it was said.** The existing grader already
scored length, STAR structure, ownership, proof and relevance, so the check
itself needed no new rules. Two things could only be judged from a recording,
and they now are:

- **Pace.** Words per minute, from the recording's own duration. Under 90 reads
  as uncertainty, over 195 as nerves; 130–160 is the target. It is deliberately
  silent below 45 words or 20 seconds, because a pace reading taken from a short
  sample is worse than no reading at all.
- **Filler, as spoken.** "Um" and "basically" matter far more out loud than in a
  typed draft, and the grader now says how many times it heard them.

**One bug the rebuild exposed.** The box has always claimed "your draft saves
automatically". It did not. Drafts were written to `localStorage` under the
question *object*, which stringifies to `[object Object]` — so every draft in a
session overwrote the same slot, while the load read by question text and always
missed. Every answer anyone had written was silently discarded on reload. Keyed
by the question text now, with a reload test.

**Chrome ends its own recording every ~60 seconds.** A 45–180 word answer
routinely runs past that. The audio engine's recogniser restarts only while it is
recording audio, which dictation is not, so borrowing it directly would have cut
long answers off mid-sentence. The practice box runs its own instance and hands
over to a fresh one — with a test that fires the 60-second cut deliberately.

**Where speech-to-text does not exist** (Firefox, Safari) the box says so plainly
and offers the typing box, checked exactly the same way. A refused microphone
permission says "Microphone blocked" rather than blaming the browser, and offers
typing too. Silence is never graded as an answer.

The typing box is still there. It is no longer the first thing you see.

---

## [0.8.65] · 2026-10-02 — Two bugs a visitor finds in one minute

Neither of these came from the theme work directly; both were sitting underneath
it, and both are the kind that make an app feel unfinished rather than broken.

**Clicking a nav item twice.** The jobs board lives at a real path, `/jobs`, and
the router mapped that path to the jobs view before it ever looked at the hash.
So if you arrived on `/jobs` and clicked Dashboard, Admin or your profile, the
path won and you were put straight back on the board. The click did nothing.

The second click then appeared to work, which is the part worth recording: by
then the hash was *already* `#dashboard`, so assigning it again fired no
`hashchange` at all and `navigate()` did the work itself. A router that both
writes the URL and listens to it will always produce this signature — "click
once, nothing; click again, it works." `/jobs` still routes to the board when
nothing else is asked for; it just no longer outranks an explicit hash.

**The accent-filled buttons lost their labels.** 0.8.64 gave `.text-primary` one
colour app-wide so accent-as-text could clear 4.5:1. But the dashboard also uses
`.text-primary` as the *label on an accent fill*, where the correct colour is
ink. Both rules were right on their own and the cascade decided it:
`#view-dashboard .bg-white.text-primary` is (1,2,0) and the app layer is
(1,2,1), so the app layer won and **Add Proof Project** and **Preview** shipped
as `#B9491F` on `#E85D2A` — 1.49:1. Orange on orange.

No colour assertion could have caught that, because both colours were correct
somewhere. The fix re-scopes the dashboard's own label rule above the app layer,
and a test now resolves the cascade with a specificity calculator rather than
trusting that source order will do the right thing.

**Hovering any primary button dropped the label to 3.55:1.** Found by the new
test, and it predates 0.8.64. The hover tone was `--d-accent-2` — the
accent-as-*text* token — which is far too dark to carry an ink label. Accent
fills now hover to `--d-accent-fill-hover` (`#DE5828`, 4.87:1), the darkest the
fill can go while ink still clears 4.5:1. The hover is subtle by arithmetic.

- **Test suite** 392 → 398. Each fix is confirmed to fail when reverted.

---

## [0.8.64] · 2026-10-02 — What 0.8.63 broke, and one thing it never reached

0.8.63 shipped the warm palette and the app layer. Two problems came with it,
both found by measuring instead of eyeballing.

**The accent was doing two jobs.** `#E85D2A` is a *fill* colour — a button, a
progress bar. As a fill it is fine; as small text it is 3.43:1 on a card and
3.15:1 on paper. And the shipped markup says `bg-primary text-white` on 48
buttons, which is 3.48:1. So the palette now splits by role:

| role | token | value |
| --- | --- | --- |
| accent fill | `--a-accent`, `bg-primary` | `#E85D2A` |
| accent as text | `--a-accent-text`, `text-primary` | `#B9491F` |
| label on a solid fill | `--a-ink`, `on-primary` | `#17130E` |

Same hue, a long way down, for anything the eye has to read. The neutral ramp
was darkened by contrast role for the same reason — `slate-500` went
`#8C8175` → `#615950` (3.75:1 → 6.88:1), `slate-400` → `#746C60` (2.42:1 →
5.18:1), and `amber-700` → `#96620F`. `slate-300` is left light on purpose: it
is a border step, and a test now fails if anything paints text with it on a
light surface.

**Sign-in was never in the scope.** The app layer keyed off the landing being
inactive, which is how it reached the body-appended overlays — but the auth
modals open *from the marketing header while the landing is still the active
view*. So the most visited surface in the product was excluded from the theme by
exactly the mechanism built to include everything else. The scope is now a
disjunction, and the second arm names `#modal-login`, `#modal-signup` and
`#modal-otp`. It names only those three: a broader `[id^="modal-"]` would also
recolour the terms, contact, support, feedback and trust dialogs, which are part
of the approved landing design and were never in scope.

The contrast tests resolve the actual shipped tokens and compute the ratios, so a
regression names itself: `slate-500 (#8C8175) on #FFFDF9 is 3.75:1, under the
4.5:1 minimum`. Each was confirmed to fail when the thing it guards is reverted.

- **Test suite** 390 → 392, all passing.

---

## [0.8.63] · 2026-10-02 — The rest of the app stops being a SaaS console

The dashboard was converted in 0.8.60–0.8.62. The jobs board, the admin table,
the candidate profile, sign-in, and every overlay were not, and a signed-in
candidate still dropped out of the editorial world the moment they left the
dashboard. This is that pass.

**The palette moved into `tailwind.config.js`.** This is the part worth knowing
about. The obvious way to theme six more views is to write a scoped override
block for each, the way the dashboard was done — but the job-apply sheet, the
resume builder, the interview prep, the add-project editor and the GitHub picker
are all appended straight to `document.body` by `app.js`, so nothing anchored to
a view id can reach them, and hunting them down class by class is the exact
exercise that produced 0.8.61's missing-colours bug.

So the ramps themselves are remapped. `slate` becomes the warm neutral scale of
the landing (paper through ink); `blue` becomes the accent scale. That is what
reaches the body-level overlays, and it reaches every surface at once instead of
per-view.

It provably cannot touch the marketing page: `#view-landing` contains **zero**
Tailwind colour utilities — all 155 of its classes are its own `.lp-*` — and
there is now a test that fails if that ever stops being true.

The blue ramp's dark end is ink, not orange. `bg-blue-900` is the Apply button
and `border`/`text-blue-900` are the outline buttons, and the editorial
equivalent of that solid block is ink, so `blue-900` is `#17130E` and the accent
sits at `blue-500`. `indigo` and `sky`, which only ever did match-strength and
keyword chips, moved to a khaki range; `emerald`, `amber` and `rose` were kept
but warmed, so an error still reads as an error.

**A new app-shell block supplies what is not a colour.** Type, borders, radii and
focus states were still the old defaults, and a palette swap alone leaves Inter
headings and drop shadows — which is what made the dashboard read as a different
product in the first place. Fraunces headings, JetBrains Mono tracked labels,
body-sans buttons, hairline-separated cards at the landing's 18px radius, the
accent focus ring, and the warm glow on solid accent buttons that the blanket
shadow reset had been taking away.

Its scope is `body:not(:has(#view-landing.active-view))`. That is the whole
reason it works: the router already marks exactly one `.view-section` as
`.active-view`, so keying off the landing being inactive expresses "everywhere
except the marketing page" in CSS, without touching the JS and without
enumerating fourteen overlay IDs. A test walks every rule in the block and fails
on any selector that is not scoped that way.

**The app accent is lighter than the landing's, deliberately.** The landing keeps
the approved `#D9481F`. The app, including the dashboard's own `--d-accent`, is
now `#E85D2A`.

The header and footer are one set of markup shared by both, and they carry the
accent as hardcoded Tailwind arbitrary values rather than a token — so the
config swap could not reach them. Seven `[class~=…]` rules do, and `~=` is
deliberate: it matches a whole class name, so the `bg-[#D9481F]/10` live badge
keeps its own transparency instead of being flattened to an opaque accent by a
substring match. The landing's own `#D9481F` selectors still resolve, because
when the landing is active the whole app layer is off.

**Tests:** 390 pass, 19 in the landing/dashboard suite. Two new: one walks the
app shell's selectors and checks the landing keeps zero Tailwind colour
utilities, the other checks every shade of both ramps is explicitly specified —
`extend.colors` merges, so an omitted shade falls back to the Tailwind default and
a cool blue would survive in the middle of a warm ramp.

Deployed to `https://swapiki.com/`, verified HTTP 200 with the app-shell block,
the lighter accent and the absent old navy all present in the served HTML, and
the rebuilt `dist/output.css` carrying the warm ramps and none of the old blues.

---

## [0.8.62] · 2026-10-02 — The dashboard's second pass: the details that read as another site

0.8.61 fixed the missing colour classes. This one is the smaller stuff, which is
what made the page still not feel like the landing when you actually looked at it.

**The numbers were body sans.** `dash-stat-views`, the completeness percent, the
slot count — the figures the whole dashboard exists to argue with — were set in
Inter while every heading around them was Fraunces. They now use the display face
with `tabular-nums`, because those values are written by `textContent` and
proportional digits make a 2-digit count visibly wider than a 1-digit one as it
ticks.

**The metric labels were body sans too.** "Profile Completeness Score",
"Published Proof Projects", "Profile Views" all spell their label styling as
`uppercase tracking-wider` rather than the `font-label-*` class the override
block was matching, so none of them were caught. They are the eyebrows of this
page; they are now JetBrains Mono at `.18em`, which is what every tracked label on
the landing actually is.

**The buttons were bold mono.** `font-label-md` on the hero CTAs meant the accent
buttons rendered in JetBrains Mono at 700 while the landing's `.lp-btn` is
`font-family: inherit` at 500. The metadata links keep the mono; the buttons now
match the landing's.

**Card hover was still cold.** `.bento-card:hover` carries
`box-shadow: 0 4px 12px rgba(15,23,42,.08)` in the global stylesheet. The project
cards wear `bento-card` with no `shadow-*` class, so no `#view-dashboard` utility
override could reach it and every card flashed a blue-grey slab on hover while
the rest of the page had gone warm. Overridden with a warm ink shadow and an
accent hairline.

**The accent buttons had gone flat.** 0.8.60's blanket `box-shadow: none` also
killed the warm glow the landing puts on its primary CTA. Restored on the accent
buttons specifically, because that is the one shadow that belongs on paper.

**Paper stopped short of the viewport.** The body is `bg-surface` (`#F8FAFC`, a
cool white). On a dashboard shorter than the window — which is every new
candidate with one project — the area below the section was cold white under warm
paper. `body:has(#view-dashboard.active-view)` follows the router's existing
`.active-view` toggle; no JS change.

**Three smaller ones.** The ink panels were framed `border-2`, a heavy box around
something the landing sets flush to the page; now 1px. Selection and focus-visible
were still the browser's default blue, which on warm paper reads as a stray link.
And `--d-line` on a card is 1.39:1, which had made the empty-state folder glyph
and the unchecked checklist circles invisible — a new `--d-ghost` tone sits
between the muted and the line colours.

Cache: `index.html` only (served `no-cache`); no bundle changed.

## [0.8.61] · 2026-10-02 — Four dashboard classes the first pass missed

The 0.8.60 dashboard theme overrode the classes visible in `index.html`. Four more
only exist in `app.js` template literals, so nothing in that pass ever looked at
them and they kept rendering in the old palette:

- `hover:bg-white` on the "Add project" card — pure white against a warm card.
- `text-blue-100/80` on the hero's subtitle and the proof-card paragraph — a
  separate utility class from the bare `text-blue-100` that was overridden, so the
  hero's secondary copy stayed blue.
- `text-emerald-700` and `text-amber-700` in the voice-verification line.

`renderDashboard()`, `renderProfileChecklist()` and
`renderVoiceVerificationStatus()` write into the view from JS, so the static
markup is only part of the surface. The dashboard test now reads `app.js` as well,
bounds the slice at those three renderers so the modal overlays' blue-50 chips
cannot pass as "themed", and compares real class tokens instead of selector text:
searching for `hover:bg-white` in the stylesheet also finds `hover:bg-white/20`,
which would have silently satisfied the check.

Cache: `index.html` only (served `no-cache`); no bundle changed.

## [0.8.60] · 2026-10-02 — The dashboard matches the landing page

A signed-in candidate was getting an editorial header and footer above a generic
slate-and-blue console. The marketing surface had been rebuilt in paper / ink /
burnt-orange with Fraunces headings, and the shared chrome was themed to match on
every page, but the dashboard body was never converted - so the two halves of the
same page disagreed.

**What changed.** Paper background, warm hairline cards instead of drop shadows,
Fraunces headings, JetBrains Mono labels, and burnt orange as the single accent.
The hero card and the "Public Proof Profile" card are now ink panels, matching the
landing's dark problem and proof sections, and the pill-style buttons match the
landing CTAs. The amber audio bar and the green "published" indicators are gone:
neither colour exists in the landing palette, and they were the last things
reading as a different product.

**How.** By overriding the Tailwind utilities already in the markup, scoped under
`#view-dashboard`, rather than rewriting every class string in `index.html` and in
`app.js`'s template literals. An `#id .class` selector beats a single-class Tailwind
utility on specificity, so the overrides win without `!important` and without the
risk of an incomplete find-and-replace leaving one blue corner behind. A test walks
every rule in the new block and fails if any selector is not scoped to the view or
to the shared chrome IDs, so it cannot quietly start repainting the admin table,
the candidate profile or the jobs board.

Those three views are deliberately left on the Tailwind palette. They were never
designed against this one, and a blanket token swap would flatten their hierarchy
rather than translate them.

The global mobile `h1`/`h2` rules force every heading to 1.45rem with
`!important`, which is unreadable at display sizes, so the dashboard now beats them
the same way the landing block does.

Cache: `index.html` only (served `no-cache`); no bundle changed.

## [0.8.59] · 2026-10-02 — The landing page fits a phone

The editorial landing page was drawn on a 1280px canvas and carried two breakpoints
that were never tested at the width most visitors arrive on.

**It scrolled sideways.** The hero transport card was centred with `margin: auto`,
which centres a box that already fills its parent — so on a phone it ran edge to
edge with its rounded corners flush against the screen. Worse, the decorative
waveform rows are fixed-count flex bars (74, 86, 150, 170) with a 2px minimum
width each. At 360px, 170 of those cannot fit, so they pushed the whole page wider
and gave the document a horizontal scrollbar. The card now reserves a gutter at
every width and the waveform rows clip, which reads as a ribbon continuing past the
edge instead of dragging the layout sideways.

**It stayed two-up when it should not have.** The steps, feedback and stats grids
now collapse to one column at 820px, the proof diptych stacks at 900px (both halves
are still readable at 820px, so stacking them there would waste tablet width), and a
new 400px tier rescues the elements that size off their own content: the hero CTA
buttons stack full-width, "Open this profile" takes its own row instead of
sharing one with a timecode, and the seven checklist ticks lose 2px of gap each.

Also fixed at small widths: badges that were right-aligned in a row which no longer
fits now left-align, the 96px "No parsing / No scoring / No walls" label column
becomes a label above its sentence, the FAQ reserves 34px rather than 48px for its
`+` marker, and section padding is cut roughly a third so a phone is not scrolling
through empty space.

A test now pins each of these by selector, so the tiers cannot be quietly dropped
again. No bundle changed: `index.html` is served `no-cache`.

## [0.8.58] · 2026-10-02 — The headline now says 500+ job listings

The jobs band on the landing page moved from "100+ job listings" to **"500+"**, in
all four places the number appears: the section headline, the oversized figure beside
the CTA, the micro line under the signup form, and the closing footer count. Leaving
one at 100 would have meant the page contradicting itself about its own size.

The guard test follows the claim, not the old number: it now requires the 500+
headline and fails if the 100+ version reappears, so the count has to be changed
deliberately in both the page and the test.

No bundle changed, so there is no cache-buster bump — `index.html` is served
`no-cache`.

## [0.8.57] · 2026-10-01 — The 5-a-day limit is disclosed before you click

The daily job-post allowance is now stated on the Apply popup, directly under the
"Draft resume" and "Interview prep" buttons, and again at the top of both tools:
*"Free while you are a member: 5 job posts a day, shared between resume drafts and
interview prep. Re-opening a job you have already used today is free."*

Inside a tool the line becomes specific — "3 of 5 job posts left today" — as soon
as the database answers. Until the migration is applied the policy is still
disclosed, but no countdown is shown, because nothing is counting yet.

A test now fails if the number in that sentence stops matching the number the
database enforces, so the copy cannot quietly drift from the limit.

Cache: `app.js` → `?v=20261001j`.

## [0.8.56] · 2026-10-01 — Five job posts a day, then come back tomorrow

Resume draft and interview prep now share a daily allowance: an account can run
either tool on **five distinct job posts a day**. Re-opening a job it already
used today is free — the allowance is per job post, not per click. On the sixth,
the tool stops and says the allowance resets after local midnight (Asia/Kolkata).

The count lives in the database, not the browser. A new `tool_usage` table holds
one row per account, per day, per job post, written only by a `security definer`
function that takes the user id from `auth.uid()`; `insert`/`update`/`delete`
are revoked from the browser entirely, and the count-and-insert runs under a
per-user advisory lock, so two tabs cannot both slip past the limit and clearing
localStorage does not buy a fresh five.

Apply `supabase/tool_usage_migration.sql` to turn this on. Until then the tools
behave exactly as before and the console names the missing migration.

Cache: `app.js` → `?v=20261001i`, `store.js` → `?v=20261001g`.

## [0.8.55] · 2026-10-01 — Each job card shows your match score

Every card on the jobs page now carries a match score directly under the
"Posted by Swapiki" badge — the same number the "Apply with my profile" popup
shows, computed from your profile against that listing's description, skills and
title. It is colour-banded (80+ strong, 60+ good, 40+ fair, below that low) and
only appears when there is a profile to score; a card with nobody signed in shows
no score rather than an invented one.

Cache: `app.js` moves to `?v=20261001h`.

## [0.8.54] · 2026-10-01 — Every card on the jobs page says "Posted by Swapiki"

The public board used to state provenance per source: "Via Adzuna" on imported
listings, "From Swaniki careers" on the studio's own roles, "Posted by employer"
on a submission, and "From a WhatsApp group forward" on anything else. Every
card now carries the same label — **Posted by Swapiki**. The admin review view is
unchanged and still shows the real source, so a reviewer can still tell a
submission from feed copy.

Cache: `app.js` moves to `?v=20261001g`.

## [0.8.53] · 2026-10-01 — Swaniki's own roles lead the board, the digest and the nudge

Four current openings from swaniki.com/careers are on the board as published,
pinned roles. A pin is a fixed flag, not a score: it leads the order, and every
tie below it is still broken by arrival, then id.

**The four roles**

- Frontend Engineer, Backend Engineer, Software Development Intern, and Marketing
  & Design Intern. All remote, all pointing at the careers page. They are
  published directly, which is the deliberate exception for roles Swaniki itself
  owns; a public submission still enters as a draft and still needs review.

**Where they lead**

- The board sorts `featured` first, then arrival, then id, so the pin cannot
  reorder anything under it.
- The weekly digest leads each of its two sections (jobs, internships) with the
  pinned roles.
- The nudge card is one mixed card of four, and the pin is capped at two of those
  four slots, so the card still matches its own caption — a mix of jobs and
  internships candidates are applying to, not an advert for the studio.

**Admin and safety**

- Job Review gains a pin and an unpin button, and a pinned row is labelled as
  such wherever it is shown. Pins sort first before search and paging, so a
  search still finds every row.
- Every read path (board, digest, nudge) falls back to arrival order when the
  `featured` column does not exist yet, and says which migration to run. Nothing
  throws and no board 500s on an un-migrated database.
- `supabase/swaniki_jobs_migration.sql` adds the column and its index;
  `supabase/swaniki_seed_jobs.sql` is the source of truth for the four roles. Add
  a line and it publishes; edit a line and it refreshes in place; delete a line
  and it is retired (draft, unpinned), never deleted. A refresh never touches
  `status` or `featured`, so a re-run cannot undo an admin's decision.

**One bug found on the way**

- This page, and the live one, had been through a Windows-1252 round-trip during
  the landing redesign. Every em-dash, arrow and emoji had been double-encoded and
  rendered as `â€"`, `â†'`, `ðŸ""`. Repaired byte-for-byte: the built characters
  are valid UTF-8 again, with no other line changed.

## [0.8.52] · 2026-10-01 — Search, sort and page the admin lists

The admin page renders every candidate and every job at once. 796 job rows is the
real number, and the way to find one of them was scroll, or read the title column.
Three long lists now have a search box, a count that tells the truth about what is
off the bottom, and a "Show 15 more" instead of an endless scroll.

**What was added**

- **Search on Candidates, Job Review drafts, and Published.** Fifteen rows, then
  "Show 15 more" adds fifteen. Candidates are sorted by name A–Z, with a button to
  flip to Z–A, and a row with no name sorts last rather than first.
- Job search covers title, company, place, category, source, contact details and
  the original `raw_text` — the wording the employer used is often the only thing a
  reviewer can recognise a listing by.
- Candidate search covers name, handle, email, phone, headline, place and skills.
- Every word typed has to appear, in any order, so "acme pune" works.

**Why the lists no longer lie**

- The count says what it means: "showing 15 of 41", "3 of 41 matching",
  "nothing matches". A heading that said 41 above fifteen rows read as a queue of
  fifteen.
- "Select all" still covers the rows on screen, and says so. It is deliberately
  not extended to rows the admin cannot see.
- An empty list with a search in it says the search did not match, instead of
  "Nothing to review" — which reads as though the admin had cleared the queue.
- A search that matches nothing does not claim the queue is empty.

**Why it stays fast**

- The queue and the candidate list are read once and kept in memory, so a keystroke
  is arithmetic on what is already on the page. A search box that re-queried on
  every character would put back the lag the targeted repaint removed.
- The search boxes sit outside the block a decision repaints. Inside it, the first
  keystroke would replace the element being typed into and the second would go
  nowhere.
- A new search starts at the first page; paging depth is kept per list.

**One bug found on the way**

- The "nothing matched" line printed the search term back as markup, unescaped, in
  both the table and the phone-card empty states. Escaped where the message is
  printed now, so no caller has to remember to.
- The sort button did not update its own label when the list flipped, so it read
  A–Z over a Z–A list. It is told the new direction on every repaint.

---

## [0.8.51] · 2026-10-01 — Select all works, and the rest of the admin page holds up

"Select all" did nothing in either table. The count never moved off zero, so the
bulk buttons stayed greyed out and the whole bulk path looked broken. That was
regression, from the repaint below.

**What was wrong**

- The change listener was bound to each checkbox. Every decision replaces the
  checkboxes wholesale, so from the first press onwards nothing was listening:
  pressing the master box ticked nothing, ticking a row never updated the count,
  and the bar stayed disarmed. A repaint that made the page fast also made the
  selection dead.
- One delegated listener on the container now handles every checkbox, bound once.
  The container is never replaced — only its contents are — so it outlives every
  repaint and every re-entry of the admin page. Binding is guarded, so a second
  visit cannot stack a second listener, which would read one tick as two toggles
  and leave the table exactly as it was.

**The rest of the admin page, checked**

- The phone cards for the queue carried no buttons at all. The bulk bar is hidden
  below `md`, so on a phone the review queue was readable and completely
  undecidable. Each card now carries the same publish / reject / delete as its
  row, and a published card can go back to draft.
- Reject was reversible in every word on the page except the one place it
  mattered: the note under the queue told an admin to set a status back to draft
  by hand, which takes a SQL client. Rejected rows now sit in a collapsed
  **Rejected (N)** list with a **Reopen** button on each, and the note is gone.
- Candidate names, handles and admin emails were interpolated into
  double-quoted `onclick` attributes with only `'` escaped. A quote in a display
  name closed the attribute and the rest ran as script. They are read from `data-`
  attributes now. Same bug as the job titles below, in the two tables I had not
  looked at yet.
- An admin could remove their own access, one click from locking the admin area
  shut, with nothing on the row to say that one was different. It is refused now.
- Deliberately not changed: the stat cards count candidate profiles rather than
  jobs, so a decision cannot leave them stale. Feedback is capped at 200 rows and
  the charts are inline SVG, so nothing on this page accumulates state per render.

## [0.8.50] · 2026-10-01 — The admin decides a job without waiting to look at it

Pressing a button in Job Review did nothing visible for a second or more, so it
got pressed again. The row never had a Reject button at all — the only red button
on a draft was a permanent delete, and the one real reject was buried in the bulk
bar. Both are fixed, along with the lag behind them.

**The row now has the decision it was missing**

- Reject is a button on every draft and every published row, next to publish and
  delete. It means what the bulk button and the curation rules mean by it: a
  status change, kept and reversible. There was no way to reject a single job
  before, which is why the delete button was the one that got reached for.
- Delete says what it is. It is the only irreversible action on the page and it
  sits one button away from reject, so its prompt now names itself as permanent
  and points at Reject as the reversible option for "just take it off the board".

**Why a press now answers immediately**

- The row moves on the press, not when the write returns. The queue is kept in
  memory after the admin reads it, and a decision repaints the two review tables
  from that copy — no second read of the jobs table, and no skeleton flash.
- A press that arrives while the previous one is still open is ignored rather than
  queued. The repeat the admin reported became a duplicate decision before; now
  the first press owns the outcome and the row is unlocked again once it lands.
- A failed write puts the row back where it was and shows the real reason, so the
  queue on screen never claims a publish the database refused.
- A full admin render is six queries, four charts and every row on the page. Two
  of them running at once is what made the page feel slow, so a render requested
  while one is open now waits for it and asks for one more pass instead of
  starting its own.
- Only the layout the screen will actually show gets built. The phone cards
  repeat every row behind a `md:hidden` wrapper, so on a desktop the queue built
  twice over for a layout nobody was looking at: 3.0 MB of markup and 17.6 ms of
  string building became 1.6 MB and 4.7 ms, and the browser parses 46% less.

**One thing this found along the way**

- Row buttons interpolated the job title into `onclick="..."`. A title is
  employer-supplied, so a quote in one was an attribute break away from running
  script in the admin's session, and the delete button had been doing it all
  along. The handlers now carry only the uuid and read the title off the queue
  when they need it for a confirmation.

**Not changed, deliberately**

- `adminListJobs()` still selects every column. Dropping `raw_text` would cut the
  payload further, but that column is the "Original post" a reviewer checks a
  listing against, and the alternative — fetching it only when the expander is
  opened — would trade a real review aid for a load-time number.

## [0.8.49] · 2026-10-01 — Anyone can post a job; an admin still decides

The "Add a job" form lived in the admin, which meant only we could ever add a
listing. It now lives on the public `/jobs` page, where an employer or recruiter
can fill it in — signed out, no profile — and the admin keeps the only power that
matters: whether it goes live.

**The flow**

- The form posts to `POST /api/submit-job` and lands in the admin's Awaiting
  approval list as a draft. Approval is the existing single-row or bulk action;
  nothing new was needed to publish it.
- The admin's section is now "Job Review". The add-a-job form is gone from it, and
  the section says where posting happens instead.
- Its badge counts the **jobs waiting for a decision**, not the rows in the table.
  41 and 796 are both true, and only one of them is the size of the work; the
  published total keeps its own heading, so the "Awaiting approval" line and the
  paragraph above it — which restated the same number twice at two sizes — are
  gone.

**Why a Pages Function rather than an RLS change**

- `jobs` is admin-insert-only on purpose, and the public anon key ships inside the
  JS bundle. Loosening INSERT to "anyone" would hand the internet write access to
  the same table `/jobs` renders as `JobPosting` JSON-LD into Google's index.
- One service-role door beats an open table — but only because the route is the
  strictest thing in the pipeline, not the loosest: `status` is hardcoded to
  `draft` and `source` to `user-submission`, and **neither is ever read from the
  request body**. A `dedupe_key` is not sent either, so a submission cannot
  collide with, or be swept against, a real feed listing.
- Those two hardcoded values are what keep a submission out of every automated
  path. `/curate` and the staleness sweep both scope to `source = 'adzuna'`, and
  `/notify` only messages adzuna drafts, so a posted opening is a human's decision
  from insert to verdict.

**Spam, without turning the site into a captcha**

- Honeypot field, per-IP limit (5/hour, in-memory and best-effort), and
  per-field length caps. The honeypot is answered exactly like a success so a bot
  learns nothing, and it writes nothing.
- A post missing a title, a company or a way to reply is refused whole, with the
  missing parts named. A partial draft is a row in the review queue that nobody
  can act on.
- `contact` is stored as text, not parsed. "WhatsApp: 98765 43210" is the common
  case and the colon makes it look like a URI scheme — so only the schemes that
  can execute in an href are refused, and whether a stored value becomes a link
  is decided again at render time.

**The form is outside the 80% gate, on purpose**

- Reading the board is still gated. Posting an opening is how a board gets its
  listings, so hiding the form behind a sign-in would mean only members could ever
  contribute one. It renders in all three states of the jobs page: signed out,
  under 80%, and the board.

**Also**

- `adminJobProvenance` badges a submission as "Posted by employer" and shows the
  contact (linked only when it is http(s), plain text otherwise, and flagged when
  there is none at all).
- `renderJobCard` no longer defaults an unrecognised source to "Posted by
  Swapiki". It says `adzuna` → "Via Adzuna", `user-submission` → "Posted by
  employer", and anything else → forwarded copy, because claiming authorship for
  a listing nobody at Swapiki wrote is the same lie in a smaller font.
- `store.adminCreateJob` is deleted. It was a second write path into `jobs` that
  bypassed every validation the public route now applies.
- `supabase/job_submissions_migration.sql` adds no columns and no policies: it
  documents `user-submission` on `source`, corrects `first_seen_at`'s comment now
  that a human path stamps it too, and adds a partial index for the submission
  queue.
- A project that has not run the ingest migration still accepts posts: the retry
  drops `first_seen_at`/`last_seen_at` only, and the draft guarantee survives it.

**Tests: 289 → 319** (`tests/job-submissions.test.js`, 30 new)

- The route: draft-only and source-agnostic writes, a body that claims
  `published`/`adzuna`, a honeypot, the rate limit, the retry, an unconfigured
  deployment, and a `javascript:` contact.
- The page: the form in all three states, the missing-field check that avoids the
  round trip, the escaped server message, and the button coming back after a
  failure.
- The admin: the form is gone, the queue is not, and a submission is labelled and
  linked honestly.

---

## [0.8.48] · 2026-10-01 — The undecided jobs come to your phone

Curation already triages the feed, but it deliberately stops at titles it cannot
judge. Those drafts used to wait for you to open the admin UI. Now they arrive as
a Telegram card with two buttons, and the decision is written straight to the
database.

**The flow**

- `POST /notify` (secret-gated) sends a card per undecided draft and stamps
  `review_sent_at`.
- `POST /telegram` is the webhook: a button press re-reads the job, writes
  `published` or `rejected`, and edits the card in place with the outcome.
- The scheduler calls `/notify` after `/ingest?curate=1`, every two hours. A
  draft queued at 09:00 is messaged by 09:05, while the role is still open.

**Why the press is checked again instead of trusted**

- The callback only names a job. The decision is made against the row as it is
  *now*, so a double-press, or a press after the job was already decided in the
  admin UI, is answered "already decided" rather than unpublishing a live listing.
- Only `status = 'draft'` is writable from a press. A reject marks the row
  rejected; it never deletes it, matching curation.

**Two gates, because they answer different questions**

- The `X-Telegram-Bot-Api-Secret-Token` header proves the request came through the
  webhook URL rather than from the open internet. The presser's Telegram id must
  also equal `TELEGRAM_ADMIN_CHAT_ID` — the secret says nothing about *who*
  pressed, and in a group the presser and the chat are different people. Both are
  required, so a group is not a valid queue.
- The uuid in `callback_data` is shape-validated before it is interpolated into a
  PostgREST filter. Only a uuid ever gets there in the first place, but the
  webhook is a public endpoint and "only we can send this" is not an assumption
  worth making.

**Telegram answers 200 with `ok: false` for application errors**

- Checked alongside the status code, because a status-only check reports a
  refused send as delivered — and the job would be stamped "sent" having never
  been seen. A row is stamped only after Telegram confirms, so a transient
  failure retries next run instead of dropping a job out of the queue.

**One card, one ask**

- `review_sent_at` means an ignored draft is asked about exactly once. A queue
  that re-nagged every two hours would get the bot muted, and a muted bot is
  worse than no bot.
- Fields are clipped per field, never by slicing the finished message, which could
  cut mid-tag — Telegram rejects a card whose entities it cannot parse, losing
  the message entirely.

**Also**

- `rest()` moved to `lib/postgrest.js` and `json`/`secretMatches` to
  `lib/http.js`, so the three routes share one PostgREST client and one
  timing-safe secret compare.
- A missing `review_sent_at` answers 503 naming the migration, rather than
  reporting `sent: 0` — which is indistinguishable from a quiet queue.
- `scripts/telegram-setup.ps1` does the whole BotFather dance: discovers your chat
  id, stores the three Pages secrets (via stdin, never a command line), registers
  the webhook restricted to `callback_query`, and verifies both ends.
- The scheduler now logs the notify result separately, so "0 sent" and "the
  notifier never ran" don't look alike. A notify failure is logged without
  failing a run whose ingest already succeeded.

**Tests: 198 → 238**

- `tests/telegram.test.js`: markup injection through a crafted title, attribute
  breakout through `apply_url`, sparse and pathological cards, callback decoding
  against injection attempts, and the `ok: false` trap.
- `tests/telegram-routes.test.js`: the queue filter, send-then-stamp ordering,
  partial failure, the already-decided and not-the-admin refusals, a failed write
  keeping its buttons, and a committed decision surviving a failed card edit.
- Scheduler tests updated for the second call and the `*/2` cron.

---

## [0.8.47] · 2026-10-01 — Salary becomes structured data, and stops being assumed full-time

Follow-up to 0.8.46. The board already refused to *invent* a salary; this release
lets it state a real one, and removes another assertion nobody had checked.

**Structured salary (`baseSalary`)**

- `salary_min`/`salary_max` are now real, executable DDL in
  `supabase/jobs_ingest_migration.sql` rather than a commented plan. Running that
  file for a second time is safe — it only adds the two columns.
- `/jobs` emits a proper `MonetaryAmount` (`INR`, `unitText: YEAR`) from those
  numeric bounds. A one-sided range is emitted as stated — a stated minimum is
  never completed by guessing a maximum.
- PostgREST returns `numeric` as a JSON **string** (`"1200000"`), which is right
  for the database and invalid for schema.org. Bounds are coerced to numbers, and
  anything unparseable is dropped rather than becoming `0` or `NaN`.

**Neither side of the fix can order-depend**

- The importer and the board both detect that the columns are missing and fall
  back, because PostgREST fails the **whole** request for one unknown column.
  Deploying the code before the migration loses at most one ingest batch (which
  is retried) and never blanks the public page — the exact outage an earlier
  board select caused. The importer caches the answer per isolate and logs a
  warning naming the migration.
- `isMissingColumnError()` distinguishes `42703` from the other failures that
  share a `400`, so a genuinely malformed request is still reported as an error
  and does not silently trigger the fallback.

**Honesty**

- **Removed `employmentType: "FULL_TIME"`**, which every one of the 300+ listings
  claimed regardless of the feed's `contract_time` (which is not even stored).
  Google says to omit the field when unknown; a constant we never verified is
  strictly worse than no field. This is the same class of fix as `datePosted` in
  0.8.46.
- **Published jobs still do not expire, and that is now written down as a
  decision** rather than left looking like an oversight.

**Tests: 185 → 197**

- `tests/postgrest.test.js`: the missing-column detector against the real
  PostgREST error shape, plus the failures it must NOT match, and `numericOrNull`
  against the string-vs-number trap and a dozen values that must not become a
  salary.
- Board tests: real `MonetaryAmount` output, the numeric-string case, one-sided
  ranges, malformed bounds, and — the regression that matters — the board still
  rendering every job when the salary select 400s.
- Importer tests: bounds are sent when the schema has them, and a missing-column
  insert is retried without them while the draft guarantee is preserved.

---

## [0.8.46] · 2026-10-01 — The board curates itself, and stops lying about dates

The manual approval queue is gone. Curation rules now decide what reaches the
public board, and a scheduled Worker runs the whole thing daily.

**Curation (opt-in, `POST /ingest?curate=1`)**

- New `functions/lib/curate.js`: publish / reject / review rules over draft titles.
- First real pass over the queue: **269 published, 121 rejected, 32 left for
  review** from 422 drafts. Public board went from 10 to **317** listings.
- Rejects are 51 retail-banking/relationship-sales roles, 30 duplicates, 14
  non-technical sales, 13 agencies/training providers, 5 admin, 4 recruitment,
  and 1 salary (`₹18,000 - ₹33,000` is a monthly figure in an annual field).
- Reject wins over publish in the same title, so "Data Analyst — Retail Banking"
  is rejected while "Data Analyst" is not. Salesforce/data roles are unaffected.
- Unrecognised titles are never published; they stay as drafts.
- **Curation reads only `source = 'adzuna'`.** Hand-typed drafts are never
  auto-published.
- `?dry=1` previews the verdicts and writes nothing — it does not even contact
  the feed, so a dry run can never change what the next real run would publish.
- An empty feed still curates, so a rate-limited run cannot quietly freeze the
  queue for a day.
- Curation is idempotent: a second run changes nothing.
- The admin Jobs Board now shows how many listings were auto-rejected, so a large
  rejection pass does not look like a queue that silently emptied.

**Daily schedule**

- New `worker/scheduler/` Cloudflare Worker runs `POST /ingest?curate=1` at
  **06:17 UTC daily**. It holds no Adzuna or Supabase credentials — only the
  shared secret. `workers.dev` and preview URLs are off; the Worker only responds
  to its own cron trigger.
- Every run logs real counts, and logs an *error* on any non-2xx, missing secret
  or unparseable body, because a broken schedule is otherwise indistinguishable
  from a day with no new jobs.
- `INGEST_SECRET` was rotated, since the previous value had been shared in chat.

**Public board (`/jobs`) — honesty and scale**

- Board cap raised 20 → 500 rows, and the `JobPosting` graph raised from 10
  entries to every rendered job. The old caps meant a several-hundred-row board
  looked identical to a board of ten.
- **Fixed: `datePosted` was `new Date()`**, which restamped every job as posted
  *today* on every request. It now uses the real `first_seen_at`, and is omitted
  entirely when there is no date rather than invented.
- **Fixed: stored XSS in the `JobPosting` markup.** A job title containing
  `</script>` could close the JSON-LD `<script>` tag; `JSON.stringify` does not
  escape `<` or `>`. Now emitted as `\u003c`/`\u003e`, which is valid JSON and
  parses back identically.
- `baseSalary` is no longer emitted from the formatted salary string. It is
  invalid structured data (schema.org requires a number) and the underlying
  columns do not exist yet — see the pending block in
  `supabase/jobs_ingest_migration.sql`.
- The board is grouped by category with counts, in a fixed order.
- The header "Jobs" link points at the public board instead of the gated in-app
  view. The "100+" headline is now true.

**Tests: 151 → 185**

- Behavioural tests for the curation endpoint against a stubbed Supabase: dry run
  writes nothing, source isolation, idempotency, and the empty-feed path.
- New `tests/jobs-board.test.js`. Its main check is that the board's `select` only
  names columns the migration actually creates — the check that would have caught
  the bug where it named `salary_min`/`salary_max`, which silently blanked the
  public page for one deploy. The unit tests could not: the stub happily returned
  those columns. Only the live page showed the real answer.
- New `tests/jobs-scheduler.test.js`: the cron kickoff, plus failure modes that
  are invisible by definition — missing secret, 401/500/503, non-JSON body.
- Three existing tests were passing for the wrong reason and now assert the real
  property: the "never publishes" test skipped the new `applyCuration` write only
  because of call syntax; the refresh test was reading the first `PATCH` in the
  file, which is now curation's; and the salary-prediction fixture's
  `salary_is_predicted: "0"` was a *string*, so a naive truthiness check would
  have inverted the rule.

---

## [0.8.45] · 2026-10-01 — The importer is switched on, and one label was lying

With the migration applied and the Adzuna credentials and ingest secret set in
Cloudflare, the importer ran against production for the first time.

- First production run: **423** listings inserted as drafts, 0 errors, 15s.
- Second run: **0** inserted, **423** refreshed. Dedupe works, and the repeat run
  is a no-op rather than a second pile of copies.
- Public `/jobs` still serves exactly **10** `JobPosting` blocks. Nothing the feed
  returned can reach the public board without a human clicking approve.
- Wrong `x-ingest-secret` still returns 401; `GET /ingest` still returns 405.

**Corrected:** the provenance link in the admin queue was labelled "check the
original". The `href` is Adzuna's own detail page, not the employer's ATS, so
the label promised a first-party posting the reviewer cannot actually reach from
there. It now says "view on Adzuna", and a test asserts the old wording stays
gone. This is the same class of error as the removed "Verified" badge: a
confident claim about a destination we do not control.

Also corrected the 0.8.44 entry, which said 25 cross-query duplicates. The
9-query probe returned 274 rows and 242 after dedupe, so the real figure is 32.

Still outstanding, and unchanged by this release: the "100+" headline against 10
published listings, and the header Jobs link pointing at the gated in-app board.

## [0.8.44] · 2026-09-30 — The feed ran for real, and the salaries were backwards

0.8.43 shipped the importer unverified, because it needed an API key. With a
key in hand the adapter ran against the live India feed, and three things turned
up that no hand-written fixture would have caught.

- **Every employer-stated salary was being dropped.** Adzuna sends
  `salary_is_predicted` as the **string** `"0"`, not the number `0`. The non-empty
  string `"0"` is truthy in JavaScript, so `if (result.salary_is_predicted)`
  fired for unpredicted salaries and suppressed all of them — keeping only the
  ones we most wanted to avoid. The first live run mapped 183 listings with
  `with salary: 0`. Now coerced explicitly, accepting `"0"`, `"1"`, `0`, `1`,
  `true` and the string forms of each.
  The unit test had passed throughout, because its fixture used a number. A test
  that mirrors the code's assumption instead of the wire format is worse than no
  test, so the case now asserts the *type* and the truthiness trap explicitly.
- **Implausibly wide salary bands are dropped.** The feed served a "Sales
  Intern" at ₹1,20,000 - ₹12,00,000 — a 10x span, evidently a monthly figure
  paired with an annual one. Bands wider than 4x are now rejected as unit errors
  rather than shown; normal senior bands are untouched.
- **Skills are read from the description as well as the title.** Title-only
  matching recovered skills for 11 of 50 live software roles; title + description
  recovered 17, and every hit inspected was a genuine mention. Since
  `jobs.skills` feeds `profileMatch.requiredSkills()`, the missing ones were
  costing real ranking accuracy. The fixed vocabulary is what keeps this safe — a
  match must be one of ~40 literal strings, never a guess from prose.
- **Internship coverage widened.** Probing the feed showed `software engineer
  intern` returns only 9 listings in 3 days while `developer intern` returns 72,
  and `graduate engineer trainee` (36 in 30 days) is a distinct and common Indian
  entry route. `DEFAULT_QUERIES` went from 6 to 9 entries.
- **Live numbers.** 9 queries, 274 listings fetched, 242 after cross-query
  dedupe, 32 collapsed as already seen by another query. Mix: 163 IT, 51 BFSI,
  28 uncategorised. All 242 landed as `draft`; 0 could reach `published`.
- **Found and corrected:** Adzuna truncates `description` at 500 characters on
  this plan, so our 4000-char cap is never the binding limit. Noted rather than
  "fixed" — the cap stays as a guard if a deeper plan is enabled later.
- **3 new tests** (25 in `tests/jobs-ingest.test.js`). Suite is 151.

---

## [0.8.43] · 2026-09-30 — The jobs board can fill itself now, but only as far as the draft queue

The board had 10 hand-pasted listings and a headline claiming 100+. Both of
those are the same problem: every posting was a human copying a WhatsApp
forward into a form, which does not scale and does not keep a number honest.
So the queue now has a second, automated source — with the approval step
untouched.

- **`POST /ingest` pulls new openings from Adzuna** (India, `country=in`) and
  lands them in the *same* draft queue the manual form fills. Setup and the
  environment variables are in `supabase/JOBS_INGEST.md`.
- **Imported jobs are always drafts, enforced in three places.** `status` is a
  hardcoded literal in the normalizer, a hardcoded literal in the insert
  payload, and re-serving an existing listing PATCHes `last_seen_at` and
  nothing else — so a published job can never be knocked back to draft by a
  later run. A test scans the ingest files for any assignment of the string
  `"published"`. This is the load-bearing decision of the release: `/jobs`
  emits `JobPosting` JSON-LD, so an imported listing that reached published
  would put unreviewed third-party copy in front of Google and employers.
- **`supabase/jobs_ingest_migration.sql`** adds `dedupe_key` (partially unique,
  so a daily re-run can never duplicate a listing), `apply_url`, `first_seen_at`
  and `last_seen_at`. No RLS changes. Idempotent.
- **The admin queue shows provenance.** Imported rows carry a "From Adzuna"
  badge and a "check the original" link, because a reviewer needs to compare the
  row against the employer's own posting before approving it. The link is
  scheme-checked to http/https — a `redirect_url` is attacker-influenced, and
  `javascript:` in an href would run on click.
- **Predicted salaries are dropped, not caveated.** Adzuna sets
  `salary_is_predicted = 1` when it infers a figure from the description. On
  this site that renders identically to an employer-stated number, so it is
  omitted.
- **Skills come from a fixed vocabulary** matched against the job title only,
  capped at 6, because `jobs.skills` feeds `profileMatch.requiredSkills()` and
  a sloppy extraction would corrupt candidate scoring.
- **A missing Adzuna key returns 503 with an explanation**, and a run reports
  per-query `errors`. A scheduler that silently imports nothing looks exactly
  like an empty feed.
- **`GET /ingest` is refused** (405) so the route cannot be triggered by a
  stray request, and the secret is compared in constant time.
- **Fixed a latent bug in `tests/helpers/app-sandbox.js`**: the fake browser had
  no `URL` global, so `new URL(...)` threw a `ReferenceError` that a
  surrounding `try/catch` turned into a silent "no link". The scheme-check tests
  were passing for the wrong reason until the real `URL` was supplied.
- **22 new tests** in `tests/jobs-ingest.test.js`. Suite is 148.

---

## [0.8.42] · 2026-09-30 — The awkward caption is gone, the play button tells the truth, and the 80% gate stops being a surprise

Follow-up to 0.8.41, prompted by the still-frame caption landing in an odd
place under the hero card. Rather than move it, the claim is now carried by the
control itself, which is where a visitor looks.

- **The caption is removed, not relocated.** "Still frame from a real 2-minute
  walkthrough..." was a paragraph of fine print bolted under a decorative card.
  It is gone, and a test asserts it stays gone.
- **The hero control is a labelled pill.** The bare circle is now
  `→ Open this profile`, so the affordance describes itself and no caption is
  needed. The timecode went from a running `0:47 / 2:00` to `2:00 max` - a
  duration, not a playhead position, which is the other half of the media-player
  illusion.
- **New FAQ entry: the 80% gate.** `app.js` gates the in-app jobs board at 80%
  completion and shows the candidate their own percentage, but the landing
  claimed "Open to everyone - no profile gate" without ever mentioning that a
  second, gated board exists. That is the kind of thing someone finds out after
  spending ten minutes on a profile. The new answer names the gate, the
  threshold, and which route is genuinely open, and links to the public
  `/jobs` page. Six questions now.
- **New progress ticks in "How it works".** Seven terracotta segments above the
  recorder card, matching the seven items in `CHECKLIST_DEFS`
  (`js/profileChecklist.js`): name and title, location, a link, first project,
  voice walkthrough, second project, publish. The count is asserted against the
  source file, so editing the checklist without updating the landing fails the
  build instead of quietly going stale.
- **A test now holds the two jobs claims together.** The band says the public
  board is ungated, which is only honest while the FAQ discloses the in-app
  gate. If someone removes the disclosure, the band's claim fails with it.
- **2 new tests** (15 in `tests/landing-page.test.js`). Suite is 126.
- No JS changes, so `dist/output.css` and `dist/js/*` are unchanged.

---

## [0.8.41] · 2026-09-30 — The widest claims on the site were the least true; the hero no longer fakes a player

Two honesty problems survived every earlier pass because both sat outside the
part of the page anyone reviews, and one new section to answer the objections
that actually stop someone publishing.

- **The share and search text still promised "verified project proof."** The
  redesign removed the invented statistics from the body copy, but the title,
  meta description, Open Graph and Twitter descriptions, and the JSON-LD all
  still said candidates "deliver verified project proof" - the widest-reaching
  words on the site, and the ones a candidate meets in a Google result or a
  WhatsApp forward before ever opening the page. The product verifies nothing:
  no identity check, no credential check, no audio analysis. All six
  occurrences are now gone, replaced with what the product actually does -
  proof read by a person, audio never scored, ranked or sentiment-analysed.
  The JSON-LD states the negative outright ("nothing is presented as
  independently verified") so a search crawler reads the same caveat a
  candidate does.
- **The title promised an outcome it cannot deliver.** "2 Minutes to a Confident
  Interview Decision" was the one remaining claim about results. Swapiki cannot
  promise an interview, and the body copy is careful never to. The title is now
  "Your project proof, in your own voice", which describes the product rather
  than the outcome.
- **The hero shipped a fake player.** There is no audio file anywhere in the
  repo, but the hero drew a play triangle over a running timecode reading
  "0:47 / 2:00", on a control whose accessible name was "Play sample
  walkthrough" and which in fact navigated to a profile. It read as broken to
  anyone who clicked it and as a false claim to anyone who read it. The control
  is now an arrow labelled "Open a sample candidate profile" - matching what
  it does - and the waveform carries a caption saying it is a still frame and
  that this page ships no audio. The triangle pseudo-element was deleted rather
  than hidden, after a first attempt left a scoped copy drawing a second glyph
  underneath the arrow.
- **New section 07: "Straight answers."** Five questions as native
  `<details>`, so they work with JavaScript disabled and are keyboard
  reachable with no extra code. Every answer describes current behaviour rather
  than the roadmap, and each was checked against the code rather than assumed:
  the anti-fraud phrase *is* transcribed, in the browser, so the answer says it
  is "checked" and "not stored against your profile" instead of denying that
  transcription happens. The verification question answers "no - and we would
  rather say so than imply otherwise", which is the honest version of the
  promise the meta tags used to make.
- **Verification claims are now banned by pattern, not by word.** The first
  version of these tests rejected any occurrence of "verified", which failed on
  the sentences that *deny* verification - exactly the copy that should stay.
  The shared `VERIFICATION_CLAIMS` list targets affirmative claims ("verified
  project", "voice verified", "certified", "trusted by N", "100%
  human-to-human") and the tests separately assert that the denials are present.

### Fixed along the way: a test that was failing one deploy in five

The first deploy attempt of this version was **blocked by the test gate**, which
is the gate working correctly. `every generated challenge phrase is unique per
attempt` demanded 500 unique phrases from 500 random draws. `CODE_WORDS` has 81
entries, so the three-word code space is 531,441, and the birthday paradox puts
the odds of at least one collision at **20.9%** - this test was failing roughly
one deploy in five and had only ever passed by luck. The product was never
broken; the test asserted something random sampling cannot promise.

It now asserts the property that actually protects the anti-replay check: that
the code space is large enough to resist guessing (>100,000), that two attempts
in a row never collide, and that 500 draws yield at least 490 distinct phrases.
Expected collisions is 0.235, so that threshold sits about ten standard
deviations above normal. Ran the file 25 times, zero failures. The separate
session-id uniqueness test was left alone - UUIDs have no such collision
problem.
- **3 new tests** (14 in `tests/landing-page.test.js`). Suite is 125.
- Still no JS changes and no new Tailwind utilities, so `dist/output.css` is
  unchanged and stays on `?v=20260930b`.

---

## [0.8.40] · 2026-09-30 — The jobs board gets its own section, and the page becomes keyboard-navigable

- **"30+ hiring managers listening" is replaced by "100+ job listings".** The
  old line was a vague reach claim; what a candidate actually wants to know is
  whether there are real roles to apply to. The number now appears in the hero
  micro-line and in the closing line of the guarantee panel.
- **New section 06, "The jobs board".** A full-width band between the pilot
  feedback and the final CTA: the count, a plain explanation of why one proof
  profile answers every application, and a primary button to the jobs board.
- **The button points at `/jobs`, not the in-app board.** `/jobs` is served by
  a Pages Function and is open to anyone. The in-app board is gated behind 80%
  profile completion, so sending a marketing visitor there would have been a
  dead end. The section says so explicitly ("Open to everyone - no profile
  gate"), which is a genuine advantage over a gated board.
- **The category strip only claims what the live feed supports.** A first pass
  advertised "IT & engineering / BFSI / Design & UX / Data / Product", which
  no live listing matches - the published board is mostly marketing, content,
  sales and support roles, largely remote, plus internships. The strip now
  lists only what is verifiable from `/jobs` itself: across India, remote and
  onsite, full-time and part-time, internships, fresher-friendly roles, and
  published salary ranges. A test asserts both halves of this, so the fiction
  cannot come back and the real claims cannot be dropped.
- **Keyboard users can actually see where they are.** The landing is almost
  entirely pill buttons and one real link, and there was no focus style at
  all, so tabbing looked like nothing was focused. There is now an explicit
  terracotta focus ring across the landing, header, mobile menu and footer.
- **Anchors no longer land under the fixed banner.** The announcement bar plus
  header are ~120px tall, so `#how-it-works` used to scroll to a heading that
  was hidden behind them. Sections now carry `scroll-margin-top`, and smooth
  scrolling is applied only when the visitor has not asked for reduced motion.
- **3 new tests** (11 total in `tests/landing-page.test.js`). Suite is 122.
- No JS changed, and no new Tailwind utilities were introduced, so
  `dist/output.css` is byte-identical and stays on `?v=20260930b`.

---

## [0.8.39] · 2026-09-30 — Landing redesign: editorial look, and the claims it should never have made (CSS cache `?v=20260930b`)

- **The landing page is rebuilt as an editorial page.** Paper (#F7F3EC) and ink
  (#17130E) with a single burnt-orange accent (#D9481F), Fraunces for display
  and JetBrains Mono for labels, laid out as six sections: hero, the problem,
  how it works, the guarantee, pilot feedback, and the final CTA. The design is
  scoped entirely under `#view-landing`, so the dashboard, admin and profile
  views keep their existing Tailwind styling.
- **The nav, banner and footer now match it.** The theming rules for
  `#site-topbar` / `#site-header` / `#site-footer` had been written, but the
  matching IDs were never added to the markup, so the landing was editorial
  while everything above and below it was still the old blue/amber theme. The
  IDs are now in the HTML, the wordmark and status dots use the new palette,
  and the launch banner lost its rocket emoji.
- **The invented statistics are gone.** The redesign shrank the old stat wall
  but kept citing numbers against sources that do not exist: "11,000
  applications per minute - LinkedIn", "78% - 2026 application audit", "91% -
  Greenhouse AI Hiring Report", "34% - Robert Half". The section now argues the
  problem in words (Volume / Matching / Skimming) and makes no claim we would
  have to stand behind.
- **The real pilot feedback is back, and it is no longer flattered.** All five
  reviews from the live site are reproduced verbatim with their original
  ratings, including the 3/5 "fairly good pilot tool" note and the caveats
  about audio quality and candidates struggling to summarise in two minutes.
  The redesign had promoted Rohan Kulkarni to a flat 5/5 and dropped the
  critical reviews entirely; a wall of five stars is both untrue and easy to
  dismiss.
- **One claim was removed that the product cannot support.** The hero sample
  walkthrough was badged "Reviewed by Swapiki team". Staff review is a real
  badge on real profiles, but nobody has reviewed the demo audio, so the badge
  now states what actually happens: live recording confirmed, and audio that
  is never scored by AI.
- **Respects `prefers-reduced-motion`.** The waveform ribbons, hover lifts and
  pulsing status dots now stop for visitors who ask the OS to reduce motion.
- **Guarded by 9 new tests** (`tests/landing-page.test.js`) covering the chrome
  IDs, the absence of sourced-but-fake statistics, the presence of all five
  pilots with their exact star counts, and the trust copy. Suite is now 120.
- **The stylesheet is now versioned.** `/dist/output.css` was the one asset
  referenced with no `?v=` token, so a browser could keep serving a CSS build
  that predates the new palette. It now carries `?v=20260930b`, matching the
  scheme used by the JS bundles. The JS is untouched and stays on
  `?v=20260930a`.

---

## [0.8.38] · 2026-09-30 — "This is my own work" is now a record, not just a button (cache `?v=20260930a`)

- **The Edit Profile form asks for a truth attestation before it will save.**
  A radio above Save — *"I confirm that everything I write in this profile is
  true and is my own work."* — must be ticked, which enables the Save button.
  It is a behavioural nudge tied to the save action, not a badge.
- **The tick is now stored, not discarded.** `profile_attested_at` (when) and
  `profile_attested_name` (the name as typed at that moment) on `candidates`
  (`supabase/profile_attestation_migration.sql`). Every save through the form
  re-stamps both, so the record always describes the profile as last saved and
  survives a later name change.
- **It stays quiet on purpose.** The public profile shows a muted grey line —
  *"The candidate confirmed these details are accurate and their own work on
  <date>"* — not a pill badge next to "Reviewed by Swapiki team". Anyone can
  tick a box, so dressing it up as verification would repeat exactly the mistake
  the old "Voice verified" badge made: telling a recruiter more than the check
  can support. The words say who claimed what, and nothing more.
- **A missing column is a deployment state, not a failure.** The attestation is
  written in its own isolated Supabase update, the same pattern as voice
  verification and the login reminder. It deliberately does **not** ride along
  in the big profile upsert, because a column that has not been migrated yet
  would then fail the *entire* profile cloud sync. Until the migration is run
  the box still works and the profile still saves; only the attestation skips,
  with a console warning naming the migration file.
- **Tests: 8 new (111 total), all passing.** They pin the two things that are
  easy to regress: that the name is trimmed and persisted locally and to the
  cloud under the right columns, and — a regression guard — that the attestation
  columns never appear in the main profile upsert.

---

## [0.8.37] 2026-09-29 - The voice check now checks something real (cache `?v=20260929ba`)

- **Removed the "voiceprint" comparison, and the false claim it supported.** The
  old check extracted a 26-number MFCC mean/std vector from the recording and
  compared it to an enrolled baseline with a hardcoded `0.80` cosine threshold,
  then showed recruiters a **"Voice verified"** badge and told candidates
  *"anyone checking your profile can trust this is you."* It could not support
  that. MFCC means describe the phonetics of the sentence far more than the
  speaker, the threshold had never been calibrated against a single real
  impostor, the first recording enrolled *itself* as the baseline, and every
  later attempt read a *different* random phrase than the baseline. The tests
  passed because they compared `[1,2,3,4]` with `[1,2,3,4]` - no test in the repo
  ever used audio from a different human being. Deleted rather than parked, along
  with its `voice_signature` reads and writes, plus a backfill that now strips
  the old vector out of cached local profiles.
- **The random code is now actually checked.** The code was already generated
  and shown to the candidate, but nothing ever compared it to the audio, so it
  proved nothing. The engine now runs the browser's speech recogniser alongside
  the recording and requires every code word to appear in the transcript, which
  is what actually defeats replaying an older clip.
- **Codes are 3 random words** (`amber harbor lantern`) instead of 4 characters
  (`K7XB`). Speech recognisers transcribe ordinary words far more reliably than
  spoken letter-number pairs - "K7XB" lands anywhere between "kay seven ex bee"
  and "kasey sex ex bee" - and a verification step that rejects honest
  candidates is worse than no check at all. One transcription slip is tolerated
  on words of 5+ characters, which is why every word in the list clears that bar.
- **Chrome ends a continuous recognition session every ~60s**, so the engine
  restarts it and accumulates across sessions; a 2-minute recording is normal
  here. The transcript is also given a moment to finalise at the end, because
  the code is spoken last and lands in the trailing interim result.
- **The badge is now "Live recording confirmed"** everywhere a recruiter could
  read it: candidate list, public profile, share card, email, WhatsApp, the
  audio-studio banner, and the dashboard. The tooltip says what it proves and
  what it does not. The per-project audit trail records the session, the code
  and what the recogniser heard instead of a similarity score.
- **Browsers without Web Speech (Safari, Firefox) degrade honestly**: the
  recording is still saved, the studio banner says up front that no badge is
  coming, and the check is marked `skipped` rather than failed - a missing API is
  not the candidate's fault and does not burn an attempt.
- **Tests: 30 voice tests, 103 total, all passing.** The MFCC/cosine toy-vector
  tests are gone rather than re-pointed at new code.

---

## [0.8.36] · 2026-09-28 — Repo notes follow the candidate to another laptop (cache `?v=20260924az`)

- **The "what did you actually do" answers are now stored on the candidate's
  account**, not just in their browser. New `repo_notes` table
  (`supabase/repo_notes_migration.sql`), one row per candidate per repo, RLS
  locked to `auth.uid() = user_id` with no anon access — this text is personal
  and is never readable by anyone else. The browser copy stays as an instant
  cache and as the fallback for signed-out visitors.
- **The form now tells the truth about where the words are:** *"Saved to your
  account. Here on every device you sign in on."* vs *"Saved on this device
  only"* when the account copy is unreachable.
- **The device copy and the account copy are merged newest-wins** at boot and
  after sign-in, so signing in on a new laptop brings the story with it, a note
  typed offline is pushed up rather than overwritten, and an identical copy is
  not rewritten on every page load. The device record keeps an updated-at stamp
  and a synced flag; notes written before this existed still read correctly.
- **"Forget these details"** in the form deletes the answers from the account and
  from the device. Previously the store could delete but nothing in the UI could
  reach it, so there was no way to take the text back out.
- **A missing table is a deployment state, not a failure:** until
  `repo_notes_migration.sql` is run, the app keeps saving on the device and says
  so, rather than breaking the form. Nothing is lost while it waits.
- **19 new tests (86 total)** cover both directions of the merge, the
  offline-then-flush retry, a failed push, a missing table, signed-out use,
  corrupt device records, the sanitising (`cleanRepoNotes` keeps only the five
  known fields, trimmed and capped at 400 chars), and the delete path.
- **Tooling: `deploy.ps1` works again.** It failed for two reasons, neither of
  them a real problem with the code: PowerShell 5.1 turned any line npm wrote
  to stderr (a harmless outdated-`caniuse-lite` notice) into a fatal
  `NativeCommandError`, and `npx wrangler` tried to download wrangler from the
  registry because only a global copy is installed, which failed with
  `ECONNRESET`. It now judges success by exit code alone, finds wrangler
  locally → globally → npx, and **runs the test suite first**, which is what
  this script always claimed to do. Production cannot ship a failing test again.

---

## [0.8.35] · 2026-09-28 — The "Add what you did" form no longer eats your typing (cache `?v=20260924ay`)

- **You can no longer lose what you typed.** The form's second button was labelled
  **Cancel**, which quietly threw the text away, and so did "Hide my details". That
  button is now **Done**, closing saves whatever is in the boxes first, and pressing
  `Enter` in any field saves too.
- **Saving no longer yanks the cursor.** It used to jump back to the first unfilled
  box after every save, so you could not type straight down the form. It now keeps
  the caret in the field you were actually in, while still refreshing the
  "N of 5 filled in" counter, the inline green confirmation, and the
  "3/5 details added" badge on the repo row.
- **The toggle no longer loses its place.** Open/closed state is tracked by repo
  name, so re-sorting (Best match / Most recent / Most stars) keeps the form on the
  repo whose details are on screen.
- **Opening the form on a repo you had not chosen also makes it the project your
  answers lead with**, so the form and the model answer can never describe
  different projects; the form now says so when it does. Choosing a different
  project closes the form.
- **Fixed:** the "Copy 60-sec pitch" button in *Your talking points* passed the
  repo's list position to a lookup that now goes by name, so it always failed with
  "Could not find that project."
- **Fixed character corruption** in `js/app.js` (230 runs of UTF-8 mis-decoded as
  Windows-1252, left behind by an earlier edit). Most of it sat in comments, but
  it had reached real text: the job-keyword matcher no longer matched a curly
  "what you'll need", bullet trimming no longer stripped bullet characters, and
  `formatBytes` printed three garbage characters instead of an em dash for
  unknown sizes. The other 19 source files were checked and are clean.
- 67 tests passing.

---

## [0.8.24] · 2026-09-27 — Nudge emails get a "Trending searches" card (cache `?v=20260924x` + worker redeploy)

- **New:** the job board now records what people actually type into the search box
  (`js/app.js setJobsQuery`, throttled/deduped, one event per 15s per term →
  `js/store.js recordSearchEvent`) into a new `search_events` table
  (see `supabase/search_events_migration.sql`) — run the migration so the card
  has a feed.
- **New:** all three nudge emails (`no_login` / `no_project` / `no_voice`) now
  include a **"Trending searches"** card under the existing Top-picks card,
  showing the top 5 search terms from the last 7 days
  (`worker_setup/nudge-emails-worker/worker.js`: `fetchTopSearches` +
  `renderTopSearchesCard`). The card is optional — if the table/policies are
  missing the email still sends without it.
- Placeholders updated in `email-templates/01-havent-logged-in.html`,
  `02-no-voice-recorded.html` and `03-no-project-added.html` (`{{top_searches}}`).

---

---

## [0.8.35] · 2026-09-28 — The "Add what you did" form no longer eats your typing (cache `?v=20260924ay`)

- **You can no longer lose what you typed.** The form's second button was labelled
  **Cancel**, which quietly threw the text away, and so did "Hide my details". That
  button is now **Done**, closing saves whatever is in the boxes first, and pressing
  `Enter` in any field saves too.
- **Saving no longer yanks the cursor.** It used to jump back to the first unfilled
  box after every save, so you could not type straight down the form. It now keeps
  the caret in the field you were actually in, while still refreshing the
  "N of 5 filled in" counter, the inline green confirmation, and the
  "3/5 details added" badge on the repo row.
- **The toggle no longer loses its place.** Open/closed state is tracked by repo
  name, so re-sorting (Best match / Most recent / Most stars) keeps the form on the
  repo whose details are on screen.
- **Opening the form on a repo you had not chosen also makes it the project your
  answers lead with**, so the form and the model answer can never describe
  different projects; the form now says so when it does. Choosing a different
  project closes the form.
- **Fixed:** the "Copy 60-sec pitch" button in *Your talking points* passed the
  repo's list position to a lookup that now goes by name, so it always failed with
  "Could not find that project."
- **Fixed character corruption** in `js/app.js` (230 runs of UTF-8 mis-decoded as
  Windows-1252, left behind by an earlier edit). Most of it sat in comments, but
  it had reached real text: the job-keyword matcher no longer matched a curly
  "what you'll need", bullet trimming no longer stripped bullet characters, and
  `formatBytes` printed three garbage characters instead of an em dash for
  unknown sizes. The other 19 source files were checked and are clean.
- 67 tests passing.

---

## [0.8.34] · 2026-09-28 — The project story is now written, not a template (cache `?v=20260924ax`)

- **New: "What did you actually do in \<repo\>?"** on the project you pick. Five
  short fields — the problem it solved, what you personally owned, why that
  stack, the hardest part, and the measurable result. GitHub cannot know these,
  and they are exactly what an interviewer asks for.
- **The 60-second pitch and the model answer now use them.** With all five filled
  the pitch is a finished answer you can read aloud (plus a closing line aimed at
  the specific role) instead of a page of `[blanks]`; with some filled, only
  those blanks disappear. When something is still missing, the pitch now ends
  with a **STILL TO FILL IN** list naming the exact gaps rather than leaving you
  to hunt for them. The model answer fills its Situation / Task / Result the same
  way.
- Notes are stored per repo name on the candidate's own device
  (`swapiki_repo_notes_<repo>`), so they carry across every job you prepare for
  and are never sent anywhere.
- **New: sort control** — Best match / Most recent / Most stars — so a
  questionable ranking can be re-ordered rather than argued with. Rank lookups
  were moved into one shared ordering (`_ghOrdered`) so the copy and
  choose-project buttons always act on the row you actually clicked.
- **New: every repo explains itself** with a plain-English line: which listing
  skills it uses, or "nothing in the listing matches this one".
- **Fix:** the "Reading your GitHub repos..." progress message was being written
  to an element that only exists in the connected view, so it never appeared; it
  now has its own status line in the connect form and no longer clobbers the
  `@login - N repos` summary.
- 9 new tests (**65 total**) covering note storage, pitch completeness, partial
  notes, the form's visibility, the ranking explanations, and sort/button sync.

---

## [0.8.33] · 2026-09-28 — One-click "Connect GitHub" is live (cache `?v=20260924aw`)

- The GitHub OAuth App **Client ID** is now configured in `config.js`, so the
  interview-prep picker shows a black **Connect GitHub** button next to the
  link field. It uses GitHub's **Device Flow**, which needs no client secret and
  no callback URL, so nothing secret ships to the browser — the token stays in
  that browser's `localStorage` and only ever goes to `api.github.com`.
- Signing in reads **private** repos as well as public ones (scope
  `read:user public_repo`); the pasted-link path is unchanged and still needs no
  sign-in, so nothing is gated behind it.
- Device Flow on the app was verified end to end (a device code was issued and
  discarded). 4 new tests (**56 total**) cover the button appearing only when a
  Client ID is set, the code screen replacing the form, and cancelling back.

---

## [0.8.32] · 2026-09-28 — Connect by pasting your GitHub link, not your username (cache `?v=20260924av`)

- The picker no longer asks for a username. It takes **your GitHub profile link**
  — copy it from the top of your own GitHub page and paste it in. `github.com/you`,
  a full `https://github.com/you` URL, a repo link, `@you` or a bare username all
  work, and the field is prefilled as a link once it is set.
- Card copy now reads "Paste your GitHub link - we pick the project to talk about"
  with a short "that is the address at the top of your GitHub page" hint, and a
  bad paste says what a GitHub link should look like instead of complaining about
  characters. 6 new tests (**52 total**), including link shapes and rejection of
  non-GitHub hosts.

---

## [0.8.31] · 2026-09-28 — "Which of my GitHub projects fit this job?" (cache `?v=20260924au`)

- **New:** the apply popup gained one quiet text link — **"Which of my GitHub
  projects fit this job?"** — that opens interview prep and scrolls to a new
  full-width **`#gh-picker`** card sitting above the practice columns.
- **New: repo ranking.** Connect a GitHub account (or just type a username) and
  the candidate's repos are scored against *this* listing and listed strongest
  first, each with a **% match**, the skills that matched, language, stars,
  last-push freshness, and any penalties (fork, archived, tiny, practice /
  boilerplate names). Forks and archived repos are hidden with a count. Top 5
  by default, "Show all" for the rest.
- **New: the top repo is called out** ("Talk about this one first") and every row
  has **Copy 60-sec pitch** (a written pitch with the result/role placeholders the
  candidate must fill) and **Lead my answers with this**.
- Selecting a project is stored per job (`swapiki_interview_story_<jobId>`) and
  changes what the model answer and "Your talking points" lead with; if no repo
  is chosen the candidate's profile project is used as before.
- **New module** `js/githubMatch.js` (pure, unit-tested, 9 new tests / **42 total**),
  also exposed as `window.swapikiGitHub`. New bundle `dist/js/githubMatch.js`
  (8 bundles total).
- **Sign-in:** public repos work from a username with no app setup. One-click
  sign-in (which also reads private repos) uses GitHub's Device Flow and only
  appears once a Client ID is configured — set `GITHUB_CLIENT_ID` in `config.js`.
  Repos are cached ~20 min; the token is kept in this browser only and is sent
  nowhere but `api.github.com`.
- **Fixes:** repo rows pass a rank, not a name, into their inline handlers (an
  apostrophe in a repo name could previously break the button); `ghError` now
  re-renders before focusing the username field so the field keeps focus; the
  picker degrades gracefully if the GitHub bundle has not loaded yet.
- **Fixes:** the chosen project now survives a page reload (it is rehydrated per
  job, and a repo that has been renamed or deleted is forgotten instead of
  sticking); a repo with no overlap with the listing is no longer used as the
  story for that job, so unrelated repos cannot displace a real profile project.
  Covered by 4 new app-level tests (**46 total**).

---

## [0.8.30] · 2026-09-28 — Answers are checked against the exact job description (cache `?v=20260924as`)

- **New:** practice answers are now scored **/100** on length, STAR structure,
  ownership ("I" vs "we"), proof/numbers, relevance to *this* description, filler
  words, and specificity, with concrete hints for whatever scored worst
  (`checkInterviewAnswer` + `answerHints` in `js/app.js`).
- **New:** a profile-tailored **model answer** in STAR form with a copy button,
  so a candidate can see what a strong answer looks like for that exact role.
- Questions are generated from the real listing — must-haves, nice-to-haves,
  responsibilities, seniority and years are extracted, and each question is
  tagged with where it came from. Bulleted *and* prose-only descriptions work.
- Skill-only jobs with no description still produce sensible behaviour questions.

---

## [0.8.29] · 2026-09-28 — Resume drafting page + cleaner apply popup (cache `?v=20260924ar`)

- **New:** `#resume-draft/<jobId>` builds a job- and profile-tailored resume draft
  in an editable textarea with a live preview, plain-text copy, and
  print / Save-as-PDF output. Reuses the existing builder.
- Fixed a stray `${d.esc? '' : ''}` artifact in the generated draft, escaped
  project headings/bullets, and added `requiredYears` / `profileYears` to the
  browser `window.profileMatch` export.
- Popup: interview prep button added, popup widened to `max-w-5xl`, and the
  button stack replaced by a full-width **Apply** button, a 2-up
  **Draft resume / Interview prep** row, and quieter secondary text links.
- Both new routes keep the existing auth + profile `completionScore >= 80` gates.

---

---

## [0.8.27] · 2026-09-27 — "Apply with my profile" now shows a match score (cache `?v=20260924aa`)

- **New popup section:** tapping "Apply with my profile" on any job now shows a
  **profile-match card** — an overall % vs the listing, a band (Strong / Good /
  Fair / Low), a one-line summary, and a breakdown bar for **required skills**,
  **experience level** and **role focus** — plus chips of skills you already
  have (green) versus ones the job asks for that you could add (amber).
- Scoring lives in the new `js/profileMatch.js` (pure, unit-tested, 9 new
  tests) and is also exported for the browser as `window.profileMatch`.
  Skills come from `profile.expertise` + project tags vs the job's `skills`
  array; experience parses "3+ years" from the listing vs the profile's
  experience string; role focus compares the headline/projects vs the title.
  No skills listed on a job keeps that row neutral (50) rather than punishing.
- Minified into `dist/js/profileMatch.js` alongside the other bundles.

## [0.8.26] · 2026-09-27 — Front-end performance pass (final cache `?v=20260924z`)

- **All site JavaScript is now minified at build time** into `dist/js/` via
  esbuild (`js/app.js` 201KB → 137KB, `js/store.js` 51KB → 26KB,
  `js/audioEngine.js` 23KB → 12KB, plus googleAuth/profileChecklist/config).
  Less to download AND less to parse — the biggest win on low-end/mobile.
- **Preloaded** the two boot-critical scripts (`vendor/supabase.min.js` and
  `/dist/js/app.js`) in the `<head>` so they start downloading in parallel
  with the HTML instead of only after it parses.
- **Confirmed** asset caching was already healthy (versioned JS/CSS get
  `Cache-Control: public, max-age=14400`, only HTML/os is `no-cache`).
- `build:js` is wired into `npm run build`, so `deploy.ps1` ships minified
  JS from now on. Source stays in `js/` for readability + tests.
- **Regression caught & fixed during this deploy:** the first minified build
  used esbuild `--keep-names`, which produced `SyntaxError: Identifier 'A'
  has already been declared` at runtime (blank page). Dropped `--keep-names`,
  and added a parse-guard to `deploy.ps1` (`node --check` on every
  `dist/js/*.js` before upload) so a broken bundle can never ship again.
  Cache bumped `y` → `z` so browsers that cached the bad `app.js` pick up
  the fix immediately.

## [0.8.25] · 2026-09-27 — Nudge cadence relaxed to 3 weeks (worker only)

- `worker_setup/nudge-emails-worker/worker.js` — the per-candidate cooldown
  between emails (`NUDGE_COOLDOWN_DAYS`) went from 7 to 21 days, so nobody is
  emailed more than once every ~3 weeks.

## [0.8.23] · 2026-09-27 — Candidate subdomains serve the profile again (infra fix)

- **Cloudflare Worker** (`workers/candidate-hosts`, reusing the long-standing
  `swapiki-subdomain-proxy`) — candidate links like `https://khushi12.swapiki.com`
  landed on a 301 that bounced visitors to `https://swapiki.com/` (the app
  dashboard), so a recruiter opening a shared profile link saw the wrong page.
  Root cause: the Worker forwards `*.swapiki.com` through the zone, but it was
  fetching `swapiki.pages.dev`, and Cloudflare Pages 301-redirects its own
  `pages.dev` domain to the attached custom domain (`swapiki.com`). The Worker
  now fetches the custom domain itself (served with a 200), which keeps the
  candidate subdomain in the visitor's address bar so the app's hostname-based
  Router renders the right candidate profile. Worker subrequests to
  `swapiki.com` don't re-enter the `*.swapiki.com/*` route, so there's no loop.
  The apex is untouched (the route pattern only matches subdomains).

- **store.js** — `loadProfileForUser` fetched the candidate by `user_id` with
  `.maybeSingle()`, which *throws* when two rows share the same `user_id`
  (that has happened). The catch turned that into a blank-template fallback, so
  a returning user could see a 0%-complete profile even though their full row —
  name, title, location, links, projects — was safe in the DB. The lookup now
  orders the row by `updated_at` desc and takes `limit(1)`, so the most recent
  (richest) row for that account always wins and the silent zero is gone.

- **app.js** — `openJobApplyModal` copied `https://swapiki.com/#sites/<handle>`.
  Now copies the cleaner shared link `https://<handle>.swapiki.com` (the subdomain
  route the site already supports).

## [0.8.20] · 2026-09-27 — Hide the 404 card once a profile actually loads (cache `?v=20260924u`)

- **app.js** — `clearNotFoundPanel()` hid the "Profile not found" panel but then
  un-hid every child of `#view-candidate > main` — including the panel itself.
  Result: any successful profile render showed the 404 card floating above the
  real profile. The panel is now skipped in the re-show loop.

## [0.8.19] · 2026-09-27 — Fix public profile queries (cache `?v=20260924t`)

- **store.js** — `getProfileByUsername` sorted by `created_at`, but `candidates`
  has no such column (`updated_at` only), so every PostgREST call failed and ALL
  public `/sites/<handle>` links reported "not found" regardless of RLS. Sorts by
  `updated_at` instead.

## [0.8.18] · 2026-09-27 — Public links no longer 404 on duplicate usernames (cache `?v=20260924s`)

- **store.js** — `getProfileByUsername` now orders by `created_at desc` and caps the
  query at 1 row before `maybeSingle()`. A stray duplicate username used to trip
  PostgREST's "multiple rows returned" error, which the function swallowed and
  returned as "Profile not found" — exactly how `#sites/<handle>` links can 404
  even when the profile exists and shows in the share-preview modal.

## [0.8.17] · 2026-09-27 — Fix admin "rows.map is not a function" (cache `?v=20260924r`)

- **app.js** — `renderAdminJobsSection` joined each status list's rows into a plain
  string, but the shared `table()` helper called `rows.map(...)` on it for the
  mobile cards — so the admin dashboard threw `rows.map is not a function` and
  showed "Could not load admin data" whenever ANY draft or published job existed.
  Rows are now kept as arrays and joined only when rendered.

## [0.8.16] · 2026-09-27 — Google Sign-In shows on swapiki.com (cache `?v=20260924q`)

- **app.js** — Google's button + PostHog were gated on `SITE_ENV=prod`, which the
  Pages project never set (config falls back to `"unknown"`), so the Google button
  silently never rendered in production. Now they load whenever the host IS the
  production domain (`swapiki.com` / `www` / candidate subdomains); `SITE_ENV` is
  just a bonus override.

## [0.8.15] · 2026-09-27 — Nudge emails now carry a "Top picks" jobs/internships card

- **`worker_setup/nudge-emails-worker/worker.js`** — every profile nudge email
  sent via ZeptoMail now includes a **"Top picks this week"** card: the top 3-4
  current **jobs and internships** (2 + 2, back-filled from either side), ranked by
  real candidate clicks in the last 7 days (job_clicks from the digest migration),
  then **re-ranked per user against their own skills** (`expertise`). Rows show
  title, JOB/INTERNSHIP badge, company · location · work-mode, and stipend/salary;
  each links to the live listing. Card renders before the CTA; ranking degrades
  gracefully (newest-first) if click data is missing.
- **`email-templates/*.html`** — added a `{{top_picks}}` placeholder so the
  reference templates match what the worker actually sends.
- Requires `supabase/email_digest_migration.sql` (creates `job_clicks`) to be run.

## [0.8.14] · 2026-09-26 — Weekly email digest with a Top Jobs/Internships card (cache `?v=20260924p`)

- **The idea:** every member gets a weekly email whose **top card** is "Top jobs &
  internships this week" — ranked by which listings candidates actually clicked,
  then re-ranked per user against their own skills (personalized greeting too).
- **`functions/api/cron-send-digest.js`** — secure POST endpoint (verified
  `x-cron-secret`): loads users + published jobs + last-7-days clicks via the
  service role, builds an inline-styled HTML digest, sends through **Resend**,
  logs every delivery to `digest_sends`. Weekly run belongs to a `pg_cron` job.
- **`supabase/email_digest_migration.sql`** — `job_clicks` (one per user/job/day,
  RLS: owner only) + `digest_sends` (admin RLS) + the pg_cron schedule snippet.
- **app.js / store.js** — every "Apply on the job site" tap records a click (fire
  and forget); this is what ranks the card.
- **`EMAIL_DIGEST_SETUP.md`** — Resend key + Pages secrets + cron URL steps.

## [0.8.13] · 2026-09-26 — Jobs board: search + smarter cards (cache `?v=20260924o`)

- **app.js** — keyword search bar on the board (live, matches role/company/skills/
  city/description; results re-render without losing focus).
- **app.js** — job cards now carry badges at a glance: **Job/Internship** and
  **Remote-WFH/Hybrid/Onsite**, plus an **"Apply by {date}"** amber chip (parsed from
  the listing's raw text).
- **`supabase/jobs_board_migration.sql`** — `get_published_jobs()` now also returns
  `raw_text` so the apply-by chip can render. **Re-run this file in the SQL editor**
  (idempotent `create or replace function`).

## [0.8.12] · 2026-09-26 — Jobs board: Internship/Job & WFH/Onsite filters (cache `?v=20260924n`)

- **app.js** — two extra filter rows on the board below the category tabs:
  - **Type:** Jobs | Internships (derived from the listing's salary/title — Internshala
    internships are marked `(internship)`; full-time roles are jobs).
  - **Work mode:** Remote / WFH | Hybrid | Onsite (derived from location + description).
    Filters combine with the category tabs; count updates live; Reset chips appear when
    a filter is active; empty state now says "No jobs match those filters".

## [0.8.11] · 2026-09-26 — Other Roles tab + marketing/design/sales/support seed (cache `?v=20260924m`)

- **app.js** — the board's third tab is now **"Other Roles"** (was "Ops & Talent"):
  it holds everything outside IT/BFSI — ops, talent, BD, marketing, content, design,
  sales and customer support. Canonical/SEO copy updated to "IT, BFSI & Other Jobs in
  India".
- **`functions/jobs.js`** — `/jobs` title/description/OG/JSON-LD updated to match.
- **`supabase/seed_more_jobs_other.sql`** — 9 more verified openings (4 full-time jobs
  + 5 paid internships) from Internshala across Jaipur, Gurgaon, Noida, Mumbai and
  remote: content/e-commerce trainee, digital marketing executive, customer-support &
  marketing manager (WFH), sales trainee, plus content-creator and social-media
  marketing internships (Design/Canva/Video-editing skills). Idempotent by `title + company`.

## [0.8.10] · 2026-09-26 — All-India job/internship seed fills IT & BFSI tabs

- **`supabase/seed_more_jobs_allindia.sql`** — 17 more verified openings (jobs **and**
  internships) from Internshala detail pages spanning Bengaluru, Delhi, Noida, Chennai,
  Gurgaon, Ahmedabad, Mumbai/Pune and remote (WFH). Now fills every board tab:
  **IT** (web/AI/ML/SDE, hybrid + WFH), **BFSI** (business analysts, COD finance,
  commercial-lending, stock analysis, valuation/equity-research internships) and
  **Ops & Talent** (BD, PR). Idempotent by `title + company`.

## [0.8.9] · 2026-09-26 — Apply modal actually applies; more real job links (cache `?v=20260924l`)

- **app.js** — the apply modal now has a primary **"Apply on the job site"** button
  (opens the job's own application page in a new tab) whenever the listing has a
  direct URL. **"Copy My Proof Link"** stays as the secondary, differentiation
  step (share your profile with the contact too). Modal copy explains the flow.
- **`supabase/seed_more_jobs.sql`** — 4 verified active paid internships (Think41,
  SIRPI, Indus AI, Codeatrix) with direct Internshala application pages, plus 2
  fresh Naukri listings (CGI, Infosys; flagged to verify/delete if they expire —
  Naukri bot-blocks automated checks). Idempotent by `title + company`.

## [0.8.8] · 2026-09-26 — Real jobs seeded with direct apply links (cache `?v=20260924k`)

- **`supabase/seed_real_jobs.sql`** — 12 real Bengaluru openings (Talent, People,
  Payroll, Trust & Safety, Product Ops) curated from Bengaluru Brief #32, each with
  a direct ATS apply link stored in `contact` (rendered as a clickable "Contact on
  the post" link in the apply modal). Idempotent by `title + company`. The two
  fictional sample jobs from `seed_sample_jobs.sql` are moved to **draft**.
- **app.js** — new **"Ops & Talent"** tab on the jobs board filters `category = any`;
  jobs view meta/SEO title broadened to "IT, BFSI & Ops Jobs in India"; empty-state
  label fixed for the new tab.
- **`functions/jobs.js`** — `/jobs` title/description/OG/JSON-LD updated to
  "IT, BFSI & Ops Jobs in India".

## [0.8.7] · 2026-09-26 — Jobs page SEO (crawlable `/jobs`, structured data) (cache `?v=20260924i`)

Hash-routed SPAs look like one page to crawlers, so `/jobs` is now a real URL:

- **`functions/jobs.js`** — server-rendered `/jobs` HTML page: jobs-page title /
  description / canonical / OpenGraph, up to 20 latest **published** jobs rendered
  server-side, and JSON-LD `JobPosting` structured data. The interactive
  80%-gated board stays at `/#jobs`. Requires `SUPABASE_SERVICE_ROLE_KEY` on the
  Pages project to list rows (RLS is admin-only); without it the page still
  renders with an empty listing.
- **app.js** — the router now treats `/jobs` as the Jobs view (URL untouched);
  `renderJobsView()` meta upgraded ("IT & BFSI Jobs in India", canonical
  `https://swapiki.com/jobs`) and injects runtime JSON-LD `JobPosting` for
  qualified viewers.
- **sitemap.xml** — `/jobs` added (daily); robots.txt already points at the sitemap.

**Optional:** to get live listings in the /jobs page, set `SUPABASE_SERVICE_ROLE_KEY` on
the Cloudflare Pages project (test and prod).

Tests: 24/24 passing.

---

## [0.8.6] · 2026-09-26 — Email verification as OTP (cache `?v=20260924h`)

When email confirmation is required, signup now opens an **OTP modal** — instead of
only telling users to check their inbox, they type the 6-digit code inline.

- `store.js` — `verifyEmailOtp(email, token)` (confirms + session in one call) and
  `resendEmailOtp(email)` (fresh code).
- `app.js` — signup flow now calls `openOtpModal()` with the pending signup
  stashed; `handleOtpSubmit()` verifies then loads the profile and routes to the
  dashboard; `resendOtp()` stays client-friendly (disable + "Sent!" feedback).
- `index.html` — `#modal-otp` (numeric keypad-friendly input,
  `autocomplete="one-time-code"`, resend link).

**Supabase setup required:** Auth → Sign In / Providers → Email → **Confirm email** ON,
and in **Email Templates → Confirm signup** add `{{ .Token }}` so the confirmation
email prints the 6-digit code. (Email OTPs are on by default in Supabase — there is
no separate OTP toggle.)

Tests: 24/24 passing.

---

## [0.8.5] · 2026-09-25 — Recruiter features removed (cache `?v=20260924g`)

**Removed** the entire recruiter surface — the era of recruiters browsing candidates is over for now; Swapiki is candidate-first with the Jobs board as the matchmaking channel:

- **Recruit directory** view, its nav links, and the `search_candidates()` RPC usage.
- Candidate-profile **Recruiter Workspace** panel (save / shortlist / interview / pass / notes).
- **Recruiter signup + verification** flow, trust badges, and admin recruiter-management section.
- `functions/api/recruiter.js` (server endpoint) removed from the deployment.
- Footer copy reworded to remove recruiter references.

**Kept:** candidates, public proof profiles, voice verification, the jobs board (candidates apply via their proof link), and all admin tools.

**Note:** `public.recruiters` and related migrations still exist in the database (harmless, unused). Drop them later with a small SQL script if truly wanted.

Tests: 24/24 passing.

---

**Jobs board (new, gated):**
- **Jobs** nav item (desktop + mobile) → `#view-jobs`.
- The board is for **logged-in candidates with an 80%-complete, proof-backed
  profile** (server-enforced). Guests and under-80% users see a friendly unlock
  screen with a progress bar instead of job data.
- Cards show title, company, location, salary, top 5 skills, description, and an
  **Apply with my profile** button → modal with the contact on the post + a
  **Copy My Proof Link** (`#sites/<username>` share link). IT / BFSI / All filter tabs.
- New `jobs` table (raw_text, title, company, location, category, salary, contact,
  source, skills, status draft|published) + **admin-only RLS** and a
  `get_published_jobs()` RPC that returns whitelisted fields only to qualified
  callers — the 80% gate can't be bypassed by reading the table directly.
- **Admin "Jobs Board"** section: paste-a-WhatsApp-forward form (lands as draft),
  approval queue (publish / unpublish / delete), original-post inspector.
- No AI yet — raw text is stored for a later LLM parse adapter; fields are entered
  manually in v1.
- **Migrate:** run `supabase/jobs_board_migration.sql`.

**Dummy Indian profiles (test data, tagged):**
- New `is_dummy` tag on `candidates` (default `false`), hidden from the UI.
- `supabase/seed_dummy_profiles.sql` — 56 published profiles (34 IT, 22 BFSI,
  Indian names/cities/skills, voice-unverified, no emails/phones/links).
  Mass-delete later with `delete from candidates where is_dummy = true;`.
- `scripts/generate-dummy-avatars.js` + 56 flat-style SVG avatars in
  `photos/dummy/`; `supabase/set_dummy_avatars.sql` backfills `avatar` links.

Tests: 24/24 passing.

---

## [0.8.3] · 2026-09-24 — Recruit is simpler and more private (cache `?v=20260924d`)

**Simpler for recruiters:**
- One **Recruit** button in the top bar.
- One page: browse candidate cards, search, click one, then decide.
- On a profile: **Shortlist ⭐ · Interview 🎯 · Pass ✕** + private note.

**More private:**
- The candidate directory is **for verified recruiters only**. Guests, candidates, and
  unapproved recruiters see a lock screen.
- Shared profile links (`username.swapiki.com`) stay public for anyone you send them to.

**Also in this build:**
- **Interview** is now its own decision (alongside Shortlist and Pass).
- Search + **All / Shortlist / Interview / Passed** filters in the directory.
- Server-side lock: `search_candidates()` RPC — applied to the test database.
  Must also be run on prod before launch.

Tests: 24/24 passing.

---

## [0.8.2] · 2026-09-24 — Recruiter toolbox on candidate profiles (zero-friction, no signup gate)

**Design change** — recruiters are never asked to log in or register to act on a profile.
A hiring manager's first experience is: read the proof → reach out (contact links already
in the hero) → optionally *save the profile* to compare later. Saving is a one-tap local
bookmark that works for **guests and signed-in candidates alike** — it's like bookmarking
a page, so nothing feels like a bait-and-switch.

**Added**
- **"Recruiter toolbox" panel** on every candidate profile (`#recruiter-workspace-container`,
  rendered by `renderRecruiterWorkspace()`):
  - **Save profile to compare later** — works for everyone, no account required. Stored in
    localStorage (`swapiki_saved_profiles`); the button toggles saved/remove inline.
  - **"My saved (N)"** — opens the new `#modal-saved-profiles` list of this device's saved
    profiles with quick links and per-item remove.
  - Small one-line CTA: guests see "Sign in to unlock shortlist & notes" and signed-in
    non-recruiters see "Register as a recruiter" — always an *optional unlock link*, never
    a blocking card. It never interrupts reading or saving.
- Registered recruiters still get the advanced **Recruiter Workspace** (Shortlist / Pass /
  private notes) as an in-place upgrade.

**Fixed**
- **Recruiter actions no longer tag the recruiter's own profile.** `updateCandidateStatus`,
  `openRecruiterNoteModal`, `saveRecruiterNote` previously read `swapikiStore.getProfile()`
  (the viewer's own row), so shortlisting a candidate wrote the note about *themselves*.
  `renderRecruiterView()` now stores `this.viewedCandidateProfile` and a shared
  `getActionTargetCandidateId()` resolves every action against the candidate whose page is open.
- `recruiter-pipeline-container` (a render target that existed only in JS, never in HTML)
  removed; the workspace now renders into the real container.
- `renderPipelineStatusBanner()` — the "Shortlisted / Passed / Notes attached" banner is now
  its own method so actions can refresh it in place.

---

## [0.8.1] · 2026-09-23 — Landing credibility & public-link polish (pre-Reddit)

**Changed**
- **Landing hero avatars** — replaced the three generic AI-generated stock
  photos with four clean gradient initial "badges" (`HR`, `PM`, `TL`, `TA`).
  Honest > pretty: no promise that those are real people behind the "30+
  Hiring Managers" counter.

**Added**
- **Proper 404 state** — visiting a dead link (`wrong-handle.swapiki.com` or a
  stale `#sites/handle`) now keeps the URL and shows a clean "Profile not
  found" card instead of silently redirecting to the landing page. Includes
  the attempted handle, "Go to Swapiki Home" / "Try again", and a "Looking
  for your own profile? Sign in" escape hatch. The candidate section is
  restored automatically when a valid profile then renders.
- **Per-page SEO + social meta** — `setPageMeta()` updates the browser tab
  title, description, and `og:title`/`og:description`/`og:url` at runtime:
  - Landing → Swapiki's product story.
  - Candidate profile → `<Name> — <Title> | Swapiki` plus a share-focused
    description and the correct `<username>.swapiki.com` canonical URL.
  - Dashboard → personal dashboard copy.
  - Not-found → explicit "Profile not found" copy.
  Static `og:image`/`og:site_name` (https://swapiki.com/assets/og-image.png)
  remain in `<head>` for scrapers that don't execute JS.

---

## [0.8.0] · 2026-09-22 — Trust & Anti-Fraud layer (visible proof, not vibes)

**Added**
- **Public trust badges** on every candidate profile: the existing "Voice
  Verified" badge plus a new **"Reviewed by Swapiki team"** badge. Both only
  ever light up from a *real* check — live voice-identity pass, or a human
  admin clicking "Mark reviewed". No badge can be faked or auto-awarded.
- **How Swapiki Fights Fraud** explainer modal — honest, plain-language rundown
  of the actual protections (random challenge-phrase voice check, live-mic
  gate, human moderation, recruiter domain verification, spam shields).
  Opens from a new navy Trust Band on the landing page and the footer.
- **Admin review workflow:** "Mark reviewed / remove review" toggle buttons in
  the candidates table (desktop) and mobile cards + a review status pill
  (Reviewed by Swapiki team / Unreviewed). Toggle calls
  `store.adminSetStaffReview()` which sets/clears `candidates.staff_reviewed_at`
  — an admin-only column that nothing automatic can touch.
- **Security headers:** `_headers` now ships `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera/microphone=self`, `X-XSS-Protection`.
- **Migration:** `supabase/staff_review_migration.sql` (additive —
  `staff_reviewed_at timestamptz null`).

**Why:** trust was invisible. The site was already anti-fraud-hardened but
nothing *showed* it to candidates or recruiters. This layer makes every check
visible and provable while keeping the "no-AI, all-human" promise true.

---

## [0.7.4] · 2026-09-22 — Native hash routing + reliable checklist click-through

**Changed**
- `Router.init()` now listens to `hashchange` and re-runs `handleHash()`, so
  plain `<a href="#view">` links, the browser back/forward buttons and manual
  hash edits all route correctly — navigation no longer depends solely on
  imperative `router.navigate()` calls from JS handlers.
- `handleHash()` skips re-rendering when the hash already matches
  `currentView` (avoids double render after an imperative navigate).
- Checklist "add project" rows render as real `<a href="#add-project">` links;
  the delegated row-handler ignores native anchor clicks so they never
  double-fire. Done rows remain clickable (add another project / re-record).
- `checklistAction()` gets a timing beacon (`_reportChecklistPerf`) that toasts
  when an action takes >200ms, to separate JS-time from device paint-time.

**Why:** the checklist's "add project" action silently did nothing because the
SPA router had no hash-link path — clicking needed JS to reach the row AND the
router object, and any breakage in that chain meant "nothing happens".

---

## [0.7.3] · 2026-09-22 — Leaner boot on test; kill lingering "laggy" feels

**Changed**
- Removed `scroll-smooth` from `<html>` — router already scrolls with
  `behavior:'instant'`, and CSS smooth-scroll could animate every view switch
  on weak hardware, reading as lag.
- PostHog now initializes **only on production**: `store.applyConfig()` captures
  `siteEnv`, and `app.init()` calls `window.SWAPIKI_initPosthog()` (idle-time)
  only when `siteEnv === 'prod'`. On the test site PostHog stays a stub — zero
  analytics fetch, plus test traffic no longer pollutes real usage stats.
- Google Identity Services script is now loaded **dynamically, production-only**
  (`ensureGoogleScript()`). On `*.pages.dev` googleAuth.js already draws a
  plain "Continue with Google on swapiki.com" redirect button that needs no
  script, so the test env drops that third-party fetch entirely.

**Why:** the test environment should be as light as any visitor's; analytics
and OAuth scripts cost parse/network time and belong to production only.

---

## [0.7.2] · 2026-09-22 — Guided profile-completion checklist

**Added**
- `js/profileChecklist.js` — pure `buildProfileChecklist(profile)` logic: 7
  concrete to-dos (name & title, location, LinkedIn/portfolio link, first
  project, voice walkthrough, second project, publish). DOM-free and
  unit-tested (6 new tests).
- `app.js` — `renderProfileChecklist()` drives a new "Profile readiness" card
  on the dashboard with a progress bar + one "Fix it" action per pending item,
  and keeps the existing telemetry "Profile Completeness" bar on the **same**
  percentage (previously the dashboard showed a diverging ad-hoc score).
  `checklistAction(key)` jumps to the edit-profile modal, the add-project
  view, the audio studio for the first project, or the publish button.
- `index.html` — "Profile readiness" card (progress bar + checklist rows)
  between the engagement-stats row and the Completion & Stats bento.

**Why:** a bare percentage bar changes nothing; explicit, actionable steps with
one-tap targets are a well-known completion-rate lever. More complete profiles
mean more voice/evidence for recruiters to review later.

---

## [0.7.1] · 2026-09-22 — Performance pass (fixes slow/laggy load)

**Changed**
- `store.js` `applyConfig()` — boot no longer hangs behind the `/config` network
  call. First fetch per tab is cached in `sessionStorage`, and the fetch itself
  now aborts after a 1.2s timeout so the UI always paints instead of waiting on
  an edge-function cold start or slow connection.
- `index.html` — Supabase SDK is now **self-hosted** (`vendor/supabase.min.js`,
  official `@supabase/supabase-js@2` UMD build) so every page load hits our own
  Cloudflare origin instead of the jsdelivr CDN.
- `index.html` — Google Fonts + Material Symbols load asynchronously
  (`media="print"` swap trick with `<noscript>` fallback) — first paint no
  longer waits on render-blocking font stylesheets.
- `index.html` — PostHog init now sets `heatmaps: false` and
  `capture_performance: false` (they add DOM observation + extra tasks on every
  page); the admin "avg. time spent" stat only needs pageviews, which stay on.

**Why:** perceived slowness on load = a serial bootstrap fetch + two third-party
CDNs + render-blocking fonts. The Supabase DB is already US-East from a slow
Indian connection; every removed round trip / third-party hop matters.

---

## [0.7.0] · 2026-09-22 — Test-before-production environment

**Added**
- `functions/config.js` — `GET /config` endpoint serving `supabaseUrl` /
  `supabaseAnonKey` / `siteEnv` from each Pages project's environment variables,
  falling back to the production defaults when unset.
- `store.js` `applyConfig()` — fetches `/config` at bootstrap and re-creates the
  Supabase client when the overrides differ from defaults (no-op elsewhere).
- `app.js` — `init()` awaits `applyConfig()` before any of the backend is read.
- `functions/api/admin-promote.js` + `admin-time-stats.js` — read `SUPABASE_URL`
  from `env` (fallback to the hardcoded production URL).
- `deploy.ps1` — `-Environment test|prod`; builds CSS then deploys to
  `swapiki-test` (preview) or `swapiki` (main). Promotes the identical build.
- `TEST_ENV_SETUP.md` — full manual setup + daily loop documentation.

**Why:** the previous build hardcoded the production Supabase URL/key in
`store.js`, so any second site would have hit the **production database**. Now
one codebase can serve multiple deployments via per-project variables.

**Current setup decision — single Supabase (pilot):** the test Pages project
leaves `SUPABASE_URL`/`SUPABASE_ANON_KEY` unset so it falls back to the shared
production database (usage is ~27 MB / 500 MB; a second DB was overkill). Test
users register under `test-*` names. The `/config` mechanism stays so true
database isolation can be switched on later with zero code changes — full
details in `TEST_ENV_SETUP.md`.

**Manual steps (documented in `TEST_ENV_SETUP.md`):** create the
`swapiki-test` Pages project with `SITE_ENV=test` (no Supabase overrides), add
`SITE_ENV=prod` to the live Pages project, `wrangler login`, then the loop is
`.\deploy.ps1 -Environment test` → verify → `.\deploy.ps1 -Environment prod`.

---

## [0.6.3] · 2026-09-22 — Share modal cleanup

**Removed**
- "Copy LinkedIn post" and "Copy WhatsApp message" buttons from the Share modal.
- Dead handlers: `copyShareText()` (both social copy paths) and the second WhatsApp
  share path. `buildShareText()` reduced to the email body builder it now only serves.

**Kept / simplified**
- Share modal now shows exactly one WhatsApp option (`shareViaWhatsApp()`),
  plus **Share via Email** and **Copy Link**.
- WhatsApp message uses the voice-verification status line (verified vs. working
  on badge) pulled from the share subject.

**Affected:** `index.html`, `js/app.js`

---

## [0.6.2] · 2026-09-22 — Recruiter verification v1 (two-way trust)

**Added:**
- `supabase/recruiter_verification_migration.sql`:
  - New columns on `public.recruiters`: `work_email`, `verification_domain`,
    `verification_status` (`unverified | pending | verified | rejected`), `verified_at`.
  - New RLS policy "Admins can update any recruiter" so admins can approve/revoke.
- `store.js`:
  - `submitRecruiterVerification(workEmail)` — validates email, blocks ~30 free /
    personal email domains (`PUBLIC_EMAIL_DOMAINS`), sets status `pending`.
  - `adminSetRecruiterVerification(userId, status)` — admin approve/reject/revoke,
    stamps `verified_at` on approval.
  - Recruiter profile load, `adminListRecruiters`, and pipeline-interest queries now
    select the verification columns.
- `app.js`:
  - Optionally "Company Email" captured during recruiter signup
    (`handleRecruiterSignup`) → badge requested flow on success.
  - `recruiterBadgeHtml()` trust chip (Verified / pending / rejected / not verified).
  - `adminSetRecruiterVerification()` UI handler.
  - Admin recruiter table + mobile cards: verification badge, work email, and
    Approve / Reject / Revoke actions.
  - Candidate dashboard Recruiter Activity list shows a green "Verified" chip next
    to verified recruiters.
- `index.html`: optional company-email field in the recruiter signup modal.

**Migrate:** run `supabase/recruiter_verification_migration.sql`.

---

## [0.6.1] · 2026-09-22 — Signup spam protection

**Added:**
- `functions/api/signup-guard.js` (Cloudflare Pages Function, `POST /api/signup-guard`):
  server-side enforcement of (1) honeypot rejection, (2) disposable email blocklist
  (~60 domains), (3) per-IP rate limit (6 attempts / 10 min, in-memory sliding window).
- `js/app.js`: `DISPOSABLE_EMAIL_DOMAINS` + `isDisposableEmail()` client fast-check;
  `handleSignup` runs the guard before Supabase signup (fail-open on worker error).
- `index.html`: hidden honeypot field (`#signup-honey-email`) inside the signup form.

**Notes:** the disposable list is mirrored between the client and the worker — keep
in sync. Deploy requires the new `functions/` directory to be published.

---

## [0.6.0] · 2026-09-22 — Feedback loop (complain → backlog)

**Added:**
- `supabase/feedback_migration.sql`: `feedback` table + RLS (anyone inserts; only
  admins select/delete via the `public.admins` existence check).
- `store.js`: `submitFeedback()` (local-first to `swapiki_feedback`, isolated cloud
  insert) and `adminListFeedback()` (latest 200).
- `index.html`: floating "Feedback" pill (bottom-right) + `#modal-feedback`
  (category select: broken / confusing / missing / idea / general).
- `app.js`: `open/close/submitFeedback`, `feedbackCategoryColor()`, `escapeHtml()`,
  and an admin Feedback section (desktop table + mobile cards) feeding from the
  cloud queue. Fixed invalid `max-w-xxs` → `max-w-[12rem]`.
- Rebuilt `dist/output.css`.

**Migrate:** run `supabase/feedback_migration.sql`.

---

## [0.5.1] · 2026-09-20 — Performance

- Trimmed Material Symbols font request to the single optical axis actually used
  (`opsz,wght,FILL@24,400,0`).
- Removed all `backdrop-blur` overlays/menus (17 occurrences in `index.html`) for
  cheaper paint on mid-range devices.
- Instant scroll (`behavior: 'instant'`) on route change instead of smooth scroll.
- Removed dead `POST /api/candidate` fetch in `store.js` `syncWithApi()`.
- PostHog: `autocapture: false` + lazy init via `requestIdleCallback`.
- Rebuilt `dist/output.css`; bumped asset cache-busters to `?v=20260920a`.

---

## [0.5.0] · 2026-09-19 — Voice verification (anti-fraud core)

**Added:**
- `js/audioEngine.js` — DSP: challenge-phrase + spoken 4-character code capture
  (defeats replay and TTS/voice-cloning), live-mic liveness flag (only real
  `getUserMedia` counts), MFCC voiceprint extraction and similarity match
  (enroll-first, verify-later, threshold ≥ 0.80).
- `store.js` — `recordVoiceVerification()` / `markProjectVoiceCheck()` with an
  isolated cloud-write pattern (missing migration degrades to a console warning,
  never breaks the app).
- `app.js` — record-verify pipeline, Voice-Verified UI (dashboard badge + admin
  verification chip), `liveMic` gating so demo/synthetic audio can't earn the badge.
- `supabase/voice_verification_migration.sql` — voice fields + RLS.
- `tests/voice-verification.test.js` — engine + store tests (18 passing).

**Known constraints:** cloud badge sync needs the migration; verification runs
entirely client-side; no AI is used to score, rank, or auto-reject candidates.

**Setup docs:** `AUTH_SETUP.md`, `STATS_SETUP.md`, `DESIGN.md`, `llms.txt`.