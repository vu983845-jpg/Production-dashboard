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
    // 1. Fetch ALL DDS records (no filter, to get everything)
    let allDds = [];
    let from = 0;
    while (true) {
        const { data: batch, error } = await ddsClient
            .from('issues')
            .select('id, department, reason_code, machine_area, start_time, end_time, duration_mins, is_ongoing, status, description, notes')
            .range(from, from + 999);
        if (error) { console.error('DDS error:', error.message); break; }
        if (!batch || batch.length === 0) break;
        allDds = allDds.concat(batch);
        from += batch.length;
        if (batch.length < 1000) break;
    }
    console.log(`Total DDS records: ${allDds.length}`);
    if (allDds.length > 0) {
        console.log('Reason codes:', [...new Set(allDds.map(r => r.reason_code).filter(Boolean))]);
        console.log('Departments:', [...new Set(allDds.map(r => r.department))]);
    }

    // 2. Native deps
    const { data: depts } = await mainClient.from('departments').select('id, code');
    const getDeptId = (code) => depts?.find(d => d.code === code)?.id;

    // 3. Native events
    const { data: nativeEvents } = await mainClient
        .from('downtime_events')
        .select('id, department_id, work_date, duration_mins, root_cause, machine_area');
    console.log(`Native events: ${nativeEvents?.length}`);

    // 4. Match by dept + duration_mins (primary key match since same data was migrated)
    let updated = 0, notFound = 0;

    for (const issue of allDds) {
        const nativeCode = EXT_TO_NATIVE[issue.department];
        if (!nativeCode) { notFound++; continue; }
        const deptId = getDeptId(nativeCode);
        if (!deptId) { notFound++; continue; }

        const dur = Number(issue.duration_mins || 0);

        // Parse VN work_date
        let workDate = null;
        if (issue.start_time) {
            const st = new Date(issue.start_time);
            const vnMs = st.getTime() + 7 * 3600 * 1000;
            const vnDate = new Date(vnMs);
            workDate = vnDate.toISOString().split('T')[0];
            const vnHour = vnDate.getUTCHours();
            if (vnHour < 6) {
                workDate = new Date(vnMs - 86400000).toISOString().split('T')[0];
            }
        }

        // Match: same dept + same duration + nearby date
        let matchIdx = nativeEvents?.findIndex(e =>
            e.department_id === deptId &&
            e.duration_mins === dur &&
            e.work_date === workDate
        );

        // Relax date ±1 if not found
        if (matchIdx === -1 && workDate) {
            const d = new Date(workDate);
            const prev = new Date(d.getTime() - 86400000).toISOString().split('T')[0];
            const next = new Date(d.getTime() + 86400000).toISOString().split('T')[0];
            matchIdx = nativeEvents.findIndex(e =>
                e.department_id === deptId &&
                e.duration_mins === dur &&
                (e.work_date === prev || e.work_date === next)
            );
        }

        if (matchIdx >= 0) {
            const match = nativeEvents[matchIdx];
            // Remove from pool so duplicate durations don't match same record twice
            nativeEvents.splice(matchIdx, 1);

            const reasonCode = issue.reason_code && issue.reason_code.length <= 5 ? issue.reason_code : 'WT';
            const machineArea = issue.machine_area?.trim() || null;

            const { error: ue } = await mainClient
                .from('downtime_events')
                .update({
                    root_cause: reasonCode,
                    machine_area: machineArea,
                    start_time: issue.start_time || null,
                    end_time: issue.end_time || null,
                    is_ongoing: issue.is_ongoing || false,
                    status: issue.status || 'Closed',
                    description: issue.description?.trim() || null,
                    note: issue.notes?.trim() || null,
                    exclude_downtime: false
                })
                .eq('id', match.id);

            if (ue) console.error(`Error updating ${match.id}:`, ue.message);
            else {
                updated++;
                console.log(`✓ ${issue.department} | ${workDate} | ${dur}min | ${reasonCode} | ${machineArea || '—'}`);
            }
        } else {
            notFound++;
            if (dur > 0) console.log(`  ✗ No match: ${issue.department} ${workDate} ${dur}min`);
        }
    }

    console.log(`\n=== DONE ===`);
    console.log(`✅ Updated: ${updated} / ${allDds.length}`);
    console.log(`⚠️  Not matched: ${notFound}`);
}

run();
