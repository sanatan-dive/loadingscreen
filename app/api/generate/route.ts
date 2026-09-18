import { readFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { generate } from '@/lib/pipeline'
import { getTemplate, getTheme } from '@/lib/template'
import { getStore } from '@/lib/store'
import {
  checkSpendCeiling,
  take,
  LimitError,
  FREE_VIDEOS_PER_DAY,
  FREE_REFILL_PER_SEC,
  type Bucket,
} from '@/lib/limits'
import { validateUpload } from '@/lib/limits/upload'
import { screenForPublicFigure } from '@/lib/limits/figure'
import { toUserError } from '@/lib/user-error'
import { parseAppearance } from '@/lib/appearance'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Free tier: three generations per day, counted against BOTH the IP and a
 * per-browser id. A shared network should not spend one person's allowance,
 * and clearing a cookie should not hand out three more.
 */
const BUCKET_CAPACITY = FREE_VIDEOS_PER_DAY
const BUCKET_REFILL_PER_SEC = FREE_REFILL_PER_SEC

/** Previews cross the wire per shot; keep them small. */
async function preview(png: Buffer): Promise<string> {
  const jpeg = await sharp(png).resize(420).jpeg({ quality: 72 }).toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

export function parseBody(form: FormData) {
  const photo = form.get('photo')
  const templateId = String(form.get('templateId') ?? 'gta-redcarpet')
  const themeId = String(form.get('themeId') ?? '')
  const silent = String(form.get('silent') ?? '') === 'true'

  // Allow-listed: these values become prompt text.
  let appearance = {}
  try {
    appearance = parseAppearance(JSON.parse(String(form.get('appearance') ?? '{}')))
  } catch {
    appearance = {}
  }

  if (!(photo instanceof File)) throw new LimitError('photo is required', 400)

  const template = getTemplate(templateId)
  getTheme(template, themeId) // throws on an unknown theme

  return { photo, templateId, themeId, silent, appearance }
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: Request) {
  const store = getStore()
  let parsed: ReturnType<typeof parseBody>
  let photo: Buffer

  // Buckets as they were before this request, so a guard that fires after the
  // token was taken can hand it back. Being refused must not cost a video.
  const taken: { subject: string; before: Bucket }[] = []

  // ---- guards, all before a single cent is spent ----
  try {
    parsed = parseBody(await req.formData())
    photo = Buffer.from(await parsed.photo.arrayBuffer())

    await validateUpload(photo)

    // Charge both subjects; refuse if either is exhausted.
    const browserId = (req.headers.get('x-cutscene-client') ?? '').slice(0, 64)
    const subjects = [`ip:${clientIp(req)}`]
    if (/^[a-zA-Z0-9-]{8,64}$/.test(browserId)) subjects.push(`browser:${browserId}`)

    for (const subject of subjects) {
      const existing = (await store.getBucket(subject)) ?? {
        tokens: BUCKET_CAPACITY,
        updatedAt: Date.now(),
      }
      const result = take(existing, BUCKET_CAPACITY, BUCKET_REFILL_PER_SEC)
      await store.putBucket(subject, result.bucket)
      if (!result.ok) {
        throw new LimitError(
          `That is your ${FREE_VIDEOS_PER_DAY} free videos for today.`,
          429,
          result.retryAfter
        )
      }
      taken.push({ subject, before: existing })
    }

    // Famous faces are refused before any image spend. Runs after the token
    // take so it cannot itself be hammered for free, and the token is refunded
    // below if it refuses.
    const screen = await screenForPublicFigure(photo)
    // A refused attacker still costs us money; the ceiling must see it.
    if (screen.costUsd > 0) await store.recordSpend(screen.costUsd)

    // Fails closed: a null reading refuses rather than spends.
    checkSpendCeiling(await store.spentToday())
  } catch (err) {
    // Every guard past the take refuses the job, so none of them may keep the
    // token: a public figure, a down classifier and our own ceiling are all
    // our "no", not a video the user received.
    for (const { subject, before } of taken) {
      await store.putBucket(subject, before).catch(() => {})
    }
    // A guard that spent money before saying no still spent it.
    if (err instanceof LimitError && err.costUsd > 0) {
      await store.recordSpend(err.costUsd).catch(() => {})
    }
    const status = err instanceof LimitError ? err.status : 400
    const message = err instanceof Error ? err.message : 'bad request'
    const headers: Record<string, string> = {}
    if (err instanceof LimitError && err.retryAfter) {
      headers['Retry-After'] = String(err.retryAfter)
    }
    return Response.json({ error: message }, { status, headers })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))

      try {
        for await (const ev of generate({
          photo,
          templateId: parsed.templateId,
          themeId: parsed.themeId,
          silent: parsed.silent,
          appearance: parsed.appearance,
        })) {
          if (ev.type === 'shot') {
            send({ type: 'shot', index: ev.index, src: await preview(ev.image), vsUser: ev.vsUser })
          } else if (ev.type === 'done') {
            await store.recordSpend(ev.costUsd)
            // Keep the composited shots so switching music is a pure re-render.
            const jobId = randomUUID()
            await store.putJobShots(jobId, ev.shots)
            const mp4 = await readFile(ev.video)
            send({
              type: 'done',
              jobId,
              src: `data:video/mp4;base64,${mp4.toString('base64')}`,
              costUsd: ev.costUsd,
              ms: ev.ms,
            })
            unlink(ev.video).catch(() => {})
          } else {
            // A failed job still burned tokens upstream; record what was spent
            // so the ceiling stays honest, but never charge the user.
            if (ev.costUsd > 0) await store.recordSpend(ev.costUsd)
            const ue = toUserError(new Error(ev.message))
            console.error('[generate] pipeline error:', ue.detail)
            send({ type: 'error', message: ue.message })
          }
        }
      } catch (err) {
        const ue = toUserError(err)
        // The user gets something actionable; we keep the trace.
        console.error('[generate] failed:', ue.detail)
        send({ type: 'error', message: ue.message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
