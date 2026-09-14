export interface WaterEnpiRow { actual_energy: number | null | undefined; rcn_hap_duoc_kg: number | null | undefined }

export interface WaterEnpiReference {
    value: number | null
    coverageCount: number
    totalWaterM3: number
    totalProductionKg: number
}

export type WaterEnpiComparison = { deltaPct: number; status: 'better' | 'worse' | 'equal' } | null

const isValidMeasurement = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0

export function calculateWeightedWaterEnpi(rows: WaterEnpiRow[]): WaterEnpiReference {
    let totalWaterM3 = 0
    let totalProductionKg = 0
    let coverageCount = 0

    for (const row of rows) {
        if (!isValidMeasurement(row.actual_energy) || !isValidMeasurement(row.rcn_hap_duoc_kg) || row.rcn_hap_duoc_kg <= 0) continue
        totalWaterM3 += row.actual_energy
        totalProductionKg += row.rcn_hap_duoc_kg
        coverageCount++
    }

    return {
        value: totalProductionKg > 0 ? totalWaterM3 / totalProductionKg : null,
        coverageCount,
        totalWaterM3,
        totalProductionKg,
    }
}

export function compareWaterEnpi(current: number | null | undefined, reference: number | null | undefined): WaterEnpiComparison {
    if (!isValidMeasurement(current) || !isValidMeasurement(reference) || reference <= 0) return null
    const deltaPct = Number((((current - reference) / reference) * 100).toFixed(10))
    return { deltaPct, status: deltaPct < 0 ? 'better' : deltaPct > 0 ? 'worse' : 'equal' }
}

