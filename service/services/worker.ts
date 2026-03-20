import { convertCsvToFsrsItems,computeParameters } from '@open-spaced-repetition/binding'


function getTimezoneOffset(ms: number, timezone: string): number {
  const date = new Date(ms)
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = date.toLocaleString('en-US', { timeZone: timezone })
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
}


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

  const items = convertCsvToFsrsItems(options.csvData, options.nextDayStartsAt, options.timezone, getTimezoneOffset)
  const fsrsItems = items.length

  const parameters = await computeParameters(items, {
    enableShortTerm: options.enableShortTerm,
    progress: options.onProgress,
    timeout: 1000,
  })

  return { parameters: Array.from(parameters), fsrsItems }
}
