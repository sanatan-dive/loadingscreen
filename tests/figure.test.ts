import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { screenForPublicFigure, FIGURE_CONFIDENCE } from '@/lib/limits/figure'
import { LimitError } from '@/lib/limits'
import type { FigureVerdict } from '@/lib/provider'

const photo = readFileSync('tests/fixtures/user.png')

const verdict = (v: Partial<FigureVerdict> = {}): FigureVerdict => ({
  known: false,
  name: null,
  confidence: 0,
  costUsd: 0.00035,
  ...v,
})

/** A classifier answering the full frame first, then the head crop. */
const answers = (...vs: FigureVerdict[]) => {
  const fn = vi.fn<Classifier>()
  for (const v of vs) fn.mockResolvedValueOnce(v)
  fn.mockResolvedValue(vs[vs.length - 1])
  return fn
}
type Classifier = (photo: Buffer) => Promise<FigureVerdict>

const famous = (name: string, confidence = 1) => verdict({ known: true, name, confidence })

describe('public-figure screen', () => {
  it('lets an ordinary face through', async () => {
    await expect(screenForPublicFigure(photo, answers(verdict(), verdict()))).resolves.toBeDefined()
  })

  // Measured: Musk came back as "Elon Musk" at 1.0 from BOTH the full frame and
  // the head crop. Agreement across a reframe is what recognition looks like.
  it('refuses when both views name the same person', async () => {
    await expect(
      screenForPublicFigure(photo, answers(famous('Elon Musk'), famous('Elon Musk')))
    ).rejects.toThrow(LimitError)
  })

  it('refuses with 403, not a generic 400', async () => {
    const err = await screenForPublicFigure(
      photo,
      answers(famous('IShowSpeed'), famous('IShowSpeed'))
    ).catch((e) => e)
    expect(err).toBeInstanceOf(LimitError)
    expect((err as LimitError).status).toBe(403)
  })

  it('treats casing and punctuation as the same claim', async () => {
    await expect(
      screenForPublicFigure(photo, answers(famous('IShowSpeed'), famous('iShowSpeed.')))
    ).rejects.toThrow(LimitError)
  })

  /**
   * THE BUG THIS MODULE EXISTS TO SURVIVE. An ordinary man against a press wall
   * was named "Adin Ross" at 0.95 on the full frame and "Adama Diomande" at
   * 0.95 on the head crop of the same photo. A single confident answer would
   * have refused a real user their video.
   */
  it('lets a face through when the two views name DIFFERENT people', async () => {
    await expect(
      screenForPublicFigure(photo, answers(famous('Adin Ross', 0.95), famous('Adama Diomande', 0.95)))
    ).resolves.toBeDefined()
  })

  it('lets a face through when only one view recognises anyone', async () => {
    await expect(
      screenForPublicFigure(photo, answers(famous('Adin Ross', 0.95), verdict()))
    ).resolves.toBeDefined()
  })

  it('ignores an agreeing pair that the model is not confident about', async () => {
    const low = FIGURE_CONFIDENCE - 0.01
    await expect(
      screenForPublicFigure(photo, answers(famous('Elon Musk', low), famous('Elon Musk', low)))
    ).resolves.toBeDefined()
  })

  it('refuses at exactly the confidence threshold', async () => {
    await expect(
      screenForPublicFigure(
        photo,
        answers(famous('Elon Musk', FIGURE_CONFIDENCE), famous('Elon Musk', FIGURE_CONFIDENCE))
      )
    ).rejects.toThrow(LimitError)
  })

  it('never refuses on a known flag with no name attached', async () => {
    const nameless = verdict({ known: true, name: null, confidence: 0.99 })
    await expect(
      screenForPublicFigure(photo, answers(nameless, nameless))
    ).resolves.toBeDefined()
  })

  // Naming the person would be an accusation we cannot stand behind when the
  // classifier is wrong. Say what the rule is and what to do instead.
  it('does not name the person it thinks it saw', async () => {
    const err = await screenForPublicFigure(
      photo,
      answers(famous('Elon Musk'), famous('Elon Musk'))
    ).catch((e) => e)
    expect(err.message).not.toMatch(/Elon/i)
    expect(err.message).toMatch(/your own photo/i)
  })

  // The classifier and the image model are the same provider: if this call
  // cannot be made, the generation it guards would fail anyway. Closing costs
  // no availability we would really have had, and an open failure ships the
  // exact video this module exists to prevent.
  it('FAILS CLOSED when the classifier cannot be reached', async () => {
    const down = async () => {
      throw new Error('socket hang up')
    }
    const err = await screenForPublicFigure(photo, down).catch((e) => e)
    expect(err).toBeInstanceOf(LimitError)
    expect(err.status).toBe(503)
  })

  it('never leaks the provider error to the user', async () => {
    const down = async () => {
      throw new Error('provider 502: <html>upstream connect error</html>')
    }
    const err = await screenForPublicFigure(photo, down).catch((e) => e)
    expect(err.message).not.toMatch(/html|502|upstream/i)
  })

  it('asks about two framings, not one', async () => {
    const fn = answers(verdict(), verdict())
    await screenForPublicFigure(photo, fn)
    expect(fn).toHaveBeenCalledTimes(2)
    // Different views, or the comparison proves nothing.
    expect(fn.mock.calls[0][0].length).not.toBe(fn.mock.calls[1][0].length)
  })

  it('reports the cost of BOTH views so the ledger stays honest', async () => {
    const { costUsd } = await screenForPublicFigure(photo, answers(verdict(), verdict()))
    expect(costUsd).toBeCloseTo(0.0007, 6)
  })
})
