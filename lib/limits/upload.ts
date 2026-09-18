import { decode, detect } from '@/lib/identity'
import { LimitError } from './index'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Magic-byte sniffing. Never trust a client-declared MIME type. */
export function sniff(buf: Buffer | Uint8Array): 'png' | 'jpeg' | 'webp' | null {
  const b = Buffer.from(buf.subarray(0, 16))
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp'
  }
  return null
}

export async function validateUpload(buf: Buffer): Promise<void> {
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new LimitError('that photo is too large — keep it under 10MB', 413)
  }
  if (!sniff(buf)) {
    throw new LimitError('that needs to be a photo — PNG, JPEG or WebP', 415)
  }
  const faces = await detect(await decode(buf))
  if (faces.length === 0) {
    throw new LimitError("we couldn't find a face in that photo", 422)
  }
  if (faces.length > 1) {
    throw new LimitError('that photo has more than one face — use a solo shot', 422)
  }
}
