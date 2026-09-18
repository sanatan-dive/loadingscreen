import type { RawImage } from '@/lib/identity'

/**
 * Match a generated head's colour to the frame it is being pasted into.
 *
 * Feathering hides a seam but not a tonal difference: the model returns images
 * with its own exposure and white balance, so the whole pasted region reads as
 * a lighter or warmer rectangle regardless of how soft the edge is.
 *
 * Statistics are sampled from the BORDER band only — the ring where the two
 * images must agree for the join to disappear. Sampling the whole box would
 * drag the correction toward the face, which legitimately differs between the
 * two images and is not what we are trying to match.
 */

export interface ChannelStats {
  mean: [number, number, number]
  std: [number, number, number]
}

/** Mean and standard deviation over a border ring `band` pixels thick. */
export function borderStats(img: RawImage, band: number): ChannelStats {
  const { bgr, width: w, height: h } = img
  const b = Math.max(1, Math.min(band, Math.floor(Math.min(w, h) / 2) - 1))
  let n = 0
  const sum = [0, 0, 0]
  const sumSq = [0, 0, 0]

  for (let y = 0; y < h; y++) {
    const edgeRow = y < b || y >= h - b
    for (let x = 0; x < w; x++) {
      if (!edgeRow && x >= b && x < w - b) {
        // Skip the interior in one jump rather than testing every pixel.
        x = w - b - 1
        continue
      }
      const i = (y * w + x) * 3
      for (let c = 0; c < 3; c++) {
        const v = bgr[i + c]
        sum[c] += v
        sumSq[c] += v * v
      }
      n++
    }
  }
  if (n === 0) return { mean: [0, 0, 0], std: [1, 1, 1] }

  const mean = [0, 0, 0] as [number, number, number]
  const std = [1, 1, 1] as [number, number, number]
  for (let c = 0; c < 3; c++) {
    mean[c] = sum[c] / n
    std[c] = Math.sqrt(Math.max(1e-6, sumSq[c] / n - mean[c] * mean[c]))
  }
  return { mean, std }
}

/**
 * Per-channel gain and offset mapping `from` statistics onto `to`.
 * Gain is clamped: a large correction means the border samples disagree for a
 * reason other than exposure, and forcing it would wreck the image.
 */
export function matchColour(
  img: RawImage,
  from: ChannelStats,
  to: ChannelStats,
  maxGain = 1.35
): RawImage {
  const out = new Uint8Array(img.bgr.length)
  const gain = [0, 0, 0]
  const offset = [0, 0, 0]

  for (let c = 0; c < 3; c++) {
    const g = Math.min(maxGain, Math.max(1 / maxGain, to.std[c] / from.std[c]))
    gain[c] = g
    offset[c] = to.mean[c] - g * from.mean[c]
  }

  for (let i = 0; i < img.bgr.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = img.bgr[i + c] * gain[c] + offset[c]
      out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
    }
  }
  return { bgr: out, width: img.width, height: img.height }
}
