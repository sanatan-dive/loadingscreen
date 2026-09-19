/**
 * What a public launch has to survive.
 *
 * The free-video allowance was never the whole defence: it limits how many
 * videos someone gets, not how much work they can make us do. These are the
 * guards for the second question.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { FigureVerdict } from '@/lib/provider'

const edit = vi.fn()
const classify = vi.fn<() => Promise<FigureVerdict>>()
const validateUpload = vi.fn()

vi.mock('@/lib/provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/provider')>()),
  edit,
  classify,
}))
vi.mock('@/lib/limits/upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/limits/upload')>()),
  validateUpload,
}))

const { POST } = await import('@/app/api/generate/route')
const { getStore } = await import('@/lib/store')

const photo = readFileSync('tests/fixtures/user.png')

function request(opts: { ip: string; origin?: string; host?: string; length?: string }): Request {
  const form = new FormData()
  form.set('photo', new File([photo], 'user.png', { type: 'image/png' }))
  form.set('templateId', 'gta-redcarpet')
  form.set('themeId', 'gta-5')
  const headers: Record<string, string> = { 'x-forwarded-for': opts.ip }
  if (opts.origin) headers.origin = opts.origin
  headers.host = opts.host ?? 'loadingscreen.xyz'
  if (opts.length) headers['content-length'] = opts.length
  return new Request('http://loadingscreen.xyz/api/generate', {
    method: 'POST',
    body: form,
    headers,
  })
}

beforeEach(() => {
  edit.mockReset()
  classify.mockReset()
  validateUpload.mockReset()
  classify.mockResolvedValue({ known: false, name: null, confidence: 0, costUsd: 0 })
  edit.mockRejectedValue(new Error('no model in tests'))
})

describe('work an attacker can make us do', () => {
  /**
   * The one that was actually wrong: validateUpload decodes the image and runs
   * face detection — the most expensive thing on this route before the provider
   * — and it used to run BEFORE the token take. Every request in a flood from
   * one address paid for a full decode it was going to be refused for anyway.
   */
  it('does not decode the photo for a request that is already over its limit', async () => {
    await getStore().putBucket('ip:198.51.100.44', { tokens: 0, updatedAt: Date.now() })

    const res = await POST(request({ ip: '198.51.100.44' }))

    expect(res.status).toBe(429)
    expect(validateUpload).not.toHaveBeenCalled()
  })

  /**
   * multipart/form-data is CORS-simple, so any page on the internet can post
   * this form from a visitor's browser and spend our credits. The browser
   * cannot be stopped from sending it, but it always labels it.
   */
  it("refuses a POST from someone else's page, and charges them nothing", async () => {
    const res = await POST(
      request({ ip: '198.51.100.45', origin: 'https://not-our-site.example' })
    )

    expect(res.status).toBe(403)
    expect(validateUpload).not.toHaveBeenCalled()
    // No token was taken, so a cross-site attempt cannot drain a real visitor.
    expect(await getStore().getBucket('ip:198.51.100.45')).toBeNull()
  })

  it("allows the site's own page", async () => {
    const res = await POST(
      request({ ip: '198.51.100.46', origin: 'https://loadingscreen.xyz' })
    )
    await res.text()
    expect(res.status).toBe(200)
    expect(validateUpload).toHaveBeenCalled()
  })

  it('rejects an oversized upload from its length, without buffering it', async () => {
    const res = await POST(request({ ip: '198.51.100.47', length: String(64 * 1024 * 1024) }))

    expect(res.status).toBe(413)
    expect(validateUpload).not.toHaveBeenCalled()
  })
})
