import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { edit, buildPrompt, MODEL_LADDER, ProviderError } from '@/lib/provider'

const okBody = (cost = 0.0342) => ({
  choices: [
    { message: { images: [{ image_url: { url: `data:image/png;base64,${Buffer.from('img').toString('base64')}` } }] } },
  ],
  usage: { cost },
})

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'test-key'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('model ladder', () => {
  it('puts flash-lite first - fastest, cheapest AND most accurate', () => {
    expect(MODEL_LADDER[0]).toBe('google/gemini-3.1-flash-lite-image')
    expect(MODEL_LADDER).toHaveLength(2)
  })
  it('excludes models that failed identity or are strictly dominated', () => {
    expect(MODEL_LADDER).not.toContain('google/gemini-2.5-flash-image')
    // slower AND pricier AND less accurate than flash-lite
    expect(MODEL_LADDER).not.toContain('google/gemini-3.1-flash-image')
  })
})

describe('prompt', () => {
  it('includes the authored expression verbatim', () => {
    expect(buildPrompt('a small smirk, lips together')).toContain('a small smirk, lips together')
  })
  it('forbids a neutral face', () => {
    expect(buildPrompt('x')).toMatch(/do not render him neutral, deadpan or serious/i)
  })
  it('forbids blending the two identities', () => {
    expect(buildPrompt('x')).toMatch(/do not blend the two men/i)
  })
  it('never leaks the API key', () => {
    expect(buildPrompt('x')).not.toContain('test-key')
  })
})

describe('edit', () => {
  const req = { crop: Buffer.from('c'), face: Buffer.from('f'), model: MODEL_LADDER[0], expression: 'e' }

  it('sends the key as a bearer header, not in the body', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody() })
    vi.stubGlobal('fetch', f)
    await edit(req)
    const [, init] = f.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer test-key')
    expect(init.body).not.toContain('test-key')
  })

  it('retries on 429 then succeeds', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'slow down' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => okBody() })
    vi.stubGlobal('fetch', f)
    const r = await edit(req)
    expect(f).toHaveBeenCalledTimes(2)
    expect(r.costUsd).toBeCloseTo(0.0342)
  })

  it('retries on 5xx', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => okBody() })
    vi.stubGlobal('fetch', f)
    await edit(req)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry a 400 - that is our bug, not theirs', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' })
    vi.stubGlobal('fetch', f)
    await expect(edit(req)).rejects.toThrow(/provider 400/)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('throws when the model returns prose instead of an image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: 'I cannot do that' } }] }),
    }))
    await expect(edit(req)).rejects.toThrow(/no image/i)
  })

  it('fails clearly without a key', async () => {
    delete process.env.OPENROUTER_API_KEY
    await expect(edit(req)).rejects.toThrow(ProviderError)
  })

  it('releases its concurrency slot even when the call throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'x' }))
    for (let i = 0; i < 8; i++) await expect(edit(req)).rejects.toThrow()
    // A leaked semaphore would deadlock this final call.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody() }))
    await expect(edit(req)).resolves.toBeTruthy()
  })
})
