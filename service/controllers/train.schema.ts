import { z } from 'zod'

export const TrainFormData = z.object({
  file: z.instanceof(File),
  timezone: z.string().optional().default('Asia/Shanghai'),
  enable_short_term: z
    .string()
    .transform((v) => v === '1')
    .optional()
    .default('1'),
  hour_offset: z
    .string()
    .optional()
    .transform((v) => Math.min(23, Math.max(0, Number(v ?? 4)))),
  sse: z
    .string()
    .transform((v) => v === '1')
    .optional()
    .default('1'),
})

export const EvaluateFormData = z.object({
  file: z.instanceof(File),
  timezone: z.string().optional().default('Asia/Shanghai'),
  w: z.string().transform((s) => s.replace('[', '').replace(']', '').split(',').map(Number)),
  hour_offset: z
    .string()
    .optional()
    .transform((v) => Math.min(23, Math.max(0, Number(v ?? 4)))),
  sse: z
    .string()
    .transform((v) => v === '1')
    .optional()
    .default('1'),
})

export type TTrainFormData = z.infer<typeof TrainFormData>
export type TEvaluateFormData = z.infer<typeof EvaluateFormData>
