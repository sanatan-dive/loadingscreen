import type { NextConfig } from 'next'

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
   * These resolve native binaries with path.join(__dirname, ...). Next rewrites
   * __dirname when it bundles a package, producing paths like
   * "/ROOT/node_modules/ffmpeg-static/ffmpeg" that do not exist at runtime.
   * Keeping them external leaves __dirname intact.
   */
  serverExternalPackages: ['ffmpeg-static', 'ffprobe-static', 'onnxruntime-node', 'sharp'],
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
}
export default config
