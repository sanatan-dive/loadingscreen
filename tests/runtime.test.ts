import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { ffmpegPath, runtimeInfo } from '@/lib/runtime'

describe('runtime binaries', () => {
  it('resolves ffmpeg to a path that exists', () => {
    const p = ffmpegPath()
    expect(existsSync(p), `ffmpeg not at ${p}`).toBe(true)
  })

  // Regression: Next rewrites __dirname when it bundles a package, so
  // ffmpeg-static resolved to "/ROOT/node_modules/ffmpeg-static/ffmpeg" in
  // production and every render died with ENOENT.
  it('never returns a bundler-rewritten /ROOT/ path', () => {
    expect(ffmpegPath().startsWith('/ROOT/')).toBe(false)
  })

  it('reports versions for both native deps', async () => {
    const info = await runtimeInfo()
    expect(info.ffmpegVersion).toMatch(/^\d+\./)
    expect(info.onnxVersion).toMatch(/^\d+\./)
  })
})
