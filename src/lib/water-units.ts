export const TENTH_CUBIC_METRE_WATER_METERS = new Set([
    "cooling",
    "lo_hoi",
    "lo_hoi_shelling",
    "cap_vp",
    "nha_xe",
])

export function toDisplayWaterDelta(meterKey: string, delta: number): number {
    return TENTH_CUBIC_METRE_WATER_METERS.has(meterKey) ? delta / 10 : delta
}
