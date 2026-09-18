/**
 * Prove the persistent store is really wired, the way /api/healthz proves the
 * native binaries are. Reads and writes every table the request path touches,
 * then cleans up after itself. Never prints a key.
 *
 *   npx tsx scripts/store-check.ts
 */
import { createClient } from '@supabase/supabase-js'
import { getStore } from '../lib/store'

const SUBJECT = 'ip:store-check-probe'
const BUCKET = 'job-shots'

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log(`SUPABASE_URL              ${url ? 'set' : 'MISSING'}`)
  console.log(`SUPABASE_SERVICE_ROLE_KEY ${key ? `set (${key.length} chars)` : 'MISSING'}`)

  const store = getStore()
  console.log(`\ngetStore().kind            ${store.kind}`)
  if (store.kind !== 'supabase') {
    console.log('\nStill in memory. Rate limits and the spend ceiling are per-process.')
    process.exit(1)
  }

  // The bucket SupabaseStore.putJobShots writes into. Without it, switching
  // the music 404s the moment the store goes live.
  const db = createClient(url!, key!, { auth: { persistSession: false } })
  const { data: buckets, error: listErr } = await db.storage.listBuckets()
  if (listErr) throw listErr
  const existing = buckets?.find((b) => b.name === BUCKET)
  if (existing) {
    console.log(`storage bucket ${BUCKET}    exists (public=${existing.public})`)
  } else {
    const { error } = await db.storage.createBucket(BUCKET, { public: false })
    if (error) throw error
    console.log(`storage bucket ${BUCKET}    CREATED (private)`)
  }

  // Round-trip the rate bucket: this is the row that makes 3/day enforceable
  // across serverless instances instead of per-process.
  await store.putBucket(SUBJECT, { tokens: 2.5, updatedAt: Date.now() })
  const read = await store.getBucket(SUBJECT)
  console.log(`rate_buckets round-trip   ${read?.tokens === 2.5 ? 'ok' : 'FAILED'} (tokens=${read?.tokens})`)

  const spent = await store.spentToday()
  console.log(`spend_ledger today        ${spent === null ? 'UNREADABLE (guards fail closed)' : `$${spent.toFixed(5)}`}`)

  // Job shots, the theme-switch fast path.
  await store.putJobShots('store-check-probe', [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')])
  const shots = await store.getJobShots('store-check-probe')
  console.log(`job shots round-trip      ${shots?.length === 3 ? 'ok' : 'FAILED'} (${shots?.length ?? 0} shots)`)

  await db.from('rate_buckets').delete().eq('subject', SUBJECT)
  console.log('\nprobe rows cleaned up')
}
main().catch((e) => {
  console.error('FAILED:', e.message ?? e)
  process.exit(1)
})
