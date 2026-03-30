import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// llama-3.1-8b-instant: 20,000 TPM free tier (cao hơn 70b-versatile)
const MODEL = 'llama-3.1-8b-instant'

// System prompt v3 (Claude-generated, Excel-row-mapped output)
// Output format: [{day, section, value}] maps directly to Excel template rows
const BASE_SYSTEM_PROMPT = `You are a Vietnamese factory meal reporting parser. Your task is to extract attendance and meal data from Zalo messages sent by shift supervisors at a cashew processing factory.

## OUTPUT FORMAT
Return a JSON array. Each element represents one data point to fill into Excel:
{"day":number,"section":"EXACT_EXCEL_ROW_NAME","value":number}

## SECTION MAPPING (Zalo message → Excel row name)

### Loading / Warehouse / FGWH / RCN:
Ca 1 → "Loading S1" | Ca 2 → "Loading S2" | Ca 3 → "Loading S3" | OT → "OT"

### Steaming / Hấp:
Ca 1 → "Steaming S1" | Ca 2 → "Steaming S2" | Ca 3 → "Steaming S3" | OT → "OT"

### Shelling / Máy cắt:
Ca 1 chính thức → "Shelling S1" | Ca 1 thời vụ → "Shelling thời vụ S1"
Ca 2 chính thức → "Shelling S2" | Ca 2 thời vụ → "Shelling thời vụ S2"
Ca 3 chính thức → "Shelling S3" | Ca 3 thời vụ → "Shelling thời vụ S3"
OT → "OT"

### Maintenance shelling / Bảo trì máy cắt:
Ca 1 → "Maintenance shelling S1" | Ca 2 → "Maintenance shelling S2" | Ca 3 → "Maintenance shelling S3" | OT → "OT"

### Borma:
Ca 1 chính thức → "Borma S1" | Ca 1 thời vụ → "Borma thời vụ S1"
Ca 2 chính thức → "Borma S2" | Ca 2 thời vụ → "Borma thời vụ S2"
Ca 3 chính thức → "Borma S3" | Ca 3 thời vụ → "Borma thời vụ S3"
OT → "OT"

### Peeling MC / Peeling:
Ca 1 chính thức → "Peeling S1" | Ca 1 thời vụ → "Peeling thời vụ S1"
Ca 2 chính thức → "Peeling S2" | Ca 2 thời vụ → "Peeling thời vụ S2"
Ca 3 chính thức → "Peeling S3" | Ca 3 thời vụ → "Peeling thời vụ S3"
OT → "OT"

### Color Sorter / Machine Grading:
Ca 1 chính thức → "Machine Grading - shift 1" | Ca 1 thời vụ → "Machine Grading  - thời vụ 1"
Ca 2 chính thức → "Machine Grading  - shift 2" | Ca 2 thời vụ → "Machine Grading  thời vụ - shift 2"
Ca 3 chính thức → "Machine Grading  - shift 3" | Ca 3 thời vụ → "Machine Grading  thời vụ- shift 3"
OT → "OT"

### Grading / Manual Grading (Ms Huệ):
Ca 1 → "Manual Grading -Shift 1 (Ms Huệ)" | Ca 1 thời vụ → "Manual Grading Thời vụ -Shift 1 (Ms Huệ)"
Ca 2 → "Manual Grading -Shift 2 (Ms Huệ)" | Ca 2 thời vụ → "Manual Grading Thời vụ -Shift 2 (Ms Huệ)"
Ca 3 → "Manual Grading -Shift 3 (Ms Huệ)" | Ca 3 thời vụ → "Manual Grading Thời vụ -Shift 3 (Ms Huệ)"
OT → "OT"

### Hand Peeling / Manual peeling — TỔ DUNG:
Ca 1 → "Manual peeling S1 - Dung" | Ca 1 thời vụ → "Manual peeling S1 thời vụ - Dung"
Ca 2 → "Manual peeling S2 - Dung" | Ca 2 thời vụ → "Manual peeling S2 thời vụ - Dung"
Ca 3 → "Manual peeling S3 - Dung" | Ca 3 thời vụ → "Manual peeling S3 thời vụ - Dung"

### Hand Peeling / Manual peeling — TỔ LIÊN:
Ca 1 → "Manual peeling S1 - Liên" | Ca 1 thời vụ → "Manual peeling S1 thời vụ - Liên"
Ca 2 → "Manual peeling S2 - Liên" | Ca 2 thời vụ → "Manual peeling S2 thời vụ - Liên"
Ca 3 → "Manual peeling S3 - Liên" | Ca 3 thời vụ → "Manual peeling S3 thời vụ - Liên"
OT (cả 2 tổ) → "OT"

### Packing / Đóng gói:
Ca 1 chính thức → "Packing S1" | Ca 1 thời vụ → "Packing thời vụ S1"
Ca 2 chính thức → "Packing S2" | Ca 2 thời vụ → "Packing thời vụ S2"
Ca 3 chính thức → "Packing S3" | OT → "Packing OT"

### Boiler / Lò hơi:
Ca 1 → "Boiler worker S1" | Ca 2 → "Boiler worker S2" | Ca 3 → "Boiler worker S3" | OT → "Boiler OT"

### Maintenance / Bảo trì highcare / Bảo trì HCA:
Ca 1 → "Maintenance S1" | Ca 2 → "Maintenance S2" | Ca 3 → "Maintenance S3" | OT → "Maintenance OT"

### Cleaning / Tập vụ / Tạp vụ:
Ca 1 → "Cleaning worker" | Ca 2 → "Cleaning worker S2" | Ca 3 → "Cleaning worker S3" | OT → "OT"

### QC / Quality:
Ca 1 → "QC" | Ca 2 → "QC S2" | Ca 3 → "QC S3" | OT → "QC OT"

### Office / VP:
Ca 1 → "Office 1" | Ca 2 → "Office 2" | Ca 3 → "Office 3"

## PARSING RULES

### Date → day: extract only the day number (1-31)
- "26/3/2026" → day=26 | "26.3.2026" → day=26

### Số người:
- "19(6p chay)" → value=19 | "11+10chay" → value=21 | "23+19chay =42" → value=42 | "10p" → value=10

### Ca gộp "Ca: 1.2.3": tạo 3 records riêng (S1, S2, S3) với cùng value

### OT: "OT: 5" → value=5 | "OT: 3+2" → value=5 | "OT: 12p(9chay)" → value=12 | "OT:" hoặc "OT:0" → KHÔNG tạo record

### IGNORE: dòng "Dự trù", thực đơn, @mention không có số liệu

## FEW-SHOT EXAMPLES

Example 1 – BOILER Ca 1.2.3:
INPUT: 26.3.2026\nKhu vực : Boiler\nCa: 1.2.3\nChính thức hiện diện: 3\nOT:
OUTPUT: [{"day":26,"section":"Boiler worker S1","value":3},{"day":26,"section":"Boiler worker S2","value":3},{"day":26,"section":"Boiler worker S3","value":3}]

Example 2 – SHELLING với thời vụ và OT:
INPUT: Date:26/03/2026\nKhu vực: Shelling\nCa: 1\nChính thức hiện diện:19(6p chay)\nThời vụ hiện diện: 3\nOT: 5
OUTPUT: [{"day":26,"section":"Shelling S1","value":19},{"day":26,"section":"Shelling thời vụ S1","value":3},{"day":26,"section":"OT","value":5}]

Example 3 – COLOR SORTER X+Ychay:
INPUT: Date:26/03/2026\nKhu vực:Color sorter\nCa: 1\nChính thức hiện diện: 11+10chay\nOt: 11+10chay
OUTPUT: [{"day":26,"section":"Machine Grading - shift 1","value":21},{"day":26,"section":"OT","value":21}]

Example 4 – QC nhiều ca:
INPUT: 26/03/2026\nBộ phận: QC\nCa1: 11 (2 chay) OT: 7\nCa2: 2\nCa3: 8 (1 chay) OT: 7
OUTPUT: [{"day":26,"section":"QC","value":11},{"day":26,"section":"QC OT","value":7},{"day":26,"section":"QC S2","value":2},{"day":26,"section":"QC S3","value":8},{"day":26,"section":"QC OT","value":7}]

Example 5 – MAINTENANCE HIGHCARE nhiều ca + OT giờ:
INPUT: Date 26/03/2026\nKhu vực bảo trì highcare\nCa 1 và HC\nChính thức 11\nCa 2\nChính thức 2\nCa 3\nChính thức 2\nOT: 4 phần lúc 14h
OUTPUT: [{"day":26,"section":"Maintenance S1","value":11},{"day":26,"section":"Maintenance S2","value":2},{"day":26,"section":"Maintenance S3","value":2},{"day":26,"section":"Maintenance OT","value":4}]

Example 6 – HANDPEELING tổ Dung:
INPUT: Dung. Date 26/03/2026\nKhu vực: Handpeeling (Dung),\nCa: 2\nChính thức hiện diện: 65( 46chay)\nOT.
OUTPUT: [{"day":26,"section":"Manual peeling S2 - Dung","value":65}]

Example 7 – HANDPEELING tổ Liên:
INPUT: Liên. Date 26/03/2026\nKhu vực: Handpeeling (Liên),\nCa: 3\nChính thức hiện diện: 58( 44chay)\nOT. p ( chay ) ăn luc 14h
OUTPUT: [{"day":26,"section":"Manual peeling S3 - Liên","value":58}]

Example 8 – PACKING với OT:
INPUT: Date: 26/03/2026\nKhu vực : Packing\nCa: 1\nChính thức hiện diện:13(9chay)\nThời vụ hiện diện: 0\nOT: 12p(9chay)
OUTPUT: [{"day":26,"section":"Packing S1","value":13},{"day":26,"section":"Packing OT","value":12}]

Example 9 – GRADING typo + X+Ychay=Z:
INPUT: Deate: 26/3/2026\nKhu vực: gradinCa: 1\nChính thuc hiện diên:23+19chay =42\nOT:+chay = ăn lúc 14h
OUTPUT: [{"day":26,"section":"Manual Grading -Shift 1 (Ms Huệ)","value":42}]

Example 10 – WAREHOUSE suffix p:
INPUT: Date: 26/03/2026\nKhu vực : warehouse\nCa: 1\nChính thức hiện diện: 10p\nOT:
OUTPUT: [{"day":26,"section":"Loading S1","value":10}]

Example 11 – STEAMING:
INPUT: Date:26/03/2026\nKhu vực : steaming\nCa: 2\nChính thức hiện diện: 4\nOT:0
OUTPUT: [{"day":26,"section":"Steaming S2","value":4}]

Example 12 – PEELING MC:
INPUT: Date:27/3/2026\nKhu vực : Peeling mc\nCa : 3\nChính thức hiện diện: 8( 5 chay)\nOT:
OUTPUT: [{"day":27,"section":"Peeling S3","value":8}]

Example 13 – MAINTENANCE SHELLING:
INPUT: Date:26/03/2026\nKhu vực : Bảo trì máy cắt\nCa: 1 + H/C\nChính thức hiện diện:6 (3 phần chay)
OUTPUT: [{"day":26,"section":"Maintenance shelling S1","value":6}]

Example 14 – TẬP VỤ:
INPUT: Date:26/03/2026\nKhu vực : tập vụ\nCa: 1:8(5chay)0T\nca:2:1(1cha)0T
OUTPUT: [{"day":26,"section":"Cleaning worker","value":8},{"day":26,"section":"Cleaning worker S2","value":1}]

Example 15 – BORMA OT với giờ:
INPUT: Date:26/03/2026\nKhu vực : borma\nCa: 2\nChính thức hiện diện: 3\nOT:3 /18h
OUTPUT: [{"day":26,"section":"Borma S2","value":3},{"day":26,"section":"OT","value":3}]

Example 16 – OT bổ sung (tin nhắn riêng):
INPUT: Shelling OT 5p(2 chay) ăn 14h nha e
OUTPUT: [{"day":null,"section":"OT","value":5}]

Example 17 – Ignore Dự trù:
INPUT: Dự trù ngày :27/3/2026\n- Bộ phận : Shelling\n- Ca : 1
OUTPUT: []

Parse the input and return ONLY a valid JSON array. No explanation, no markdown, no extra text.
If only "Dự trù" information → return [].`


// Lọc bỏ các dòng không liên quan để tiết kiệm token
function preFilterText(text: string): string {
    const lines = text.split('\n')
    const relevant: string[] = []
    const mealKeywords = /ca|khu vực|chính thức|thời vụ|hiện diện|vắng|ot|chay|boiler|shelling|packing|peeling|borma|grading|loading|steam|maint|qc|office|ngày|date|\d{1,2}[./]\d{1,2}/i
    const timeOnly = /^\s*\d{1,2}:\d{2}\s*$/
    let lastWasBlank = false
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
            if (!lastWasBlank) relevant.push('')
            lastWasBlank = true
            continue
        }
        lastWasBlank = false
        if (timeOnly.test(trimmed)) continue
        if (mealKeywords.test(trimmed) || /\d+/.test(trimmed)) {
            relevant.push(line)
        }
    }
    return relevant.join('\n').trim()
}

// Load training examples từ Supabase và build few-shot section
async function buildFewShotSection(): Promise<string> {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!supabaseUrl || !supabaseKey) return ''

        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data, error } = await supabase
            .from('meal_ai_examples')
            .select('title, input_text, expected_json')
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(10) // Giới hạn 10 ví dụ để không vượt token

        if (error || !data || data.length === 0) return ''

        const examples = data.map((ex, i) =>
            `EXAMPLE ${i + 1} – ${ex.title}:\nINPUT:\n${ex.input_text}\nOUTPUT: ${JSON.stringify(ex.expected_json)}`
        ).join('\n\n')

        return `\n\nFEW-SHOT EXAMPLES (learn these patterns):\n${examples}\n\nNow parse the following input using same logic:`
    } catch {
        return '' // Nếu lỗi đọc DB → bỏ qua, dùng prompt gốc
    }
}

// POST handler
export async function POST(req: NextRequest) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
        return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })
    }

    let body: { text?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

    const rawInput = body.text?.trim()
    if (!rawInput) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

    // Bước 1: lọc trước để bỏ dòng không cần thiết
    let filtered = preFilterText(rawInput)

    // Bước 2: hard cap 6000 ký tự để nhường chỗ cho few-shot examples
    const MAX_CHARS = 6000
    const truncated = filtered.length > MAX_CHARS
    if (truncated) {
        filtered = filtered.slice(0, MAX_CHARS)
    }

    // Bước 3: Load few-shot examples từ DB
    const fewShotSection = await buildFewShotSection()
    const systemPrompt = BASE_SYSTEM_PROMPT + fewShotSection

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: filtered },
                ],
                temperature: 0.1,
                max_tokens: 3000,
            }),
        })

        if (!groqRes.ok) {
            const err = await groqRes.text()
            return NextResponse.json({ error: `Groq API error: ${groqRes.status} – ${err}` }, { status: 502 })
        }

        const groqData = await groqRes.json()
        const rawContent: string = groqData.choices?.[0]?.message?.content ?? ''

        // ── Robust JSON extraction ──────────────────────────────────────────────
        function extractJsonArray(text: string): unknown[] | null {
            let s = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
            const start = s.indexOf('[')
            const end   = s.lastIndexOf(']')
            if (start === -1 || end === -1 || end < start) return null
            s = s.slice(start, end + 1)
            try { return JSON.parse(s) }
            catch { return null }
        }

        const parsed = extractJsonArray(rawContent)

        if (!parsed) {
            console.error('[parse-meal-ai] Invalid JSON from AI:', rawContent.slice(0, 500))
            return NextResponse.json({
                records: [],
                truncated,
                warning: 'AI không trả về JSON hợp lệ — thử lại hoặc dùng nút "Phân tích ngay".',
                raw: rawContent.slice(0, 300),
            })
        }

        return NextResponse.json({ records: parsed, truncated, examplesUsed: fewShotSection.length > 0 })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
