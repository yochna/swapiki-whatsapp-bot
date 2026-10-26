# Swapiki video ad — voiceover kit (v6)

A ready-to-use **ad voiceover**, the **script** it is read from, and a
one-command tool to lay the voice over your sketchnote video.

---

## 1. The script

Voice: **en-IN-NeerjaNeural** (female, Indian English), rate `-3%`.
Total length **39.4 s**. Headings show the measured spoken window
(`vo-lines/ad/timing.csv`).

```
01  0.00–3.21   Still applying for jobs… and hearing nothing back?   (hook)
02  3.61–6.12   Still waiting for a call that never comes?            (hook)
03  6.82–7.69   Here's why.
04  8.04–17.13  A bot scans your resume for keywords, then rejects you.
                It never sees your projects. Never hears how you think.
11 17.63–19.20  Swapiki is different.
6  19.55–23.18  Show your real work, and record a two-minute voice pitch.
7  23.58–26.22  Real people listen to you, not a score.
8  26.72–29.50  Over 4,000 live jobs across India.
9  29.85–32.49  Get seen, get called, get hired.
10 33.09–37.54  Swapiki. Skip the bot. Get heard.
11 37.94–39.38  swapiki.com
```
(Line numbers above are the `NN.txt` files; edit them to change the words.)

---

## 2. Files

| File | What it is |
| --- | --- |
| `video/vo-lines/ad/01.txt … 11.txt` | The ad script, **one file per line**. |
| `video/vo-lines/ad/01.mp3 … 11.mp3` | The voice, **one clip per line** (silence-trimmed). |
| `video/voiceover-ad.wav` / `.mp3` | The full ad voice as one track (**39.38 s**). |
| `video/vo-lines/ad/timing.csv` | Exact `start_s,dur_s,end_s` per line. |
| `video/vo-lines/voiceover-full.txt` | The whole script as one block. |
| `video/add-voiceover.ps1` | Lays the voiceover onto a sketchnote video. |
| `video/build-voiceover.ps1` + `video/generate-voiceover.js` | Re-record the voice + timings. |
| `video/build-ad.ps1`, `video/build-ad-kinetic.ps1` | Optional: full caption-composited cuts (not needed for the simple workflow). |

---

## 3. Add the voiceover to your sketchnote video

Drop your sketchnote video anywhere (e.g. `video\my-sketchnote.mp4`), then:

```powershell
powershell -ExecutionPolicy Bypass -File video\add-voiceover.ps1 -Video "video\my-sketchnote.mp4"
```

- The **video is copied** (no re-encode, no quality loss).
- The voiceover **replaces the audio**; it is padded with silence if the video is
  longer than the voice, or trimmed if shorter.
- Output: `video\my-sketchnote-with-vo.mp4` (override with `-Out`).

Options:
- `-Music` — lay the backing track under the voice (default `music\positive-weekend.mp3`).
- `-KeepOriginalAudio` — mix the video's own audio (e.g. ambience) instead of replacing it.
- `-Start 1.5` — delay the voice by N seconds (align it to a title card).
- `-Voice "video\other.wav"` — use a different voice track.

Note: the voice is **39.4 s**. If your sketchnote video is longer, it will play
over the first ~39 s and then go silent. Tell me the video's length and I can
stretch the gaps or add the music bed to fill it, or re-time the lines to your
scenes.

---

## 4. The review → what this script does

| Review point | How the script answers it |
| --- | --- |
| Out of sync | Voice is generated **one line at a time**, and each clip's leading/trailing silence is stripped, so lines start cleanly and stay in step. |
| Needs a hook | Opens on the viewer's pain: *"Still applying for jobs… and hearing nothing back?"* then *"Still waiting for a call that never comes?"*. |
| Add numbers / detail | Names the problem concretely (the bot scans keywords and rejects you, never sees your projects) and gives a number: **"Over 4,000 live jobs across India."** |
| Explainer, not an ad | Tightened to **problem → turn → proof → CTA** in ~39 s, ending on the tagline and the URL. |

---

## 5. Guardrails (keep the claims true)

- Tagline: **"Skip the bot. Get heard."**
- Candidates show **real project proof + a 2-minute voice walkthrough**, read
  **by people — not scored or ranked by AI**.
- Only liveness is checked; **no identity verification**, nothing stamped "verified".
- **Free pilot** for employers; listings are live (site `stats.jobs` ≈ **4,700+**
  as of Oct 2026 — the script says a safe "over 4,000").
- Site: **swapiki.com**. Accent: **#E85D2A** (orange).

---

## 6. Re-record the voice

`generate-voiceover.js` uses the free Microsoft Edge read-aloud voices (needs the
`ws` package — already in `whatsapp-bot\node_modules`).

1. Edit `video\vo-lines\ad\NN.txt`.
2. Run:
```powershell
powershell -ExecutionPolicy Bypass -File video\build-voiceover.ps1
# male voice:
powershell ... -File video\build-voiceover.ps1 -Voice en-IN-PrabhatNeural -Rate "-3%"
```
This rewrites the per-line clips, `voiceover-ad.wav/.mp3`, and `timing.csv`.
