/**
 * Users should never read a stack trace. `spawn /ROOT/.../ffmpeg ENOENT` told
 * a real person their photo was the problem when it was our deploy config.
 *
 * Maps an internal failure to something a person can act on, and returns the
 * technical detail separately so it can be logged rather than displayed.
 */
export interface UserFacingError {
  message: string
  detail: string
  /** True when the user can fix it by changing their input. */
  actionable: boolean
}

export function toUserError(err: unknown): UserFacingError {
  const detail = err instanceof Error ? err.message : String(err)

  // Things the user caused and can fix.
  if (/no face|couldn't find a face/i.test(detail)) {
    return { message: "We couldn't find a face in that photo.", detail, actionable: true }
  }
  if (/more than one face/i.test(detail)) {
    return { message: 'That photo has more than one face — use a solo shot.', detail, actionable: true }
  }
  if (/too large/i.test(detail)) {
    return { message: 'That photo is too large — keep it under 10MB.', detail, actionable: true }
  }
  if (/needs to be a photo|not a PNG/i.test(detail)) {
    return { message: 'That needs to be a photo — PNG, JPEG or WebP.', detail, actionable: true }
  }
  if (/identity below threshold|resembles the original/i.test(detail)) {
    return {
      message: "We couldn't get a good likeness from that photo. A clear, front-facing one works best.",
      detail,
      actionable: true,
    }
  }

  // Things we caused. Never blame the user's photo for our infrastructure.
  if (/ENOENT|spawn|ffmpeg|onnx|binary not found/i.test(detail)) {
    return { message: 'Something broke on our end. Try again in a minute.', detail, actionable: false }
  }
  if (/rate limit|429|capacity reached/i.test(detail)) {
    return { message: 'We are at capacity right now. Try again shortly.', detail, actionable: false }
  }
  if (/OPENROUTER|provider|no image/i.test(detail)) {
    return { message: 'The image service is having a moment. Try again.', detail, actionable: false }
  }

  return { message: 'Something went wrong. Try again.', detail, actionable: false }
}
