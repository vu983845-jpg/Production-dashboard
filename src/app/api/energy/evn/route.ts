import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        const { date, peak, normal, offpeak, total } = payload;

        if (!date) {
            return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 });
        }

        // Use service role key since this is a server-to-server(extension) API call without a user session cookie
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase credentials missing on server' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Map the payload to Supabase DB structure
        const upsertData = {
            work_date: date,
            meter_peak: peak != null ? Number(peak) : null,
            meter_normal: normal != null ? Number(normal) : null,
            meter_offpeak: offpeak != null ? Number(offpeak) : null,
            electricity_meter_reading: total != null ? Number(total) : null, // The total meter index 
        };

        const { data, error } = await supabase
            .from('daily_energy')
            .upsert(upsertData, { onConflict: 'work_date' });

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Data synced successfully!' });
    } catch (e: any) {
        console.error("EVN API Sync Error:", e);
        return NextResponse.json({ error: e.message || 'Internal error processing the EVN sync payload' }, { status: 500 });
    }
}
