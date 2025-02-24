'use client'

import { analyzeCSV } from '@api/services/collect'
import AnalysisForm from '@components/Analysis'
import CopyParams from '@components/CopyParams'
import ErrorForm from '@components/Error'
import FormatArray from '@components/FormatArray'
import { Progress } from '@components/ui/progress'
import useTrainFSRS from '@hooks/useTrain'
import { AlertCircle, FileText, Upload } from 'lucide-react'
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'

export default function Home() {
  const [progress, setProgress] = useState(0)
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyzeCSV>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    params: params_short,
    isTraining: isTraining_short,
    progress: progress_short,
    train: train_short,
    isDone: isDone_short,
  } = useTrainFSRS({ enableShortTerm: true, setError })
  const {
    params: params_long,
    isTraining: isTraining_long,
    progress: progress_long,
    train: train_long,
    isDone: isDone_long,
  } = useTrainFSRS({ enableShortTerm: false, setError })

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file')
      return
    }

    setError(null)
    setAnalysis(null)
    setProgress(0)

    try {
      const text = await file.text()
      const analysisResult = await analyzeCSV(text)
      setProgress(90)
      train_short(analysisResult.fsrs_items)
      train_long(analysisResult.fsrs_items)
      setAnalysis(analysisResult)
      setProgress(100)
    } catch (err) {
      setProgress(100)
      setError(err instanceof Error ? err.message : 'Failed to process file')
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
    disabled: isTraining_short,
  })

  const merge_progress = +((progress_short + progress_long) / 2).toFixed(6)

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h2 className="mt-2 text-3xl font-bold text-gray-900">CSV File Analyzer</h2>
          <p className="mt-1 text-sm text-gray-500">Upload your CSV file to analyze its contents and train</p>
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
              <input {...getInputProps()} />
              <p className="pl-1">{isDragActive ? 'Drop the CSV file here' : 'Drag and drop your CSV file here, or click to select'}</p>
            </div>
            <p className="text-xs text-gray-500 text-left">CSV files only</p>
            <div>
              <span className="text-gray-500 text-left">require fields</span>
              <ul className="list-disc pl-4 pt-2 text-gray-500 text-left">
                <li>card_id(integer or string)</li>
                <li>review_time(integer)</li>
                <li>review_rating([0,4])</li>
              </ul>
            </div>
          </div>
        </div>

        {(isTraining_short || isTraining_long) && (
          <div className="mt-4">
            <Progress value={merge_progress} className="w-full" />
            <p className="mt-2 text-sm text-gray-500 text-center">Train ... {merge_progress}%</p>
          </div>
        )}
        {isDone_short() && isDone_long() && (
          <div className="mt-8 bg-white shadow rounded-lg divide-y divide-gray-200">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Train Results</h3>
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

              <div className="px-4 py-5 sm:p-6 w-full">
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
        )}
        <ErrorForm error={error} />

        <AnalysisForm analysis={analysis} progress={progress} />
      </div>
    </div>
  )
}
