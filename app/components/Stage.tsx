'use client'

import { useEffect, useRef, useState } from 'react'

export type StageState = 'hero' | 'card' | 'result'

/** Base box, 4:3. Every state is a scale of this, so the morph is one
 *  GPU-accelerated transform rather than an animated layout. */
const BASE_W = 760
const BASE_H = 570
const CARD_W = 400

interface Props {
  state: StageState
  /** Swapped in once the user's video exists. */
  src: string
  poster?: string
  controls?: boolean
  children?: React.ReactNode
}

function useScales() {
  const [scales, setScales] = useState({ hero: 1.6, card: 0.5, result: 1 })

  useEffect(() => {
    const measure = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const fit = Math.min((vw - 32) / BASE_W, (vh - 260) / BASE_H, 1)
      setScales({
        // Cover the viewport, plus a little so the edges never show.
        hero: Math.max(vw / BASE_W, vh / BASE_H) * 1.08,
        card: Math.min(CARD_W, vw - 64) / BASE_W,
        result: Math.max(fit, 0.42),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return scales
}

export function Stage({ state, src, poster, controls = false, children }: Props) {
  const scales = useScales()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scale = scales[state]

  // Reload when the source swaps from the reference to the user's cutscene.
  useEffect(() => {
    videoRef.current?.load()
  }, [src])

  return (
    <div
      aria-hidden={state === 'hero'}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        width: BASE_W,
        height: BASE_H,
        marginLeft: -BASE_W / 2,
        marginTop: state === 'hero' ? -BASE_H / 2 : -BASE_H / 2 - 20,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        transition: `transform var(--morph) var(--ease), border-radius var(--morph) var(--ease), box-shadow var(--morph) var(--ease), filter 600ms var(--ease), margin-top var(--morph) var(--ease)`,
        borderRadius: state === 'hero' ? 0 : 'calc(var(--r-xl) / var(--stage-scale, 1))',
        overflow: 'hidden',
        zIndex: state === 'hero' ? 0 : 2,
        boxShadow: state === 'hero' ? 'none' : 'var(--shadow-lg)',
        filter: state === 'hero' ? 'saturate(1.1) contrast(1.05) brightness(0.85)' : 'none',
        background: '#08080c',
        willChange: 'transform',
        // Keep the corner radius visually constant through the scale.
        ['--stage-scale' as string]: String(scale),
      }}
    >
      <video
        ref={videoRef}
        poster={poster}
        autoPlay
        muted={!controls}
        loop
        playsInline
        controls={controls}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      >
        <source src={src} />
      </video>

      {/* Scrim: only while the video is behind the page content. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(130% 100% at 50% 38%, rgba(8,8,12,.42) 0%, rgba(8,8,12,.72) 48%, rgba(8,8,12,.93) 100%)',
          opacity: state === 'hero' ? 1 : 0,
          transition: 'opacity 700ms var(--ease)',
        }}
      />

      {children}
    </div>
  )
}

export { BASE_W, BASE_H }
