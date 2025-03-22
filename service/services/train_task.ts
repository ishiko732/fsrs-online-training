'use server'
// tip: It cannot run on Vercel because it got optimized away.
import { TTrainFormData } from '@api/controllers/train.schema'
import { FSRS, FSRSItem, FSRSReview } from 'fsrs-rs-nodejs'
import { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { Readable } from 'stream'
import { generatorParameters } from 'ts-fsrs'

import { analyzeCSV } from './collect'
import { FSRSItem as BasicFSRSItem, ProgressValue } from './types'

type ProgressFunction = (enableShortTerm: boolean, err: Error | null, progressValue: ProgressValue) => void

function basicProgress(enableShortTerm: boolean, err: Error | null, progressValue: ProgressValue) {
  if (err) {
    console.error(`[enableShortTerm=${enableShortTerm}] Progress callback error:`, err)
    return
  }
  console.log(`[enableShortTerm=${enableShortTerm}] progress value`, progressValue)
}

async function computeParametersWrapper(enableShortTerm: boolean, fsrsItems: FSRSItem[], progress: ProgressFunction) {
  // create FSRS instance and optimize
  const fsrs = new FSRS(null)

  const optimizedParameters = await fsrs.computeParameters(fsrsItems, enableShortTerm, progress.bind(null, enableShortTerm), 1000 /** 1s */)
  return optimizedParameters
}

export async function trainTask(enableShortTerm: boolean, fsrsItems: BasicFSRSItem[], progress: ProgressFunction = basicProgress) {
  const fsrs_items = fsrsItems.map(
    (item: BasicFSRSItem) => new FSRSItem(item.map((review) => new FSRSReview(review.rating, review.deltaT))),
  )
  return computeParametersWrapper(enableShortTerm, fsrs_items, progress)
}

export async function trainByFormData<Ctx extends Context>(c: Ctx, formData: TTrainFormData) {
  const message_queue: Array<{ data: string; event: string; id: string }> = []
  let start = performance.now()
  const arrayBuffer = await formData.file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const stream = Readable.from(buffer)

  message_queue.push({
    data: JSON.stringify({ type: `File read`, ms: +(performance.now() - start).toFixed(3) }),
    event: 'info',
    id: 'file-read',
  })
  start = performance.now()
  const result = await analyzeCSV(stream, formData.timezone, formData.hour_offset)
  message_queue.push({
    data: JSON.stringify({ type: `File analysis`, ms: +(performance.now() - start).toFixed(3) }),
    event: 'info',
    id: 'file-analysis',
  })

  const sseEnabled = formData.sse
  if (!sseEnabled) {
    const train = await trainTask(true, result.fsrs_items)
    return c.json({ train }, 200)
  }
  return streamSSE(c, async (stream) => {
    async function progress(enableShortTerm: boolean, err: Error | null, progressValue: ProgressValue) {
      if (err) {
        await stream.writeSSE({
          data: JSON.stringify(err.message),
          event: 'error',
          id: `error`,
        })
        await stream.close()
        return
      }
      await stream.writeSSE({
        data: JSON.stringify(progressValue),
        event: 'progress',
        id: `${enableShortTerm ? 'short' : 'long'}-term-${progressValue.percent}`,
      })
    }

    for (const message of message_queue) {
      await stream.writeSSE(message)
    }
    start = performance.now()
    const train = await trainTask(formData.enable_short_term, result.fsrs_items, progress)

    await stream.writeSSE({
      data: JSON.stringify({ type: `Train`, ms: +(performance.now() - start).toFixed(3) }),
      event: 'info',
      id: 'train-time',
    })

    const w = train.map((t) => +t.toFixed(8))
    await stream.writeSSE({
      data: JSON.stringify(generatorParameters({ w, enable_short_term: formData.enable_short_term })),
      event: 'done',
      id: `done`,
    })
  })
}
