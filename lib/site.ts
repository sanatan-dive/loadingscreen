/**
 * The one origin this product is indexed and shared under.
 *
 * The same app answers on loadingscreen.xyz and on the vercel.app deployment.
 * Without a single canonical origin Google indexes both and splits the ranking
 * between them, and a share card built from relative URLs resolves against
 * whichever host the browser happened to be on — which, for a product whose
 * growth loop IS the share, is the whole growth loop pointing at the wrong name.
 */
export const SITE_URL = 'https://loadingscreen.xyz'

export const SITE_NAME = 'Cutscene'

/**
 * Preview deployments answer on their own vercel.app hostnames. They serve
 * identical content, so letting a crawler reach one publishes duplicates of the
 * real site under URLs that vanish on the next push.
 */
export const INDEXABLE = process.env.VERCEL_ENV !== 'preview'
