'use client'

import { Button } from '@components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { timezones } from '@lib/timezones'
import { cn } from '@lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'

export type TimezoneSelectorProps = { tz: string; setTz: (tz: string) => void; className?: string }

export default function TimezoneSelector({ tz, setTz, className }: TimezoneSelectorProps) {
  const [open, setOpen] = useState(false)
  const handleClick = (tz: string) => {
    setTz(tz)
    setOpen(false)
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full sm:w-1/2 justify-between"
            aria-label="Select TimeZone"
          >
            {tz || 'Select TimeZone...'}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn('w-max p-0 text-left', className)}>
          <Command className={'w-full'}>
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
