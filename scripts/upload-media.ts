/**
 * Push the local media to Supabase Storage so deployments can fetch it.
 *
 * The soundtracks, cue clips and reference video are gitignored to keep other
 * people's copyrighted work out of a public repo — which means a build from the
 * repository has none of them. This uploads them once; the app reads them from
 * MEDIA_BASE at runtime.
 *
 *   npx tsx scripts/upload-media.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { MEDIA_FILES, MEDIA_BUCKET } from '../lib/media'

const TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  jpg: 'image/jpeg',
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: buckets } = await db.storage.listBuckets()
  if (!buckets?.some((b) => b.name === MEDIA_BUCKET)) {
    // Public: the browser fetches the cue clips and the reference video
    // directly, exactly as it did when they were served from /public.
    const { error } = await db.storage.createBucket(MEDIA_BUCKET, { public: true })
    if (error) throw error
    console.log(`created public bucket ${MEDIA_BUCKET}`)
  }

  let total = 0
  for (const rel of MEDIA_FILES) {
    if (!existsSync(rel)) {
      console.log(`  SKIP    ${rel} (not on disk)`)
      continue
    }
    const body = readFileSync(rel)
    const ext = rel.split('.').pop()!
    const { error } = await db.storage
      .from(MEDIA_BUCKET)
      .upload(rel, body, { contentType: TYPES[ext] ?? 'application/octet-stream', upsert: true })
    if (error) throw error
    total += body.length
    console.log(`  ok      ${rel}  ${Math.round(body.length / 1024)}KB`)
  }
  console.log(`\nuploaded ${(total / 1048576).toFixed(1)}MB to ${url}/storage/v1/object/public/${MEDIA_BUCKET}/`)
}
main().catch((e) => {
  console.error('FAILED:', e.message ?? e)
  process.exit(1)
})
