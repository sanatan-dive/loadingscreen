/**
 * Refuse to put a famous face on the red carpet.
 *
 * A one-click "put this face in a GTA intro with dramatic music" tool is a
 * short path to something genuinely damaging published under this brand —
 * politicians, dead celebrities, notorious individuals. Refusing costs a
 * thousandth of a dollar; moderating the output after it is posted costs
 * everything.
 *
 * Transport lives in lib/provider/classify. This module owns the policy: where
 * the line is, what the user is told, and what happens when we cannot tell.
 *
 * ## Why two views and not one confidence number
 *
 * Measured, not assumed. Asked about an ordinary man photographed against a
 * press wall, the classifier answered `Adin Ross` at 0.95. Asked about the
 * head crop of the SAME photo it answered `Adama Diomande` at 0.95 — a
 * different person, equally confident. Its self-reported confidence is not a
 * measurement of anything; it will confabulate a plausible name for a face it
 * has never seen and score it 0.95.
 *
 * What did hold was the NAME. Elon Musk came back as `Elon Musk` from both the
 * full frame and the crop, at 1.0 both times; IShowSpeed likewise. Real
 * recognition survives a reframe, a hallucination does not — so we ask twice
 * about two framings and only refuse when the two answers name the same
 * person. It is the same trick lib/gate already plays on identity: one
 * measurement proves nothing, two that agree prove something.
 */
import { decode, detect, crop } from '@/lib/identity'
import { encodePng } from '@/lib/identity/image'
import { headBox } from '@/lib/composite'
import { classify as providerClassify, type FigureVerdict } from '@/lib/provider'
import { LimitError } from './index'

/**
 * A floor, not the decision. It only discards answers the model itself hedges
 * on; the decision is whether two framings agree.
 */
export const FIGURE_CONFIDENCE = 0.6

/**
 * Operator switch, owned by the person running the deployment.
 *
 * Default ON, so a fresh clone screens by default and turning it off is a
 * deliberate act. Set FIGURE_CHECK=off in the environment to disable. It is a
 * config flag rather than a code deletion on purpose: if a complaint or a
 * takedown arrives, protection comes back by changing one variable instead of
 * writing and shipping code.
 *
 * Off means any recognisable person can be placed into the template.
 */
export const FIGURE_CHECK_ENABLED = (process.env.FIGURE_CHECK ?? 'on') !== 'off'

export type Classifier = (photo: Buffer) => Promise<FigureVerdict>

/** `IShowSpeed` and `iShowSpeed.` are the same claim. */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  return norm(a) === norm(b) && norm(a).length > 0
}

/** An answer confident enough to be worth comparing at all. */
function names(v: FigureVerdict): string | null {
  return v.known && v.name && v.confidence >= FIGURE_CONFIDENCE ? v.name : null
}

/**
 * The whole photo and the head alone. The second view is what strips away the
 * backdrop, the clothing and the event — the cues that made the classifier
 * guess a celebrity name for a stranger in the first place.
 */
async function views(photo: Buffer): Promise<Buffer[]> {
  const img = await decode(photo)
  const faces = await detect(img)
  if (faces.length === 0) return [photo]
  const b = headBox(faces[0], img.width, img.height)
  return [photo, await encodePng(crop(img, b.x0, b.y0, b.x1, b.y1))]
}

/**
 * Throws `LimitError` when the photo must not be generated from.
 * Resolves with what the check cost, so the caller can keep the spend ledger
 * honest — an attacker who is refused every time still spends our money.
 */
export async function screenForPublicFigure(
  photo: Buffer,
  classify: Classifier = providerClassify
): Promise<{ costUsd: number }> {
  // Disabled by the operator: no classifier call, so it costs nothing when off.
  if (!FIGURE_CHECK_ENABLED) return { costUsd: 0 }

  let verdicts: FigureVerdict[]
  try {
    // Both views at once: the check sits in front of every generation, so it
    // must cost one round trip of latency, not two.
    verdicts = await Promise.all((await views(photo)).map((v) => classify(v)))
  } catch (err) {
    // Fail closed. This classifier and the image model are the same provider,
    // so if the call cannot be made the generation it guards would fail anyway:
    // closing costs no availability we would really have had, and an open
    // failure ships exactly the video this module exists to prevent.
    console.error('[figure] classifier unavailable:', err)
    throw new LimitError('we could not check that photo just now — try again in a minute', 503)
  }

  const costUsd = verdicts.reduce((sum, v) => sum + v.costUsd, 0)
  const named = verdicts.map(names)
  const agreed = named.length > 1 && named[0] && named[1] && sameName(named[0], named[1])

  if (agreed) {
    // The name is logged, never shown: when the classifier is wrong, naming the
    // person turns a refusal into an accusation we cannot stand behind.
    console.warn(`[figure] refused: ${named[0]}`)
    throw new LimitError(
      'this only works on your own photo — upload a picture of you, or someone who agreed',
      403,
      0,
      costUsd
    )
  }

  if (named[0] || named[1]) {
    // Worth knowing how often the two views disagree; it is the false-positive
    // rate of a single call, and it is not small.
    console.info(`[figure] views disagreed, allowing: ${named.join(' vs ')}`)
  }
  return { costUsd }
}
