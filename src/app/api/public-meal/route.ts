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

    const facts = rows.map(r => {
        const total = r.official_present + r.seasonal_present
        const parts = [
            `${SHIFT_LABEL[r.shift] ?? r.shift} ngay ${r.work_date}`,
            `Tong so suat: ${total} (Bien che: ${r.official_present}, Thoi vu: ${r.seasonal_present})`,
            r.vegetarian > 0 ? `An chay: ${r.vegetarian} suat` : null,
            r.ot_count > 0 ? `Tang ca: ${r.ot_count} suat${r.ot_vegetarian > 0 ? ` (chay: ${r.ot_vegetarian})` : ""}` : null,
        ].filter(Boolean).join(" | ")
        return { name: r.department_name, value: parts }
    })

    const body = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: "0076D7",
        summary: "Bao Com Moi",
        sections: [{
            activityTitle: "BAO COM MOI",
            activitySubtitle: `Nguoi bao: ${reporter} - ${now}`,
            facts,
        }],
    }

    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
        const text = await res.text()
        console.log("[Teams] status:", res.status, "body:", text)
    } catch (err) {
        console.error("[Teams] fetch error:", err)
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const deptId = searchParams.get("dept_id")
    const workDate = searchParams.get("work_date")
    const shift = searchParams.get("shift")
    const deptName = searchParams.get("dept_name")

    // Debug Teams webhook
    const debugTeams = searchParams.get("debug_teams")
    if (debugTeams === "1") {
        const webhookUrl = process.env.TEAMS_WEBHOOK_URL
        if (!webhookUrl) return NextResponse.json({ error: "TEAMS_WEBHOOK_URL not set" })
        try {
            const res = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    "@type": "MessageCard",
                    "@context": "http://schema.org/extensions",
                    themeColor: "FF0000",
                    summary: "Debug",
                    sections: [{ activityTitle: "DEBUG TEST", activitySubtitle: new Date().toISOString() }],
                }),
            })
            const text = await res.text()
            return NextResponse.json({ teamsStatus: res.status, teamsBody: text, urlPrefix: webhookUrl.slice(0, 50) })
        } catch (err) {
            return NextResponse.json({ error: String(err) })
        }
    }

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
            .select("ot_count, ot_vegetarian, official_present, seasonal_present, vegetarian, official_absent, seasonal_absent, department_name")
            .eq("department_id", deptId)
            .eq("work_date", workDate)
            .eq("shift", shift)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        let bestRecord = null
        if (data && data.length > 0) {
            // Fuzzy match logic:
            // 1. Try exact match
            bestRecord = data.find(r => r.department_name.toLowerCase() === deptName.toLowerCase())
            // 2. Try 'includes' match (e.g. "Dung" in "Manual peeling S1 - Dung")
            if (!bestRecord) {
                // Determine a strong keyword from deptName (e.g. supervisor name or base name)
                const keyword = deptName.toLowerCase().replace(/ca\s*\d|s\d|thời\s*vụ|-/gi, "").trim()
                const parts = keyword.split(" ").filter(Boolean)
                // Sort records by how many parts they match
                let maxMatches = 0
                for (const r of data) {
                    const dbNameLower = r.department_name.toLowerCase()
                    let matches = 0
                    for (const p of parts) if (dbNameLower.includes(p)) matches++
                    // Also if we're HPEEL, Supervisor names are critical
                    if (deptName.toLowerCase().includes("huệ") && dbNameLower.includes("huệ")) matches += 10
                    if (deptName.toLowerCase().includes("dung") && dbNameLower.includes("dung")) matches += 10
                    if (deptName.toLowerCase().includes("liên") && dbNameLower.includes("liên")) matches += 10
                    if (deptName.toLowerCase().includes("loan") && dbNameLower.includes("loan")) matches += 10

                    if (matches > maxMatches) {
                        maxMatches = matches
                        bestRecord = r
                    }
                }
                // If it's the only record for this dept + shift (e.g. QC), just use it blindly
                if (!bestRecord && data.length === 1) {
                    bestRecord = data[0]
                }
            }
        }

        return NextResponse.json({ record: bestRecord })
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
            const vnDateString = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
            const vnNow = new Date(vnDateString)
            const todayStr = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, "0")}-${String(vnNow.getDate()).padStart(2, "0")}`
            if (work_date > todayStr) {
                return NextResponse.json({ error: "Không thể báo cơm cho ngày tương lai" }, { status: 400 })
            }
            if (work_date < todayStr) {
                return NextResponse.json({ error: "Không thể chỉnh sửa báo cơm ngày đã qua. Liên hệ Ms Chi để điều chỉnh." }, { status: 400 })
            }
        }

        // Extract old_data before building payloads
        const oldDataMap = new Map<number, any>()
        rows.forEach((row, i) => { if (row.old_data) oldDataMap.set(i, row.old_data) })

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

        // Gửi thông báo Teams
        const isChange = oldDataMap.size > 0
        if (isChange) {
            await sendTeamsChangeNotification(payloads, oldDataMap)
        } else {
            await sendTeamsNotification(payloads)
        }

        return NextResponse.json({ success: true, count: payloads.length })
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}

async function sendTeamsChangeNotification(
    newRows: {
        department_name: string; work_date: string; shift: string
        official_present: number; seasonal_present: number
        ot_count: number; vegetarian: number; ot_vegetarian: number; note: string
    }[],
    oldDataMap: Map<number, any>
) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL
    if (!webhookUrl) return

    const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    const reporter = newRows[0]?.note?.replace("Báo bởi: ", "") ?? "Link công khai"

    const facts = newRows.map((r, i) => {
        const old = oldDataMap.get(i)
        const newTotal = r.official_present + r.seasonal_present
        const newOT = r.ot_count + r.ot_vegetarian

        if (old) {
            const oldTotal = (old.official_present ?? 0) + (old.seasonal_present ?? 0)
            const oldOT = (old.ot_count ?? 0) + (old.ot_vegetarian ?? 0)
            const oldVeg = old.vegetarian ?? 0
            const changes: string[] = []
            if (oldTotal !== newTotal) changes.push(`Tong suat: ${oldTotal} → ${newTotal}`)
            if (old.official_present !== r.official_present) changes.push(`BCT: ${old.official_present} → ${r.official_present}`)
            if (old.seasonal_present !== r.seasonal_present) changes.push(`TV: ${old.seasonal_present} → ${r.seasonal_present}`)
            if (oldVeg !== r.vegetarian) changes.push(`Chay: ${oldVeg} → ${r.vegetarian}`)
            if (oldOT !== newOT) changes.push(`OT: ${oldOT} → ${newOT}`)
            return {
                name: `⚠️ ${r.department_name} (${SHIFT_LABEL[r.shift] ?? r.shift})`,
                value: changes.length > 0 ? changes.join(" | ") : "Khong thay doi",
            }
        }
        return {
            name: r.department_name,
            value: `${SHIFT_LABEL[r.shift] ?? r.shift} | Tong: ${newTotal} | Chay: ${r.vegetarian} | OT: ${newOT}`,
        }
    })

    const body = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: "FF8C00",
        summary: "THAY DOI BAO COM",
        sections: [{
            activityTitle: "⚠️ THAY DOI BAO COM",
            activitySubtitle: `Nguoi thay doi: ${reporter} - ${now}`,
            facts,
        }],
    }

    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
        const text = await res.text()
        console.log("[Teams Change] status:", res.status, "body:", text)
    } catch (err) {
        console.error("[Teams Change] fetch error:", err)
    }
}
