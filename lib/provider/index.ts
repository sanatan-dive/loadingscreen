export interface EditRequest {
  crop: Buffer
  face: Buffer
  model: string
  expression: string
}

export interface EditResult {
  image: Buffer
  model: string
  ms: number
  costUsd: number
}

/**
 * Two rungs, not three. Measured on the same crop and face:
 *
 *   flash-lite   10.2s  $0.0342  identity 0.804   <- default
 *   flash-image  13.0s  $0.0684  identity 0.640   <- strictly dominated, omitted
 *   pro-image    26.6s  $0.1405  identity 0.799   <- fallback
 *
 * flash-image is slower AND pricier AND less accurate than flash-lite, so it
 * only ever added latency and spend. Dropping it caps the worst case around
 * 36s instead of 50s.
 */
export const MODEL_LADDER = [
  'google/gemini-3.1-flash-lite-image',
  'google/gemini-3-pro-image',
] as const

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_CONCURRENT = 6
const MAX_RETRIES = 4

let inFlight = 0
const waiting: (() => void)[] = []

async function acquire(): Promise<void> {
  if (inFlight >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  inFlight++
}

function release(): void {
  inFlight--
  waiting.shift()?.()
}

/**
 * Expression arrives as authored template data. Pointing the model at the
 * reference image for expression drags its bone structure and skin tone
 * across, so we describe the expression in words instead.
 */
export function buildPrompt(expression: string): string {
  return [
    'You are performing a FACE REPLACEMENT edit. Two inputs:',
    'IMAGE A (first) = the scene. IMAGE B (second) = the identity to insert.',
    '',
    "Replace the man's face, hair and neck in IMAGE A with the man from IMAGE B. The output MUST",
    'clearly be the man from IMAGE B: his exact bone structure, his exact skin tone, his hair, his',
    'beard, his eye colour. Do not blend the two men. Do not darken or lighten his skin to match',
    'IMAGE A.',
    '',
    `Give him this facial expression: ${expression}.`,
    'This expression is required - do not render him neutral, deadpan or serious.',
    '',
    'Keep from IMAGE A only: the clothing, the background, the head angle, the lighting direction,',
    'the framing.',
    'Photorealistic, matching grain. No text.',
  ].join('\n')
}

const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class ProviderError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = 'ProviderError'
  }
}

export async function edit(req: EditRequest): Promise<EditResult> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new ProviderError('OPENROUTER_API_KEY missing', false)

  await acquire()
  const started = Date.now()
  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: req.model,
          modalities: ['image', 'text'],
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: buildPrompt(req.expression) },
                { type: 'image_url', image_url: { url: dataUrl(req.crop) } },
                { type: 'image_url', image_url: { url: dataUrl(req.face) } },
              ],
            },
          ],
        }),
      })

      if (res.status === 429 || res.status >= 500) {
        await sleep(2 ** attempt * 500 + Math.random() * 300)
        continue
      }
      if (!res.ok) {
        throw new ProviderError(`provider ${res.status}: ${await res.text()}`, false)
      }

      const body = await res.json()
      const url: string | undefined = body?.choices?.[0]?.message?.images?.[0]?.image_url?.url
      if (!url) throw new ProviderError('provider returned no image', true)

      return {
        image: Buffer.from(url.split(',')[1], 'base64'),
        model: req.model,
        ms: Date.now() - started,
        costUsd: Number(body?.usage?.cost ?? 0),
      }
    }
    throw new ProviderError('provider exhausted retries', false)
  } finally {
    release()
  }
}
