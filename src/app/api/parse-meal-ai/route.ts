import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// llama-3.1-8b-instant: 20,000 TPM free tier (cao hơn 70b-versatile)
const MODEL = 'llama-3.1-8b-instant'

// System prompt ngắn gọn (~500 tokens)
const BASE_SYSTEM_PROMPT = `You parse Vietnamese factory meal-registration messages from Zalo chat into JSON.
Extract meal headcount records. Output ONLY a JSON array, no explanation, no markdown.

DEPARTMENT CODE MAP (map any variant/abbreviation to the code):
Loading/WH/Warehouse/FGWH/RCN → FGWH
Steaming/Hấp → STEAM
Shelling/Máy cắt → SHELL
Maint Shelling/Bảo trì máy cắt/Maint-Shelling → MAINT_SHELL
Borma → BORMA
Peeling/Peeling MC/MC Peeling → PEEL
Machine Grading/Color Sorter → CS
Hand Peeling/Manual Grading/Manual Peeling/Grading/HPEEL → HPEEL
Packing/Đóng gói → PACK
Boiler/Lò hơi → BOILER
Maintenance/Bảo trì/Maint HCA/Cleaning/Highcare → MAINT_HCA
QC/Quality → QC
Office/VP → OFFICE

EXTRACTION RULES:
- shift: "Ca 1"→"1", "Ca 2"→"2", "Ca 3"→"3". If "Ca: 1.2.3" create 3 records with same counts.
- officialPresent: from "Chính thức hiện diện", "CT hiện diện", number after shift/dept name
- officialAbsent: from "Chính thức vắng"
- seasonalPresent: from "Thời vụ hiện diện", "TV hiện diện"
- seasonalAbsent: from "Thời vụ vắng"
- ot: from "OT:" as string, "" if empty
- vegetarian: from "chay" or "(N chay)", null if none
- date: convert any format to "YYYY-MM-DD", default year 2026
- area: return the CODE (e.g. BOILER, not "Boiler")
- senderHint: sender name if visible, else ""
- raw: the original text block for this record
- Skip greetings, Zalo timestamps, irrelevant lines
- If same date+dept+shift appears multiple times, keep last (override/supplement)

OUTPUT FORMAT (JSON array only):
[{"senderHint":"","date":"2026-03-28","area":"BOILER","shift":"1","officialPresent":3,"officialPresentNote":"","officialAbsent":0,"seasonalPresent":0,"seasonalAbsent":0,"ot":"","vegetarian":null,"raw":"..."}]`

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
