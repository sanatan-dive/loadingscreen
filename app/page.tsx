'use client'

import { useCallback, useRef, useState } from 'react'
import { Stage, type StageState } from './components/Stage'
import { UploadCard } from './components/UploadCard'
import { ShotStrip } from './components/ShotStrip'
import { ThemeRail, type ThemeOption } from './components/ThemeRail'
import { Pricedown, WantedStars, MoneyChip, MissionBanner, HudTag } from './components/Hud'
import { toUserError } from '@/lib/user-error'
import { CustomizeButton, OptionsDialog, countChanges } from './components/Options'
import type { Appearance } from '@/lib/appearance'

const THEMES: ThemeOption[] = [
  { id: 'gta-sa', label: 'San Andreas', cue: '/cues/SA_b_hook.mp3' },
  { id: 'gta-4', label: 'GTA IV', cue: '/cues/GTA4_b_hook.mp3' },
  { id: 'gta-5', label: 'GTA V', cue: '/cues/GTA5_b_hook.mp3' },
]

type Phase = 'idle' | 'working' | 'done' | 'failed'

/**
 * Stable per-browser id, paired with the IP check so one shared network does
 * not consume everyone's free videos. Best-effort: private windows and cleared
 * storage fall back to the IP limit alone.
 */
function clientId(): string {
  try {
    let id = localStorage.getItem('cutscene:client')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('cutscene:client', id)
    }
    return id
  } catch {
    return ''
  }
}

const LOADING_LINES = [
  'Stealing your face',
  'Adjusting the jacket',
  'Calling the paparazzi',
  'Cueing the strings',
]

export default function Page() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [theme, setTheme] = useState('gta-5')
  const [appearance, setAppearance] = useState<Appearance>({})
  const [showOptions, setShowOptions] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [shots, setShots] = useState<(string | null)[]>([null, null, null])
  const [video, setVideo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastFile = useRef<File | null>(null)

  const stageState: StageState = phase === 'idle' ? 'hero' : phase === 'done' ? 'result' : 'card'
  const landed = shots.filter(Boolean).length

  const run = useCallback(async (file: File, themeId: string, look: Appearance) => {
    setPhase('working')
    setError(null)
    setShots([null, null, null])
    setVideo(null)
    setElapsed(0)
    const t0 = Date.now()
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500)

    const form = new FormData()
    form.set('photo', file)
    form.set('templateId', 'gta-redcarpet')
    form.set('themeId', themeId)
    form.set('appearance', JSON.stringify(look))

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: form,
        headers: { 'x-cutscene-client': clientId() },
      })
      if (!res.ok || !res.body) {
        throw new Error((await res.json().catch(() => ({}))).error ?? 'request failed')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          if (!frame.startsWith('data: ')) continue
          const ev = JSON.parse(frame.slice(6))
          if (ev.type === 'shot') {
            setShots((prev) => {
              const next = [...prev]
              next[ev.index] = ev.src
              return next
            })
          } else if (ev.type === 'done') {
            setVideo(ev.src)
            setJobId(ev.jobId ?? null)
            setPhase('done')
          } else if (ev.type === 'error') {
            setError(ev.message)
            setPhase('failed')
          }
        }
      }
    } catch (err) {
      setError(toUserError(err).message)
      setPhase('failed')
    } finally {
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  const onFile = (f: File) => {
    lastFile.current = f
    run(f, theme, appearance)
  }

  /**
   * Switching music is a pure ffmpeg re-render of shots we already have — about
   * a second, and no API spend. Only fall back to a full generate if the job
   * has expired server-side.
   */
  const switchTheme = useCallback(
    async (id: string) => {
      setTheme(id)
      if (!jobId) {
        if (lastFile.current) run(lastFile.current, id, appearance)
        return
      }
      setSwapping(true)
      try {
        const res = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, themeId: id }),
        })
        if (res.status === 410) {
          if (lastFile.current) run(lastFile.current, id, appearance)
          return
        }
        const body = await res.json()
        if (body.src) setVideo(body.src)
        else setError(body.error ?? 'could not change the music')
      } catch {
        setError('could not change the music')
      } finally {
        setSwapping(false)
      }
    },
    [jobId, appearance, run]
  )

  const skewButton = (bg: string, fg = '#08080c'): React.CSSProperties => ({
    padding: '16px 34px',
    borderRadius: 3,
    transform: 'skewX(-9deg)',
    background: bg,
    color: fg,
    fontWeight: 800,
    fontSize: 15,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    textDecoration: 'none',
    boxShadow: '5px 5px 0 #08080c',
  })

  return (
    <main style={{ position: 'relative', minHeight: '100dvh', zIndex: 1 }}>
      {showOptions && (
        <OptionsDialog
          value={appearance}
          onChange={setAppearance}
          onClose={() => setShowOptions(false)}
        />
      )}

      <Stage
        state={stageState}
        src={video ?? '/reference.mp4'}
        poster="/reference-poster.jpg"
        controls={phase === 'done'}
      >
        {phase === 'working' && <ShotStrip shots={shots} />}
      </Stage>

      {/* ---------------- top HUD ---------------- */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '15px 18px',
          pointerEvents: 'none',
        }}
      >
        <a
          href="/"
          aria-label="Cutscene home"
          style={{ pointerEvents: 'auto', display: 'inline-flex', textDecoration: 'none' }}
          onClick={(e) => {
            // Reset in place rather than reloading and losing the result.
            e.preventDefault()
            setPhase('idle')
            setVideo(null)
            setJobId(null)
            setShots([null, null, null])
            setError(null)
          }}
        >
          <WantedStars level={phase === 'done' ? 5 : phase === 'working' ? 3 : 1} />
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, pointerEvents: 'auto' }}>
          <MoneyChip amount={phase === 'done' ? '$25,000' : '$0'} />
          <a
            href="https://buymeacoffee.com/sanatan"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              transform: 'skewX(-9deg)',
              background: 'var(--gold)',
              color: '#08080c',
              padding: '7px 13px',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              boxShadow: '3px 3px 0 #08080c',
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(9deg)' }}>
              Help me recover my domain cost
            </span>
          </a>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 3,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '62px 16px 50px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 940, display: 'grid', justifyItems: 'center' }}>
          {/* ---------------- headline ---------------- */}
          <header
            style={{
              textAlign: 'center',
              marginBottom: phase === 'idle' ? 34 : 0,
              maxHeight: phase === 'idle' ? 470 : 0,
              opacity: phase === 'idle' ? 1 : 0,
              overflow: 'hidden',
              transition: 'all 620ms var(--ease)',
            }}
          >
            <div style={{ marginBottom: 22 }}>
              <HudTag>Grand Theft Your Face</HudTag>
            </div>
            <h1 style={{ margin: 0 }}>
              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>
                <Pricedown size="clamp(44px, 11.5vw, 104px)" tone="gold" stroke={3.4}>
                  Get on the
                </Pricedown>
              </span>
              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>
                <Pricedown size="clamp(44px, 11.5vw, 104px)" tone="gold" stroke={3.4}>
                  loading screen
                </Pricedown>
              </span>
            </h1>
            <p
              style={{
                margin: '28px auto 0',
                maxWidth: 410,
                fontSize: 16,
                fontWeight: 560,
                lineHeight: 1.5,
                color: 'var(--ink-soft)',
              }}
            >
              One photo in. Fifteen seconds later you&rsquo;re the main character.
            </p>
          </header>

          {/* the stage occupies this space once it shrinks into view */}
          <div
            aria-hidden
            style={{
              height: phase === 'idle' ? 0 : 'min(54vh, 440px)',
              transition: 'height var(--morph) var(--ease)',
            }}
          />

          {phase === 'idle' && (
            <>
              <UploadCard onFile={onFile} disabled={false} />
              <CustomizeButton onClick={() => setShowOptions(true)} count={countChanges(appearance)} />
            </>
          )}

          {/* ---------------- working ---------------- */}
          {phase === 'working' && (
            <div style={{ textAlign: 'center', marginTop: 30 }}>
              <Pricedown size="clamp(28px, 6.5vw, 46px)" tone="ink" stroke={2.4}>
                Loading
              </Pricedown>
              <p
                style={{
                  margin: '18px 0 0',
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-soft)',
                }}
              >
                {LOADING_LINES[Math.min(landed, LOADING_LINES.length - 1)]} &middot; {landed}/3 &middot; {elapsed}s
              </p>
            </div>
          )}

          {/* ---------------- result ---------------- */}
          {phase === 'done' && video && (
            <div style={{ marginTop: 30, display: 'grid', gap: 24, justifyItems: 'center' }}>
              <MissionBanner title="Mission Passed" sub="Respect ++" tone="green" />

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                <a href={video} download="cutscene.mp4" style={skewButton('var(--accent)')}>
                  <span style={{ display: 'inline-block', transform: 'skewX(9deg)' }}>Download</span>
                </a>
                <button
                  onClick={async () => {
                    const text = 'I got on the loading screen 🎬'
                    try {
                      const blob = await (await fetch(video)).blob()
                      const file = new File([blob], 'cutscene.mp4', { type: 'video/mp4' })
                      if (navigator.canShare?.({ files: [file] })) {
                        await navigator.share({ files: [file], text })
                        return
                      }
                    } catch {
                      // fall through to the X intent
                    }
                    // X cannot accept a file from a web intent, so the video is
                    // downloaded and the composer is opened pre-filled.
                    const a = document.createElement('a')
                    a.href = video
                    a.download = 'cutscene.mp4'
                    a.click()
                    const url = new URL('https://x.com/intent/tweet')
                    url.searchParams.set('text', `${text}\n${window.location.origin}`)
                    window.open(url.toString(), '_blank', 'noopener,noreferrer')
                  }}
                  style={skewButton('var(--accent)')}
                >
                  <span style={{ display: 'inline-block', transform: 'skewX(9deg)' }}>Share</span>
                </button>
              </div>

              <ThemeRail themes={THEMES} value={theme} onChange={switchTheme} busy={swapping} />

              <button
                onClick={() => {
                  setPhase('idle')
                  setVideo(null)
                  setShots([null, null, null])
                }}
                style={{
                  fontSize: 11.5,
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-soft)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 5,
                }}
              >
                Start another job
              </button>
            </div>
          )}

          {/* ---------------- failure ---------------- */}
          {phase === 'failed' && (
            <div style={{ textAlign: 'center', marginTop: 30, maxWidth: 440 }}>
              <MissionBanner title="Wasted" tone="gold" />
              <p style={{ margin: '18px 0 22px', color: 'var(--ink)', fontSize: 15.5, fontWeight: 560 }}>
                {error}
              </p>
              <p style={{ margin: '0 0 24px', color: 'var(--ink-soft)', fontSize: 14 }}>
                Nothing was charged. A clear, front-facing photo usually fixes it.
              </p>
              <button onClick={() => setPhase('idle')} style={skewButton('var(--accent)')}>
                <span style={{ display: 'inline-block', transform: 'skewX(9deg)' }}>Try again</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
