/**
 * What the model is shown as "the identity to insert".
 *
 * The template half of the prompt has always been a head-box crop. The user
 * half was the entire uploaded photograph, so on an ordinary wide shot the face
 * the model was asked to copy was a small patch of a big picture — and
 * production logs showed it giving back the template's own subject instead
 * (vsOriginal 0.81-0.90 against vsUser 0.16-0.34).
 *
 * Measured, same source, one variable: whole photo 0.490 (rejected) vs head
 * crop 0.869 (passes). This test pins the framing.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { decode, detect } from '@/lib/identity'
import { headBox } from '@/lib/composite'

const edit = vi.fn()
vi.mock('@/lib/provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/provider')>()),
  edit,
}))

const { generate } = await import('@/lib/pipeline')

/** A normal photo of a person standing somewhere, not a headshot. */
async function wideShot(): Promise<Buffer> {
  const src = readFileSync('tests/fixtures/user.png')
  const m = await sharp(src).metadata()
  return sharp({
    create: {
      width: m.width! * 3,
      height: m.height! * 3,
      channels: 3,
      background: { r: 38, g: 40, b: 46 },
    },
  })
    .composite([{ input: src, gravity: 'center' }])
    .png()
    .toBuffer()
}

describe('the identity reference sent to the model', () => {
  it('is the head, not the whole photograph', async () => {
    const photo = await wideShot()
    edit.mockRejectedValue(new Error('stop after the first call'))

    // Drain the generator; the first edit() call is all this test needs.
    for await (const _ of generate({ photo, templateId: 'gta-redcarpet', themeId: 'gta-5' })) {
      // no-op
    }

    expect(edit).toHaveBeenCalled()
    const sent = await decode(edit.mock.calls[0][0].face)
    const full = await decode(photo)

    // The expected crop, computed the same way the composite does it.
    const box = headBox((await detect(full))[0], full.width, full.height)
    expect(sent.width).toBe(box.x1 - box.x0)
    expect(sent.height).toBe(box.y1 - box.y0)

    // And it is genuinely a crop: a wide shot is mostly not face.
    expect(sent.width * sent.height).toBeLessThan(full.width * full.height * 0.5)
  })
})
