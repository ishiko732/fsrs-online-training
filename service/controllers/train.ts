import { Readable } from 'node:stream'

import { analyzeCSV } from '@api/services/collect'
import { trainTask } from '@api/services/train_task'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

const formData = z.object({
  file: z.instanceof(File),
  timezone: z.string().optional().default('Asia/Shanghai'),
  hour_offset: z.number().min(0).max(23).default(4),
  sse: z.boolean().optional().default(false),
})

const TrainApp = new Hono().post('/', zValidator('form', formData), async (c) => {
  const formData = c.req.valid('form')

  const arrayBuffer = await formData.file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const stream = Readable.from(buffer)
  const result = await analyzeCSV(stream, formData.timezone, formData.hour_offset)
  const train = await trainTask(true, result.fsrs_items)
  return c.json({ train }, 200)
})

export default TrainApp
