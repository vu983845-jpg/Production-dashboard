import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET: fetch historical monthly data + all baseline models
export async function GET() {
    const supabase = await createClient()

    const [{ data: historical, error: hErr }, { data: baselines, error: bErr }, { data: seus, error: sErr }] =
        await Promise.all([
            supabase.from('iso50001_monthly_historical').select('*').order('month_year', { ascending: true }),
            supabase.from('iso50001_baseline_model').select('*').order('created_at', { ascending: false }),
            supabase.from('iso50001_seu_master').select('*').order('sort_order'),
        ])

    if (hErr || bErr || sErr) {
        return NextResponse.json({ error: hErr?.message || bErr?.message || sErr?.message }, { status: 500 })
    }

    return NextResponse.json({ historical, baselines, seus })
}

// POST: save a new computed baseline
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { seu_id, label, period_from, period_to, slope, intercept, r_squared, n_points } = body

    if (!seu_id || !label || !period_from || !period_to || slope == null || intercept == null || r_squared == null) {
        return NextResponse.json({ error: 'Missing required baseline fields' }, { status: 400 })
    }

    // Deactivate any current active baseline for this SEU first
    await supabase
        .from('iso50001_baseline_model')
        .update({ is_active: false })
        .eq('seu_id', Number(seu_id))
        .eq('is_active', true)

    // Insert new active baseline
    const { data, error } = await supabase
        .from('iso50001_baseline_model')
        .insert({
            seu_id: Number(seu_id),
            label,
            period_from,
            period_to,
            slope: Number(slope),
            intercept: Number(intercept),
            r_squared: Number(r_squared),
            n_points: Number(n_points),
            is_active: true,
            created_by: session.user.id,
        })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
}

// PATCH: toggle is_active or update historical data
export async function PATCH(request: Request) {
    const supabase = await createClient()
    const body = await request.json()

    // Toggle active baseline
    if (body.action === 'activate') {
        const { seu_id, baseline_id } = body
        // Deactivate all for this SEU
        await supabase.from('iso50001_baseline_model').update({ is_active: false }).eq('seu_id', seu_id)
        // Activate target
        const { error } = await supabase
            .from('iso50001_baseline_model')
            .update({ is_active: true })
            .eq('id', baseline_id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    }

    // Upsert monthly historical row
    if (body.action === 'upsert_historical') {
        const { seu_id, month_year, rcn_hap_duoc_kg, actual_energy, ck_obtained_mt, notes } = body
        const { data: { session } } = await supabase.auth.getSession()
        const { error } = await supabase
            .from('iso50001_monthly_historical')
            .upsert(
                {
                    seu_id,
                    month_year,
                    rcn_hap_duoc_kg: Number(rcn_hap_duoc_kg) || 0,
                    actual_energy: Number(actual_energy),
                    ck_obtained_mt: ck_obtained_mt != null ? Number(ck_obtained_mt) : null,
                    notes: notes || null,
                    created_by: session?.user.id,
                },
                { onConflict: 'seu_id,month_year' }
            )
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// DELETE: remove historical row or baseline
export async function DELETE(request: Request) {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const table = searchParams.get('table') // 'historical' | 'baseline'
    const id = searchParams.get('id')

    if (!table || !id) return NextResponse.json({ error: 'table and id required' }, { status: 400 })

    const tableName = table === 'historical' ? 'iso50001_monthly_historical' : 'iso50001_baseline_model'
    const { error } = await supabase.from(tableName).delete().eq('id', Number(id))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
