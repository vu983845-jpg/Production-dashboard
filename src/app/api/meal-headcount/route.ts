import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

// Admin client that bypasses RLS
const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

const ALLOWED_ROLES = ['admin', 'hr_admin', 'hse_admin']

export async function PATCH(req: NextRequest) {
    try {
        // 1. Verify the caller is an authenticated admin
        const supabase = await createServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        
        // 2. Check role from profiles table
        const { data: profile } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        
        if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
            return NextResponse.json(
                { error: `Không có quyền. Role hiện tại: ${profile?.role ?? 'unknown'}` },
                { status: 403 }
            )
        }
        
        // 3. Parse body
        const body = await req.json()
        const { id, official_present, seasonal_present, vegetarian, ot_count, ot_vegetarian } = body
        
        if (!id) {
            return NextResponse.json({ error: 'Missing id' }, { status: 400 })
        }
        
        // 4. Do the update with service role (bypasses RLS)
        const { data, error: updateError } = await adminClient
            .from('meal_headcount')
            .update({
                official_present: official_present ?? 0,
                seasonal_present: seasonal_present ?? 0,
                vegetarian: vegetarian ?? 0,
                ot_count: ot_count ?? 0,
                ot_vegetarian: ot_vegetarian ?? 0,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('id, official_present, seasonal_present, vegetarian, ot_count, ot_vegetarian')
        
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
