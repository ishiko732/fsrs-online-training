import type { FSRSItem, ProgressState } from '@api/services/types'
import { loggerError, loggerInfo } from '@api/utils/logger'
import * as Sentry from '@sentry/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export type TrainFSRSProps = {
  enableShortTerm: boolean
  setError: (error: string) => void
  initdCallback?: () => void
  doneCallback?: (params: number[]) => void
}

export default function useTrainFSRS({ enableShortTerm, setError, initdCallback, doneCallback }: TrainFSRSProps) {
  const [progress, setProgress] = useState(0)
  const [isTraining, setIsTraining] = useState(false)
  const workerRef = useRef<Worker>(undefined)
  const [params, setParams] = useState<number[]>([])
  const startTime = useRef<DOMHighResTimeStamp>(0)
  const [train_time, setTrain_time] = useState<DOMHighResTimeStamp>(0)
  const initdRef = useRef(false)

  const handleProgress = (itemsProcessed: number, itemsTotal: number) => {
    const value = itemsTotal > 0 ? (itemsProcessed / itemsTotal) * 100 : 0
    setProgress(value || 0)
  }

  useEffect(() => {
    const handlerMessage = (event: MessageEvent<number[] | ProgressState>) => {
      loggerInfo('worker-event', event.data)
      if ('tag' in event.data) {
        // process ProgressState
        const progressState = event.data as ProgressState
        if (progressState.tag === 'start') {
          // Training started
        } else if (progressState.tag === 'progress') {
          handleProgress(progressState.itemsProcessed, progressState.itemsTotal)
        } else if (progressState.tag === 'finish') {
          const params = [...progressState.parameters]
          setParams(params)
          setIsTraining(false)
          setTrain_time(performance.now() - startTime.current)
          loggerInfo('worker-done', {
            tag:'finish',
            params
          })
          doneCallback?.(params)
        } else if (progressState.tag === 'initd') {
          loggerInfo('worker-init', {
            tag:'initd',
          })
          initdCallback?.()
          initdRef.current = true
        } else if (progressState.tag === 'initd-failed') {
          loggerError('worker-failed', {
            tag:'initd-failed',
          })
          toast.error(`Model initialization failed`)
          initdRef.current = false
        } else if (progressState.tag === 'error') {
          setError(progressState.error)
          const error = new Error(progressState.error)
          error.name = 'WorkerError'
          Sentry.captureException(error)
          toast.error(`${progressState.error}`)
          loggerError('worker-error', progressState)
        }
      }
    }
    workerRef.current = new Worker(new URL('@api/services/worker.ts', import.meta.url))

    workerRef.current.onmessage = (event: MessageEvent<number[] | ProgressState>) => {
      handlerMessage(event)
    }
    workerRef.current.onerror = (err) => {
      Sentry.captureException(err.error || err)
      setError(err.message)
    }
    workerRef.current.postMessage({ init: true })

    return () => {
      workerRef.current?.terminate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const train = useCallback(
    (items: FSRSItem[]) => {
      // if (!initd) {
      //   const model = enableShortTerm ? 'Short-Term' : 'Long-Term'
      //   setError(`Model(${model}) not initialized`)
      //   toast.error(`Model(${model}) not initialized`)
      //   return
      // }
      setIsTraining(true)
      setProgress(0)
      setParams([])
      setTrain_time(0)
      startTime.current = performance.now()
      workerRef.current?.postMessage({ items, enableShortTerm })
    },
    [enableShortTerm],
  )

  const isDone = () => {
    return params.length > 0 && !isTraining
  }

  const clear = () => {
    setParams([])
    setProgress(0)
    setIsTraining(false)
    setTrain_time(0)
  }

  return {
    params,
    isTraining,
    progress,
    train,
    isDone,
    clear,
    train_time,
  } as const
}
