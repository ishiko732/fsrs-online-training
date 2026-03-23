// Training worker — runs WASM optimizer in a dedicated worker thread.
// Uses raw postMessage because Turbopack module workers don't support Comlink.
// A "ready" handshake is required: Turbopack swallows messages sent before init completes.

import { computeParameters, convertCsvToFsrsItems } from '@open-spaced-repetition/binding'

const offsetCache = new Map<string, number>()
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getTimezoneOffset(ms: number, timezone: string): number {
  // Cache by UTC day — offsets only change at DST boundaries (a few times/year)
  const dayKey = `${timezone}:${Math.floor(ms / 86400000)}`
  const cached = offsetCache.get(dayKey)
  if (cached !== undefined) return cached

  let fmt = formatterCache.get(timezone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    formatterCache.set(timezone, fmt)
  }

  const date = new Date(ms)
  const parts = fmt.formatToParts(date)
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10)

  const utcTime = Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(),
  )
  const tzTime = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour'), get('minute'), get('second'),
  )

  const offset = Math.floor((tzTime - utcTime) / 60000)
  offsetCache.set(dayKey, offset)
  return offset
}

export type TrainMessage = {
  type: 'train'
  csvData: ArrayBuffer
  timezone: string
  nextDayStartsAt: number
}

export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'convert-complete'; fsrsItems: number }
  | { type: 'progress'; enableShortTerm: boolean; current: number; total: number }
  | { type: 'training-complete'; enableShortTerm: boolean; parameters: number[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

self.onmessage = async (e: MessageEvent<TrainMessage>) => {
  if (e.data?.type !== 'train') return

  try {
    const { csvData, timezone, nextDayStartsAt } = e.data
    const items = convertCsvToFsrsItems(new Uint8Array(csvData), nextDayStartsAt, timezone, getTimezoneOffset)
    self.postMessage({ type: 'convert-complete', fsrsItems: items.length } satisfies WorkerMessage)

    for (const enableShortTerm of [true, false]) {
      const parameters = await computeParameters(items, {
        enableShortTerm,
        progress: (current: number, total: number) => {
          self.postMessage({ type: 'progress', enableShortTerm, current, total } satisfies WorkerMessage)
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
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies WorkerMessage)
  }
}

self.postMessage({ type: 'ready' } as WorkerMessage)
