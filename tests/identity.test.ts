import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decode, detect, embed, cosine, SAME } from '@/lib/identity'

const golden = JSON.parse(readFileSync('tests/fixtures/golden.json', 'utf8'))
const load = async (p: string) => decode(readFileSync(p))
const oracle = (k: string) => Float32Array.from(golden[k].embedding)

describe('identity', () => {
  // The oracle uses the same 640x640 letterbox, so agreement should be
  // near-exact. A decode bug (wrong stride/prior) would be off by hundreds.
  for (const key of ['shot_1', 'shot_2', 'shot_3', 'user']) {
    it(`finds one face in ${key}, matching the oracle to within a pixel`, async () => {
      const g = golden[key]
      const faces = await detect(await load(g.path))
      expect(faces).toHaveLength(1)
      const [gx, gy, gw, gh] = g.faces[0]
      const tol = 1.0   // pixels
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

  // alignCrop differs slightly from OpenCV's (Umeyama least-squares vs
  // estimateAffinePartial2D/RANSAC), so chips are not bit-identical. That is
  // fine: production only ever compares our embeddings to our own. This test
  // exists to catch the embedding space drifting, not to demand parity.
  it('agrees with the oracle on who is who', async () => {
    const ours = await embed(await load('tests/fixtures/user.png'))
    const same = cosine(ours, oracle('user'))
    const other = cosine(ours, oracle('shot_1'))
    expect(same).toBeGreaterThan(SAME)
    expect(same).toBeGreaterThan(0.90)
    expect(same).toBeGreaterThan(other + 0.4)
  })

  it('is safe under concurrency', async () => {
    const files = [1, 2, 3].map((i) => `assets/templates/gta-redcarpet/shot_${i}.png`)
    const runs = Array.from({ length: 12 }, (_, i) => files[i % 3])
    const counts = await Promise.all(runs.map(async (f) => (await detect(await load(f))).length))
    expect(counts.every((n) => n === 1)).toBe(true)
  })
})
