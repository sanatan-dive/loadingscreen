import * as ort from 'onnxruntime-node'
import path from 'node:path'
import { decode, resize, crop, toNchw, letterbox, type RawImage } from './image'

ort.env.logLevel = 'error'

/** SFace's documented same-identity cosine threshold. */
export const SAME = 0.363
/** Our stricter production bar. Measured passes clustered at 0.67-0.90. */
export const GATE = 0.55

const SCORE_THRESHOLD = 0.6
const NMS_THRESHOLD = 0.3
const STRIDES = [8, 16, 32] as const
/** YuNet's ONNX graph has a static input size. */
const DETECT_SIZE = 640

export interface Face {
  x: number
  y: number
  w: number
  h: number
  /** 10 values: rightEye, leftEye, nose, rightMouth, leftMouth (x,y each). */
  landmarks: number[]
  score: number
}

const MODELS = path.join(process.cwd(), 'models')
let detPromise: Promise<ort.InferenceSession> | null = null
let recPromise: Promise<ort.InferenceSession> | null = null

// Sessions are safe to share; the mutable input-size state that caused the
// spike's race lives in OpenCV's wrapper, not here. Shape travels with the
// tensor on every run.
function detector() {
  detPromise ??= ort.InferenceSession.create(path.join(MODELS, 'yunet.onnx'))
  return detPromise
}
function recognizer() {
  recPromise ??= ort.InferenceSession.create(path.join(MODELS, 'sface.onnx'))
  return recPromise
}

function iou(a: Face, b: Face): number {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.w, b.x + b.w)
  const y1 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  const union = a.w * a.h + b.w * b.h - inter
  return union <= 0 ? 0 : inter / union
}

function nms(faces: Face[], threshold: number): Face[] {
  const sorted = [...faces].sort((p, q) => q.score - p.score)
  const kept: Face[] = []
  for (const f of sorted) {
    if (kept.every((k) => iou(k, f) <= threshold)) kept.push(f)
  }
  return kept
}

/**
 * Detect faces, largest first.
 *
 * The ONNX graph has a static 640x640 input (OpenCV reshapes it at runtime;
 * ONNX Runtime cannot), so images are letterboxed in and coordinates mapped
 * back out.
 */
export async function detect(img: RawImage): Promise<Face[]> {
  const session = await detector()
  // The graph's input is statically 640x640, so letterbox and map back.
  const { image: padded, scale } = letterbox(img, DETECT_SIZE)
  const tensor = new ort.Tensor('float32', toNchw(padded), [1, 3, DETECT_SIZE, DETECT_SIZE])
  const out = await session.run({ [session.inputNames[0]]: tensor })

  const candidates: Face[] = []
  for (const stride of STRIDES) {
    const cls = out[`cls_${stride}`].data as Float32Array
    const obj = out[`obj_${stride}`].data as Float32Array
    const bbox = out[`bbox_${stride}`].data as Float32Array
    const kps = out[`kps_${stride}`].data as Float32Array

    const cols = Math.ceil(DETECT_SIZE / stride)
    const rows = Math.ceil(DETECT_SIZE / stride)

    for (let i = 0; i < rows * cols; i++) {
      // Geometric mean of classification and objectness, as YuNet defines it.
      const score = Math.sqrt(Math.max(0, cls[i]) * Math.max(0, obj[i]))
      if (score < SCORE_THRESHOLD) continue

      const col = i % cols
      const row = Math.floor(i / cols)

      const cx = (col + bbox[i * 4]) * stride
      const cy = (row + bbox[i * 4 + 1]) * stride
      const w = Math.exp(bbox[i * 4 + 2]) * stride
      const h = Math.exp(bbox[i * 4 + 3]) * stride

      const landmarks: number[] = []
      for (let k = 0; k < 5; k++) {
        landmarks.push((col + kps[i * 10 + k * 2]) * stride)
        landmarks.push((row + kps[i * 10 + k * 2 + 1]) * stride)
      }

      candidates.push({
        x: (cx - w / 2) / scale,
        y: (cy - h / 2) / scale,
        w: w / scale,
        h: h / scale,
        landmarks: landmarks.map((v) => v / scale),
        score,
      })
    }
  }

  return nms(candidates, NMS_THRESHOLD).sort((a, b) => b.w * b.h - a.w * a.h)
}

/** ArcFace canonical 5-point template for a 112x112 chip. */
const REFERENCE = [
  38.2946, 51.6963,
  73.5318, 51.5014,
  56.0252, 71.7366,
  41.5493, 92.3655,
  70.7299, 92.2041,
]

/**
 * Umeyama similarity transform (uniform scale + rotation + translation)
 * fitting `src` onto `dst`. Returns a 2x3 affine matrix [a b tx; -b a ty].
 */
function umeyama(src: number[], dst: number[]) {
  const n = src.length / 2
  let sxm = 0, sym = 0, dxm = 0, dym = 0
  for (let i = 0; i < n; i++) {
    sxm += src[i * 2]; sym += src[i * 2 + 1]
    dxm += dst[i * 2]; dym += dst[i * 2 + 1]
  }
  sxm /= n; sym /= n; dxm /= n; dym /= n

  let varSrc = 0, a = 0, b = 0
  for (let i = 0; i < n; i++) {
    const sx = src[i * 2] - sxm
    const sy = src[i * 2 + 1] - sym
    const dx = dst[i * 2] - dxm
    const dy = dst[i * 2 + 1] - dym
    varSrc += sx * sx + sy * sy
    a += sx * dx + sy * dy
    b += sx * dy - sy * dx
  }
  const scale = Math.hypot(a, b) / varSrc
  const cos = (a / Math.hypot(a, b)) * scale
  const sin = (b / Math.hypot(a, b)) * scale
  return {
    m: [cos, -sin, dxm - (cos * sxm - sin * sym), sin, cos, dym - (sin * sxm + cos * sym)],
  }
}

/** Warp the face onto the canonical 112x112 chip SFace expects. */
export function alignCrop(img: RawImage, face: Face): RawImage {
  const { m } = umeyama(face.landmarks, REFERENCE)
  // Invert the 2x3 affine so we can sample source pixels per destination pixel.
  const det = m[0] * m[4] - m[1] * m[3]
  const inv = [
    m[4] / det, -m[1] / det, (m[1] * m[5] - m[4] * m[2]) / det,
    -m[3] / det, m[0] / det, (m[3] * m[2] - m[0] * m[5]) / det,
  ]

  const size = 112
  const out = new Uint8Array(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sxf = inv[0] * x + inv[1] * y + inv[2]
      const syf = inv[3] * x + inv[4] * y + inv[5]
      const x0 = Math.floor(sxf)
      const y0 = Math.floor(syf)
      const wx = sxf - x0
      const wy = syf - y0
      for (let c = 0; c < 3; c++) {
        let v = 0
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const px = Math.max(0, Math.min(img.width - 1, x0 + dx))
            const py = Math.max(0, Math.min(img.height - 1, y0 + dy))
            const wgt = (dx ? wx : 1 - wx) * (dy ? wy : 1 - wy)
            v += img.bgr[(py * img.width + px) * 3 + c] * wgt
          }
        }
        out[(y * size + x) * 3 + c] = Math.round(v)
      }
    }
  }
  return { bgr: out, width: size, height: size }
}

/** 128-d identity embedding, or null when no face is present. */
export async function embed(img: RawImage, face?: Face): Promise<Float32Array | null> {
  const f = face ?? (await detect(img))[0]
  if (!f) return null
  const chip = alignCrop(img, f)
  const session = await recognizer()
  const tensor = new ort.Tensor('float32', toNchw(chip), [1, 3, 112, 112])
  const out = await session.run({ [session.inputNames[0]]: tensor })
  return out[session.outputNames[0]].data as Float32Array
}

export function cosine(a: Float32Array | null, b: Float32Array | null): number {
  if (!a || !b) return NaN
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? NaN : dot / d
}

/**
 * Uniform scale + translate mapping `from` onto `to`.
 * Never a stretch: the models return ~2:3 whatever the input aspect, and
 * stretching to fit distorts the head.
 */
export function similarityTransform(from: Face, to: Face) {
  const scale = (to.w / from.w + to.h / from.h) / 2
  return {
    scale,
    tx: to.x + to.w / 2 - scale * (from.x + from.w / 2),
    ty: to.y + to.h / 2 - scale * (from.y + from.h / 2),
  }
}

export { decode, resize, crop, type RawImage }
