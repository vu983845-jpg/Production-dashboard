import test from "node:test"
import assert from "node:assert/strict"

import { calculateWaterDelta, toDisplayWaterDelta } from "./water-units.ts"

test("converts tenth-cubic-metre meter deltas to cubic metres", () => {
    assert.equal(toDisplayWaterDelta("cooling", 15), 1.5)
    assert.equal(toDisplayWaterDelta("lo_hoi", 25), 2.5)
    assert.equal(toDisplayWaterDelta("lo_hoi_shelling", 37.5), 3.75)
    assert.equal(toDisplayWaterDelta("cap_vp", 40), 4)
    assert.equal(toDisplayWaterDelta("nha_xe", 1.25), 0.125)
})

test("leaves other water meter deltas unchanged", () => {
    assert.equal(toDisplayWaterDelta("tong", 42), 42)
    assert.equal(toDisplayWaterDelta("ro_cap_vao", 42), 42)
    assert.equal(toDisplayWaterDelta("ro_dau_ra", 42), 42)
    assert.equal(toDisplayWaterDelta("canteen", 42), 42)
    assert.equal(toDisplayWaterDelta("nuoc_thai", 42), 42)
})

test("uses the full meter difference across a month boundary", () => {
    assert.equal(calculateWaterDelta("tong", 15855, 15614), 241)
    assert.equal(calculateWaterDelta("cap_vp", 26687, 26453), 23.4)
})
