'use client'

import { useEffect, useRef, useState } from 'react'
import {
  HAIR_OPTIONS,
  OUTFIT_OPTIONS,
  SKIN_OPTIONS,
  DEFAULT_APPEARANCE,
  type Appearance,
} from '@/lib/appearance'

function Row<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}
      >
        {label}
      </span>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const active = o.id === value
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={active}
              onClick={() => onPick(o.id)}
              style={{
                padding: '10px 15px',
                transform: 'skewX(-7deg)',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#08080c' : 'var(--ink-soft)',
                border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 3,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                transition: 'all 160ms var(--ease)',
              }}
            >
              <span style={{ display: 'inline-block', transform: 'skewX(7deg)' }}>{o.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function countChanges(a: Appearance): number {
  return [
    (a.hair ?? DEFAULT_APPEARANCE.hair) !== DEFAULT_APPEARANCE.hair,
    (a.outfit ?? DEFAULT_APPEARANCE.outfit) !== DEFAULT_APPEARANCE.outfit,
    (a.skin ?? DEFAULT_APPEARANCE.skin) !== DEFAULT_APPEARANCE.skin,
  ].filter(Boolean).length
}

/** Trigger only — deliberately loud, because people were not finding it. */
export function CustomizeButton({
  onClick,
  count,
}: {
  onClick: () => void
  count: number
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        maxWidth: 480,
        marginTop: 14,
        padding: '15px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        transform: 'skewX(-7deg)',
        background: 'transparent',
        border: '2.5px solid var(--accent)',
        borderRadius: 3,
        boxShadow: '5px 5px 0 var(--accent-deep)',
        color: 'var(--accent)',
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        transition: 'all 160ms var(--ease)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, transform: 'skewX(7deg)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2.2" />
          <circle cx="10" cy="17" r="2.2" />
        </svg>
        Hair · Outfit · Skin
        {count > 0 && (
          <span
            style={{
              minWidth: 20,
              height: 20,
              padding: '0 6px',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--accent)',
              color: '#08080c',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {count}
          </span>
        )}
      </span>
    </button>
  )
}

export function OptionsDialog({
  value,
  onChange,
  onClose,
}: {
  value: Appearance
  onChange: (next: Appearance) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Appearance>(value)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // The dialog scrolls itself; the page behind it must not.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const apply = () => {
    onChange(draft)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Customize your look"
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(8,8,12,.78)',
        backdropFilter: 'blur(10px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        animation: 'fadeIn 200ms var(--ease) both',
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: 'min(86dvh, 720px)',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '3px solid var(--accent)',
          borderRadius: 4,
          boxShadow: '12px 12px 0 var(--accent-deep)',
          padding: '24px 22px',
          display: 'grid',
          gap: 22,
          animation: 'popIn 260ms var(--ease) both',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display), Impact, sans-serif',
              fontSize: 26,
              textTransform: 'uppercase',
              letterSpacing: '0.01em',
            }}
          >
            Customize
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
            }}
          >
            Esc
          </button>
        </div>

        <Row label="Hair" options={HAIR_OPTIONS} value={draft.hair ?? DEFAULT_APPEARANCE.hair} onPick={(hair) => setDraft({ ...draft, hair })} />
        <Row label="Outfit" options={OUTFIT_OPTIONS} value={draft.outfit ?? DEFAULT_APPEARANCE.outfit} onPick={(outfit) => setDraft({ ...draft, outfit })} />
        <Row label="Skin tone" options={SKIN_OPTIONS} value={draft.skin ?? DEFAULT_APPEARANCE.skin} onPick={(skin) => setDraft({ ...draft, skin })} />

        <p
          style={{
            margin: 0,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            lineHeight: 1.7,
            color: 'var(--ink-faint)',
          }}
        >
          Defaults keep you as you are. Every change asks the model to redraw more,
          so the likeness drifts a little further each time.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setDraft({})}
            style={{
              padding: '13px 18px',
              transform: 'skewX(-7deg)',
              border: '2px solid var(--line)',
              borderRadius: 3,
              color: 'var(--ink-soft)',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(7deg)' }}>Reset</span>
          </button>
          <button
            onClick={apply}
            style={{
              flex: 1,
              padding: '13px 18px',
              transform: 'skewX(-7deg)',
              background: 'var(--accent)',
              borderRadius: 3,
              boxShadow: '4px 4px 0 #08080c',
              color: '#08080c',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(7deg)' }}>Done</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn {
          from { opacity: 0; transform: translateY(10px) scale(.97) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
    </div>
  )
}
