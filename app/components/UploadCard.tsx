'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

export function UploadCard({ onFile, disabled }: Props) {
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = useCallback(
    (file: File | undefined | null) => {
      setError(null)
      if (!file) return
      if (!ACCEPTED.includes(file.type)) {
        setError('That needs to be a photo — PNG, JPEG or WebP.')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("That photo's over 10MB. Try a smaller one.")
        return
      }
      onFile(file)
    },
    [onFile]
  )

  // Paste-to-upload: faster than any file picker.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      if (item) accept(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [accept])

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
          accept(e.dataTransfer.files?.[0])
        }}
        style={{
          width: '100%',
          display: 'block',
          padding: '30px 26px',
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
              width: 56,
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
              stroke="#fff"
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
            }}
          >
            Drop your photo in
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
            or tap to choose · paste works
          </div>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        capture="user"
        hidden
        onChange={(e) => accept(e.target.files?.[0])}
      />

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
    </div>
  )
}
