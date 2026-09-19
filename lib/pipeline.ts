import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  decode,
  detect,
  embed,
  cosine,
  crop as cropImage,
  GATE,
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
import { localFile } from '@/lib/media-server'

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
  /** Set once any shot has failed: the job is lost, stop buying frames for it. */
  signal?: AbortSignal
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
    // The job this shot belongs to has already failed. Climbing to the next
    // rung would buy a $0.14 frame for a video that will never be rendered.
    if (input.signal?.aborted) {
      lastReason = 'abandoned after another shot failed'
      break
    }
    attempts++
    let result: Awaited<ReturnType<typeof realEdit>>
    try {
      result = await deps.edit({
        crop: ctx.cropPng,
        face: input.facePng,
        model,
        expression: input.shot.expression,
        directives: appearanceDirectives(input.appearance),
        signal: input.signal,
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
      /*
       * What the gate actually saw when it said no. Escalation is the single
       * largest cost in a job, and whether it is avoidable depends entirely on
       * where rejections land: clustered just under the threshold means the
       * bar is too high and is costing money for nothing; scattered far below
       * means the gate is doing its job and there is nothing to win. Passes
       * observed so far sit at 0.61-0.79 against a 0.55 bar - nothing has ever
       * squeaked through - so the rejected side is the half we cannot see.
       */
      console.info(
        `[gate] rejected ${input.shot.id} on ${model}: ` +
          `vsUser=${gate.vsUser.toFixed(3)} vsOriginal=${gate.vsOriginal.toFixed(3)} bar=${GATE}`
      )
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
  | { type: 'done'; video: string; costUsd: number; ms: number; shots: Buffer[] }
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
  const userFace = (await detect(userImage))[0]
  const userEmbedding = userFace ? await embed(userImage, userFace) : null
  if (!userEmbedding || !userFace) {
    yield { type: 'error', message: "we couldn't find a face in that photo", costUsd: 0 }
    return
  }

  /*
   * Send the model a HEAD CROP, not the whole upload.
   *
   * The template half of the prompt is a head-box crop, and the user half used
   * to be the entire photograph — so on an ordinary "someone took a picture of
   * me standing there" shot, the face the model was asked to copy was a small
   * patch of a big picture, and it either produced a generic face or handed
   * back the template's own subject. Production logs showed exactly that:
   * vsOriginal 0.81-0.90 while vsUser sat at 0.16-0.34.
   *
   * Measured on one photo, same source, one variable (scripts/ab-facecrop.ts):
   *   whole photo   vsUser 0.490  -> REJECTED, escalates, costs 4x
   *   head crop     vsUser 0.869  -> passes first try
   *
   * Cropping to the same framing on both sides is what fixed it.
   */
  const userBox = headBox(userFace, userImage.width, userImage.height)
  const facePng = await encodePng(
    cropImage(userImage, userBox.x0, userBox.y0, userBox.x1, userBox.y1)
  )
  const abort = new AbortController()
  const results = template.shots.map((shot) =>
    swapShot(
      { shot, facePng, userEmbedding, appearance: opts.appearance, signal: abort.signal },
      opts.deps ?? defaultDeps
    )
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
      // One shot failing loses the whole video, so stop the other two before
      // they escalate. Then wait for whatever is already in flight and count
      // it: money committed before we gave up is money the daily ceiling has
      // to see, even though the user is never charged for it.
      abort.abort()
      for (const settled of await Promise.allSettled(pending.values())) {
        if (settled.status === 'fulfilled') spent += settled.value.r.costUsd
      }
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
  await render(files as [string, string, string], await localFile(theme.file), out, {
    cueStart: theme.cueStart,
    silent: opts.silent ?? false,
  })

  yield {
    type: 'done',
    video: out,
    costUsd: spent,
    ms: Date.now() - started,
    shots: done.map((d) => d.image!),
  }
}
