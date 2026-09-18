/**
 * What a failed job costs after we have stopped caring about it.
 *
 * generate() answers the user the moment any shot fails, but the other two
 * swaps are still in flight. Left alone they climb the model ladder to the
 * $0.14 pro rung for frames nobody will ever see, and because the error event
 * was already yielded, none of that reaches recordSpend — the daily ceiling
 * goes blind to exactly the jobs that spend the most.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { generate } from '@/lib/pipeline'

const photo = readFileSync('tests/fixtures/user.png')

/** A real image, so decode/detect behave as they do in production. */
const generated = photo

function deps(onCall: (model: string, expression: string) => void) {
  return {
    edit: vi.fn(async (req: { model: string; expression: string }) => {
      onCall(req.model, req.expression)
      // Shot 1 is the fast failure; the other two are slow and DO cost money.
      if (req.expression.startsWith('a subtle confident')) throw new Error('shot 1 refused')
      await new Promise((r) => setTimeout(r, 150))
      return { image: generated, model: req.model, ms: 150, costUsd: 0.05 }
    }),
    // Every result is rejected, so an un-aborted shot escalates to the next rung.
    verify: () => ({ pass: false, reason: 'forced', vsUser: 0, vsOriginal: 0 }),
  }
}

async function run() {
  const calls: string[] = []
  const d = deps((model) => calls.push(model))
  const events: Awaited<ReturnType<typeof collect>> = await collect(d)
  return { calls, events, d }
}

async function collect(d: ReturnType<typeof deps>) {
  const events: Record<string, unknown>[] = []
  for await (const ev of generate({
    photo,
    templateId: 'gta-redcarpet',
    themeId: 'gta-5',
    deps: d as never,
  })) {
    events.push(ev as unknown as Record<string, unknown>)
  }
  return events
}

describe('a job that fails partway', () => {
  it('stops climbing the model ladder for shots nobody will see', async () => {
    const { calls } = await run()
    const atReport = calls.length
    // Long enough for an un-aborted shot to finish its 150ms call and escalate.
    await new Promise((r) => setTimeout(r, 600))

    expect(calls.length, 'provider called after the user was answered').toBe(atReport)
    expect(calls.filter((m) => m.includes('pro-image')).length).toBeLessThanOrEqual(1)
  })

  it('reports what the abandoned shots already spent', async () => {
    const { events } = await run()
    const error = events.find((e) => e.type === 'error')

    expect(error).toBeDefined()
    // Shots 2 and 3 each completed a $0.05 call before we gave up on the job.
    // Reporting $0 here is what lets an attacker spend past the daily ceiling.
    expect(error!.costUsd as number).toBeGreaterThanOrEqual(0.1)
  })
})
