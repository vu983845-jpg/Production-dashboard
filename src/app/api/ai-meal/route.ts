import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { format } from "date-fns"

// Groq models theo thứ tự ưu tiên (TPD limit cao → thấp)
// llama-3.1-8b-instant: 500K TPD | gemma2-9b-it: 500K TPD | llama-3.3-70b: 100K TPD
const GROQ_MODELS = ["llama-3.1-8b-instant"]
// Gemini fallback sau khi tất cả Groq hết quota
const GEMINI_FALLBACK = "gemini-2.0-flash-lite"
const getGeminiUrl = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`


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
        const vnDateString = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
        const vnDateObj = new Date(vnDateString)
        const today = format(vnDateObj, "yyyy-MM-dd")
        const todayDisplay = format(vnDateObj, "dd/MM/yyyy")

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

QUY TẮC CA ĐẶC BIỆT (QUAN TRỌNG):
- OFFICE: CHỈ làm Ca 1. Nếu user nhập OFFICE ca 2 hoặc ca 3 → vẫn dùng shift="1" và ghi chú cảnh báo.
- FGWH (Loading/WH): Chỉ Ca 1 và OT. Nếu nhập Ca 2 hoặc Ca 3 → dùng shift="1" và ghi chú.

NGÀY:
- Nếu không nói → mặc định hôm nay ${todayDisplay}
- "hôm qua" → ngày hôm qua
- "ngày 2/4" hoặc "02/04" → dd/MM format

HEADCOUNT:
- "chính thức" = official_present
- "thời vụ" = seasonal_present
- Nếu chỉ nói 1 số (không có từ khóa OT) → coi là official_present
- "chay OT", "OT chay", "ot ăn chay", "chay tăng ca" = ot_vegetarian

QUAN TRỌNG - CÁCH TÍNH OT:
- ot_count = số phần MẶN OT (KHÔNG phải tổng)
- ot_vegetarian = số phần CHAY OT
- Tổng OT = ot_count + ot_vegetarian

PHÂN TÍCH CÁC ĐỊNH DẠNG OT:
1. "OT: X mặn (Y chay)" → ot_count=X, ot_vegetarian=Y   (X đã là mặn)
2. "OT: X p (Y chay)" hoặc "OT X (Y chay)" → ot_count=X-Y, ot_vegetarian=Y   (X là tổng, phải trừ chay)
3. "OT: X+Ychay" → ot_count=X, ot_vegetarian=Y   (tách rõ ràng)
4. "OT: X" hoặc "OT: X phần" → ot_count=X, ot_vegetarian=0   (chỉ mặn)

QUAN TRỌNG - TIN NHẮN BÁO OT RIÊNG:
Khi tin nhắn có dạng "OT X p" hoặc "@... OT X p" → báo cáo OT riêng:
- official_present = 0
- Áp dụng quy tắc phân tích OT ở trên
Ví dụ: "OT 25 p(14 chay) ăn 14h" → ot_count=11 (25-14), ot_vegetarian=14, official_present=0
Ví dụ: "OT 26p (10 chay)" → ot_count=16 (26-10), ot_vegetarian=10
Ví dụ: "@Tổ Liên (ca 2) OT 25 p(14 chay)" → shift="2", ot_count=11, ot_vegetarian=14, official_present=0
Ví dụ: "OT: 13 mặn (2 chay)" → ot_count=13, ot_vegetarian=2 (có "mặn" → X đã là mặn)
Ví dụ: "OT: 11+8chay" → ot_count=11, ot_vegetarian=8

QUAN TRỌNG - BLOCK "TRONG ĐÓ: MẶN / CHAY" (KHÔNG PHẢI OT):
Khi sau số hiện diện có block dạng:
  "Trong đó:\n- Mặn: Xp\n- Chay: Yp"
→ Đây là breakdown của official_present, KHÔNG phải OT.
→ vegetarian = Y (số chay), ot_count/ot_vegetarian = null (trừ khi có dòng OT riêng).
Ví dụ: "Chính thức hiện diện: 19\nTrong đó:\n- Mặn: 9p\n- Chay: 10p\n- OT: 0"
→ official_present=19, vegetarian=10, ot_count=0, ot_vegetarian=null

QUAN TRỌNG - OT KHÔNG CÓ SỐ:
"OT:" / "OT: " / "OT:(chay)" / "OT: (chay)" / "OT." → KHÔNG có số cụ thể → ot_count=null, ot_vegetarian=null.
TUYỆT ĐỐI không lấy số từ block "Trong đó" để điền vào OT.

QUAN TRỌNG - "ĂN Xh":
"ăn 14h", "ăn 11h30"... là giờ ăn — KHÔNG phải headcount, bỏ qua hoàn toàn.

QUAN TRỌNG - GIÁ TRỊ THIẾU CẦN ĐỂ NULL:
- NẾU DỮ LIỆU CHƯA ĐƯỢC NHẮC ĐẾN HOẶC BỊ TRỐNG (ví dụ user không nhắc gì tới OT, thời vụ, chay), thì bắt buộc trả về \`null\` cho trường đó, KHÔNG trả về \`0\`.
- CHỈ trả về \`0\` nếu user ghi rõ là \`0\` (ví dụ "OT 0", "thời vụ 0", "không OT").

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
      "seasonal_present": null,
      "official_absent": null,
      "seasonal_absent": null,
      "ot_count": null,
      "vegetarian": null,
      "ot_vegetarian": null
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

        const groqKey = process.env.GROQ_API_KEY
        const geminiKey = process.env.GEMINI_API_KEY

        if (!groqKey && !geminiKey) return NextResponse.json({ message: "❌ Thiếu GROQ_API_KEY và GEMINI_API_KEY" }, { status: 200 })

        // ── Tier 1-3: Groq cascade ────────────────────────────────────────────
        let rawText = ''
        const groqMessages = [
            { role: 'system', content: systemPrompt },
            ...(history || []).map((m: { role: string; content: string }) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
            })),
            { role: 'user', content: message },
        ]
        if (groqKey) {
            for (const model of GROQ_MODELS) {
                const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, messages: groqMessages, temperature: 0.1, max_tokens: 2048 }),
                })
                if (groqRes.ok) {
                    const groqData = await groqRes.json()
                    rawText = groqData.choices?.[0]?.message?.content ?? ''
                    break
                }
                console.warn(`[ai-meal] Groq ${model} lỗi ${groqRes.status}, trying next...`)
            }
        }

        // ── Tier 4: Gemini 3.1 Flash Lite fallback ───────────────────────────
        if (!rawText && geminiKey) {
            console.warn('[ai-meal] All Groq quota exhausted — falling back to Gemini 3.1 Flash Lite')
            const geminiContents = [
                ...(history || []).map((m: { role: string; content: string }) => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }],
                })),
                { role: 'user', parts: [{ text: message }] },
            ]
            const geminiRes = await fetch(getGeminiUrl(GEMINI_FALLBACK), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: geminiContents,
                    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
                }),
            })
            if (geminiRes.ok) {
                const geminiData = await geminiRes.json()
                rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
            } else {
                console.warn(`[ai-meal] Gemini fallback lỗi ${geminiRes.status}`)
            }
        }

        if (!rawText) {
            return NextResponse.json({ message: '❌ Tất cả AI model đang quá tải. Vui lòng thử lại sau.' }, { status: 200 })
        }

        const text = rawText

        // Extract JSON rows — handle both ```json blocks and raw JSON
        let parsedRows = null
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ||
            text.match(/```\s*([\s\S]*?)```/)
        let rawJsonStr: string | null = null

        if (jsonMatch) {
            rawJsonStr = jsonMatch[1]
        } else {
            // Gemini sometimes returns raw JSON without code fences
            const braceStart = text.indexOf('{')
            const braceEnd = text.lastIndexOf('}')
            if (braceStart !== -1 && braceEnd > braceStart) {
                rawJsonStr = text.slice(braceStart, braceEnd + 1)
            }
        }

        if (rawJsonStr) {
            try {
                const parsed = JSON.parse(rawJsonStr)
                if (parsed.rows && Array.isArray(parsed.rows)) {
                    parsedRows = parsed.rows.map((r: { dept_code: string; official_present?: number | null; seasonal_present?: number | null; ot_count?: number | null;[key: string]: unknown }) => {
                        // Auto-detect OT-only: no regular headcount but has OT
                        const isOtOnly = (r.official_present ?? 0) === 0
                            && (r.seasonal_present ?? 0) === 0
                            && (r.ot_count ?? 0) > 0
                        return {
                            ...r,
                            dept_display: DEPT_DISPLAY[r.dept_code] ?? r.dept_code,
                            dept_lookup: HPEEL_SUBCODES.has(r.dept_code) ? "HPEEL" : r.dept_code,
                            ot_only: isOtOnly,
                        }
                    })
                }
            } catch { /* ignore */ }
        }

        // Strip any json block or raw JSON from display text
        const cleanText = text
            .replace(/```json[\s\S]*?```/g, "")
            .replace(/```[\s\S]*?```/g, "")
            .replace(/\{[\s\S]*"rows"[\s\S]*\}/g, "")
            .trim()

        const displayText = cleanText || (parsedRows ? `Đã parse được ${parsedRows.length} dòng — kiểm tra bảng bên dưới.` : "Đã xử lý.")
        return NextResponse.json({ message: displayText, rows: parsedRows })


    } catch (err) {
        console.error("[ai-meal] Unhandled error:", err)
        return NextResponse.json({ message: `❌ Lỗi server: ${err instanceof Error ? err.message : String(err)}` }, { status: 200 })
    }
}
