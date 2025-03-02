'use client'

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { timezones } from '@lib/timezones'
import { cn } from '@lib/utils'
import { Check } from 'lucide-react'
import { useState } from 'react'

import { Input } from './ui/input'

export type TimezoneSelectorProps = {
  tz: string
  setTz: (tz: string) => void
  className?: string
  disabled?: boolean
}

export default function TimezoneSelector({ tz, setTz, className, disabled }: TimezoneSelectorProps) {
  const [open, setOpen] = useState(false)
  const handleClick = (tz: string) => {
    setTz(tz)
    setOpen(false)
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="w-full mt-1 block sm:w-1/2 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
          <div className="flex w-full items-center space-x-2">
            <Input
              aria-expanded={open}
              aria-label="Select TimeZone"
              type="text"
              placeholder="Select TimeZone..."
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              disabled={disabled}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className={cn('p-0 text-left w-[var(--radix-popover-trigger-width)]', className)}>
          <Command>
            <CommandInput placeholder="Search TimeZone..." />
            {/* https://github.com/shadcn-ui/ui/issues/2944 */}
            <CommandList className={'w-full'}>
              <CommandEmpty>No Dataset</CommandEmpty>
              <CommandGroup>
                {timezones.map((timezone, index) => (
                  <CommandItem key={index} value={timezone} onSelect={handleClick} aria-label={timezone} role="select" className={'w-full'}>
                    <Check className={cn('mr-2 h-4 w-4', timezone === tz ? 'opacity-100' : 'opacity-0')} />
                    {timezone}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  )
}
