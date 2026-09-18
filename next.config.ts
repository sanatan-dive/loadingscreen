import type { NextConfig } from 'next'

const config: NextConfig = {
  // onnxruntime-node ships darwin + win32 + linux binaries (294MB total).
  // Vercel runs linux/x64 only; without these exclusions the function
  // exceeds the 250MB limit. Measured: 294MB -> 127MB.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
      'node_modules/onnxruntime-node/bin/napi-v6/win32/**',
      'node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**',
      'node_modules/@img/sharp-darwin-**',
      'node_modules/@img/sharp-win32-**',
    ],
  },
  outputFileTracingIncludes: {
    '/api/**': ['./models/**', './assets/**'],
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
