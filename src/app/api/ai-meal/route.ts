import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { format } from "date-fns"

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview"
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Dept map - codes must match departments.code in DB
// HPEEL sub-groups use HPEEL dept_id but different department_name
const DEPT_DISPLAY: Record<string, string> = {
    SHELL: "Shelling", STEAM: "Steaming", PEEL: "Peeling",
    PEEL_MC: "Peeling MC", CS: "Color Sorter", BORMA: "Borma",
    PACK: "Packing", BOILER: "Boiler", QC: "QC",
    FGWH: "Loading/WH",
    HAND: "Manual Peeling (Li\u00ean)",   // Real dept: HANDPEELING
    HPEEL: "Hand Peeling",              // Real dept: Hand Peeling
    HPEEL_GRADING: "Manual Grading (Ms Hu\u1ec7)",
    HPEEL_DUNG: "Manual Peeling (Dung)",
    RCN: "RCN", MAINT_SHELL: "Maint Shelling",
    MAINT_HCA: "Maintenance HCA", OFFICE: "Office", CLEAN: "Cleaning",
}
// Only HPEEL_GRADING and HPEEL_DUNG are virtual sub-codes → map to HPEEL dept_id
const HPEEL_SUBCODES = new Set(["HPEEL_GRADING", "HPEEL_DUNG"])

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
        const role = profile?.role ?? ""
        if (!["admin", "hse_admin", "hr_admin"].includes(role)) {
            return NextResponse.json({ message: "⛔ Chỉ HSE/HR mới được nhập báo cơm." }, { status: 200 })
        }

        const { message, history } = await req.json()
        const today = format(new Date(), "yyyy-MM-dd")
        const todayDisplay = format(new Date(), "dd/MM/yyyy")

        const systemPrompt = `Bạn là trợ lý nhập liệu báo cơm nhà máy VICC LA.
Hôm nay là ${todayDisplay} (${today}).

NHIỆM VỤ: Parse câu hỏi của user thành danh sách headcount và trả về JSON.

CÁC BỘ PHẬN HỢP LỆ (PHẢI dùng đúng code này):
SHELL, STEAM, PEEL, PEEL_MC, CS, BORMA, PACK, BOILER, QC, FGWH,
HAND, HPEEL, HPEEL_GRADING, HPEEL_DUNG,
RCN, MAINT_SHELL, MAINT_HCA, OFFICE, CLEAN

MAPPING TÊN TIẾNG VIỆT → CODE:
- "shelling", "cắt tách", "shell" → SHELL
- "steaming", "hấp", "steam" → STEAM
- "peeling", "bóc vỏ máy", "peel" → PEEL
- "peeling mc", "peel mc" → PEEL_MC
- "color sorter", "machine grading", "CS" → CS
- "borma" → BORMA
- "packing", "đóng gói", "pack" → PACK
- "boiler", "lò hơi" → BOILER
- "qc", "kiểm tra chất lượng" → QC
- "loading", "warehouse", "kho", "fgwh" → FGWH
- "hand peeling", "hpeel", "bóc tay" → HPEEL
- "manual peeling liên", "liên", "handpeeling liên" → HAND  (real dept, không phải sub-code)
- "manual grading", "grading", "ms huệ", "huệ" → HPEEL_GRADING
- "manual peeling dung", "dung" → HPEEL_DUNG
- "rcn" → RCN
- "bảo trì shelling", "maint shelling" → MAINT_SHELL
- "bảo trì highcare", "maint HCA" → MAINT_HCA
- "office", "văn phòng", "hành chánh" → OFFICE
- "tạp vụ", "cleaning", "clean" → CLEAN

CA LÀM VIỆC:
- "Ca 1", "S1", "shift 1", "buổi sáng" → "1"
- "Ca 2", "S2", "shift 2", "buổi chiều" → "2"
- "Ca 3", "S3", "shift 3", "ca đêm" → "3"
- "hành chánh", "HC" → "1"

NGÀY:
- Nếu không nói → mặc định hôm nay ${todayDisplay}
- "hôm qua" → ngày hôm qua
- "ngày 2/4" hoặc "02/04" → dd/MM format

HEADCOUNT:
- "chính thức" = official_present
- "thời vụ" = seasonal_present
- Nếu chỉ nói 1 số → coi là official_present
- OT = ot_count, "chay" = vegetarian

OUTPUT FORMAT khi có data:
Trả lời text ngắn + JSON block:

\`\`\`json
{
  "rows": [
    {
      "date": "YYYY-MM-DD",
      "dept_code": "SHELL",
      "shift": "1",
      "official_present": 45,
      "seasonal_present": 0,
      "official_absent": 0,
      "seasonal_absent": 0,
      "ot_count": 0,
      "vegetarian": 0
    }
  ]
}
\`\`\`

Nếu không có data → chỉ trả lời text, KHÔNG có JSON block.`

        // Build contents array for multi-turn
        const contents = [
            ...(history || []).map((m: { role: string; content: string }) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
            })),
            { role: "user", parts: [{ text: message }] },
        ]

        const geminiKey = process.env.GEMINI_API_KEY
        if (!geminiKey) return NextResponse.json({ message: "❌ Thiếu GEMINI_API_KEY" }, { status: 200 })

        const geminiRes = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiKey,
            },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
            }),
        })

        if (!geminiRes.ok) {
            const errText = await geminiRes.text()
            console.error("[ai-meal] Gemini error:", errText)
            return NextResponse.json({ message: `❌ Gemini lỗi ${geminiRes.status}: ${errText.slice(0, 200)}` }, { status: 200 })
        }

        const geminiData = await geminiRes.json()
        const text: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

        // Extract JSON rows
        let parsedRows = null
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1])
                if (parsed.rows && Array.isArray(parsed.rows)) {
                    parsedRows = parsed.rows.map((r: { dept_code: string; [key: string]: unknown }) => ({
                        ...r,
                        dept_display: DEPT_DISPLAY[r.dept_code] ?? r.dept_code,
                        // Sub-groups resolve to HPEEL dept lookup code
                        dept_lookup: HPEEL_SUBCODES.has(r.dept_code) ? "HPEEL" : r.dept_code,
                    }))
                }
            } catch { /* ignore */ }
        }

        const cleanText = text.replace(/```json[\s\S]*?```/g, "").trim()
        return NextResponse.json({ message: cleanText, rows: parsedRows })

    } catch (err) {
        console.error("[ai-meal] Unhandled error:", err)
        return NextResponse.json({ message: `❌ Lỗi server: ${err instanceof Error ? err.message : String(err)}` }, { status: 200 })
    }
}
