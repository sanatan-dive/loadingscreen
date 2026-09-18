import { similarityTransform, type Face, type RawImage } from '@/lib/identity'
import { featherMask, type OpenEdges } from './mask'

export { featherMask }
export type { OpenEdges }

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Padding factors carried over from the validated spike. */
const PAD_X = 1.5
const PAD_UP = 1.5
const PAD_DOWN = 1.7

export function headBox(f: Face, imgW: number, imgH: number): Box {
  const cx = f.x + f.w / 2
  const cy = f.y + f.h / 2
  return {
    x0: Math.max(0, Math.round(cx - f.w * PAD_X)),
    y0: Math.max(0, Math.round(cy - f.h * PAD_UP)),
    x1: Math.min(imgW, Math.round(cx + f.w * PAD_X)),
    y1: Math.min(imgH, Math.round(cy + f.h * PAD_DOWN)),
  }
}

/**
 * Paste the generated head back into the original frame.
 *
 * Alignment is uniform scale + translate, never a stretch: the models return
 * roughly 2:3 whatever the input aspect, and stretching to fit visibly
 * distorts the head.
 */
/**
 * Which box edges sit inside the frame. An edge clamped to the frame boundary
 * has nothing outside it to blend into, so it must not be feathered.
 */
export function openEdges(box: Box, frameW: number, frameH: number): OpenEdges {
  return {
    top: box.y0 > 0,
    left: box.x0 > 0,
    right: box.x1 < frameW,
    bottom: box.y1 < frameH,
  }
}

export function blend(
  frame: RawImage,
  head: RawImage,
  srcFace: Face,
  dstFace: Face,
  box: Box
): RawImage {
  const bw = box.x1 - box.x0
  const bh = box.y1 - box.y0
  const t = similarityTransform(srcFace, dstFace)
  const mask = featherMask(bw, bh, openEdges(box, frame.width, frame.height))
  const out = Uint8Array.from(frame.bgr)

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const a = mask[y * bw + x]
      if (a <= 0) continue
      const sx = Math.round((x - t.tx) / t.scale)
      const sy = Math.round((y - t.ty) / t.scale)
      if (sx < 0 || sy < 0 || sx >= head.width || sy >= head.height) continue
      const di = ((box.y0 + y) * frame.width + (box.x0 + x)) * 3
      const si = (sy * head.width + sx) * 3
      for (let c = 0; c < 3; c++) {
        out[di + c] = Math.round(head.bgr[si + c] * a + frame.bgr[di + c] * (1 - a))
      }
    }
  }
  return { bgr: out, width: frame.width, height: frame.height }
}
