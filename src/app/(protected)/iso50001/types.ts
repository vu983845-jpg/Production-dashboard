// Shared types for ISO 50001 module

export interface SeuMaster {
    seu_id: number
    name: string
    energy_type: 'electricity' | 'wood' | 'water'
    unit: string
    output_unit: string
}

export interface MonthlyHistorical {
    id: number
    seu_id: number
    month_year: string  // 'YYYY-MM-DD'
    rcn_hap_duoc_kg: number
    actual_energy: number
    ck_obtained_mt?: number
    notes?: string
    seu?: SeuMaster
    total_energy?: number
    expected_energy?: number | null
}

export interface BaselineModel {
    id: number
    seu_id: number
    label: string
    period_from: string
    period_to: string
    slope: number
    intercept: number
    r_squared: number
    n_points: number
    is_active: boolean
    created_at: string
}

export interface DailyEntry {
    id: number
    entry_date: string
    seu_id: number
    actual_energy: number
    rcn_hap_duoc_kg: number
    notes?: string
    expected_energy?: number | null
    deviation_pct?: number | null
    saving?: number | null
    enpi_actual?: number | null
    enpi_baseline?: number | null
    seu?: { name: string; energy_type: string; unit: string }
}

export interface SeuSummary {
    seu_id: number
    seu_name: string
    energy_type: string
    unit: string
    total_actual: number
    total_expected: number
    total_rcn: number
    total_saving: number
    days: number
    has_baseline: boolean
    baseline: BaselineModel | null
    monthly_deviation_pct: number | null
    monthly_enpi_actual: number | null
    monthly_enpi_baseline: number | null
    data_source?: 'daily' | 'historical' // daily = current month, historical = past month
}

/** Simple least-squares linear regression: y = slope * x + intercept */
export function calcLinearRegression(points: { x: number; y: number }[]) {
    const n = points.length
    if (n < 2) return null

    const sumX = points.reduce((acc, p) => acc + p.x, 0)
    const sumY = points.reduce((acc, p) => acc + p.y, 0)
    const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0)
    const sumX2 = points.reduce((acc, p) => acc + p.x * p.x, 0)

    const denom = n * sumX2 - sumX * sumX
    if (denom === 0) return null

    const slope = (n * sumXY - sumX * sumY) / denom
    const intercept = (sumY - slope * sumX) / n

    // R²
    const meanY = sumY / n
    const ssTot = points.reduce((acc, p) => acc + (p.y - meanY) ** 2, 0)
    const ssRes = points.reduce((acc, p) => acc + (p.y - (slope * p.x + intercept)) ** 2, 0)
    const r_squared = ssTot > 0 ? 1 - ssRes / ssTot : 0

    return { slope, intercept, r_squared, n }
}

export function fmtNum(v: number | null | undefined, decimals = 1): string {
    if (v == null || isNaN(v)) return '—'
    return v.toLocaleString('vi-VN', { maximumFractionDigits: decimals })
}

export function deviationColor(pct: number | null | undefined): string {
    if (pct == null) return 'text-muted-foreground'
    if (pct <= 0) return 'text-emerald-600'   // saving
    if (pct <= 5) return 'text-amber-500'      // slight over
    return 'text-red-600'                       // over baseline
}

export function deviationBg(pct: number | null | undefined): string {
    if (pct == null) return 'bg-muted/30'
    if (pct <= 0) return 'bg-emerald-50 border-emerald-200'
    if (pct <= 5) return 'bg-amber-50 border-amber-200'
    return 'bg-red-50 border-red-200'
}
