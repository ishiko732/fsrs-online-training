// Training worker — runs WASM optimizer in a dedicated worker thread.
// Exposed via Comlink for direct async function calls from main thread.

console.log('[worker] Training worker loaded')

import * as Comlink from 'comlink'
import { computeParameters, convertCsvToFsrsItems } from '@open-spaced-repetition/binding'

console.log('[worker] Imports resolved')

function getTimezoneOffset(ms: number, timezone: string): number {
  const date = new Date(ms)
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = date.toLocaleString('en-US', { timeZone: timezone })
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
}

export interface TrainingCallbacks {
  onProgress: (current: number, total: number) => void
}

const api = {
  async train(
    csvData: Uint8Array,
    timezone: string,
    nextDayStartsAt: number,
    enableShortTerm: boolean,
    callbacks: TrainingCallbacks,
  ): Promise<{ parameters: number[]; fsrsItems: number }> {
    console.log('[worker] train() called, enableShortTerm:', enableShortTerm)
    const items = convertCsvToFsrsItems(csvData, nextDayStartsAt, timezone, getTimezoneOffset)
    console.log('[worker] convertCsvToFsrsItems done, items:', items.length)
    const fsrsItems = items.length

    const parameters = await computeParameters(items, {
      enableShortTerm,
      progress: (current: number, total: number) => {
        callbacks.onProgress(current, total)
      },
      timeout: 1000,
    })

    return { parameters: Array.from(parameters), fsrsItems }
  },
}

export type TrainingApi = typeof api

console.log('[worker] self.onmessage before expose:', typeof self.onmessage)
Comlink.expose(api)
console.log('[worker] self.onmessage after expose:', typeof self.onmessage)

self.addEventListener('message', (e) => {
  console.log('[worker] raw message received:', e.data)
})
