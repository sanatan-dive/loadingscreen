import { describe, it, expect, vi } from 'vitest'
import { swapShot } from '@/lib/pipeline'
import { getTemplate } from '@/lib/template'

const shot = getTemplate('gta-redcarpet').shots[0]
const facePng = () => require('node:fs').readFileSync('tests/fixtures/user.png')

const fakeImage = async () =>
  (await import('node:fs/promises')).readFile('assets/templates/gta-redcarpet/shot_1.png')

describe('swapShot escalation', () => {
  it('climbs the ladder when the gate rejects', async () => {
    const tried: string[] = []
    const edit = vi.fn(async ({ model }: any) => {
      tried.push(model)
      return { image: await fakeImage(), model, ms: 10, costUsd: 0.0342 }
    })
    const verdicts = [
      { pass: false, reason: 'low', vsUser: 0.2, vsOriginal: 0.1 },
      { pass: false, reason: 'low', vsUser: 0.3, vsOriginal: 0.1 },
      { pass: true, vsUser: 0.8, vsOriginal: 0.1 },
    ]
    const verify = vi.fn(() => verdicts.shift()!)

    const r = await swapShot(
      { shot, facePng: facePng(), userEmbedding: null },
      { edit: edit as any, verify: verify as any }
    )
    expect(tried).toEqual([
      'google/gemini-3.1-flash-lite-image',
      'google/gemini-3-pro-image',
    ])
    expect(r.ok).toBe(false)   // only two rungs; the third verdict never runs
    expect(r.attempts).toBe(2)
  }, 30_000)

  it('stops at the first model when it passes - no wasted spend', async () => {
    const edit = vi.fn(async ({ model }: any) => ({
      image: await fakeImage(), model, ms: 10, costUsd: 0.0342,
    }))
    const verify = vi.fn(() => ({ pass: true, vsUser: 0.8, vsOriginal: 0.1 }))
    const r = await swapShot(
      { shot, facePng: facePng(), userEmbedding: null },
      { edit: edit as any, verify: verify as any }
    )
    expect(edit).toHaveBeenCalledTimes(1)
    expect(r.costUsd).toBeCloseTo(0.0342)
  }, 30_000)

  it('gives up after exhausting the ladder and does NOT charge', async () => {
    const edit = vi.fn(async ({ model }: any) => ({
      image: await fakeImage(), model, ms: 1, costUsd: 0.0342,
    }))
    const verify = vi.fn(() => ({ pass: false, reason: 'low', vsUser: 0.1, vsOriginal: 0.05 }))
    const r = await swapShot(
      { shot, facePng: facePng(), userEmbedding: null },
      { edit: edit as any, verify: verify as any }
    )
    expect(r.ok).toBe(false)
    expect(r.charged).toBe(false)
    expect(edit).toHaveBeenCalledTimes(2)
  }, 30_000)

  it('survives a provider throwing and still escalates', async () => {
    let n = 0
    const edit = vi.fn(async ({ model }: any) => {
      if (n++ === 0) throw new Error('network blew up')
      return { image: await fakeImage(), model, ms: 1, costUsd: 0.0342 }
    })
    const verify = vi.fn(() => ({ pass: true, vsUser: 0.8, vsOriginal: 0.1 }))
    const r = await swapShot(
      { shot, facePng: facePng(), userEmbedding: null },
      { edit: edit as any, verify: verify as any }
    )
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(2)
  }, 30_000)
})
