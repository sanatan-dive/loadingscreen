/**
 * The allowed path, kept in its own file on purpose.
 *
 * This is the only guard test that lets a job actually start, and a started job
 * outlives its request: when one shot fails, generate() answers the user and
 * leaves the other two climbing the model ladder. Those late calls would land
 * in whichever test ran next and make the "no image model was reached"
 * assertions in figure-route.test.ts lie. Vitest isolates files, so keeping
 * this one apart means that spy stays honest without mocking the pipeline away
 * — which would have made the assertion vacuous.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { FigureVerdict } from '@/lib/provider'

const classify = vi.fn<() => Promise<FigureVerdict>>()

vi.mock('@/lib/provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/provider')>()),
  edit: vi.fn(async () => {
    throw new Error('no real image model in tests')
  }),
  classify,
}))

const { POST } = await import('@/app/api/generate/route')

const photo = readFileSync('tests/fixtures/user.png')

describe('/api/generate — an ordinary face', () => {
  it('passes the screen and starts the job', async () => {
    classify.mockResolvedValue({ known: false, name: null, confidence: 0, costUsd: 0.00035 })

    const form = new FormData()
    form.set('photo', new File([photo], 'user.png', { type: 'image/png' }))
    form.set('templateId', 'gta-redcarpet')
    form.set('themeId', 'gta-5')
    const res = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        body: form,
        headers: { 'x-cutscene-client': 'allowed-test-aaaa' },
      })
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/event-stream/)
    // Both framings, or the agreement check proves nothing.
    expect(classify).toHaveBeenCalledTimes(2)
    await res.text()
  })
})
