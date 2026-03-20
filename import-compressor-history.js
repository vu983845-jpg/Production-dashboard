const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iekjajbmbkqrbalnjwit.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Data from user: MWh
const rawData = [
    { date: '1/3/2026', meter1: 483.18, meter2: 346.11, meter3: 1371.5 },
    { date: '2/3/2026', meter1: 484.25, meter2: 346.86, meter3: 1375.9 },
    { date: '3/3/2026', meter1: 485.14, meter2: 347.51, meter3: 1379.6 },
    { date: '4/3/2026', meter1: 486.53, meter2: 347.98, meter3: 1384.6 },
    { date: '5/3/2026', meter1: 487.88, meter2: 348.42, meter3: 1389.2 },
    { date: '6/3/2026', meter1: 489.19, meter2: 348.71, meter3: 1394 },
    { date: '7/3/2026', meter1: 490.73, meter2: 349.49, meter3: 1398.9 },
    { date: '8/3/2026', meter1: 490.73, meter2: 349.49, meter3: 1398.9 },
    { date: '9/3/2026', meter1: 491.72, meter2: 349.68, meter3: 1402.5 },
    { date: '10/3/2026', meter1: 493.04, meter2: 349.78, meter3: 1407 },
    { date: '11/3/2026', meter1: 494.76, meter2: 349.89, meter3: 1412.5 },
    { date: '12/3/2026', meter1: 496.10, meter2: 350.28, meter3: 1417.2 },
    { date: '13/3/2026', meter1: 497.40, meter2: 350.71, meter3: 1421.8 },
    { date: '14/3/2026', meter1: 498.85, meter2: 351.11, meter3: 1426.8 },
    { date: '15/3/2026', meter1: 498.85, meter2: 351.11, meter3: 1426.8 },
];

async function run() {
    console.log('Importing Compressor Data (MWh) ...');
    let success = 0;

    for (const row of rawData) {
        // Parse date: D/M/YYYY → YYYY-MM-DD
        const [dd, mm, yyyy] = row.date.split('/');
        const workDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;

        const { error } = await supabase
            .from('daily_compressor')
            .upsert({
                work_date: workDate,
                meter1: row.meter1,
                meter2: row.meter2,
                meter3: row.meter3,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'work_date' });

        if (error) {
            console.error(`Error for ${workDate}:`, error.message);
        } else {
            console.log(`✔ ${workDate}: ĐH1=${row.meter1}, ĐH2=${row.meter2}, ĐH3=${row.meter3}`);
            success++;
        }
    }

    console.log(`\nDone! ${success}/${rawData.length} records imported.`);
}

run().catch(console.error);
