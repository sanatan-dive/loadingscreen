import { readFileSync, writeFileSync } from 'node:fs'
import { decode, embed } from '../lib/identity'
import { swapShot } from '../lib/pipeline'
import { getTemplate } from '../lib/template'

async function main() {
  const [photo, out, idx = '0'] = process.argv.slice(2)
  const shot = getTemplate('gta-redcarpet').shots[Number(idx)]
  const buf = readFileSync(photo)
  const userEmbedding = await embed(await decode(buf))
  const r = await swapShot({ shot, facePng: buf, userEmbedding })
  if (!r.ok) throw new Error(r.reason)
  writeFileSync(out, r.image!)
  console.log(`  ${shot.id}  identity=${r.vsUser.toFixed(3)}  $${r.costUsd.toFixed(4)} -> ${out}`)
}
main()
