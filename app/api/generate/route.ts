import { readFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { generate } from '@/lib/pipeline'
import { getTemplate, getTheme } from '@/lib/template'
import { getStore, type Store } from '@/lib/store'
import {
  checkSpendCeiling,
  take,
  LimitError,
  FREE_VIDEOS_PER_DAY,
  FREE_REFILL_PER_SEC,
} from '@/lib/limits'
import { validateUpload } from '@/lib/limits/upload'
import { screenForPublicFigure } from '@/lib/limits/figure'
import { toUserError } from '@/lib/user-error'
import { parseAppearance } from '@/lib/appearance'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Free tier, counted against BOTH the IP and a per-browser id. A shared network
 * should not spend one person's allowance, and clearing a cookie should not
 * hand out a fresh one. FREE_VIDEOS_PER_DAY sets the size.
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

const VISITOR_COOKIE = 'cutscene_visitor'

/**
 * A third identity signal, because the other two both leak.
 *
 * The IP rotates on mobile carriers — the same tester appeared as
 * 152.58.182.119 one day and 49.43.145.167 the next — and the browser id lives
 * in localStorage, which a new window or a cleared site clears. This one is an
 * HttpOnly cookie the SERVER issues, so page scripts cannot read or forge it
 * and it survives closing and reopening the site.
 *
 * It is not unspoofable: a private window or cleared cookies still mints a new
 * one. Stopping that needs a real identity check (Turnstile or sign-in), which
 * is a product decision, not a header.
 */
function visitorId(req: Request): { id: string; fresh: boolean } {
  const match = /(?:^|;\s*)cutscene_visitor=([0-9a-f-]{36})/.exec(req.headers.get('cookie') ?? '')
  return match ? { id: match[1], fresh: false } : { id: randomUUID(), fresh: true }
}

/**
 * One year: the allowance is daily, but the identity should outlive it.
 *
 * `Secure` only over https — a Secure cookie is silently dropped on plain
 * HTTP, which would make local testing behave differently from production for
 * no visible reason.
 */
function visitorCookie(req: Request, id: string): string {
  const https = new URL(req.url).protocol === 'https:' ||
    req.headers.get('x-forwarded-proto') === 'https'
  return (
    `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax` +
    (https ? '; Secure' : '')
  )
}

/**
 * Hand back the tokens this request took.
 *
 * A free video is what the user gets, not what they attempted: if no video
 * comes out, the allowance must be untouched. At one video a day a single
 * failure would otherwise lock someone out until tomorrow, having given them
 * nothing — the worst outcome the product can produce.
 *
 * Re-reads and credits one token rather than restoring a snapshot, so a
 * concurrent request from the same subject cannot be overwritten, and clamps to
 * capacity so a refund can never mint an extra video.
 */
async function refund(store: Store, subjects: string[]): Promise<void> {
  for (const subject of subjects) {
    try {
      const current = await store.getBucket(subject)
      if (!current) continue
      await store.putBucket(subject, {
        tokens: Math.min(BUCKET_CAPACITY, current.tokens + 1),
        updatedAt: Date.now(),
      })
    } catch {
      // A failed refund must not turn into a failed response.
    }
  }
}

export async function POST(req: Request) {
  const store = getStore()
  let parsed: ReturnType<typeof parseBody>
  let photo: Buffer

  // Resolved before the guards so a refusal still issues the cookie — otherwise
  // the person who gets told "come back tomorrow" is the one person who never
  // receives an identity, and their next visit starts clean.
  const visitor = visitorId(req)

  // Subjects charged for this request, so anything that ends without a video
  // can hand the allowance back. Being refused must not cost a video, and
  // neither must a generation that fails halfway.
  const charged: string[] = []

  // ---- guards, all before a single cent is spent ----
  try {
    parsed = parseBody(await req.formData())
    photo = Buffer.from(await parsed.photo.arrayBuffer())

    await validateUpload(photo)

    // Charge every subject; refuse if ANY of them is exhausted. Three signals
    // because each one alone leaks: the IP rotates on mobile, localStorage
    // clears with the window, and the cookie goes in a private session.
    const browserId = (req.headers.get('x-cutscene-client') ?? '').slice(0, 64)
    const subjects = [`ip:${clientIp(req)}`, `visitor:${visitor.id}`]
    if (/^[a-zA-Z0-9-]{8,64}$/.test(browserId)) subjects.push(`browser:${browserId}`)

    for (const subject of subjects) {
      const existing = (await store.getBucket(subject)) ?? {
        tokens: BUCKET_CAPACITY,
        updatedAt: Date.now(),
      }
      const result = take(existing, BUCKET_CAPACITY, BUCKET_REFILL_PER_SEC)
      await store.putBucket(subject, result.bucket)
      if (!result.ok) {
        // Says what happened and why, without pretending it is the user's
        // fault. Every video costs real money; "poor on credits" is the honest
        // reason and it reads better than a quota number.
        throw new LimitError(
          FREE_VIDEOS_PER_DAY === 1
            ? "That's your free one for today. We're poor on credits — come back tomorrow."
            : `That's your ${FREE_VIDEOS_PER_DAY} free videos for today. We're poor on credits — come back tomorrow.`,
          429,
          result.retryAfter
        )
      }
      charged.push(subject)
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
    await refund(store, charged)
    // A guard that spent money before saying no still spent it.
    if (err instanceof LimitError && err.costUsd > 0) {
      await store.recordSpend(err.costUsd).catch(() => {})
    }
    const status = err instanceof LimitError ? err.status : 400
    const message = err instanceof Error ? err.message : 'bad request'
    const headers: Record<string, string> = { 'Set-Cookie': visitorCookie(req, visitor.id) }
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

      // Only a delivered video keeps the allowance. Anything else — a pipeline
      // error, a crash, a render that never arrives — hands it back.
      let delivered = false

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
            // The video is on the wire: this is the only path that keeps it.
            delivered = true
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
        // One place, so no future failure path can forget it. A free video is
        // what the user got, not what they attempted.
        if (!delivered) await refund(store, charged)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Set-Cookie': visitorCookie(req, visitor.id),
    },
  })
}
