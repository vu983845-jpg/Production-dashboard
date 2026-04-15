import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Use service role to bypass RLS since this is a trusted public endpoint
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
    // Return department list for the form dropdown
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
        const {
            department_id,
            department_name,
            work_date,
            shift,
            official_present,
            seasonal_present,
            official_absent,
            seasonal_absent,
            ot_count,
            vegetarian,
            ot_vegetarian,
            reporter_name,
        } = body

        // Basic validation
        if (!department_id || !work_date || !shift) {
            return NextResponse.json({ error: "Thiếu thông tin bắt buộc: bộ phận, ngày, ca" }, { status: 400 })
        }

        // Prevent future dates
        const today = new Date()
        today.setHours(23, 59, 59, 999)
        const date = new Date(work_date)
        if (date > today) {
            return NextResponse.json({ error: "Không thể báo cơm cho ngày tương lai" }, { status: 400 })
        }

        const payload = {
            department_id,
            department_name,
            work_date,
            shift,
            official_present: official_present ?? 0,
            seasonal_present: seasonal_present ?? 0,
            official_absent: official_absent ?? 0,
            seasonal_absent: seasonal_absent ?? 0,
            ot_count: ot_count ?? 0,
            vegetarian: vegetarian ?? 0,
            ot_vegetarian: ot_vegetarian ?? 0,
            note: reporter_name ? `Báo bởi: ${reporter_name}` : "Báo qua link công khai",
        }

        const { error } = await supabaseAdmin
            .from("meal_headcount")
            .upsert(payload, {
                onConflict: "work_date,department_name,shift",
                ignoreDuplicates: false,
            })

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
