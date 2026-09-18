import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryStore } from '@/lib/store'

afterEach(() => vi.unstubAllGlobals())

describe('job shot storage', () => {
  it('round-trips composited shots for a re-render', async () => {
    const s = new MemoryStore()
    const shots = [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]
    await s.putJobShots('job-1', shots)
    expect(await s.getJobShots('job-1')).toEqual(shots)
  })

  it('returns null for an unknown job so the client can fall back', async () => {
    expect(await new MemoryStore().getJobShots('nope')).toBeNull()
  })
})

describe('render route contract', () => {
  it('never imports the provider — changing music must not cost money', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('app/api/render/route.ts', 'utf8')
    )
    expect(src).not.toMatch(/@\/lib\/provider/)
    expect(src).not.toMatch(/\bedit\(/)
    expect(src).not.toMatch(/MODEL_LADDER/)
  })

  it('does not import the pipeline either', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('app/api/render/route.ts', 'utf8')
    )
    expect(src).not.toMatch(/@\/lib\/pipeline/)
  })
})
