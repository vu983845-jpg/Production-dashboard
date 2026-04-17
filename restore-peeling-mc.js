const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PEEL_ID = '4dafa191-cb40-4ff4-9156-4a3f93d338f8';

const data = [
    { date: '2026-04-01', actual: 8.5, elec: 2000, dt: 600, brk: 9.3, unp: 9.0 },
    { date: '2026-04-02', actual: 21.5, elec: 0, dt: 0, brk: 9.3, unp: 9.0 },
    { date: '2026-04-03', actual: 23.5, elec: 0, dt: 0, brk: 9.3, unp: 9.0 },
    { date: '2026-04-04', actual: 27.8, elec: 0, dt: 0, brk: 9.3, unp: 9.0 },
    { date: '2026-04-06', actual: 24.5, elec: 0, dt: 0, brk: 9.3, unp: 9.0 },
    { date: '2026-04-07', actual: 25.5, elec: 0, dt: 0, brk: 9.3, unp: 9.0 },
    { date: '2026-04-08', actual: 28.0, elec: 0, dt: 0, brk: 9.3, unp: 9.0 },
    { date: '2026-04-09', actual: 26.0, elec: 0, dt: 0, brk: 9.3, unp: 9.0 },
    { date: '2026-04-10', actual: 22.5, elec: 0, dt: 0, brk: 9.3, unp: 9.0 },
    { date: '2026-04-11', actual: 14.5, elec: 0, dt: 500, brk: 9.3, unp: 9.0 },
    { date: '2026-04-13', actual: 24.5, elec: 0, dt: 370, brk: 9.3, unp: 9.0 },
];

async function restore() {
    console.log('Restoring Peeling MC data for April...');

    // Convert 2MWh to kwh
    let currentMeter = 0;

    for (const row of data) {
        // daily_actual
        await supabase.from('daily_actual').upsert({
            department_id: PEEL_ID,
            work_date: row.date,
            actual_ton: row.actual,
            updated_at: new Date().toISOString()
        }, { onConflict: 'department_id,work_date' });

        // daily_kpi for downtime 
        await supabase.from('daily_kpi').upsert({
            department_id: PEEL_ID,
            work_date: row.date,
            downtime_min: row.dt,
            updated_at: new Date().toISOString()
        }, { onConflict: 'department_id,work_date' });

        // peeling_line_daily (line A, shift Ca 1) for quality
        await supabase.from('peeling_line_daily').upsert({
            department_id: PEEL_ID,
            work_date: row.date,
            line_code: 'A',
            shift_name: 'Ca 1',
            actual_ton: row.actual,
            broken_pct: row.brk,
            unpeel_pct: row.unp,
            updated_at: new Date().toISOString()
        }, { onConflict: 'department_id,work_date,line_code,shift_name' });

        // db_ac_hca inside daily_electricity_others
        if (row.elec > 0) {
            await supabase.from('daily_electricity_others').upsert({
                work_date: row.date,
                db_ac_hca: row.elec,
                updated_at: new Date().toISOString()
            }, { onConflict: 'work_date' });
        }
    }

    // Generate daily_plan for the remaining working days up to 30 April
    const planPerDay = 480.0 / 26; // approx 18.46
    for (let day = 1; day <= 30; day++) {
        const d = new Date(2026, 3, day);
        if (d.getDay() === 0) continue; // Skip Sundays

        const dateStr = `2026-04-${day.toString().padStart(2, '0')}`;
        await supabase.from('daily_plan').upsert({
            department_id: PEEL_ID,
            work_date: dateStr,
            plan_ton: planPerDay,
            updated_at: new Date().toISOString()
        }, { onConflict: 'department_id,work_date' });
    }

    console.log('Peeling MC restoration complete!');
}

restore();
