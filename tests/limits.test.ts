import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { refill, take, checkSpendCeiling, LimitError, DAILY_CEILING_USD } from '@/lib/limits'
import { sniff, validateUpload, MAX_UPLOAD_BYTES } from '@/lib/limits/upload'

describe('token bucket', () => {
  const now = 1_000_000

  it('refills over time', () => {
    expect(refill({ tokens: 0, updatedAt: now - 60_000 }, 5, 1 / 60, now)).toBeCloseTo(1, 5)
  })

  it('never exceeds capacity', () => {
    expect(refill({ tokens: 5, updatedAt: now - 9_999_000 }, 5, 1 / 60, now)).toBe(5)
  })

  it('allows a request when tokens are available', () => {
    const r = take({ tokens: 3, updatedAt: now }, 5, 1 / 60, 1, now)
    expect(r.ok).toBe(true)
    expect(r.bucket.tokens).toBeCloseTo(2)
  })

  it('refuses and reports retryAfter when empty', () => {
    const r = take({ tokens: 0, updatedAt: now }, 5, 1 / 60, 1, now)
    expect(r.ok).toBe(false)
    expect(r.retryAfter).toBeGreaterThan(0)
  })
})

describe('spend ceiling', () => {
  it('allows a job well under the ceiling', () => {
    expect(() => checkSpendCeiling(0)).not.toThrow()
  })

  it('refuses when the job would breach the ceiling', () => {
    expect(() => checkSpendCeiling(DAILY_CEILING_USD)).toThrow(LimitError)
  })

  it('FAILS CLOSED when the ledger cannot be read', () => {
    expect(() => checkSpendCeiling(null)).toThrow(/unavailable/)
  })
})

describe('upload validation', () => {
  it('sniffs real formats from magic bytes, not the declared type', () => {
    expect(sniff(readFileSync('tests/fixtures/user.png'))).toBe('png')
    expect(sniff(Buffer.from('not an image at all'))).toBeNull()
  })

  it('rejects a non-image', async () => {
    await expect(validateUpload(Buffer.from('definitely not an image'))).rejects.toThrow(/photo/i)
  })

  it('rejects oversized uploads before doing any work', async () => {
    await expect(validateUpload(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toThrow(/too large/i)
  })

  it('accepts a real single-face photo', async () => {
    await expect(validateUpload(readFileSync('tests/fixtures/user.png'))).resolves.toBeUndefined()
  })

  it('rejects a photo with more than one face', async () => {
    // The 3-up comparison render contains three faces.
    await expect(validateUpload(readFileSync('out/smile_v3.png'))).rejects.toThrow(/more than one face/i)
  })
})
