export interface Shot {
  id: string
  file: string
  /**
   * Authored expression. Magnitude wording is load-bearing: asking for more
   * change than the shot needs drags the reference's bone structure and skin
   * tone across, which collapses identity.
   */
  expression: string
}

export interface Theme {
  id: ThemeId
  label: string
  file: string
  /** Seconds into the track where the 15s cue begins. */
  cueStart: number
}

export type ThemeId = 'gta-sa' | 'gta-4' | 'gta-5'

export interface Template {
  id: string
  label: string
  shots: Shot[]
  themes: Theme[]
}

/** Every value measured from the reference video. See the design doc. */
export const TIMING = {
  width: 960,
  height: 720,
  fps: 24,
  shotDuration: 17 / 3,
  crossfade: 1.0,
  panPxPerSec: 8.7,
  panSourceWidth: 1056,
  panSourceHeight: 792,
  total: 15.0,
  offsets(): [number, number] {
    const d = TIMING.shotDuration
    const x = TIMING.crossfade
    return [d - x, 2 * d - 2 * x]
  },
}

const GTA_REDCARPET: Template = {
  id: 'gta-redcarpet',
  label: 'Red Carpet',
  shots: [
    {
      id: 'shot_1',
      file: 'assets/templates/gta-redcarpet/shot_1.png',
      expression:
        'a subtle confident closed-mouth smirk: lips firmly together, no teeth visible at all, ' +
        'just the corners of the mouth pulled up and very slightly to one side, eyes relaxed ' +
        'looking straight at the camera. Keep the change minimal - this is a small smirk, not a grin',
    },
    {
      id: 'shot_2',
      file: 'assets/templates/gta-redcarpet/shot_2.png',
      expression:
        'a warm open smile showing the upper front teeth, mouth clearly open in a grin, cheeks ' +
        'pushed up, eyes narrowed slightly by the smile, head tilted, looking at the camera',
    },
    {
      id: 'shot_3',
      file: 'assets/templates/gta-redcarpet/shot_3.png',
      expression:
        'a subtle amused closed-mouth smile, lips together with the corners drawn up and slightly ' +
        'to one side in a smirk, calm direct gaze at the camera. Keep the change minimal',
    },
  ],
  themes: [
    { id: 'gta-sa', label: 'San Andreas', file: 'assets/audio/themes/gta-sa.mp3', cueStart: 6 },
    { id: 'gta-4', label: 'GTA IV', file: 'assets/audio/themes/gta-4.mp3', cueStart: 1 },
    { id: 'gta-5', label: 'GTA V', file: 'assets/audio/themes/gta-5.mp3', cueStart: 6 },
  ],
}

const TEMPLATES: Record<string, Template> = { 'gta-redcarpet': GTA_REDCARPET }

export function getTemplate(id: string): Template {
  const t = TEMPLATES[id]
  if (!t) throw new Error(`unknown template: ${id}`)
  return t
}

export function getTheme(template: Template, id: string): Theme {
  const t = template.themes.find((x) => x.id === id)
  if (!t) throw new Error(`unknown theme: ${id}`)
  return t
}

export function listTemplates(): Template[] {
  return Object.values(TEMPLATES)
}
