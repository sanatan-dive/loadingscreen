import { readFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'
import { generate } from '@/lib/pipeline'
import { getTemplate, getTheme } from '@/lib/template'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Previews go down the wire many times; keep them small. */
async function preview(png: Buffer): Promise<string> {
  const jpeg = await sharp(png).resize(420).jpeg({ quality: 72 }).toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

export function parseBody(form: FormData) {
  const photo = form.get('photo')
  const templateId = String(form.get('templateId') ?? 'gta-redcarpet')
  const themeId = String(form.get('themeId') ?? '')
  const silent = String(form.get('silent') ?? '') === 'true'

  if (!(photo instanceof File)) throw new Error('photo is required')
  if (photo.size > 10 * 1024 * 1024) throw new Error('photo is too large')

  const template = getTemplate(templateId)
  getTheme(template, themeId) // throws on an unknown theme

  return { photo, templateId, themeId, silent }
}

export async function POST(req: Request) {
  let parsed: ReturnType<typeof parseBody>
  try {
    parsed = parseBody(await req.formData())
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'bad request' }, { status: 400 })
  }

  const photo = Buffer.from(await parsed.photo.arrayBuffer())
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))

      try {
        for await (const ev of generate({
          photo,
          templateId: parsed.templateId,
          themeId: parsed.themeId,
          silent: parsed.silent,
        })) {
          if (ev.type === 'shot') {
            send({ type: 'shot', index: ev.index, src: await preview(ev.image), vsUser: ev.vsUser })
          } else if (ev.type === 'done') {
            const mp4 = await readFile(ev.video)
            send({
              type: 'done',
              src: `data:video/mp4;base64,${mp4.toString('base64')}`,
              costUsd: ev.costUsd,
              ms: ev.ms,
            })
            unlink(ev.video).catch(() => {})
          } else {
            send({ type: 'error', message: ev.message })
          }
        }
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'generation failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
