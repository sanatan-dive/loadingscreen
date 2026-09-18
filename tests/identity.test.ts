import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decode, detect, embed, cosine, SAME } from '@/lib/identity'

const golden = JSON.parse(readFileSync('tests/fixtures/golden.json', 'utf8'))
const load = async (p: string) => decode(readFileSync(p))
const oracle = (k: string) => Float32Array.from(golden[k].embedding)

describe('identity', () => {
  // The oracle detected at native resolution; we letterbox to the graph's
  // static 640x640. A few px of disagreement is the scaling, not a bug.
  for (const key of ['shot_1', 'shot_2', 'shot_3', 'user']) {
    it(`finds one face in ${key}, agreeing with the oracle`, async () => {
      const g = golden[key]
      const faces = await detect(await load(g.path))
      expect(faces).toHaveLength(1)
      const [gx, gy, gw, gh] = g.faces[0]
      const tol = gw * 0.08   // small images upscale into the 640 box, adding error
      expect(Math.abs(faces[0].x - gx)).toBeLessThan(tol)
      expect(Math.abs(faces[0].y - gy)).toBeLessThan(tol)
      expect(Math.abs(faces[0].w - gw)).toBeLessThan(tol)
      expect(Math.abs(faces[0].h - gh)).toBeLessThan(tol)
    })
  }

  it('a face matches itself', async () => {
    const e = await embed(await load('tests/fixtures/user.png'))
    expect(cosine(e, e)).toBeGreaterThan(0.99)
  })

  it('separates two different people', async () => {
    const a = await embed(await load('assets/templates/gta-redcarpet/shot_1.png'))
    const b = await embed(await load('tests/fixtures/user.png'))
    expect(cosine(a, b)).toBeLessThan(SAME)
  })

  // The property that matters across implementations: our embedding of a
  // person must resemble the oracle's embedding of THAT person far more than
  // the oracle's embedding of anyone else.
  it('agrees with the oracle on who is who', async () => {
    const ours = await embed(await load('tests/fixtures/user.png'))
    const same = cosine(ours, oracle('user'))
    const other = cosine(ours, oracle('shot_1'))
    expect(same).toBeGreaterThan(SAME)
    expect(same).toBeGreaterThan(other + 0.4)
  })

  it('is safe under concurrency', async () => {
    const files = [1, 2, 3].map((i) => `assets/templates/gta-redcarpet/shot_${i}.png`)
    const runs = Array.from({ length: 12 }, (_, i) => files[i % 3])
    const counts = await Promise.all(runs.map(async (f) => (await detect(await load(f))).length))
    expect(counts.every((n) => n === 1)).toBe(true)
  })
})
