/**
 * A phone does not rotate the pixels when you turn it sideways — it stores them
 * as the sensor saw them and writes an EXIF orientation flag saying which way
 * is up. sharp does NOT apply that flag unless asked, so every portrait photo
 * from a phone was being decoded on its side, and YuNet does not find a face in
 * a sideways face.
 *
 * The user saw this as "we couldn't find a face in that photo" on a photo with
 * an obvious face in it, which is the worst error this product can give: it
 * blames a good photo and offers nothing to fix.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decode, detect } from '@/lib/identity'

const upright = readFileSync('tests/fixtures/user.png')
// Same photo, stored rotated with orientation 6 — what an iPhone writes.
const phone = readFileSync('tests/fixtures/user-exif-rotated.jpg')

describe('a photo taken on a phone held upright', () => {
  it('is decoded the way it is meant to be seen', async () => {
    const a = await decode(upright)
    const b = await decode(phone)
    // Without .rotate() this comes back 678x452 — the sensor's landscape frame
    // rather than the portrait photo the user actually took.
    expect([b.width, b.height]).toEqual([a.width, a.height])
  })

  // Detection alone does not catch this: YuNet found a face in the sideways
  // frame too. What moves is WHERE the face is, and the composite pastes by
  // that box — so a sideways decode puts a rotated face into the video.
  it('puts the face where it actually is', async () => {
    const centre = async (buf: Buffer) => {
      const img = await decode(buf)
      const [f] = await detect(img)
      return [(f.x + f.w / 2) / img.width, (f.y + f.h / 2) / img.height]
    }
    const [ax, ay] = await centre(upright)
    const [bx, by] = await centre(phone)
    expect(bx).toBeCloseTo(ax, 1)
    expect(by).toBeCloseTo(ay, 1)
  })
})
