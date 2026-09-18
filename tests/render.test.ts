import { describe, it, expect } from 'vitest'
import { buildFiltergraph, buildArgs } from '@/lib/render'

describe('filtergraph', () => {
  const fg = buildFiltergraph()

  it('pans horizontally at the measured rate', () => {
    expect(fg).toContain("-8.7*t")
  })

  it('has no vertical drift', () => {
    expect(fg).toMatch(/y=36/)
  })

  it('has NO zoom - the reference measured scale 1.00', () => {
    expect(fg).not.toContain('zoompan')
  })

  it('upscales to the pan source size, not the output size', () => {
    expect(fg).toContain('scale=1056:792')
  })

  it('places crossfades at the measured offsets', () => {
    expect(fg).toContain('offset=4.667')
    expect(fg).toContain('offset=9.333')
  })
})

describe('ffmpeg args', () => {
  const shots: [string, string, string] = ['a.png', 'b.png', 'c.png']

  it('produces a 15 second faststart mp4', () => {
    const a = buildArgs(shots, 'x.mp3', 'o.mp4', { cueStart: 6, silent: false })
    expect(a).toContain('+faststart')
    expect(a[a.indexOf('-t') + 1]).toBe('15')
    expect(a).toContain('yuv420p')
  })

  it('normalises loudness so switching themes does not change volume', () => {
    const a = buildArgs(shots, 'x.mp3', 'o.mp4', { cueStart: 6, silent: false })
    expect(a.join(' ')).toContain('loudnorm=I=-14:TP=-1.5')
  })

  it('seeks to the theme cue point', () => {
    const a = buildArgs(shots, 'x.mp3', 'o.mp4', { cueStart: 6, silent: false })
    expect(a[a.indexOf('-ss') + 1]).toBe('6')
  })

  it('omits audio entirely for the silent TikTok export', () => {
    const a = buildArgs(shots, 'x.mp3', 'o.mp4', { cueStart: 6, silent: true })
    expect(a).toContain('-an')
    expect(a).not.toContain('x.mp3')
  })
})
