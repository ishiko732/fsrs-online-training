'use client'

import AnalysisForm from '@components/Analysis'
import CopyParams from '@components/CopyParams'
import DemoCSV from '@components/Demo-csv'
import ErrorForm from '@components/Error'
import { Sleep } from '@components/lib/time'
import { currentTz, get_timezone_offset } from '@components/lib/tz'
import TimezoneSelector from '@components/timezones'
import { Input } from '@components/ui/input'
import { LoadingSpinner } from '@components/ui/loadingSpinner'
import { Progress } from '@components/ui/progress'
import useAnalyze from '@hooks/useAnalyze'
import useTrainFSRS from '@hooks/useTrain'
import { FileText, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'

export default function Home() {
  const [draftTz, setDraftTz] = useState<string>(currentTz)
  const [tz, setTz] = useState<string>(currentTz)
  const [draftNextDayStartAt, setDraftNextDayStartAt] = useState<number>(4)
  const [nextDayStartAt, setNextDayStartAt] = useState<number>(4)
  const [progressInfo, setProgressInfo] = useState(0)
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyzeCSV>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    params: params_short,
    isTraining: isTraining_short,
    progress: progress_short,
    train: train_short,
    isDone: isDone_short,
    train_time: train_time_short,
    inValid: inValid_short,
  } = useTrainFSRS({ enableShortTerm: true, setError })
  const {
    params: params_long,
    isTraining: isTraining_long,
    progress: progress_long,
    train: train_long,
    isDone: isDone_long,
    train_time: train_time_long,
    inValid: inValid_long,
  } = useTrainFSRS({ enableShortTerm: false, setError })

  const analyzeCSV = useAnalyze({ setError, setProgressInfo })

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file')
      return
    }

    setError(null)
    setAnalysis(null)
    setProgressInfo(0)
    setTz(draftTz)
    setNextDayStartAt(draftNextDayStartAt)
    const analysisResult = analyzeCSV(file, draftTz, draftNextDayStartAt)

    toast.promise(analysisResult, {
      loading: 'Analyzing CSV...',
      success: (analysisResult) => {
        setAnalysis(analysisResult)
        if (analysisResult?.fsrs_items.length > 0) {
          toast.promise(Sleep(2000), {
            loading: 'Training...',
          })
          train_short(analysisResult.fsrs_items)
          train_long(analysisResult.fsrs_items)
        } else {
          toast.warning('No data to train')
        }
        return `Analysis completed`
      },
      error: () => {
        return 'Failed to analyze CSV'
      },
    })
    setProgressInfo(0)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
    disabled: isTraining_short,
  })

  useEffect(() => {
    requestAnimationFrame(() => {
      toast('Welcome to FSRS online training', { duration: 10000 })
      toast(<DemoCSV />, { duration: 60000 })
    })
  }, [])

  const merge_progress = +((progress_short + progress_long) / 2).toFixed(6) || 0
  const merge_train_time = +(Math.max(train_time_short, train_time_long) / 1000).toFixed(3)
  const offset_hour = Math.floor(get_timezone_offset(tz) / 60)
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h2 className="mt-2 text-3xl font-bold text-gray-900">CSV File Analyzer</h2>
          <p className="mt-1 text-sm text-gray-500">Upload your CSV file to analyze its contents and train</p>
        </div>

        {/* Timezone */}
        <div className="mb-4 sm:flex justify-between sm:items-center">
          <label htmlFor="timezone" className="text-sm font-medium text-gray-700">
            Timezone
          </label>
          <TimezoneSelector tz={draftTz} setTz={setDraftTz} />
        </div>

        {/* Next Day Start At Input */}
        <div className="mb-4 sm:flex justify-between sm:items-center">
          <label htmlFor="next-day-start-at" className="text-sm font-medium text-gray-700">
            Next Day Start At
          </label>
          <Input
            type="number"
            id="next-day-start-at"
            value={draftNextDayStartAt}
            onChange={(e) => setDraftNextDayStartAt(+e.target.value)}
            step={1}
            min={0}
            max={23}
            className="w-full mt-1 block sm:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div
          {...getRootProps()}
          className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg ${
            isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          } ${isTraining_short ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="space-y-1 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400" aria-hidden="true" />
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
              <p className="pl-1">{isDragActive ? 'Drop the CSV file here' : 'Drag and drop your CSV file here, or click to select'}</p>
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

        {(isTraining_short || isTraining_long) && (
          <div className="mt-4">
            {inValid_short || inValid_long ? (
              <LoadingSpinner className="mt-2 text-sm text-gray-500 text-center" />
            ) : (
              <>
                <Progress value={merge_progress} className="w-full" />
                <p className="mt-2 text-sm text-gray-500 text-center">Train ... {merge_progress}%</p>
              </>
            )}
          </div>
        )}
        {isDone_short() && isDone_long() && (
          <div className="mt-8 bg-white shadow rounded-lg divide-y divide-gray-200">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">{`Train Results (${merge_train_time}s)`}</h3>
            </div>
            <div>
              <div className="px-4 py-5 sm:p-6">
                <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Timezone</dt>
                    <dd className="mt-1 text-sm text-gray-900">{`${tz} ( ${offset_hour > 0 ? `+${offset_hour}` : offset_hour === 0 ? 0 : offset_hour}h ) `}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Next Day Start At</dt>
                    <dd className="mt-1 text-sm text-gray-900">{nextDayStartAt}</dd>
                  </div>
                </div>
              </div>
              <div className="sm:flex justify-between">
                <div className="px-4 py-5 sm:p-6 w-full">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Train Model</dt>
                      <dd className="mt-1 text-sm text-gray-900">Short-Term</dd>
                    </div>
                    <div className="sm:col-span-2 text-left">
                      <CopyParams array={params_short} enable_short_term={true} />
                    </div>
                  </dl>
                </div>

                <div className="py-5 w-full">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Train Model</dt>
                      <dd className="mt-1 text-sm text-gray-900">Long-Term</dd>
                    </div>
                    <div className="sm:col-span-2 text-left">
                      <CopyParams array={params_long} enable_short_term={false} />
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        )}
        <ErrorForm error={error} />

        <AnalysisForm analysis={analysis} progress={progressInfo} />
      </div>
    </div>
  )
}
