const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const data = `CN	1/3/2026	483.18	346.11	1371.5
2	2/3/2026	484.25	346.86	1375.9
3	3/3/2026	485.14	347.51	1379.6
4	4/3/2026	486.53	347.98	1384.6
5	5/3/2026	487.88	348.42	1389.2
6	6/3/2026	489.19	348.71	1394
7	7/3/2026	490.73	349.49	1398.9
CN	8/3/2026	490.73	349.49	1398.9
2	9/3/2026	491.72	349.68	1402.5
3	10/3/2026	493.04	349.78	1407
4	11/3/2026	494.76	349.89	1412.5
5	12/3/2026	496.10	350.28	1417.2
6	13/3/2026	497.40	350.71	1421.8
7	14/3/2026	498.85	351.11	1426.8
CN	15/3/2026	498.85	351.11	1426.8`;

async function run() {
    // 1. Clean the old mistaken meter1 data
    // The mistaken data was in the hundreds of thousands (e.g., 483180) because it was in KWh not MWh.
    // Let's set it to null if it's over 100,000 to be safe.
    
    // We can't do update with filter on JS easily unless we fetch all, modify, upsert.
    // Actually we can execute a simple JS update query if it's supported:
    const { error: clearError } = await supabase
        .from('daily_compressor')
        .update({ meter1: null })
        .gte('meter1', 10000);

    if (clearError) {
       console.error("Clear error:", clearError);
    } else {
       console.log("Successfully cleared old wrong meter1 data (values > 10,000).");
    }

    // 2. Process new correct data
    const lines = data.split('\n');
    let compressorPayload = [];

    for (let i = 0; i < lines.length; i++) {
        let cols = lines[i].split('\t');
        if (cols.length < 5) continue; // Skip empty
        
        // cols[0] is Day of week (CN, 2, 3...)
        // cols[1] is Date (D/M/YYYY)
        const dateStr = cols[1].trim();
        if (!dateStr) continue;
        
        const parts = dateStr.split('/');
        if (parts.length !== 3) continue;
        
        // Correctly parse D/M/YYYY -> YYYY-MM-DD
        const [d, m, y] = parts; 
        const isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

        const meter1 = Number(cols[2].trim());
        const meter2 = Number(cols[3].trim());
        const meter3 = Number(cols[4].trim());

        compressorPayload.push({
            work_date: isoDate,
            meter1: isNaN(meter1) ? undefined : meter1,
            meter2: isNaN(meter2) ? undefined : meter2,
            meter3: isNaN(meter3) ? undefined : meter3,
            updated_at: new Date().toISOString()
        });
    }

    console.log(`Prepared ${compressorPayload.length} rows for Compressor.`);

    if (compressorPayload.length > 0) {
        // Safe upsert by merging with existing constraints
        const { data: existingComp } = await supabase.from('daily_compressor').select('*');
        const compMap = new Map((existingComp || []).map(r => [r.work_date, r]));

        const safeCompressorPayload = compressorPayload.map(newRec => {
            const existing = compMap.get(newRec.work_date) || {};
            return {
                ...existing, // Keep other generic columns
                work_date: newRec.work_date,
                meter1: newRec.meter1 !== undefined ? newRec.meter1 : existing.meter1,
                meter2: newRec.meter2 !== undefined ? newRec.meter2 : existing.meter2,
                meter3: newRec.meter3 !== undefined ? newRec.meter3 : existing.meter3,
                updated_at: newRec.updated_at
            };
        });

        const { error: compError } = await supabase
            .from('daily_compressor')
            .upsert(safeCompressorPayload, { onConflict: 'work_date' });

        if (compError) console.error("Error upserting Compressor:", compError);
        else console.log("Successfully upserted correct Compressor MWh data.");
    }
}

run();
