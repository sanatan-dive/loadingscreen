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

  it('feathers only at the crop boundary', () => {
    expect(at(0, Math.round(h / 2))).toBe(0)
    expect(at(w - 1, Math.round(h / 2))).toBe(0)
    expect(at(Math.round(w / 2), 0)).toBe(0)
    expect(at(Math.round(w / 2), h - 1)).toBe(0)
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
