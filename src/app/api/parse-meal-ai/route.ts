import { NextRequest, NextResponse } from 'next/server'

// AI cascade: Gemini 2.5 Flash (smart) → Gemini 3.1 Flash Lite (high quota) → Groq (fallback)
const GEMINI_MODEL_SMART = 'gemini-2.5-flash'              // Tier 1: thông minh hơn, 20 RPD
const GEMINI_MODEL_QUOTA = 'gemini-3-flash'                 // fallback khi 2.5 hết quota (250K TPM, 20 RPD)
const GROQ_MODEL         = 'llama-3.3-70b-versatile'       // Tier 3: Groq, last resort


// System prompt – HeadcountRecord format
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
Color sorter/Machine Grading → "Color sorter"
Grading/gradinCa/gradin → "Grading"
Handpeeling with Dung → "Handpeeling (Dung)"
Handpeeling with Liên → "Handpeeling (Liên)"
Packing/Đóng gói → "Packing"
Warehouse/WH/Loading → "Warehouse"
Bảo trì highcare/bảo trì HCA → "Bảo trì highcare"
Tập vụ/tạp vụ → "Tập vụ"
QC/Quality → "QC"

## NUMBER RULES
"10p"→10 | "13(9chay)"→present=13,veg=9 | "12 (1 chay)"→present=12,veg=1 | "8( 5 chay)"→present=8,veg=5 | "11+10chay"→present=21,veg=10 | blank/"o"/"O"→null
CRITICAL: (N chay) / (N p chay) ALWAYS means vegetarian=N. NEVER put it in seasonalPresent.

## OT RULES (string output)
"OT:5"→"5" | "OT:12p(9chay)"→"12" | "OT:3 /18h"→"3" | "OT:2p 14h"→"2" | "OT:3+2"→"5"
"OT:" / "OT:0" / "OT." / "0T" / blank → "" (empty string)

## IGNORE
- Sections/lines starting with "Dự trù" → skip entirely
- @mention-only messages with no numbers, thực đơn/menu discussions

## SPECIAL FORMATS
1. Ca 1.2.3 (Boiler): CRITICAL – headcount is the TOTAL across all shifts. DIVIDE total ÷ number_of_shifts = per_shift. E.g. Ca 1.2.3 + CT HD:3 → 3÷3=1 → officialPresent=1 each. NEVER copy the raw total into each record.
2. Maint HCA block "Ca 1 và HC / Ca 2 / Ca 3": each Ca = separate record, same date+area.
3. QC compact "Ca1: 11 (2 chay) OT: 7" → shift=1, officialPresent=11, vegetarian=2 (NOT seasonalPresent – always null), ot="7". Space before paren does not change meaning.
4. Tập vụ "Ca: 1:8(5chay)0T" → shift=1, present=8, ot="" ("0T" = no OT)
5. Supplement OT short msg "Shelling OT 5p ăn 14h" → date=null, shift=null, ot="5"
6. Handpeeling: detect supervisor from leading name or "(Dung)"/"(Liên)" in area line.
7. Message with Dự trù appended at end: extract only attendance part, ignore from "Dự trù" onward.
8. CRITICAL – Warehouse/Loading (FGWH) "Hành Chánh" label: When area=Warehouse and shift field contains "Hành Chánh", "HC", "hành chính", "hanh chanh", or similar administrative labels → ALWAYS output shift="1". Do NOT create a separate shift named "HC" or "Hành Chánh". All administrative (Hành Chánh) staff in the Loading/Warehouse team eat at Ca 1.

## EXAMPLES

Ex1 Boiler Ca 1.2.3 (headcount is TOTAL, divide equally by number of shifts):
IN: 26.3.2026\nKhu vực : Boiler\nCa: 1.2.3\nChính thức hiện diện: 3\n2Thời vụ hiện diện:0\nOT:
OUT: [{"date":"26/03/2026","area":"Boiler","shift":"1","officialPresent":1,"officialAbsent":null,"seasonalPresent":0,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":""},{"date":"26/03/2026","area":"Boiler","shift":"2","officialPresent":1,"officialAbsent":null,"seasonalPresent":0,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":""},{"date":"26/03/2026","area":"Boiler","shift":"3","officialPresent":1,"officialAbsent":null,"seasonalPresent":0,"seasonalAbsent":null,"ot":"","vegetarian":null,"senderHint":"","raw":""}]

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

Ex8 Packing with seasonal zeros + Dự trù at end:
IN: Date: 30/03/2026\nKhu vực : Packing\nCa: 2\nChính thức hiện diện:13(9chay)\nChính thức vắng: 0\nThời vụ hiện diện: 0\nThời vụ vắng: 0\nOT:\nDự trù : 31/03/2026(ca 2)\nChay : 9p
OUT: [{"date":"30/03/2026","area":"Packing","shift":"2","officialPresent":13,"officialAbsent":0,"seasonalPresent":0,"seasonalAbsent":0,"ot":"","vegetarian":9,"senderHint":"","raw":""}]

Ex9 Supplement OT short message:
IN: Shelling OT 5p(2 chay) ăn 14h nha e
OUT: [{"date":null,"area":"Shelling","shift":null,"officialPresent":null,"officialAbsent":null,"seasonalPresent":null,"seasonalAbsent":null,"ot":"5","vegetarian":2,"senderHint":"","raw":""}]

Ex10 Dự trù only → empty:
IN: Dự trù ngày :27/3/2026\n- Bộ phận : Shelling\n- Ca : 1
OUT: []

Ex11 Machine Grading (no Khu vực label, area+shift on first line, Trong đó chay block):
IN: Machine Grading - ca2\nNgày: 31-3-2026\nChính thức hiện diện: 19\nChính thức vắng: 2\nTrong đó:\n- Mặn: 9\n- Chay: 10\nOT:
OUT: [{"date":"31/03/2026","area":"Color sorter","shift":"2","officialPresent":19,"officialAbsent":2,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":10,"senderHint":"","raw":""}]

Ex12 Loading/Warehouse – Hành Chánh = Ca 1 (CRITICAL rule 8):
IN: Loading - 01/04/2025\nHành Chánh\nChính thức hiện diện: 10\nChính thức vắng: 0\nTrong đó:\n- Mặn: 10\n- Chay: 0\nOT:
OUT: [{"date":"01/04/2025","area":"Warehouse","shift":"1","officialPresent":10,"officialAbsent":0,"seasonalPresent":null,"seasonalAbsent":null,"ot":"","vegetarian":0,"senderHint":"","raw":""}]

Return ONLY a valid JSON array. No markdown, no explanation. Dự trù only → return [].`


// ── Pre-filter: bỏ dòng không liên quan để tiết kiệm token ──────────────
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

// ── JSON extractor ────────────────────────────────────────────────────────
function extractJsonArray(text: string): unknown[] | null {
    let s = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const start = s.indexOf('[')
    const end   = s.lastIndexOf(']')
    if (start === -1 || end === -1 || end < start) return null
    s = s.slice(start, end + 1)
    try { return JSON.parse(s) }
    catch { return null }
}

// ── Gemini call (dùng chung cho cả 2 model) ─────────────────────────────
async function callGemini(filtered: string, apiKey: string, model: string): Promise<{ raw: string } | { status429: true }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: BASE_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: filtered }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 3000, responseMimeType: 'application/json' },
        }),
    })
    if (res.status === 429 || res.status >= 500) return { status429: true }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return { raw: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '' }
}

// ── Groq fallback call ────────────────────────────────────────────────────
async function callGroq(filtered: string, apiKey: string): Promise<{ raw: string }> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: BASE_SYSTEM_PROMPT },
                { role: 'user',   content: filtered },
            ],
            temperature: 0.1,
            max_tokens: 3000,
        }),
    })
    if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return { raw: data.choices?.[0]?.message?.content ?? '' }
}

// ── POST handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const geminiKey = process.env.GEMINI_API_KEY
    const groqKey   = process.env.GROQ_API_KEY

    if (!geminiKey && !groqKey) {
        return NextResponse.json({ error: 'Không tìm thấy API key (GEMINI_API_KEY hoặc GROQ_API_KEY)' }, { status: 500 })
    }

    let body: { text?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

    const rawInput = body.text?.trim()
    if (!rawInput) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

    let filtered = preFilterText(rawInput)
    const MAX_CHARS = 8000
    const truncated = filtered.length > MAX_CHARS
    if (truncated) filtered = filtered.slice(0, MAX_CHARS)

    try {
        let rawContent = ''
        let provider = 'gemini-2.5-flash'

        // 1️⃣ Tier 1: Gemini 2.5 Flash (thông minh nhất, 20 RPD)
        if (geminiKey) {
            const result = await callGemini(filtered, geminiKey, GEMINI_MODEL_SMART)
            if ('status429' in result) {
                console.warn('[parse-meal-ai] Gemini 2.5 Flash 429 – trying gemini-2.0-flash-lite')
                provider = 'gemini-2.0-flash-lite'
            } else {
                rawContent = result.raw
            }
        } else {
            provider = 'groq'
        }

        // 2️⃣ Tier 2: Gemini 3.1 Flash Lite (500 RPD)
        if (provider === 'gemini-2.0-flash-lite') {
            const result = await callGemini(filtered, geminiKey!, GEMINI_MODEL_QUOTA)
            if ('status429' in result) {
                console.warn('[parse-meal-ai] Gemini 3.1 Flash Lite 429 – falling back to Groq')
                provider = 'groq'
            } else {
                rawContent = result.raw
            }
        }

        // 3️⃣ Tier 3: Groq (last resort)
        if (provider === 'groq') {
            if (!groqKey) {
                return NextResponse.json({ error: 'Tất cả Gemini quota đã hết và không có GROQ_API_KEY' }, { status: 429 })
            }
            const result = await callGroq(filtered, groqKey)
            rawContent = result.raw
        }

        const parsed = extractJsonArray(rawContent)

        if (!parsed) {
            console.error(`[parse-meal-ai][${provider}] Invalid JSON:`, rawContent.slice(0, 300))
            return NextResponse.json({
                records: [],
                truncated,
                warning: 'AI không trả về JSON hợp lệ — thử lại.',
                raw: rawContent.slice(0, 300),
            })
        }

        return NextResponse.json({ records: parsed, truncated, provider })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
