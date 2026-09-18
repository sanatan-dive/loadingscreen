/**
 * The artifact is not a hard edge — the feather hides that. It is the box
 * INTERIOR sitting at a different exposure from the surrounding frame, which
 * reads as a rectangle. So compare backdrop luma inside vs outside the box.
 */
import { readFileSync } from 'node:fs'
import { decode, detect } from '../lib/identity'
import { headBox } from '../lib/composite'
import { getTemplate } from '../lib/template'
import type { RawImage } from '../lib/identity'

function meanLuma(img: RawImage, x0: number, x1: number, y0: number, y1: number): number {
  let s = 0, n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 3
      s += (img.bgr[i] + img.bgr[i + 1] + img.bgr[i + 2]) / 3
      n++
    }
  }
  return n ? s / n : 0
}

async function main() {
  const shots = getTemplate('gta-redcarpet').shots
  for (let i = 0; i < 3; i++) {
    const frame = await decode(readFileSync(shots[i].file))
    const face = (await detect(frame))[0]
    const box = headBox(face, frame.width, frame.height)
    const out: string[] = []

    for (const [label, pat] of [['before', 'out/ab_clamped_%d.png'], ['after ', 'out/recomp_%d.png']] as const) {
      const img = await decode(readFileSync(pat.replace('%d', String(i))))
      // A backdrop band well above the shoulders, away from the face.
      const y0 = 8, y1 = 120
      // 60px strips just inside and just outside each vertical edge.
      const samples: number[] = []
      if (box.x0 > 70) {
        samples.push(
          Math.abs(
            meanLuma(img, box.x0 + 8, box.x0 + 68, y0, y1) -
            meanLuma(img, box.x0 - 68, box.x0 - 8, y0, y1)
          )
        )
      }
      if (box.x1 < img.width - 70) {
        samples.push(
          Math.abs(
            meanLuma(img, box.x1 - 68, box.x1 - 8, y0, y1) -
            meanLuma(img, box.x1 + 8, box.x1 + 68, y0, y1)
          )
        )
      }
      const worst = samples.length ? Math.max(...samples) : NaN
      out.push(`${label} Δluma=${Number.isNaN(worst) ? ' n/a ' : worst.toFixed(1).padStart(5)}`)
    }
    console.log(`  shot ${i + 1}  ${out.join('   ')}`)
  }
  console.log('\n  Δluma = backdrop brightness difference inside vs outside the box')
  console.log('  (this is what makes the pasted region read as a rectangle)')
}
main()
