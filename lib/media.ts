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

/** URL for a file the BROWSER loads, e.g. publicUrl('/reference.mp4'). */
export function publicUrl(webPath: string): string {
  if (!MEDIA_BASE) return webPath
  return `${MEDIA_BASE}/public${webPath}`
}
