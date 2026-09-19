import { mkdtemp, writeFile, unlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getStore } from '@/lib/store'
import { getTemplate, getTheme } from '@/lib/template'
import { render } from '@/lib/render'
import { localFile } from '@/lib/media-server'
import { toUserError } from '@/lib/user-error'
import { take, LimitError } from '@/lib/limits'
import { sameOrigin } from '@/lib/limits/request'
import { screenForBot } from '@/lib/limits/bot'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * A re-render spends no API credit, but it does spend an ffmpeg run and a
 * function invocation, and neither the free-video allowance nor the daily
 * spend ceiling can see it. Thirty an hour is far more than auditioning three
 * songs needs and far less than a loop wants.
 */
const RENDER_PER_HOUR = 30
const RENDER_REFILL_PER_SEC = RENDER_PER_HOUR / 3600

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

/**
 * Re-render a finished job with different music.
 *
 * This route MUST NOT call an image model. Changing the soundtrack is pure
 * ffmpeg over shots we already have — about a second, and zero spend. Routing
 * it through /api/generate instead would re-swap three faces and cost ~$0.10
 * every time someone auditions a song.
 */
export async function POST(req: Request) {
  try {
    sameOrigin(req)
    await screenForBot()

    const store = getStore()
    const subject = `render:${clientIp(req)}`
    const bucket = (await store.getBucket(subject)) ?? {
      tokens: RENDER_PER_HOUR,
      updatedAt: Date.now(),
    }
    const limited = take(bucket, RENDER_PER_HOUR, RENDER_REFILL_PER_SEC)
    await store.putBucket(subject, limited.bucket)
    if (!limited.ok) {
      throw new LimitError('too many re-renders — give it a minute', 429, limited.retryAfter)
    }

    const { jobId, themeId, silent } = await req.json()
    if (typeof jobId !== 'string' || typeof themeId !== 'string') {
      return Response.json({ error: 'jobId and themeId are required' }, { status: 400 })
    }

    const template = getTemplate('gta-redcarpet')
    const theme = getTheme(template, themeId)

    const shots = await store.getJobShots(jobId)
    if (!shots || shots.length !== 3) {
      // Expired or unknown: the client falls back to a full generate.
      return Response.json({ error: 'expired', expired: true }, { status: 410 })
    }

    const dir = await mkdtemp(path.join(tmpdir(), 'cutscene-render-'))
    const files: string[] = []
    for (let i = 0; i < shots.length; i++) {
      const f = path.join(dir, `shot_${i}.png`)
      await writeFile(f, shots[i])
      files.push(f)
    }
    const out = path.join(dir, 'cutscene.mp4')

    const started = Date.now()
    await render(files as [string, string, string], await localFile(theme.file), out, {
      cueStart: theme.cueStart,
      silent: silent === true,
    })
    const mp4 = await readFile(out)
    unlink(out).catch(() => {})

    return Response.json({
      src: `data:video/mp4;base64,${mp4.toString('base64')}`,
      ms: Date.now() - started,
    })
  } catch (err) {
    if (err instanceof LimitError) {
      const headers: Record<string, string> = {}
      if (err.retryAfter) headers['Retry-After'] = String(err.retryAfter)
      return Response.json({ error: err.message }, { status: err.status, headers })
    }
    const ue = toUserError(err)
    console.error('[render] failed:', ue.detail)
    return Response.json({ error: ue.message }, { status: 500 })
  }
}
