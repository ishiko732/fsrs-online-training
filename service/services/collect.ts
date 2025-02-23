import { parse } from 'csv-parse/sync'

import type { FSRSItem, FSRSReview, ParseData } from './types'

const _MS_PER_HOUR = 1000 * 60 * 60
const _MS_PER_DAY = _MS_PER_HOUR * 24

const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max)

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

const convertToFSRSItem = (datum: ParseData[]): FSRSItem[] => {
  const history = datum.map((data) => [convertTime(data.review_time, 8, 4), parseInt(data.review_rating)]).sort((a, b) => a[0] - b[0])

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

export const analyzeCSV = async (text: Buffer | string) => {
  try {
    const records = <ParseData[]>parse(text, {
      delimiter: ',',
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
    const columns = Object.keys(records[0] || {})

    const cardIdHistory = Object.groupBy(records, (record) => record.card_id) as Record<string, ParseData[]>
    const fsrs_items = Object.values(cardIdHistory).flatMap(convertToFSRSItem)
    return {
      totalRows: records.length,
      columns: columns,
      sampleData: records.slice(0, 5),
      summary: {
        rowCount: records.length,
        columnCount: columns.length,
        grouped: Object.keys(cardIdHistory).length,
        fsrsItems: fsrs_items.length,
      },
      fsrs_items,
    }
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
