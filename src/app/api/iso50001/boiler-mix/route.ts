import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isIsoEditor, parseBoilerMixPayload } from '@/lib/iso50001-boiler-mix'

export const dynamic = 'force-dynamic'
const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/
const columns = 'id,month_year,self_steamed_rcn_kg,received_precut_rcn_kg,receipt_basis,borma_input_kg,borma_input_basis,borma_runtime_hours,moisture_in_pct,moisture_out_pct,data_quality_status,notes,created_by,created_at,updated_by,updated_at'

function databaseError(error: { code?: string }) {
  if (['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error.code ?? '')) {
    return NextResponse.json({ code: 'SCHEMA_NOT_READY', error: 'Boiler tracking migration is required' }, { status: 503 })
  }
  return NextResponse.json({ error: 'Unable to access boiler tracking' }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const params = new URL(request.url).searchParams
    const month = params.get('month')
    if ([...params.keys()].some(key => key !== 'month') || params.getAll('month').length > 1 || (month !== null && !monthPattern.test(month))) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    }
    let query = supabase.from('iso50001_boiler_process_mix').select(columns).order('month_year', { ascending: false })
    if (month) query = query.eq('month_year', `${month}-01`)
    const { data, error } = await query
    if (error) return databaseError(error)
    return NextResponse.json({ data: month ? data?.[0] ?? null : data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Unable to load boiler tracking' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError) return NextResponse.json({ error: 'Unable to verify role' }, { status: 500 })
    if (!isIsoEditor(profile?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const payload = parseBoilerMixPayload(await request.json())
    // Creation audit is assigned/preserved by the database trigger, including conflict updates.
    const { data, error } = await supabase.from('iso50001_boiler_process_mix')
      .upsert({ ...payload, updated_by: user.id }, { onConflict: 'month_year' }).select(columns).single()
    if (error) return databaseError(error)
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid boiler tracking payload' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Unable to save boiler tracking' }, { status: 500 })
  }
}
