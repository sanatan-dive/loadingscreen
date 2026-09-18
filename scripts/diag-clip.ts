import { readFileSync } from 'node:fs'
import { decode, detect, similarityTransform } from '../lib/identity'
import { headBox } from '../lib/composite'
import { getTemplate } from '../lib/template'

async function main() {
  const shots = getTemplate('gta-redcarpet').shots
  const raws = ['/tmp/tmpl1.png', '/tmp/tmpl2.png', '/tmp/tmpl3.png']

  for (let i = 0; i < 3; i++) {
    const frame = await decode(readFileSync(shots[i].file))
    const face = (await detect(frame))[0]
    const box = headBox(face, frame.width, frame.height)
    const bw = box.x1 - box.x0
    const bh = box.y1 - box.y0

    const cropFaces = await detect({
      bgr: frame.bgr, width: frame.width, height: frame.height,
    })
    // face coords relative to the box
    const cropFace = { ...face, x: face.x - box.x0, y: face.y - box.y0 }

    const gen = await decode(readFileSync(raws[i]))
    const genFace = (await detect(gen))[0]
    if (!genFace) { console.log(`shot ${i + 1}: no face in raw`); continue }

    const t = similarityTransform(genFace, cropFace)
    // Where does the generated image's top edge land in box coordinates?
    const topInBox = t.ty
    const leftInBox = t.tx
    const rightInBox = t.tx + gen.width * t.scale
    const botInBox = t.ty + gen.height * t.scale

    console.log(
      `shot ${i + 1}  box ${bw}x${bh}  gen ${gen.width}x${gen.height} scale=${t.scale.toFixed(2)}`
    )
    console.log(
      `   generated content covers box rows ${topInBox.toFixed(0)}..${botInBox.toFixed(0)}` +
      `, cols ${leftInBox.toFixed(0)}..${rightInBox.toFixed(0)}`
    )
    const gapTop = Math.max(0, topInBox)
    const gapLeft = Math.max(0, leftInBox)
    const gapRight = Math.max(0, bw - rightInBox)
    const gapBot = Math.max(0, bh - botInBox)
    console.log(
      `   UNCOVERED  top=${gapTop.toFixed(0)}px  left=${gapLeft.toFixed(0)}px` +
      `  right=${gapRight.toFixed(0)}px  bottom=${gapBot.toFixed(0)}px` +
      (gapTop > 2 ? '   <== HAIR CLIPPED HERE' : '')
    )
  }
}
main()
