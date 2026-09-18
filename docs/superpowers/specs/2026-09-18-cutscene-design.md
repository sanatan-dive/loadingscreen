# Cutscene — design

**Date:** 2026-09-18
**Status:** approved, ready for implementation planning
**Working name:** Cutscene · **Domain:** loadingscreen.com (recommended, unbought)

---

## 1. What this is

Upload one photo. Fifteen seconds later you have a GTA-style cinematic
intro with your face in it, ready to post.

One purpose, one button, no editor. The product is the output, not the
tool. If a user has to think about a setting, we have failed.

The reference is a viral IShowSpeed clip. We reproduce its format exactly
and substitute the user's face.

---

## 2. The reference, measured

Every number below was measured from the source file, not estimated. They
are the template constants.

| Property | Value | How we know |
|---|---|---|
| Source | 960×720, 24fps, 121.9s, h264 + AAC | ffprobe |
| Structure | ~18 still photos, no video | scene detection |
| Shot length | 5–7s | frame-delta analysis |
| Transitions | ~1.0–1.5s crossfade dissolves | frame-delta spikes |
| Motion | pure horizontal pan, **8.7 px/s** | phase correlation |
| Vertical motion | **zero** | phase correlation |
| Zoom | **none** — best scale 1.00, corr 0.9955 | log-scale search |
| Ending | hard cut to black at 118.9s | brightness |

The "cinematic" feel comes from held portraits, slow pans and music. There
is no camera move, no zoom, no cutting on the beat.

### Our 15-second cut

```
0s ──────5.67s────── 11.3s ────── 15.0s
│  shot 1  │  shot 2  │  shot 3  │
└──────────┴──────────┴──────────┘
        ▲ 1.0s crossfade   ▲ 1.0s crossfade
   pan 8.7 px/s right-to-left throughout
```

- Shot duration `D = 17/3 s`, crossfade `X = 1.0s`, total `3D − 2X = 15.000s`
- Crossfade offsets at `D−X = 4.667s` and `2D−2X = 9.333s`
- Verified output: crossfade centres at 5.2s and 9.85s; pan +8.50 px/s vs
  +8.70 target; 360 frames at 24fps

Source images are upscaled to 1056×792 so the 49px pan has headroom
without cropping into the frame. **Generated shots must be produced at
≥1056×792** so the pan never upscales.

---

## 3. What the spike proved

A working pipeline was built and run end to end. Findings that shape the
design:

**Masked region editing is mandatory.** Full-frame editing returned
848×1264 and 832×1248 from a 960×720 input — the models reframe no matter
how firmly the prompt forbids it. Cropping to the head and compositing
back makes reframing structurally impossible and leaves the backdrop,
jacket and YouTube wordmark as untouched original pixels.

**Models silently no-op.** One call returned the *original* face,
re-rendered, at 0.968 similarity to the source. Another model returned a
generic third person on six of six attempts — neither the user nor the
original. Both are plausible-looking wrong answers that no error handler
would catch. **Automated identity verification is not a quality feature;
it is the only thing standing between users and videos of strangers.**

**Model choice is counter-intuitive.** The cheapest and fastest model is
also the most accurate.

| model | sec | cost | identity vs user |
|---|---|---|---|
| **gemini-3.1-flash-lite-image** | **10.2** | **$0.0342** | **0.804** |
| gemini-3.1-flash-image | 13.0 | $0.0684 | 0.640 |
| gemini-3-pro-image | 26.6 | $0.1405 | 0.799 |
| gemini-2.5-flash-image | 11.9 | $0.0389 | 0.246 (fails) |

**Shared CV objects are not thread-safe.** `FaceDetectorYN` holds mutable
input-size state. Three parallel workers sharing one instance raced and
produced false "no face" results, which forced escalation to models 2–4×
the price. Thread-local instances took the pipeline from 153s/$0.65 to
9.5s/$0.10.

**The smile is the joke, and it must be authored, not copied.** Pointing
the model at the reference frame for expression drags the reference's bone
structure and skin tone with it (identity fell to 0.476). Describing the
expression in words instead — as template data — restored identity to
0.786 while matching the reference's mouth width exactly (0.883).
Descriptions must state *magnitude*: adding "keep the change minimal — a
small smirk, not a grin" was the single change that fixed it.

---

## 4. Architecture

Seven modules. Each has one job, a narrow interface, and no knowledge of
the others' internals.

```
                    ┌──────────┐
  photo ──────────► │   api    │ auth · limits · idempotency
                    └────┬─────┘
                         ▼
                    ┌──────────┐
                    │  jobs    │ state, cache lookup
                    └────┬─────┘
                         ▼
        ┌────────────────┴────────────────┐
        ▼                ▼                ▼          (parallel)
   ┌─────────┐      ┌─────────┐     ┌─────────┐
   │provider │      │provider │     │provider │      image edit
   └────┬────┘      └────┬────┘     └────┬────┘
        ▼                ▼               ▼
   ┌─────────────────────────────────────────┐
   │              gate                       │  identity + expression
   └────┬────────────────────────────────────┘     ↺ escalate on fail
        ▼
   ┌─────────┐   align, feather, blend
   │composite│
   └────┬────┘
        ▼
   ┌─────────┐   ffmpeg: pan, crossfade, audio
   │ render  │
   └────┬────┘
        ▼
       mp4

   ┌──────────┐              ┌──────────┐
   │ template │ data only    │ identity │ detect · embed · compare
   └──────────┘              └──────────┘   (thread-safe)
```

### Module contracts

**`template`** — pure data. Frame paths, shot durations, pan rate,
crossfade duration, per-shot expression text, theme cue points. Adding a
second meme format is a new data file, not new code. This is the module
that makes the product extensible.

**`identity`** — `detect(image)`, `embed(image)`, `cosine(a, b)`. YuNet +
SFace. **Thread-local instances, always.** Knows nothing about HTTP,
models or templates.

**`provider`** — the OpenRouter adapter. `edit(crop, face, model, prompt)
→ image`. One interface so a provider swap is one file. Owns retry,
backoff and the concurrency semaphore.

**`gate`** — `verify(result, user_embedding, original_embedding) →
pass | reject`. Owns the thresholds and the escalation ladder. The
single most important module in the system.

**`composite`** — `blend(frame, new_head, box) → frame`. Face-rect
alignment by uniform scale and translate (never stretch), elliptical
feathered mask. Pure image math, trivially unit-testable.

**`render`** — `assemble(shots, audio, opts) → mp4`. Deterministic: same
inputs produce identical bytes, which is what makes the render cache
trustworthy.

**`api`** — thin. Auth, rate limits, idempotency, job creation. No
business logic.

---

## 5. The gate

Runs on every generated shot before it is composited.

```
identity_ok   = cosine(result, user) >= 0.55
               and cosine(result, user) > cosine(result, original)
expression_ok = mouth_width within tolerance of the template's target
```

On failure, escalate through the model ladder:

```
gemini-3.1-flash-lite-image  →  gemini-3.1-flash-image  →  gemini-3-pro-image
```

Three attempts maximum per shot. If all three fail, the job fails with a
clear message and **the user is not charged a credit**. Shipping a wrong
face is worse than shipping nothing.

Thresholds live in config, not code, because they will need tuning against
real faces. The 0.363 figure is SFace's documented same-identity
threshold; 0.55 is our stricter bar, chosen because measured passes
clustered at 0.67–0.90 and the one bad result sat at 0.476.

**Known gap:** the expression metric is weak. Five landmarks cannot
reliably measure a smile — in testing, a serious photo scored above a
teeth-baring one on mouth width. Before the gate can enforce expression,
it needs a real landmark model (MediaPipe FaceMesh, 468 points) or a
small VLM check. Until then expression is advisory and logged, not
blocking. **This is the top open technical task.**

---

## 6. Caching

Two layers, deliberately separate. Splitting them is what makes
customization feel instant.

| Layer | Key | Hit cost |
|---|---|---|
| Swapped shots | `sha256(photo) + template + shot_id + appearance_opts` | 0 API calls |
| Rendered video | `shot_hashes + theme + cue + watermark_flag` | 0 API calls, no ffmpeg |

Consequences:

| User changes | Re-runs | Time |
|---|---|---|
| Music theme or cue | ffmpeg only | **0.8s** |
| Watermark → HD | ffmpeg only | **0.8s** |
| Skin tone, outfit, smile | 3 parallel swaps + render | **~9s** |
| Nothing (regenerate) | nothing | **instant** |

**Changing the music must never invoke an image model.** Regenerating and
re-downloading is the most common user action; it should cost nothing.

Stored in Supabase Storage, keyed rows in Postgres.

---

## 7. Abuse and spend control

An unprotected generate button is a button that spends the owner's money.

- **API keys server-side only.** The browser never sees a provider key and
  never calls a provider.
- **Turnstile** on the generate endpoint.
- **Token buckets** per IP and per user, in Postgres.
- **Hard daily spend ceiling**, checked before every provider call, **fails
  closed.** At $0.10/video the $3,000 monthly cap is ~29,000 videos; one
  viral post exhausts it in a weekend.
- **Idempotency keys** so a double-tap cannot double-charge.
- **Concurrency semaphore** on provider calls so we never trip OpenRouter's
  own rate limits. Exponential backoff with jitter on 429.
- **Upload validation** — size cap, MIME sniffing, must contain exactly one
  detectable face.
- **Uploads auto-delete on a timer.** These are people's faces; retaining
  them is liability with no product value.

### Upload gate (required, not optional)

Users will upload public figures — politicians, dead celebrities,
notorious individuals. A one-click "put this face on a red carpet" tool is
a short path to something genuinely damaging published under this brand.

Before any API spend: a public-figure check and an explicit consent
confirmation ("this is me, or someone who agreed"). Refusing costs
nothing; moderating output after the fact costs everything.

---

## 8. UI and UX

**Light mode. Four screens. No navigation, no settings page, no editor.**

The aesthetic tension is deliberate: GTA loading screens are dark and
stylized, so a clean white product wrapper around that dark, saturated
artwork makes the output pop. The UI is the gallery wall; the video is the
painting.

### Visual direction

- Off-white canvas (`#FAFAF8`), near-black text, generous whitespace
- One hot accent used sparingly — GTA-flavoured magenta/orange
- Heavy condensed display type for headings, plain readable sans for body
- Large touch targets, thumb-reachable actions, mobile-first
- Motion only where it carries meaning: the loader, and the result reveal

### Flow

**1 · Drop your photo**
One enormous drop zone. Drag, tap to browse, or paste. Camera capture on
mobile. No sign-up. Below it, a muted autoplaying example so the user
knows what they're getting before committing a photo.

**2 · Pick your theme**
Three cards: San Andreas · GTA IV · GTA V. Each has a play button that
previews its 15s cue inline. Selecting one advances automatically — no
"Next" button.

**3 · Generating** *(the signature moment)*
Three empty frames in a row. Each fills with the user's face as its swap
lands — roughly 6s, 7s, 8s. The user watches themselves appear three
times.

```
┌─────┐ ┌─────┐ ┌─────┐      ┌─────┐ ┌─────┐ ┌─────┐
│ ░░░ │ │ ░░░ │ │ ░░░ │  ──► │ YOU │ │ ░░░ │ │ ░░░ │  ──► ...
└─────┘ └─────┘ └─────┘      └─────┘ └─────┘ └─────┘
   shimmer placeholders          shot 1 landed @ ~6s
```

This is why the pipeline streams per-shot results rather than returning
one payload. A nine-second wait with three reveals in it is not a wait —
it's the best part. A spinner would waste the most engaging moment in the
product.

**4 · Your cutscene**
Video autoplays, looping, muted-first with a tap to unmute. Two actions
only: **Download** and **Share**. Theme switcher stays visible — it's a
0.8s re-render, so let people try all three. A quiet "make another" link
returns to step 1.

### UX rules

- Never block on an account. First video is free and anonymous.
- No progress percentages — show the actual work instead.
- Errors name the problem in plain language ("we couldn't find a face in
  that photo") and always offer the next action.
- Customization is deliberately thin: theme, and a small appearance set
  (skin tone, keep/change hairstyle). Anything more makes it an editor.
- Export a **silent version by default for TikTok** alongside the scored
  one — adding trending audio in-app outperforms baked-in music, and it
  dodges Content ID muting the post.

---

## 9. Deployment

**Everything on Vercel.** At 9.5s the whole job fits inside the 60s Hobby
function limit, so v1 needs no queue, no worker service and no Pro plan.

- Next.js on Vercel
- Supabase — Postgres, Storage, auth when we add accounts
- `ffmpeg-static` (~78MB, comfortably inside the 250MB bundle limit)
- Supabase project `cutscene` already provisioned, `ap-south-1`

If p95 latency creeps toward 45s, move to a job row plus client polling
before it becomes an incident. Do not build that now.

---

## 10. Economics

| | |
|---|---|
| Cost per video | **$0.103** (3 × $0.0342) |
| Latency | **~9s** (8.1s swaps parallel + 0.8s render) |
| Cache hit | $0, instant |
| Theme change | $0, 0.8s |
| Budget remaining | $2,941 ≈ 29,000 videos |

Monetization for v1: free watermarked video, buymeacoffee.com/sanatan for
support, paid HD export later. The spend ceiling is the real control — set
the free-tier limit against the monthly cap, not against intuition.

---

## 11. Decisions made

- **Backdrop:** exact YouTube step-and-repeat, as specified.
- **Aspect:** 960×720 (4:3), matching the reference.
- **Themes:** San Andreas, GTA IV, GTA V, loudness-normalized to −14 LUFS
  / −1.5 dBTP at build time. GTA V's source peaks at 0.0 dB and clips; San
  Andreas is 4dB quieter. Without normalization the theme switcher feels
  broken.
- **Model:** gemini-3.1-flash-lite-image, with a two-step escalation ladder.
- **Expression:** authored per shot in the template, with explicit magnitude.

## 12. Open items

**Technical**
- Replace the 5-landmark expression metric with MediaPipe FaceMesh or a
  VLM check so the gate can enforce expression. *Highest priority.*
- Validate identity thresholds against a real spread of faces — skin
  tones, ages, glasses, head coverings, facial hair. The spike used one
  stock photo.
- Tune shot 1's expression text further; it was the hardest to hold.

**Product**
- Cue point per theme — nine candidates in `assets/audio/cues/`.
- Free-tier limit and what happens at the spend ceiling.

**Pre-launch, non-technical**
- The YouTube wordmark appears in every exported video. Decided in favour
  of exactness for now; revisit before public launch.
- The three GTA themes are Rockstar's copyrighted music. Content ID will
  flag uploads. The silent-export default mitigates this for users but not
  for us.
- Buy the domain. `gtaspeed.com` is available but stacks two trademarks
  into one name and is not recommended.

---

## 13. Not in v1

No accounts, no editor, no video upload (photo only), no multiple
templates, no custom music upload, no Stripe, no team features. Each of
these is a reason for a user to stop before they get their video.
