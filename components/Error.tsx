import { AlertCircle } from 'lucide-react'
export default function ErrorForm({ error }: { error: string | null }) {
  return (
    error && (
      <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
          <p className="ml-3 text-sm text-red-500">{error}</p>
        </div>
      </div>
    )
  )
}
