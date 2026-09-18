import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  decode,
  detect,
  embed,
  cosine,
  crop as cropImage,
  type Face,
  type RawImage,
} from '@/lib/identity'
import { encodePng } from '@/lib/identity/image'
import { blend, headBox, type Box } from '@/lib/composite'
import { edit as realEdit, MODEL_LADDER } from '@/lib/provider'
import { verify as realVerify, type GateResult } from '@/lib/gate'
import { getTemplate, getTheme, type Shot, type Template } from '@/lib/template'
import { appearanceDirectives, type Appearance } from '@/lib/appearance'
import { render } from '@/lib/render'

export interface SwapDeps {
  edit: typeof realEdit
  verify: typeof realVerify
}

const defaultDeps: SwapDeps = { edit: realEdit, verify: realVerify }

/** Per-shot template facts. Computed once — the frames never change. */
interface ShotContext {
  shot: Shot
  frame: RawImage
  face: Face
  box: Box
  cropPng: Buffer
  cropFace: Face
  originalEmbedding: Float32Array | null
}

const contextCache = new Map<string, Promise<ShotContext>>()

async function shotContext(shot: Shot): Promise<ShotContext> {
  const cached = contextCache.get(shot.id)
  if (cached) return cached

  const built = (async (): Promise<ShotContext> => {
    const frame = await decode(await readFile(shot.file))
    const faces = await detect(frame)
    if (faces.length === 0) throw new Error(`no face in template frame ${shot.file}`)
    const face = faces[0]
    const box = headBox(face, frame.width, frame.height)
    const cropped = cropImage(frame, box.x0, box.y0, box.x1, box.y1)
    const cropFaces = await detect(cropped)
    if (cropFaces.length === 0) throw new Error(`no face in crop of ${shot.file}`)
    return {
      shot,
      frame,
      face,
      box,
      cropPng: await encodePng(cropped),
      cropFace: cropFaces[0],
      originalEmbedding: await embed(frame, face),
    }
  })()

  contextCache.set(shot.id, built)
  return built
}

export interface SwapInput {
  shot: Shot
  facePng: Buffer
  userEmbedding: Float32Array | null
  appearance?: Appearance
}

export interface SwapOutput {
  ok: boolean
  shotId: string
  /** Composited full frame, PNG. */
  image?: Buffer
  vsUser: number
  costUsd: number
  /** False when we could not produce a result — the user must not be charged. */
  charged: boolean
  attempts: number
  reason?: string
}

/**
 * One shot, with escalation. Runs the cheapest model first and only climbs the
 * ladder when the identity gate rejects the result.
 */
export async function swapShot(
  input: SwapInput,
  deps: SwapDeps = defaultDeps
): Promise<SwapOutput> {
  const ctx = await shotContext(input.shot)
  let spent = 0
  let attempts = 0
  let lastReason = 'no attempts made'

  for (const model of MODEL_LADDER) {
    attempts++
    let result: Awaited<ReturnType<typeof realEdit>>
    try {
      result = await deps.edit({
        crop: ctx.cropPng,
        face: input.facePng,
        model,
        expression: input.shot.expression,
        directives: appearanceDirectives(input.appearance),
      })
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err)
      continue
    }
    spent += result.costUsd

    const produced = await decode(result.image)
    const producedFaces = await detect(produced)
    const producedEmbedding = producedFaces.length
      ? await embed(produced, producedFaces[0])
      : null

    const gate: GateResult = deps.verify({
      vsUser: cosine(producedEmbedding, input.userEmbedding),
      vsOriginal: cosine(producedEmbedding, ctx.originalEmbedding),
    })

    if (!gate.pass) {
      lastReason = gate.reason ?? 'rejected'
      continue
    }

    const merged = blend(ctx.frame, produced, producedFaces[0], ctx.cropFace, ctx.box)
    return {
      ok: true,
      shotId: input.shot.id,
      image: await encodePng(merged),
      vsUser: gate.vsUser,
      costUsd: spent,
      charged: true,
      attempts,
    }
  }

  return {
    ok: false,
    shotId: input.shot.id,
    vsUser: NaN,
    costUsd: spent,
    charged: false,
    attempts,
    reason: lastReason,
  }
}

export type PipelineEvent =
  | { type: 'shot'; index: number; shotId: string; image: Buffer; vsUser: number }
  | { type: 'done'; video: string; costUsd: number; ms: number }
  | { type: 'error'; message: string; costUsd: number }

export interface GenerateOptions {
  photo: Buffer
  templateId: string
  themeId: string
  silent?: boolean
  appearance?: Appearance
  deps?: SwapDeps
}

/**
 * Yields each shot as it lands so the UI can reveal them one at a time.
 * Collapsing this into a single return would waste the most engaging nine
 * seconds in the product.
 */
export async function* generate(opts: GenerateOptions): AsyncGenerator<PipelineEvent> {
  const started = Date.now()
  const template: Template = getTemplate(opts.templateId)
  const theme = getTheme(template, opts.themeId)

  const userImage = await decode(opts.photo)
  const userEmbedding = await embed(userImage)
  if (!userEmbedding) {
    yield { type: 'error', message: "we couldn't find a face in that photo", costUsd: 0 }
    return
  }

  const facePng = await encodePng(userImage)
  const results = template.shots.map((shot) =>
    swapShot({ shot, facePng, userEmbedding, appearance: opts.appearance }, opts.deps ?? defaultDeps)
  )

  // Emit each shot the moment it resolves, not in template order.
  const pending = new Map(results.map((p, i) => [i, p.then((r) => ({ i, r }))]))
  const done: SwapOutput[] = new Array(template.shots.length)
  let spent = 0

  while (pending.size > 0) {
    const { i, r } = await Promise.race(pending.values())
    pending.delete(i)
    done[i] = r
    spent += r.costUsd
    if (!r.ok) {
      yield {
        type: 'error',
        message: `couldn't place your face in shot ${i + 1}: ${r.reason}`,
        costUsd: spent,
      }
      return
    }
    yield { type: 'shot', index: i, shotId: r.shotId, image: r.image!, vsUser: r.vsUser }
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'cutscene-'))
  const files: string[] = []
  for (let i = 0; i < done.length; i++) {
    const f = path.join(dir, `shot_${i}.png`)
    await writeFile(f, done[i].image!)
    files.push(f)
  }
  const out = path.join(dir, 'cutscene.mp4')
  await render(files as [string, string, string], theme.file, out, {
    cueStart: theme.cueStart,
    silent: opts.silent ?? false,
  })

  yield { type: 'done', video: out, costUsd: spent, ms: Date.now() - started }
}
