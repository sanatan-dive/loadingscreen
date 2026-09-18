import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Store } from './index'
import type { Bucket } from '@/lib/limits'

export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const
  private db: SupabaseClient

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  async getShot(key: string) {
    const { data } = await this.db
      .from('shot_cache')
      .select('shot_path, vs_user')
      .eq('key', key)
      .maybeSingle()
    return data ? { path: data.shot_path as string, vsUser: Number(data.vs_user) } : null
  }

  async putShot(key: string, path: string, vsUser: number) {
    await this.db.from('shot_cache').upsert({ key, shot_path: path, vs_user: vsUser })
  }

  async getRender(key: string) {
    const { data } = await this.db
      .from('render_cache')
      .select('video_path')
      .eq('key', key)
      .maybeSingle()
    return (data?.video_path as string) ?? null
  }

  async putRender(key: string, path: string) {
    await this.db.from('render_cache').upsert({ key, video_path: path })
  }

  async getBucket(subject: string): Promise<Bucket | null> {
    const { data } = await this.db
      .from('rate_buckets')
      .select('tokens, updated_at')
      .eq('subject', subject)
      .maybeSingle()
    return data ? { tokens: Number(data.tokens), updatedAt: Date.parse(data.updated_at) } : null
  }

  async putBucket(subject: string, b: Bucket) {
    await this.db
      .from('rate_buckets')
      .upsert({ subject, tokens: b.tokens, updated_at: new Date(b.updatedAt).toISOString() })
  }

  /** Returns null on failure so the caller fails closed. */
  async spentToday(): Promise<number | null> {
    const { data, error } = await this.db.rpc('spend_today')
    if (error) return null
    return Number(data ?? 0)
  }

  async recordSpend(costUsd: number) {
    await this.db.from('spend_ledger').insert({ cost_usd: costUsd })
  }

  private bucket = 'job-shots'

  async putJobShots(jobId: string, shots: Buffer[]) {
    await Promise.all(
      shots.map((b, i) =>
        this.db.storage.from(this.bucket).upload(`${jobId}/${i}.png`, b, {
          contentType: 'image/png',
          upsert: true,
        })
      )
    )
  }

  async getJobShots(jobId: string): Promise<Buffer[] | null> {
    const out: Buffer[] = []
    for (let i = 0; i < 3; i++) {
      const { data, error } = await this.db.storage.from(this.bucket).download(`${jobId}/${i}.png`)
      if (error || !data) return null
      out.push(Buffer.from(await data.arrayBuffer()))
    }
    return out
  }
}
