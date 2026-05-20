import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

// Admin client that bypasses RLS
const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

const RAW_ALLOWED_ROLES = ['admin', 'hr', 'hr_admin', 'hse', 'hse_admin', 'plant_manager']
const isRoleAllowed = (role: string | undefined | null) => {
    if (!role) return false
    const normalized = role.toLowerCase().replace(/[\s-]/g, '_')
    return RAW_ALLOWED_ROLES.includes(normalized)
}

export async function PATCH(req: NextRequest) {
    try {
        const supabase = await createServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!profile || !isRoleAllowed(profile.role)) {
            return NextResponse.json(
                { error: `Không có quyền. Role hiện tại: ${profile?.role ?? 'unknown'}` },
                { status: 403 }
            )
        }

        const body = await req.json()
        const { id, official_present, official_absent, seasonal_present, seasonal_absent, vegetarian, ot_count, ot_vegetarian, note, expected_department_name } = body

        if (!id) {
            return NextResponse.json({ error: 'Missing id' }, { status: 400 })
        }

        const clamp0 = (v: number | undefined | null) => Math.max(0, v ?? 0)

        const updateData: any = {
            updated_at: new Date().toISOString(),
        }

        if (official_present !== undefined) updateData.official_present = clamp0(official_present)
        if (official_absent !== undefined) updateData.official_absent = clamp0(official_absent)
        if (seasonal_present !== undefined) updateData.seasonal_present = clamp0(seasonal_present)
        if (seasonal_absent !== undefined) updateData.seasonal_absent = clamp0(seasonal_absent)
        if (vegetarian !== undefined) updateData.vegetarian = clamp0(vegetarian)
        if (ot_count !== undefined) updateData.ot_count = clamp0(ot_count)
        if (ot_vegetarian !== undefined) updateData.ot_vegetarian = clamp0(ot_vegetarian)
        if (note !== undefined) updateData.note = note

        let updateQuery = adminClient
            .from('meal_headcount')
            .update(updateData)
            .eq('id', id)

        if (expected_department_name) {
            updateQuery = updateQuery.eq('department_name', expected_department_name)
        }

        const { data, error: updateError } = await updateQuery
            .select()

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        if (!data || data.length === 0) {
            return NextResponse.json({ error: 'Record not found' }, { status: 404 })
        }

        return NextResponse.json({ success: true, data: data[0] })
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const supabase = await createServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
        if (!profile || !isRoleAllowed(profile.role)) {
            return NextResponse.json({ error: `Không có quyền. Role hiện tại: ${profile?.role ?? 'unknown'}` }, { status: 403 })
        }

        const url = new URL(req.url)
        const id = url.searchParams.get('id')
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

        const { error: deleteError } = await adminClient.from('meal_headcount').delete().eq('id', id)
        if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

        return NextResponse.json({ success: true })
    } catch (e: unknown) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
        if (!profile || !isRoleAllowed(profile.role)) {
            return NextResponse.json({ error: `Không có quyền. Role hiện tại: ${profile?.role ?? 'unknown'}` }, { status: 403 })
        }

        const payload = await req.json()
        const rows = Array.isArray(payload) ? payload : [payload]
        const savedRows = []

        for (const row of rows) {
            const { work_date, department_id, department_name, shift } = row
            if (!work_date || !shift || (!department_id && !department_name)) {
                return NextResponse.json({ error: 'Missing work_date, department, or shift' }, { status: 400 })
            }

            // Always prefer department_name for lookup (unique constraint is work_date+department_name+shift).
            // This prevents HPEEL sub-groups (Huệ/Liên/Dung) — which share the same department_id —
            // from accidentally overwriting each other's records.
            let query = adminClient
                .from('meal_headcount')
                .select('id')
                .eq('work_date', work_date)
                .eq('shift', shift)
                .limit(1)

            if (department_name) {
                query = query.eq('department_name', department_name)
            } else {
                query = query.eq('department_id', department_id)
            }

            const { data: existingRows, error: lookupError } = await query
            if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

            const existingId = existingRows?.[0]?.id
            if (existingId) {
                // Update only numeric/meta fields; never overwrite department_name or department_id
                // to prevent cross-contamination between HPEEL sub-groups.
                const updateFields: Record<string, unknown> = {
                    updated_at: row.updated_at ?? new Date().toISOString(),
                }
                if (row.official_present !== undefined) updateFields.official_present = row.official_present
                if (row.official_absent !== undefined) updateFields.official_absent = row.official_absent
                if (row.seasonal_present !== undefined) updateFields.seasonal_present = row.seasonal_present
                if (row.seasonal_absent !== undefined) updateFields.seasonal_absent = row.seasonal_absent
                if (row.ot_count !== undefined) updateFields.ot_count = row.ot_count
                if (row.ot_vegetarian !== undefined) updateFields.ot_vegetarian = row.ot_vegetarian
                if (row.vegetarian !== undefined) updateFields.vegetarian = row.vegetarian
                if (row.note !== undefined) updateFields.note = row.note
                if (row.created_by !== undefined) updateFields.created_by = row.created_by

                const { data, error: updateError } = await adminClient
                    .from('meal_headcount')
                    .update(updateFields)
                    .eq('id', existingId)
                    .select()
                    .single()

                if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
                savedRows.push(data)
            } else {
                const { data, error: insertError } = await adminClient
                    .from('meal_headcount')
                    .insert(row)
                    .select()
                    .single()

                if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
                savedRows.push(data)
            }
        }

        return NextResponse.json({ success: true, data: Array.isArray(payload) ? savedRows : savedRows[0] })
    } catch (e: unknown) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
    }
}
