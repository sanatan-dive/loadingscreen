import { runtimeInfo } from '@/lib/runtime'
import { resolvable } from '@/lib/media-server'
import { DAILY_CEILING_USD, FREE_VIDEOS_PER_DAY } from '@/lib/limits'
import { FIGURE_CHECK_ENABLED } from '@/lib/limits/figure'
import { listTemplates } from '@/lib/template'
import { getStore } from '@/lib/store'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * The media check makes nine HEAD requests to storage. This endpoint is public
 * and its answer only changes on a deploy, so a flood of calls should not turn
 * into a flood of outbound requests. Five minutes is short enough that a broken
 * deploy is still caught on the first request that matters.
 */
const MEDIA_TTL_MS = 5 * 60_000
let mediaChecked = { at: 0, missing: [] as string[] }

async function missingMedia(required: string[]): Promise<string[]> {
  if (Date.now() - mediaChecked.at < MEDIA_TTL_MS) return mediaChecked.missing
  const checked = await Promise.all(required.map(async (f) => [f, await resolvable(f)] as const))
  mediaChecked = { at: Date.now(), missing: checked.filter(([, ok]) => !ok).map(([f]) => f) }
  return mediaChecked.missing
}

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
    const missing = await missingMedia(required)

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
      // Visible on purpose: whether a deployment screens public figures should
      // never be something you have to guess at.
      publicFigureCheck: FIGURE_CHECK_ENABLED,
    }
    return Response.json(body, { status: body.ok ? 200 : 503 })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 503 }
    )
  }
}
