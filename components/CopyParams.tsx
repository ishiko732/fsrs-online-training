'use client'
import { cn } from '@lib/utils'
import { useState } from 'react'
import { toast } from 'sonner'

import FormatArray from './FormatArray'

export default function CopyParams<T>({
  array,
  enable_short_term,
  className,
}: {
  array: T[]
  enable_short_term: boolean
  className?: string
}) {
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = () => {
    const textToCopy = array.join(', ')
    toast.promise(navigator.clipboard.writeText(textToCopy), {
      loading: 'Copying...',
      success: () => {
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
        setTimeout(() => {
          toast(
            <p>
              {`You can open the visualizer through this link: `}
              <a
                href={`https://open-spaced-repetition.github.io/anki_fsrs_visualizer/?w=${textToCopy}&m=${0.9}&e=${enable_short_term ? 1 : 0}`}
                className="text-blue-500 underline"
                target="_blank"
              >
                anki fsrs visualizer
              </a>
            </p>,
            { duration: 10000 },
          )
        })
        return 'Copied!'
      },
      error: 'Failed to copy',
    })
  }
  return (
    <>
      <dt className={cn('text-sm font-medium text-gray-500', className)}>
        Optimized Parameters
        <button
          onClick={handleCopy}
          className={`ml-2 px-4 py-2 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-all ${
            isCopied ? 'animate-pulse' : ''
          }`}
        >
          {isCopied ? 'Copied!' : 'Copy'}
        </button>
      </dt>
      <dd className="mt-1 text-sm text-gray-900">
        <FormatArray array={array} unique_key={enable_short_term ? 'short' : 'long'} isCopied={isCopied} />
      </dd>
    </>
  )
}
