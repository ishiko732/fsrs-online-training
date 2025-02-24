import { cn } from '@lib/utils'

export default function FormatArray<T>({
  array,
  unique_key,
  className,
  isCopied,
}: {
  array: T[]
  isCopied: boolean
  unique_key: string
  className?: string
}) {
  return (
    <>
      <ol className={cn('list-decimal list-inside', className)}>
        {array.map((item, index) => (
          <li
            key={unique_key + index}
            className={cn('marker:text-gray-500', className, `transition-all ${isCopied ? 'animate-pulse' : ''}`)}
          >
            <span className="text-gray-600">{`${item}`}</span>
          </li>
        ))}
      </ol>
    </>
  )
}
