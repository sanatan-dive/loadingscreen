/**
 * A free video is what the user GOT, not what they attempted.
 *
 * The token is taken in the guard block, before a single cent is spent. Every
 * path that ends without a video has to hand it back — otherwise, at one video
 * a day, a single failed generation locks someone out until tomorrow having
 * given them nothing, which is the worst outcome this product can produce.
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
const { FREE_VIDEOS_PER_DAY } = await import('@/lib/limits')

const photo = readFileSync('tests/fixtures/user.png')

function request(browserId: string): Request {
  const form = new FormData()
  form.set('photo', new File([photo], 'user.png', { type: 'image/png' }))
  form.set('templateId', 'gta-redcarpet')
  form.set('themeId', 'gta-5')
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    body: form,
    headers: { 'x-cutscene-client': browserId },
  })
}

const tokens = async (browserId: string) =>
  (await getStore().getBucket(`browser:${browserId}`))?.tokens

beforeEach(() => {
  edit.mockReset()
  classify.mockReset()
  classify.mockResolvedValue({ known: false, name: null, confidence: 0, costUsd: 0.00035 })
})

describe('a generation that fails costs the user nothing', () => {
  it('gives the allowance back when every model rejects the shot', async () => {
    // The provider answers, the gate never accepts: the job fails after spend.
    edit.mockRejectedValue(new Error('provider exploded'))

    const res = await POST(request('refund-test-aaaa'))
    expect(res.status).toBe(200)
    const body = await res.text()

    expect(body).toMatch(/"type":"error"/)
    expect(await tokens('refund-test-aaaa')).toBeCloseTo(FREE_VIDEOS_PER_DAY, 3)
  })

  it('gives it back when the pipeline throws outright', async () => {
    edit.mockImplementation(() => {
      throw new Error('something unexpected')
    })

    const res = await POST(request('refund-test-bbbb'))
    await res.text()

    expect(await tokens('refund-test-bbbb')).toBeCloseTo(FREE_VIDEOS_PER_DAY, 3)
  })

  // The IP is charged alongside the browser id, so it must come back too —
  // otherwise everyone behind one router loses an allowance to one failure.
  it('gives back the IP allowance, not just the browser one', async () => {
    edit.mockRejectedValue(new Error('provider exploded'))
    // Drain: the refund runs in the stream's finally, so the response object
    // existing is not the same as the request being over.
    await (await POST(request('refund-test-cccc'))).text()

    const ip = await getStore().getBucket('ip:unknown')
    expect(ip?.tokens).toBeCloseTo(FREE_VIDEOS_PER_DAY, 3)
  })

  it('never credits more than the allowance, however many failures', async () => {
    edit.mockRejectedValue(new Error('provider exploded'))
    for (let i = 0; i < 3; i++) await (await POST(request('refund-test-dddd'))).text()

    const t = await tokens('refund-test-dddd')
    expect(t).toBeLessThanOrEqual(FREE_VIDEOS_PER_DAY)
    expect(t).toBeCloseTo(FREE_VIDEOS_PER_DAY, 3)
  })
})
