/**
 * The filesystem half of media resolution. Server only — importing this from a
 * client component fails the build, which is the point: lib/media.ts holds the
 * browser-safe half.
 *
 * Local disk always wins. With the files present a checkout behaves exactly as
 * it did before, offline and with no configuration; MEDIA_BASE only matters
 * where they are absent, which is every deployment.
 */
import { existsSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { MEDIA_BASE } from './media'

const cache = new Map<string, Promise<string>>()

/**
 * Absolute path to a file FFMPEG must read, downloading it once per container
 * if this deployment does not carry it. /tmp is the only writable path on a
 * serverless function and it survives between invocations on a warm instance,
 * so a theme is fetched at most once per cold start.
 */
export function localFile(rel: string): Promise<string> {
  if (existsSync(rel)) return Promise.resolve(path.resolve(rel))

  const hit = cache.get(rel)
  if (hit) return hit

  const fetched = (async () => {
    if (!MEDIA_BASE) {
      throw new Error(
        `${rel} is missing and NEXT_PUBLIC_MEDIA_BASE is not set — run scripts/upload-media.ts and set it`
      )
    }
    const dest = path.join(tmpdir(), 'cutscene-media', rel)
    if (existsSync(dest)) return dest

    const res = await fetch(`${MEDIA_BASE}/${rel}`)
    if (!res.ok) throw new Error(`could not fetch ${rel}: ${res.status}`)
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, Buffer.from(await res.arrayBuffer()))
    return dest
  })()

  cache.set(rel, fetched)
  // A failed fetch must not be cached, or one blip breaks the theme forever.
  fetched.catch(() => cache.delete(rel))
  return fetched
}

/**
 * Can ffmpeg get this file here? On disk counts; so does a reachable upload.
 * A HEAD request rather than localFile() so the deploy check stays cheap —
 * proving a 14MB soundtrack is fetchable should not mean fetching it.
 */
export async function resolvable(rel: string): Promise<boolean> {
  if (existsSync(rel)) return true
  if (!MEDIA_BASE) return false
  try {
    return (await fetch(`${MEDIA_BASE}/${rel}`, { method: 'HEAD' })).ok
  } catch {
    return false
  }
}
