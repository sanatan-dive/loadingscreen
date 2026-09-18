import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { extractImage, IntakeError } from '@/lib/image-intake'

/** Minimal DataTransfer stand-in — jsdom's is not constructible in node env. */
function dt(opts: {
  files?: File[]
  items?: { kind: string; type: string; file?: File }[]
  data?: Record<string, string>
}): DataTransfer {
  return {
    files: opts.files ?? [],
    items: (opts.items ?? []).map((i) => ({ ...i, getAsFile: () => i.file ?? null })),
    getData: (t: string) => opts.data?.[t] ?? '',
  } as unknown as DataTransfer
}

const png = () => new File([readFileSync('tests/fixtures/user.png')], 'u.png', { type: 'image/png' })

afterEach(() => vi.unstubAllGlobals())

describe('extractImage', () => {
  it('takes a real dropped file', async () => {
    const f = await extractImage(dt({ files: [png()] }))
    expect(f?.type).toBe('image/png')
  })

  it('takes a clipboard image item', async () => {
    const f = await extractImage(dt({ items: [{ kind: 'file', type: 'image/png', file: png() }] }))
    expect(f?.type).toBe('image/png')
  })

  it('rejects a non-image file with a plain-language message', async () => {
    const bad = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    await expect(extractImage(dt({ files: [bad] }))).rejects.toThrow(/needs to be a photo/i)
  })

  it('rejects an oversized file', async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'b.png', { type: 'image/png' })
    await expect(extractImage(dt({ files: [big] }))).rejects.toThrow(/10MB/i)
  })

  it('returns null when nothing was transferred', async () => {
    expect(await extractImage(dt({}))).toBeNull()
    expect(await extractImage(null)).toBeNull()
  })

  // The case most uploaders miss: dragging an image out of a web page gives
  // you a URL, not a file.
  it('fetches an image dragged from another page (text/uri-list)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob([readFileSync('tests/fixtures/user.png')], { type: 'image/png' }),
    }))
    const f = await extractImage(dt({ data: { 'text/uri-list': 'https://x.test/cat.png' } }))
    expect(f?.name).toBe('cat.png')
  })

  it('pulls the src out of dragged HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob([readFileSync('tests/fixtures/user.png')], { type: 'image/png' }),
    }))
    const f = await extractImage(dt({ data: { 'text/html': '<img src="https://x.test/a.png" >' } }))
    expect(f).not.toBeNull()
  })

  it('accepts a pasted image URL as plain text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob([readFileSync('tests/fixtures/user.png')], { type: 'image/png' }),
    }))
    const f = await extractImage(dt({ data: { 'text/plain': 'https://x.test/b.png' } }))
    expect(f).not.toBeNull()
  })

  it('explains what to do when the image host blocks CORS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('blocked')))
    await expect(
      extractImage(dt({ data: { 'text/uri-list': 'https://x.test/c.png' } }))
    ).rejects.toThrow(/save it first/i)
  })

  it('rejects a link that is not an image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['<html>'], { type: 'text/html' }),
    }))
    await expect(
      extractImage(dt({ data: { 'text/plain': 'https://x.test/page' } }))
    ).rejects.toThrow(/not a PNG/i)
  })

  it('ignores pasted text that is not a URL', async () => {
    expect(await extractImage(dt({ data: { 'text/plain': 'just some words' } }))).toBeNull()
  })
})

describe('unreadable image item', () => {
  it('does not claim a real image is "not a photo" when bytes are withheld', async () => {
    // Firefox hands back an image item whose getAsFile() returns null for
    // programmatic transfers. Saying "that needs to be a photo" would be a lie.
    const transfer = {
      files: [],
      items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => null }],
      getData: () => '',
    } as unknown as DataTransfer
    await expect(extractImage(transfer)).rejects.toThrow(/couldn't read that image/i)
  })
})
