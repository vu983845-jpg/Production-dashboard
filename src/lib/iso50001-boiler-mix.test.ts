import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node executes TypeScript tests with explicit extensions.
import { classifyWoodSaving, parseBoilerMixPayload } from './iso50001-boiler-mix.ts'

const completeMix = {
  self_steamed_rcn_kg: 1,
  received_precut_rcn_kg: 1,
  receipt_basis: 'rcn-equivalent' as const,
  borma_input_kg: 1,
  borma_input_basis: 'kernel-mass' as const,
  data_quality_status: 'verified' as const,
}

test('never classifies boiler mix as a comparable saving', () => {
  assert.equal(classifyWoodSaving('2026-05-01', completeMix), 'not-comparable')
  assert.equal(classifyWoodSaving('2026-09-01', completeMix), 'not-comparable')
})

test('classifies absent records and records with absent comparison inputs as missing-data', () => {
  assert.equal(classifyWoodSaving('2026-09-01', null), 'missing-data')
  assert.equal(classifyWoodSaving('2026-09-01', { ...completeMix, received_precut_rcn_kg: null }), 'missing-data')
  assert.equal(classifyWoodSaving('2026-09-01', { ...completeMix, borma_input_kg: null }), 'missing-data')
})

test('accepts independent bases, null as missing, and zero as a measured value', () => {
  const result = parseBoilerMixPayload({
    month_year: '2026-09-01',
    self_steamed_rcn_kg: 0,
    received_precut_rcn_kg: null,
    receipt_basis: 'unknown',
    borma_input_kg: null,
    borma_input_basis: 'kernel-mass',
    data_quality_status: 'draft',
  })
  assert.deepEqual(result, {
    month_year: '2026-09-01',
    self_steamed_rcn_kg: 0,
    received_precut_rcn_kg: null,
    receipt_basis: 'unknown',
    borma_input_kg: null,
    borma_input_basis: 'kernel-mass',
    borma_runtime_hours: null,
    moisture_in_pct: null,
    moisture_out_pct: null,
    data_quality_status: 'draft',
    notes: null,
  })
})

test('defaults omitted bases to unknown for compatibility', () => {
  const result = parseBoilerMixPayload({
    month_year: '2026-09-01',
    self_steamed_rcn_kg: null,
    received_precut_rcn_kg: null,
    borma_input_kg: null,
    data_quality_status: 'estimated',
  })
  assert.equal(result.receipt_basis, 'unknown')
  assert.equal(result.borma_input_basis, 'unknown')
})

test('rejects malformed dates, negative or non-finite values, invalid bases, and unknown fields', () => {
  const valid = {
    month_year: '2026-09-01',
    self_steamed_rcn_kg: null,
    received_precut_rcn_kg: null,
    receipt_basis: 'unknown',
    borma_input_kg: null,
    borma_input_basis: 'unknown',
    data_quality_status: 'draft',
  }
  assert.throws(() => parseBoilerMixPayload({ ...valid, month_year: '2026-09-02' }))
  assert.throws(() => parseBoilerMixPayload({ ...valid, borma_input_kg: -1 }))
  assert.throws(() => parseBoilerMixPayload({ ...valid, borma_input_kg: Number.POSITIVE_INFINITY }))
  assert.throws(() => parseBoilerMixPayload({ ...valid, receipt_basis: 'wet-weight' }))
  assert.throws(() => parseBoilerMixPayload({ ...valid, saving: 999 }))
})

