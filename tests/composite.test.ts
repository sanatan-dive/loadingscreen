import { describe, it, expect } from 'vitest'
import { headBox, featherMask } from '@/lib/composite'
import type { Face } from '@/lib/identity'

const face: Face = { x: 300, y: 100, w: 200, h: 200, landmarks: [], score: 0.99 }

describe('headBox', () => {
  it('includes hair above and neck below the face box', () => {
    const b = headBox(face, 960, 720)
    expect(b.y0).toBeLessThan(face.y)
    expect(b.y1).toBeGreaterThan(face.y + face.h)
  })

  it('extends further down than up, to capture the neck', () => {
    const b = headBox(face, 2000, 2000)
    const cy = face.y + face.h / 2
    expect(cy - b.y0).toBeLessThan(b.y1 - cy)
  })

  it('never leaves the frame', () => {
    const tl = headBox({ ...face, x: 5, y: 5 }, 960, 720)
    expect(tl.x0).toBeGreaterThanOrEqual(0)
    expect(tl.y0).toBeGreaterThanOrEqual(0)
    const br = headBox({ ...face, x: 900, y: 650 }, 960, 720)
    expect(br.x1).toBeLessThanOrEqual(960)
    expect(br.y1).toBeLessThanOrEqual(720)
  })
})

describe('featherMask', () => {
  const w = 100, h = 100
  const m = featherMask(w, h)

  it('is opaque at the centre', () => {
    expect(m[Math.round(h * 0.46) * w + 50]).toBeGreaterThan(0.95)
  })

  it('is transparent at the corners so there is no visible seam', () => {
    expect(m[0]).toBeLessThan(0.05)
    expect(m[w - 1]).toBeLessThan(0.05)
    expect(m[(h - 1) * w]).toBeLessThan(0.05)
  })

  it('falls off monotonically from centre to edge', () => {
    const row = Math.round(h * 0.46)
    const centre = m[row * w + 50]
    const mid = m[row * w + 75]
    const edge = m[row * w + 99]
    expect(centre).toBeGreaterThanOrEqual(mid)
    expect(mid).toBeGreaterThanOrEqual(edge)
  })

  it('stays within [0,1]', () => {
    for (const v of m) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of m) expect(v).toBeLessThanOrEqual(1)
  })
})
