/**
 * Guards that can be answered from the request headers alone, before a byte of
 * the body is read. They exist so that the cheapest possible work refuses the
 * cheapest possible attack.
 */
import { LimitError } from './index'
import { MAX_UPLOAD_BYTES } from './upload'

/** The photo plus multipart framing. Anything larger is not a photo upload. */
export const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024

/**
 * Refuse a POST that came from someone else's page.
 *
 * `multipart/form-data` is a CORS-simple content type, so any site on the
 * internet can post a hidden form to this endpoint from a visitor's browser —
 * with their cookies — and spend our credits without ever reading the response.
 * The browser cannot be stopped from sending it, but it always labels it: a
 * cross-site POST carries an `Origin` that is not ours.
 *
 * A missing Origin is allowed through. curl and the deploy checks send none,
 * and they are already covered by the allowance; the token bucket is what
 * limits a determined script, not this.
 */
export function sameOrigin(req: Request): void {
  const origin = req.headers.get('origin')
  if (!origin) return
  const host = req.headers.get('host')
  let sent: string
  try {
    sent = new URL(origin).host
  } catch {
    throw new LimitError('bad request', 403)
  }
  if (!host || sent !== host) throw new LimitError('bad request', 403)
}

/**
 * Reject an oversized upload from its Content-Length, before buffering it.
 * validateUpload also checks the size, but only after the whole thing is in
 * memory — which is the part an attacker is actually spending.
 */
export function withinBodyLimit(req: Request): void {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_REQUEST_BYTES) {
    throw new LimitError('that photo is too large — keep it under 10MB', 413)
  }
}
