import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // e.g. "2025-03"

    if (!month) {
        return NextResponse.json({ error: 'month param required (YYYY-MM)' }, { status: 400 })
    }

    const [year, mon] = month.split('-').map(Number)
    const startDate = `${year}-${String(mon).padStart(2, '0')}-01`
    const endDate = new Date(year, mon, 0).toISOString().slice(0, 10)

    try {
        // 1. Fetch daily entries for the selected month (for summary table)
        const { data: entries, error: entryErr } = await supabase
            .from('iso50001_daily_entry')
            .select('*, seu:iso50001_seu_master(name, energy_type, unit)')
            .gte('entry_date', startDate)
            .lte('entry_date', endDate)
            .order('entry_date', { ascending: true })

        if (entryErr) throw entryErr

        // 2. Fetch active baseline models
        const { data: baselines, error: blErr } = await supabase
            .from('iso50001_baseline_model')
            .select('*')
            .eq('is_active', true)

        if (blErr) throw blErr

        const baselineMap: Record<number, any> = {}
        for (const b of (baselines || [])) baselineMap[b.seu_id] = b

        // 3. Fetch ALL SEUs
        const { data: allSeus } = await supabase.from('iso50001_seu_master').select('*')

        // ── Historical: HYBRID approach ──────────────────────────────────────
        // Step A: Aggregate iso50001_daily_entry by month (last 18 months)
        const histStart = (() => {
            const d = new Date(year, mon - 1 - 17, 1)
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        })()

        const [{ data: dailyHist, error: dHistErr }, { data: monthlyHist, error: mHistErr }] = await Promise.all([
            supabase
                .from('iso50001_daily_entry')
                .select('seu_id, entry_date, actual_energy, rcn_hap_duoc_kg, ck_obtained_mt, seu:iso50001_seu_master(name, energy_type, unit)')
                .gte('entry_date', histStart)
                .order('entry_date', { ascending: false }),
            supabase
                .from('iso50001_monthly_historical')
                .select('*, seu:iso50001_seu_master(name, energy_type, unit)')
                .order('month_year', { ascending: false }),
        ])

        if (dHistErr) throw dHistErr
        if (mHistErr) throw mHistErr

        // Aggregate daily by month+seu
        const dailyAggMap: Record<string, any> = {}
        for (const e of (dailyHist || [])) {
            const mk = e.entry_date.slice(0, 7)
            const key = `${mk}|${e.seu_id}`
            if (!dailyAggMap[key]) {
                dailyAggMap[key] = {
                    id: key, month_year: mk + '-01', seu_id: e.seu_id, seu: e.seu,
                    actual_energy: 0, rcn_hap_duoc_kg: 0, ck_obtained_mt: null, days: 0, source: 'daily',
                }
            }
            const h = dailyAggMap[key]
            h.actual_energy += Number(e.actual_energy) || 0
            h.rcn_hap_duoc_kg += Number(e.rcn_hap_duoc_kg) || 0
            if (e.ck_obtained_mt != null) h.ck_obtained_mt = (h.ck_obtained_mt || 0) + Number(e.ck_obtained_mt)
            h.days++
        }

        // Merge: daily has priority; monthly_historical fills in gaps (older data)
        const mergedMap: Record<string, any> = {}

        // First, insert all monthly_historical records
        for (const h of (monthlyHist || [])) {
            const mk = h.month_year.slice(0, 7)
            const key = `${mk}|${h.seu_id}`
            mergedMap[key] = { ...h, month_year: mk + '-01', days: 0, source: 'historical' }
        }

        // Then override with daily aggregated where available (more accurate)
        for (const [key, h] of Object.entries(dailyAggMap)) {
            mergedMap[key] = h // daily always wins
        }

        // Enrich merged historical with baseline calculations
        const enrichedHistorical = Object.values(mergedMap)
            .sort((a: any, b: any) => b.month_year.localeCompare(a.month_year))
            .map((h: any) => {
                const bl = baselineMap[h.seu_id]
                const isCk = bl?.label?.includes('[CK]')
                const actual = Number(h.actual_energy) || 0
                const rcn = Number(h.rcn_hap_duoc_kg) || 0
                const ck = h.ck_obtained_mt != null ? Number(h.ck_obtained_mt) : 0
                const xVal = isCk ? ck : rcn
                const expected = (bl && xVal > 0)
                    ? Number(bl.slope) * xVal + Number(bl.intercept)
                    : null
                const devPct = (expected && expected > 0)
                    ? ((actual - expected) / expected) * 100 : null
                return { ...h, total_energy: actual, expected_energy: expected, deviation_pct: devPct }
            })

        // ── Summary for selected month ────────────────────────────────────────
        // Compute per-entry KPIs from daily entries
        const enriched = (entries || []).map((e: any) => {
            const bl = baselineMap[e.seu_id]
            const isCk = bl?.label?.includes('[CK]')
            const actual = Number(e.actual_energy) || 0
            const rcn = Number(e.rcn_hap_duoc_kg) || 0
            const ck = Number(e.ck_obtained_mt) || 0
            const xVal = isCk ? ck : rcn

            let expected = null, deviation_pct = null, saving = null, enpi_baseline = null
            if (bl) {
                // Intercept là hằng số tháng (giống công thức trong Baseline Model tab)
                // y = slope * x + intercept
                expected = Number(bl.slope) * xVal + Number(bl.intercept)
                if (expected > 0) {
                    deviation_pct = ((actual - expected) / expected) * 100
                    saving = expected - actual
                    enpi_baseline = xVal > 0 ? expected / xVal : null
                }
            }
            return { ...e, expected_energy: expected, deviation_pct, saving, enpi_actual: (xVal > 0 ? actual / xVal : null), enpi_baseline }
        })

        // Aggregate by SEU
        const summaryBySeu: Record<number, any> = {}
        for (const seu of (allSeus || [])) {
            summaryBySeu[seu.seu_id] = {
                seu_id: seu.seu_id, seu_name: seu.name,
                energy_type: seu.energy_type, unit: seu.unit,
                total_actual: 0, total_expected: 0, total_rcn: 0, total_saving: 0, days: 0,
                has_baseline: !!baselineMap[seu.seu_id],
                baseline: baselineMap[seu.seu_id] || null,
            }
        }
        for (const e of enriched) {
            if (!summaryBySeu[e.seu_id]) continue
            const s = summaryBySeu[e.seu_id]
            s.total_actual += e.actual_energy || 0
            s.total_expected += e.expected_energy || 0
            s.total_rcn += e.rcn_hap_duoc_kg || 0
            s.total_saving += e.saving || 0
            s.days++
        }

        const daysInSelectedMonth = new Date(year, mon, 0).getDate()
        const summaries = Object.values(summaryBySeu).map((s: any) => {
            // If no daily data yet for this month but we have a baseline,
            // show N/A deviation (not "Chưa có baseline")
            return {
                ...s,
                monthly_deviation_pct: s.days > 0 && s.total_expected > 0
                    ? ((s.total_actual - s.total_expected) / s.total_expected) * 100
                    : null,
                monthly_enpi_actual: s.total_rcn > 0 ? s.total_actual / s.total_rcn : null,
                monthly_enpi_baseline: s.total_rcn > 0 ? s.total_expected / s.total_rcn : null,
                days_in_month: daysInSelectedMonth,
            }
        })

        return NextResponse.json({ entries: enriched, summaries, historicalData: enrichedHistorical })

    } catch (err: any) {
        console.error('ISO 50001 dashboard error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
