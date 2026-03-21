require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    // Get ALL compressor records of March 2026 + Feb 28 for context
    const { data, error } = await supabase
        .from('daily_compressor')
        .select('*')
        .gte('work_date', '2026-02-28')
        .lte('work_date', '2026-03-31')
        .order('work_date', { ascending: true });
    
    if (error) { console.error(error); return; }
    
    console.log(`\nTotal records found: ${data.length}`);
    data.forEach(r => {
        console.log(`${r.work_date}: m1=${r.meter1}, m2=${r.meter2}, m3=${r.meter3}`);
    });
    
    // Replicate dashboard logic exactly
    const mapByDate = Object.fromEntries(data.map(c => [c.work_date, c]));
    const daysInMonth = data.filter(c => c.work_date >= '2026-03-01');
    
    let totalCompressorKwhMtd = 0;
    console.log('\n=== Dashboard calc simulation ===');
    daysInMonth.forEach(curr => {
        const d = new Date(curr.work_date);
        d.setDate(d.getDate() - 1);
        const prevDateStr = d.toISOString().split('T')[0];
        const prev = mapByDate[prevDateStr];
        if (prev) {
            const m1 = Math.max(0, (curr.meter1||0) - (prev.meter1||0)) * 1000;
            const m2 = Math.max(0, (curr.meter2||0) - (prev.meter2||0)) * 1000;
            const m3 = Math.max(0, (curr.meter3||0) - (prev.meter3||0)) * 1000;
            const daily = m1 + m2 + m3;
            totalCompressorKwhMtd += daily;
            console.log(`${curr.work_date}: +${daily.toFixed(0)} kWh (Running total: ${totalCompressorKwhMtd.toFixed(0)})`);
        } else {
            console.log(`${curr.work_date}: no prev (${prevDateStr}), skipped`);
        }
    });
    console.log(`\nFINAL totalCompressorKwhMtd = ${totalCompressorKwhMtd.toFixed(0)} kWh`);
}
main();
