import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendTeamsFeedbackNotification(rating: number, comment: string, isAnonymous: boolean, reporterName: string, hasImage: boolean) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL
    if (!webhookUrl) return

    const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    const reporter = isAnonymous ? "Ẩn danh" : (reporterName || "Ẩn danh")

    // Custom color depending on severity
    let themeColor = "22c55e" // Green for good reviews
    let statusEmoji = "✨"
    if (rating <= 2) {
        themeColor = "ef4444" // Red for bad reviews
        statusEmoji = "🚨 CẢNH BÁO CHẤT LƯỢNG BỮA ĂN CANTEEN"
    } else if (rating === 3) {
        themeColor = "f97316" // Orange for average reviews
        statusEmoji = "⚠️ Đánh giá trung bình"
    } else {
        statusEmoji = "💬 Đóng góp ý kiến Canteen"
    }

    const stars = "⭐".repeat(rating) + "☆".repeat(5 - rating)

    const body = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": themeColor,
        "summary": "Đánh giá chất lượng bữa ăn Canteen",
        "sections": [{
            "activityTitle": `${statusEmoji}`,
            "activitySubtitle": `Thời gian nhận: ${now}`,
            "facts": [
                { "name": "Đánh giá:", "value": `**${rating}/5** (${stars})` },
                { "name": "Người gửi:", "value": reporter },
                { "name": "Hình ảnh:", "value": hasImage ? "📸 Có ảnh đính kèm (vui lòng kiểm tra trên web)" : "Không có ảnh" },
                { "name": "Nhận xét:", "value": comment ? `*"${comment}"*` : "*(Không viết bình luận)*" }
            ],
            "markdown": true
        }]
    }

    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
        console.log("[Teams Feedback] sent status:", res.status)
    } catch (err) {
        console.error("[Teams Feedback] error sending:", err)
    }
}

export async function GET(req: NextRequest) {
    try {
        // Query all ratings to calculate statistics
        const { data: allRatings, error: statsError } = await supabaseAdmin
            .from("canteen_feedback")
            .select("rating")

        if (statsError) {
            return NextResponse.json({ error: statsError.message }, { status: 500 })
        }

        // Query top 50 recent reviews (including image_base64)
        const { data: reviews, error: reviewsError } = await supabaseAdmin
            .from("canteen_feedback")
            .select("id, rating, comment, is_anonymous, reporter_name, image_base64, created_at")
            .order("created_at", { ascending: false })
            .limit(50)

        if (reviewsError) {
            return NextResponse.json({ error: reviewsError.message }, { status: 500 })
        }

        // Calculate statistics
        const total = allRatings.length
        let sum = 0
        const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

        allRatings.forEach(r => {
            sum += r.rating
            if (distribution[r.rating] !== undefined) {
                distribution[r.rating]++
            }
        })

        const average = total > 0 ? parseFloat((sum / total).toFixed(1)) : 0

        return NextResponse.json({
            stats: {
                average,
                total,
                distribution
            },
            reviews: reviews || []
        })
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { rating, comment, is_anonymous, reporter_name, image_base64 } = body

        if (rating === undefined || rating < 1 || rating > 5) {
            return NextResponse.json({ error: "Điểm đánh giá phải từ 1 đến 5 sao." }, { status: 400 })
        }

        const payload = {
            rating,
            comment: comment ? comment.trim() : null,
            is_anonymous: is_anonymous !== false, // default true
            reporter_name: is_anonymous === false && reporter_name ? reporter_name.trim() : null,
            image_base64: image_base64 || null,
            work_date: new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }).split(',')[0].split('/').reduce((acc, val, i, arr) => {
                // Convert MM/DD/YYYY to YYYY-MM-DD
                if (i === 2) return val + '-' + String(arr[0]).padStart(2, '0') + '-' + String(arr[1]).padStart(2, '0')
                return acc
            }, "") || new Date().toISOString().split('T')[0]
        }

        const { data, error } = await supabaseAdmin
            .from("canteen_feedback")
            .insert(payload)
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Trigger Teams Notification for reviews
        await sendTeamsFeedbackNotification(
            rating,
            comment,
            payload.is_anonymous,
            payload.reporter_name ?? "",
            !!payload.image_base64
        )

        return NextResponse.json({ success: true, data })
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
