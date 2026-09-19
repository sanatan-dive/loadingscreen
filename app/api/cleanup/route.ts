import { getStore } from '@/lib/store'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Forget old jobs' shots.
 *
 * The composited shots are kept so someone can change the soundtrack without
 * paying for three more face swaps. That matters while they still have the page
 * open, not forever — and the upload card promises people their photo is
 * "deleted after". The in-memory store has always pruned; the Supabase one
 * never did, so in production nothing was ever deleted.
 *
 * It is also a capacity problem with a nasty tail: 2.63MB a job against a 1GB
 * free-tier bucket fills the project in about nine days at the daily ceiling,
 * and a full Supabase project makes spentToday() return null — which fails the
 * spend ceiling closed and refuses EVERY generation. The site would die of
 * storage, not of traffic.
 */
const RETENTION_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  // Fails closed. Vercel sends this on its own cron invocations; without a
  // configured secret nothing is authorised to run this.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'not found' }, { status: 404 })
  }

  try {
    const removed = await getStore().pruneJobShots(RETENTION_MS)
    console.info(`[cleanup] removed ${removed} job(s) older than 24h`)
    return Response.json({ ok: true, removed })
  } catch (err) {
    console.error('[cleanup] failed:', err)
    return Response.json({ ok: false }, { status: 500 })
  }
}
