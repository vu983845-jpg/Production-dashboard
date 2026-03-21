import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET: fetch daily entries for a month
export async function GET(request: Request) {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // YYYY-MM

    if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

    const [year, mon] = month.split('-').map(Number)
    const startDate = `${year}-${String(mon).padStart(2, '0')}-01`
    const endDate = new Date(year, mon, 0).toISOString().slice(0, 10)

    const { data, error } = await supabase
        .from('iso50001_daily_entry')
        .select('*, seu:iso50001_seu_master(name, energy_type, unit)')
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .order('entry_date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
}

// POST: upsert a daily entry
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { entry_date, seu_id, actual_energy, rcn_hap_duoc_kg, notes } = body

    if (!entry_date || !seu_id || actual_energy == null || rcn_hap_duoc_kg == null) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('iso50001_daily_entry')
        .upsert(
            {
                entry_date,
                seu_id: Number(seu_id),
                actual_energy: Number(actual_energy),
                rcn_hap_duoc_kg: Number(rcn_hap_duoc_kg),
                notes: notes || null,
                created_by: session.user.id,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'entry_date,seu_id' }
        )
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
}

// DELETE: remove an entry by id
export async function DELETE(request: Request) {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { error } = await supabase.from('iso50001_daily_entry').delete().eq('id', Number(id))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
