/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { analyzeCSV, getProgress } from '@api/services/collect'
import { ProgressState } from '@api/services/types'
import { Progress } from '@components/ui/progress'
import { AlertCircle, FileText, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'

export default function Home() {
  const [progress_short, setProgress_short] = useState(0)
  const [progress_long, setProgress_long] = useState(0)
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyzeCSV>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTraining_short, setIsTraining_short] = useState(false)
  const [isTraining_long, setIsTraining_long] = useState(false)
  const workerRef_short = useRef<Worker>(undefined)
  const workerRef_long = useRef<Worker>(undefined)
  const timeIdRef_short = useRef<NodeJS.Timeout>(undefined)
  const timeIdRef_long = useRef<NodeJS.Timeout>(undefined)
  const [params_short, setParam_short] = useState<number[]>([])
  const [params_long, setParam_long] = useState<number[]>([])
  const handleProgress = (wasmMemoryBuffer: ArrayBuffer, pointer: number, enableShortTerm: boolean) => {
    const { itemsProcessed, itemsTotal } = getProgress(wasmMemoryBuffer, pointer)
    const value = (itemsProcessed / itemsTotal) * 100

    if (enableShortTerm) {
      setProgress_short(value)
    } else {
      setProgress_long(value)
    }
    // if (progressTextRef.current) {
    //   progressTextRef.current.innerText = `${itemsProcessed}/${itemsTotal}`
    // }
    console.log(enableShortTerm, itemsProcessed, itemsTotal)
  }

  useEffect(() => {
    const handlerMessage = (event: MessageEvent<number[] | ProgressState>, enableShortTerm: boolean) => {
      console.log(event.data)
      if ('tag' in event.data) {
        // process ProgressState
        const progressState = event.data as ProgressState
        if (progressState.tag === 'start') {
          const { wasmMemoryBuffer, pointer } = progressState
          handleProgress(wasmMemoryBuffer, pointer, enableShortTerm)

          const timeId = setInterval(() => {
            handleProgress(wasmMemoryBuffer, pointer, enableShortTerm)
          }, 100)
          if (enableShortTerm) {
            timeIdRef_short.current = timeId
          } else {
            timeIdRef_long.current = timeId
          }
        } else if (progressState.tag === 'finish') {
          if (enableShortTerm) {
            clearInterval(timeIdRef_short.current)
            setParam_short([...progressState.parameters])
            setIsTraining_short(false)
          } else {
            clearInterval(timeIdRef_long.current)
            setParam_long([...progressState.parameters])
            setIsTraining_long(false)
          }

          console.log('finish')
        } else if (progressState.tag === 'initd') {
          console.log('initd')
        } else if (progressState.tag === 'error') {
          setError(progressState.error)
          console.error('Unknown progress state:', progressState)
        }
      }
    }
    workerRef_short.current = new Worker(new URL('@api/services/worker.ts', import.meta.url))

    workerRef_short.current.onmessage = (event: MessageEvent<number[] | ProgressState>) => {
      handlerMessage(event, true)
    }
    workerRef_short.current.onerror = (err) => {
      setError(err.message)
    }
    workerRef_short.current.postMessage({ init: true })

    workerRef_long.current = new Worker(new URL('@api/services/worker.ts', import.meta.url))
    workerRef_long.current.onmessage = (event: MessageEvent<number[] | ProgressState>) => {
      handlerMessage(event, false)
    }
    workerRef_long.current.onerror = (err) => {
      setError(err.message)
    }
    workerRef_long.current.postMessage({ init: true })

    return () => {
      workerRef_short.current?.terminate()
      workerRef_long.current?.terminate()
    }
  }, [])

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file')
      return
    }

    setIsTraining_short(true)
    setIsTraining_long(true)
    setProgress_short(0)
    setProgress_long(0)
    setParam_short([])
    setParam_long([])
    setError(null)
    setAnalysis(null)

    try {
      const text = await file.text()
      const analysisResult = await analyzeCSV(text)
      workerRef_short.current?.postMessage({ items: analysisResult.fsrs_items, enableShortTerm: true })
      workerRef_long.current?.postMessage({ items: analysisResult.fsrs_items, enableShortTerm: false })
      setAnalysis(analysisResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file')
      setIsTraining_short(false)
      setIsTraining_long(false)
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

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h2 className="mt-2 text-3xl font-bold text-gray-900">CSV File Analyzer</h2>
          <p className="mt-1 text-sm text-gray-500">Upload your CSV file to analyze its contents</p>
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
            <p className="text-xs text-gray-500">CSV files only</p>
          </div>
        </div>

        {isTraining_short && (
          <div className="mt-4">
            <Progress value={progress_short} className="w-full" />
            <p className="mt-2 text-sm text-gray-500 text-center">Processing file... {progress_short}%</p>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
              <p className="ml-3 text-sm text-red-500">{error}</p>
            </div>
          </div>
        )}

        {analysis && params_short.length === 0 && params_long.length === 0 && (
          <div className="mt-8 bg-white shadow rounded-lg divide-y divide-gray-200">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Analysis Results</h3>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Total Rows</dt>
                  <dd className="mt-1 text-sm text-gray-900">{analysis.totalRows}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Number of Columns</dt>
                  <dd className="mt-1 text-sm text-gray-900">{analysis.columns.length}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Number of Cards</dt>
                  <dd className="mt-1 text-sm text-gray-900">{analysis.summary.grouped}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Number of FSRSItems</dt>
                  <dd className="mt-1 text-sm text-gray-900">{analysis.summary.fsrsItems}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Column Names</dt>
                  <dd className="mt-1 text-sm text-gray-900">{analysis.columns.join(', ')}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Sample Data (First 5 Rows)</dt>
                  <dd className="mt-1 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {analysis.columns.map((column: string) => (
                            <th key={column} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {analysis.sampleData.map((row: any, index: number) => (
                          <tr key={index}>
                            {analysis.columns.map((column: string) => (
                              <td key={column} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {row[column]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {isTraining_short && (
          <div className="mt-4">
            <Progress value={progress_short} className="w-full" />
            <p className="mt-2 text-sm text-gray-500 text-center">Train ... {progress_short}%</p>
          </div>
        )}
        {params_short.length > 0 && (
          <div className="mt-8 bg-white shadow rounded-lg divide-y divide-gray-200">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Train Results</h3>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Train Model</dt>
                  <dd className="mt-1 text-sm text-gray-900">Short-Term</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Parameter</dt>
                  <dd className="mt-1 text-sm text-gray-900">{JSON.stringify(params_short, null, 2)}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {isTraining_long && (
          <div className="mt-4">
            <Progress value={progress_long} className="w-full" />
            <p className="mt-2 text-sm text-gray-500 text-center">Train ... {progress_long}%</p>
          </div>
        )}
        {params_long.length > 0 && (
          <div className="mt-8 bg-white shadow rounded-lg divide-y divide-gray-200">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Train Results</h3>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Train Model</dt>
                  <dd className="mt-1 text-sm text-gray-900">Long-Term</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Parameter</dt>
                  <dd className="mt-1 text-sm text-gray-900">{JSON.stringify(params_long, null, 2)}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
