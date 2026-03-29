const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL || 'https://iekjajbmbkqrbalnjwit.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // set env var before running
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixOpenEvents() {
    // 1. Fetch all ongoing events
    const { data: openEvents, error } = await supabase
        .from('downtime_events')
        .select('id, work_date, start_time, end_time, duration_mins, root_cause')
        .eq('is_ongoing', true);

    if (error) { console.error('❌ Error fetching:', error.message); return; }
    console.log(`Found ${openEvents.length} ongoing event(s):\n`);
    openEvents.forEach(e => console.log(`  id=${e.id} | date=${e.work_date} | start=${e.start_time} | end=${e.end_time} | duration_mins=${e.duration_mins} | code=${e.root_cause}`));

    if (!openEvents.length) { console.log('\n✅ No open events — nothing to fix!'); return; }

    // 2. For each, calculate correct duration_mins and close it
    let fixed = 0, skipped = 0;
    for (const evt of openEvents) {
        let mins = Number(evt.duration_mins || 0);
        let endTime = evt.end_time;

        if (evt.start_time && endTime) {
            // Has both start + end → recalculate duration
            mins = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(evt.start_time).getTime()) / 60000));
        } else if (evt.start_time && !endTime) {
            // No end_time → close as of the end of work_date (23:59)
            endTime = `${evt.work_date}T23:59:00+07:00`;
            mins = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(evt.start_time).getTime()) / 60000));
            console.log(`  → No end_time for id=${evt.id}, closing at ${endTime} (${mins} min)`);
        } else if (mins > 0) {
            // Has stored duration without start — just close it
            console.log(`  → No start_time for id=${evt.id}, keeping stored duration ${mins} min`);
        } else {
            console.log(`  ⚠️ Skipping id=${evt.id} — no start_time and no duration_mins`);
            skipped++;
            continue;
        }

        const { error: updateErr } = await supabase
            .from('downtime_events')
            .update({ is_ongoing: false, status: 'Closed', duration_mins: mins, end_time: endTime || evt.end_time })
            .eq('id', evt.id);

        if (updateErr) { console.error(`  ❌ Failed id=${evt.id}:`, updateErr.message); }
        else { console.log(`  ✅ Closed id=${evt.id} → ${mins} min`); fixed++; }
    }

    console.log(`\n✅ Done: ${fixed} fixed, ${skipped} skipped.`);
}

fixOpenEvents();
