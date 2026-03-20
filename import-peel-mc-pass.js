const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iekjajbmbkqrbalnjwit.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Peeling MC dept ID
const PEEL_MC_DEPT_ID = 'be1d8dd5-a1ab-45e0-bc05-21bdfba7872c';

// Raw data: Date, Pass1 (kg), Pass2 (kg)
const rawData = [
    { date: '03/02/26', pass1: 22943, pass2: 2550 },
    { date: '03/03/26', pass1: 24900, pass2: 2825 },
    { date: '03/04/26', pass1: 16353, pass2: 1773 },
    { date: '03/05/26', pass1: 15809, pass2: 2001 },
    { date: '03/06/26', pass1: 17521, pass2: 2391 },
    { date: '03/07/26', pass1: 12496, pass2: 398 },
    { date: '03/09/26', pass1: 17493, pass2: 0 },
    { date: '03/10/26', pass1: 20731, pass2: 4509 },
    { date: '03/11/26', pass1: 15626, pass2: 2760 },
    { date: '03/12/26', pass1: 17754, pass2: 1771 },
    { date: '03/13/26', pass1: 18758, pass2: 2624 },
    { date: '03/14/26', pass1: 16849, pass2: 2780 },
    { date: '03/16/26', pass1: 12292, pass2: 1338 },
    { date: '03/17/26', pass1: 17422, pass2: 700 },
    { date: '03/18/26', pass1: 17559, pass2: 1843 },
];

async function run() {
    console.log('Importing Peeling MC Pass 1/2 data...');
    let success = 0;

    for (const row of rawData) {
        // Parse date: MM/DD/YY → YYYY-MM-DD
        const [mm, dd, yy] = row.date.split('/');
        const workDate = `20${yy}-${mm}-${dd}`;

        const pass1_ton = row.pass1 / 1000;
        const pass2_ton = row.pass2 / 1000;
        const actual_ton = pass1_ton + pass2_ton;

        const { error } = await supabase
            .from('daily_actual')
            .upsert({
                department_id: PEEL_MC_DEPT_ID,
                work_date: workDate,
                pass1_ton: pass1_ton,
                pass2_ton: pass2_ton,
                actual_ton: actual_ton,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'department_id,work_date' });

        if (error) {
            console.error(`Error for ${workDate}:`, error.message);
        } else {
            console.log(`✔ ${workDate}: Pass1=${pass1_ton.toFixed(3)}T, Pass2=${pass2_ton.toFixed(3)}T, Total=${actual_ton.toFixed(3)}T`);
            success++;
        }
    }

    console.log(`\nDone! ${success}/${rawData.length} records imported.`);
}

run().catch(console.error);
