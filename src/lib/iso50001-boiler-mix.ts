import { z } from 'zod'

export const WOOD_TRANSITION_START = '2026-06-01'
export type Basis = 'unknown' | 'rcn-equivalent' | 'kernel-mass'
export type WoodSavingStatus = 'not-comparable' | 'missing-data'
export type DataQualityStatus = 'draft' | 'verified' | 'estimated'
export interface BoilerProcessMixInput {
  self_steamed_rcn_kg: number | null
  received_precut_rcn_kg: number | null
  receipt_basis: Basis
  borma_input_kg: number | null
  borma_input_basis: Basis
  data_quality_status: DataQualityStatus
}
const nullableNonNegative = z.number().finite().nonnegative().nullable()
const basis = z.enum(['unknown', 'rcn-equivalent', 'kernel-mass'])
export const boilerMixPayloadSchema = z.object({
  month_year: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  self_steamed_rcn_kg: nullableNonNegative,
  received_precut_rcn_kg: nullableNonNegative,
  receipt_basis: basis.optional().default('unknown'),
  borma_input_kg: nullableNonNegative,
  borma_input_basis: basis.optional().default('unknown'),
  borma_runtime_hours: nullableNonNegative.optional().default(null),
  moisture_in_pct: z.number().finite().min(0).max(100).nullable().optional().default(null),
  moisture_out_pct: z.number().finite().min(0).max(100).nullable().optional().default(null),
  data_quality_status: z.enum(['draft', 'verified', 'estimated']),
  notes: z.string().trim().max(4000).nullable().optional().default(null),
}).strict()
export function parseBoilerMixPayload(input: unknown) { return boilerMixPayloadSchema.parse(input) }
export function classifyWoodSaving(_monthYear: string, mix: BoilerProcessMixInput | null): WoodSavingStatus {
  if (!mix || mix.received_precut_rcn_kg == null || mix.borma_input_kg == null) return 'missing-data'
  return 'not-comparable'
}
export function isIsoEditor(role: string | null | undefined) { return ['admin', 'hse', 'hse_admin'].includes((role ?? '').toLowerCase()) }
