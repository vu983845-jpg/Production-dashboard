const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) process.env[k] = envConfig[k];

const ddsClient = createClient(
    'https://qktvbvyznxpugsxoxarx.supabase.co',
    'sb_publishable_agrIIWuEfWaheajFAK2cKQ_NQgIiZsC'
);
const mainClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXT_TO_NATIVE = {
    'Steaming': 'STEAM', 'Shelling': 'SHELL', 'Borma': 'BORMA',
    'Peeling MC': 'PEEL_MC', 'ColorSorter': 'CS', 'HandPeeling': 'HAND', 'Packing': 'PACK'
};

async function run() {
    // Fetch everything in parallel
    const [ddsFetch, deptsFetch, nativeFetch] = await Promise.all([
        ddsClient.from('issues').select('*').range(0, 999),
        mainClient.from('departments').select('id, code'),
        mainClient.from('downtime_events').select('department_id, work_date, duration_mins, root_cause')
    ]);

    const allDds = ddsFetch.data || [];
    const depts = deptsFetch.data || [];
    const nativeEvents = nativeFetch.data || [];

    console.log(`DDS: ${allDds.length}  |  Depts: ${depts.length}  |  Native existing: ${nativeEvents.length}`);

    const getDeptId = (code) => depts.find(d => d.code === code)?.id;

    function toWorkDate(start_time) {
        if (!start_time) return null;
        const vnMs = new Date(start_time).getTime() + 7 * 3600000;
        const vn = new Date(vnMs);
        let d = vn.toISOString().split('T')[0];
        if (vn.getUTCHours() < 6) d = new Date(vnMs - 86400000).toISOString().split('T')[0];
        return d;
    }

    // Build a set of existing keys to skip duplicates
    const existingKeys = new Set(nativeEvents.map(e => `${e.department_id}|${e.work_date}|${e.duration_mins}|${e.root_cause}`));

    // Build the rows to insert (all at once)
    const toInsert = [];
    for (const issue of allDds) {
        if (!issue.reason_code) continue;
        const nativeCode = EXT_TO_NATIVE[issue.department];
        if (!nativeCode) continue;
        const deptId = getDeptId(nativeCode);
        if (!deptId) continue;
        const workDate = toWorkDate(issue.start_time);
        if (!workDate) continue;
        const dur = Number(issue.duration_mins || 0);

        const key = `${deptId}|${workDate}|${dur}|${issue.reason_code}`;
        if (existingKeys.has(key)) continue;

        existingKeys.add(key); // prevent inserting same row twice from DDS
        toInsert.push({
            department_id: deptId,
            work_date: workDate,
            start_time: issue.start_time,
            end_time: issue.end_time || null,
            duration_mins: dur,
            root_cause: issue.reason_code,
            machine_area: issue.machine_area?.trim() || null,
            severity: issue.impact_level || 'Medium',
            description: null,
            note: issue.description?.trim() || null,
            is_ongoing: issue.is_ongoing || false,
            exclude_downtime: issue.is_downtime === false,
            status: issue.status || 'Closed'
        });
    }

    console.log(`Rows to insert: ${toInsert.length}`);
    if (toInsert.length === 0) { console.log('Nothing to insert.'); return; }

    // Bulk insert (upsert to be safe)
    const { error } = await mainClient.from('downtime_events').insert(toInsert);
    if (error) console.error('Insert error:', error.message);
    else console.log(`✅ Successfully inserted ${toInsert.length} missing records.`);
}

run();
