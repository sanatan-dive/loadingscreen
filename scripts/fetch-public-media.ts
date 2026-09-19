/**
 * Pull the browser-facing media into the build.
 *
 * These files are gitignored (they are other people's copyrighted work and the
 * repo is public), so a build from the repository does not contain them. They
 * used to be loaded by the browser straight from Supabase Storage — one 843KB
 * download per visitor against a 5GB monthly allowance, about 5,700 visitors.
 *
 * Proxying them through a rewrite did NOT fix it: Vercel forwards an external
 * rewrite per request and does not cache it (measured: x-vercel-cache MISS on
 * repeated fetches). Fetching them at BUILD time makes them ordinary static
 * assets, which Vercel's CDN does cache — so storage serves them once per
 * deploy instead of once per visitor.
 *
 * Runs as npm `prebuild`. Files already on disk are left alone, so a local
 * checkout with the media present does nothing.
 */
import { existsSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { MEDIA_FILES, MEDIA_BASE } from '../lib/media'

/** Only what the BROWSER downloads. ffmpeg's soundtracks stay server-side. */
const BROWSER_FILES = MEDIA_FILES.filter((f) => f.startsWith('public/'))

async function main() {
  const missing = BROWSER_FILES.filter((f) => !existsSync(f))
  if (missing.length === 0) {
    console.log('media: all present on disk, nothing to fetch')
    return
  }
  if (!MEDIA_BASE) {
    throw new Error(
      `missing ${missing.join(', ')} and NEXT_PUBLIC_MEDIA_BASE is not set — ` +
        'run scripts/upload-media.ts and set it'
    )
  }

  for (const rel of missing) {
    const res = await fetch(`${MEDIA_BASE}/${rel}`)
    // Fail the build rather than ship a page with a broken hero.
    if (!res.ok) throw new Error(`could not fetch ${rel}: ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await mkdir(path.dirname(rel), { recursive: true })
    await writeFile(rel, buf)
    console.log(`media: fetched ${rel} (${(buf.length / 1024).toFixed(0)}KB)`)
  }
}
main()
