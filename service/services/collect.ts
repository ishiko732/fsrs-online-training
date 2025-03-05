import { get_timezone_offset } from '@components/lib/tz'
import Papa from 'papaparse'
import { clamp, State } from 'ts-fsrs'

import type { AnalyzeCSVResult, FSRSItem, FSRSReview, ParseData } from './types'

const _MS_PER_HOUR = 1000 * 60 * 60
const _MS_PER_DAY = _MS_PER_HOUR * 24

const convertTime = (time: string, timezone: number, next_day_start: number): number => {
  const date = parseInt(time)
  const tz = clamp(timezone, -23, 23)
  const nds = clamp(next_day_start, 0, 23)

  return date + tz * _MS_PER_HOUR - nds * _MS_PER_HOUR
}

function dateDiffInDays(_a: number, _b: number) {
  const a = new Date(_a)
  const b = new Date(_b)
  const utc1 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())
  const utc2 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
  return Math.floor((utc2 - utc1) / _MS_PER_DAY)
}

const removeRevlogBeforeLastLearning = (entries: ParseData[]): ParseData[] => {
  const isLearningState = (entry: ParseData) => [State.New, State.Learning].includes(Number(entry.review_state))

  let lastLearningBlockStart = -1
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isLearningState(entries[i])) {
      lastLearningBlockStart = i
    } else if (lastLearningBlockStart !== -1) {
      break
    }
  }

  return lastLearningBlockStart !== -1 ? entries.slice(lastLearningBlockStart) : []
}

export const convertToFSRSItem = (offset_hour: number, next_day_start: number, datum: ParseData[]): FSRSItem[] => {
  const history = datum
    .map((data) => [convertTime(data.review_time, offset_hour /** TODO */, next_day_start), parseInt(data.review_rating)])
    .sort((a, b) => a[0] - b[0])

  const reviews: FSRSReview[] = []
  let last_review_time = history[0][0]
  const items: FSRSItem[] = []

  for (const [time, rating] of history) {
    // const deltaT = Math.floor((time - last_review_time) / _MS_PER_DAY)
    const deltaT = dateDiffInDays(last_review_time, time)
    reviews.push({ rating, deltaT })
    if (deltaT > 0) {
      // the last review is not the same day
      items.push([...reviews])
    }
    last_review_time = time
  }
  return items.filter((item) => item.some((review) => review.deltaT > 0))
}

export const analyze = async (file: Papa.LocalFile, timezone: string, next_day_start: number, signal?: (row: number) => void) => {
  // init
  const map = new Map<string | number, ParseData[]>()
  const sampleData: ParseData[] = []
  let rows = 0

  const start = performance.now()
  const offset_hour = Math.floor(get_timezone_offset(timezone) / 60)
  console.log(`[timezone:${timezone}]offset_hour: ${offset_hour} next_day_start: ${next_day_start}`)
  console.log(`signal is ${typeof signal === 'function' ? 'enabled' : 'disabled'}`)
  return new Promise<AnalyzeCSVResult>((resolve, reject) => {
    Papa.parse<ParseData>(file, {
      header: true,
      worker: true,
      skipEmptyLines: true,
      delimiter: ',',
      dynamicTyping: true,
      fastMode: true,
      step: (result) => {
        const card_id = result.data.card_id
        if (typeof card_id === 'undefined' || card_id === null) {
          return
        }
        if (!map.has(card_id)) {
          map.set(card_id, [])
        }

        // group by card_id
        map.get(card_id)?.push(result.data)
        rows++
        if (rows <= 5) {
          sampleData.push(result.data)
        }

        if (typeof signal === 'function' && rows % 500 /** 500row */ === 0) {
          console.debug(`[analyze] row: ${rows}`)
          requestAnimationFrame(() => {
            signal(rows)
          })
        }
      },
      complete: () => {
        const fields = sampleData.length > 0 ? (Object.keys(sampleData?.[0]) ?? []) : []
        const fsrs_items: FSRSItem[] = Array.from(map.values())
          .map((item) => removeRevlogBeforeLastLearning(item))
          .filter((item) => item.length > 0)
          .flatMap((item) => convertToFSRSItem(offset_hour, next_day_start, item))
        const cost_time = performance.now() - start
        resolve({
          fields: fields,
          sampleData: sampleData,
          summary: {
            rowCount: rows,
            columnCount: fields.length,
            grouped: map.size,
            fsrsItems: fsrs_items.length,
            cost_time: cost_time,
          },
          fsrs_items,
        })
      },
      error: (err) => {
        reject(err)
      },
    })
  })
}

export const analyzeCSV = async (file: File, timezone: string, next_day_start: number) => {
  try {
    return await analyze(file, timezone, next_day_start)
  } catch (e) {
    const error = e as Error
    throw new Error(`Failed to parse CSV: ${error.message}`)
  }
}

export function getProgress(wasmMemoryBuffer: ArrayBuffer, pointer: number) {
  // The progress vec is length 2. Grep 2291AF52-BEE4-4D54-BAD0-6492DFE368D8
  const progress = new Uint32Array(wasmMemoryBuffer, pointer, 2)
  return {
    itemsProcessed: progress[0],
    itemsTotal: progress[1],
  }
}
