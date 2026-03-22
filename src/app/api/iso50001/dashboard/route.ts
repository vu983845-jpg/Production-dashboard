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
    const endDate = new Date(year, mon, 0).toISOString().slice(0, 10) // last day of month

    try {
        // 1. Fetch all daily entries for the month
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

        // Build a map: seu_id → baseline model
        const baselineMap: Record<number, any> = {}
        for (const b of (baselines || [])) {
            baselineMap[b.seu_id] = b
        }

        // 2.5 Fetch all historical monthly records for the 12-month table
        const { data: historicalData, error: histErr } = await supabase
            .from('iso50001_monthly_historical')
            .select('*, seu:iso50001_seu_master(name, energy_type, unit)')
            .order('month_year', { ascending: false })

        if (histErr) throw histErr

        // 3. Compute per-entry KPIs
        const enriched = (entries || []).map((e: any) => {
            const bl = baselineMap[e.seu_id]
            const isCk = bl?.label?.includes('[CK]')
            const actual = Number(e.actual_energy) || 0
            const rcn = Number(e.rcn_hap_duoc_kg) || 0
            const ck = Number(e.ck_obtained_mt) || 0
            
            const xVal = isCk ? ck : rcn
            
            let expected = null
            let deviation_pct = null
            let saving = null
            let enpi_baseline = null

            if (bl) {
                // Determine days in the month of this entry to scale the monthly intercept down to a daily base-load
                const entryDate = new Date(e.entry_date)
                const daysInMonth = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0).getDate()
                
                const daily_intercept = Number(bl.intercept) / daysInMonth
                expected = Number(bl.slope) * xVal + daily_intercept
                
                if (expected > 0) {
                    deviation_pct = ((actual - expected) / expected) * 100
                    saving = expected - actual        // positive = saved, negative = lost
                    enpi_baseline = xVal > 0 ? expected / xVal : null
                }
            }

            const enpi_actual = xVal > 0 ? actual / xVal : null

            return {
                ...e,
                expected_energy: expected,
                deviation_pct,
                saving,
                enpi_actual,
                enpi_baseline,
            }
        })

        // 4. Aggregate by SEU for monthly summary
        const { data: allSeus } = await supabase.from('iso50001_seu_master').select('*')
        
        const summaryBySeu: Record<number, any> = {}
        for (const seu of (allSeus || [])) {
            summaryBySeu[seu.seu_id] = {
                seu_id: seu.seu_id,
                seu_name: seu.name,
                energy_type: seu.energy_type,
                unit: seu.unit,
                total_actual: 0,
                total_expected: 0,
                total_rcn: 0,
                total_saving: 0,
                days: 0,
                has_baseline: !!baselineMap[seu.seu_id],
                baseline: baselineMap[seu.seu_id] || null,
            }
        }

        for (const e of enriched) {
            if (!summaryBySeu[e.seu_id]) continue // Defensive
            
            const s = summaryBySeu[e.seu_id]
            s.total_actual += e.actual_energy || 0
            s.total_expected += e.expected_energy || 0
            s.total_rcn += e.rcn_hap_duoc_kg || 0
            s.total_saving += e.saving || 0
            s.days += 1
        }

        // Compute monthly deviation & EnPI for each SEU
        const summaries = Object.values(summaryBySeu).map((s: any) => ({
            ...s,
            monthly_deviation_pct: s.total_expected > 0
                ? ((s.total_actual - s.total_expected) / s.total_expected) * 100
                : null,
            monthly_enpi_actual: s.total_rcn > 0 ? s.total_actual / s.total_rcn : null,
            monthly_enpi_baseline: s.total_rcn > 0 ? s.total_expected / s.total_rcn : null,
        }))

        // Enrich historical
        const enrichedHistorical = (historicalData || []).map((h: any) => {
            const bl = baselineMap[h.seu_id]
            const isCk = bl?.label?.includes('[CK]')
            const actual = Number(h.actual_energy) || 0
            const rcn = Number(h.rcn_hap_duoc_kg) || 0
            const ck = Number(h.ck_obtained_mt) || 0
            
            const xVal = isCk ? ck : rcn
            
            let expected = h.expected_energy || null
            if (bl && !expected) {
                expected = Number(bl.slope) * xVal + Number(bl.intercept)
            }
            
            return {
                ...h,
                total_energy: actual,
                expected_energy: expected
            }
        })

        return NextResponse.json({ entries: enriched, summaries, historicalData: enrichedHistorical })

    } catch (err: any) {
        console.error('ISO 50001 dashboard error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
