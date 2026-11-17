import {
  computeParameters,
  convertCsvToFsrsItemsWithCardIds,
  type ModelVersion,
} from '@open-spaced-repetition/binding'

export interface TrainOptions {
  csvData: Uint8Array
  timezone: string
  nextDayStartsAt: number
  modelVersion: `${ModelVersion}`
  enableShortTerm: boolean
  enableSchedPenalties?: boolean
  onProgress?: (current: number, total: number) => void
}

export interface TrainResult {
  parameters: number[]
  fsrsItems: number
}

export async function train(options: TrainOptions): Promise<TrainResult> {
  const { items, cardIds } = convertCsvToFsrsItemsWithCardIds(
    options.csvData,
    options.nextDayStartsAt,
    options.timezone,
    options.modelVersion
  )
  const fsrsItems = items.length

  const parameters = await computeParameters(items, {
    modelVersion: options.modelVersion,
    // FSRS-7 always trains with short-term enabled.
    enableShortTerm:
      options.modelVersion === 'FSRS-7' || options.enableShortTerm,
    enableSchedPenalties: options.enableSchedPenalties,
    cardIds,
    progress: options.onProgress,
    timeout: 1000,
  })

  return { parameters: Array.from(parameters), fsrsItems }
}
