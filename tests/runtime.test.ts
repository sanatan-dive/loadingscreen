import { describe, it, expect } from 'vitest'
import { runtimeInfo } from '@/lib/runtime'

describe('runtime', () => {
  it('finds ffmpeg and onnxruntime', async () => {
    const info = await runtimeInfo()
    expect(info.ffmpegVersion).toMatch(/^\d+\./)
    expect(info.onnxVersion).toMatch(/^\d+\./)
  })
})
