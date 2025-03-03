import { analyze } from '@api/services/collect'
import * as Sentry from '@sentry/nextjs'

type AnalyzeProps = {
  setError: (error: string) => void
  setProgressInfo: (row: number) => void
}

export default function useAnalyze({ setError, setProgressInfo }: AnalyzeProps) {
  const handlerCSV = async (file: Papa.LocalFile, tz: string, nextDayStartAt: number) => {
    return analyze(file, tz, nextDayStartAt, setProgressInfo).catch((e) => {
      const error = e as Error
      error.name = 'AnalyzeError'
      const msg = `Failed to parse CSV: ${error.message}`
      Sentry.captureException(error)
      setError(msg)
      throw new Error(msg)
    })
  }
  return handlerCSV
}
