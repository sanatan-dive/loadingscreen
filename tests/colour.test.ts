import { describe, it, expect } from 'vitest'
import { borderStats, matchColour } from '@/lib/composite'
import type { RawImage } from '@/lib/identity'

function solid(w: number, h: number, bgr: [number, number, number]): RawImage {
  const buf = new Uint8Array(w * h * 3)
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = bgr[0]; buf[i + 1] = bgr[1]; buf[i + 2] = bgr[2]
  }
  return { bgr: buf, width: w, height: h }
}

function noisy(w: number, h: number, base: number, spread: number): RawImage {
  const buf = new Uint8Array(w * h * 3)
  let seed = 7
  for (let i = 0; i < buf.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    buf[i] = Math.max(0, Math.min(255, base + ((seed % 1000) / 1000 - 0.5) * spread))
  }
  return { bgr: buf, width: w, height: h }
}

describe('borderStats', () => {
  it('reads the border, ignoring a wildly different interior', () => {
    const img = solid(100, 100, [40, 40, 40])
    // paint a bright interior — a face would differ legitimately
    for (let y = 30; y < 70; y++) {
      for (let x = 30; x < 70; x++) {
        const i = (y * 100 + x) * 3
        img.bgr[i] = 240; img.bgr[i + 1] = 240; img.bgr[i + 2] = 240
      }
    }
    const s = borderStats(img, 10)
    expect(s.mean[0]).toBeCloseTo(40, 0)
  })
})

describe('matchColour', () => {
  it('shifts a too-bright paste down to the frame it lands in', () => {
    const generated = noisy(80, 80, 150, 30)
    const frame = noisy(80, 80, 100, 30)
    const fixed = matchColour(generated, borderStats(generated, 8), borderStats(frame, 8))
    const before = Math.abs(borderStats(generated, 8).mean[0] - borderStats(frame, 8).mean[0])
    const after = Math.abs(borderStats(fixed, 8).mean[0] - borderStats(frame, 8).mean[0])
    expect(after).toBeLessThan(before / 4)
  })

  it('corrects each channel independently, so white balance is fixed too', () => {
    const generated = solid(60, 60, [120, 100, 80])
    const frame = solid(60, 60, [80, 100, 120])
    const fixed = matchColour(generated, borderStats(generated, 6), borderStats(frame, 6))
    const m = borderStats(fixed, 6).mean
    expect(m[0]).toBeCloseTo(80, 0)
    expect(m[2]).toBeCloseTo(120, 0)
  })

  it('is a no-op when the two already agree', () => {
    const img = noisy(50, 50, 120, 20)
    const s = borderStats(img, 6)
    const same = matchColour(img, s, s)
    for (let i = 0; i < img.bgr.length; i += 331) {
      expect(Math.abs(same.bgr[i] - img.bgr[i])).toBeLessThanOrEqual(1)
    }
  })

  it('clamps extreme gain rather than wrecking the image', () => {
    // Border samples disagreeing this hard means something other than
    // exposure; forcing the match would blow out the result.
    const flat = solid(40, 40, [128, 128, 128])
    const wild = { mean: [128, 128, 128] as [number, number, number], std: [200, 200, 200] as [number, number, number] }
    const fixed = matchColour(flat, borderStats(flat, 5), wild)
    for (let i = 0; i < fixed.bgr.length; i += 97) {
      expect(fixed.bgr[i]).toBeGreaterThan(60)
      expect(fixed.bgr[i]).toBeLessThan(200)
    }
  })

  it('never produces out-of-range values', () => {
    const img = noisy(40, 40, 200, 80)
    const target = { mean: [255, 255, 255] as [number, number, number], std: [1, 1, 1] as [number, number, number] }
    const fixed = matchColour(img, borderStats(img, 5), target)
    for (const v of fixed.bgr) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })
})
