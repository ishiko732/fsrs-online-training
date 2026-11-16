'use server'
import {
  modelVersionOfWeights,
  type TEvaluateFormData,
  type TTrainFormData,
} from '@api/controllers/train.schema'
import { loggerInfo } from '@api/utils/logger'
import {
  computeParameters as bindingComputeParameters,
  convertCsvToFsrsItemsWithCardIds,
  FSRSBinding,
  type FSRSItemsWithCardIds,
  type ModelEvaluation,
  type ModelVersion,
} from '@open-spaced-repetition/binding'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { generatorParameters } from 'ts-fsrs'

import type { ProgressValue } from './types'

type ProgressFunction = (current: number, total: number) => void

function basicProgress(current: number, total: number) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  loggerInfo('progress', {
    progressValue: { current, total, percent },
  })
}

export async function trainTask(
  formData: Pick<
    TTrainFormData,
    'model_version' | 'enable_short_term' | 'enable_sched_penalties'
  >,
  { items, cardIds }: FSRSItemsWithCardIds,
  progress: ProgressFunction = basicProgress
) {
  return bindingComputeParameters(items, {
    modelVersion: formData.model_version,
    enableShortTerm: formData.enable_short_term,
    enableSchedPenalties: formData.enable_sched_penalties,
    cardIds,
    progress,
    timeout: 1000,
  })
}

export async function evaluate(
  optimizedParameters: number[],
  { items, cardIds }: FSRSItemsWithCardIds
) {
  // FSRSBinding picks the model from the weights length (21 -> 6, 34 -> 7).
  const model = new FSRSBinding(optimizedParameters)
  return new Promise<ModelEvaluation>((resolve, reject) => {
    try {
      resolve(model.evaluate(items, cardIds))
    } catch (error) {
      reject(error)
    }
  })
}

async function csvToFsrsItems(
  file: File,
  timezone: string,
  hourOffset: number,
  modelVersion: `${ModelVersion}`
) {
  const arrayBuffer = await file.arrayBuffer()
  const csvData = new Uint8Array(arrayBuffer)
  return convertCsvToFsrsItemsWithCardIds(
    csvData,
    hourOffset,
    timezone,
    modelVersion
  )
}

// ts-fsrs 5.x only represents FSRS-6, so FSRS-7 weights bypass it.
function outputParams(formData: TTrainFormData, w: number[]) {
  if (formData.model_version === 'FSRS-7') {
    return {
      model_version: formData.model_version,
      w,
      enable_sched_penalties: formData.enable_sched_penalties,
    }
  }
  return generatorParameters({
    w,
    enable_short_term: formData.enable_short_term,
  })
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
    formData.hour_offset,
    formData.model_version
  )
  message_queue.push({
    data: JSON.stringify({
      type: `File analysis`,
      ms: +(performance.now() - start).toFixed(3),
      fsrsItems: fsrs_items.items.length,
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
    const train = await trainTask(formData, fsrs_items)
    const w = train.map((t) => +t.toFixed(8))
    if (fsrs_items.items.length) {
      metrics = await evaluate(w, fsrs_items)
    }
    const params = outputParams(formData, w)

    return c.json({ params, metrics }, 200)
  }
  return streamSSE(c, async (stream) => {
    const progressId =
      formData.model_version === 'FSRS-7'
        ? formData.enable_sched_penalties
          ? 'penalties'
          : 'no-penalties'
        : `${formData.enable_short_term ? 'short' : 'long'}-term`
    function progress(current: number, total: number) {
      const percent = total > 0 ? Math.round((current / total) * 100) : 0
      const progressValue: ProgressValue = { current, total, percent }
      stream.writeSSE({
        data: JSON.stringify(progressValue),
        event: 'progress',
        id: `${progressId}-${progressValue.percent}`,
      })
      loggerInfo('progress', {
        modelVersion: formData.model_version,
        enableShortTerm: formData.enable_short_term,
        enableSchedPenalties: formData.enable_sched_penalties,
        progressValue,
      })
    }

    for (const message of message_queue) {
      await stream.writeSSE(message)
    }
    start = performance.now()
    const train = await trainTask(formData, fsrs_items, progress)

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
    if (fsrs_items.items.length) {
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

    const params = outputParams(formData, w)
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

  // WeightSchema already rejected unsupported lengths.
  const modelVersion = modelVersionOfWeights(formData.w) ?? 'FSRS-6'
  const fsrs_items = await csvToFsrsItems(
    formData.file,
    formData.timezone,
    formData.hour_offset,
    modelVersion
  )
  message_queue.push({
    data: JSON.stringify({
      type: `File analysis`,
      ms: +(performance.now() - start).toFixed(3),
      fsrsItems: fsrs_items.items.length,
    }),
    event: 'info',
    id: 'file-analysis',
  })

  // Legacy 17/19 FSRS-6 weights are migrated to 21; FSRS-7 passes unchanged.
  const w =
    modelVersion === 'FSRS-7'
      ? formData.w
      : generatorParameters({ w: formData.w }).w
  if (fsrs_items.items.length === 0) {
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
