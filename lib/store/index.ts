/**
 * Persistence behind one interface so the pipeline never knows whether it is
 * talking to Postgres or to memory. Supabase is used when configured;
 * otherwise an in-process store keeps local development working.
 */
import type { Bucket } from '@/lib/limits'

export interface Store {
  readonly kind: 'supabase' | 'memory'
  getShot(key: string): Promise<{ path: string; vsUser: number } | null>
  putShot(key: string, path: string, vsUser: number): Promise<void>
  getRender(key: string): Promise<string | null>
  putRender(key: string, path: string): Promise<void>
  getBucket(subject: string): Promise<Bucket | null>
  putBucket(subject: string, bucket: Bucket): Promise<void>
  /** null means the ledger could not be read — callers must fail closed. */
  spentToday(): Promise<number | null>
  recordSpend(costUsd: number): Promise<void>

  /**
   * Composited shots for a finished job, so switching the music re-renders
   * without touching an image model.
   */
  putJobShots(jobId: string, shots: Buffer[]): Promise<void>
  getJobShots(jobId: string): Promise<Buffer[] | null>
}

class MemoryStore implements Store {
  readonly kind = 'memory' as const
  private shots = new Map<string, { path: string; vsUser: number }>()
  private renders = new Map<string, string>()
  private buckets = new Map<string, Bucket>()
  private ledger: { day: string; cost: number }[] = []

  async getShot(k: string) {
    return this.shots.get(k) ?? null
  }
  async putShot(k: string, path: string, vsUser: number) {
    this.shots.set(k, { path, vsUser })
  }
  async getRender(k: string) {
    return this.renders.get(k) ?? null
  }
  async putRender(k: string, path: string) {
    this.renders.set(k, path)
  }
  async getBucket(s: string) {
    return this.buckets.get(s) ?? null
  }
  async putBucket(s: string, b: Bucket) {
    this.buckets.set(s, b)
  }
  async spentToday() {
    const today = new Date().toISOString().slice(0, 10)
    return this.ledger.filter((r) => r.day === today).reduce((a, r) => a + r.cost, 0)
  }
  async recordSpend(cost: number) {
    this.ledger.push({ day: new Date().toISOString().slice(0, 10), cost })
  }

  private jobs = new Map<string, { shots: Buffer[]; at: number }>()

  async putJobShots(jobId: string, shots: Buffer[]) {
    // These are people's faces; keep them briefly and prune aggressively.
    const cutoff = Date.now() - 30 * 60_000
    for (const [k, v] of this.jobs) if (v.at < cutoff) this.jobs.delete(k)
    this.jobs.set(jobId, { shots, at: Date.now() })
  }

  async getJobShots(jobId: string) {
    return this.jobs.get(jobId)?.shots ?? null
  }
}

let cached: Store | null = null

export function getStore(): Store {
  if (cached) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    // Lazy require so local dev without Supabase never loads the client.
    const { SupabaseStore } = require('./supabase') as typeof import('./supabase')
    cached = new SupabaseStore(url, key)
  } else {
    cached = new MemoryStore()
  }
  return cached
}

export { MemoryStore }
