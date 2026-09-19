/**
 * Does cropping the user's photo to the head before sending it as the identity
 * reference stop the model handing back the ORIGINAL face?
 *
 * Production logs showed the cheap model returning the template's own subject
 * over and over — vsOriginal 0.81-0.90 while vsUser sat at 0.16-0.34. The
 * suspicion is framing: the template side sends a head-box CROP as IMAGE A,
 * while the user side sends the WHOLE uploaded photo as IMAGE B. On a wide
 * shot the face the model is asked to copy is a small patch of a big picture.
 *
 * Same source photo, one variable, one model call each. Writes both results so
 * they can be looked at, not just measured.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { decode, detect, embed, cosine, crop as cropImage } from '../lib/identity'
import { encodePng } from '../lib/identity/image'
import { headBox } from '../lib/composite'
import { edit } from '../lib/provider'
import { getTemplate } from '../lib/template'

const MODEL = 'google/gemini-3.1-flash-lite-image'

async function main() {
  const src = process.argv[2] ?? 'tests/fixtures/user.png'
  const shot = getTemplate('gta-redcarpet').shots[0]

  // The template half, exactly as the pipeline builds it.
  const frame = await decode(readFileSync(shot.file))
  const tFace = (await detect(frame))[0]
  const tBox = headBox(tFace, frame.width, frame.height)
  const tCrop = await encodePng(cropImage(frame, tBox.x0, tBox.y0, tBox.x1, tBox.y1))
  const originalEmbedding = await embed(frame, tFace)

  const userBuf = readFileSync(src)
  const userImg = await decode(userBuf)
  const uFace = (await detect(userImg))[0]
  if (!uFace) throw new Error('no face in ' + src)
  const userEmbedding = await embed(userImg, uFace)

  const uBox = headBox(uFace, userImg.width, userImg.height)
  const variants: [string, Buffer][] = [
    // What production sends today: the whole picture.
    ['whole', await encodePng(userImg)],
    // The proposed fix: the same framing the template side uses.
    ['headcrop', await encodePng(cropImage(userImg, uBox.x0, uBox.y0, uBox.x1, uBox.y1))],
  ]

  const facePct = ((uFace.w * uFace.h) / (userImg.width * userImg.height)) * 100
  console.log(`source ${src}  ${userImg.width}x${userImg.height}  face ${facePct.toFixed(1)}%\n`)

  let spent = 0
  for (const [name, facePng] of variants) {
    const r = await edit({ crop: tCrop, face: facePng, model: MODEL, expression: shot.expression })
    spent += r.costUsd
    const out = await decode(r.image)
    const outFaces = await detect(out)
    const e = outFaces.length ? await embed(out, outFaces[0]) : null
    const vsUser = cosine(e, userEmbedding)
    const vsOriginal = cosine(e, originalEmbedding)
    const file = `/tmp/ab_${name}.png`
    writeFileSync(file, r.image)
    await sharp(r.image).resize(360).toFile(`/tmp/ab_${name}_small.png`)
    console.log(
      `${name.padEnd(9)} vsUser=${vsUser.toFixed(3)} vsOriginal=${vsOriginal.toFixed(3)} ` +
        `${vsUser >= 0.55 ? 'PASS' : 'REJECT'}  $${r.costUsd.toFixed(4)}  -> ${file}`
    )
  }
  console.log(`\ntotal spend $${spent.toFixed(4)}`)
}
main()
