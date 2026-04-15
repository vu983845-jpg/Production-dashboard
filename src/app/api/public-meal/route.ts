import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const deptId   = searchParams.get("dept_id")
    const workDate = searchParams.get("work_date")
    const shift    = searchParams.get("shift")
    const deptName = searchParams.get("dept_name")

    // Fetch existing record for OT-edit mode
    if (deptId && workDate && shift && deptName) {
        const { data, error } = await supabaseAdmin
            .from("meal_headcount")
            .select("ot_count, ot_vegetarian, official_present, seasonal_present, vegetarian")
            .eq("department_id", deptId)
            .eq("work_date", workDate)
            .eq("shift", shift)
            .eq("department_name", deptName)
            .maybeSingle()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ record: data })
    }

    // Default: return dept list
    const { data: depts, error } = await supabaseAdmin
        .from("departments")
        .select("id, code, name_en")
        .order("sort_order")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ depts })
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        // Accept single record OR array of records
        const rows = Array.isArray(body) ? body : [body]

        for (const row of rows) {
            const { department_id, work_date, shift } = row
            if (!department_id || !work_date || !shift) {
                return NextResponse.json({ error: "Thiếu thông tin bắt buộc: bộ phận, ngày, ca" }, { status: 400 })
            }
            const today = new Date()
            today.setHours(23, 59, 59, 999)
            if (new Date(work_date) > today) {
                return NextResponse.json({ error: "Không thể báo cơm cho ngày tương lai" }, { status: 400 })
            }
        }

        const payloads = rows.map(row => ({
            department_id: row.department_id,
            department_name: row.department_name ?? "",
            work_date: row.work_date,
            shift: row.shift,
            official_present: row.official_present ?? 0,
            seasonal_present: row.seasonal_present ?? 0,
            official_absent: row.official_absent ?? 0,
            seasonal_absent: row.seasonal_absent ?? 0,
            ot_count: row.ot_count ?? 0,
            vegetarian: row.vegetarian ?? 0,
            ot_vegetarian: row.ot_vegetarian ?? 0,
            note: row.reporter_name ? `Báo bởi: ${row.reporter_name}` : "Báo qua link công khai",
        }))

        const { error } = await supabaseAdmin
            .from("meal_headcount")
            .upsert(payloads, {
                onConflict: "work_date,department_name,shift",
                ignoreDuplicates: false,
            })

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true, count: payloads.length })
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
