import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { format, startOfMonth, endOfMonth, getDaysInMonth, addDays } from "date-fns"

const GEMINI_MODEL = "gemini-2.5-flash"
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// ── Dept greeting & feature map ────────────────────────────────────────────
const DEPT_CONTEXT: Record<string, { greeting: string; features: string[] }> = {
    SHELL: {
        greeting: "Xin chào bộ phận **Shelling**! 🥜",
        features: [
            "📋 Nhập kế hoạch sản xuất tháng (tổng tấn + cutoff ngày)",
            "📊 Cập nhật sản lượng thực tế hôm nay",
            "⚠️ Báo downtime (thời gian, lý do, line nào)",
            "📈 Xem tóm tắt sản xuất tháng này",
        ],
    },
    STEAM: {
        greeting: "Xin chào bộ phận **Steaming**! ♨️",
        features: [
            "📋 Nhập kế hoạch sản xuất tháng",
            "📊 Cập nhật sản lượng + WIP hôm nay",
            "⚠️ Báo downtime",
            "📈 Xem tóm tắt sản xuất",
        ],
    },
    PEEL_MC: {
        greeting: "Xin chào bộ phận **Peeling Machine**! ⚙️",
        features: [
            "📋 Nhập kế hoạch tháng",
            "📊 Cập nhật sản lượng + yield",
            "⚠️ Báo downtime máy",
            "📈 Xem hiệu suất tháng",
        ],
    },
    CS: {
        greeting: "Xin chào bộ phận **Color Sorting**! 🎨",
        features: [
            "📋 Nhập kế hoạch ISP tháng",
            "📊 Cập nhật sản lượng + ISP actual",
            "⚠️ Báo downtime",
            "📈 Xem tóm tắt",
        ],
    },
    HAND: {
        greeting: "Xin chào bộ phận **Hand Peeling**! 🤲",
        features: [
            "📋 Nhập kế hoạch tháng + ISP target",
            "📊 Cập nhật sản lượng",
            "⚠️ Báo downtime",
            "📈 Xem tóm tắt",
        ],
    },
    BORMA: {
        greeting: "Xin chào bộ phận **Borma**! 🏭",
        features: [
            "📋 Nhập kế hoạch tháng",
            "📊 Cập nhật sản lượng thực tế",
            "⚠️ Báo downtime",
        ],
    },
    PACK: {
        greeting: "Xin chào bộ phận **Packing**! 📦",
        features: [
            "📋 Nhập kế hoạch tháng (tấn + container)",
            "📊 Cập nhật sản lượng + container thực tế",
            "⚠️ Báo downtime",
            "📈 Xem tiến độ đóng gói",
        ],
    },
    FGWH: {
        greeting: "Xin chào bộ phận **Warehouse (FGWH)**! 🏗️",
        features: [
            "📋 Nhập kế hoạch ISP/Non-ISP tháng",
            "📊 Cập nhật xuất/nhập kho",
            "📈 Xem tóm tắt tháng",
        ],
    },
    admin: {
        greeting: "Xin chào **Admin**! 🛠️",
        features: [
            "📋 Nhập kế hoạch cho bất kỳ bộ phận nào",
            "📊 Cập nhật sản lượng bất kỳ bộ phận",
            "⚠️ Báo/xem downtime toàn nhà máy",
            "📈 Xem tổng quan sản xuất",
        ],
    },
}

// ── System prompt builder ───────────────────────────────────────────────────
function buildSystemPrompt(ctx: {
    deptCode: string
    deptName: string
    deptId: string
    role: string
    fullName: string
    today: string
}) {
    const deptCtx = DEPT_CONTEXT[ctx.deptCode] || DEPT_CONTEXT["admin"]
    const isAdmin = ctx.role === "admin"

    return `Bạn là trợ lý nhà máy VICC LA thông minh, thân thiện và chuyên nghiệp. Bạn nói tiếng Việt.
Người dùng hiện tại: ${ctx.fullName} | Bộ phận: ${ctx.deptName} (${ctx.deptCode}) | Vai trò: ${ctx.role}
Ngày hôm nay: ${ctx.today}
Department ID (dùng khi ghi DB): ${ctx.deptId}

## KIẾN THỨC NGHIỆP VỤ TỪNG BỘ PHẬN (QUAN TRỌNG - ĐỌC KỸ):

### SHELL (Shelling - Bóc vỏ cứng):
- Sản lượng tính bằng **TẤN** (actual_ton)
- Có input nguyên liệu (input_ton) và output thành phẩm (actual_ton)
- Theo dõi: broken (%), unpeel (%), điện tiêu thụ (kWh)
- Kế hoạch tháng: tổng sản lượng (tấn) + cutoff ngày

### STEAM (Hấp - Steaming):
- Sản lượng tính bằng **TẤN**
- Theo dõi WIP (Work In Progress): WIP đầu ca và WIP cuối ca
- Kế hoạch tháng: tổng sản lượng (tấn) + cutoff ngày

### PEEL_MC (Bóc vỏ máy - Machine Peeling):
- Sản lượng tính bằng **TẤN** (actual_ton)
- Theo dõi yield (%), broken (%)

### CS (Color Sorting - Phân màu):
- Sản lượng chính tính bằng **TẤN**
- Có thêm **ISP ton** (loại hàng đặc biệt) tính bằng tấn
- Theo dõi: ISP (%), SW (%)

### HAND (Hand Peeling - Bóc tay):
- Sản lượng tính bằng **TẤN**
- Có ISP ton tính bằng tấn
- Phụ thuộc nhân công nhiều

### BORMA:
- Sản lượng tính bằng **TẤN**

### PACK (Packing - Đóng gói xuất khẩu): ⚠️ ĐẶC BIỆT - KHÁC CÁC BỘ PHẬN KHÁC
- **KHÔNG dùng đơn vị Tấn** cho kế hoạch container
- **Container (actual_container)** tính bằng **CONT** (số lượng container xuất khẩu)
  - Ví dụ: "kế hoạch 17 cont tháng này" = plan_container = 17
  - 1 cont thường chứa khoảng 20-25 tấn hàng
- **actual_ton** là sản lượng đóng gói (tấn) - dùng khi user hỏi về sản lượng
- **plan_container** là kế hoạch container (cont) - dùng khi user hỏi về container
- ⚠️ TUYỆT ĐỐI KHÔNG hỏi "bao nhiêu tấn container" - container đếm bằng CONT không phải tấn
- Khi user nói "kế hoạch X cont": gọi update_plan với totalContainer = X (KHÔNG nhập vào totalTon)

### FGWH (Finished Goods Warehouse - Kho thành phẩm):
- Theo dõi ISP ton và Non-ISP ton (xuất nhập kho)
- Không có sản xuất, chỉ có xuất/nhập

## HƯỚNG DẪN ĐẶT CÂU HỎI ĐÚNG:
- Với PACK: "Kế hoạch tháng này bao nhiêu **cont**?" (KHÔNG hỏi tấn)
- Với các bộ phận khác: "Kế hoạch tháng này bao nhiêu **tấn**?"
- Nếu user bộ phận PACK nói nhập plan: chỉ hỏi số cont + cutoff ngày

## NHIỆM VỤ CỦA BẠN:
1. Trả lời các câu hỏi về sản xuất, kế hoạch, downtime
2. Thu thập thông tin từ user để chuẩn bị các action ghi DB
3. Khi đủ thông tin, tóm tắt lại và đặt câu hỏi xác nhận TRƯỚC khi ghi
4. QUAN TRỌNG: User chỉ được ghi dữ liệu cho bộ phận của họ (dept_id: ${ctx.deptId}${isAdmin ? " - admin có thể ghi mọi bộ phận" : ""})

## CÁC ACTION CÓ THỂ THỰC HIỆN:
- **update_plan**: Nhập kế hoạch tháng (tổng tấn hoặc cont, cutoff ngày, targets)
- **log_downtime**: Ghi downtime (ngày, thời gian phút, lý do, khu vực máy)
- **update_actual**: Cập nhật sản lượng thực tế (ngày, actual_ton, actual_container, input_ton, downtime_min)
- **get_summary**: Lấy tóm tắt sản xuất MTD

## QUY TẮC QUAN TRỌNG:
- LUÔN tóm tắt lại data trước khi ghi và hỏi "Bạn xác nhận không?"
- Khi user xác nhận, trả về JSON action trong cặp thẻ <ACTION>...</ACTION>
- Chỉ 1 action mỗi lần confirm
- Nếu thông tin chưa đủ, hỏi thêm trước khi propose action
- Giữ tone thân thiện, dùng emoji vừa phải

## FORMAT ACTION (khi user đã confirm):
<ACTION>
{
  "type": "update_plan" | "log_downtime" | "update_actual" | "get_summary",
  "params": { ... }
}
</ACTION>

### update_plan params:
{ "deptId": "${ctx.deptId}", "month": "YYYY-MM", "totalTon": number, "cutoffDay": number, "totalContainer"?: number, "targetBroken"?: number, "targetUnpeel"?: number }
- Với PACK: dùng totalContainer (số cont), totalTon để 0 nếu không có

### log_downtime params:
{ "deptId": "${ctx.deptId}", "date": "YYYY-MM-DD", "durationMins": number, "cause": string, "machineArea"?: string }

### update_actual params:
{ "deptId": "${ctx.deptId}", "date": "YYYY-MM-DD", "actualTon": number, "actualContainer"?: number, "inputTon"?: number, "downtimeMin"?: number, "note"?: string }
- Với PACK: actualContainer là số cont xuất được

### get_summary params:
{ "deptId": "${ctx.deptId}", "month": "YYYY-MM" }
`
}

// ── Supabase action handlers ─────────────────────────────────────────────────
async function handleUpdatePlan(params: any, supabase: any) {
    const { deptId, month, totalTon, cutoffDay, totalContainer, targetBroken, targetUnpeel } = params
    const monthDate = new Date(month + "-01")
    const start = startOfMonth(monthDate)
    const end = endOfMonth(monthDate)
    const daysInMonth = getDaysInMonth(monthDate)
    const effectiveCutoff = cutoffDay || daysInMonth

    const workingDays: string[] = []
    let current = start
    while (current <= end) {
        const day = current.getDate()
        if (day <= effectiveCutoff && current.getDay() !== 0) {
            workingDays.push(format(current, "yyyy-MM-dd"))
        }
        current = addDays(current, 1)
    }

    if (workingDays.length === 0) return { success: false, message: "Không có ngày làm việc nào." }

    const distributeExact = (total: number, count: number, index: number) => {
        const factor = 1000
        const curr = Math.round((total * (index + 1) / count) * factor) / factor
        const prev = Math.round((total * index / count) * factor) / factor
        return Number((curr - prev).toFixed(3))
    }

    // Fetch existing to preserve non-plan fields
    const allDays: string[] = []
    current = start
    while (current <= end) { allDays.push(format(current, "yyyy-MM-dd")); current = addDays(current, 1) }

    const { data: existing } = await supabase.from("daily_plan").select("*")
        .eq("department_id", deptId).in("work_date", allDays)
    const existingMap = new Map((existing || []).map((r: any) => [r.work_date, r]))

    const hasTon = totalTon != null && totalTon > 0
    const hasCont = totalContainer != null && totalContainer > 0

    const payload = allDays.map((dateStr, _i) => {
        const ex = (existingMap.get(dateStr) || {}) as any
        const wIdx = workingDays.indexOf(dateStr)
        const isWorking = wIdx >= 0
        return {
            department_id: deptId,
            work_date: dateStr,
            plan_ton: hasTon && isWorking ? distributeExact(totalTon, workingDays.length, wIdx) : (ex.plan_ton || 0),
            // Distribute containers evenly across working days for PACK
            plan_container: hasCont && isWorking ? distributeExact(totalContainer!, workingDays.length, wIdx) : (ex.plan_container || 0),
            plan_isp_ton: ex.plan_isp_ton || 0,
            target_broken_pct: isWorking && targetBroken != null ? targetBroken : (ex.target_broken_pct || 0),
            target_unpeel_pct: isWorking && targetUnpeel != null ? targetUnpeel : (ex.target_unpeel_pct || 0),
            target_sw_pct: ex.target_sw_pct || 0,
            target_isp_pct: ex.target_isp_pct || 0,
            target_yield_pct: ex.target_yield_pct || 0,
            target_electricity_kwh: ex.target_electricity_kwh || 0,
            updated_at: new Date().toISOString(),
        }
    })

    const { error } = await supabase.from("daily_plan").upsert(payload, { onConflict: "department_id,work_date" })
    if (error) return { success: false, message: error.message }

    const msgParts: string[] = []
    if (hasTon) msgParts.push(`**${totalTon} tấn** → ≈${(totalTon / workingDays.length).toFixed(2)} tấn/ngày`)
    if (hasCont) msgParts.push(`**${totalContainer} cont** → ≈${(totalContainer! / workingDays.length).toFixed(2)} cont/ngày`)
    return {
        success: true,
        message: `✅ Đã chia đều ${msgParts.join(' | ')} vào **${workingDays.length} ngày làm việc** của tháng ${month} (cutoff ngày ${effectiveCutoff}).`
    }
}

async function handleLogDowntime(params: any, supabase: any) {
    const { deptId, date, durationMins, cause, machineArea } = params
    const payload: any = {
        department_id: deptId,
        work_date: date,
        duration_mins: durationMins,
        cause_category: cause,
        machine_area: machineArea || null,
        notes: cause,
        created_at: new Date().toISOString(),
    }
    const { error } = await supabase.from("downtime_events").insert(payload)
    if (error) return { success: false, message: error.message }
    return {
        success: true,
        message: `✅ Đã ghi downtime **${durationMins} phút** (${cause}) vào ngày ${date}${machineArea ? ` - khu vực: ${machineArea}` : ""}.`
    }
}

async function handleUpdateActual(params: any, supabase: any) {
    const { deptId, date, actualTon, actualContainer, inputTon, downtimeMin, note } = params

    const actualPayload: any = {
        department_id: deptId,
        work_date: date,
        actual_ton: actualTon ?? 0,
        note: note || null,
        updated_at: new Date().toISOString(),
    }
    // Include actual_container for PACK dept
    if (actualContainer != null) actualPayload.actual_container = actualContainer

    const { error: e1 } = await supabase.from("daily_actual").upsert(actualPayload, { onConflict: "department_id,work_date" })
    if (e1) return { success: false, message: e1.message }

    if (inputTon != null || downtimeMin != null) {
        const kpiPayload: any = {
            department_id: deptId,
            work_date: date,
            good_output_ton: actualTon ?? 0,
            updated_at: new Date().toISOString(),
        }
        if (inputTon != null) kpiPayload.input_ton = inputTon
        if (downtimeMin != null) kpiPayload.downtime_min = downtimeMin
        await supabase.from("daily_kpi").upsert(kpiPayload, { onConflict: "department_id,work_date" })
    }

    const msgParts: string[] = []
    if (actualTon) msgParts.push(`**${actualTon} tấn**`)
    if (actualContainer != null) msgParts.push(`**${actualContainer} cont**`)
    if (inputTon) msgParts.push(`Input: ${inputTon}T`)
    if (downtimeMin) msgParts.push(`Downtime: ${downtimeMin} phút`)
    return {
        success: true,
        message: `✅ Đã cập nhật sản lượng ngày ${date}: ${msgParts.join(' | ')}.`
    }
}

async function handleGetSummary(params: any, supabase: any) {
    const { deptId, month } = params
    const monthDate = new Date(month + "-01")
    const start = format(startOfMonth(monthDate), "yyyy-MM-dd")
    const end = format(endOfMonth(monthDate), "yyyy-MM-dd")

    const { data: actuals } = await supabase.from("daily_actual").select("work_date,actual_ton,plan_ton")
        .eq("department_id", deptId).gte("work_date", start).lte("work_date", end)

    const { data: kpis } = await supabase.from("daily_kpi").select("work_date,downtime_min,input_ton,good_output_ton")
        .eq("department_id", deptId).gte("work_date", start).lte("work_date", end)

    const { data: plan } = await supabase.from("daily_plan").select("work_date,plan_ton")
        .eq("department_id", deptId).gte("work_date", start).lte("work_date", end)

    const totalActual = (actuals || []).reduce((s: number, r: any) => s + Number(r.actual_ton || 0), 0)
    const totalPlan = (plan || []).reduce((s: number, r: any) => s + Number(r.plan_ton || 0), 0)
    const totalDowntime = (kpis || []).reduce((s: number, r: any) => s + Number(r.downtime_min || 0), 0)
    const daysHaveData = (actuals || []).filter((r: any) => r.actual_ton > 0).length

    return {
        success: true,
        summaryData: { totalActual, totalPlan, totalDowntime, daysHaveData, month }
    }
}

// ── Main POST handler ────────────────────────────────────────────────────────
export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { message, history = [], userContext } = body

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 })

    const today = format(new Date(), "yyyy-MM-dd")
    const systemPrompt = buildSystemPrompt({
        deptCode: userContext.deptCode || "admin",
        deptName: userContext.deptName || "Toàn nhà máy",
        deptId: userContext.deptId || "",
        role: userContext.role || "viewer",
        fullName: userContext.fullName || user.email || "Người dùng",
        today,
    })

    // Build Gemini conversation
    const contents = [
        ...history.map((h: any) => ({
            role: h.role,
            parts: [{ text: h.text }],
        })),
        { role: "user", parts: [{ text: message }] },
    ]

    const geminiBody = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    }

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
    })

    if (!geminiRes.ok) {
        const errText = await geminiRes.text()
        return NextResponse.json({ error: `Gemini error: ${errText}` }, { status: 500 })
    }

    const geminiData = await geminiRes.json()
    const aiText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ""

    // Check for ACTION tag
    const actionMatch = aiText.match(/<ACTION>([\s\S]*?)<\/ACTION>/)
    if (actionMatch) {
        try {
            const actionJson = JSON.parse(actionMatch[1].trim())
            let result: any = { success: false, message: "Unknown action" }

            // Security check: non-admin users can only write to their own dept
            if (userContext.role !== "admin" && actionJson.params?.deptId !== userContext.deptId) {
                return NextResponse.json({
                    text: "⛔ Bạn không có quyền ghi dữ liệu cho bộ phận khác.",
                    actionResult: null,
                })
            }

            switch (actionJson.type) {
                case "update_plan": result = await handleUpdatePlan(actionJson.params, supabase); break
                case "log_downtime": result = await handleLogDowntime(actionJson.params, supabase); break
                case "update_actual": result = await handleUpdateActual(actionJson.params, supabase); break
                case "get_summary":
                    result = await handleGetSummary(actionJson.params, supabase)
                    if (result.summaryData) {
                        const s = result.summaryData
                        result.message = `📊 **Tóm tắt tháng ${s.month}:**\n- Sản lượng thực tế: **${s.totalActual.toFixed(1)} tấn** / KH: ${s.totalPlan.toFixed(1)} tấn (${s.totalPlan > 0 ? ((s.totalActual / s.totalPlan) * 100).toFixed(1) : "N/A"}%)\n- Số ngày có data: ${s.daysHaveData} ngày\n- Tổng downtime: ${s.totalDowntime} phút (${(s.totalDowntime / 60).toFixed(1)} giờ)`
                    }
                    break
            }

            // Strip <ACTION> tags from display text
            const displayText = aiText.replace(/<ACTION>[\s\S]*?<\/ACTION>/, "").trim()

            return NextResponse.json({
                text: result.message || displayText,
                actionResult: result,
                actionType: actionJson.type,
            })
        } catch (e) {
            console.error("Action parse error:", e)
        }
    }

    return NextResponse.json({ text: aiText })
}
