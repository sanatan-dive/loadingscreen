import { readFileSync } from 'node:fs'
import { decode, detect } from '../lib/identity'

const golden = JSON.parse(readFileSync('tests/fixtures/golden.json', 'utf8'))
async function main() {
  for (const k of ['shot_1', 'shot_2', 'shot_3', 'user']) {
    const g = golden[k]
    const f = (await detect(await decode(readFileSync(g.path))))[0]
    const [gx, gy, gw, gh] = g.faces[0]
    const worst = Math.max(Math.abs(f.x - gx), Math.abs(f.y - gy), Math.abs(f.w - gw), Math.abs(f.h - gh))
    console.log(
      k.padEnd(8),
      'delta', [f.x - gx, f.y - gy, f.w - gw, f.h - gh].map((v) => v.toFixed(1)).join(', ').padEnd(28),
      'worst', worst.toFixed(1).padStart(6),
      '=', ((worst / gw) * 100).toFixed(1) + '% of face width'
    )
  }
}
main()
