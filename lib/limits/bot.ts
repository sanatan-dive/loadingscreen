/**
 * Invisible bot screening, in front of the two endpoints that cost money.
 *
 * The free-video allowance limits a person; it does not limit a script with a
 * pool of addresses, and Vercel's own rate-limiting rules are a Pro feature.
 * BotID is the part of the platform that is free on this plan and actually
 * looks at whether a browser is real.
 *
 * ## Why this one fails OPEN, when every other guard here fails closed
 *
 * Deliberate, and the reasoning is the mirror image of lib/limits/figure. There,
 * failing open ships exactly the video the module exists to prevent. Here, the
 * worst case of failing open is that a bot gets a video — and the daily spend
 * ceiling already caps what that can cost. The worst case of failing CLOSED is
 * that an outage in someone else's service takes the whole product down on
 * launch day. A capped loss beats an uncapped one.
 */
import { checkBotId } from 'botid/server'
import { LimitError } from './index'

export async function screenForBot(): Promise<void> {
  let isBot: boolean
  try {
    isBot = (await checkBotId()).isBot
  } catch (err) {
    console.error('[bot] check unavailable, allowing:', err)
    return
  }
  if (isBot) {
    console.warn('[bot] refused an automated request')
    // Says nothing useful to a script, and a real person never sees it.
    throw new LimitError('this needs a real browser', 403)
  }
}
