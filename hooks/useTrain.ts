import { getProgress } from '@api/services/collect'
import type { FSRSItem, ProgressState } from '@api/services/types'
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
  const timeIdRef = useRef<NodeJS.Timeout>(undefined)
  const [params, setParams] = useState<number[]>([])
  const startTime = useRef<DOMHighResTimeStamp>(0)
  const [train_time, setTrain_time] = useState<DOMHighResTimeStamp>(0)
  const initdRef = useRef(false)

  const handleProgress = (wasmMemoryBuffer: ArrayBuffer, pointer: number) => {
    const { itemsProcessed, itemsTotal } = getProgress(wasmMemoryBuffer, pointer)
    const value = (itemsProcessed / itemsTotal) * 100
    setProgress(value || 0)
  }

  useEffect(() => {
    const handlerMessage = (event: MessageEvent<number[] | ProgressState>) => {
      console.log(event.data)
      if ('tag' in event.data) {
        // process ProgressState
        const progressState = event.data as ProgressState
        if (progressState.tag === 'start') {
          const { wasmMemoryBuffer, pointer } = progressState
          if (wasmMemoryBuffer && pointer) {
            handleProgress(wasmMemoryBuffer, pointer)

            const timeId = setInterval(() => {
              handleProgress(wasmMemoryBuffer, pointer)
            }, 100)
            timeIdRef.current = timeId
          } else {
            toast.warning(`Your browser or device does not support displaying the progress bar.`, { duration: 10000 })
          }
        } else if (progressState.tag === 'finish') {
          clearInterval(timeIdRef.current)
          const params = [...progressState.parameters]
          setParams(params)
          setIsTraining(false)
          setTrain_time(performance.now() - startTime.current)
          console.log('finish')
          doneCallback?.(params)
        } else if (progressState.tag === 'initd') {
          console.log('initd')
          toast(`Model initialized`, { duration: 10000 })
          initdCallback?.()
          initdRef.current = true
        } else if (progressState.tag === 'initd-failed') {
          console.error('initd-failed')
          toast.error(`Model initialization failed`)
          initdRef.current = false
        } else if (progressState.tag === 'error') {
          setError(progressState.error)
          const error = new Error(progressState.error)
          error.name = 'WorkerError'
          Sentry.captureException(error)
          toast.error(`${progressState.error}`)
          console.error('Unknown progress state:', progressState)
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

  return {
    params,
    isTraining,
    progress,
    train,
    isDone,
    train_time,
  } as const
}
