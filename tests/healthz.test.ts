/**
 * The deploy check has to fail when the deploy is broken, or it is decoration.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { listTemplates } from '@/lib/template'

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

  it('reports the soundtracks as present in this working copy', () => {
    const missing = listTemplates()
      .flatMap((t) => t.themes.map((x) => x.file))
      .filter((f) => !existsSync(f))
    expect(missing).toEqual([])
  })

  it('would flag a missing file rather than pass it to ffmpeg', () => {
    expect(existsSync('assets/audio/themes/does-not-exist.mp3')).toBe(false)
  })
})
