import { describe, it, expect } from 'vitest'
import { toUserError } from '@/lib/user-error'

describe('toUserError', () => {
  it('never shows a user a spawn/ENOENT trace', () => {
    const e = toUserError(new Error('spawn /ROOT/node_modules/ffmpeg-static/ffmpeg ENOENT'))
    expect(e.message).not.toMatch(/spawn|ENOENT|ROOT|ffmpeg/i)
    expect(e.message).toMatch(/our end/i)
    expect(e.actionable).toBe(false)
  })

  it('keeps the technical detail for logging', () => {
    const e = toUserError(new Error('spawn /ROOT/x/ffmpeg ENOENT'))
    expect(e.detail).toContain('ENOENT')
  })

  it('does NOT blame the photo for our infrastructure failing', () => {
    const e = toUserError(new Error('spawn ffmpeg ENOENT'))
    expect(e.message).not.toMatch(/photo/i)
  })

  it('tells the user plainly when their photo has no face', () => {
    const e = toUserError(new Error("we couldn't find a face in that photo"))
    expect(e.actionable).toBe(true)
    expect(e.message).toMatch(/face/i)
  })

  it('handles the multi-face case', () => {
    expect(toUserError(new Error('that photo has more than one face')).actionable).toBe(true)
  })

  it('explains a weak likeness without jargon', () => {
    const e = toUserError(new Error('identity below threshold (0.412 < 0.55)'))
    expect(e.message).toMatch(/likeness/i)
    expect(e.message).not.toMatch(/0\.412|threshold/)
  })

  it('falls back safely for anything unrecognised', () => {
    const e = toUserError('kaboom')
    expect(e.message).toBe('Something went wrong. Try again.')
  })
})
