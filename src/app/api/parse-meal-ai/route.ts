import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// llama-3.1-8b-instant: 20,000 TPM free tier (cao hơn 70b-versatile)
const MODEL = 'llama-3.1-8b-instant'

// System prompt nâng cấp (Claude-generated, ~2000 tokens, bao gồm 10 few-shot examples)
const BASE_SYSTEM_PROMPT = `You are a Vietnamese factory meal reporting parser. Your task is to extract attendance and meal data from Zalo messages sent by shift supervisors at a cashew processing factory.

## OUTPUT FORMAT
Return a JSON array. Each element represents one shift record:
{"date":"YYYY-MM-DD","area":"AREA_CODE","shift":"1"|"2"|"3","officialPresent":number|null,"officialAbsent":number|null,"seasonalPresent":number|null,"seasonalAbsent":number|null,"ot":string,"vegetarian":number|null,"senderHint":string,"raw":string}

## AREA CODE MAPPING
- Loading, WH, Warehouse, FGWH, RCN → FGWH
- Steaming, Hấp → STEAM
- Shelling, Máy cắt → SHELL
- Maint Shelling, Bảo trì máy cắt → MAINT_SHELL
- Borma → BORMA
- Peeling MC, MC Peeling, Peeling → PEEL
- Machine Grading, Color Sorter → CS
- Hand Peeling, Manual Grading, Manual Peeling, Grading, HPEEL, gradin → HPEEL
- Packing, Đóng gói → PACK
- Boiler, Lò hơi → BOILER
- Maintenance, Bảo trì, Maint HCA, Cleaning, Highcare, bảo trì highcare → MAINT_HCA
- QC, Quality → QC
- Office, VP → OFFICE
- Tập vụ → TAPVU

## PARSING RULES

### Date:
- "26/3/2026", "26-3-2026", "26.3.2026" → "2026-03-26". Missing year → assume 2026.

### Shift:
- "Ca: 1" or "Ca 1" or "Ca1:" → shift="1"
- "Ca: 1.2.3" → create 3 separate records with same data
- "Ca 1 và HC" → shift="1"

### Official Present (officialPresent):
- "19" → 19
- "19(6p chay)" → 19, vegetarian=6
- "11+10chay" → officialPresent=21, vegetarian=10
- "23+19chay =42" → officialPresent=42, vegetarian=19
- "10p" → 10 (strip suffix p)

### Vegetarian:
- "(6p chay)" or "(6 chay)" → 6
- "11+10chay" → 10
- "(9chay)" → 9
- Not mentioned → null

### OT:
- "OT: 5" or "OT:5" → "5"
- "OT: 3+2" → "3+2"
- "OT: 12p(9chay)" → "12"
- "OT:3 /18h" → "3"
- "OT:" or "OT:0" or "OT. p ( chay )" → ""
- Not present → ""

### Seasonal:
- "Thời vụ hiện diện:0" → seasonalPresent=0
- "2Thời vụ hiện diện:0" → seasonalPresent=0
- Not mentioned → null

## SPECIAL CASES
- Supplement OT: "Shelling OT 5p ăn 14h" → date=null, shift=null, only area+ot+vegetarian
- IGNORE: lines starting with "Dự trù", menu discussions, pure @mentions without data

## FEW-SHOT EXAMPLES

Example 1 – BOILER Ca 1.2.3:
INPUT: 26.3.2026\nKhu vực : Boiler\nCa: 1.2.3\nChính thức hiện diện: 3\nChính thức vắng: 0\n2Thời vụ hiện diện:0\nThời vụ vắng :0\nOT:
OUTPUT: [{"date":"2026-03-26","area":"BOILER","shift":"1","officialPresent":3,"officialAbsent":0,"seasonalPresent":0,"seasonalAbsent":0,"ot":"","vegetarian":null,"senderHint":"","raw":"..."},{"date":"2026-03-26","area":"BOILER","shift":"2","officialPresent":3,"officialAbsent":0,"seasonalPresent":0,"seasonalAbsent":0,"ot":"","vegetarian":null,"senderHint":"","raw":"..."},{"date":"2026-03-26","area":"BOILER","shift":"3","officialPresent":3,"officialAbsent":0,"seasonalPresent":0,"seasonalAbsent":0,"ot":"","vegetarian":null,"senderHint":"","raw":"..."}]

Example 2 – SHELLING with vegetarian in parentheses:
INPUT: Date:26/03/2026\nKhu vực: Shelling\nCa: 1\nChính thức hiện diện:19(6p chay)\nChính thức vắng: 2\nOT: 0
OUTPUT: [{"date":"2026-03-26","area":"SHELL","shift":"1","officialPresent":19,"officialAbsent":2,"seasonalPresent":null,"seasonalAbsent":null,"ot":"0","vegetarian":6,"senderHint":"","raw":"..."}]

Example 3 – COLOR SORTER X+Ychay format:
INPUT: Date:26/03/2026\nKhu vực:Color sorter\nCa: 1\nChính thức hiện diện: 11+10chay\nOt: 11+10chay\n(Huệ)
OUTPUT: [{"date":"2026-03-26","area":"CS","shift":"1","officialPresent":21,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"21","vegetarian":10,"senderHint":"Huệ","raw":"..."}]

Example 4 – QC multi-shift compact:
INPUT: 26/03/2026\nBộ phận: QC\nCa1: 11 (2 chay) OT: 7\nCa2: 2\nCa3: 8 (1 chay) OT: 7
OUTPUT: [{"date":"2026-03-26","area":"QC","shift":"1","officialPresent":11,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"7","vegetarian":2,"senderHint":"","raw":"Ca1: 11 (2 chay) OT: 7"},{"date":"2026-03-26","area":"QC","shift":"2","officialPresent":2,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":"Ca2: 2"},{"date":"2026-03-26","area":"QC","shift":"3","officialPresent":8,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"7","vegetarian":1,"senderHint":"","raw":"Ca3: 8 (1 chay) OT: 7"}]

Example 5 – MAINT_HCA multi-shift different format:
INPUT: Date 26/03/2026\nKhu vực bảo trì highcare\nCa 1 và HC\nChính thức 11\nVắng 1\nCa 2\nChính thức 2\nCa 3\nChính thức 2
OUTPUT: [{"date":"2026-03-26","area":"MAINT_HCA","shift":"1","officialPresent":11,"officialAbsent":1,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":"..."},{"date":"2026-03-26","area":"MAINT_HCA","shift":"2","officialPresent":2,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":"..."},{"date":"2026-03-26","area":"MAINT_HCA","shift":"3","officialPresent":2,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":"..."}]

Example 6 – HPEEL with sender name:
INPUT: Dung. Date 26/03/2026\nKhu vực: Handpeeling (Dung),\nCa: 2\nChính thức hiện diện: 65( 46chay)\nChính thức vắng: 4\nThời vụ vắng: 0\nOT.
OUTPUT: [{"date":"2026-03-26","area":"HPEEL","shift":"2","officialPresent":65,"officialAbsent":4,"seasonalPresent":null,"seasonalAbsent":0,"ot":"","vegetarian":46,"senderHint":"Dung","raw":"..."}]

Example 7 – PACKING OT with chay in parentheses:
INPUT: Date: 26/03/2026\nKhu vực : Packing\nCa: 1\nChính thức hiện diện:13(9chay)\nChính thức vắng: 0\nThời vụ hiện diện: 0\nThời vụ vắng : 0\nOT: 12p(9chay)
OUTPUT: [{"date":"2026-03-26","area":"PACK","shift":"1","officialPresent":13,"officialAbsent":0,"seasonalPresent":0,"seasonalAbsent":0,"ot":"12","vegetarian":9,"senderHint":"","raw":"..."}]

Example 8 – Supplement OT only:
INPUT: Shelling OT 5p(2 chay) ăn 14h nha e
OUTPUT: [{"date":null,"area":"SHELL","shift":null,"officialPresent":null,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"5","vegetarian":2,"senderHint":"","raw":"Shelling OT 5p(2 chay) ăn 14h nha e"}]

Example 9 – WAREHOUSE suffix p:
INPUT: Date: 26/03/2026\nKhu vực : warehouse\nCa: 1\nChính thức hiện diện: 10p\nChính thức vắng: 0\nThời vụ hiện diện: 0\nThời vụ vắng :0\nOT:
OUTPUT: [{"date":"2026-03-26","area":"FGWH","shift":"1","officialPresent":10,"officialAbsent":0,"seasonalPresent":0,"seasonalAbsent":0,"ot":"","vegetarian":null,"senderHint":"","raw":"..."}]

Example 10 – GRADING with typos and X+Ychay=Z:
INPUT: Deate: 26/3/2026\nKhu vực: gradinCa: 1\nChính thuc hiện diên:23+19chay =42\nChính thức vắng:\nOT:+chay = ăn lúc 14h
OUTPUT: [{"date":"2026-03-26","area":"HPEEL","shift":"1","officialPresent":42,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":19,"senderHint":"","raw":"..."}]

Parse the input and return ONLY a valid JSON array. No explanation, no markdown, no extra text.`

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
