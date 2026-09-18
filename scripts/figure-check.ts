/**
 * Run the public-figure classifier against real photos and print the verdict.
 * Costs about $0.0005 per file. Usage:
 *   npx tsx scripts/figure-check.ts <photo> [photo...]
 */
import { readFileSync } from 'node:fs'

import { classify, CLASSIFY_MODEL } from '../lib/provider/classify'
import { FIGURE_CONFIDENCE } from '../lib/limits/figure'



async function main() {
  const files = process.argv.slice(2)
  console.log(`model: ${CLASSIFY_MODEL}   refuse at confidence >= ${FIGURE_CONFIDENCE}\n`)
  let total = 0

  for (const f of files) {
    const started = Date.now()
    try {
      const v = await classify(readFileSync(f))
      total += v.costUsd
      const refused = v.known && v.confidence >= FIGURE_CONFIDENCE
      console.log(
        `${refused ? 'REFUSE' : 'ALLOW '}  ${f}\n` +
          `         known=${v.known} name=${v.name ?? '-'} confidence=${v.confidence} ` +
          `$${v.costUsd.toFixed(5)} ${Date.now() - started}ms\n`
      )
    } catch (err) {
      console.log(`ERROR   ${f}\n         ${err instanceof Error ? err.message : err}\n`)
    }
  }
  console.log(`total $${total.toFixed(5)}`)
}
main()
