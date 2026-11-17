// Training worker — runs WASM optimizer in a dedicated worker thread.
// Uses raw postMessage because Turbopack module workers don't support Comlink.
// A "ready" handshake is required: Turbopack swallows messages sent before init completes.

// Threadless WASI Preview 1 build: no cross-origin isolation needed, and the
// synchronous compute stays off the main thread inside this dedicated worker.
import {
  type ModelVersion as BindingModelVersion,
  computeParameters,
  convertCsvToFsrsItemsWithCardIds,
} from '@open-spaced-repetition/binding-wasm32-wasip1'

export type ModelVersion = `${BindingModelVersion}`

// Each training compares two runs: FSRS-6 with/without short-term, FSRS-7
// (always short-term) with/without scheduling penalties.
export type TrainRun =
  | { modelVersion: 'FSRS-6'; enableShortTerm: boolean }
  | { modelVersion: 'FSRS-7'; enableSchedPenalties: boolean }

export type TrainMessage = {
  type: 'train'
  csvData: ArrayBuffer
  timezone: string
  nextDayStartsAt: number
  modelVersion: ModelVersion
}

export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'convert-complete'; fsrsItems: number }
  | ({
      type: 'progress'
      current: number
      total: number
    } & TrainRun)
  | ({
      type: 'training-complete'
      parameters: number[]
    } & TrainRun)
  | { type: 'done' }
  | { type: 'error'; message: string }

const runsOf = (modelVersion: ModelVersion): TrainRun[] =>
  modelVersion === 'FSRS-7'
    ? [
        { modelVersion, enableSchedPenalties: true },
        { modelVersion, enableSchedPenalties: false },
      ]
    : [
        { modelVersion, enableShortTerm: true },
        { modelVersion, enableShortTerm: false },
      ]

self.onmessage = async (e: MessageEvent<TrainMessage>) => {
  if (e.data?.type !== 'train') return

  try {
    const { csvData, timezone, nextDayStartsAt, modelVersion } = e.data
    const { items, cardIds } = convertCsvToFsrsItemsWithCardIds(
      new Uint8Array(csvData),
      nextDayStartsAt,
      timezone,
      modelVersion
    )
    self.postMessage({
      type: 'convert-complete',
      fsrsItems: items.length,
    } satisfies WorkerMessage)

    for (const run of runsOf(modelVersion)) {
      const parameters = await computeParameters(items, {
        modelVersion: run.modelVersion,
        ...(run.modelVersion === 'FSRS-7'
          ? {
              enableShortTerm: true,
              enableSchedPenalties: run.enableSchedPenalties,
            }
          : { enableShortTerm: run.enableShortTerm }),
        cardIds,
        progress: (current: number, total: number) => {
          self.postMessage({
            type: 'progress',
            ...run,
            current,
            total,
          } satisfies WorkerMessage)
        },
      })
      self.postMessage({
        type: 'training-complete',
        ...run,
        parameters: Array.from(parameters),
      } satisfies WorkerMessage)
    }

    self.postMessage({ type: 'done' } satisfies WorkerMessage)
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerMessage)
  }
}

self.postMessage({ type: 'ready' } as WorkerMessage)
