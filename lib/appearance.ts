/**
 * Appearance options.
 *
 * These become prompt directives, not post-processing. The lesson from the
 * expression work applies here too: state magnitude, and only say something
 * when the user actually asked for a change. Every extra instruction pulls the
 * result further from the person's real face, so "keep mine" emits nothing at
 * all rather than emitting "keep the hair the same" — which the model reads as
 * an invitation to redraw it.
 */

export type HairChoice = 'keep' | 'braids' | 'buzz' | 'long' | 'curly'
export type OutfitChoice = 'keep' | 'suit' | 'hoodie' | 'chain'
export type SkinChoice = 'match' | 'lighter' | 'deeper'

export interface Appearance {
  hair?: HairChoice
  outfit?: OutfitChoice
  skin?: SkinChoice
}

export const DEFAULT_APPEARANCE: Required<Appearance> = {
  hair: 'keep',
  outfit: 'keep',
  skin: 'match',
}

interface Option<T extends string> {
  id: T
  label: string
  /** Empty means "say nothing" — the safest instruction is no instruction. */
  directive: string
}

export const HAIR_OPTIONS: Option<HairChoice>[] = [
  { id: 'keep', label: 'My hair', directive: '' },
  {
    id: 'braids',
    label: 'Braids',
    directive:
      'Give him short neat cornrow braids tight to the scalp running front to back, ' +
      'in his own natural hair colour',
  },
  { id: 'buzz', label: 'Buzz cut', directive: 'Give him a short even buzz cut in his own natural hair colour' },
  { id: 'long', label: 'Long hair', directive: 'Give him longer hair down past the ears, in his own natural hair colour' },
  { id: 'curly', label: 'Curly', directive: 'Give him short tight curls, in his own natural hair colour' },
]

export const OUTFIT_OPTIONS: Option<OutfitChoice>[] = [
  { id: 'keep', label: 'The jacket', directive: '' },
  {
    id: 'suit',
    label: 'Black suit',
    directive: 'Change the clothing to a sharp black suit jacket over a crisp white shirt',
  },
  {
    id: 'hoodie',
    label: 'Hoodie',
    directive: 'Change the clothing to a plain black hoodie',
  },
  {
    id: 'chain',
    label: 'Add a chain',
    directive: 'Add a chunky silver chain necklace over the existing clothing',
  },
]

export const SKIN_OPTIONS: Option<SkinChoice>[] = [
  // The default actively reinforces fidelity: the model has been observed
  // drifting skin tone toward the reference subject.
  {
    id: 'match',
    label: 'Match my photo',
    directive: '',
  },
  { id: 'lighter', label: 'Lighter', directive: 'Render his skin tone a little lighter than in IMAGE B' },
  { id: 'deeper', label: 'Deeper', directive: 'Render his skin tone a little deeper than in IMAGE B' },
]

function directiveFor<T extends string>(options: Option<T>[], id: T | undefined): string {
  return options.find((o) => o.id === id)?.directive ?? ''
}

/** The extra prompt lines for a set of choices. Empty when nothing changed. */
export function appearanceDirectives(a: Appearance = {}): string[] {
  return [
    directiveFor(HAIR_OPTIONS, a.hair),
    directiveFor(OUTFIT_OPTIONS, a.outfit),
    directiveFor(SKIN_OPTIONS, a.skin),
  ].filter(Boolean)
}

/** Stable key fragment for the shot cache. Defaults collapse to ''. */
export function appearanceKey(a: Appearance = {}): string {
  const parts: string[] = []
  if (a.hair && a.hair !== 'keep') parts.push(`hair=${a.hair}`)
  if (a.outfit && a.outfit !== 'keep') parts.push(`outfit=${a.outfit}`)
  if (a.skin && a.skin !== 'match') parts.push(`skin=${a.skin}`)
  return parts.join('&')
}

/** Reject anything not in the option lists — this reaches a prompt. */
export function parseAppearance(raw: unknown): Appearance {
  const o = (raw ?? {}) as Record<string, unknown>
  const pick = <T extends string>(options: Option<T>[], v: unknown): T | undefined =>
    options.find((opt) => opt.id === v)?.id
  return {
    hair: pick(HAIR_OPTIONS, o.hair),
    outfit: pick(OUTFIT_OPTIONS, o.outfit),
    skin: pick(SKIN_OPTIONS, o.skin),
  }
}
