import { loggerError, loggerInfo } from '@api/utils/logger'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  ModelVersion,
  TrainMessage,
  TrainRun,
  WorkerMessage,
} from '@/workers/training.worker'

export type TrainResult = {
  params: number[]
  progress: number
}

export type TrainPhase = 'idle' | 'converting' | 'training'

const isEnabledRun = (run: TrainRun) =>
  run.modelVersion === 'FSRS-7' ? run.enableSchedPenalties : run.enableShortTerm

export default function useTrain() {
  const [phase, setPhase] = useState<TrainPhase>('idle')
  // Model of the latest training; results never follow the current selector.
  const [modelVersion, setModelVersion] = useState<ModelVersion>('FSRS-6')
  // FSRS-6: short-term on/off. FSRS-7: scheduling penalties on/off.
  const [enabled, setEnabled] = useState<TrainResult>({
    params: [],
    progress: 0,
  })
  const [disabled, setDisabled] = useState<TrainResult>({
    params: [],
    progress: 0,
  })
  const [fsrsItems, setFsrsItems] = useState(0)
  const [trainTime, setTrainTime] = useState(0)
  const workerRef = useRef<Worker | null>(null)
  // The worker posts 'ready' only once, so a reused worker must not wait again.
  const workerReadyRef = useRef(false)

  const startTrain = useCallback(
    (
      csvData: ArrayBuffer,
      timezone: string,
      nextDayStartsAt: number,
      modelVersion: ModelVersion
    ): Promise<void> => {
      setPhase('converting')
      setModelVersion(modelVersion)
      setEnabled({ params: [], progress: 0 })
      setDisabled({ params: [], progress: 0 })
      setFsrsItems(0)
      setTrainTime(0)
      const start = performance.now()

      return new Promise<void>((resolve, reject) => {
        if (!workerRef.current) {
          workerReadyRef.current = false
          workerRef.current = new Worker(
            new URL('../workers/training.worker.ts', import.meta.url),
            { type: 'module' }
          )
        }
        const worker = workerRef.current

        // Start the next run from a fresh worker and WASM instance.
        const disposeWorker = () => {
          worker.terminate()
          if (workerRef.current === worker) {
            workerRef.current = null
            workerReadyRef.current = false
          }
        }

        const sendTrainMessage = () => {
          worker.postMessage(
            {
              type: 'train',
              csvData,
              timezone,
              nextDayStartsAt,
              modelVersion,
            } satisfies TrainMessage,
            [csvData]
          )
        }

        worker.onerror = (e) => {
          disposeWorker()
          setPhase('idle')
          reject(new Error(e.message || 'Training worker failed to load'))
        }

        worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
          const msg = e.data
          if (!msg || typeof msg !== 'object' || !('type' in msg)) return

          switch (msg.type) {
            case 'ready':
              workerReadyRef.current = true
              sendTrainMessage()
              break
            case 'convert-complete':
              setFsrsItems(msg.fsrsItems)
              setPhase('training')
              break
            case 'progress': {
              const value = msg.total > 0 ? (msg.current / msg.total) * 100 : 0
              const setter = isEnabledRun(msg) ? setEnabled : setDisabled
              setter((prev) => ({ ...prev, progress: value || 0 }))
              break
            }
            case 'training-complete': {
              const setter = isEnabledRun(msg) ? setEnabled : setDisabled
              setter({ params: msg.parameters, progress: 100 })
              loggerInfo('train-done', {
                tag: 'finish',
                ...msg,
              })
              break
            }
            case 'done':
              setTrainTime(performance.now() - start)
              setPhase('idle')
              resolve()
              break
            case 'error':
              disposeWorker()
              setPhase('idle')
              toast.error(`Training failed: ${msg.message}`)
              loggerError('train-error', { error: msg.message })
              reject(new Error(msg.message))
              break
          }
        }

        if (workerReadyRef.current) {
          sendTrainMessage()
        }
      })
    },
    []
  )

  const isTraining = phase !== 'idle'
  const isDone = () =>
    enabled.params.length > 0 && disabled.params.length > 0 && !isTraining

  const clear = () => {
    setEnabled({ params: [], progress: 0 })
    setDisabled({ params: [], progress: 0 })
    setFsrsItems(0)
    setPhase('idle')
    setTrainTime(0)
  }

  return {
    modelVersion,
    enabled,
    disabled,
    fsrsItems,
    isTraining,
    phase,
    trainTime,
    train: startTrain,
    isDone,
    clear,
  } as const
}
