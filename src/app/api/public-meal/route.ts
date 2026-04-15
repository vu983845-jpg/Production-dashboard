import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SHIFT_LABEL: Record<string, string> = { "1": "Ca 1", "2": "Ca 2", "3": "Ca 3", "HC": "HC" }

async function sendTeamsNotification(rows: {
    department_name: string
    work_date: string
    shift: string
    official_present: number
    seasonal_present: number
    ot_count: number
    vegetarian: number
    ot_vegetarian: number
    note: string
}[]) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL
    if (!webhookUrl) return

    const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })

    const tableRows = rows.map(r => {
        const total = r.official_present + r.seasonal_present
        return [
            `**${r.department_name}**`,
            SHIFT_LABEL[r.shift] ?? r.shift,
            r.work_date,
            `${total} (BCT: ${r.official_present}, TV: ${r.seasonal_present})`,
            r.vegetarian > 0 ? `${r.vegetarian} chay` : "—",
            r.ot_count > 0 ? `${r.ot_count}${r.ot_vegetarian > 0 ? ` (${r.ot_vegetarian} chay)` : ""}` : "—",
            r.note || "—",
        ]
    })

    const bodyLines = tableRows.map(cols =>
        `- **${cols[0]}** | ${cols[1]} | ${cols[2]} | Tổng: ${cols[3]} | Chay: ${cols[4]} | OT: ${cols[5]} | ${cols[6]}`
    ).join("\n\n")

    const reporter = rows[0]?.note?.replace("Báo bởi: ", "") ?? "Link công khai"

    const body = {
        type: "message",
        attachments: [{
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
                $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                type: "AdaptiveCard",
                version: "1.4",
                body: [
                    {
                        type: "TextBlock",
                        text: "🍱 Báo Cơm Mới",
                        weight: "Bolder",
                        size: "Large",
                        color: "Accent",
                    },
                    {
                        type: "TextBlock",
                        text: `Người báo: **${reporter}** — ${now}`,
                        wrap: true,
                        spacing: "Small",
                        isSubtle: true,
                    },
                    {
                        type: "TextBlock",
                        text: bodyLines,
                        wrap: true,
                        spacing: "Medium",
                    },
                ],
            },
        }],
    }

    try {
        await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
    } catch {
        // Không block response nếu Teams lỗi
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const deptId   = searchParams.get("dept_id")
    const workDate = searchParams.get("work_date")
    const shift    = searchParams.get("shift")
    const deptName = searchParams.get("dept_name")

    // Fetch daily summary
    const summaryDate = searchParams.get("summary_date")
    if (summaryDate) {
        const { data, error } = await supabaseAdmin
            .from("meal_headcount")
            .select("department_name, shift, official_present, seasonal_present, official_absent, seasonal_absent, ot_count, vegetarian, ot_vegetarian, note")
            .eq("work_date", summaryDate)
            .order("department_name")
            .order("shift")
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ summary: data ?? [] })
    }

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

        // Gửi thông báo Teams (không block response)
        sendTeamsNotification(payloads).catch(() => {})

        return NextResponse.json({ success: true, count: payloads.length })
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
