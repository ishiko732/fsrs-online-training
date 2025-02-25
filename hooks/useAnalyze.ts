import { analyze } from "@api/services/collect";


type AnalyzeProps = {
    setError: (error: string) => void
    setProgressInfo: (row: number) => void
}

export default function useAnalyze({ setError, setProgressInfo }: AnalyzeProps) {
    const handlerCSV = async (file: File, tz: string, nextDayStartAt: number) => {
        return analyze(file, tz, nextDayStartAt, setProgressInfo).catch(e => {
            const error = e as Error
            const msg = `Failed to parse CSV: ${error.message}`
            setError(msg)
            throw new Error(msg)
        })
    }
    return handlerCSV
}