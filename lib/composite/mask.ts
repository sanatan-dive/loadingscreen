/**
 * Coverage mask for pasting a generated head back into the frame.
 *
 * The first version was an ellipse inset inside the head box. Its top edge ran
 * straight across the forehead, so a wide feather blended the generated hair
 * into the ORIGINAL hair and produced a smeared, doubled hairline — the single
 * worst artifact in the output.
 *
 * A hairline is the worst place to put a soft blend. So the mask now covers
 * essentially the whole crop and feathers only at the crop boundary, where the
 * content on both sides is backdrop and shoulder rather than face. The head is
 * therefore taken wholly from the generated image and never cross-faded.
 */

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

export function featherMask(w: number, h: number, feather = 0.11): Float32Array {
  const m = new Float32Array(w * h)
  // Feather band in pixels, clamped so small crops still get a usable edge.
  const f = Math.max(6, Math.min(w, h) * feather)

  for (let y = 0; y < h; y++) {
    const dy = Math.min(y, h - 1 - y)
    for (let x = 0; x < w; x++) {
      const d = Math.min(x, w - 1 - x, dy)
      m[y * w + x] = smoothstep(d / f)
    }
  }
  return m
}
