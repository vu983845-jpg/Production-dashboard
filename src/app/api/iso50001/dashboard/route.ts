import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // e.g. "2026-03"

    if (!month) {
        return NextResponse.json({ error: 'month param required (YYYY-MM)' }, { status: 400 })
    }

    const [year, mon] = month.split('-').map(Number)
    const startDate = `${year}-${String(mon).padStart(2, '0')}-01`
    const endDate = new Date(year, mon, 0).toISOString().slice(0, 10)

    // Determine if selected month is current or past
    const now = new Date()
    const currentYearMon = now.getFullYear() * 100 + (now.getMonth() + 1) // e.g. 202604
    const selectedYearMon = year * 100 + mon
    const isCurrentMonth = selectedYearMon === currentYearMon
    const isPastMonth = selectedYearMon < currentYearMon

    try {
        // 1. Fetch active baseline models
        const { data: baselines, error: blErr } = await supabase
            .from('iso50001_baseline_model')
            .select('*')
            .eq('is_active', true)
        if (blErr) throw blErr

        const baselineMap: Record<number, any> = {}
        for (const b of (baselines || [])) baselineMap[b.seu_id] = b

        // 2. Fetch ALL SEUs
        const { data: allSeus } = await supabase.from('iso50001_seu_master').select('*')

        // ── Historical chart data (12 months) ────────────────────────────────
        // Rule: past months → monthly_historical (finalized);
        //       current month → daily_entry aggregated (in-progress)
        const histStart = (() => {
            const d = new Date(year, mon - 1 - 17, 1)
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        })()

        // Fetch both sources for historical chart
        const [{ data: dailyHist, error: dHistErr }, { data: monthlyHist, error: mHistErr }] = await Promise.all([
            // Only fetch daily for current month (past months already use historical)
            supabase
                .from('iso50001_daily_entry')
                .select('seu_id, entry_date, actual_energy, rcn_hap_duoc_kg, ck_obtained_mt, seu:iso50001_seu_master(name, energy_type, unit)')
                .gte('entry_date', startDate)  // only current month's daily entries for chart
                .lte('entry_date', endDate)
                .order('entry_date', { ascending: true }),
            supabase
                .from('iso50001_monthly_historical')
                .select('*, seu:iso50001_seu_master(name, energy_type, unit)')
                .gte('month_year', histStart)
                .order('month_year', { ascending: false }),
        ])

        if (dHistErr) throw dHistErr
        if (mHistErr) throw mHistErr

        // Build historical chart: past months from monthly_historical, current month from daily aggregate
        const mergedMap: Record<string, any> = {}

        // Fill past months from monthly_historical (authoritative for finalized months)
        for (const h of (monthlyHist || [])) {
            const mk = h.month_year.slice(0, 7)
            const hYearMon = Number(mk.replace('-', ''))
            // For past months, use historical as-is. For current month, skip (will use daily below)
            if (hYearMon < currentYearMon) {
                const key = `${mk}|${h.seu_id}`
                mergedMap[key] = { ...h, month_year: mk + '-01', days: 0, source: 'historical' }
            }
        }

        // Aggregate daily entries for current month (in-progress data)
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

        // Current month daily overwrites (or adds) into merged map
        for (const [key, h] of Object.entries(dailyAggMap)) {
            mergedMap[key] = h
        }

        // Enrich historical with baseline calcs (formula applied once per month)
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

        // ── Summary for selected month (MTD table) ────────────────────────────
        // Current month → aggregate from iso50001_daily_entry (live data)
        // Past month    → use iso50001_monthly_historical (finalized)

        // Initialize summary slots for all SEUs
        const summaryBySeu: Record<number, any> = {}
        for (const seu of (allSeus || [])) {
            summaryBySeu[seu.seu_id] = {
                seu_id: seu.seu_id, seu_name: seu.name,
                energy_type: seu.energy_type, unit: seu.unit,
                total_actual: 0, total_rcn: 0, total_ck: 0, days: 0,
                data_source: isCurrentMonth ? 'daily' : 'historical',
                has_baseline: !!baselineMap[seu.seu_id],
                baseline: baselineMap[seu.seu_id] || null,
            }
        }

        let entries: any[] = [] // daily entries (for per-day chart — current month only)

        if (isCurrentMonth) {
            // ── CURRENT MONTH: aggregate from daily_entry ──
            // dailyHist already fetched for current month above
            entries = dailyHist || []
            for (const e of entries) {
                if (!summaryBySeu[e.seu_id]) continue
                const s = summaryBySeu[e.seu_id]
                s.total_actual += Number(e.actual_energy) || 0
                s.total_rcn    += Number(e.rcn_hap_duoc_kg) || 0
                if (e.ck_obtained_mt != null) s.total_ck = (s.total_ck || 0) + Number(e.ck_obtained_mt)
                s.days++
            }
        } else if (isPastMonth) {
            // ── PAST MONTH: use iso50001_monthly_historical (finalized) ──
            const { data: pastMonthHist, error: pmErr } = await supabase
                .from('iso50001_monthly_historical')
                .select('*, seu:iso50001_seu_master(name, energy_type, unit)')
                .eq('month_year', startDate) // 'YYYY-MM-01'

            if (pmErr) throw pmErr

            for (const h of (pastMonthHist || [])) {
                if (!summaryBySeu[h.seu_id]) continue
                const s = summaryBySeu[h.seu_id]
                s.total_actual = Number(h.actual_energy) || 0
                s.total_rcn = Number(h.rcn_hap_duoc_kg) || 0
                s.total_ck = h.ck_obtained_mt != null ? Number(h.ck_obtained_mt) : 0
                s.days = 1 // mark as "has data"
            }
        }

        // Enrich per-day entries for chart display (current month only, used by daily chart)
        const enrichedEntries = entries.map((e: any) => {
            const bl = baselineMap[e.seu_id]
            const isCk = bl?.label?.includes('[CK]')
            const actual = Number(e.actual_energy) || 0
            const rcn = Number(e.rcn_hap_duoc_kg) || 0
            const ck = Number(e.ck_obtained_mt) || 0
            const xVal = isCk ? ck : rcn
            // Chart-only: slope * xDay (no intercept per day to avoid overcounting)
            return {
                ...e,
                expected_energy: bl ? Number(bl.slope) * xVal : null,
                deviation_pct: null, saving: null,
                enpi_actual: xVal > 0 ? actual / xVal : null,
                enpi_baseline: null,
            }
        })

        // Compute monthly expected ONCE per SEU: y = slope * total_x + intercept
        const daysInSelectedMonth = new Date(year, mon, 0).getDate()
        const summaries = Object.values(summaryBySeu).map((s: any) => {
            const bl = baselineMap[s.seu_id]
            const isCk = bl?.label?.includes('[CK]')
            const totalX = isCk ? (s.total_ck || 0) : s.total_rcn

            let total_expected: number | null = null
            let total_saving: number | null = null
            let monthly_deviation_pct: number | null = null

            if (bl && s.days > 0 && totalX > 0) {
                total_expected = Number(bl.slope) * totalX + Number(bl.intercept)
                if (total_expected > 0) {
                    total_saving = total_expected - s.total_actual
                    monthly_deviation_pct = ((s.total_actual - total_expected) / total_expected) * 100
                }
            }

            return {
                ...s,
                total_expected: total_expected ?? 0,
                total_saving: total_saving ?? 0,
                monthly_deviation_pct,
                monthly_enpi_actual: s.total_rcn > 0 ? s.total_actual / s.total_rcn : null,
                monthly_enpi_baseline: (total_expected != null && s.total_rcn > 0) ? total_expected / s.total_rcn : null,
                days_in_month: daysInSelectedMonth,
            }
        })

        return NextResponse.json({
            entries: enrichedEntries,
            summaries,
            historicalData: enrichedHistorical,
            meta: { isCurrentMonth, isPastMonth, dataSource: isCurrentMonth ? 'daily_entry' : 'monthly_historical' }
        })

    } catch (err: any) {
        console.error('ISO 50001 dashboard error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
