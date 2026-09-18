import { describe, it, expect } from 'vitest'
import { headBox, featherMask, openEdges } from '@/lib/composite'
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
  const w = 200, h = 260
  const m = featherMask(w, h)
  const at = (x: number, y: number) => m[y * w + x]

  it('is fully opaque across the centre', () => {
    expect(at(w / 2, h / 2)).toBe(1)
  })

  // The forehead sits in the upper third. The old elliptical mask cut across
  // it, cross-fading generated hair into original hair and smearing the
  // hairline. That whole region must now come wholly from the generated head.
  it('is fully opaque across the forehead and hairline', () => {
    for (const fy of [0.16, 0.22, 0.3, 0.38]) {
      for (const fx of [0.3, 0.5, 0.7]) {
        expect(at(Math.round(w * fx), Math.round(h * fy)), `x=${fx} y=${fy}`).toBe(1)
      }
    }
  })

  it('feathers interior edges', () => {
    expect(at(0, Math.round(h / 2))).toBe(0)
    expect(at(w - 1, Math.round(h / 2))).toBe(0)
    expect(at(Math.round(w / 2), 0)).toBe(0)
    expect(at(Math.round(w / 2), h - 1)).toBe(0)
  })

  // The head box is routinely clamped to the top of the frame. Feathering
  // there faded generated hair into original hair across the topmost rows and
  // produced a flat-topped head.
  it('stays opaque on an edge clamped to the frame boundary', () => {
    const clamped = featherMask(w, h, { top: false, right: true, bottom: true, left: true })
    const atC = (x: number, y: number) => clamped[y * w + x]
    expect(atC(Math.round(w / 2), 0)).toBe(1)
    expect(atC(Math.round(w / 2), 5)).toBe(1)
    // other edges still feather
    expect(atC(0, Math.round(h / 2))).toBe(0)
  })

  it('is fully opaque when every edge is clamped', () => {
    const none = featherMask(40, 40, { top: false, right: false, bottom: false, left: false })
    expect(none.every((v) => v === 1)).toBe(true)
  })

  it('rises monotonically inward from the edge', () => {
    const y = Math.round(h / 2)
    let prev = -1
    for (let x = 0; x < 30; x++) {
      const v = at(x, y)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('stays within [0,1]', () => {
    for (const v of m) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('openEdges', () => {
  it('marks a box clamped to the frame top as closed', () => {
    const e = openEdges({ x0: 10, y0: 0, x1: 500, y1: 400 }, 960, 720)
    expect(e.top).toBe(false)
    expect(e.left).toBe(true)
    expect(e.bottom).toBe(true)
  })

  it('marks a fully interior box as open on all sides', () => {
    expect(openEdges({ x0: 10, y0: 10, x1: 500, y1: 400 }, 960, 720)).toEqual({
      top: true, left: true, right: true, bottom: true,
    })
  })

  it('handles a box clamped on every side', () => {
    expect(openEdges({ x0: 0, y0: 0, x1: 960, y1: 720 }, 960, 720)).toEqual({
      top: false, left: false, right: false, bottom: false,
    })
  })
})
