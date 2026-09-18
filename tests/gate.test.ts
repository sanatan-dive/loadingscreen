import { describe, it, expect } from 'vitest'
import { verify } from '@/lib/gate'

describe('gate', () => {
  it('passes a confident match', () => {
    expect(verify({ vsUser: 0.786, vsOriginal: 0.09 }).pass).toBe(true)
  })

  it('catches the silent no-op observed in the spike', () => {
    const r = verify({ vsUser: 0.254, vsOriginal: 0.884 })
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/original/i)
  })

  it('catches a generic third person - neither user nor original', () => {
    const r = verify({ vsUser: 0.246, vsOriginal: 0.074 })
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/below threshold/i)
  })

  it('rejects an undetectable result', () => {
    const r = verify({ vsUser: NaN, vsOriginal: NaN })
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/no face/i)
  })

  it('rejects the 0.476 borderline that looked wrong to a human', () => {
    expect(verify({ vsUser: 0.476, vsOriginal: 0.2 }).pass).toBe(false)
  })

  it('passes every score the spike accepted', () => {
    for (const s of [0.786, 0.669, 0.903, 0.799, 0.862, 0.74]) {
      expect(verify({ vsUser: s, vsOriginal: 0.2 }).pass, String(s)).toBe(true)
    }
  })
})
