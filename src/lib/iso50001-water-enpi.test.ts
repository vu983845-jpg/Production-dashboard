import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-ignore -- Node's experimental TypeScript loader requires the explicit extension.
import { calculateWeightedWaterEnpi, compareWaterEnpi } from './iso50001-water-enpi.ts'

test('calculates annual reference from weighted totals instead of averaging monthly ratios', () => {
  assert.deepEqual(calculateWeightedWaterEnpi([{actual_energy:100,rcn_hap_duoc_kg:1000},{actual_energy:900,rcn_hap_duoc_kg:9000}]), {value:0.1,coverageCount:2,totalWaterM3:1000,totalProductionKg:10000})
})
test('excludes invalid and zero-production rows', () => {
  const result=calculateWeightedWaterEnpi([{actual_energy:25,rcn_hap_duoc_kg:500},{actual_energy:null,rcn_hap_duoc_kg:100},{actual_energy:10,rcn_hap_duoc_kg:0},{actual_energy:-1,rcn_hap_duoc_kg:100}])
  assert.equal(result.value,0.05); assert.equal(result.coverageCount,1)
})
test('returns unavailable without valid denominator', () => {
  assert.deepEqual(calculateWeightedWaterEnpi([]), {value:null,coverageCount:0,totalWaterM3:0,totalProductionKg:0}); assert.equal(compareWaterEnpi(0.1,null),null)
})
test('uses lower-is-better comparison semantics', () => {
  assert.deepEqual(compareWaterEnpi(0.08,0.1),{deltaPct:-20,status:'better'}); assert.deepEqual(compareWaterEnpi(0.12,0.1),{deltaPct:20,status:'worse'}); assert.deepEqual(compareWaterEnpi(0.1,0.1),{deltaPct:0,status:'equal'})
})

