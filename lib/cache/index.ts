import { createHash } from 'node:crypto'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

import { appearanceKey, type Appearance } from '@/lib/appearance'

export type { Appearance }

/**
 * Keyed WITHOUT the theme, so switching music never re-swaps a face.
 * That is the whole point of splitting the cache in two.
 */
export function shotKey(i: {
  photoHash: string
  templateId: string
  shotId: string
  appearance: Appearance
}): string {
  return sha([i.photoHash, i.templateId, i.shotId, appearanceKey(i.appearance)].join('|'))
}

export function renderKey(i: {
  shotKeys: string[]
  themeId: string
  cueStart: number
  watermark: boolean
  silent: boolean
}): string {
  return sha(
    [...i.shotKeys, i.themeId, String(i.cueStart), String(i.watermark), String(i.silent)].join('|')
  )
}

export function photoHash(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(Buffer.from(buf)).digest('hex')
}
