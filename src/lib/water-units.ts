export const TENTH_CUBIC_METRE_WATER_METERS = new Set([
    "cooling",
    "lo_hoi",
    "lo_hoi_shelling",
    "cap_vp",
    "canteen_2",
    "nha_xe",
])

export function toDisplayWaterDelta(meterKey: string, delta: number): number {
    return TENTH_CUBIC_METRE_WATER_METERS.has(meterKey) ? delta / 10 : delta
}

export function calculateWaterDelta(meterKey: string, currentValue: number, previousValue: number): number {
    return Math.max(0, toDisplayWaterDelta(meterKey, currentValue - previousValue))
}

export function calculateCanteenTotal(canteen1: number | null, canteen2: number | null): number | null {
    if (canteen1 == null && canteen2 == null) return null
    return (canteen1 ?? 0) + (canteen2 ?? 0)
}

export function calculateOfficeConsumption(
    officeSupply: number | null,
    garage: number | null,
    canteenTotal: number | null,
): number | null {
    if (officeSupply == null) return null
    const consumption = Math.max(0, officeSupply - (garage ?? 0) - (canteenTotal ?? 0))
    return Math.round(consumption * 1_000_000) / 1_000_000
}
