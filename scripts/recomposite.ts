/** Re-run ONLY the composite step against saved raw model outputs. No API. */
import { readFileSync, writeFileSync } from 'node:fs'
import { decode, detect, crop as cropImage } from '../lib/identity'
import { encodePng } from '../lib/identity/image'
import { blend, headBox } from '../lib/composite'
import { getTemplate } from '../lib/template'

async function main() {
  const shots = getTemplate('gta-redcarpet').shots
  const raws = ['/tmp/tmpl1.png', '/tmp/tmpl2.png', '/tmp/tmpl3.png']

  for (let i = 0; i < 3; i++) {
    const frame = await decode(readFileSync(shots[i].file))
    const face = (await detect(frame))[0]
    const box = headBox(face, frame.width, frame.height)
    const cropped = cropImage(frame, box.x0, box.y0, box.x1, box.y1)
    const cropFace = (await detect(cropped))[0]

    const gen = await decode(readFileSync(raws[i]))
    const genFace = (await detect(gen))[0]
    if (!genFace) { console.log(`shot ${i + 1}: no face in raw`); continue }

    const merged = blend(frame, gen, genFace, cropFace, box)
    writeFileSync(`out/recomp_${i}.png`, await encodePng(merged))
    console.log(`  shot ${i + 1} -> out/recomp_${i}.png`)
  }
}
main()
