'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { extractImage, shrinkForUpload, IntakeError, ACCEPTED_TYPES } from '@/lib/image-intake'
import { CameraCapture } from './CameraCapture'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

export function UploadCard({ onFile, disabled }: Props) {
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [mac, setMac] = useState(false)
  const [camera, setCamera] = useState(false)
  const [hasCamera, setHasCamera] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform))
    // Only offer the camera where it can actually work — secure context,
    // getUserMedia available, and a video input present.
    const supported =
      typeof navigator.mediaDevices?.getUserMedia === 'function' && window.isSecureContext
    if (!supported) return
    navigator.mediaDevices
      .enumerateDevices()
      .then((d) => setHasCamera(d.some((x) => x.kind === 'videoinput')))
      .catch(() => setHasCamera(false))
  }, [])

  const accept = useCallback(
    async (dt: DataTransfer | null, source: 'paste' | 'drop') => {
      setError(null)
      try {
        const file = await extractImage(dt)
        if (!file) return
        // Acknowledge before the flow takes over — otherwise a paste feels
        // like nothing happened at all.
        setFlash(source === 'paste' ? 'Pasted' : 'Got it')
        onFile(await shrinkForUpload(file))
      } catch (err) {
        setError(err instanceof IntakeError ? err.message : 'Could not read that image.')
      }
    },
    [onFile]
  )

  const acceptFile = useCallback(
    async (file: File | undefined | null) => {
      setError(null)
      if (!file) return
      if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
        setError('That needs to be a photo — PNG, JPEG or WebP.')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("That photo's over 10MB. Try a smaller one.")
        return
      }
      onFile(await shrinkForUpload(file))
    },
    [onFile]
  )

  // Paste anywhere on the page. Ignored while a job runs, or a stray Cmd+V
  // would kick off a second generation.
  useEffect(() => {
    if (disabled) return
    const onPaste = (e: ClipboardEvent) => {
      void accept(e.clipboardData, 'paste')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [accept, disabled])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1400)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <div style={{ width: '100%', maxWidth: 480 }}>
      <button
        data-testid="dropzone"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void accept(e.dataTransfer, 'drop')
        }}
        style={{
          width: '100%',
          display: 'block',
          padding: 'var(--card-pad)',
          transform: over ? 'skewX(-7deg) translate(-3px,-3px)' : 'skewX(-7deg)',
          background: over ? 'var(--accent-soft)' : 'rgba(20,20,29,.82)',
          border: '3px solid var(--accent)',
          borderRadius: 3,
          boxShadow: over ? '12px 12px 0 var(--accent)' : '8px 8px 0 var(--accent-deep)',
          backdropFilter: 'blur(12px)',
          transition: 'all 180ms var(--ease)',
          textAlign: 'center',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{ transform: 'skewX(7deg)' }}>
          <div
            aria-hidden
            style={{
              width: 'var(--card-icon)',
              height: 56,
              margin: '0 auto 16px',
              background: 'var(--accent)',
              display: 'grid',
              placeItems: 'center',
              transform: 'rotate(-4deg)',
              boxShadow: '4px 4px 0 var(--accent-deep)',
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#08080c"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4M12 4 6 10M12 4l6 6" />
              <path d="M4 18v2h16v-2" />
            </svg>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-display), Impact, sans-serif',
              fontSize: 27,
              letterSpacing: '0.01em',
              textTransform: 'uppercase',
              color: flash ? 'var(--accent)' : 'var(--ink)',
              transition: 'color 200ms var(--ease)',
            }}
          >
            {flash ?? 'Drop your photo in'}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-soft)',
            }}
          >
            tap to choose · or paste with {mac ? '⌘V' : 'Ctrl+V'}
          </div>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        hidden
        onChange={(e) => void acceptFile(e.target.files?.[0])}
      />

      {hasCamera && (
        <button
          onClick={() => setCamera(true)}
          disabled={disabled}
          style={{
            width: '100%',
            marginTop: 14,
            padding: '13px 20px',
            transform: 'skewX(-7deg)',
            background: 'transparent',
            border: '2px solid var(--line)',
            borderRadius: 3,
            color: 'var(--ink-soft)',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            transition: 'all 180ms var(--ease)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--ink)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--line)'
            e.currentTarget.style.color = 'var(--ink-soft)'
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(7deg)' }}>
            Or take a photo now
          </span>
        </button>
      )}

      {camera && (
        <CameraCapture
          onClose={() => setCamera(false)}
          onCapture={(file) => {
            setCamera(false)
            setFlash('Got it')
            onFile(file)
          }}
        />
      )}

      {error && (
        <p
          role="alert"
          style={{
            margin: '18px 2px 0',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            textAlign: 'center',
          }}
        >
          {error}
        </p>
      )}

      <p
        style={{
          margin: '20px 2px 0',
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          lineHeight: 1.6,
          textAlign: 'center',
        }}
      >
        Front-facing works best · deleted after
      </p>

      {/* Consent, stated rather than checkboxed: a tick-to-continue in front of
          a one-button product is the kind of setting this app exists to not
          have, and uploading is the affirmative act. Set in sentence case
          rather than the surrounding wide-tracked uppercase because it is a
          sentence someone has to actually read, not a label to glance at. */}
      <p
        style={{
          margin: '9px 2px 0',
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.5,
          color: 'var(--ink-soft)',
          textAlign: 'center',
        }}
      >
        By uploading, you confirm it&rsquo;s you &mdash; or someone who agreed.
      </p>
    </div>
  )
}
