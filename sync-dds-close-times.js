/**
 * sync-dds-close-times.js
 * Pull closed events from DDS (issues table) and update matching factory
 * dashboard downtime_events with correct end_time / duration_mins / is_ongoing.
 *
 * Match key: department_code + start_time (exact ISO string)
 */

const { createClient } = require('@supabase/supabase-js');

const ddsClient = createClient(
    process.env.DDS_SUPABASE_URL || 'https://qktvbvyznxpugsxoxarx.supabase.co',
    process.env.DDS_SUPABASE_KEY // set env var before running
);

const mainClient = createClient(
    process.env.SUPABASE_URL || 'https://iekjajbmbkqrbalnjwit.supabase.co',
    process.env.SUPABASE_SERVICE_KEY // set env var before running
);

const EXT_TO_NATIVE = {
    'Steaming': 'STEAM', 'Shelling': 'SHELL', 'Borma': 'BORMA',
    'Peeling MC': 'PEEL_MC', 'ColorSorter': 'CS',
    'HandPeeling': 'HAND', 'Packing': 'PACK'
};

async function run() {
    // 1. Fetch DDS closed issues that have an end_time
    const { data: ddsIssues, error: e1 } = await ddsClient
        .from('issues')
        .select('id, department, reason_code, start_time, end_time, duration_mins, is_ongoing, status')
        .eq('is_ongoing', false)
        .not('end_time', 'is', null)
        .range(0, 999);
    if (e1) { console.error('DDS fetch error:', e1.message); return; }
    console.log(`DDS closed issues with end_time: ${ddsIssues.length}`);

    // 2. Fetch factory dashboard downtime_events (all, to match by start_time)
    const { data: nativeEvents, error: e2 } = await mainClient
        .from('downtime_events')
        .select('id, department_id, start_time, is_ongoing, end_time, duration_mins')
        .range(0, 9999);
    if (e2) { console.error('Native fetch error:', e2.message); return; }
    console.log(`Factory events: ${nativeEvents.length}`);

    // 3. Fetch dept mapping
    const { data: depts } = await mainClient.from('departments').select('id, code');
    const codeToId = {};
    (depts || []).forEach(d => { codeToId[d.code] = d.id; });

    // 4. Build lookup map from native: key = dept_id + "|" + start_time
    const nativeByKey = {};
    for (const ev of nativeEvents) {
        if (!ev.start_time) continue;
        const key = `${ev.department_id}|${ev.start_time}`;
        nativeByKey[key] = ev;
    }

    // 5. Match DDS → native and collect updates
    let updated = 0, notFound = 0, alreadyClosed = 0;
    const toUpdate = [];

    for (const issue of ddsIssues) {
        const nativeCode = EXT_TO_NATIVE[issue.department];
        if (!nativeCode) continue;
        const deptId = codeToId[nativeCode];
        if (!deptId) continue;

        const key = `${deptId}|${issue.start_time}`;
        const native = nativeByKey[key];

        if (!native) {
            notFound++;
            continue;
        }

        const durationMins = Number(issue.duration_mins || 0) ||
            Math.max(0, Math.round((new Date(issue.end_time) - new Date(issue.start_time)) / 60000));

        toUpdate.push({
            id: native.id,
            end_time: issue.end_time,
            duration_mins: durationMins,
            is_ongoing: false,
            status: 'Closed'
        });
        console.log(`  → Match id=${native.id} | dept=${issue.department} | end=${issue.end_time} | ${durationMins} min`);
    }

    console.log(`\nTo update: ${toUpdate.length} | Already closed: ${alreadyClosed} | Not found: ${notFound}`);

    if (toUpdate.length === 0) {
        console.log('✅ Nothing to update!');
        return;
    }

    // 6. Apply updates one by one
    for (const upd of toUpdate) {
        const { error } = await mainClient.from('downtime_events').update({
            end_time: upd.end_time,
            duration_mins: upd.duration_mins,
            is_ongoing: false,
            status: 'Closed'
        }).eq('id', upd.id);
        if (error) console.error(`  ❌ Failed id=${upd.id}:`, error.message);
        else updated++;
    }

    console.log(`\n✅ Done: ${updated} events updated.`);
}

run();
