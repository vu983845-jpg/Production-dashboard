import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("start")
    const endDate = searchParams.get("end")

    if (!startDate || !endDate) {
        return NextResponse.json({ error: "start and end params required" }, { status: 400 })
    }

    const { data, error } = await supabase
        .from("daily_water")
        .select("*")
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date", { ascending: true })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
    const supabase = await createClient()

    // Check auth + role
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

    if (!profile || !["admin", "HSE", "hse_admin", "maint"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden – admin, HSE, hse_admin or maint role required" }, { status: 403 })
    }

    const body = await request.json()

    // Handle both single object and array payloads
    const payload = Array.isArray(body) ? body : [body]

    const mappedPayload = payload.map((row: any) => ({
        work_date: row.work_date,
        tong: row.tong ?? null,
        cap_vp: row.cap_vp ?? null,
        lo_hoi: row.lo_hoi ?? null,
        lo_hoi_shelling: row.lo_hoi_shelling ?? null,
        ro_cap_vao: row.ro_cap_vao ?? null,
        ro_dau_ra: row.ro_dau_ra ?? null,
        canteen: row.canteen ?? null,
        canteen_2: row.canteen_2 ?? null,
        nha_xe: row.nha_xe ?? null,
        cooling: row.cooling ?? null,
        nuoc_thai: row.nuoc_thai ?? null,
        notes: row.notes ?? null,
    }))

    const { data, error } = await supabase
        .from("daily_water")
        .upsert(mappedPayload, { onConflict: "work_date" })
        .select()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
}
