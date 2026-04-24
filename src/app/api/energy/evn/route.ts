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

        // Filter valid items
        const validItems = items.filter(item => item && item.date);
        if (validItems.length === 0) {
            return NextResponse.json({ error: 'Missing date parameter - no valid items found' }, { status: 400 });
        }

        // Sort by date ascending to calculate deltas correctly
        validItems.sort((a, b) => a.date < b.date ? -1 : 1);

        // Fetch the previous day's reading as baseline for the first item
        const firstDate = validItems[0].date;
        const { data: prevRow } = await supabase
            .from('daily_energy')
            .select('work_date, meter_peak, meter_normal, meter_offpeak, electricity_meter_reading')
            .lt('work_date', firstDate)
            .order('work_date', { ascending: false })
            .limit(1)
            .single();

        // Build list with baseline prepended for delta calculation
        const allReadings = [
            ...(prevRow ? [prevRow] : []),
            ...validItems.map(item => ({
                work_date: item.date,
                meter_peak: item.peak != null ? Number(item.peak) : null,
                meter_normal: item.normal != null ? Number(item.normal) : null,
                meter_offpeak: item.offpeak != null ? Number(item.offpeak) : null,
                electricity_meter_reading: item.total != null ? Number(item.total) : null,
            }))
        ];

        // Calculate kWh delta for each item (curr - prev), handling gaps in days
        const batchUpsert = validItems.map((item, idx) => {
            const curr = allReadings[idx + (prevRow ? 1 : 0)];
            const prev = allReadings[idx + (prevRow ? 1 : 0) - 1];

            let peak_kwh: number | null = null;
            let normal_kwh: number | null = null;
            let offpeak_kwh: number | null = null;
            let total_kwh: number | null = null;

            if (prev) {
                const diffDays = Math.max(1,
                    (new Date(curr.work_date).getTime() - new Date(prev.work_date).getTime()) / 86400000
                );

                if (curr.meter_peak != null && prev.meter_peak != null) {
                    peak_kwh = Math.max(0, (curr.meter_peak - prev.meter_peak) / diffDays);
                }
                if (curr.meter_normal != null && prev.meter_normal != null) {
                    normal_kwh = Math.max(0, (curr.meter_normal - prev.meter_normal) / diffDays);
                }
                if (curr.meter_offpeak != null && prev.meter_offpeak != null) {
                    offpeak_kwh = Math.max(0, (curr.meter_offpeak - prev.meter_offpeak) / diffDays);
                }
                if (curr.electricity_meter_reading != null && prev.electricity_meter_reading != null) {
                    total_kwh = Math.max(0, (curr.electricity_meter_reading - prev.electricity_meter_reading) / diffDays);
                }
                // If we have peak+normal+offpeak breakdown, use their sum as total
                if (peak_kwh != null && normal_kwh != null && offpeak_kwh != null) {
                    total_kwh = peak_kwh + normal_kwh + offpeak_kwh;
                }
            }

            return {
                work_date: item.date,
                meter_peak: curr.meter_peak,
                meter_normal: curr.meter_normal,
                meter_offpeak: curr.meter_offpeak,
                electricity_meter_reading: curr.electricity_meter_reading,
                // Also write computed kWh so dashboard picks them up immediately
                ...(peak_kwh != null ? { electricity_peak_kwh: peak_kwh } : {}),
                ...(normal_kwh != null ? { electricity_normal_kwh: normal_kwh } : {}),
                ...(offpeak_kwh != null ? { electricity_offpeak_kwh: offpeak_kwh } : {}),
                ...(total_kwh != null ? { electricity_kwh: total_kwh } : {}),
            };
        });

        const { error } = await supabase
            .from('daily_energy')
            .upsert(batchUpsert, { onConflict: 'work_date' });

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: `Đã đẩy thành công ${batchUpsert.length} ngày lên hệ thống! Điện kWh đã được tính tự động.`,
            computed: batchUpsert.map(r => ({ date: r.work_date, kwh: r.electricity_kwh?.toFixed(1) ?? 'N/A' }))
        });
    } catch (e: any) {
        console.error('EVN API Sync Error:', e);
        return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
    }
}
