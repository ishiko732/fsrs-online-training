'use server'
// tip: It cannot run on Vercel because it got optimized away.
import { TEvaluateFormData, TTrainFormData } from '@api/controllers/train.schema'
import { loggerError, loggerInfo } from '@api/utils/logger'
import { FSRS, FSRSItem, FSRSReview, type ModelEvaluation } from 'fsrs-rs-nodejs'
import { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { Readable } from 'stream'
import { generatorParameters } from 'ts-fsrs'

import { analyzeCSV } from './collect'
import { FSRSItem as BasicFSRSItem, ProgressValue } from './types'

type ProgressFunction = (enableShortTerm: boolean, err: Error | null, progressValue: ProgressValue) => void

function basicProgress(enableShortTerm: boolean, err: Error | null, progressValue: ProgressValue) {
  if (err) {
    loggerError(`[enableShortTerm=${enableShortTerm}] Progress callback error`, err)
    return
  }
  loggerInfo('progress', {
    enableShortTerm,
    progressValue,
  })
}

async function computeParametersWrapper(enableShortTerm: boolean, fsrsItems: FSRSItem[], progress: ProgressFunction) {
  // create FSRS instance and optimize
  const fsrs = new FSRS(null)

  const optimizedParameters = await fsrs.computeParameters(fsrsItems, enableShortTerm, progress.bind(null, enableShortTerm), 1000 /** 1s */)
  return optimizedParameters
}

export async function trainTask(enableShortTerm: boolean, fsrsItems: FSRSItem[], progress: ProgressFunction = basicProgress) {
  return computeParametersWrapper(enableShortTerm, fsrsItems, progress)
}

export async function evaluate(optimizedParameters: number[], fsrsItems: FSRSItem[]) {
  const model = new FSRS(optimizedParameters)
  return new Promise<ModelEvaluation>((resolve, reject) => {
    try {
      resolve(model.evaluate(fsrsItems))
    } catch (error) {
      reject(error)
    }
  })
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
    data: JSON.stringify({
      type: `File analysis`,
      ms: +(performance.now() - start).toFixed(3),
      data: result.summary,
      fields: result.fields,
    }),
    event: 'info',
    id: 'file-analysis',
  })

  const fsrs_items = result.fsrs_items.map(
    (item: BasicFSRSItem) => new FSRSItem(item.map((review) => new FSRSReview(review.rating, review.deltaT))),
  )
  const sseEnabled = formData.sse
  if (!sseEnabled) {
    const train = await trainTask(formData.enable_short_term, fsrs_items)
    const w = train.map((t) => +t.toFixed(8))
    const metrics = await evaluate(w, fsrs_items)
    const params = generatorParameters({ w, enable_short_term: formData.enable_short_term })

    return c.json({ params, metrics }, 200)
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
      loggerInfo('progress', {
        enableShortTerm,
        progressValue,
      })
    }

    for (const message of message_queue) {
      await stream.writeSSE(message)
    }
    start = performance.now()
    const train = await trainTask(formData.enable_short_term, fsrs_items, progress)

    await stream.writeSSE({
      data: JSON.stringify({ type: `Train`, ms: +(performance.now() - start).toFixed(3) }),
      event: 'info',
      id: 'train-time',
    })

    const w = train.map((t) => +t.toFixed(8))

    start = performance.now()
    const metrics = await evaluate(w, fsrs_items)
    await stream.writeSSE({
      data: JSON.stringify({ type: `Evaluate`, ms: +(performance.now() - start).toFixed(3), metrics }),
      event: 'info',
      id: 'evaluate-time',
    })

    const params = generatorParameters({ w, enable_short_term: formData.enable_short_term })
    await stream.writeSSE({
      data: JSON.stringify({ params, metrics }),
      event: 'done',
      id: `done`,
    })
  })
}

export async function evaluateByFormData<Ctx extends Context>(c: Ctx, formData: TEvaluateFormData) {
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
    data: JSON.stringify({
      type: `File analysis`,
      ms: +(performance.now() - start).toFixed(3),
      data: result.summary,
      fields: result.fields,
    }),
    event: 'info',
    id: 'file-analysis',
  })
  const { w } = generatorParameters({ w: formData.w })
  const fsrs_items = result.fsrs_items.map(
    (item: BasicFSRSItem) => new FSRSItem(item.map((review) => new FSRSReview(review.rating, review.deltaT))),
  )
  const sseEnabled = formData.sse
  if (!sseEnabled) {
    const metrics = await evaluate(w, fsrs_items)
    return c.json(metrics, 200)
  }
  return streamSSE(c, async (stream) => {
    for (const message of message_queue) {
      await stream.writeSSE(message)
    }
    start = performance.now()
    start = performance.now()
    const metrics = await evaluate(w, fsrs_items)
    await stream.writeSSE({
      data: JSON.stringify({ type: `Evaluate`, ms: +(performance.now() - start).toFixed(3), metrics }),
      event: 'info',
      id: 'evaluate-time',
    })

    await stream.writeSSE({
      data: JSON.stringify(metrics),
      event: 'done',
      id: `done`,
    })
  })
}
