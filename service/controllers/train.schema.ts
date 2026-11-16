import type { ModelVersion } from '@open-spaced-repetition/binding'
import { z } from 'zod'

const ModelVersionSchema = z.enum([
  'FSRS-6',
  'FSRS-7',
] as const satisfies readonly `${ModelVersion}`[])

// FSRSBinding accepts 17/19/21 (FSRS-6) and 34 (FSRS-7) weights.
export function modelVersionOfWeights(
  w: readonly number[]
): `${ModelVersion}` | undefined {
  if (w.length === 34) return 'FSRS-7'
  if ([17, 19, 21].includes(w.length)) return 'FSRS-6'
  return undefined
}

export const WeightSchema = z.string().transform((s, ctx) => {
  const result = s.replace('[', '').replace(']', '').split(',').map(Number)
  if (!result.every(Number.isFinite)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid number in array',
    })
    return z.NEVER
  }
  if (!modelVersionOfWeights(result)) {
    ctx.addIssue({
      code: 'custom',
      message: `Unsupported weights length ${result.length}, expected 17, 19, 21 (FSRS-6) or 34 (FSRS-7)`,
    })
    return z.NEVER
  }
  return result
})

export const TrainFormData = z
  .object({
    file: z.instanceof(File),
    timezone: z.string().optional().default('Asia/Shanghai'),
    model_version: ModelVersionSchema.optional().default('FSRS-6'),
    enable_short_term: z
      .string()
      .transform((v) => v === '1')
      .optional()
      .default(true),
    enable_sched_penalties: z
      .string()
      .transform((v) => v === '1')
      .optional()
      .default(false),
    hour_offset: z
      .string()
      .optional()
      .transform((v) => Math.min(23, Math.max(0, Number(v ?? 4)))),
    sse: z
      .string()
      .transform((v) => v === '1')
      .optional()
      .default(true),
  })
  .transform((data) =>
    // FSRS-7 always trains with short-term enabled; FSRS-6 has no penalties.
    data.model_version === 'FSRS-7'
      ? { ...data, enable_short_term: true }
      : { ...data, enable_sched_penalties: false }
  )

export const EvaluateFormData = z.object({
  file: z.instanceof(File),
  timezone: z.string().optional().default('Asia/Shanghai'),
  w: WeightSchema,
  hour_offset: z
    .string()
    .optional()
    .transform((v) => Math.min(23, Math.max(0, Number(v ?? 4)))),
  sse: z
    .string()
    .transform((v) => v === '1')
    .optional()
    .default(true),
})

export type TTrainFormData = z.infer<typeof TrainFormData>
export type TEvaluateFormData = z.infer<typeof EvaluateFormData>
