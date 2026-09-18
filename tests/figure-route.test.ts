/**
 * The acceptance test for the public-figure gate: a recognisable figure is
 * refused and NOT ONE image-model call is made. The whole point of the guard is
 * that it sits in front of the money, so proving the refusal is worthless
 * without also proving nothing was spent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { FigureVerdict } from '@/lib/provider'

const edit = vi.fn(async () => {
  throw new Error('the image model must never be reached in these tests')
})
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

beforeEach(() => {
  edit.mockClear()
  classify.mockClear()
})

describe('/api/generate — public-figure gate', () => {
  it('refuses a recognised public figure without calling the image model', async () => {
    classify.mockResolvedValue({ known: true, name: 'Elon Musk', confidence: 0.97, costUsd: 0.0005 })

    const res = await POST(request('figure-test-aaaa'))

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/your own photo/i) })
    expect(edit).not.toHaveBeenCalled()
  })

  it('refunds the free generation it refused', async () => {
    classify.mockResolvedValue({ known: true, name: 'Elon Musk', confidence: 0.97, costUsd: 0.0005 })

    await POST(request('figure-test-bbbb'))

    // The token was taken before the screen ran, so the screen must hand it
    // back: being told no must not cost one of your three videos.
    const bucket = await getStore().getBucket('browser:figure-test-bbbb')
    expect(bucket?.tokens).toBeCloseTo(FREE_VIDEOS_PER_DAY, 3)
  })

  it('FAILS CLOSED when the classifier is down — no spend, no video', async () => {
    classify.mockRejectedValue(new Error('socket hang up'))

    const res = await POST(request('figure-test-dddd'))

    expect(res.status).toBe(503)
    expect(edit).not.toHaveBeenCalled()
  })
})

describe('what a refusal costs us', () => {
  it('records the classifier spend even when it refuses', async () => {
    classify.mockResolvedValue({ known: true, name: 'Elon Musk', confidence: 0.97, costUsd: 0.0005 })
    const store = getStore()
    const before = (await store.spentToday()) ?? 0

    await POST(request('figure-test-eeee'))

    // An attacker refused on every upload still spends our money. A ledger
    // that only counts successes is a ceiling that cannot see the abuse it
    // exists to stop.
    expect((await store.spentToday()) ?? 0).toBeGreaterThan(before)
  })
})
