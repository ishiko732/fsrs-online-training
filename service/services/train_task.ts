'use server'
import type {
  TEvaluateFormData,
  TTrainFormData,
} from '@api/controllers/train.schema'
import { loggerInfo } from '@api/utils/logger'
import {
  computeParameters as bindingComputeParameters,
  convertCsvToFsrsItems,
  FSRSBinding,
  type FSRSBindingItem,
  type ModelEvaluation,
} from '@open-spaced-repetition/binding'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { generatorParameters } from 'ts-fsrs'

import type { ProgressValue } from './types'

type ProgressFunction = (
  enableShortTerm: boolean,
  current: number,
  total: number
) => void

const offsetCache = new Map<string, number>()
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getTimezoneOffset(ms: number, timezone: string): number {
  const dayKey = `${timezone}:${Math.floor(ms / 86400000)}`
  const cached = offsetCache.get(dayKey)
  if (cached !== undefined) return cached

  let fmt = formatterCache.get(timezone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    formatterCache.set(timezone, fmt)
  }

  const date = new Date(ms)
  const parts = fmt.formatToParts(date)
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value || '0', 10)

  const utcTime = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  )
  const tzTime = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )

  const offset = Math.floor((tzTime - utcTime) / 60000)
  offsetCache.set(dayKey, offset)
  return offset
}

function basicProgress(
  enableShortTerm: boolean,
  current: number,
  total: number
) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  loggerInfo('progress', {
    enableShortTerm,
    progressValue: { current, total, percent },
  })
}

async function computeParametersWrapper(
  enableShortTerm: boolean,
  fsrsItems: FSRSBindingItem[],
  progress: ProgressFunction
) {
  const optimizedParameters = await bindingComputeParameters(fsrsItems, {
    enableShortTerm,
    progress: (current: number, total: number) => {
      progress(enableShortTerm, current, total)
    },
    timeout: 1000,
  })
  return optimizedParameters
}

export async function trainTask(
  enableShortTerm: boolean,
  fsrsItems: FSRSBindingItem[],
  progress: ProgressFunction = basicProgress
) {
  return computeParametersWrapper(enableShortTerm, fsrsItems, progress)
}

export async function evaluate(
  optimizedParameters: number[],
  fsrsItems: FSRSBindingItem[]
) {
  const model = new FSRSBinding(optimizedParameters)
  return new Promise<ModelEvaluation>((resolve, reject) => {
    try {
      resolve(model.evaluate(fsrsItems))
    } catch (error) {
      reject(error)
    }
  })
}

async function csvToFsrsItems(
  file: File,
  timezone: string,
  hourOffset: number
) {
  const arrayBuffer = await file.arrayBuffer()
  const csvData = new Uint8Array(arrayBuffer)
  return convertCsvToFsrsItems(csvData, hourOffset, timezone, getTimezoneOffset)
}

export async function trainByFormData<Ctx extends Context>(
  c: Ctx,
  formData: TTrainFormData
) {
  const message_queue: Array<{ data: string; event: string; id: string }> = []
  let start = performance.now()

  const fsrs_items = await csvToFsrsItems(
    formData.file,
    formData.timezone,
    formData.hour_offset
  )
  message_queue.push({
    data: JSON.stringify({
      type: `File analysis`,
      ms: +(performance.now() - start).toFixed(3),
      fsrsItems: fsrs_items.length,
    }),
    event: 'info',
    id: 'file-analysis',
  })

  const sseEnabled = formData.sse
  let metrics: ModelEvaluation | { logLoss: null; rmseBins: null } = {
    logLoss: null,
    rmseBins: null,
  }
  if (!sseEnabled) {
    const train = await trainTask(formData.enable_short_term, fsrs_items)
    const w = train.map((t) => +t.toFixed(8))
    if (fsrs_items.length) {
      metrics = await evaluate(w, fsrs_items)
    }
    const params = generatorParameters({
      w,
      enable_short_term: formData.enable_short_term,
    })

    return c.json({ params, metrics }, 200)
  }
  return streamSSE(c, async (stream) => {
    function progress(
      enableShortTerm: boolean,
      current: number,
      total: number
    ) {
      const percent = total > 0 ? Math.round((current / total) * 100) : 0
      const progressValue: ProgressValue = { current, total, percent }
      stream.writeSSE({
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
    const train = await trainTask(
      formData.enable_short_term,
      fsrs_items,
      progress
    )

    await stream.writeSSE({
      data: JSON.stringify({
        type: `Train`,
        ms: +(performance.now() - start).toFixed(3),
      }),
      event: 'info',
      id: 'train-time',
    })

    const w = train.map((t) => +t.toFixed(8))

    start = performance.now()
    if (fsrs_items.length) {
      metrics = await evaluate(w, fsrs_items)
      await stream.writeSSE({
        data: JSON.stringify({
          type: `Evaluate`,
          ms: +(performance.now() - start).toFixed(3),
          metrics,
        }),
        event: 'info',
        id: 'evaluate-time',
      })
    }

    const params = generatorParameters({
      w,
      enable_short_term: formData.enable_short_term,
    })
    loggerInfo('done', { params, metrics })
    await stream.writeSSE({
      data: JSON.stringify({ params, metrics }),
      event: 'done',
      id: `done`,
    })
  })
}

export async function evaluateByFormData<Ctx extends Context>(
  c: Ctx,
  formData: TEvaluateFormData
) {
  const message_queue: Array<{ data: string; event: string; id: string }> = []
  let start = performance.now()

  const fsrs_items = await csvToFsrsItems(
    formData.file,
    formData.timezone,
    formData.hour_offset
  )
  message_queue.push({
    data: JSON.stringify({
      type: `File analysis`,
      ms: +(performance.now() - start).toFixed(3),
      fsrsItems: fsrs_items.length,
    }),
    event: 'info',
    id: 'file-analysis',
  })

  const { w } = generatorParameters({ w: formData.w })
  if (fsrs_items.length === 0) {
    return c.json({ error: `No valid FSRS items found` }, 400)
  }
  const sseEnabled = formData.sse
  if (!sseEnabled) {
    const metrics = await evaluate(Array.from(w), fsrs_items)
    return c.json(metrics, 200)
  }
  return streamSSE(c, async (stream) => {
    for (const message of message_queue) {
      await stream.writeSSE(message)
    }
    start = performance.now()
    const metrics = await evaluate(Array.from(w), fsrs_items)
    await stream.writeSSE({
      data: JSON.stringify({
        type: `Evaluate`,
        ms: +(performance.now() - start).toFixed(3),
        metrics,
      }),
      event: 'info',
      id: 'evaluate-time',
    })
    loggerInfo('done', { metrics })
    await stream.writeSSE({
      data: JSON.stringify(metrics),
      event: 'done',
      id: `done`,
    })
  })
}
