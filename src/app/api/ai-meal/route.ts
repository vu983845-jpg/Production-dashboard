import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { format } from "date-fns"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Dept map (subset – AI returns code, we resolve to display name)
const DEPT_DISPLAY: Record<string, string> = {
    PEEL: "Peeling", CS: "Machine Grading", STEAM: "Steaming",
    PACK: "Packing", BORMA: "Borma", SHELL: "Shelling",
    BOILER: "Boiler", QC: "QC", FGWH: "Loading/WH",
    HPEEL: "Hand Peeling", HPEEL_GRADING: "Manual Grading (Ms Huệ)",
    HPEEL_LIEN: "Manual Peeling (Liên)", HPEEL_DUNG: "Manual Peeling (Dung)",
    MAINT_SHELL: "Maintenance Shelling", MAINT_HCA: "Maintenance HCA",
    OFFICE: "Office", CLEAN: "Cleaning",
}

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    const role = profile?.role ?? ""
    if (!["admin", "hse_admin", "hr_admin"].includes(role)) {
        return NextResponse.json({ error: "Chỉ HSE/HR mới được nhập báo cơm" }, { status: 403 })
    }

    const { message, history } = await req.json()
    const today = format(new Date(), "yyyy-MM-dd")
    const todayDisplay = format(new Date(), "dd/MM/yyyy")

    const systemPrompt = `Bạn là trợ lý nhập liệu báo cơm nhà máy VICC LA.
Hôm nay là ${todayDisplay} (${today}).

NHIỆM VỤ: Parse câu hỏi của user thành danh sách headcount và trả về JSON.

CÁC BỘ PHẬN HỢP LỆ (dùng code này):
PEEL, CS, STEAM, PACK, BORMA, SHELL, BOILER, QC, FGWH, HPEEL, HPEEL_GRADING, HPEEL_LIEN, HPEEL_DUNG, MAINT_SHELL, MAINT_HCA, OFFICE, CLEAN

MAPPING TÊN TIẾNG VIỆT → CODE:
- "peeling", "bóc vỏ máy" → PEEL
- "color sorter", "machine grading", "CS" → CS  
- "steaming", "hấp", "steam" → STEAM
- "packing", "đóng gói", "pack" → PACK
- "shelling", "cắt tách", "shell" → SHELL
- "borma" → BORMA
- "boiler", "lò hơi" → BOILER
- "qc", "kiểm tra chất lượng" → QC
- "loading", "warehouse", "kho", "fgwh" → FGWH
- "hand peeling", "bóc tay", "hpeel" → HPEEL
- "grading", "ms Huệ" → HPEEL_GRADING
- "liên" → HPEEL_LIEN
- "dung" → HPEEL_DUNG
- "bảo trì shelling", "maint shelling" → MAINT_SHELL
- "bảo trì highcare", "maint HCA", "bảo trì HCA" → MAINT_HCA
- "office", "văn phòng" → OFFICE
- "tạp vụ", "cleaning" → CLEAN

CA LÀM VIỆC:
- "Ca 1", "S1", "shift 1", "buổi sáng" → "1"
- "Ca 2", "S2", "shift 2", "buổi chiều" → "2"
- "Ca 3", "S3", "shift 3", "ca đêm" → "3"
- "hành chánh", "HC", "văn phòng" → "1" (mặc định Ca 1)

NGÀY: 
- Nếu user không nói → mặc định hôm nay ${todayDisplay}
- "hôm qua" → ngày hôm qua
- "ngày 2/4" hoặc "02/04" → hiểu dd/MM format

HEADCOUNT:
- "chính thức" = official_present
- "thời vụ" = seasonal_present
- Nếu chỉ nói 1 số → coi là official_present
- OT = ot_count
- "chay" = vegetarian

TRƯỜNG HỢP USER HỎI (KHÔNG NHẬP): 
Nếu user hỏi câu hỏi thay vì nhập số liệu → trả lời bình thường bằng text, không cần JSON.

OUTPUT FORMAT khi có data cần parse:
Trả lời bằng text ngắn (1-2 câu xác nhận) VÀ JSON block như sau:

\`\`\`json
{
  "rows": [
    {
      "date": "YYYY-MM-DD",
      "dept_code": "SHELL",
      "dept_display": "Shelling", 
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

Nếu không có data hoặc không hiểu → chỉ trả lời text, KHÔNG có JSON block.`

    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-lite",
        systemInstruction: systemPrompt,
    })

    // Build history for multi-turn
    const chatHistory = (history || []).map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
    }))

    const chat = model.startChat({ history: chatHistory })
    const result = await chat.sendMessage(message)
    const text = result.response.text()

    // Try to extract JSON rows from response
    let parsedRows = null
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1])
            if (parsed.rows && Array.isArray(parsed.rows)) {
                parsedRows = parsed.rows.map((r: any) => ({
                    ...r,
                    dept_display: DEPT_DISPLAY[r.dept_code] ?? r.dept_code,
                }))
            }
        } catch { /* ignore parse errors */ }
    }

    // Clean text (remove JSON block for display)
    const cleanText = text.replace(/```json[\s\S]*?```/g, "").trim()

    return NextResponse.json({ message: cleanText, rows: parsedRows })
}
