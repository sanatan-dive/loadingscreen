// @vitest-environment jsdom
/**
 * The one message the product most wanted to say was the one nobody saw.
 *
 * The server refuses a second video with "That's your free one for today.
 * We're poor on credits — come back tomorrow." The page then ran that through
 * toUserError(), which is built to translate INTERNAL failures into plain
 * language — it does not recognise that sentence, so it fell through to
 * "Something went wrong. Try again." A real user hit this and reported it as a
 * mystery error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Page from '@/app/page'

const LIMIT_COPY = "That's your free one for today. We're poor on credits — come back tomorrow."

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ error: LIMIT_COPY }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  )
  // jsdom has no media pipeline; the hero must not fail the render.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value: () => {},
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('being told you have had your video today', () => {
  it('shows what the server actually said, not a generic apology', async () => {
    const { container } = render(<Page />)

    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'me.png', {
      type: 'image/png',
    })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))

    await waitFor(() => {
      expect(screen.getByText(/poor on credits/i)).toBeTruthy()
    })
    expect(screen.queryByText(/Something went wrong/i)).toBeNull()
    // And the photo advice is wrong here: a better photo does not help.
    expect(screen.queryByText(/front-facing photo usually fixes it/i)).toBeNull()
  })
})
