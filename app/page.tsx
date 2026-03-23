'use client'

import type { TCallback } from '@api/controllers/support'
import { HashObject } from '@api/services/hash_parse'
import CopyParams from '@components/CopyParams'
import DemoCSV from '@components/Demo-csv'
import ErrorForm from '@components/Error'
import { currentTz, get_timezone_offset } from '@components/lib/tz'
import TimezoneSelector from '@components/timezones'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Progress } from '@components/ui/progress'
import useTrain from '@hooks/useTrain'
import { hc } from 'hono/client'
import { FileText, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'

import type { AppType } from '@/app/api/[[...route]]/route'

const client = hc<AppType>('/')

const container: TCallback = {
  url: '',
  body: {
    tz: '',
    nextDayStartAt: 0,
    total_rows: 0,
    total_cards: 0,
    total_fsrs_items: 0,
    short_term_params: [],
    long_term_params: [],
  },
}

export default function Home() {
  const [draftTz, setDraftTz] = useState<string>(currentTz)
  const [tz, setTz] = useState<string>(currentTz)
  const [draftNextDayStartAt, setDraftNextDayStartAt] = useState<number>(4)
  const [error, setError] = useState<string | null>(null)
  const {
    shortTerm,
    longTerm,
    fsrsItems,
    isTraining,
    phase,
    trainTime,
    train,
    isDone,
    clear,
  } = useTrain()
  const callbackOnClientRef = useRef(false)
  const toastIdRef = useRef<string | number | undefined>(undefined)

  // Update toast when phase changes
  useEffect(() => {
    if (phase === 'training' && toastIdRef.current) {
      toast.loading('Training...', { id: toastIdRef.current })
    }
  }, [phase])

  // Fire callback when both trainings complete
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fire only when params change
  useEffect(() => {
    if (!isDone() || !container.url) return
    container.body.short_term_params = shortTerm.params
    container.body.long_term_params = longTerm.params
    toast.promise(handleCallback(container), {
      loading: 'Callback...',
      success: 'Callback success',
      error: 'Callback failed',
    })
  }, [shortTerm.params, longTerm.params])

  const handleCallback = (body: TCallback) => {
    if (!callbackOnClientRef.current) {
      return client.api.support.callback.$post({
        json: body,
      })
    }
    return fetch(container.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000 /* 20s */),
    })
  }

  const handleTrain = async (
    file: File,
    tz: string,
    nextDayStartAt: number
  ) => {
    setError(null)
    setTz(tz)
    clear()
    container.body.short_term_params = []
    container.body.long_term_params = []
    container.body.tz = tz
    container.body.nextDayStartAt = nextDayStartAt

    const csvBuffer = await file.arrayBuffer()
    toastIdRef.current = toast.loading('Converting CSV...')

    train(csvBuffer, tz, nextDayStartAt)
      .then(() =>
        toast.success('Training completed', { id: toastIdRef.current })
      )
      .catch((e) =>
        toast.error(`Training failed: ${e.message}`, { id: toastIdRef.current })
      )
  }

  const handleFetch = async (csv: string, fetchOnClient: boolean) => {
    if (fetchOnClient) {
      return fetch(csv).then((resp) => resp.blob())
    }
    return client.api.support.redirect
      .$get({
        query: {
          url: csv,
        },
      })
      .then((resp) => resp.blob())
  }

  const handleHashChange = async () => {
    const hash = window.location.hash
    if (hash.length > 1 && hash.startsWith('#')) {
      const urlSearch = new URLSearchParams(hash.slice(1))
      const hashObject = HashObject.safeParse({
        csv: urlSearch.get('csv') || '',
        fetchOnClient: urlSearch.get('fetchOnClient') === '1',
        tz: urlSearch.get('tz') || currentTz,
        nextDayStartAt: +(urlSearch.get('nextDayStartAt') || 4),
        callback: urlSearch.get('callback') || undefined,
        callbackOnClient: urlSearch.get('callbackOnClient') === '1',
      })
      if (hashObject.success) {
        setTz(hashObject.data.tz)
        setDraftTz(hashObject.data.tz)
        setDraftNextDayStartAt(hashObject.data.nextDayStartAt)
        if (hashObject.data.callback) {
          container.url = hashObject.data.callback
          callbackOnClientRef.current = hashObject.data.callbackOnClient
        }
        toast.promise(
          handleFetch(hashObject.data.csv, hashObject.data.fetchOnClient),
          {
            loading: 'Fetching CSV...',
            success: async (blob) => {
              const file = new File([blob], 'file.csv')
              handleTrain(
                file,
                hashObject.data.tz,
                hashObject.data.nextDayStartAt
              )
              return 'CSV Fetched'
            },
            error: 'Failed to fetch CSV',
          }
        )
      }
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignore
  useEffect(() => {
    requestAnimationFrame(() => {
      toast('Welcome to FSRS online training', { duration: 10000 })
      toast(<DemoCSV />, { duration: 60000 })
    })
    toast.promise(handleHashChange, {
      loading: 'Check...',
    })
  }, [])

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file')
      return
    }
    await handleTrain(file, draftTz, draftNextDayStartAt)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
    disabled: isTraining,
  })

  const merge_progress =
    +((shortTerm.progress + longTerm.progress) / 2).toFixed(6) || 0
  const merge_train_time = +(trainTime / 1000).toFixed(3)
  const offset_hour = Math.floor(get_timezone_offset(tz) / 60)
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            CSV File Analyzer
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Upload your CSV file to analyze its contents and train
          </p>
        </div>

        {/* Timezone */}
        <div className="mb-4 sm:flex justify-between sm:items-center">
          <div className="flex flex-col">
            <Label
              htmlFor="timezone"
              className="text-sm font-medium text-gray-700"
            >
              Timezone
            </Label>
            <label className="text-sm text-gray-500">
              The timezone of the user.
            </label>
          </div>
          <TimezoneSelector
            tz={draftTz}
            setTz={setDraftTz}
            disabled={isTraining}
          />
        </div>

        {/* Next Day Start At Input */}
        <div className="mb-4 sm:flex justify-between sm:items-center">
          <div className="flex flex-col">
            <label
              htmlFor="next-day-start-at"
              className="text-sm font-medium text-gray-700"
            >
              Next Day Start At
            </label>
            <label className="text-sm text-gray-500">
              The hour of the day when the next day starts.
            </label>
          </div>
          <Input
            type="number"
            id="next-day-start-at"
            value={draftNextDayStartAt}
            onChange={(e) => setDraftNextDayStartAt(+e.target.value)}
            step={1}
            min={0}
            max={23}
            disabled={isTraining}
            className="w-full mt-1 block sm:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div
          {...getRootProps()}
          className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg ${
            isDragActive
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          } ${isTraining ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="space-y-1 text-center">
            <Upload
              className="mx-auto h-12 w-12 text-gray-400"
              aria-hidden="true"
            />
            <div className="flex text-sm text-gray-600">
              <input
                {...getInputProps({
                  style: {
                    opacity: 0.01,
                    width: 0,
                    height: 0,
                    display: 'none',
                  },
                })}
              />
              <p className="pl-1">
                {isDragActive
                  ? 'Drop the CSV file here'
                  : 'Drag and drop your CSV file here, or click to select'}
              </p>
            </div>
            <p className="text-xs text-gray-500 text-left">CSV files only</p>
            <div>
              <span className="text-gray-500 text-left">require fields</span>
              <ul className="list-disc pl-4 pt-2 text-gray-500 text-left">
                <li>card_id(integer or string)</li>
                <li>review_time(integer)</li>
                <li>review_rating([0,4])</li>
                <li>review_state([0,3])</li>
                <li>Optional:review_duration(ms)</li>
              </ul>
            </div>
          </div>
        </div>

        {isTraining && (
          <div className="mt-4">
            <Progress
              value={phase === 'converting' ? undefined : merge_progress}
              className="w-full"
            />
            <p className="mt-2 text-sm text-gray-500 text-center">
              {phase === 'converting'
                ? 'Converting CSV...'
                : `Training ... ${merge_progress}%`}
            </p>
          </div>
        )}
        {isDone() && (
          <div className="mt-8 bg-white shadow rounded-lg divide-y divide-gray-200">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">{`Train Results (${merge_train_time}s)`}</h3>
            </div>
            <div>
              <div className="px-4 py-5 sm:p-6">
                <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      Timezone
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">{`${tz} ( ${offset_hour > 0 ? `+${offset_hour}` : offset_hour === 0 ? 0 : offset_hour}h ) `}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      Number of FSRSItems
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">{fsrsItems}</dd>
                  </div>
                </div>
              </div>
              <div className="sm:flex justify-between">
                <div className="px-4 py-5 sm:p-6 w-full">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Train Model
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">Short-Term</dd>
                    </div>
                    <div className="sm:col-span-2 text-left">
                      <CopyParams
                        array={shortTerm.params}
                        enable_short_term={true}
                      />
                    </div>
                  </dl>
                </div>

                <div className="py-5 w-full">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Train Model
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">Long-Term</dd>
                    </div>
                    <div className="sm:col-span-2 text-left">
                      <CopyParams
                        array={longTerm.params}
                        enable_short_term={false}
                      />
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        )}
        <ErrorForm error={error} />
      </div>
    </div>
  )
}
