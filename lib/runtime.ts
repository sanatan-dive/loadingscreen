import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ffmpegStatic from 'ffmpeg-static'
import * as ort from 'onnxruntime-node'

const exec = promisify(execFile)

/**
 * Resolve the ffmpeg binary.
 *
 * `ffmpeg-static` computes its path with path.join(__dirname, 'ffmpeg'). When a
 * bundler rewrites __dirname the result is a path like
 * "/ROOT/node_modules/ffmpeg-static/ffmpeg", which does not exist. The package
 * is listed in serverExternalPackages so this should not happen — these
 * fallbacks make the failure recoverable rather than fatal, and the throw
 * names the problem instead of surfacing a bare ENOENT to a user.
 */
function resolveFfmpeg(): string {
  const candidates: string[] = []

  if (typeof ffmpegStatic === 'string' && ffmpegStatic) candidates.push(ffmpegStatic)
  if (process.env.FFMPEG_PATH) candidates.unshift(process.env.FFMPEG_PATH)

  try {
    const req = createRequire(import.meta.url)
    candidates.push(path.join(path.dirname(req.resolve('ffmpeg-static/package.json')), 'ffmpeg'))
  } catch {
    // resolution is best-effort
  }
  candidates.push(path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'))

  const found = candidates.find((p) => p && !p.startsWith('/ROOT/') && existsSync(p))
  if (!found) {
    throw new Error(
      `ffmpeg binary not found. Tried: ${candidates.join(', ')}. ` +
        `Ensure 'ffmpeg-static' is in serverExternalPackages, or set FFMPEG_PATH.`
    )
  }
  return found
}

let cached: string | null = null

export function ffmpegPath(): string {
  cached ??= resolveFfmpeg()
  return cached
}

export interface RuntimeInfo {
  ffmpegVersion: string
  ffmpegPath: string
  onnxVersion: string
}

export async function runtimeInfo(): Promise<RuntimeInfo> {
  const bin = ffmpegPath()
  const { stdout } = await exec(bin, ['-version'])
  return {
    ffmpegVersion: /ffmpeg version (\S+)/.exec(stdout)?.[1] ?? '',
    ffmpegPath: bin,
    onnxVersion: ort.env.versions.common,
  }
}
