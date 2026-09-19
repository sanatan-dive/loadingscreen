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
const INK = '#08080c'
const STAR =
  'M12 2.4l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5 6.1 20.6l1.2-6.6L2.5 9.4l6.6-.9z'

/** Satori has no text-stroke, so the wordmark's hard offset shadow is a
 *  second copy of the text sitting behind it in black. */
function Word({ children, top }: { children: string; top: number }) {
  const base = {
    position: 'absolute' as const,
    left: 0,
    top,
    fontFamily: 'Anton',
    fontSize: 104,
    lineHeight: 1,
    textTransform: 'uppercase' as const,
    transform: 'skewX(-5deg)',
    letterSpacing: '-0.012em',
  }
  return (
    <div style={{ position: 'relative', display: 'flex', height: 108, width: '100%' }}>
      <div style={{ ...base, left: 6, top: top + 6, color: INK }}>{children}</div>
      <div style={{ ...base, color: GOLD }}>{children}</div>
    </div>
  )
}

const card = (
  <div
    style={{
      width: 1200,
      height: 630,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      background: INK,
      backgroundImage: 'radial-gradient(900px 420px at 78% 18%, rgba(255,193,59,0.20), transparent 70%)',
      padding: '0 74px',
      color: '#f4f4f6',
      fontFamily: 'Inter, sans-serif',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="30" height="30" viewBox="0 0 24 24">
          <path d={STAR} fill={GOLD} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      ))}
      <div
        style={{
          marginLeft: 12,
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: GOLD,
        }}
      >
        Grand Theft Your Face
      </div>
    </div>

    <Word top={0}>Get on the</Word>
    <Word top={0}>loading screen</Word>

    <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 40 }}>
      <div style={{ fontSize: 30, fontWeight: 500, color: '#c9c9d4' }}>
        One photo in. Fifteen seconds later you&rsquo;re the main character.
      </div>
    </div>
    <div
      style={{
        display: 'flex',
        marginTop: 26,
        fontSize: 25,
        fontWeight: 800,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: GOLD,
      }}
    >
      loadingscreen.xyz
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
