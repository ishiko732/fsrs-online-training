export interface ParseData {
  review_time: string
  card_id: string
  review_rating: string
  review_duration: string
  review_state: string
}

export interface FSRSReview {
  rating: number
  deltaT: number
}

export type FSRSItem = FSRSReview[]

export interface ProgressValue {
  current: number
  total: number
  percent: number
}

export interface ProgressStart {
  tag: 'start'
  wasmMemoryBuffer: ArrayBuffer
  pointer: number
}

export interface ProgressFinish {
  tag: 'finish'
  parameters: Float32Array
}

export interface ProgressItem {
  itemsProcessed: number
  itemsTotal: number
}

interface Progress extends ProgressItem {
  tag: 'progress'
}

export type ProgressState = Progress | ProgressStart | ProgressFinish
