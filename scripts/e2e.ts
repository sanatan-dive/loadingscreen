import { readFileSync, copyFileSync } from 'node:fs'
import { generate } from '../lib/pipeline'

async function main() {
  const [photo, out, theme = 'gta-5'] = process.argv.slice(2)
  if (!photo || !out) throw new Error('usage: e2e <photo> <out.mp4> [themeId]')

  const t0 = Date.now()
  let spent = 0
  for await (const ev of generate({
    photo: readFileSync(photo),
    templateId: 'gta-redcarpet',
    themeId: theme,
  })) {
    const at = ((Date.now() - t0) / 1000).toFixed(1).padStart(5)
    if (ev.type === 'shot') {
      console.log(`  ${at}s  shot ${ev.index + 1} landed   identity=${ev.vsUser.toFixed(3)}`)
    } else if (ev.type === 'done') {
      spent = ev.costUsd
      copyFileSync(ev.video, out)
      console.log(`  ${at}s  rendered -> ${out}`)
      console.log(`\n  TOTAL ${(ev.ms / 1000).toFixed(1)}s   $${spent.toFixed(4)}`)
    } else {
      console.error(`  ${at}s  ERROR: ${ev.message}`)
      process.exit(1)
    }
  }
}
main()
