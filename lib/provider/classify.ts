/**
 * Ask a vision model whether an uploaded photo is a well-known public figure.
 *
 * This is transport only — it reports what the model said. The decision of what
 * to do about it lives in lib/limits/figure, because refusing a user is policy.
 *
 * A different model from the image ladder on purpose: this one only has to read
 * a face and answer yes or no, and at $0.25/M prompt tokens a check costs about
 * $0.0005 — half a percent of the $0.10 generation it protects.
 */
import sharp from 'sharp'
import { ProviderError } from './index'

export const CLASSIFY_MODEL = 'google/gemini-3.1-flash-lite'

/**
 * Recognising a famous face does not need a 10MB upload. Downscaling first cuts
 * the image tokens — which are both the cost and most of the latency of a check
 * that sits in front of every single generation.
 */
const CLASSIFY_EDGE = 512

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
/** Two attempts, not four. This guard fails closed, so retrying only delays a no. */
const MAX_ATTEMPTS = 2

export interface FigureVerdict {
  known: boolean
  /** Who the model thinks it is. Logged, never shown to the user. */
  name: string | null
  confidence: number
  costUsd: number
}

/**
 * The setting is not evidence. An early version flagged an ordinary man as a
 * named streamer at 0.95 confidence purely because the photo was taken against
 * a red-carpet press wall — the context was doing the recognising, not the
 * face. Every "ignore the surroundings" clause below is load-bearing.
 */
const PROMPT = [
  'Look ONLY at the face in this photograph.',
  '',
  'Is this specific person a widely recognised public figure — a politician, head of',
  'state, actor, musician, athlete, business leader, internet celebrity, or a notorious',
  'historical individual?',
  '',
  'Judge the face alone. IGNORE the setting, the clothing, the backdrop, the event, the',
  'lighting and any logos or text in the image. A red carpet, a press wall, a stage or a',
  'microphone does NOT make someone famous — ordinary people are photographed in all of',
  'those places. Do not infer fame from the surroundings.',
  '',
  'You must be able to NAME the person from their face. If you cannot give a specific',
  'name, the answer is known=false — "this looks like a celebrity photo" is not',
  'recognition. An ordinary person who merely resembles someone famous is not a public',
  'figure.',
  '',
  'Answer with JSON only, no prose and no markdown fence:',
  '{"known": true|false, "name": "their full name, or null", "confidence": 0.0-1.0}',
].join('\n')

/** Tolerant of a model that wraps its JSON in a fence despite being told not to. */
function parseVerdict(text: string): Omit<FigureVerdict, 'costUsd'> {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new ProviderError('classifier returned no JSON', false)
  const raw = JSON.parse(match[0]) as Record<string, unknown>
  const confidence = Number(raw.confidence)
  return {
    known: raw.known === true,
    name: typeof raw.name === 'string' && raw.name !== 'null' ? raw.name : null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  }
}

export async function classify(photo: Buffer): Promise<FigureVerdict> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new ProviderError('OPENROUTER_API_KEY missing', false)

  const small = await sharp(photo)
    .resize(CLASSIFY_EDGE, CLASSIFY_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CLASSIFY_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${small.toString('base64')}` },
              },
            ],
          },
        ],
      }),
    })

    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 200))
      continue
    }
    if (!res.ok) throw new ProviderError(`classifier ${res.status}: ${await res.text()}`, false)

    const body = await res.json()
    const text: string | undefined = body?.choices?.[0]?.message?.content
    if (!text) throw new ProviderError('classifier returned no content', true)

    return { ...parseVerdict(text), costUsd: Number(body?.usage?.cost ?? 0) }
  }
  throw new ProviderError('classifier unavailable', false)
}
