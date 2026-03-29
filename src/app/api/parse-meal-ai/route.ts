import { NextRequest, NextResponse } from 'next/server'

// llama-3.1-8b-instant: 20,000 TPM free tier (cao hơn 70b-versatile)
const MODEL = 'llama-3.1-8b-instant'

// System prompt ngắn gọn (~500 tokens)
const SYSTEM_PROMPT = `You parse Vietnamese factory meal-registration messages from Zalo chat into JSON.
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
    // Từ khóa liên quan đến báo cơm
    const mealKeywords = /ca|khu vực|chính thức|thời vụ|hiện diện|vắng|ot|chay|boiler|shelling|packing|peeling|borma|grading|loading|steam|maint|qc|office|ngày|date|\d{1,2}[./]\d{1,2}/i
    // Bỏ qua dòng timestamp Zalo (chỉ có giờ: "14:30")
    const timeOnly = /^\s*\d{1,2}:\d{2}\s*$/
    // Bỏ qua dòng trống liên tiếp (giữ 1 dòng trống để phân tách block)
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

    // Bước 2: hard cap 8000 ký tự (~2000 tokens) để không vượt TPM
    const MAX_CHARS = 8000
    const truncated = filtered.length > MAX_CHARS
    if (truncated) {
        filtered = filtered.slice(0, MAX_CHARS)
    }

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
                    { role: 'system', content: SYSTEM_PROMPT },
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
        const rawContent: string = groqData.choices?.[0]?.message?.content ?? '[]'

        const jsonStr = rawContent
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim()

        let parsed: unknown
        try { parsed = JSON.parse(jsonStr) }
        catch {
            return NextResponse.json({ error: 'AI returned invalid JSON', raw: rawContent }, { status: 422 })
        }

        return NextResponse.json({ records: parsed, truncated })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
