const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const HPEEL_ID = '321918c2-8a35-45b3-9c6c-5f68966776bf';

const data = [
    { date: '2026-04-01', actual: 2.7, isp: 1.1 },
    { date: '2026-04-02', actual: 3.0, isp: 1.3 },
    { date: '2026-04-03', actual: 3.2, isp: 1.4 },
    { date: '2026-04-04', actual: 3.1, isp: 1.3 },
    { date: '2026-04-06', actual: 3.3, isp: 1.4 },
    { date: '2026-04-07', actual: 3.5, isp: 1.3 },
    { date: '2026-04-08', actual: 3.0, isp: 1.4 },
    { date: '2026-04-09', actual: 3.3, isp: 1.4 },
    { date: '2026-04-10', actual: 3.5, isp: 1.5 },
    { date: '2026-04-11', actual: 3.0, isp: 1.4 },
    { date: '2026-04-13', actual: 3.2, isp: 1.1 },
    { date: '2026-04-14', actual: 2.4, isp: 1.2 },
    { date: '2026-04-15', actual: 2.3, isp: 0.9 },
];

async function restore() {
    console.log('Restoring Handpeeling data for April...');

    // Restore daily_actual
    for (const row of data) {
        const { error } = await supabase.from('daily_actual').upsert({
            department_id: HPEEL_ID,
            work_date: row.date,
            actual_ton: row.actual,
            isp_ton: row.isp,
            updated_at: new Date().toISOString()
        }, { onConflict: 'department_id,work_date' });
        if (error) console.error('Actual Error:', error);
    }

    // Restore daily_plan for all 26 working days in April
    for (let day = 1; day <= 30; day++) {
        const d = new Date(2026, 3, day);
        if (d.getDay() === 0) continue; // Skip Sundays

        const dateStr = `2026-04-${day.toString().padStart(2, '0')}`;
        const { error } = await supabase.from('daily_plan').upsert({
            department_id: HPEEL_ID,
            work_date: dateStr,
            plan_ton: 3.0,
            updated_at: new Date().toISOString()
        }, { onConflict: 'department_id,work_date' });
        if (error) console.error('Plan Error:', error);
    }

    console.log('Handpeeling restoration complete!');
}

restore();
