/**
 * /api/render spends no API credit, which is exactly why it was unguarded — and
 * exactly why it is worth hammering. Every call is an ffmpeg run and a function
 * invocation that neither the free-video allowance nor the spend ceiling can
 * see.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const render = vi.fn()
vi.mock('@/lib/render', () => ({ render }))

const { POST } = await import('@/app/api/render/route')
const { getStore } = await import('@/lib/store')

function request(ip: string, origin?: string): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': ip,
    host: 'loadingscreen.xyz',
  }
  if (origin) headers.origin = origin
  return new Request('http://loadingscreen.xyz/api/render', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jobId: 'no-such-job', themeId: 'gta-5' }),
  })
}

beforeEach(() => render.mockReset())

describe('re-rendering the music', () => {
  // 410 means the guards passed and the job simply is not there — the shape a
  // legitimate audition takes in a test with no stored shots.
  it('lets a normal audition through', async () => {
    const res = await POST(request('203.0.113.60', 'https://loadingscreen.xyz'))
    expect(res.status).toBe(410)
  })

  it('stops a loop once the hourly allowance is gone', async () => {
    const ip = '203.0.113.61'
    await getStore().putBucket(`render:${ip}`, { tokens: 0, updatedAt: Date.now() })

    const res = await POST(request(ip))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(render).not.toHaveBeenCalled()
  })

  it('refuses a call from another site', async () => {
    const res = await POST(request('203.0.113.62', 'https://not-our-site.example'))
    expect(res.status).toBe(403)
    expect(render).not.toHaveBeenCalled()
  })
})
