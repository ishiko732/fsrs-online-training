// Training worker — runs WASM optimizer in a dedicated worker thread.
// Exposed via Comlink for direct async function calls from main thread.

import * as Comlink from 'comlink'
import { computeParameters, convertCsvToFsrsItems } from '@open-spaced-repetition/binding'

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
    const items = convertCsvToFsrsItems(csvData, nextDayStartsAt, timezone, getTimezoneOffset)
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

Comlink.expose(api)
