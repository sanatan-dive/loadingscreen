import { GATE } from '@/lib/identity'

export interface GateInput {
  vsUser: number
  vsOriginal: number
}

export interface GateResult {
  pass: boolean
  reason?: string
  vsUser: number
  vsOriginal: number
}

/**
 * The module that stops the product shipping strangers' faces.
 *
 * Observed failure modes this catches:
 *  - silent no-op: the model returns the ORIGINAL face re-rendered (0.968)
 *  - generic third person: neither the user nor the original (0.246 / 0.074)
 *  - undetectable output: the model returns something with no findable face
 */
export function verify({ vsUser, vsOriginal }: GateInput): GateResult {
  const base = { vsUser, vsOriginal }
  if (Number.isNaN(vsUser) || Number.isNaN(vsOriginal)) {
    return { ...base, pass: false, reason: 'no face detected in result' }
  }
  if (vsOriginal >= vsUser) {
    return { ...base, pass: false, reason: 'result resembles the original subject, not the user' }
  }
  if (vsUser < GATE) {
    return {
      ...base,
      pass: false,
      reason: `identity below threshold (${vsUser.toFixed(3)} < ${GATE})`,
    }
  }
  return { ...base, pass: true }
}
