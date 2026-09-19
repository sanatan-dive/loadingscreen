/**
 * Getting an image out of a paste or a drop is messier than `.files[0]`.
 *
 * Three shapes turn up in practice:
 *   1. a real File            — file manager, screenshot tool, camera
 *   2. a DataTransferItem     — clipboard image (Cmd+Shift+4, "Copy image")
 *   3. a URL string only      — dragging or copying an image from a web page,
 *                               where files/items are empty and all you get is
 *                               text/uri-list or plain text
 *
 * Case 3 is the one most uploaders miss, so dragging a picture from a Google
 * results page appears to do nothing at all.
 */

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const MAX_BYTES = 10 * 1024 * 1024

export class IntakeError extends Error {}

function isAccepted(type: string): boolean {
  return (ACCEPTED_TYPES as readonly string[]).includes(type)
}

function checkFile(file: File): File {
  if (!isAccepted(file.type)) {
    throw new IntakeError('That needs to be a photo — PNG, JPEG or WebP.')
  }
  if (file.size > MAX_BYTES) {
    throw new IntakeError("That photo's over 10MB. Try a smaller one.")
  }
  return file
}

/** Pull the first plausible URL out of the dragged/pasted text payloads. */
function findUrl(dt: DataTransfer): string | null {
  const uriList = dt.getData('text/uri-list')?.split('\n').find((l) => l && !l.startsWith('#'))
  if (uriList) return uriList.trim()

  const html = dt.getData('text/html')
  const fromHtml = html && /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]
  if (fromHtml) return fromHtml

  const text = dt.getData('text/plain')?.trim()
  if (text && /^https?:\/\//i.test(text)) return text

  return null
}

async function fetchAsFile(url: string): Promise<File> {
  let res: Response
  try {
    res = await fetch(url, { mode: 'cors' })
  } catch {
    // Cross-origin images frequently refuse. Say so plainly rather than
    // failing silently, and point at the action that works.
    throw new IntakeError("That image is blocked by its site. Save it first, then drop it in.")
  }
  if (!res.ok) throw new IntakeError("Couldn't fetch that image. Try saving it first.")

  const blob = await res.blob()
  if (!isAccepted(blob.type)) {
    throw new IntakeError('That link is not a PNG, JPEG or WebP image.')
  }
  const name = url.split('/').pop()?.split('?')[0] || 'pasted-image'
  return checkFile(new File([blob], name, { type: blob.type }))
}

/**
 * Resolve a DataTransfer from a paste or drop into a validated image File.
 * Returns null when the payload holds nothing image-like at all.
 */
export async function extractImage(dt: DataTransfer | null): Promise<File | null> {
  if (!dt) return null

  // 1. a real file
  const direct = Array.from(dt.files ?? []).find((f) => f.type.startsWith('image/'))
  if (direct) return checkFile(direct)

  // 2. a clipboard/drag item
  const item = Array.from(dt.items ?? []).find(
    (i) => i.kind === 'file' && i.type.startsWith('image/')
  )
  if (item) {
    const file = item.getAsFile()
    if (file) return checkFile(file)
    // The browser advertised an image but refused to hand over the bytes.
    // Telling the user "that is not a photo" here would be a lie.
    throw new IntakeError("Couldn't read that image. Try saving it, then choosing the file.")
  }

  // 3. a URL only — dragged or copied from a web page
  const url = findUrl(dt)
  if (url) return fetchAsFile(url)

  // Something was dropped, but nothing resembling an image.
  if ((dt.files?.length ?? 0) > 0 || (dt.items?.length ?? 0) > 0) {
    throw new IntakeError('That needs to be a photo — PNG, JPEG or WebP.')
  }
  return null
}

/**
 * Vercel refuses a request body over 4.5MB before it ever reaches the function,
 * and answers with its own error page rather than anything this app can phrase.
 * Measured on production: 4.0MB arrives, 4.4MB does not. A phone photo is
 * routinely bigger than that, so the product's core action failed for a large
 * share of its users with "Something went wrong."
 *
 * So a photo that would not survive the trip is resized before it is sent.
 * Nothing smaller is touched — the common path is byte-for-byte what it was —
 * and 2048px is far more resolution than a 960x720 frame can use anyway.
 */
const SEND_LIMIT_BYTES = 3.5 * 1024 * 1024
const MAX_EDGE = 2048

export async function shrinkForUpload(file: File): Promise<File> {
  if (file.size <= SEND_LIMIT_BYTES) return file

  try {
    // from-image bakes the EXIF rotation into the pixels, so the server sees a
    // photo that is already the right way up.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    // An image this browser cannot decode is not one we can shrink. Send the
    // original and let the server say no — no worse than before this existed.
    return file
  }
}
