import { BotIdClient } from 'botid/client'
import type { Metadata, Viewport } from 'next'
import { SITE_URL, SITE_NAME, INDEXABLE } from '@/lib/site'
import { Anton, Inter } from 'next/font/google'
import './globals.css'

/**
 * The endpoints worth scripting. /api/generate spends real money per call and
 * /api/render spends an ffmpeg run; nothing else here is worth a bot's time.
 */
const PROTECTED = [
  { path: '/api/generate', method: 'POST' },
  { path: '/api/render', method: 'POST' },
]

const display = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  // Every relative URL below resolves against this. Without it Next resolves
  // them against localhost at build time and every share card 404s.
  metadataBase: new URL(SITE_URL),
  title: 'Loading Screen — your own GTA intro in 15 seconds',
  description:
    'Upload one photo. Get a 15-second GTA-style cinematic intro with your face in it. Free, no sign-up, about fifteen seconds.',
  applicationName: SITE_NAME,
  keywords: [
    'GTA intro generator',
    'GTA loading screen',
    'loading screen generator',
    'AI face swap video',
    'cinematic intro maker',
  ],
  // One origin, whichever host served the page.
  alternates: { canonical: '/' },
  // A preview deployment serves the same page; letting it be indexed publishes
  // a duplicate of the real site under a URL that dies on the next push.
  robots: INDEXABLE
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    url: SITE_URL,
    title: 'Loading Screen — your own GTA intro in 15 seconds',
    description: 'Upload one photo. Get your own GTA-style cinematic intro in about fifteen seconds.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Loading Screen — get on the loading screen' }],
  },
  // Without this the link posts as a bare URL with no picture — and the share
  // is the entire growth loop.
  twitter: {
    card: 'summary_large_image',
    title: 'Loading Screen — your own GTA intro in 15 seconds',
    description: 'Upload one photo. Get your own GTA-style cinematic intro in about fifteen seconds.',
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#08080c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        <BotIdClient protect={PROTECTED} />
      </head>
      <body style={{ fontFamily: 'var(--font-body), ui-sans-serif, system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
