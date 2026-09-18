import { mkdtemp, writeFile, unlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getStore } from '@/lib/store'
import { getTemplate, getTheme } from '@/lib/template'
import { render } from '@/lib/render'
import { toUserError } from '@/lib/user-error'

export const runtime = 'nodejs'
export const maxDuration = 30

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
    const { jobId, themeId, silent } = await req.json()
    if (typeof jobId !== 'string' || typeof themeId !== 'string') {
      return Response.json({ error: 'jobId and themeId are required' }, { status: 400 })
    }

    const template = getTemplate('gta-redcarpet')
    const theme = getTheme(template, themeId)

    const shots = await getStore().getJobShots(jobId)
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
    await render(files as [string, string, string], theme.file, out, {
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
    const ue = toUserError(err)
    console.error('[render] failed:', ue.detail)
    return Response.json({ error: ue.message }, { status: 500 })
  }
}
