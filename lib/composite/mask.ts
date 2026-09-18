/**
 * Coverage mask for pasting a generated head back into the frame.
 *
 * Two lessons are baked in here, both learned from broken output:
 *
 * 1. Never feather across the face. The first version was an ellipse inset
 *    inside the head box; its top edge ran over the forehead, cross-fading
 *    generated hair into ORIGINAL hair and smearing the hairline.
 *
 * 2. Never feather an edge that sits on the frame boundary. The head box is
 *    routinely clamped to the top of the frame, and feathering there faded the
 *    generated hair out over the topmost ~80 rows — exactly where hair lives —
 *    producing a hard flat-topped head. A clamped edge has nothing outside it
 *    to blend into, so it must stay fully opaque.
 */

export interface OpenEdges {
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

export const ALL_OPEN: OpenEdges = { top: true, right: true, bottom: true, left: true }

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

export function featherMask(
  w: number,
  h: number,
  open: OpenEdges = ALL_OPEN,
  feather = 0.11
): Float32Array {
  const m = new Float32Array(w * h)
  const f = Math.max(6, Math.min(w, h) * feather)
  const FAR = Number.POSITIVE_INFINITY

  for (let y = 0; y < h; y++) {
    const dTop = open.top ? y : FAR
    const dBottom = open.bottom ? h - 1 - y : FAR
    for (let x = 0; x < w; x++) {
      const dLeft = open.left ? x : FAR
      const dRight = open.right ? w - 1 - x : FAR
      const d = Math.min(dTop, dBottom, dLeft, dRight)
      m[y * w + x] = d === FAR ? 1 : smoothstep(d / f)
    }
  }
  return m
}
