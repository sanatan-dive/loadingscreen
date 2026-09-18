# Cutscene

Upload one photo. Get a 15-second GTA-style cinematic intro with your face in it.

```
photo ──► guards ──► 3 parallel face swaps ──► identity gate ──► composite ──► ffmpeg ──► mp4
             │                                      │
             │                                      └── reject ──► escalate model ──► retry
             └── one face? · under the day's limit? · not a public figure?  (all before a cent)
```

---

## Why it is built this way

Three findings from measuring the reference video and spiking the pipeline
shaped every decision. They are worth knowing before changing anything.

**The reference is a pure horizontal pan with zero zoom.** Measured at
8.7 px/s, zero vertical drift, best-fit scale 1.00 (correlation 0.9955). Three
shots of 5.667s with 1.0s crossfades at 4.667s and 9.333s. Those are constants
in `lib/template`, not preferences.

**Image models silently return the wrong face.** One call came back with the
*original* subject re-rendered at 0.968 similarity. Another model returned a
generic third person in six of six trials — neither the user nor the original.
Both look like successes to any error handler. `lib/gate` is the only thing
standing between users and videos of strangers; do not make it optional.

**The cheapest model is also the best.** Benchmarked on identical inputs:

| model | latency | cost | identity |
|---|---|---|---|
| `gemini-3.1-flash-lite-image` | 10.2s | $0.0342 | **0.804** |
| `gemini-3.1-flash-image` | 13.0s | $0.0684 | 0.640 |
| `gemini-3-pro-image` | 26.6s | $0.1405 | 0.799 |
| `gemini-2.5-flash-image` | 11.9s | $0.0389 | 0.246 ✗ |

`flash-image` is slower, pricier *and* less accurate than `flash-lite`, so it
is not in the ladder at all. Two rungs: flash-lite, then pro.

**The smile is the joke, and it must be authored.** Pointing the model at the
reference frame for expression drags the reference's bone structure and skin
tone across with it (identity collapsed to 0.476). Describing the expression
in words — as data in `lib/template` — restored it to 0.786. Descriptions must
state *magnitude*: "keep the change minimal, a small smirk, not a grin" was the
single edit that fixed it.

---

## Setup

```bash
npm install
cp .env.example .env      # then fill it in
npm run dev
```

### Environment

| variable | required | what it does |
|---|---|---|
| `OPENROUTER_API_KEY` | **yes** | image editing. Server-side only, never shipped to the browser |
| `SUPABASE_URL` | no | enables the persistent store; falls back to in-memory without it |
| `SUPABASE_SERVICE_ROLE_KEY` | no | as above. **Secret** — never expose to the client |
| `DAILY_CEILING_USD` | no | hard spend cap, default 25. Fails closed |
| `FREE_VIDEOS_PER_DAY` | no | default 3 |

Without Supabase the app runs fully but the cache and rate limits are
per-process, which is fine locally and wrong on serverless — each instance gets
its own counters. Configure Supabase before taking real traffic.

Supabase also needs a **private storage bucket named `job-shots`**, which holds
the composited shots so switching the music is a re-render rather than three
fresh face swaps. `scripts/store-check.ts` creates it if it is missing and
round-trips every table the request path touches; run it after changing either
Supabase variable.

A *wrong* service-role key is worse than none: `spentToday()` returns null, and
because the ceiling fails closed that refuses every generation. Verify with
`store-check` rather than by loading the page.

### Media you must supply

The repository deliberately ships **no audio and no reference video**. The three
GTA soundtracks, the cue clips cut from them and the reference clip are other
people's copyrighted work, so they are gitignored rather than published here.
A clone renders nothing until you provide your own:

| path | what it is |
|---|---|
| `assets/audio/themes/gta-{sa,4,5}.mp3` | full theme per `lib/template`, any length |
| `public/cues/{SA,GTA4,GTA5}_b_hook.mp3` | ~15s preview clip played by the theme rail |
| `public/reference.mp4` · `.webm` · `reference-poster.jpg` | the example shown on the landing page |

Normalize the themes to -14 LUFS / -1.5 dBTP or the theme switcher feels broken:
the sources differ by ~4dB. Point `lib/template` at whatever you use — it is
data, so substituting royalty-free music is a one-line change per theme.

### Scripts

```bash
npm run dev         # local server
npm test            # 151 tests
npm run typecheck
npm run build
npx tsx scripts/e2e.ts <photo.jpg> out.mp4 gta-5   # real end-to-end, spends money
npx tsx scripts/figure-check.ts <photo.png>        # public-figure verdict, ~$0.0007
npx tsx scripts/store-check.ts                     # prove the persistent store is wired
```

---

## Architecture

Seven modules, each with one job and no knowledge of the others' internals.

| module | responsibility |
|---|---|
| `lib/template` | shot files, authored expressions, measured timings, themes. **Data only** — a second meme format is a new data file, not new code |
| `lib/identity` | YuNet detection + SFace embeddings via ONNX. Validated pixel-exact against the Python oracle in `tests/fixtures/golden.json` |
| `lib/provider` | OpenRouter adapter. Owns the model ladder, backoff-with-jitter and a concurrency semaphore |
| `lib/gate` | identity verification. Rejects no-ops, generic faces and undetectable output |
| `lib/composite` | head box, uniform scale+translate alignment (**never** a stretch), feathered elliptical blend |
| `lib/render` | deterministic ffmpeg assembly. Same inputs, same bytes — which is what makes the render cache trustworthy |
| `lib/store` | persistence behind one interface; Supabase or in-memory |
| `lib/limits` | abuse and spend guards, all failing closed — upload validation, token buckets, the daily ceiling, and the public-figure screen |

`lib/pipeline.ts` orchestrates: three swaps in parallel, each gated and
escalated independently, emitted as they land so the UI can reveal them one at
a time.

### Deployment

Everything runs on Vercel. `next.config.ts` **must** keep the tracing
exclusions: `onnxruntime-node` ships macOS, Windows and Linux binaries totalling
294MB, which breaks the 250MB function limit. Excluding the non-Linux ones
brings the real footprint to ~127MB.

---

## Performance and cost

| | measured |
|---|---|
| cost per video | ~$0.103 (3 × $0.0342), up to ~$0.21 with one escalation |
| latency | **10–40s**, dominated by provider variance |
| ffmpeg render | 0.8s |
| CPU (decode, detect, embed, blend, encode) | ~200ms total |

Latency is not stable. Shots routinely land at 6s, 9s and 30s in the same job.
The streaming loader exists because of this: three reveals make the wait
legible in a way a spinner cannot.

### Caching

Two layers, deliberately separate:

| user changes | re-runs | time |
|---|---|---|
| music theme | ffmpeg only | 0.8s |
| face or appearance | 3 swaps + render | 10–40s |
| nothing | nothing | instant |

**Changing the music must never invoke an image model.** That falls out of
keying shots on `(photo, template, shot, appearance)` and renders on
`(shots, theme, cue, watermark)`.

---

## Known gaps

- **Expression is not gated.** Five landmarks cannot measure a smile — a
  serious photo scored above a teeth-baring one on mouth width. Needs
  MediaPipe FaceMesh or a VLM check before the gate can enforce it.
- **Identity thresholds are calibrated on one face.** Validate across skin
  tones, ages, glasses, head coverings and facial hair before launch.
- **Public-figure false negatives.** The screen refuses only when two framings
  of the photo name the same person, so a famous face the classifier names
  inconsistently gets through. Deliberate: the alternative refuses real users.
- **The screen is calibrated on few faces.** Measured against Musk, IShowSpeed
  and two ordinary men. Validate more widely before launch.
- **Video is returned as a data URL.** Fine locally; move to Supabase Storage
  before real traffic.
- **No Turnstile yet.** The rate limiter is IP-based only.

## Before launching publicly

- The YouTube wordmark appears in every exported video.
- The three GTA themes are Rockstar's copyrighted music; Content ID will flag
  uploads. The silent export mitigates this for users, not for us.
- Buy a domain. `loadingscreen.com` was available and carries no trademark
  exposure; `gtaspeed.com` stacks two.

See `docs/superpowers/specs/` for the design doc and `docs/superpowers/plans/`
for the implementation plan.
