/**
 * Closing the tab must not hand out another free video.
 *
 * The IP rotates on mobile carriers (one tester appeared as 152.58.182.119 and
 * 49.43.145.167 on consecutive days) and the browser id lives in localStorage,
 * which a new window clears. The server-issued cookie is the signal that
 * survives both, so it has to be issued on EVERY response — including the
 * refusal, or the one person told "come back tomorrow" is the one person who
 * never gets an identity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { FigureVerdict } from '@/lib/provider'

const edit = vi.fn()
const classify = vi.fn<() => Promise<FigureVerdict>>()

vi.mock('@/lib/provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/provider')>()),
  edit,
  classify,
}))

const { POST } = await import('@/app/api/generate/route')
const { getStore } = await import('@/lib/store')

const photo = readFileSync('tests/fixtures/user.png')

/** No client header and no cookie: a brand-new private window. */
function request(opts: { cookie?: string; ip: string }): Request {
  const form = new FormData()
  form.set('photo', new File([photo], 'user.png', { type: 'image/png' }))
  form.set('templateId', 'gta-redcarpet')
  form.set('themeId', 'gta-5')
  const headers: Record<string, string> = { 'x-forwarded-for': opts.ip }
  if (opts.cookie) headers.cookie = opts.cookie
  return new Request('http://localhost/api/generate', { method: 'POST', body: form, headers })
}

const cookieFrom = (res: Response) => res.headers.get('Set-Cookie') ?? ''
const idFrom = (res: Response) =>
  /cutscene_visitor=([0-9a-f-]{36})/.exec(cookieFrom(res))?.[1] ?? ''

beforeEach(() => {
  edit.mockReset()
  classify.mockReset()
  classify.mockResolvedValue({ known: false, name: null, confidence: 0, costUsd: 0.00035 })
  // Every generation fails fast; we are testing identity, not rendering.
  edit.mockRejectedValue(new Error('no model in tests'))
})

describe('the visitor cookie', () => {
  it('is issued on a first visit, HttpOnly so scripts cannot forge it', async () => {
    const res = await POST(request({ ip: '10.0.0.1' }))
    await res.text()
    const cookie = cookieFrom(res)

    expect(cookie).toMatch(/cutscene_visitor=[0-9a-f-]{36}/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
  })

  it('is issued on a REFUSAL too, not only on success', async () => {
    // Drain the subject first so the next request is refused.
    const store = getStore()
    await store.putBucket('ip:10.0.0.9', { tokens: 0, updatedAt: Date.now() })

    const res = await POST(request({ ip: '10.0.0.9' }))
    expect(res.status).toBe(429)
    expect(cookieFrom(res)).toMatch(/cutscene_visitor=[0-9a-f-]{36}/)
  })

  it('keeps the same identity when the cookie comes back', async () => {
    const first = await POST(request({ ip: '10.0.1.1' }))
    await first.text()
    const id = idFrom(first)
    expect(id).not.toBe('')

    const second = await POST(request({ ip: '10.0.1.1', cookie: `cutscene_visitor=${id}` }))
    await second.text()
    expect(idFrom(second)).toBe(id)
  })

  // The point of the whole thing: a rotated IP and a wiped localStorage still
  // hit the same allowance, because the cookie came back.
  it('still counts against you when the IP changes', async () => {
    const first = await POST(request({ ip: '203.0.113.1' }))
    await first.text()
    const id = idFrom(first)

    const store = getStore()
    // Spend the visitor's allowance, leaving the new IP untouched.
    await store.putBucket(`visitor:${id}`, { tokens: 0, updatedAt: Date.now() })

    const second = await POST(
      request({ ip: '198.51.100.7', cookie: `cutscene_visitor=${id}` })
    )
    expect(second.status).toBe(429)
    expect(await second.json()).toMatchObject({
      error: expect.stringMatching(/poor on credits/i),
    })
  })
})
