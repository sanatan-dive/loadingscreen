/** Same raw model output, composited with each mask variant. No API. */
import { readFileSync, writeFileSync } from 'node:fs'
import { decode, detect, crop as cropImage, similarityTransform } from '../lib/identity'
import { encodePng } from '../lib/identity/image'
import { headBox, featherMask, openEdges, type Box } from '../lib/composite'
import type { RawImage, Face } from '../lib/identity'
import { getTemplate } from '../lib/template'

function blendWith(
  frame: RawImage, head: RawImage, srcFace: Face, dstFace: Face, box: Box, mask: Float32Array
): RawImage {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0
  const t = similarityTransform(srcFace, dstFace)
  const out = Uint8Array.from(frame.bgr)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const a = mask[y * bw + x]
      if (a <= 0) continue
      const sx = Math.round((x - t.tx) / t.scale)
      const sy = Math.round((y - t.ty) / t.scale)
      if (sx < 0 || sy < 0 || sx >= head.width || sy >= head.height) continue
      const di = ((box.y0 + y) * frame.width + (box.x0 + x)) * 3
      const si = (sy * head.width + sx) * 3
      for (let c = 0; c < 3; c++) out[di + c] = Math.round(head.bgr[si + c] * a + frame.bgr[di + c] * (1 - a))
    }
  }
  return { bgr: out, width: frame.width, height: frame.height }
}

async function main() {
  const shots = getTemplate('gta-redcarpet').shots
  const raws = ['/tmp/tmpl1.png', '/tmp/tmpl2.png', '/tmp/tmpl3.png']
  for (let i = 0; i < 3; i++) {
    const frame = await decode(readFileSync(shots[i].file))
    const face = (await detect(frame))[0]
    const box = headBox(face, frame.width, frame.height)
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0
    const cropped = cropImage(frame, box.x0, box.y0, box.x1, box.y1)
    const cropFace = (await detect(cropped))[0]
    const gen = await decode(readFileSync(raws[i]))
    const genFace = (await detect(gen))[0]
    if (!genFace) continue

    const all = featherMask(bw, bh, { top: true, right: true, bottom: true, left: true })
    const clamped = featherMask(bw, bh, openEdges(box, frame.width, frame.height))

    writeFileSync(`out/ab_all_${i}.png`, await encodePng(blendWith(frame, gen, genFace, cropFace, box, all)))
    writeFileSync(`out/ab_clamped_${i}.png`, await encodePng(blendWith(frame, gen, genFace, cropFace, box, clamped)))
    const e = openEdges(box, frame.width, frame.height)
    console.log(`  shot ${i + 1}: box ${bw}x${bh}  openEdges=${JSON.stringify(e)}`)
  }
}
main()
