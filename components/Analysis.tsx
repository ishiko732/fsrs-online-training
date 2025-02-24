import { analyzeCSV } from '@api/services/collect'
import { Progress } from '@components/ui/progress'

export default function AnalysisForm({
  progress,
  analysis,
}: {
  progress: number
  analysis: Awaited<ReturnType<typeof analyzeCSV>> | null
}) {
  if (!analysis) {
    return <></>
  }
  return (
    <>
      {progress > 0 && progress < 100 && (
        <div className="mt-4">
          <Progress value={progress} className="w-full" />
          <p className="mt-2 text-sm text-gray-500 text-center">Processing file... {progress}%</p>
        </div>
      )}

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
                    {/* eslint-disable @typescript-eslint/no-explicit-any */}
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
    </>
  )
}
