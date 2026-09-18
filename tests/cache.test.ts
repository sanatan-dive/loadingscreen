import { describe, it, expect } from 'vitest'
import { shotKey, renderKey, photoHash } from '@/lib/cache'

const base = {
  photoHash: 'abc',
  templateId: 'gta-redcarpet',
  shotId: 'shot_1',
  appearance: {},
}

describe('cache keys', () => {
  it('is stable for identical input', () => {
    expect(shotKey(base)).toBe(shotKey({ ...base }))
  })

  it('changes when appearance changes', () => {
    expect(shotKey(base)).not.toBe(shotKey({ ...base, appearance: { skinTone: 'lighter' } }))
  })

  it('differs per shot', () => {
    expect(shotKey(base)).not.toBe(shotKey({ ...base, shotId: 'shot_2' }))
  })

  const renderBase = {
    shotKeys: ['a', 'b', 'c'],
    themeId: 'gta-5',
    cueStart: 6,
    watermark: true,
    silent: false,
  }

  it('render key changes with theme', () => {
    expect(renderKey(renderBase)).not.toBe(
      renderKey({ ...renderBase, themeId: 'gta-4', cueStart: 1 })
    )
  })

  it('render key changes when the watermark is removed', () => {
    expect(renderKey(renderBase)).not.toBe(renderKey({ ...renderBase, watermark: false }))
  })

  it('photoHash is content-addressed', () => {
    expect(photoHash(Buffer.from('x'))).toBe(photoHash(Buffer.from('x')))
    expect(photoHash(Buffer.from('x'))).not.toBe(photoHash(Buffer.from('y')))
  })
})
