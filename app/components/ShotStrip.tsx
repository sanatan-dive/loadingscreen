'use client'

interface Props {
  /** One entry per shot: an object URL once it lands, null while pending. */
  shots: (string | null)[]
}

/**
 * The signature moment. Three frames fill with the user's face as each swap
 * resolves. Deliberately shows the actual work instead of a percentage —
 * watching yourself appear three times is the best part of the wait.
 */
export function ShotStrip({ shots }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        padding: 10,
        background: 'rgba(8,8,12,.88)',
        backdropFilter: 'blur(18px)',
      }}
    >
      {shots.map((src, i) => (
        <div
          key={i}
          data-testid={src ? 'shot-image' : 'shot-placeholder'}
          style={{
            position: 'relative',
            borderRadius: 14,
            overflow: 'hidden',
            background: 'rgba(255,255,255,.05)',
            border: src ? '2px solid var(--accent)' : '2px dashed rgba(255,176,31,.35)',
          }}
        >
          {src ? (
            <img
              src={src}
              alt={`Shot ${i + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                animation: 'shotIn 620ms var(--ease) both',
              }}
            />
          ) : (
            <>
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  zIndex: 1,
                  fontFamily: 'var(--font-display), Impact, sans-serif',
                  fontSize: 34,
                  color: 'rgba(255,176,31,.30)',
                }}
              >
                {i + 1}
              </span>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(100deg, rgba(255,176,31,.04) 30%, rgba(255,176,31,.22) 50%, rgba(255,176,31,.04) 70%)',
                backgroundSize: '220% 100%',
                animation: 'shimmer 1.5s linear infinite',
              }}
            />
            </>
          )}
        </div>
      ))}

      <style>{`
        @keyframes shimmer { from { background-position: 180% 0 } to { background-position: -80% 0 } }
        @keyframes shotIn {
          from { opacity: 0; transform: scale(1.08) }
          to   { opacity: 1; transform: scale(1) }
        }
      `}</style>
    </div>
  )
}
