import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// llama-3.1-8b-instant: 20,000 TPM free tier (cao hơn 70b-versatile)
const MODEL = 'llama-3.1-8b-instant'

// System prompt v4 – HeadcountRecord format, concise to fit 16k context
const BASE_SYSTEM_PROMPT = `You parse Vietnamese factory Zalo shift reports into JSON.

## OUTPUT FORMAT
One object per shift-record:
{"date":"DD/MM/YYYY","area":"AREA","shift":"N","officialPresent":N,"officialAbsent":N,"seasonalPresent":N,"seasonalAbsent":N,"ot":"","vegetarian":N,"senderHint":"","raw":""}
All numeric fields can be null. "ot" is always a string ("5","3+2","0","").

## AREA STRINGS (output exactly as listed)
Boiler/Lò hơi → "Boiler"
Steaming/Hấp → "Steaming"
Shelling/Máy cắt → "Shelling"
Bảo trì máy cắt/Maint shelling → "Maint shelling"
Borma → "Borma"
Peeling mc → "Peeling mc"
Color sorter → "Color sorter"
Grading/gradinCa/gradin → "Grading"
Handpeeling with Dung → "Handpeeling (Dung)"
Handpeeling with Liên → "Handpeeling (Liên)"
Packing/Đóng gói → "Packing"
Warehouse/WH/Loading → "Warehouse"
Bảo trì highcare/bảo trì HCA → "Bảo trì highcare"
Tập vụ/tạp vụ → "Tập vụ"
QC/Quality → "QC"

## NUMBER RULES
"10p"→10 | "13(9chay)"→present=13,veg=9 | "11+10chay"→present=21,veg=10 | "23+19chay=42"→present=42,veg=19 | "8( 5 chay)"→8 | blank/"o"/"O"→null

## OT RULES (string output)
"OT:5"→"5" | "OT:12p(9chay)"→"12" | "OT:3 /18h"→"3" | "OT:2p 14h"→"2" | "OT:3+2"→"5"
"OT:" / "OT:0" / "OT." / "0T" / blank → "" (empty string)

## IGNORE
- Sections/lines starting with "Dự trù" → skip entirely
- @mention-only messages with no numbers, thực đơn/menu discussions

## SPECIAL FORMATS
1. Ca 1.2.3 (Boiler): create 3 records shift="1","2","3" with same values.
2. Maint HCA block "Ca 1 và HC / Ca 2 / Ca 3": each Ca = separate record, same date+area.
3. QC inline "Ca1: 11 (2 chay) OT: 7" → shift=1, present=11, veg=2, ot="7"
4. Tập vụ "Ca: 1:8(5chay)0T" → shift=1, present=8, ot="" ("0T" = no OT)
5. Supplement OT short msg "Shelling OT 5p ăn 14h" → date=null, shift=null, ot="5"
6. Handpeeling: detect supervisor from leading name or "(Dung)"/"(Liên)" in area line.
7. Message with Dự trù appended at end: extract only attendance part, ignore from "Dự trù" onward.

## EXAMPLES

Ex1 Boiler Ca 1.2.3:
IN: 26.3.2026\nKhu vực : Boiler\nCa: 1.2.3\nChính thức hiện diện: 3\n2Thời vụ hiện diện:0\nOT:
OUT: [{"date":"26/03/2026","area":"Boiler","shift":"1","officialPresent":3,"officialAbsent":null,"seasonalPresent":0,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":""},{"date":"26/03/2026","area":"Boiler","shift":"2","officialPresent":3,"officialAbsent":null,"seasonalPresent":0,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":""},{"date":"26/03/2026","area":"Boiler","shift":"3","officialPresent":3,"officialAbsent":null,"seasonalPresent":0,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":""}]

Ex2 Shelling + appended Dự trù (ignore Dự trù part):
IN: Date :26/03/2026\nKhu vực : Shelling\nCa : 1\nChính thức hiện diện:19(6p chay)\nChính thức vắng : 2\nOT : 0\nDự trù ngày :27/3/2026\n- Ca : 1
OUT: [{"date":"26/03/2026","area":"Shelling","shift":"1","officialPresent":19,"officialAbsent":2,"seasonalPresent":null,"seasonalAbsent":null,"ot":"0","vegetarian":6,"senderHint":"","raw":""}]

Ex3 Grading typo gradinCa + X+Y=Z:
IN: Deate: 26/3/2026\nKhu vực: gradinCa: 1\nChính thuc hiện diên:23+19chay =42\nOT:+chay = ăn lúc 14h
OUT: [{"date":"26/03/2026","area":"Grading","shift":"1","officialPresent":42,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":19,"senderHint":"","raw":""}]

Ex4 QC compact multi-shift:
IN: 26/03/2026\nBộ phận: QC\nCa1: 11 (2 chay) OT: 7\nCa2: 2\nCa3: 8 (1 chay) OT: 7
OUT: [{"date":"26/03/2026","area":"QC","shift":"1","officialPresent":11,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"7","vegetarian":2,"senderHint":"","raw":""},{"date":"26/03/2026","area":"QC","shift":"2","officialPresent":2,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":""},{"date":"26/03/2026","area":"QC","shift":"3","officialPresent":8,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"7","vegetarian":1,"senderHint":"","raw":""}]

Ex5 Maint HCA multi-shift + OT:
IN: Date 27/03/2026\nKhu vực bảo trì highcare\nCa 1 và HC\nChính thức 9\nVắng 3\nCa 2\nChính thức 1\nCa 3\nChính thức 2. OT : 4 phần lúc 14h
OUT: [{"date":"27/03/2026","area":"Bảo trì highcare","shift":"1","officialPresent":9,"officialAbsent":3,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":""},{"date":"27/03/2026","area":"Bảo trì highcare","shift":"2","officialPresent":1,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":""},{"date":"27/03/2026","area":"Bảo trì highcare","shift":"3","officialPresent":2,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"4","vegetarian":null,"senderHint":"","raw":""}]

Ex6 Tập vụ compact (0T = no OT):
IN: Date:26/03/2026\nKhu vực : tập vụ\nCa: 1:8(5chay)0T\nca:2:1(1cha)0T
OUT: [{"date":"26/03/2026","area":"Tập vụ","shift":"1","officialPresent":8,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":5,"senderHint":"","raw":""},{"date":"26/03/2026","area":"Tập vụ","shift":"2","officialPresent":1,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":1,"senderHint":"","raw":""}]

Ex7 Handpeeling Dung Ca2:
IN: Dung. Date 26/03/2026\nKhu vực: Handpeeling (Dung),\nCa: 2\nChính thức hiện diện: 65( 46chay)\nChính thức vắng: 4\nOT.
OUT: [{"date":"26/03/2026","area":"Handpeeling (Dung)","shift":"2","officialPresent":65,"officialAbsent":4,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":46,"senderHint":"Dung","raw":""}]

Ex8 Packing with OT:
IN: Date: 26/03/2026\nKhu vực : Packing\nCa: 1\nChính thức hiện diện:13(9chay)\nOT: 12p(9chay)
OUT: [{"date":"26/03/2026","area":"Packing","shift":"1","officialPresent":13,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"12","vegetarian":9,"senderHint":"","raw":""}]

Ex9 Supplement OT short message:
IN: Shelling OT 5p(2 chay) ăn 14h nha e
OUT: [{"date":null,"area":"Shelling","shift":null,"officialPresent":null,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"5","vegetarian":2,"senderHint":"","raw":""}]

Ex10 Dự trù only → empty:
IN: Dự trù ngày :27/3/2026\n- Bộ phận : Shelling\n- Ca : 1
OUT: []

Return ONLY a valid JSON array. No markdown, no explanation. Dự trù only → return [].`

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
