import { runtimeInfo } from '@/lib/runtime'

export const runtime = 'nodejs'
export const maxDuration = 30

/** Deploy check: proves the native binaries resolved in this environment. */
export async function GET() {
  try {
    return Response.json({ ok: true, ...(await runtimeInfo()) })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 503 }
    )
  }
}
