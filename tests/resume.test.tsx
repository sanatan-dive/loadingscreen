// @vitest-environment jsdom
/**
 * Reloading mid-generation used to throw the video away.
 *
 * The composited shots are stored on the server BEFORE the video is sent, so
 * after a reload the video usually still exists — but the jobId that finds it
 * only ever went to the browser that reloaded. The money that made it is spent
 * either way, so the user paid for something they cannot reach.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Page from '@/app/page'

const JOB = { jobId: 'job-abc', themeId: 'gta-4', at: Date.now() }

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: () => {} })
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('coming back after a reload', () => {
  it('re-renders the video the user already paid for', async () => {
    localStorage.setItem('cutscene:last-job', JSON.stringify(JOB))
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ src: 'data:video/mp4;base64,AAAA', ms: 800 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<Page />)

    await waitFor(() => expect(screen.getByText(/Mission Passed/i)).toBeTruthy())

    // Recovered through the free ffmpeg path — never the image models.
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/render')
    expect(JSON.parse(init.body).jobId).toBe('job-abc')
  })

  it('forgets a job the server no longer has, instead of looping', async () => {
    localStorage.setItem('cutscene:last-job', JSON.stringify(JOB))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ expired: true }), { status: 410 }))
    )

    render(<Page />)

    await waitFor(() => expect(localStorage.getItem('cutscene:last-job')).toBeNull())
  })

  it('ignores a job old enough that the user has moved on', async () => {
    const stale = { ...JOB, at: Date.now() - 60 * 60_000 }
    localStorage.setItem('cutscene:last-job', JSON.stringify(stale))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<Page />)

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
