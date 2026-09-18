import { TIMING } from '@/lib/template'

/**
 * The reference has a pure horizontal pan and ZERO zoom — measured at scale
 * 1.00 with correlation 0.9955. Any zoompan here would be wrong.
 */
export function buildFiltergraph(): string {
  const {
    width,
    height,
    fps,
    shotDuration: D,
    crossfade: X,
    panPxPerSec,
    panSourceWidth,
    panSourceHeight,
  } = TIMING
  const [o1, o2] = TIMING.offsets()

  const headroom = panSourceWidth - width
  const travel = panPxPerSec * D
  const startX = Math.round((headroom + travel) / 2)
  const yOff = Math.round((panSourceHeight - height) / 2)
  const pan = `crop=${width}:${height}:x='${startX}-${panPxPerSec}*t':y=${yOff}`

  const chains = [0, 1, 2]
    .map(
      (i) =>
        `[${i}:v]scale=${panSourceWidth}:${panSourceHeight}:flags=lanczos,` +
        `loop=loop=-1:size=1:start=0,fps=${fps},${pan},setsar=1,` +
        `trim=duration=${D.toFixed(3)}[v${i}];`
    )
    .join('')

  return (
    chains +
    `[v0][v1]xfade=transition=fade:duration=${X}:offset=${o1.toFixed(3)}[x1];` +
    `[x1][v2]xfade=transition=fade:duration=${X}:offset=${o2.toFixed(3)}[vout]`
  )
}
