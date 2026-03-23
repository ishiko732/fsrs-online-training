import type { TrainingApi } from '@/workers/training.worker'
import { loggerError, loggerInfo } from '@api/utils/logger'
import * as Comlink from 'comlink'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

export type TrainFSRSProps = {
  enableShortTerm: boolean
  setError: (error: string) => void
  doneCallback?: (params: number[]) => void
}

export default function useTrainFSRS({ enableShortTerm, setError, doneCallback }: TrainFSRSProps) {
  const [progress, setProgress] = useState(0)
  const [isTraining, setIsTraining] = useState(false)
  const [params, setParams] = useState<number[]>([])
  const [fsrsItems, setFsrsItems] = useState(0)
  const startTime = useRef<DOMHighResTimeStamp>(0)
  const [train_time, setTrain_time] = useState<DOMHighResTimeStamp>(0)
  const apiRef = useRef<Comlink.Remote<TrainingApi> | null>(null)

  const startTrain = useCallback(
    async (csvData: ArrayBuffer, timezone: string, nextDayStartsAt: number) => {
      setIsTraining(true)
      setProgress(0)
      setParams([])
      setFsrsItems(0)
      setTrain_time(0)
      startTime.current = performance.now()

      try {
        if (!apiRef.current) {
          const workerUrl = new URL('../workers/training.worker.ts', import.meta.url)
          console.log('[useTrain] Creating worker from:', workerUrl.href)
          const worker = new Worker(workerUrl, { type: 'module' })
          worker.onerror = (e) => console.error('[useTrain] Worker error:', e)
          apiRef.current = Comlink.wrap<TrainingApi>(worker)
        }
        console.log('[useTrain] Calling worker.train...')

        const result = await apiRef.current.train(
          new Uint8Array(csvData),
          timezone,
          nextDayStartsAt,
          enableShortTerm,
          Comlink.proxy({
            onProgress: (current: number, total: number) => {
              const value = total > 0 ? (current / total) * 100 : 0
              setProgress(value || 0)
            },
          }),
        )

        setParams(result.parameters)
        setFsrsItems(result.fsrsItems)
        setIsTraining(false)
        setTrain_time(performance.now() - startTime.current)
        loggerInfo('train-done', { tag: 'finish', params: result.parameters, fsrsItems: result.fsrsItems })
        doneCallback?.(result.parameters)
      } catch (e) {
        const error = e as Error
        setIsTraining(false)
        setError(error.message)
        toast.error(`Training failed: ${error.message}`)
        loggerError('train-error', { error: error.message })
      }
    },
    [enableShortTerm, setError, doneCallback],
  )

  const isDone = () => {
    return params.length > 0 && !isTraining
  }

  const clear = () => {
    setParams([])
    setFsrsItems(0)
    setProgress(0)
    setIsTraining(false)
    setTrain_time(0)
  }

  return {
    params,
    fsrsItems,
    isTraining,
    progress,
    train: startTrain,
    isDone,
    clear,
    train_time,
  } as const
}
