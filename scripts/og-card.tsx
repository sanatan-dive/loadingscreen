/**
 * Builds public/og.png — the picture every shared link shows.
 *
 * It is a static file, generated once and committed, rather than a rendered
 * route: the card never changes per request, and a route would put an image
 * renderer (and a font fetch) in the path of every crawler that visits.
 *
 * The old card was reference-poster.jpg — a frame of the reference video, i.e.
 * a real person's face standing in as the product's logo. That is exactly the
 * third-party content the repo was cleaned of.
 *
 *   npx tsx scripts/og-card.tsx
 */
import { ImageResponse } from 'next/og'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const GOLD = '#FFC13B'
const GOLD_DEEP = '#A35C00'
const INK = '#08080c'
const STAR =
  'M12 2.4l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5 6.1 20.6l1.2-6.6L2.5 9.4l6.6-.9z'

/**
 * Satori has no text-stroke, so the wordmark's depth is a second copy of the
 * text offset behind it. It is deep gold rather than black: a black offset on a
 * near-black background is invisible, which is why the first card read flat.
 */
function Word({ children, size }: { children: string; size: number }) {
  const base = {
    display: 'flex' as const,
    position: 'absolute' as const,
    fontFamily: 'Anton',
    fontSize: size,
    lineHeight: 1,
    textTransform: 'uppercase' as const,
    transform: 'skewX(-6deg)',
    letterSpacing: '-0.015em',
  }
  return (
    <div style={{ position: 'relative', display: 'flex', height: size * 1.12, width: '100%' }}>
      <div style={{ ...base, left: 7, top: 7, color: GOLD_DEEP }}>{children}</div>
      <div style={{ ...base, left: 0, top: 0, color: GOLD }}>{children}</div>
    </div>
  )
}

/** The three reveals, which is the thing people actually stay for. */
function Frame({ i, filled }: { i: number; filled: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        width: 132,
        height: 182,
        marginLeft: i === 0 ? 0 : 15,
        marginTop: i * 14,
        transform: 'skewX(-6deg)',
        borderRadius: 4,
        border: `3px solid ${filled ? GOLD : '#2a2a3a'}`,
        background: filled
          ? 'linear-gradient(160deg, rgba(255,193,59,0.30), rgba(255,193,59,0.05))'
          : 'rgba(20,20,29,0.85)',
        padding: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontFamily: 'Anton',
          fontSize: 30,
          color: filled ? GOLD : '#3b3b4d',
        }}
      >
        {String(i + 1)}
      </div>
    </div>
  )
}

const card = (
  <div
    style={{
      width: 1200,
      height: 630,
      display: 'flex',
      position: 'relative',
      background: INK,
      backgroundImage:
        'radial-gradient(760px 420px at 88% 8%, rgba(255,193,59,0.22), transparent 68%),' +
        'repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 1px, transparent 1px, transparent 4px)',
      color: '#f4f4f6',
      fontFamily: 'Inter',
    }}
  >
    {/* left: the pitch */}
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: 672,
        padding: '0 0 0 68px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <svg key={i} width="26" height="26" viewBox="0 0 24 24">
            <path d={STAR} fill={GOLD} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          </svg>
        ))}
        <div
          style={{
            display: 'flex',
            marginLeft: 10,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: GOLD,
          }}
        >
          Grand Theft Your Face
        </div>
      </div>

      <Word size={86}>Get on the</Word>
      <Word size={86}>loading screen</Word>

      <div style={{ display: 'flex', fontSize: 27, fontWeight: 500, color: '#cfcfda', marginTop: 34 }}>
        Upload one photo. Fifteen seconds later
      </div>
      <div style={{ display: 'flex', fontSize: 27, fontWeight: 500, color: '#cfcfda' }}>
        you&rsquo;re the main character.
      </div>
    </div>

    {/* right: three frames filling in, which is what the product does */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 528, paddingBottom: 30 }}>
      {[0, 1, 2].map((i) => (
        <Frame key={i} i={i} filled={i === 0} />
      ))}
    </div>

    {/* the loading bar, because that is the joke */}
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        display: 'flex',
        width: 1200,
        height: 12,
        background: '#15151f',
      }}
    >
      <div style={{ display: 'flex', width: 760, height: 12, background: GOLD }} />
    </div>

    <div
      style={{
        position: 'absolute',
        left: 68,
        bottom: 36,
        display: 'flex',
        fontSize: 23,
        fontWeight: 800,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: GOLD,
      }}
    >
      loadingscreen.xyz
    </div>
    <div
      style={{
        position: 'absolute',
        right: 68,
        bottom: 38,
        display: 'flex',
        fontSize: 17,
        fontWeight: 700,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: '#8a8a9e',
      }}
    >
      free · no sign-up
    </div>
  </div>
)

/** The fonts are build-time only, so they are fetched rather than vendored. */
async function font(file: string, url: string): Promise<ArrayBuffer> {
  const path = `assets/fonts/${file}`
  if (!existsSync(path)) {
    await mkdir('assets/fonts', { recursive: true })
    const res = await fetch(url)
    if (!res.ok) throw new Error(`could not fetch ${file}: ${res.status}`)
    await writeFile(path, Buffer.from(await res.arrayBuffer()))
  }
  return new Uint8Array(await readFile(path)).buffer as ArrayBuffer
}

const GOOGLE = 'https://raw.githubusercontent.com/google/fonts/main/ofl'

async function main() {
  const anton = await font('Anton-Regular.ttf', `${GOOGLE}/anton/Anton-Regular.ttf`)
  // A static WOFF: satori cannot parse a variable font's fvar table, and it
  // cannot read woff2 at all.
  const inter = await font(
    'Inter-500.woff',
    'https://cdn.jsdelivr.net/npm/@fontsource/inter@4.5.15/files/inter-all-500-normal.woff'
  )
  const png = await new ImageResponse(card, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Anton', data: anton, style: 'normal', weight: 400 },
      { name: 'Inter', data: inter, style: 'normal', weight: 500 },
    ],
  }).arrayBuffer()

  await writeFile('public/og.png', Buffer.from(png))
  console.log(`public/og.png written (${(png.byteLength / 1024).toFixed(0)}KB)`)
}

main()
