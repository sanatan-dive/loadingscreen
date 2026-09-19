/**
 * Nothing was ever deleted in production.
 *
 * The in-memory store prunes job shots — "these are people's faces; keep them
 * briefly and prune aggressively" — and the Supabase store, the one that
 * actually runs, had no prune at all. The upload card tells people their photo
 * is "deleted after", and 2.63MB a job against a 1GB bucket fills the project
 * in about nine days at the daily ceiling.
 */
import { describe, it, expect } from 'vitest'
import { getStore } from '@/lib/store'

const HOUR = 60 * 60 * 1000

describe('old jobs are forgotten', () => {
  it('drops shots past the retention window and keeps fresh ones', async () => {
    const store = getStore()
    const shots = [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]
    await store.putJobShots('cleanup-fresh', shots)

    // Nothing is old yet, so nothing goes.
    expect(await store.pruneJobShots(24 * HOUR)).toBe(0)
    expect(await store.getJobShots('cleanup-fresh')).not.toBeNull()

    // Let the clock move, then treat everything as old.
    await new Promise((r) => setTimeout(r, 5))
    expect(await store.pruneJobShots(1)).toBeGreaterThan(0)
    expect(await store.getJobShots('cleanup-fresh')).toBeNull()
  })
})

describe('the cleanup endpoint', () => {
  it('is invisible without the cron secret', async () => {
    delete process.env.CRON_SECRET
    const { GET } = await import('@/app/api/cleanup/route')
    const res = await GET(new Request('http://localhost/api/cleanup'))
    // 404, not 401: an unauthorised caller should not learn it exists.
    expect(res.status).toBe(404)
  })

  it('refuses the wrong secret', async () => {
    process.env.CRON_SECRET = 'right'
    const { GET } = await import('@/app/api/cleanup/route')
    const res = await GET(
      new Request('http://localhost/api/cleanup', { headers: { authorization: 'Bearer wrong' } })
    )
    expect(res.status).toBe(404)
    delete process.env.CRON_SECRET
  })
})
