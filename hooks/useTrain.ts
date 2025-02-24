import { getProgress } from '@api/services/collect'
import type { FSRSItem, ProgressState } from '@api/services/types'
import { useCallback, useEffect, useRef, useState } from 'react'

export type TrainFSRSProps = {
  enableShortTerm: boolean
  setError: (error: string) => void
}

export default function useTrainFSRS({ enableShortTerm, setError }: TrainFSRSProps) {
  const [progress, setProgress] = useState(0)
  const [isTraining, setIsTraining] = useState(false)
  const workerRef = useRef<Worker>(undefined)
  const timeIdRef = useRef<NodeJS.Timeout>(undefined)
  const [params, setParams] = useState<number[]>([])
  const startTime = useRef<DOMHighResTimeStamp>(0)
  const [train_time, setTrain_time] = useState<DOMHighResTimeStamp>(0)

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
          handleProgress(wasmMemoryBuffer, pointer)

          const timeId = setInterval(() => {
            handleProgress(wasmMemoryBuffer, pointer)
          }, 100)
          timeIdRef.current = timeId
        } else if (progressState.tag === 'finish') {
          clearInterval(timeIdRef.current)
          setParams([...progressState.parameters])
          setIsTraining(false)
          setTrain_time(performance.now() - startTime.current)
          console.log('finish')
        } else if (progressState.tag === 'initd') {
          console.log('initd')
        } else if (progressState.tag === 'error') {
          setError(progressState.error)
          console.error('Unknown progress state:', progressState)
        }
      }
    }
    workerRef.current = new Worker(new URL('@api/services/worker.ts', import.meta.url))

    workerRef.current.onmessage = (event: MessageEvent<number[] | ProgressState>) => {
      handlerMessage(event)
    }
    workerRef.current.onerror = (err) => {
      setError(err.message)
    }
    workerRef.current.postMessage({ init: true })

    return () => {
      workerRef.current?.terminate()
    }
  }, [setError])

  const train = useCallback(
    (items: FSRSItem[]) => {
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
    train_time
  } as const
}
