import { runtimeInfo } from '@/lib/runtime'
import { resolvable } from '@/lib/media-server'
import { DAILY_CEILING_USD, FREE_VIDEOS_PER_DAY } from '@/lib/limits'
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
 *
 * "Resolvable", not "on disk": a deployment legitimately has none of this
 * locally and fetches it from storage instead. Checking the wrong one would
 * make every healthy deploy report itself broken.
 */
export async function GET() {
  try {
    const required = listTemplates().flatMap((t) => [
      ...t.themes.map((x) => x.file),
      ...t.shots.map((x) => x.file),
    ])
    const checked = await Promise.all(required.map(async (f) => [f, await resolvable(f)] as const))
    const missing = checked.filter(([, ok]) => !ok).map(([f]) => f)

    const body = {
      ok: missing.length === 0,
      ...(await runtimeInfo()),
      store: getStore().kind,
      missingMedia: missing,
      // Policy, not secrets. Vercel stores env vars as secret type and will not
      // read them back, so without this there is no way to confirm the limits a
      // deployment is actually running under — only what you believe you set.
      freeVideosPerDay: FREE_VIDEOS_PER_DAY,
      dailyCeilingUsd: DAILY_CEILING_USD,
    }
    return Response.json(body, { status: body.ok ? 200 : 503 })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 503 }
    )
  }
}
