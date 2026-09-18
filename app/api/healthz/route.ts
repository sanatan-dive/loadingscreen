import { existsSync } from 'node:fs'
import { runtimeInfo } from '@/lib/runtime'
import { listTemplates } from '@/lib/template'
import { getStore } from '@/lib/store'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Deploy check: proves the native binaries resolved AND that the files ffmpeg
 * will be handed actually exist here.
 *
 * The media check earns its place. The soundtracks are gitignored so they stay
 * out of a public repo, which means a build from the repository has none of
 * them — and ffmpeg only fails on a missing input at render time, after three
 * face swaps have been paid for and the user's free video consumed. This turns
 * that into one 503 on the first request after a deploy.
 */
export async function GET() {
  try {
    const missing = listTemplates()
      .flatMap((t) => [...t.themes.map((x) => x.file), ...t.shots.map((x) => x.file)])
      .filter((f) => !existsSync(f))

    const body = {
      ok: missing.length === 0,
      ...(await runtimeInfo()),
      store: getStore().kind,
      missingMedia: missing,
    }
    return Response.json(body, { status: body.ok ? 200 : 503 })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 503 }
    )
  }
}
