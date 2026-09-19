/**
 * The share is the entire growth loop, so the things that make a shared link
 * render are load-bearing product, not metadata housekeeping.
 */
import { describe, it, expect, vi } from 'vitest'
import { existsSync } from 'node:fs'

// next/font runs in the build, not in a test runner.
vi.mock('next/font/google', () => ({
  Anton: () => ({ variable: '--font-display', className: 'display' }),
  Inter: () => ({ variable: '--font-body', className: 'body' }),
}))

const { metadata } = await import('@/app/layout')
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { SITE_URL } from '@/lib/site'

describe('how a shared link renders', () => {
  it('resolves its images against the real origin, not localhost', () => {
    // Without metadataBase, Next resolves a relative image against
    // http://localhost:3000 at build time and every card 404s in the wild.
    expect(metadata.metadataBase?.toString()).toContain('loadingscreen.xyz')
    expect(metadata.alternates?.canonical).toBe('/')
  })

  it('posts to X as a picture, not a bare link', () => {
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' })
  })

  // A card that points at a file we did not ship is worse than no card.
  it('ships the image the card points at', () => {
    const og = (metadata.openGraph?.images as { url: string; width: number; height: number }[])[0]
    expect(og.url).toBe('/og.png')
    expect(og.width).toBe(1200)
    expect(og.height).toBe(630)
    expect(existsSync('public/og.png')).toBe(true)
  })

  it('does not advertise the money-spending routes to crawlers', () => {
    const rules = robots().rules as { allow?: string; disallow?: string }
    expect(rules.disallow).toBe('/api/')
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })

  it('points the sitemap at the canonical origin', () => {
    expect(sitemap()[0].url).toBe(SITE_URL)
  })
})
