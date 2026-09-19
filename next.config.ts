import type { NextConfig } from 'next'
import { withBotId } from 'botid/next/config'

const config: NextConfig = {
  // onnxruntime-node ships darwin + win32 + linux binaries (294MB total).
  // Drop the ones Vercel cannot run, and ffprobe, which is 100MB of linux
  // binaries that only scripts/ ever uses - nothing under lib/ or app/ does.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
      'node_modules/onnxruntime-node/bin/napi-v6/win32/**',
      'node_modules/@img/sharp-darwin-**',
      'node_modules/@img/sharp-win32-**',
      'node_modules/ffprobe-static/bin/**',
    ],
  },
  /**
   * The native binaries MUST be listed here. Nothing discovers them on its own:
   * onnxruntime-node does
   *   require(`../bin/napi-v6/${process.platform}/${process.arch}/...node`)
   * and sharp resolves @img/sharp-<platform>-<arch> the same way. Both paths are
   * computed at runtime, so Next's static tracer cannot see them and shipped a
   * function with no native binaries at all - every route 500'd on import, and
   * locally it looked fine only because node_modules was on disk.
   *
   * Both linux arches are included (69MB) rather than guessing which one the
   * deployment runs on; the previous config excluded arm64 on that guess.
   */
  outputFileTracingIncludes: {
    '/api/**': [
      './models/**',
      './assets/**',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/**',
      './node_modules/@img/sharp-linux*/**',
      './node_modules/@img/sharp-libvips-linux*/**',
    ],
  },
  agentRules: false,
  /**
   * Nobody else gets to host this product inside their own page: an iframe of
   * it is someone else's traffic spending our credits under our name, and it is
   * how a "free GTA intro" ends up wrapped in an ad farm.
   *
   * `camera=(self)` is load-bearing — the upload card can take a photo, and a
   * blanket camera=() silently breaks that.
   *
   * withBotId() appends its own header rule for the path its challenge is
   * served from, which relaxes the framing headers back to 'self' there. That
   * only works because it appends AFTER these: do not move this below it.
   */
  /**
   * Browser-facing media is proxied through this origin so Vercel's CDN caches
   * it, instead of every visitor downloading it from Supabase Storage. See the
   * note on publicUrl() in lib/media.ts for the arithmetic.
   */
  async rewrites() {
    const base = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? '').replace(/\/$/, '')
    if (!base) return []
    return [{ source: '/media/:path*', destination: `${base}/:path*` }]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
      {
        // The media never changes once uploaded, so let every layer keep it.
        // Without this the CDN honours storage's one-hour max-age and re-fetches
        // far more often than it needs to.
        source: '/media/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // A generated video is one person's face. It must never be cached by a
        // shared proxy and handed to the next caller.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ]
  },
  /**
   * These resolve native binaries with path.join(__dirname, ...). Next rewrites
   * __dirname when it bundles a package, producing paths like
   * "/ROOT/node_modules/ffmpeg-static/ffmpeg" that do not exist at runtime.
   * Keeping them external leaves __dirname intact.
   */
  serverExternalPackages: ['ffmpeg-static', 'ffprobe-static', 'onnxruntime-node', 'sharp'],
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
}
/**
 * BotID adds the same-origin rewrites its challenge script is served from.
 * Serving it first-party is the point: a third-party script path is the first
 * thing an ad blocker (and a determined script) drops.
 */
export default withBotId(config)
