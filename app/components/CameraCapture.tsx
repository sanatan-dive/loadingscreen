'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (file: File) => void
  onClose: () => void
}

/**
 * Live camera capture. Uses getUserMedia so the shot is framed in-page with a
 * face guide — a plain <input capture> hands off to the OS camera and gives us
 * no chance to tell the user "get your whole head in frame", which is the
 * single biggest cause of a failed generation.
 */
export function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [ready, setReady] = useState(false)
  const [flash, setFlash] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      setReady(false)
      setError(null)
      stop()
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch (err) {
        const name = err instanceof Error ? err.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser, or choose a photo instead.'
            : name === 'NotFoundError'
              ? 'No camera found on this device.'
              : 'Could not start the camera. Choose a photo instead.'
        )
      }
    }

    void start()
    return () => {
      cancelled = true
      stop()
    }
  }, [facing, stop])

  // Escape closes, as people expect from a full-screen layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const shoot = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    // Square centre crop — matches how the template frames a head.
    const size = Math.min(video.videoWidth, video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (facing === 'user') {
      // Un-mirror: the preview is flipped so it feels like a mirror, but a
      // saved selfie should not be.
      ctx.translate(size, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(
      video,
      (video.videoWidth - size) / 2,
      (video.videoHeight - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size
    )

    setFlash(true)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        stop()
        onCapture(new File([blob], 'camera.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92
    )
  }, [facing, onCapture, stop])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: '#08080c',
        display: 'grid',
        gridTemplateRows: '1fr auto',
      }}
    >
      {/*
        The preview is a SQUARE, because shoot() keeps a square centre crop of
        the raw frame. Shown full-width it lied: on a 1280x720 webcam the shot
        is only the middle 56% of what the preview displayed, so a face framed
        inside the guide could still be cropped away. A square box with
        object-fit: cover crops the source exactly the way the canvas does, so
        what is inside this box is what gets captured.
      */}
      <div style={{ position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        <div
          style={{
            position: 'relative',
            aspectRatio: '1 / 1',
            height: 'min(100%, 100vw)',
            maxWidth: '100%',
            overflow: 'hidden',
            background: '#000',
          }}
        >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: facing === 'user' ? 'scaleX(-1)' : 'none',
            opacity: ready ? 1 : 0,
            transition: 'opacity 400ms var(--ease)',
          }}
        />

        {/* Face guide — the framing that actually generates well. */}
        {ready && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                // Relative to the square preview, which is the captured region.
                width: '58%',
                aspectRatio: '3 / 4',
                border: '3px dashed rgba(255,176,31,.85)',
                borderRadius: '48% 48% 46% 46%',
                boxShadow: '0 0 0 100vmax rgba(8,8,12,.45)',
              }}
            />
            <p
              style={{
                position: 'absolute',
                bottom: 22,
                margin: 0,
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,.85)',
              }}
            >
              Whole head in the frame · look at the lens
            </p>
          </div>
        )}

        {flash && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: '#fff',
              animation: 'shutter 320ms ease-out both',
            }}
          />
        )}

        </div>

        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              padding: 26,
              textAlign: 'center',
            }}
          >
            <p role="alert" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15, lineHeight: 1.6 }}>
              {error}
            </p>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 22px calc(20px + env(safe-area-inset-bottom))',
          gap: 16,
        }}
      >
        <button
          onClick={onClose}
          style={{
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--ink-soft)',
          }}
        >
          Cancel
        </button>

        <button
          onClick={shoot}
          disabled={!ready}
          aria-label="Take photo"
          style={{
            width: 74,
            height: 74,
            borderRadius: '50%',
            background: ready ? 'var(--accent)' : 'var(--line)',
            border: '5px solid #08080c',
            boxShadow: ready ? '0 0 0 4px var(--accent)' : 'none',
            transition: 'all 200ms var(--ease)',
          }}
        />

        <button
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          aria-label="Switch camera"
          style={{
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--ink-soft)',
          }}
        >
          Flip
        </button>
      </div>

      <style>{`
        @keyframes shutter { from { opacity: .95 } to { opacity: 0 } }
      `}</style>
    </div>
  )
}
