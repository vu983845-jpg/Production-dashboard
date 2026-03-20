const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // Current data is extremely large because we did office * 100,000 to reach user's intended x1000 scale.
    // User says "không cần x1000", meaning we revert entirely.
    
    const { data: selectData } = await supabase.from('daily_electricity_others')
        .select('work_date, office')
        .not('office', 'is', null)
        .gte('work_date', '2025-09-05');

    if (!selectData || selectData.length === 0) {
        console.log("No data found.");
        return;
    }

    const payload = selectData.map(r => ({
        work_date: r.work_date,
        office: r.office / 100000,
        updated_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('daily_electricity_others')
        .upsert(payload, { onConflict: 'work_date' });
        
    if (error) console.error("Error updating:", error);
    else console.log(`Reverted ${payload.length} rows to original / 100 values.`);
}

run();
