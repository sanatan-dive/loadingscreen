import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import * as ort from 'onnxruntime-node'

const exec = promisify(execFile)

export const FFMPEG = ffmpegPath as unknown as string

export interface RuntimeInfo {
  ffmpegVersion: string
  onnxVersion: string
}

export async function runtimeInfo(): Promise<RuntimeInfo> {
  const { stdout } = await exec(FFMPEG, ['-version'])
  const ffmpegVersion = /ffmpeg version (\S+)/.exec(stdout)?.[1] ?? ''
  return { ffmpegVersion, onnxVersion: ort.env.versions.common }
}
