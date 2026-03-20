const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const data = `4	25/2/2026	331963	24787662
5	26/2/2026	332318	24787970
6	27/2/2026	332703	24788329
7	28/2/2026	333099	24788708
CN	1/3/2026	333099	24788708
2	2/3/2026	333506	24789013
3	3/3/2026	333879	24789317
4	4/3/2026	334424	24789634
5	5/3/2026	335010	24789912
6	6/3/2026	335705	24790191
7	7/3/2026	336178	24790571
CN	8/3/2026	336178	24790571
2	9/3/2026	336687	24790994
3	10/3/2026	337175	24790994
4	11/3/2026	337655	24790994
5	12/3/2026	338140	24790994
6	13/3/2026	338575	24790994
7	14/3/2026	339205	24790994
CN	15/3/2026	339205	24790994
2	16/3/2026	339859	24792911
3	17/3/2026	340584	24793164
4	18/3/2026	341302	24793585
5	19/3/2026	341993	24793898
6	20/3/2026	342562	24794198`;

async function run() {
    const lines = data.split('\n');
    let extraPayload = [];

    for (let i = 0; i < lines.length; i++) {
        let cols = lines[i].split('\t');
        if (cols.length < 4) continue;
        
        const dateStr = cols[1].trim();
        if (!dateStr) continue;
        const parts = dateStr.split('/');
        if (parts.length !== 3) continue;
        
        const [d, m, y] = parts; 
        const isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

        const fan = Number(cols[2].trim());
        const boiler = Number(cols[3].trim());

        extraPayload.push({
            work_date: isoDate,
            cooling_fan: isNaN(fan) ? undefined : fan,
            boiler: isNaN(boiler) ? undefined : boiler,
            updated_at: new Date().toISOString()
        });
    }

    if (extraPayload.length > 0) {
        const { data: existingOthers } = await supabase.from('daily_electricity_others').select('*');
        const map = new Map((existingOthers || []).map(r => [r.work_date, r]));

        const safePayload = extraPayload.map(newRec => {
            const existing = map.get(newRec.work_date) || {};
            const cleanExisting = { ...existing };
            // Remove readonly DB generated fields to avoid mixing them into updates
            delete cleanExisting.id;
            delete cleanExisting.created_at;

            return {
                ...cleanExisting,
                work_date: newRec.work_date,
                cooling_fan: newRec.cooling_fan !== undefined ? newRec.cooling_fan : cleanExisting.cooling_fan,
                boiler: newRec.boiler !== undefined ? newRec.boiler : cleanExisting.boiler,
                updated_at: newRec.updated_at
            };
        });

        const { error } = await supabase
            .from('daily_electricity_others')
            .upsert(safePayload, { onConflict: 'work_date' });

        if (error) console.error("Error upserting:", error);
        else console.log("Successfully upserted Cooling Fan & Boiler!");
    }
}

run();
