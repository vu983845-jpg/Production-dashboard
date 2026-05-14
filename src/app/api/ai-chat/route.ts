import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { format, startOfMonth, endOfMonth, getDaysInMonth, addDays } from "date-fns"

const GEMINI_MODELS = ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash-lite", "gemini-2.5-flash"]
const getApiUrl = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

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

    return `Bạn là trợ lý nhà máy Operations thông minh, thân thiện và chuyên nghiệp. Bạn nói tiếng Việt.
Người dùng hiện tại: ${ctx.fullName} | Bộ phận: ${ctx.deptName} (${ctx.deptCode}) | Vai trò: ${ctx.role}
Ngày hôm nay: ${ctx.today}
Department ID (dùng khi ghi DB): ${ctx.deptId}

## QUY TẮC CHỐNG HỎI LẶP (ĐỌC TRƯỚC):
- BẠN CÓ LỊCH SỬ HỘI THOẠI ĐẦY ĐỦ. Trước khi hỏi bất kỳ thông tin nào, hãy kiểm tra lịch sử trước.
- Nếu user ĐÃ nêu thông tin đó rồi (ví dụ: đã nói "1200 tấn"), KHÔNG được hỏi lại "bao nhiêu tấn?".
- Khi đã thu thập đủ thông tin từ hội thoại, hãy tóm tắt ngay và đề nghị xác nhận.
- KHÔNG hỏi nhiều câu trong 1 lượt. Mỗi lượt chỉ hỏi 1 thông tin còn thiếu duy nhất.

## KIẾN THỨC NGHIỆP VỤ TỪNG BỘ PHẬN:

### SHELL (Shelling - Tách vỏ cứng):
- Sản lượng: **TẤN** (actual_ton) — output hạt điều sau tách vỏ
- Input nguyên liệu: **input_ton** (điều thô đầu vào)
- **5 line máy**: A, B, C, D1, D2 — **3 ca**: Ca 1, Ca 2, Ca 3
- Chỉ số chất lượng: **broken_pct** (% vỡ), **unpeel_pct** (% còn vỏ lụa)
- Chỉ số năng lượng: **electricity_kwh** (điện tiêu thụ kWh/ngày) — theo từng line
- OEE: tự tính từ run_hours, actual_ton, broken_pct
- Kế hoạch tháng: totalTon (tấn) + cutoffDay + targetBroken (%) + targetUnpeel (%) + targetElec (kWh)
- Khi user nói "nhập kế hoạch Shelling": hỏi lần lượt: tổng tấn → cutoff ngày → target broken? → target unpeel?

### STEAM (Hấp - Steaming):
- Sản lượng: **TẤN** (actual_ton)
- Theo dõi WIP (Work In Progress): wip_open_ton và wip_close_ton (tồn kho đầu/cuối ca)
- Downtime: duration_mins, cause, machine_area
- Kế hoạch: totalTon + cutoffDay

### PEEL_MC (Bóc vỏ lụa máy):
- Sản lượng: **TẤN** (actual_ton)
- Theo dõi: yield_pct (%), broken_pct (%)
- Kế hoạch: totalTon + cutoffDay + targetBroken + targetYield

### CS (Color Sorting - Phân loại màu): ⚠️ CÓ 2 LOẠI SẢN LƯỢNG
- Sản lượng chính: **TẤN** (actual_ton) — tổng sản lượng phân loại
- **ISP (In-Shell Product)**: actual_isp_ton tính bằng **TẤN** — đây là loại hàng đặc biệt cao cấp
  - ISP ≠ tấn thông thường — là 1 phân loại riêng trong tổng sản lượng
  - Kế hoạch ISP: targetIsp (tấn tuyệt đối, không phải %)
- Chỉ số: isp_pct (% ISP/tổng), sw_pct (% SW)
- Khi user nói "ISP là X tấn" → đó là target_isp_ton, KHÔNG phải total actual_ton
- Kế hoạch: totalTon + cutoffDay + totalIsp (tấn ISP riêng) + targetSw (%)

### HAND (Hand Peeling - Bóc tay):
- Sản lượng: **TẤN** (actual_ton)
- **ISP ton**: actual_isp_ton (tấn) — tương tự CS, là hàng ISP riêng biệt
- Kế hoạch: totalTon + cutoffDay + totalIsp (tấn)
- Chỉ số: broken_pct, unpeel_pct, isp_pct

### BORMA:
- Sản lượng: **TẤN** (actual_ton)
- Kế hoạch: totalTon + cutoffDay + targetBroken + targetYield

### PACK (Packing - Đóng hàng xuất khẩu): ⚠️ ĐẶC BIỆT
- **Container (plan_container, actual_container)**: đơn vị **CONT** — đây là số container xuất hàng
  - 1 container ≈ 20-25 tấn hàng
  - KHÔNG nhầm lẫn container với tấn
  - Khi user nói "17 cont" → totalContainer = 17, KHÔNG phải totalTon
- Cũng có actual_ton (tổng tấn đóng gói) nhưng KPI chính là số cont
- ⚠️ Khi hỏi kế hoạch PACK: "Kế hoạch bao nhiêu **cont**?" (KHÔNG hỏi tấn)
- Kế hoạch: totalContainer (cont) + cutoffDay; totalTon để 0 nếu không có

### FGWH (Kho thành phẩm):
- Theo dõi: plan_isp_ton (ISP đầu vào) và plan_non_isp_ton (Non-ISP đầu vào)
- Không sản xuất, chỉ quản lý xuất/nhập kho

## NHIỆM VỤ:
1. Thu thập thông tin từ user (kiểm tra lịch sử hội thoại trước khi hỏi)
2. Khi đủ thông tin, tóm tắt và hỏi xác nhận 1 lần
3. Sau xác nhận, xuất ACTION để ghi DB
4. User chỉ được GHI data bộ phận của họ (dept_id: ${ctx.deptId}${isAdmin ? " — admin có thể ghi mọi bộ phận" : ""})
5. User có thể ĐỌC/XEM data của tất cả bộ phận và thông tin điện/nước toàn nhà máy

## ACTIONS:
- **update_plan**: Kế hoạch tháng (tổng tấn/cont, cutoff, targets)
- **log_downtime**: Ghi downtime (ngày, phút, lý do, khu vực)
- **update_actual**: Sản lượng thực tế ngày (actual_ton, actual_container, input_ton, downtime_min)
- **get_summary**: Tóm tắt sản xuất MTD của 1 bộ phận
- **get_all_production**: Xem sản lượng tất cả bộ phận trong 1 ngày hoặc tháng
- **get_energy_data**: Xem điện, nước, máy nén khí toàn nhà máy

## KHI NÀO DÙNG get_energy_data (QUAN TRỌNG):
Dùng ngay khi user hỏi BẤT KỲ trong các từ khóa này (KHÔNG cần hỏi thêm, xuất ACTION ngay):
- "điện", "kWh", "điện năng", "tiêu thụ điện", "điện tháng", "điện hôm nay", "điện ngày"
- "nước", "m3", "m³", "nước sinh hoạt", "nước tháng", "nước hôm nay"
- "máy nén khí", "MNK", "compressor"
- "năng lượng", "energy"
- Ví dụ: "điện nước tháng 3?" → xuất ACTION get_energy_data với month="2026-03"
- Ví dụ: "hôm nay dùng bao nhiêu kWh?" → xuất ACTION get_energy_data với date="${ctx.today}"
- Ví dụ: "tháng này điện bao nhiêu?" → xuất ACTION get_energy_data với month="${ctx.today.slice(0,7)}"

## KHI NÀO DÙNG get_all_production (QUAN TRỌNG):
Dùng ngay khi user hỏi sản lượng nhiều bộ phận hoặc toàn nhà máy (KHÔNG cần hỏi thêm):
- "hôm nay các bộ phận làm được bao nhiêu?" → date="${ctx.today}"
- "sản lượng toàn nhà máy tháng này?" → month="${ctx.today.slice(0,7)}"
- "SHELL hôm nay bao nhiêu?", "STEAM tháng 3?" → get_all_production rồi lọc
- "tổng hợp sản xuất", "overview sản lượng"

## QUY TẮC CONFIRM:
- LUÔN tóm tắt toàn bộ data trước khi GHI: "📋 Tôi sẽ lưu: [liệt kê đầy đủ]. Xác nhận?"
- Sau khi user bấm xác nhận → xuất JSON trong thẻ <ACTION>...</ACTION>
- Không hỏi lại sau khi user đã confirm
- Với các action ĐỌC (get_all_production, get_energy_data, get_summary): KHÔNG cần hỏi xác nhận, KHÔNG cần giải thích, xuất ACTION NGAY

## FORMAT ACTION:
<ACTION>
{
  "type": "update_plan" | "log_downtime" | "update_actual" | "get_summary" | "get_all_production" | "get_energy_data",
  "params": { ... }
}
</ACTION>

### update_plan params:
{ "deptId": "${ctx.deptId}", "month": "YYYY-MM", "totalTon": number, "cutoffDay": number, "totalContainer"?: number, "targetBroken"?: number, "targetUnpeel"?: number, "targetYield"?: number, "targetIsp"?: number, "targetSw"?: number }

### log_downtime params:
{ "deptId": "${ctx.deptId}", "date": "YYYY-MM-DD", "durationMins": number, "cause": string, "machineArea"?: string }

### update_actual params:
{ "deptId": "${ctx.deptId}", "date": "YYYY-MM-DD", "actualTon": number, "actualContainer"?: number, "inputTon"?: number, "ispTon"?: number, "downtimeMin"?: number, "note"?: string }

### get_summary params:
{ "deptId": "${ctx.deptId}", "month": "YYYY-MM" }

### get_all_production params:
{ "date"?: "YYYY-MM-DD", "month"?: "YYYY-MM" }  — dùng date để xem 1 ngày, month để xem cả tháng

### get_energy_data params:
{ "date"?: "YYYY-MM-DD", "month"?: "YYYY-MM" }  — trả về điện, nước, máy nén khí
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

async function handleGetAllProduction(params: any, supabase: any) {
    const { date, month } = params
    const { data: depts } = await supabase.from("departments").select("id,name_vi,code").order("code")

    let start: string, end: string
    if (date) {
        start = date; end = date
    } else if (month) {
        const md = new Date(month + "-01")
        start = format(startOfMonth(md), "yyyy-MM-dd")
        end = format(endOfMonth(md), "yyyy-MM-dd")
    } else {
        const today = format(new Date(), "yyyy-MM-dd")
        start = today; end = today
    }

    const { data: actuals } = await supabase.from("daily_actual")
        .select("department_id,work_date,actual_ton,actual_container")
        .gte("work_date", start).lte("work_date", end)

    const { data: plans } = await supabase.from("daily_plan")
        .select("department_id,work_date,plan_ton,plan_container")
        .gte("work_date", start).lte("work_date", end)

    const { data: downtime } = await supabase.from("downtime_events")
        .select("department_id,work_date,duration_mins")
        .gte("work_date", start).lte("work_date", end)

    const deptMap = new Map((depts || []).map((d: any) => [d.id, d]))

    // Aggregate per dept
    const aggActual = new Map<string, number>()
    const aggContainer = new Map<string, number>()
    const aggPlan = new Map<string, number>()
    const aggDowntime = new Map<string, number>()
    ;(actuals || []).forEach((r: any) => {
        aggActual.set(r.department_id, (aggActual.get(r.department_id) || 0) + Number(r.actual_ton || 0))
        aggContainer.set(r.department_id, (aggContainer.get(r.department_id) || 0) + Number(r.actual_container || 0))
    })
    ;(plans || []).forEach((r: any) => {
        aggPlan.set(r.department_id, (aggPlan.get(r.department_id) || 0) + Number(r.plan_ton || 0))
    })
    ;(downtime || []).forEach((r: any) => {
        aggDowntime.set(r.department_id, (aggDowntime.get(r.department_id) || 0) + Number(r.duration_mins || 0))
    })

    const rows = (depts || []).map((d: any) => ({
        dept: `${d.code} - ${d.name_vi}`,
        planTon: Number((aggPlan.get(d.id) || 0).toFixed(1)),
        actualTon: Number((aggActual.get(d.id) || 0).toFixed(1)),
        actualContainer: aggContainer.get(d.id) || 0,
        downtimeMin: aggDowntime.get(d.id) || 0,
        pct: aggPlan.get(d.id) ? ((aggActual.get(d.id) || 0) / aggPlan.get(d.id)! * 100).toFixed(1) + "%" : "N/A",
    }))

    const label = date ? `ngày ${date}` : `tháng ${month}`
    let text = `📊 **Sản lượng toàn nhà máy — ${label}:**\n\n`
    rows.forEach((r: { dept: string; planTon: number; actualTon: number; actualContainer: number; downtimeMin: number; pct: string }) => {
        const contInfo = r.actualContainer > 0 ? ` | ${r.actualContainer} cont` : ""
        const dtInfo = r.downtimeMin > 0 ? ` | DT: ${r.downtimeMin}p` : ""
        text += `• **${r.dept}**: ${r.actualTon}T / KH ${r.planTon}T (${r.pct})${contInfo}${dtInfo}\n`
    })

    return { success: true, message: text }
}

async function handleGetEnergyData(params: any, supabase: any) {
    const { date, month } = params
    let start: string, end: string
    if (date) {
        start = date; end = date
    } else if (month) {
        const md = new Date(month + "-01")
        start = format(startOfMonth(md), "yyyy-MM-dd")
        end = format(endOfMonth(md), "yyyy-MM-dd")
    } else {
        const today = format(new Date(), "yyyy-MM-dd")
        start = today; end = today
    }

    const [{ data: energy }, { data: compressors }] = await Promise.all([
        supabase.from("daily_energy")
            .select("work_date,electricity_kwh,electricity_peak_kwh,electricity_normal_kwh,electricity_offpeak_kwh,water_m3")
            .gte("work_date", start).lte("work_date", end).order("work_date"),
        supabase.from("daily_compressor")
            .select("work_date,meter1,meter2,meter3")
            .gte("work_date", start).lte("work_date", end).order("work_date"),
    ])

    // Tổng điện: ưu tiên peak+normal+offpeak, fallback electricity_kwh
    const totalElec = (energy || []).reduce((s: number, r: any) => {
        const stacked = Number(r.electricity_peak_kwh || 0) + Number(r.electricity_normal_kwh || 0) + Number(r.electricity_offpeak_kwh || 0)
        return s + (stacked > 0 ? stacked : Number(r.electricity_kwh || 0))
    }, 0)
    const totalWater = (energy || []).reduce((s: number, r: any) => s + Number(r.water_m3 || 0), 0)

    // Máy nén khí: cộng delta (meter index - index ngày hôm trước)
    let totalCompressKwh = 0
    if (compressors && compressors.length > 1) {
        for (let i = 1; i < compressors.length; i++) {
            const prev = compressors[i - 1], curr = compressors[i]
            totalCompressKwh += Math.max(0, Number(curr.meter1 || 0) - Number(prev.meter1 || 0)) * 1000
            totalCompressKwh += Math.max(0, Number(curr.meter2 || 0) - Number(prev.meter2 || 0)) * 1000
            totalCompressKwh += Math.max(0, Number(curr.meter3 || 0) - Number(prev.meter3 || 0)) * 1000
        }
    }

    const label = date ? `ngày ${date}` : `tháng ${month}`
    let text = `⚡ **Điện - Nước - Máy nén khí — ${label}:**\n\n`
    text += `⚡ Tổng điện tiêu thụ: **${Math.round(totalElec).toLocaleString("vi-VN")} kWh**\n`
    text += `💧 Tổng nước tiêu thụ: **${totalWater.toFixed(1)} m³**\n`
    text += `🌬️ Máy nén khí (ước tính): **${Math.round(totalCompressKwh).toLocaleString("vi-VN")} kWh**\n`

    // Chi tiết nếu hỏi theo ngày
    if (date && energy && energy.length > 0) {
        const r = energy[0]
        const peak = Number(r.electricity_peak_kwh || 0)
        const normal = Number(r.electricity_normal_kwh || 0)
        const offpeak = Number(r.electricity_offpeak_kwh || 0)
        if (peak + normal + offpeak > 0) {
            text += `\n📋 Chi tiết giờ điện:\n`
            text += `  • Cao điểm: ${Math.round(peak).toLocaleString("vi-VN")} kWh\n`
            text += `  • Bình thường: ${Math.round(normal).toLocaleString("vi-VN")} kWh\n`
            text += `  • Thấp điểm: ${Math.round(offpeak).toLocaleString("vi-VN")} kWh\n`
        }
    }

    return { success: true, message: text }
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

    let geminiRes: Response | null = null;
    for (const model of GEMINI_MODELS) {
        let attempt = 0;
        while (attempt <= 2) {
            geminiRes = await fetch(`${getApiUrl(model)}?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(geminiBody),
            })
            if (geminiRes.ok) break;
            if (geminiRes.status === 429 || geminiRes.status >= 500) {
                attempt++;
                if (attempt <= 2) {
                    await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
                    continue;
                }
                console.warn(`[ai-chat] ${model} failed (${geminiRes.status}), trying next...`);
                break;
            }
            break;
        }
        if (geminiRes?.ok) break;
    }

    if (!geminiRes || !geminiRes.ok) {
        const errText = geminiRes ? await geminiRes.text() : 'All models failed'
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

            // READ actions: allow all users (no dept restriction)
            const readActions = ["get_all_production", "get_energy_data", "get_summary"]
            const isReadAction = readActions.includes(actionJson.type)

            // Security check: non-admin users can only WRITE to their own dept
            if (!isReadAction && userContext.role !== "admin" && actionJson.params?.deptId !== userContext.deptId) {
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
                case "get_all_production": result = await handleGetAllProduction(actionJson.params, supabase); break
                case "get_energy_data": result = await handleGetEnergyData(actionJson.params, supabase); break
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
