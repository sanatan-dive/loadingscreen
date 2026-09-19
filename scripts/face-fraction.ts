/**
 * How much of a photo is actually the face?
 *
 * The whole user photo is sent to the model as the identity reference, so a
 * wide shot gives it a face a few pixels across to work from. This prints the
 * fraction, with no API spend, so a failing photo can be compared against the
 * headshot the pipeline was benchmarked on.
 */
import { readFileSync } from 'node:fs'
import { decode, detect } from '@/lib/identity'

async function main() {
  for (const f of process.argv.slice(2)) {
    const img = await decode(readFileSync(f))
    const faces = await detect(img)
    if (!faces.length) {
      console.log(`${f}: NO FACE (${img.width}x${img.height})`)
      continue
    }
    const [fc] = faces
    const frac = (fc.w * fc.h) / (img.width * img.height)
    console.log(
      `${f}\n  image ${img.width}x${img.height}  face ${Math.round(fc.w)}x${Math.round(fc.h)}` +
        `  = ${(frac * 100).toFixed(1)}% of the picture`
    )
  }
}
main()
