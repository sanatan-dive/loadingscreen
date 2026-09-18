import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { getTemplate, getTheme, TIMING } from '@/lib/template'

describe('template', () => {
  const t = getTemplate('gta-redcarpet')

  it('has exactly three shots', () => {
    expect(t.shots).toHaveLength(3)
  })

  it('every shot file exists on disk', () => {
    for (const s of t.shots) expect(existsSync(s.file), s.file).toBe(true)
  })

  it('every theme file exists on disk', () => {
    for (const th of t.themes) expect(existsSync(th.file), th.file).toBe(true)
  })

  it('every expression states magnitude, not just type', () => {
    // The spike proved over-asking on expression collapses identity.
    for (const s of t.shots) {
      expect(s.expression.length).toBeGreaterThan(60)
      expect(s.expression).toMatch(/closed-mouth|open smile|teeth|smirk/i)
    }
  })

  it('timing produces exactly 15 seconds', () => {
    expect(TIMING.shotDuration * 3 - TIMING.crossfade * 2).toBeCloseTo(15.0, 6)
  })

  it('crossfade offsets match the measured reference', () => {
    const [a, b] = TIMING.offsets()
    expect(a).toBeCloseTo(4.667, 3)
    expect(b).toBeCloseTo(9.333, 3)
  })

  it('pan headroom exceeds the distance travelled', () => {
    const travel = TIMING.panPxPerSec * TIMING.shotDuration
    expect(TIMING.panSourceWidth - TIMING.width).toBeGreaterThan(travel)
  })

  it('rejects unknown templates and themes', () => {
    expect(() => getTemplate('nope')).toThrow(/unknown template/)
    expect(() => getTheme(t, 'nope')).toThrow(/unknown theme/)
  })
})
