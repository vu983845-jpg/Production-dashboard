import { NextResponse } from "next/server"

export async function GET() {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL
    if (!webhookUrl) return NextResponse.json({ error: "TEAMS_WEBHOOK_URL not set" }, { status: 500 })

    const body = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: "0076D7",
        summary: "Test",
        sections: [{
            activityTitle: "TEST TU VERCEL",
            activitySubtitle: new Date().toISOString(),
            facts: [{ name: "Status", value: "Kiem tra ket noi Teams" }],
        }],
    }

    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
        const text = await res.text()
        return NextResponse.json({ status: res.status, body: text, webhookUrl: webhookUrl.slice(0, 60) + "..." })
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
