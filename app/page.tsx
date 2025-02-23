/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { analyzeCSV, getProgress } from '@api/services/collect'
import { ProgressState } from '@api/services/types'
import { Progress } from '@components/ui/progress'
import { AlertCircle, FileText, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'

export default function Home() {
  const [progress, setProgress] = useState(0)
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyzeCSV>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const workerRef = useRef<Worker>(undefined)
  const timeIdRef = useRef<NodeJS.Timeout>(undefined)
  const handleProgress = (wasmMemoryBuffer: ArrayBuffer, pointer: number) => {
    const { itemsProcessed, itemsTotal } = getProgress(wasmMemoryBuffer, pointer)
    setProgress((itemsProcessed / itemsTotal) * 100)
    // if (progressTextRef.current) {
    //   progressTextRef.current.innerText = `${itemsProcessed}/${itemsTotal}`
    // }
    console.log(itemsProcessed, itemsTotal)
  }

  useEffect(() => {
    workerRef.current = new Worker(new URL('@api/services/worker.ts', import.meta.url))

    workerRef.current.onmessage = (event: MessageEvent<number[] | ProgressState>) => {
      console.log(event.data)
      if ('tag' in event.data) {
        // process ProgressState
        const progressState = event.data as ProgressState
        if (progressState.tag === 'start') {
          const { wasmMemoryBuffer, pointer } = progressState
          handleProgress(wasmMemoryBuffer, pointer)
          timeIdRef.current = setInterval(() => {
            handleProgress(wasmMemoryBuffer, pointer)
          }, 100)
        } else if (progressState.tag === 'finish') {
          clearInterval(timeIdRef.current)
          console.log('finish')
        } else if (progressState.tag === 'initd') {
          console.log('initd')
        } else {
          console.error('Unknown progress state:', progressState)
        }
      }
    }

    workerRef.current.postMessage({ init: true })
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file')
      return
    }

    setIsUploading(true)
    setProgress(0)
    setError(null)
    setAnalysis(null)

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 100)

      const text = await file.text()
      const analysisResult = await analyzeCSV(text)
      workerRef.current?.postMessage({ items: analysisResult.fsrs_items, enableShortTerm: true })

      clearInterval(progressInterval)
      setProgress(100)
      setAnalysis(analysisResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file')
    } finally {
      setIsUploading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
    disabled: isUploading,
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
          } ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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

        {isUploading && (
          <div className="mt-4">
            <Progress value={progress} className="w-full" />
            <p className="mt-2 text-sm text-gray-500 text-center">Processing file... {progress}%</p>
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

        {analysis && (
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
      </div>
    </div>
  )
}
