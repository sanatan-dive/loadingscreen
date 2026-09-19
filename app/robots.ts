import type { MetadataRoute } from 'next'
import { SITE_URL, INDEXABLE } from '@/lib/site'

/**
 * The API routes are disallowed because a crawler reaching /api/generate costs
 * real money to answer and can only ever fail; there is nothing there to index.
 */
export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
