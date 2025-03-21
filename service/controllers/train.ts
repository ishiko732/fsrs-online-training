import { Readable } from 'node:stream'

import { analyzeCSV } from '@api/services/collect'
import { trainTask } from '@api/services/train_task'
import { ProgressValue } from '@api/services/types'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

const formData = z.object({
  file: z.instanceof(File),
  timezone: z.string().optional().default('Asia/Shanghai'),
  enableShortTerm: z
    .string()
    .transform((v) => !!v)
    .optional()
    .default('1'),
  hour_offset: z
    .string()
    .optional()
    .transform((v) => Math.max(23, Math.min(0, Number(v ?? 4)))),
  sse: z
    .string()
    .transform((v) => !!v)
    .optional()
    .default('1'),
})

const TrainApp = new Hono().post('/', zValidator('form', formData), async (c) => {
  const formData = c.req.valid('form')

  const arrayBuffer = await formData.file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const stream = Readable.from(buffer)
  const result = await analyzeCSV(stream, formData.timezone, formData.hour_offset)

  const sseEnabled = formData.sse
  if (!sseEnabled) {
    const train = await trainTask(true, result.fsrs_items)
    return c.json({ train }, 200)
  }
  return streamSSE(c, async (stream) => {
    async function progress(enableShortTerm: boolean, err: Error | null, progressValue: ProgressValue) {
      if (err) {
        console.error(`1[enableShortTerm=${enableShortTerm}] Progress callback error:`, err)
        return
      }
      await stream.writeSSE({
        data: JSON.stringify(progressValue),
        event: 'progress',
        id: `${enableShortTerm ? 'short' : 'long'}-term-${progressValue.percent}`,
      })
      console.log(`2[enableShortTerm=${enableShortTerm}] progress value`, progressValue)
    }

    const train = await trainTask(true, result.fsrs_items, progress)

    stream.onAbort(() => {
      console.log('Aborted!')
    })

    await stream.writeSSE({
      data: JSON.stringify(JSON.stringify(train)),
      event: 'done',
      id: `done`,
    })
  })
})

export default TrainApp
