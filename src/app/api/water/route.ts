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

    if (!profile || !["admin", "HSE", "maint"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden – admin, HSE or maint role required" }, { status: 403 })
    }

    const body = await request.json()

    const { data, error } = await supabase
        .from("daily_water")
        .upsert(
            {
                work_date: body.work_date,
                tong: body.tong ?? null,
                cap_vp: body.cap_vp ?? null,
                lo_hoi: body.lo_hoi ?? null,
                lo_hoi_shelling: body.lo_hoi_shelling ?? null,
                ro_cap_vao: body.ro_cap_vao ?? null,
                ro_dau_ra: body.ro_dau_ra ?? null,
                canteen: body.canteen ?? null,
                nha_xe: body.nha_xe ?? null,
                cooling: body.cooling ?? null,
                nuoc_thai: body.nuoc_thai ?? null,
                notes: body.notes ?? null,
            },
            { onConflict: "work_date" }
        )
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
}
