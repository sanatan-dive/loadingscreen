'use client'

import { useRef, useState } from 'react'

export interface ThemeOption {
  id: string
  label: string
  cue: string
}

interface Props {
  themes: ThemeOption[]
  value: string
  onChange: (id: string) => void
  busy?: boolean
}

export function ThemeRail({ themes, value, onChange, busy }: Props) {
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const preview = (t: ThemeOption, e: React.MouseEvent) => {
    e.stopPropagation()
    audioRef.current?.pause()
    if (playing === t.id) {
      setPlaying(null)
      return
    }
    const a = new Audio(t.cue)
    a.volume = 0.85
    a.play().catch(() => {})
    a.onended = () => setPlaying(null)
    audioRef.current = a
    setPlaying(t.id)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme music"
      style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}
    >
      {themes.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={active}
            disabled={busy}
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '10px 14px 10px 11px',
              borderRadius: 999,
              background: active ? 'var(--ink)' : 'var(--surface)',
              color: active ? '#fff' : 'var(--ink)',
              border: `1.5px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
              boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-sm)',
              fontSize: 14.5,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              transition: 'all 220ms var(--ease)',
              opacity: busy ? 0.55 : 1,
            }}
          >
            <span
              onClick={(e) => preview(t, e)}
              aria-label={`Preview ${t.label}`}
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                background: active ? 'rgba(255,255,255,.18)' : 'var(--bg-warm)',
              }}
            >
              {playing === t.id ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="1.5" y="1" width="3" height="10" rx="1" />
                  <rect x="7.5" y="1" width="3" height="10" rx="1" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2.5 1.3v9.4a.6.6 0 0 0 .92.5l7.2-4.7a.6.6 0 0 0 0-1L3.42.8a.6.6 0 0 0-.92.5Z" />
                </svg>
              )}
            </span>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
