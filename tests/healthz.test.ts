/**
 * The deploy check has to fail when the deploy is broken, or it is decoration.
 */
import { describe, it, expect } from 'vitest'
import { listTemplates } from '@/lib/template'
import { resolvable } from '@/lib/media-server'

describe('healthz media check', () => {
  it('watches every file ffmpeg is handed', () => {
    const watched = listTemplates().flatMap((t) => [
      ...t.themes.map((x) => x.file),
      ...t.shots.map((x) => x.file),
    ])
    // 3 themes + 3 shots. A theme added without media coverage would slip by.
    expect(watched.length).toBe(6)
    expect(watched.some((f) => f.endsWith('.mp3'))).toBe(true)
  })

  it('reports the soundtracks as resolvable in this working copy', async () => {
    const checked = await Promise.all(
      listTemplates()
        .flatMap((t) => t.themes.map((x) => x.file))
        .map(async (f) => [f, await resolvable(f)] as const)
    )
    expect(checked.filter(([, ok]) => !ok).map(([f]) => f)).toEqual([])
  })

  // With no upload configured, a file that is not on disk is not resolvable —
  // which is exactly the broken-deploy case the check exists to catch.
  it('would flag a missing file rather than pass it to ffmpeg', async () => {
    expect(await resolvable('assets/audio/themes/does-not-exist.mp3')).toBe(false)
  })
})
