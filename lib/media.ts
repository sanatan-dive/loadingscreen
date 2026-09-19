/**
 * Where the media actually lives — the half that is safe in a browser bundle.
 *
 * The GTA soundtracks, the cue clips cut from them and the reference video are
 * other people's copyrighted work, so they are gitignored — which means a build
 * from the repository does not contain them and every render would fail at the
 * ffmpeg step. They are uploaded to Supabase Storage instead
 * (scripts/upload-media.ts) and resolved from there.
 *
 * Nothing here may import from node:*. `app/page.tsx` is a client component and
 * pulls in `publicUrl`; a node import in this file fails the build with "the
 * chunking context does not support external modules". The filesystem half
 * lives in lib/media-server.ts.
 */

export const MEDIA_BUCKET = 'media'

/** Everything gitignored but needed to run. scripts/upload-media.ts reads this. */
export const MEDIA_FILES = [
  'assets/audio/themes/gta-sa.mp3',
  'assets/audio/themes/gta-4.mp3',
  'assets/audio/themes/gta-5.mp3',
  'public/cues/SA_b_hook.mp3',
  'public/cues/GTA4_b_hook.mp3',
  'public/cues/GTA5_b_hook.mp3',
  'public/reference.mp4',
  'public/reference.webm',
  'public/reference-poster.jpg',
] as const

/**
 * Public base for browser-facing media. Empty locally, so the browser keeps
 * requesting /reference.mp4 and friends from /public exactly as before.
 */
export const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? '').replace(/\/$/, '')

/**
 * The path the browser loads media from. Deliberately OUR origin, not storage's.
 *
 * Every visitor autoplays an 843KB hero clip before they touch anything. Served
 * straight from Supabase that is one download per visitor against a 5GB monthly
 * allowance — about 5,700 visitors, which a single good tweet passes in an hour.
 * And the failure is not just a missing video: the same Supabase project holds
 * the rate buckets and the spend ledger, so a restricted project makes
 * spentToday() return null, the ceiling fails closed, and EVERY generation
 * refuses. Success would have taken the product down.
 *
 * Going through /media instead puts Vercel's CDN in front (next.config rewrites
 * it to storage), so each edge fetches a file once and serves it to everyone
 * near it. The server half still talks to storage directly - see lib/media-server.
 */
/**
 * URL for a file the BROWSER loads, e.g. publicUrl('/reference.mp4').
 *
 * Always a plain path: scripts/fetch-public-media.ts puts these files into the
 * build, so they are served as ordinary static assets from the CDN rather than
 * fetched from storage by every visitor.
 */
export function publicUrl(webPath: string): string {
  return webPath
}
