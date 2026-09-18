import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { FFMPEG } from '@/lib/runtime'
import { TIMING } from '@/lib/template'
import { buildFiltergraph } from './filtergraph'

const exec = promisify(execFile)

export interface RenderOptions {
  cueStart: number
  silent: boolean
}

export function buildArgs(
  shots: [string, string, string],
  audio: string,
  out: string,
  opts: RenderOptions
): string[] {
  const af = 'afade=t=in:st=0:d=0.6,afade=t=out:st=13.5:d=1.5,loudnorm=I=-14:TP=-1.5:LRA=11'
  return [
    '-v', 'error', '-y',
    ...shots.flatMap((s) => ['-i', s]),
    ...(opts.silent ? [] : ['-ss', String(opts.cueStart), '-i', audio]),
    '-filter_complex', buildFiltergraph(),
    '-map', '[vout]',
    ...(opts.silent
      ? ['-an']
      : ['-map', '3:a', '-af', af, '-c:a', 'aac', '-b:a', '192k']),
    '-t', String(TIMING.total),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-r', String(TIMING.fps),
    '-movflags', '+faststart',
    out,
  ]
}

export async function render(
  shots: [string, string, string],
  audio: string,
  out: string,
  opts: RenderOptions
): Promise<void> {
  await exec(FFMPEG, buildArgs(shots, audio, out, opts), { maxBuffer: 1 << 26 })
}

export { buildFiltergraph }
