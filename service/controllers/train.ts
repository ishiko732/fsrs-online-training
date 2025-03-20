import { Readable } from 'node:stream'

import { analyzeCSV } from '@api/services/collect'
import { trainTask } from '@api/services/train_task'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

const formData = z.object({
  file: z.instanceof(File),
})

const TrainApp = new Hono().post('/', zValidator('form', formData), async (c) => {
  const { file } = c.req.valid('form')

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const stream = Readable.from(buffer)
  const result = await analyzeCSV(stream, 'Asia/Shanghai', 4)
  const train = await trainTask(true, result.fsrs_items)
  return c.json({ train }, 200)
})

export default TrainApp
