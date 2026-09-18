import { describe, it, expect } from 'vitest'
import { MemoryStore } from '@/lib/store'

describe('store contract', () => {
  it('round-trips a cached shot', async () => {
    const s = new MemoryStore()
    expect(await s.getShot('k')).toBeNull()
    await s.putShot('k', '/tmp/a.png', 0.81)
    expect(await s.getShot('k')).toEqual({ path: '/tmp/a.png', vsUser: 0.81 })
  })

  it('round-trips a cached render', async () => {
    const s = new MemoryStore()
    await s.putRender('r', '/tmp/v.mp4')
    expect(await s.getRender('r')).toBe('/tmp/v.mp4')
  })

  it('accumulates spend for the ceiling check', async () => {
    const s = new MemoryStore()
    expect(await s.spentToday()).toBe(0)
    await s.recordSpend(0.1)
    await s.recordSpend(0.2)
    expect(await s.spentToday()).toBeCloseTo(0.3)
  })

  it('persists rate buckets per subject', async () => {
    const s = new MemoryStore()
    await s.putBucket('ip:1.2.3.4', { tokens: 2, updatedAt: 99 })
    expect(await s.getBucket('ip:1.2.3.4')).toEqual({ tokens: 2, updatedAt: 99 })
    expect(await s.getBucket('ip:5.6.7.8')).toBeNull()
  })
})
