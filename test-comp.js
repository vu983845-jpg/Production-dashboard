const { createClient } = require('@supabase/supabase-js');
const { format, subDays, startOfMonth } = require('date-fns');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xczzowebjdfhswdnhuuo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Run with dotenv.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const selectedMonth = new Date('2026-03-01T00:00:00');
    const startFilter = "2026-03-01";
    const endFilter = "2026-03-31";
    
    // Fetch daily compressor
    const prevMonthDateStr = format(subDays(startOfMonth(selectedMonth), 1), "yyyy-MM-dd");
    const { data: compData, error } = await supabase
        .from('daily_compressor')
        .select('*')
        .gte('work_date', prevMonthDateStr)
        .lte('work_date', endFilter)
        .order('work_date');

    if (error) {
        console.error(error); return;
    }

    let dailyCompressorKwhMap = {};
    const mapByDate = Object.fromEntries(compData.map(c => [c.work_date, c]));
    const daysInSelectedMonth = compData.filter(c => c.work_date >= startFilter);
    
    daysInSelectedMonth.forEach(curr => {
        const prevDateStr = format(subDays(new Date(curr.work_date), 1), "yyyy-MM-dd");
        const prev = mapByDate[prevDateStr];
                        
        if (prev) {
            const m1 = Math.max(0, (curr.meter1||0) - (prev.meter1||0)) * 1000;
            const m2 = Math.max(0, (curr.meter2||0) - (prev.meter2||0)) * 1000;
            const m3 = Math.max(0, (curr.meter3||0) - (prev.meter3||0)) * 1000;
            const dailyTotal = m1 + m2 + m3;
            const normalizedDate = format(new Date(curr.work_date), 'yyyy-MM-dd');
            dailyCompressorKwhMap[normalizedDate] = dailyTotal;
            console.log(`Compressor on ${normalizedDate} (raw ${curr.work_date}): ${dailyTotal} kWh`);
        } else {
            console.log(`NO PREV DATA for ${curr.work_date}`);
        }
    });

    console.log("Map:", dailyCompressorKwhMap);

    // Fetch v_dashboard_daily for PEEL_MC
    const { data: dData } = await supabase
        .from('v_dashboard_daily')
        .select('*')
        .gte('work_date', startFilter)
        .lte('work_date', endFilter)
        .eq('dept_code', 'PEEL_MC')
        .order('work_date');
        
    if (dData && dData.length > 0) {
        dData.forEach(r => {
            const normalizedHDate = format(new Date(r.work_date), 'yyyy-MM-dd');
            const kwh = dailyCompressorKwhMap[normalizedHDate] || 0;
            const intensity = r.actual_ton > 0 ? Number((kwh / r.actual_ton).toFixed(2)) : 0;
            console.log(`PEEL_MC on ${r.work_date} (norm ${normalizedHDate}): actual=${r.actual_ton}, kwh=${kwh}, intensity=${intensity}`);
        });
    }

}
check();
