import { similarityTransform, type Face, type RawImage } from '@/lib/identity'

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

/** Feathered ellipse, centred slightly high so hair is favoured over collar. */
export function featherMask(w: number, h: number, inset = 0.05, blur = 0.18): Float32Array {
  const m = new Float32Array(w * h)
  const cx = w / 2
  const cy = h * 0.46
  const ax = w * (0.5 - inset)
  const ay = h * (0.5 - inset)
  const feather = Math.max(w, h) * blur
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - cx) / ax, (y - cy) / ay)
      const px = (1 - d) * Math.min(ax, ay)
      m[y * w + x] = Math.max(0, Math.min(1, px / feather))
    }
  }
  return m
}

/**
 * Paste the generated head back into the original frame.
 *
 * Alignment is uniform scale + translate, never a stretch: the models return
 * roughly 2:3 whatever the input aspect, and stretching to fit visibly
 * distorts the head.
 */
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
  const mask = featherMask(bw, bh)
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
