import {
  computeParameters,
  convertCsvToFsrsItems,
} from '@open-spaced-repetition/binding'

const MODEL_VERSION = 'FSRS-6'

export interface TrainOptions {
  csvData: Uint8Array
  timezone: string
  nextDayStartsAt: number
  enableShortTerm: boolean
  onProgress?: (current: number, total: number) => void
}

export interface TrainResult {
  parameters: number[]
  fsrsItems: number
}

export async function train(options: TrainOptions): Promise<TrainResult> {
  const items = convertCsvToFsrsItems(
    options.csvData,
    options.nextDayStartsAt,
    options.timezone,
    MODEL_VERSION
  )
  const fsrsItems = items.length

  const parameters = await computeParameters(items, {
    enableShortTerm: options.enableShortTerm,
    modelVersion: MODEL_VERSION,
    progress: options.onProgress,
    timeout: 1000,
  })

  return { parameters: Array.from(parameters), fsrsItems }
}
