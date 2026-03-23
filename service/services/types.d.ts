export interface ProgressValue {
  current: number
  total: number
  percent: number
}

export interface ProgressStart {
  tag: 'start'
}

export interface ProgressFinish {
  tag: 'finish'
  parameters: Float32Array
  enableShortTerm: boolean
}

export interface ProgressItem {
  itemsProcessed: number
  itemsTotal: number
}

interface Progress extends ProgressItem {
  tag: 'progress'
}

interface InitdWorker {
  tag: 'initd' | 'initd-failed'
}

interface WorkerErrorInfo {
  tag: 'error'
  error: string
}

export type ProgressState =
  | Progress
  | ProgressStart
  | ProgressFinish
  | InitdWorker
  | WorkerErrorInfo
