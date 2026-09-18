import sharp from 'sharp'

export interface RawImage {
  /** BGR, interleaved, 8-bit — matches what OpenCV hands the models. */
  bgr: Uint8Array
  width: number
  height: number
}

/** Decode any supported image to interleaved BGR. */
export async function decode(buf: Buffer | Uint8Array): Promise<RawImage> {
  const { data, info } = await sharp(Buffer.from(buf))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const n = info.width * info.height
  const bgr = new Uint8Array(n * 3)
  for (let i = 0; i < n; i++) {
    bgr[i * 3] = data[i * 3 + 2]
    bgr[i * 3 + 1] = data[i * 3 + 1]
    bgr[i * 3 + 2] = data[i * 3]
  }
  return { bgr, width: info.width, height: info.height }
}

/** Encode interleaved BGR back to PNG. */
export async function encodePng(img: RawImage): Promise<Buffer> {
  const n = img.width * img.height
  const rgb = Buffer.allocUnsafe(n * 3)
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = img.bgr[i * 3 + 2]
    rgb[i * 3 + 1] = img.bgr[i * 3 + 1]
    rgb[i * 3 + 2] = img.bgr[i * 3]
  }
  return sharp(rgb, { raw: { width: img.width, height: img.height, channels: 3 } })
    .png()
    .toBuffer()
}

/** Crop a sub-rectangle. Coordinates are clamped to the image. */
export function crop(img: RawImage, x0: number, y0: number, x1: number, y1: number): RawImage {
  const X0 = Math.max(0, Math.min(img.width, Math.round(x0)))
  const Y0 = Math.max(0, Math.min(img.height, Math.round(y0)))
  const X1 = Math.max(X0 + 1, Math.min(img.width, Math.round(x1)))
  const Y1 = Math.max(Y0 + 1, Math.min(img.height, Math.round(y1)))
  const w = X1 - X0
  const h = Y1 - Y0
  const out = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    const src = ((Y0 + y) * img.width + X0) * 3
    out.set(img.bgr.subarray(src, src + w * 3), y * w * 3)
  }
  return { bgr: out, width: w, height: h }
}

/** Bilinear resize. */
export function resize(img: RawImage, w: number, h: number): RawImage {
  const out = new Uint8Array(w * h * 3)
  const sx = img.width / w
  const sy = img.height / h
  for (let y = 0; y < h; y++) {
    const fy = Math.min(img.height - 1, (y + 0.5) * sy - 0.5)
    const y0 = Math.max(0, Math.floor(fy))
    const y1 = Math.min(img.height - 1, y0 + 1)
    const wy = fy - y0
    for (let x = 0; x < w; x++) {
      const fx = Math.min(img.width - 1, (x + 0.5) * sx - 0.5)
      const x0 = Math.max(0, Math.floor(fx))
      const x1 = Math.min(img.width - 1, x0 + 1)
      const wx = fx - x0
      for (let c = 0; c < 3; c++) {
        const p00 = img.bgr[(y0 * img.width + x0) * 3 + c]
        const p01 = img.bgr[(y0 * img.width + x1) * 3 + c]
        const p10 = img.bgr[(y1 * img.width + x0) * 3 + c]
        const p11 = img.bgr[(y1 * img.width + x1) * 3 + c]
        const top = p00 + (p01 - p00) * wx
        const bot = p10 + (p11 - p10) * wx
        out[(y * w + x) * 3 + c] = Math.round(top + (bot - top) * wy)
      }
    }
  }
  return { bgr: out, width: w, height: h }
}

/** NCHW float32 tensor data in BGR order, unnormalised (0-255), as YuNet expects. */
export function toNchw(img: RawImage): Float32Array {
  const n = img.width * img.height
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    out[i] = img.bgr[i * 3]
    out[n + i] = img.bgr[i * 3 + 1]
    out[2 * n + i] = img.bgr[i * 3 + 2]
  }
  return out
}

export interface Letterboxed {
  image: RawImage
  scale: number
}

/**
 * Fit an image into a square canvas, preserving aspect, padded at the
 * bottom-right. YuNet's ONNX graph has a static 640x640 input, so every
 * image is scaled into that box and coordinates are mapped back by `scale`.
 */
export function letterbox(img: RawImage, size: number): Letterboxed {
  const scale = Math.min(size / img.width, size / img.height)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const scaled = resize(img, w, h)
  const canvas = new Uint8Array(size * size * 3)
  for (let y = 0; y < h; y++) {
    canvas.set(scaled.bgr.subarray(y * w * 3, (y + 1) * w * 3), y * size * 3)
  }
  return { image: { bgr: canvas, width: size, height: size }, scale }
}
