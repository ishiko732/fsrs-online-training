// Training worker — runs WASM optimizer in a dedicated worker thread.
// Uses raw postMessage because Turbopack module workers don't support Comlink.
// A "ready" handshake is required: Turbopack swallows messages sent before init completes.

// Threadless WASI Preview 1 build: no cross-origin isolation needed, and the
// synchronous compute stays off the main thread inside this dedicated worker.
import {
  computeParameters,
  convertCsvToFsrsItems,
} from '@open-spaced-repetition/binding-wasm32-wasip1'

// ts-fsrs 5.x schedules with FSRS-6 weights; binding defaults to FSRS-7.
const MODEL_VERSION = 'FSRS-6'

export type TrainMessage = {
  type: 'train'
  csvData: ArrayBuffer
  timezone: string
  nextDayStartsAt: number
}

export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'convert-complete'; fsrsItems: number }
  | {
      type: 'progress'
      enableShortTerm: boolean
      current: number
      total: number
    }
  | {
      type: 'training-complete'
      enableShortTerm: boolean
      parameters: number[]
    }
  | { type: 'done' }
  | { type: 'error'; message: string }

self.onmessage = async (e: MessageEvent<TrainMessage>) => {
  if (e.data?.type !== 'train') return

  try {
    const { csvData, timezone, nextDayStartsAt } = e.data
    const items = convertCsvToFsrsItems(
      new Uint8Array(csvData),
      nextDayStartsAt,
      timezone,
      MODEL_VERSION
    )
    self.postMessage({
      type: 'convert-complete',
      fsrsItems: items.length,
    } satisfies WorkerMessage)

    for (const enableShortTerm of [true, false]) {
      const parameters = await computeParameters(items, {
        enableShortTerm,
        modelVersion: MODEL_VERSION,
        progress: (current: number, total: number) => {
          self.postMessage({
            type: 'progress',
            enableShortTerm,
            current,
            total,
          } satisfies WorkerMessage)
        },
      })
      self.postMessage({
        type: 'training-complete',
        enableShortTerm,
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
