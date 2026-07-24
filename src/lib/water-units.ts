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

type WaterValue = number | null | undefined

export interface WaterPeriodSummary {
    total: number
    average: number
    recordedDays: number
}

export interface WaterPeriodComparison {
    currentTotal: number
    previousTotal: number
    difference: number
    percentChange: number | null
    recordedDays: number
}

export interface WaterAnomaly {
    baselineAverage: number
    percentAboveAverage: number
}

const roundWaterValue = (value: number): number => Math.round(value * 1_000_000) / 1_000_000

const isValidWaterValue = (value: WaterValue): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0

export function summarizeWaterPeriod(values: WaterValue[]): WaterPeriodSummary {
    const validValues = values.filter(isValidWaterValue)
    const total = roundWaterValue(validValues.reduce((sum, value) => sum + value, 0))

    return {
        total,
        average: validValues.length > 0 ? roundWaterValue(total / validValues.length) : 0,
        recordedDays: validValues.length,
    }
}

export function compareWaterPeriods(
    currentValues: WaterValue[],
    previousValues: WaterValue[],
): WaterPeriodComparison {
    const lastRecordedIndex = currentValues.findLastIndex(isValidWaterValue)
    const currentPeriod = lastRecordedIndex >= 0 ? currentValues.slice(0, lastRecordedIndex + 1) : []
    const previousPeriod = lastRecordedIndex >= 0 ? previousValues.slice(0, lastRecordedIndex + 1) : []
    const current = summarizeWaterPeriod(currentPeriod)
    const previous = summarizeWaterPeriod(previousPeriod)
    const difference = roundWaterValue(current.total - previous.total)

    return {
        currentTotal: current.total,
        previousTotal: previous.total,
        difference,
        percentChange: previous.total > 0
            ? roundWaterValue((difference / previous.total) * 100)
            : null,
        recordedDays: current.recordedDays,
    }
}

export function getWaterAnomaly(
    currentValue: WaterValue,
    previousValues: WaterValue[],
    threshold = 0.5,
    minimumBaselineDays = 3,
): WaterAnomaly | null {
    if (!isValidWaterValue(currentValue) || currentValue <= 0) return null

    const baseline = summarizeWaterPeriod(previousValues)
    if (baseline.recordedDays < minimumBaselineDays || baseline.average <= 0) return null
    if (currentValue <= baseline.average * (1 + threshold)) return null

    return {
        baselineAverage: baseline.average,
        percentAboveAverage: roundWaterValue(((currentValue - baseline.average) / baseline.average) * 100),
    }
}
