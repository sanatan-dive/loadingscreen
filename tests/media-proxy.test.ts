/**
 * Where the browser fetches the hero clip from.
 *
 * Every visitor autoplays an 843KB video before doing anything. Pointed at
 * Supabase Storage directly that is one download per visitor against a 5GB
 * monthly allowance (~5,700 visitors). Worse, the same Supabase project holds
 * the rate buckets and spend ledger, so exhausting it makes spentToday() return
 * null, the ceiling fail closed, and every generation refuse. Going through our
 * own origin puts a CDN in between.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL = process.env.NEXT_PUBLIC_MEDIA_BASE

beforeEach(() => vi.resetModules())
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_MEDIA_BASE
  else process.env.NEXT_PUBLIC_MEDIA_BASE = ORIGINAL
})

describe('browser media URLs', () => {
  it('never point the browser straight at storage', async () => {
    // Even with storage configured, the browser asks THIS origin: the file is
    // pulled into the build by scripts/fetch-public-media.ts and served as a
    // static asset. Pointing at storage is one download per visitor against a
    // 5GB monthly allowance, and a rewrite does not help - Vercel forwards an
    // external rewrite per request without caching it (measured: MISS twice).
    process.env.NEXT_PUBLIC_MEDIA_BASE = 'https://example.supabase.co/storage/v1/object/public/media'
    const { publicUrl } = await import('@/lib/media')

    const url = publicUrl('/reference.mp4')
    expect(url).not.toContain('supabase')
    expect(url).toBe('/reference.mp4')
  })

  // With the files on disk locally, nothing should be proxied at all.
  it('stay as plain paths when the media is local', async () => {
    delete process.env.NEXT_PUBLIC_MEDIA_BASE
    const { publicUrl } = await import('@/lib/media')
    expect(publicUrl('/reference.mp4')).toBe('/reference.mp4')
  })
})
