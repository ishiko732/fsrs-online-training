import { z } from 'zod'

export const HashObject = z.object({
  csv: z.string(),
  tz: z.string(),
  nextDayStartAt: z
    .number()
    .default(4)
    .transform((v) => Math.max(0, Math.min(23, v))),
  callback: z.string().optional(),
})
