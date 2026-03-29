import { NextRequest, NextResponse } from 'next/server'

// ─── System Prompt: "Training" AI để hiểu format báo cơm nhà máy ───────────
const SYSTEM_PROMPT = `Bạn là AI chuyên phân tích tin nhắn báo cơm nhà bếp của nhà máy Intersnack Cashew (VICC LA).
Nhiệm vụ: Đọc các tin nhắn từ nhóm Zalo và trích xuất thông tin đăng ký bữa ăn thành JSON có cấu trúc.

## CÁC BỘ PHẬN TRONG NHÀ MÁY (ánh xạ về code chuẩn)

| Tên trong tin nhắn (có thể viết tắt/sai) | Code chuẩn |
|---|---|
| Loading, WH, Warehouse, FGWH, RCN, kho | FGWH |
| Steaming, Hấp | STEAM |
| Shelling, Máy cắt | SHELL |
| Maintenance Shelling, Maint Shelling, Bảo trì máy cắt, Bao tri may cat, Maint - Shelling | MAINT_SHELL |
| Borma | BORMA |
| Peeling, Peeling MC, Peeling Machine, Peeling mc, MC Peeling | PEEL |
| Machine Grading, Color Sorter, Grading máy | CS |
| Hand Peeling, Manual Grading, Manual Peeling, Grading (Ms Huệ), Grading thủ công, HPEEL, Grading | HPEEL |
| Packing, Đóng gói | PACK |
| Boiler, Lò hơi | BOILER |
| Maintenance, Bảo trì, Maint HCA, Bảo trì HCA, Highcare Maint, Cleaning | MAINT_HCA |
| QC, Quality | QC |
| Office, Văn phòng, VP | OFFICE |

## ĐỊNH DẠNG TIN NHẮN ZA LO (ví dụ)

Tin nhắn có thể lộn xộn, không nhất quán. Các ví dụ:

**Ví dụ 1 (format chuẩn):**
28.3.2026
Khu vực : Boiler
Ca: 1.2.3
Chính thức hiện diện: 3
Chính thức vắng: 0
2Thời vụ hiện diện:0
Thời vụ vắng :0
OT:

**Ví dụ 2 (nhiều ca riêng):**
Date: 28/03/2026
Khu vực : Peeling mc
Ca: 1
Chính thức hiện diện: 7
Chính thức vắng: 0
Thời vụ hiện diện:5
Thời vụ vắng: 0
OT: 0
Chay: 0

**Ví dụ 3 (ngắn gọn):**
29/3
Shelling ca 1: 35 (3 chay)
Shelling ca 2: 20

**Ví dụ 4 (có bổ sung):**
Bổ sung Grading ca 2: 45

**Ví dụ 5 (nhiều bộ phận):**
Ngày 28/03/2026
QC ca 1: 13, ca 2: 8, ca 3: 8
Packing ca 1: 26 ca 2: 13 ca 3: 13

## QUY TẮC TRÍCH XUẤT

1. **Ca (shift)**: "Ca 1" → "1", "Ca 2" → "2", "Ca 3" → "3". Nếu "Ca: 1.2.3" hoặc "Ca: 1,2,3" → tạo 3 record riêng (1, 2, 3) với cùng số người (chia đều hoặc để nguyên số nếu không rõ).
2. **Chính thức (CT)**: từ khóa "Chính thức hiện diện", "CT hiện diện", "CT:", số sau tên ca. Giá trị null nếu không có.
3. **Thời vụ (TV)**: từ khóa "Thời vụ hiện diện", "TV hiện diện", "TV:". Giá trị null nếu không có.
4. **OT**: từ khóa "OT:", số OT. Chuyển về string (ví dụ "5" hoặc "" nếu trống).
5. **Chay (vegetarian)**: từ khóa "chay", "chay:", số trong ngoặc "(3 chay)". null nếu không có.
6. **Ngày**: Chuyển mọi định dạng về "YYYY-MM-DD". Năm mặc định là 2026 nếu không rõ.
7. **area**: Trả về CODE CHUẨN (FGWH, STEAM, SHELL, MAINT_SHELL, BORMA, PEEL, CS, HPEEL, PACK, BOILER, MAINT_HCA, QC, OFFICE).
8. **senderHint**: Tên người gửi nếu có trong tin nhắn, nếu không để "".
9. Bỏ qua các dòng chào hỏi, dấu thời gian Zalo, tên người gửi không liên quan.
10. Nếu cùng một ngày và khu vực và ca xuất hiện nhiều lần → chỉ lấy record cuối (bổ sung).

## ĐỊNH DẠNG OUTPUT

Trả về **CHỈ JSON** (không có text khác), là một mảng các object:

\`\`\`json
[
  {
    "senderHint": "Nguyễn Văn A",
    "date": "2026-03-28",
    "area": "BOILER",
    "shift": "1",
    "officialPresent": 3,
    "officialPresentNote": "",
    "officialAbsent": 0,
    "seasonalPresent": 0,
    "seasonalAbsent": 0,
    "ot": "",
    "vegetarian": null,
    "raw": "Khu vực : Boiler\\nCa: 1\\n..."
  }
]
\`\`\`

**QUAN TRỌNG:** Chỉ trả về JSON array, không giải thích, không markdown code block, không text nào khác.`

// ─── POST handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
        return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })
    }

    let body: { text?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const text = body.text?.trim()
    if (!text) {
        return NextResponse.json({ error: 'No text provided' }, { status: 400 })
    }

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Hãy phân tích đoạn chat Zalo báo cơm sau:\n\n${text}` },
                ],
                temperature: 0.1,
                max_tokens: 4096,
            }),
        })

        if (!groqRes.ok) {
            const err = await groqRes.text()
            return NextResponse.json({ error: `Groq API error: ${groqRes.status} – ${err}` }, { status: 502 })
        }

        const groqData = await groqRes.json()
        const rawContent: string = groqData.choices?.[0]?.message?.content ?? '[]'

        // Lọc markdown code block nếu AI trả về dù đã dặn không làm vậy
        const jsonStr = rawContent
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim()

        let parsed: unknown
        try {
            parsed = JSON.parse(jsonStr)
        } catch {
            return NextResponse.json({ error: 'AI returned invalid JSON', raw: rawContent }, { status: 422 })
        }

        return NextResponse.json({ records: parsed })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
