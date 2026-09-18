'use client'

import { useState } from 'react'
import {
  HAIR_OPTIONS,
  OUTFIT_OPTIONS,
  SKIN_OPTIONS,
  DEFAULT_APPEARANCE,
  type Appearance,
} from '@/lib/appearance'

interface Props {
  value: Appearance
  onChange: (next: Appearance) => void
  disabled?: boolean
}

function Row<T extends string>({
  label,
  options,
  value,
  onPick,
  disabled,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
        }}
      >
        {label}
      </span>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {options.map((o) => {
          const active = o.id === value
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onPick(o.id)}
              style={{
                padding: '8px 13px',
                transform: 'skewX(-7deg)',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#08080c' : 'var(--ink-soft)',
                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 3,
                fontSize: 11.5,
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

export function Options({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const hair = value.hair ?? DEFAULT_APPEARANCE.hair
  const outfit = value.outfit ?? DEFAULT_APPEARANCE.outfit
  const skin = value.skin ?? DEFAULT_APPEARANCE.skin

  const changed = [
    hair !== DEFAULT_APPEARANCE.hair,
    outfit !== DEFAULT_APPEARANCE.outfit,
    skin !== DEFAULT_APPEARANCE.skin,
  ].filter(Boolean).length

  return (
    <div style={{ width: '100%', maxWidth: 480, marginTop: 16 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          padding: '11px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: changed ? 'var(--accent)' : 'var(--ink-faint)',
          transition: 'color 160ms var(--ease)',
        }}
      >
        {open ? 'Hide options' : 'Customize'}
        {changed > 0 && !open && (
          <span
            style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--accent)',
              color: '#08080c',
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            {changed}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            display: 'grid',
            gap: 18,
            padding: '18px 16px',
            marginTop: 4,
            background: 'rgba(20,20,29,.72)',
            border: '1.5px solid var(--line)',
            borderRadius: 3,
            backdropFilter: 'blur(12px)',
            animation: 'optionsIn 260ms var(--ease) both',
          }}
        >
          <Row
            label="Hair"
            options={HAIR_OPTIONS}
            value={hair}
            disabled={disabled}
            onPick={(hair) => onChange({ ...value, hair })}
          />
          <Row
            label="Outfit"
            options={OUTFIT_OPTIONS}
            value={outfit}
            disabled={disabled}
            onPick={(outfit) => onChange({ ...value, outfit })}
          />
          <Row
            label="Skin tone"
            options={SKIN_OPTIONS}
            value={skin}
            disabled={disabled}
            onPick={(skin) => onChange({ ...value, skin })}
          />

          <p
            style={{
              margin: 0,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.08em',
              lineHeight: 1.7,
              color: 'var(--ink-faint)',
            }}
          >
            Defaults keep you as you are. Every change asks the model to redraw more,
            so the likeness drifts a little further each time.
          </p>

          <style>{`
            @keyframes optionsIn {
              from { opacity: 0; transform: translateY(-6px) }
              to   { opacity: 1; transform: translateY(0) }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
