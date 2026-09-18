/**
 * Spend and abuse control. An unprotected generate endpoint is a button that
 * spends the owner's money, so every guard here fails CLOSED.
 */

export const DAILY_CEILING_USD = Number(process.env.DAILY_CEILING_USD ?? 25)
export const FREE_VIDEOS_PER_DAY = Number(process.env.FREE_VIDEOS_PER_DAY ?? 3)
/** Measured: 2 shots at flash-lite + 1 escalation to pro is a realistic worst case. */
export const ESTIMATED_JOB_USD = 0.21

export interface Bucket {
  tokens: number
  updatedAt: number
}

/** Token bucket refill, capped at capacity. */
export function refill(b: Bucket, capacity: number, perSecond: number, now = Date.now()): number {
  const elapsed = Math.max(0, (now - b.updatedAt) / 1000)
  return Math.min(capacity, b.tokens + elapsed * perSecond)
}

export function take(
  b: Bucket,
  capacity: number,
  perSecond: number,
  cost = 1,
  now = Date.now()
): { ok: boolean; bucket: Bucket; retryAfter: number } {
  const tokens = refill(b, capacity, perSecond, now)
  if (tokens < cost) {
    return {
      ok: false,
      bucket: { tokens, updatedAt: now },
      retryAfter: Math.ceil((cost - tokens) / perSecond),
    }
  }
  return { ok: true, bucket: { tokens: tokens - cost, updatedAt: now }, retryAfter: 0 }
}

export class LimitError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter = 0) {
    super(message)
    this.name = 'LimitError'
  }
}

/**
 * Refuses when today's spend plus this job would breach the ceiling.
 * `spentToday` of null means the ledger could not be read — refuse anyway.
 */
export function checkSpendCeiling(spentToday: number | null, estimate = ESTIMATED_JOB_USD): void {
  if (spentToday === null) {
    throw new LimitError('spend ledger unavailable', 503)
  }
  if (spentToday + estimate > DAILY_CEILING_USD) {
    throw new LimitError('daily capacity reached — try again tomorrow', 429)
  }
}
