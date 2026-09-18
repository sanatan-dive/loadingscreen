'use client'

/**
 * GTA HUD vocabulary. Pricedown (the real logo face) is licensed, so the
 * wordmark is approximated: heavy condensed + skew + hard black stroke +
 * a warm gradient fill + a hard offset shadow with no blur.
 */

interface PricedownProps {
  children: React.ReactNode
  size?: string
  tone?: 'gold' | 'green' | 'pink' | 'ink' | 'cyan'
  skew?: number
  stroke?: number
  className?: string
}

const TONES: Record<string, string> = {
  gold: 'linear-gradient(180deg,#FFF0C2 4%,#FFC13B 38%,#FF9500 74%,#F97316 100%)',
  green: 'linear-gradient(180deg,#D6F5A8 4%,#8FD14F 40%,#4CAF2E 78%,#2E7D1E 100%)',
  pink: 'linear-gradient(180deg,#FFC7E2 4%,#FF6BAE 40%,#FF2E88 78%,#D4156A 100%)',
  ink: 'linear-gradient(180deg,#FFFFFF 4%,#C9C9DB 58%,#8E8EA6 100%)',
  cyan: 'linear-gradient(180deg,#D6FBFF 4%,#5FEDFF 40%,#21E5FF 76%,#0FA8BF 100%)',
}

export function Pricedown({
  children,
  size = 'clamp(44px, 11vw, 96px)',
  tone = 'gold',
  skew = -5,
  stroke = 3,
  className,
}: PricedownProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        fontFamily: 'var(--font-display), Impact, sans-serif',
        fontSize: size,
        lineHeight: 0.94,
        letterSpacing: '-0.012em',
        textTransform: 'uppercase',
        transform: `skewX(${skew}deg)`,
        filter: `drop-shadow(${stroke * 1.6}px ${stroke * 1.6}px 0 #0B0B0C)`,
      }}
    >
      <span
        style={{
          backgroundImage: TONES[tone],
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: `${stroke}px #0B0B0C`,
          // Stroke behind the fill, or the outline eats the letterforms.
          paintOrder: 'stroke fill',
        }}
      >
        {children}
      </span>
    </span>
  )
}

/** Wanted level. Filled stars are the classic HUD gold. */
export function WantedStars({ level = 3, max = 5 }: { level?: number; max?: number }) {
  return (
    <div
      aria-label={`Wanted level ${level} of ${max}`}
      style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}
    >
      {Array.from({ length: max }).map((_, i) => (
        <svg
          key={i}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          aria-hidden
          style={{
            filter: i < level ? 'drop-shadow(1.5px 1.5px 0 #0B0B0C)' : 'none',
            opacity: i < level ? 1 : 0.22,
          }}
        >
          <path
            d="M12 2.4l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5 6.1 20.6l1.2-6.6L2.5 9.4l6.6-.9z"
            fill={i < level ? '#FFC13B' : '#9A9AA2'}
            stroke="#08080c"
            strokeWidth={i < level ? 1.6 : 1}
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  )
}

/** The green money counter from the corner of the HUD. */
export function MoneyChip({ amount = '$0' }: { amount?: string }) {
  return (
    <span
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: 'var(--green)',
        WebkitTextStroke: '0.7px #08080c',
        textShadow: '0 0 14px rgba(143,209,79,.55)',
      }}
    >
      {amount}
    </span>
  )
}

/** The banner that lands when a mission ends. */
export function MissionBanner({
  title,
  sub,
  tone = 'green',
}: {
  title: string
  sub?: string
  tone?: 'green' | 'gold' | 'pink'
}) {
  return (
    <div style={{ textAlign: 'center', animation: 'missionIn 700ms var(--ease) both' }}>
      <Pricedown size="clamp(30px, 7.5vw, 58px)" tone={tone} stroke={2.6}>
        {title}
      </Pricedown>
      {sub && (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--ink-soft)',
          }}
        >
          {sub}
        </p>
      )}
      <style>{`
        @keyframes missionIn {
          0%   { opacity: 0; transform: translateY(14px) scale(.94) }
          60%  { opacity: 1; transform: translateY(0) scale(1.03) }
          100% { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
    </div>
  )
}

/** Slanted HUD label, like the mission-name strip. */
export function HudTag({ children, tone = 'var(--accent)' }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        transform: 'skewX(-9deg)',
        background: tone,
        color: '#08080c',
        padding: '6px 13px',
        fontSize: 11.5,
        fontWeight: 800,
        letterSpacing: '0.17em',
        textTransform: 'uppercase',
        boxShadow: '3px 3px 0 #08080c',
      }}
    >
      <span style={{ display: 'inline-block', transform: 'skewX(9deg)' }}>{children}</span>
    </span>
  )
}
