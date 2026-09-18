import { readFileSync } from 'node:fs'
import { decode, detect, embed, crop } from '../lib/identity'
import { encodePng } from '../lib/identity/image'
import { blend, headBox } from '../lib/composite'

const t = async <T>(label: string, fn: () => Promise<T> | T): Promise<T> => {
  const s = Date.now()
  const r = await fn()
  console.log(`  ${label.padEnd(28)} ${String(Date.now() - s).padStart(6)} ms`)
  return r
}

async function main() {
  const buf = readFileSync('assets/templates/gta-redcarpet/shot_1.png')
  const frame = await t('decode 960x720', () => decode(buf))
  const faces = await t('detect', () => detect(frame))
  await t('embed', () => embed(frame, faces[0]))
  const box = headBox(faces[0], frame.width, frame.height)
  const cropped = await t('crop', () => crop(frame, box.x0, box.y0, box.x1, box.y1))
  await t('encodePng (crop)', () => encodePng(cropped))
  const big = await t('decode model-size 832x1248', () =>
    decode(readFileSync('tests/fixtures/user.png'))
  )
  await t('blend', () => blend(frame, big, faces[0], faces[0], box))
  await t('encodePng (full frame)', () => encodePng(frame))
}
main()
