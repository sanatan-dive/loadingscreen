import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { generate } from '@/lib/pipeline'

const SHOT_MS = 400

/**
 * Three shots must be swapped concurrently, not one after another. If this
 * regresses, every user waits 3x longer and nobody would notice from the UI —
 * the shots would simply trickle in.
 */
describe('shots are generated in parallel', () => {
  it('overlaps all three provider calls', async () => {
    const active: number[] = []
    let inFlight = 0
    let firstStart = 0
    let lastEnd = 0

    const edit = vi.fn(async ({ model }: any) => {
      inFlight++
      active.push(inFlight)
      firstStart ||= Date.now()
      await new Promise((r) => setTimeout(r, SHOT_MS))
      inFlight--
      lastEnd = Date.now()
      return {
        image: readFileSync('assets/templates/gta-redcarpet/shot_1.png'),
        model,
        ms: SHOT_MS,
        costUsd: 0.0342,
      }
    })
    const verify = vi.fn(() => ({ pass: true, vsUser: 0.8, vsOriginal: 0.1 }))

    const events: string[] = []
    for await (const ev of generate({
      photo: readFileSync('tests/fixtures/user.png'),
      templateId: 'gta-redcarpet',
      themeId: 'gta-5',
      deps: { edit: edit as any, verify: verify as any },
    })) {
      events.push(ev.type)
      if (ev.type === 'error') throw new Error((ev as any).message)
    }
    expect(edit).toHaveBeenCalledTimes(3)
    // The decisive assertion: at some moment, all three were in flight.
    expect(Math.max(...active)).toBe(3)
    // The swap phase itself costs about one shot, not three. Measured from
    // first call start to last call end, so it excludes embedding and the
    // ffmpeg render.
    const swapPhase = lastEnd - firstStart
    expect(swapPhase).toBeLessThan(SHOT_MS * 2)
    expect(events.filter((e) => e === 'shot')).toHaveLength(3)
    expect(events.at(-1)).toBe('done')
  }, 60_000)

  it('emits each shot as it lands rather than batching at the end', async () => {
    // Shot 0 is slow, shot 2 is fast: the fast one must arrive first.
    const delays = [600, 300, 80]
    let call = 0
    const edit = vi.fn(async ({ model }: any) => {
      const d = delays[call++] ?? 100
      await new Promise((r) => setTimeout(r, d))
      return {
        image: readFileSync('assets/templates/gta-redcarpet/shot_1.png'),
        model,
        ms: d,
        costUsd: 0.0342,
      }
    })
    const verify = vi.fn(() => ({ pass: true, vsUser: 0.8, vsOriginal: 0.1 }))

    const order: number[] = []
    for await (const ev of generate({
      photo: readFileSync('tests/fixtures/user.png'),
      templateId: 'gta-redcarpet',
      themeId: 'gta-5',
      deps: { edit: edit as any, verify: verify as any },
    })) {
      if (ev.type === 'shot') order.push(ev.index)
    }

    // Out of template order proves streaming, not a batched flush.
    expect(order).toHaveLength(3)
    expect(order).not.toEqual([0, 1, 2])
    expect(order[0]).toBe(2)
  }, 60_000)
})
