import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        const items = Array.isArray(payload) ? payload : [payload];

        if (items.length === 0) {
            return NextResponse.json({ error: 'Payload array is empty' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase credentials missing on server' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Skip items without a date instead of throwing (graceful handling)
        const batchUpsert = items
            .filter(item => item && item.date)
            .map(item => ({
                work_date: item.date,
                meter_peak:    item.peak    != null ? Number(item.peak)    : null,
                meter_normal:  item.normal  != null ? Number(item.normal)  : null,
                meter_offpeak: item.offpeak != null ? Number(item.offpeak) : null,
                electricity_meter_reading: item.total != null ? Number(item.total) : null,
            }));

        if (batchUpsert.length === 0) {
            return NextResponse.json({ error: 'Missing date parameter - no valid items found' }, { status: 400 });
        }

        const { error } = await supabase
            .from('daily_energy')
            .upsert(batchUpsert, { onConflict: 'work_date' });

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Da day thanh cong ' + batchUpsert.length + ' ngay len He thong!' });
    } catch (e: any) {
        console.error('EVN API Sync Error:', e);
        return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
    }
}
