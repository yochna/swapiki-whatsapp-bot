# Swapiki sketchnote video — complete production kit (v3)

Everything needed to act on the review, plus a literal step-by-step runbook.

> Review from sir:
> "Perfect..But the video seems very scripted. Which ai are you using for this
> video generation? Also, use eleven labs for the more natural sounding indian
> voice.. For the video process, try to brainstorm on how could the presentation
> or flow be changed? That's it you want to process it further. I think even this
> is a good video.. but you can refine further, if you want to dive deeper."

## Table of contents
1. [TL;DR — do these 10 steps](#1-tldr--do-these-10-steps)
2. [What you need (accounts, tools, files)](#2-what-you-need)
3. [Tool stack — "which AI?"](#3-tool-stack--which-ai)
4. [Voiceover (free, Microsoft Edge neural TTS)](#4-voiceover-free-microsoft-edge-neural-tts)
5. [Why it felt scripted + flow brainstorm](#5-why-it-felt-scripted--flow-brainstorm)
6. [Design guardrails (keep these true)](#6-design-guardrails-keep-these-true)
7. [Script A — story-led (recommended) + storyboard](#7-script-a--story-led-recommended)
8. [Script B — split-screen contrast](#8-script-b--split-screen-contrast)
9. [Script C — founder / anti-pitch](#9-script-c--founder--anti-pitch)
10. [15-second Reels cut](#10-15-second-reels-cut)
11. [THE STEP-BY-STEP RUNBOOK (click level)](#11-the-step-by-step-runbook-click-level)
12. [Editing timeline / shot list](#12-editing-timeline--shot-list)
13. [Export specs](#13-export-specs)
14. [Troubleshooting + common mistakes](#14-troubleshooting--common-mistakes)
15. [Final checklist](#15-final-checklist)

---

## 1. TL;DR — do these 10 steps

1. The **free Indian voiceover is already generated** for you (Microsoft Edge
   neural voices — no ElevenLabs, no cost). Files are in your `vo` folder.
2. Listen to `voiceover-neerja.mp3` (female) and `voiceover-prabhat.mp3` (male).
3. Keep the one you like as `voiceover.mp3` (already set to Neerja). That single
   `voiceover.mp3` is the spine of the video and runs ~51 seconds.
4. (Optional) Regenerate/modify the voice with `video/vo-lines/voiceover-full.txt`
   using the free script noted in [section 4](#4-voiceover-free-microsoft-edge-neural-tts).
5. Generate the **strokes** in **strokevideo.com** with the prompt in [section 7](#paste-ready-strokevideo-prompt) (Marker style, 16:9).
6. Open a free editor (**CapCut** / **Clipchamp**), put the strokes on video, the VO on audio.
7. Trim/retime the strokes so each sketch lands on its VO line; add **minimal** on-screen text.
8. Add a soft music bed, **duck** it under the voice, and leave the **two silences** empty.
9. Export **16:9 1080p** (`swapiki-sketchnote-60s.mp4`) and a **9:16** Reels cut (`swapiki-reels-15s.mp4`).
10. Check every claim against [section 6](#6-design-guardrails-keep-these-true), then send for review.

---

## 2. What you need

| Need | Detail | Cost |
| --- | --- | --- |
| Browser | Any (Chrome/Edge) | free |
| Voiceover | **Already generated** — Microsoft Edge Indian neural voices (`en-IN-NeerjaNeural`, `en-IN-PrabhatNeural`) | free |
| strokevideo account | strokevideo.com — 1 video/day, <=2 min, no watermark | free |
| Video editor | **CapCut desktop** (free) or **Clipchamp** (built into Windows) or DaVinci Resolve | free |
| Music | a royalty-free bed (YouTube Audio Library, Pixabay) | free |
| This folder | `video/` — VO line files + scripts | — |

**Folders to create on your PC:**
```
Swapiki-Video\
  vo\        (voiceover-neerja.mp3, voiceover-prabhat.mp3, voiceover.mp3)
  strokes\   (downloaded strokevideo mp4)
  export\    (final renders)
```

No local `SUPABASE_*` keys or repo secrets are needed for the video — it is a
content task, completely separate from the app code.

---

## 3. Tool stack — "which AI?"

| Job | Tool | Notes |
| --- | --- | --- |
| Sketchnote visuals | **strokevideo.com** | Already used and approved. Free: 1/day, <=2 min, no watermark. Style **Marker** or **Sharpie**. |
| Voiceover | **Microsoft Edge neural TTS** (free) | Indian English voices `en-IN-NeerjaNeural` (female) + `en-IN-PrabhatNeural` (male). Already generated for you. |
| ~~ElevenLabs~~ | not used | Its free plan **blocks Indian library voices via the API** (needs a paid plan), so we did not use it. |
| ~~InVideo AI~~ | do not use | Needs paid credits; abandoned. |
| Editor | CapCut / Clipchamp / Resolve | Any. CapCut is easiest for captions. |

Pipeline: **write script -> free Edge voiceover (already done) -> strokevideo
strokes -> stitch voiceover over strokes -> export**.

---

## 4. Voiceover (free, Microsoft Edge neural TTS)

The voiceover is **already generated** into your `vo` folder:

| File | Voice | Accent | Length |
| --- | --- | --- | --- |
| `voiceover-neerja.mp3` | `en-IN-NeerjaNeural` | female, Indian English | ~51 s |
| `voiceover-prabhat.mp3` | `en-IN-PrabhatNeural` | male, Indian English | ~51 s |
| `voiceover.mp3` | copy of Neerja | (the chosen one) | ~51 s |

These are the same natural neural voices that power **Microsoft Edge "Read
Aloud"** — free, and they genuinely sound like a person, which is what fixes the
"scripted" feedback. ElevenLabs was **not** used because its free plan blocks
Indian library voices through the API.

### How it was generated (so you can redo it)
- Script source: `video/vo-lines/voiceover-full.txt` (paragraphs become natural
  pauses via commas, full stops, and `…`).
- A small Node script opens a WebSocket to Microsoft's Edge Read Aloud service
  and streams back an MP3 (`audio-24khz-48kbitrate-mono-mp3`), rate `-3%`.
- Switch voice by changing `en-IN-NeerjaNeural` to `en-IN-PrabhatNeural`.

### If you want to tweak it
- **Faster/slower:** change the rate (`-3%` → `0%` or `+5%`).
- **Different voice:** Edge also has `en-US-EmmaMultilingualNeural` and many
  others, but the two `en-IN-*` voices are the Indian ones.
- **Pauses:** edit `voiceover-full.txt` — a blank line or `…` becomes a pause.

### Delivery rules baked into the script
- Short sentences, contractions (you've, it's, don't), connectors ("here's why").
- `…` marks a breath; the last line is deliberately calm and slow.
- The two "beat" moments (after line 01 and after line 09) are where you leave
  **silence in the edit** — do not fill them with music.

---

## 5. Why it felt scripted + flow brainstorm

**Old arc:** resume stack -> proof dashboard -> mic -> robot-crossed-out ->
India map -> 80% -> logo. Seven *claims*. No person, no stakes, nothing heard.

**Diagnosis:** "scripted" = (a) a narrator *reading labels*, and (b) a
*feature list* structure. Fix the voice **and** the flow.

**Five fixes**
1. **One person, one story** — follow a candidate ("Meera") from ignored to heard.
2. **Open on tension, second person** — start with the feeling, not the logo.
3. **Show, don't caption** — fewer on-screen bullets; let sketches + voice carry it.
4. **Use contrast** — old way vs Swapiki (keyword bot vs a real human voice).
5. **Vary rhythm** — long scene, short scene, then a beat of silence.

**Three format options**
- **A. Story-led (recommended):** one candidate's before/after. Warm, human.
- **B. Split-screen contrast:** left = keyword bot / right = Swapiki. Sharper,
  slightly colder, very clear.
- **C. Founder / anti-pitch:** first person, "why we built this", deliberately
  unpolished. Feels least like an ad.

All three scripts are below; pick one (A is what the storyboard details).

---

## 6. Design guardrails (keep these true)

Every claim must match what Swapiki actually is:

- Tagline: **"Skip the bot. Get heard."**
- Candidates publish **real project proof + a 2-minute voice walkthrough**.
- Those are **read by people — not scored, ranked, or sentiment-analysed by AI**.
  There is no AI score or ranking shown to employers.
- Only liveness is checked ("Live recording confirmed") — **no identity
  verification**, nothing stamped "verified".
- **Free pilot** for employers. **500+ live listings across India** (IT, BFSI).
- Public job board; **search & match unlock at 80% profile complete**.
- Site: **swapiki.com**. Brand accent: **#E85D2A** (orange).
- Do **not** say "AI ranks/matches you", "verified candidates", or "blue accent".

---

## 7. Script A — story-led (recommended)

~150 words, two silences, one promise per sentence. This is **already generated**
as `vo/voiceover.mp3` (and `voiceover-full.txt` is the same text as one block).
Per-line `.txt` files are in `video/vo-lines/story-led/` if you want them.

### Voiceover (lines, for timing reference)
```
01. You've sent out two hundred applications… and heard nothing back.        [beat]
02. Here's why.
03. A bot scanned your resume for keywords — and moved on.
04. It never saw your project.
05. Never heard how you think.
06. Swapiki works differently.
07. You add real proof — the projects you actually built — and a two-minute voice walkthrough.
08. People listen to it… not a score, not a ranking.
09. Just someone finally hearing you.                                        [beat]
10. Everything's live — five hundred plus roles across India.
11. Polish your profile, and the right openings start finding you.
12. Swapiki. Skip the bot… get heard.
13. swapiki.com
```

### Storyboard (7 scenes)

| # | Time | Sketch | On-screen text | Voiceover | Delivery |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00–0:06 | Person at laptop pressing send; empty inbox | `200 applications.` | 01 | Tired; long pause after |
| 2 | 0:06–0:16 | Robotic scanner sweeping a resume; human greyed out | `It never saw you.` | 02–05 | Slightly frustrated |
| 3 | 0:16–0:28 | Profile card filling with project tiles; play button on a waveform | `Real proof.` | 06–07 | Warmer, lifting |
| 4 | 0:28–0:38 | Headphones; a human face listening; small robot icon crossed out | `People, not bots.` | 08–09 | Soft, sincere; beat of silence |
| 5 | 0:38–0:46 | India map, role pins lighting up city by city | `500+ roles live.` | 10 | Brisk, confident |
| 6 | 0:46–0:54 | Progress bar filling to 80%, then job cards unlocking | `80% unlocks matches.` | 11 | Encouraging, upward |
| 7 | 0:54–0:60 | Wordmark with orange (#E85D2A) underline; site name | `Skip the bot. Get heard.` / `swapiki.com` | 12–13 | Calm, final; hold silence |

### Paste-ready strokevideo prompt
> A hand-drawn whiteboard sketchnote animation, marker style, warm and human,
> single continuous storyboard. Scene 1: a person slumped at a laptop, pressing
> send repeatedly, empty inbox. Scene 2: a robotic scanner sweeping a resume,
> keywords lighting up, a person fading to grey. Scene 3: a candidate profile
> card filling with project tiles and a glowing voice waveform. Scene 4: a pair
> of headphones with a human face listening and a small robot icon crossed out.
> Scene 5: a map of India with role pins lighting up city by city. Scene 6: a
> profile progress bar filling to 80 percent, then job cards unlocking. Scene 7:
> the word Swapiki with an orange underline. Minimal on-screen text, clean
> single-line captions only, no bullet lists, generous white space, orange
> accent (#E85D2A). Upbeat, warm, quick — about 60 seconds.

---

## 8. Script B — split-screen contrast

**Per-line files:** `video/vo-lines/split-screen/`. Left = "the old way" (muted
greys), right = Swapiki (orange accent).

```
01. Here's how most hiring works.
02. A bot scans your resume for keywords — and never hears you.
03. Here's how Swapiki works.
04. Real project proof — the work you actually built.
05. Plus a two-minute voice walkthrough.
06. People listen to it — not a score, not a ranking.
07. Five hundred plus roles are live across India right now.
08. Polish your profile to eighty percent and the right roles unlock.
09. Swapiki. Skip the bot… get heard.
10. swapiki.com
```

**Visual beats:** (1–2) grey desk, scanner, robot icon; (3) wipe to colour;
(4–5) profile tiles + waveform; (6) headphones + listening face; (7) India map
pins; (8) 80% bar + unlocking cards; (9–10) wordmark + site.

**strokevideo prompt:** "Split-screen sketchnote, marker style, two halves. Left
half monochrome grey: a robotic scanner sweeping a resume, a person faded out.
Right half warm colour with orange accent (#E85D2A): a candidate profile filling
with project tiles, a glowing voice waveform, headphones with a listening face, a
map of India with pins lighting up, a progress bar to 80 percent, then job cards
unlocking. End on the word Swapiki with an orange underline. Minimal single-line
captions, no bullet lists, generous white space, about 45 seconds."

---

## 9. Script C — founder / anti-pitch

**Per-line files:** `video/vo-lines/founder/`. First person, casual, minimal
on-screen text (let it feel unpolished on purpose).

```
01. Let me be honest. We built Swapiki because hiring stopped listening.
02. Your resume goes in. A bot looks for keywords. And a person never hears you.
03. So we did the opposite.
04. On Swapiki, you post the work you're actually proud of — plus a short voice walkthrough.
05. No score. No ranking. A human just… listens.
06. We're live across India now, with five hundred plus open roles.
07. It's a free pilot. Come see what being heard feels like.
08. Swapiki. Skip the bot. Get heard.
09. swapiki.com
```

**Visual beats:** (1) two people sketching at a whiteboard; (2) resume -> scanner,
grey; (3) a line drawn, then crossed out; (4) phone showing project tiles + record
button; (5) headphones + listening face, "no score" crossed drain; (6) India map
pins; (7) open door / "free pilot" banner; (8–9) wordmark + site.

**strokevideo prompt:** "Casual hand-drawn sketchnote, marker style, first-person
founder tone, warm and a little rough. Scenes: two people sketching at a
whiteboard; a resume going into a robotic scanner; a dotted line being drawn then
crossed out; a phone showing project tiles and a record button; headphones with a
listening face and a small crossed-out scoreboard; a map of India lighting up with
pins; an open door and a handwritten 'free pilot'; the word Swapiki with an orange
underline (#E85D2A). Minimal text, letters look handwritten, about 45 seconds."

---

## 10. 15-second Reels cut

Vertical 9:16, big captions, one idea per beat. Same visuals, tighter VO.

```
200 applications. Zero replies.                  [0:00–0:03]
A bot scans your resume… and never hears you.    [0:03–0:07]
Swapiki — real project proof, plus a two-minute
voice walkthrough, read by people.               [0:07–0:12]
Skip the bot. Get heard.  swapiki.com            [0:12–0:15]
```

Visual order: empty inbox -> bot scanner -> profile + waveform -> wordmark.

---

## 11. THE STEP-BY-STEP RUNBOOK (click level)

### PHASE 0 — Prepare (5 min)
1. Create `Swapiki-Video\` on your PC. Inside it make `vo\`, `strokes\`, `export\`.
2. Keep this doc open in a tab.

### PHASE 1 — Your voiceover is already done (0 min)
1. Open your `Swapiki-Video\vo` folder.
2. Play `voiceover-neerja.mp3` (female) and `voiceover-prabhat.mp3` (male).
3. Keep the one you prefer as `voiceover.mp3` (it is already set to Neerja).
4. Nothing else to do here — it is free and ready to drop into the editor.

### PHASE 2 — Time the voice (10 min)
1. Open your editor (CapCut / Clipchamp). New project **1920×1080**.
2. Drag **`voiceover.mp3`** onto the audio track.
3. Play once and note the **start time of each sentence** (zoom the timeline and
   read the ruler). Write them down — this is the spine.
4. Expected total: ~51 seconds.

### PHASE 3 — Generate the strokes (strokevideo) (15 min)
1. Go to **strokevideo.com**, sign in.
2. Paste the **strokevideo prompt** from [section 7](#paste-ready-strokevideo-prompt).
3. Set style **Marker** (or Sharpie), aspect **16:9**, language **English**.
4. Generate. Download the MP4 to `Swapiki-Video\strokes\`. (If the free daily
   quota blocks you, try again after the reset, or use the alternate free tools
   in [section 14](#14-troubleshooting--common-mistakes).)

### PHASE 4 — Assemble (editor) (30–60 min)
1. In the same 1920×1080 project, import `strokes\*.mp4`.
2. Put the strokes on the **video track**, the VO clips on the **audio track**.
3. **Align:** play the VO; wherever a new line starts, split the strokes clip and
   nudge so the matching sketch appears exactly then (use the storyboard timings
   in section 7 as the map). The VO leads; the drawing follows.
4. Add **on-screen text** exactly as in the storyboard table — one short line at
   a time, fade in/out, colour mostly neutral with **#E85D2A** for accents.
5. Add a **music bed** on a second audio track at about **-24 to -18 dB**;
   enable **ducking** (or keyframe) so it drops under the voice.
6. Do **not** fill the two silences (after line 01 and after line 09) with
   music peaks — let them breathe.
7. Watch start to finish. Fix any sketch that lands late.

### PHASE 5 — Reels cut (15 min)
1. **Duplicate** the project -> change canvas to **1080×1920 (9:16)**.
2. Recut to the [15s script](#10-15-second-reels-cut): 4 beats, four visuals.
3. Enlarge captions for phone viewing (safe margins top/bottom).

### PHASE 6 — Export
- 16:9: **1080p, H.264, 30 fps, 8–12 Mbps** -> `swapiki-sketchnote-60s.mp4`.
- 9:16: same settings -> `swapiki-reels-15s.mp4`.
- Save both in `Swapiki-Video\export\`.

### PHASE 7 — Review
1. Run the [final checklist](#15-final-checklist).
2. Send the 60s cut to your sir.

---

## 12. Editing timeline / shot list

Use with Script A. Times are targets; pull/push to match the real VO lengths.

| Scene | Start | Visual (strokes) | On-screen text | VO lines |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | Laptop, send pressed, empty inbox | `200 applications.` | 01 |
| 2 | 0:06 | Robotic scanner over a resume, human greyed | `It never saw you.` | 02–05 |
| 3 | 0:16 | Profile card + project tiles + waveform play | `Real proof.` | 06–07 |
| 4 | 0:28 | Headphones, listening face, robot crossed out | `People, not bots.` | 08–09 |
| 5 | 0:38 | India map, pins lighting up | `500+ roles live.` | 10 |
| 6 | 0:46 | Progress bar to 80%, cards unlock | `80% unlocks matches.` | 11 |
| 7 | 0:54 | Wordmark + orange underline + site | `Skip the bot. Get heard.` / `swapiki.com` | 12–13 |

---

## 13. Export specs

| Cut | Resolution | Codec | FPS | Bitrate | Filename |
| --- | --- | --- | --- | --- | --- |
| Main | 1920×1080 | H.264 | 30 | 8–12 Mbps | `swapiki-sketchnote-60s.mp4` |
| Reels | 1080×1920 | H.264 | 30 | 8–12 Mbps | `swapiki-reels-15s.mp4` |

Keep audio at 48 kHz stereo, loudness around **-14 LUFS** for social.

---

## 14. Troubleshooting + common mistakes

| Symptom | Fix |
| --- | --- |
| Voice still sounds scripted | Edit `voiceover-full.txt` (shorter sentences, more `…`); regenerate with the Edge script; pick the male/female voice you prefer. |
| Voice is too fast/slow | Do not use speed. Split or merge line files; control gaps in the editor. |
| strokevideo free quota hit | Wait for the daily reset, or use an alternate free whiteboard tool (e.g. Doodly trial, Renderforest free, or a Canva whiteboard + screen-record). |
| Sketch lands late/early | Split the strokes clip at the scene boundary and nudge; the VO is the master clock. |
| Text feels like a spec sheet | Delete on-screen bullets; keep **one short line per scene** as in the storyboard. |
| Music fights the voice | Lower bed to -24 dB and enable ducking. |
| Claim feels off-brand | Re-check [section 6](#6-design-guardrails-keep-these-true) (people read it, no AI score, 500+ roles, 80% unlock, #E85D2A, swapiki.com). |
| Looks "AI-ish"/over-produced | Reduce transitions, keep handwriting, allow a rough edge — polish is what makes it feel fake. |

---

## 15. Final checklist

- [ ] Free Indian voiceover in place (`voiceover.mp3`), chosen from Neerja/Prabhat.
- [ ] Two silences left empty (after line 01 and line 09).
- [ ] Script is **story-led**, not a feature list; minimal on-screen text.
- [ ] Strokes regenerated in strokevideo with the section-7 prompt.
- [ ] Sketches align to VO lines; music ducked.
- [ ] Every claim verified against section 6.
- [ ] 16:9 and 9:16 exported to `export\`.
- [ ] Watched end to end; sent for review.
