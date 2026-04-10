import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// API Key bảo mật — đặt trong Vercel env var: POWERBI_API_KEY
const POWERBI_API_KEY = process.env.POWERBI_API_KEY || 'PPE_PowerBI_2026'

/**
 * GET /api/powerbi/hap-daily
 *
 * Trả về data hấp (STEAM dept) hàng ngày cho Power BI.
 *
 * Headers bắt buộc:
 *   x-api-key: PPE_PowerBI_2026
 *
 * Query params (tuỳ chọn):
 *   from  — ngày bắt đầu YYYY-MM-DD  (default: đầu năm hiện tại)
 *   to    — ngày kết thúc YYYY-MM-DD  (default: hôm nay)
 *
 * Response: JSON array — mỗi phần tử là 1 ngày
 * [
 *   {
 *     "work_date": "2026-04-10",
 *     "actual_ton": 45.5,
 *     "plan_ton": 50.0,
 *     "achievement_pct": 91.0,
 *     "variance_ton": -4.5,
 *     "input_ton": 210.0,
 *     "good_output_ton": 45.5,
 *     "downtime_min": 0
 *   },
 *   ...
 * ]
 */
export async function GET(request: Request) {
    // ── 1. Xác thực API Key ──────────────────────────────────────────────────
    const apiKey = request.headers.get('x-api-key')
    if (apiKey !== POWERBI_API_KEY) {
        return NextResponse.json(
            { error: 'Unauthorized — invalid or missing x-api-key header' },
            { status: 401 }
        )
    }

    // ── 2. Kết nối Supabase (service role — bypass RLS) ─────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: 'Server config error' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── 3. Xử lý ngày từ/đến ────────────────────────────────────────────────
    const { searchParams } = new URL(request.url)
    const today = new Date()

    // Default: từ đầu năm hiện tại đến hôm nay
    const defaultFrom = `${today.getFullYear()}-01-01`
    const defaultTo   = today.toISOString().slice(0, 10)

    const fromDate = searchParams.get('from') || defaultFrom
    const toDate   = searchParams.get('to')   || defaultTo

    // ── 4. Query v_dashboard_daily — chỉ lấy STEAM ──────────────────────────
    const { data, error } = await supabase
        .from('v_dashboard_daily')
        .select(`
            work_date,
            dept_code,
            dept_name_en,
            actual_ton,
            plan_ton,
            input_ton,
            good_output_ton,
            downtime_min
        `)
        .eq('dept_code', 'STEAM')
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
        .order('work_date', { ascending: true })

    if (error) {
        console.error('[PowerBI hap-daily] Supabase error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ── 5. Group by work_date (tổng hợp nếu có nhiều row/ngày) ──────────────
    const byDate: Record<string, {
        work_date: string
        actual_ton: number
        plan_ton: number
        input_ton: number
        good_output_ton: number
        downtime_min: number
    }> = {}

    for (const row of (data || [])) {
        const d = row.work_date
        if (!byDate[d]) {
            byDate[d] = {
                work_date: d,
                actual_ton: 0,
                plan_ton: 0,
                input_ton: 0,
                good_output_ton: 0,
                downtime_min: 0,
            }
        }
        byDate[d].actual_ton      += Number(row.actual_ton      || 0)
        byDate[d].plan_ton        += Number(row.plan_ton        || 0)
        byDate[d].input_ton       += Number(row.input_ton       || 0)
        byDate[d].good_output_ton += Number(row.good_output_ton || 0)
        byDate[d].downtime_min    += Number(row.downtime_min    || 0)
    }

    // ── 6. Format response — flat JSON cho Power BI ──────────────────────────
    const rows = Object.values(byDate).map(r => ({
        work_date:       r.work_date,
        actual_ton:      Number(r.actual_ton.toFixed(2)),
        plan_ton:        Number(r.plan_ton.toFixed(2)),
        achievement_pct: r.plan_ton > 0
            ? Number(((r.actual_ton / r.plan_ton) * 100).toFixed(1))
            : null,
        variance_ton:    Number((r.actual_ton - r.plan_ton).toFixed(2)),
        input_ton:       Number(r.input_ton.toFixed(2)),
        good_output_ton: Number(r.good_output_ton.toFixed(2)),
        downtime_min:    Math.round(r.downtime_min),
    }))

    return NextResponse.json(rows, {
        headers: {
            'Cache-Control': 'no-store, no-cache',
            'Content-Type': 'application/json',
        },
    })
}
