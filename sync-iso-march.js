const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function syncMarch() {
    const startDate = '2026-03-01';
    const endDate = '2026-03-31';
    
    // For compressor calculating
    const prevDate = new Date(startDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    console.log(`Syncing ISO 50001 daily data from ${startDate} to ${endDate}...`);

    // 1. Get Departments
    const { data: depts } = await supabase.from('departments').select('id, code')
        .in('code', ['STEAM', 'PACK', 'PEEL_MC', 'SHELL']);
    const steDept = depts.find(d => d.code === 'STEAM');
    const packDept = depts.find(d => d.code === 'PACK');
    const peelDept = depts.find(d => d.code === 'PEEL_MC');
    const shellDept = depts.find(d => d.code === 'SHELL');
    
    // Get ALL Actuals for these 4 departments
    const { data: actuals } = await supabase.from('daily_actual')
        .select('work_date, actual_ton, department_id')
        .in('department_id', [steDept.id, packDept.id, peelDept.id, shellDept.id])
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date');

    const steamMap = {};
    const packMap = {};
    const peelMap = {};
    const shellMap = {};

    for (const a of (actuals || [])) {
        if (a.department_id === steDept.id) {
            if (!steamMap[a.work_date]) steamMap[a.work_date] = 0;
            steamMap[a.work_date] += (a.actual_ton || 0) * 1000;
        } else if (a.department_id === packDept.id) {
            if (!packMap[a.work_date]) packMap[a.work_date] = 0;
            packMap[a.work_date] += (a.actual_ton || 0); // MT
        } else if (a.department_id === peelDept.id) {
            if (!peelMap[a.work_date]) peelMap[a.work_date] = 0;
            peelMap[a.work_date] += (a.actual_ton || 0) * 1000; // KG
        } else if (a.department_id === shellDept.id) {
            if (!shellMap[a.work_date]) shellMap[a.work_date] = 0;
            shellMap[a.work_date] += (a.actual_ton || 0) * 1000; // KG
        }
    }

    // 2. Get SEU 1 & SEU 2 (Electricity & Wood) -> daily_energy
    const { data: energy } = await supabase.from('daily_energy')
        .select('work_date, electricity_kwh, wood_kg')
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date');

    const energyMap = {};
    for (const e of (energy || [])) {
        energyMap[e.work_date] = e;
    }

    // 3. Get SEU 3 (Peeling) -> daily_compressor
    const { data: compressor } = await supabase.from('daily_compressor')
        .select('work_date, meter1, meter2, meter3')
        .gte('work_date', prevDateStr) // start from yesterday
        .lte('work_date', endDate)
        .order('work_date');

    const compMap = {};
    if (compressor && compressor.length > 0) {
        const cMap = {};
        for (const c of compressor) {
            cMap[c.work_date] = c;
        }

        const sortedDates = Object.keys(cMap).sort();
        for (let i = 1; i < sortedDates.length; i++) {
            const today = sortedDates[i];
            const yesterday = sortedDates[i - 1];

            const yDate = new Date(today);
            yDate.setDate(yDate.getDate() - 1);
            if (yDate.toISOString().split('T')[0] === yesterday) {
                const cT = cMap[today];
                const cY = cMap[yesterday];

                const calc = (curr, prev) => (curr != null && prev != null) ? Math.max(0, (curr - prev) * 1000) : 0;
                const total = calc(cT.meter1, cY.meter1) + calc(cT.meter2, cY.meter2) + calc(cT.meter3, cY.meter3);
                
                if (total > 0 && today >= startDate) {
                    compMap[today] = total;
                }
            }
        }
    }

    // 4. Get SEU 4 (Shelling) -> daily_kpi
    const nextDate = new Date(endDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    const { data: kpis } = await supabase.from('daily_kpi')
        .select('work_date, electricity_meter_reading')
        .eq('department_id', shellDept.id)
        .gte('work_date', startDate)
        .lte('work_date', nextDateStr)
        .order('work_date');

    const shellingKwhMap = {};
    if (kpis && kpis.length > 0) {
        const readingMap = {};
        for(const k of kpis) {
            readingMap[k.work_date] = Number(k.electricity_meter_reading);
        }

        const sortedDates = Object.keys(readingMap).sort();
        for (let i = 0; i < sortedDates.length - 1; i++) {
            const today = sortedDates[i];
            const tomorrow = sortedDates[i + 1];
            
            const tDate = new Date(today);
            tDate.setDate(tDate.getDate() + 1);
            if (tDate.toISOString().split('T')[0] === tomorrow) {
                const kwh = Math.max(0, readingMap[tomorrow] - readingMap[today]);
                if (kwh > 0 && today <= endDate) {
                    shellingKwhMap[today] = kwh;
                }
            }
        }
    }

    // Set of all dates
    const allDates = new Set([
        ...Object.keys(steamMap), ...Object.keys(packMap), ...Object.keys(peelMap), ...Object.keys(shellMap),
        ...Object.keys(energyMap), ...Object.keys(compMap), ...Object.keys(shellingKwhMap)
    ]);
    
    const entriesToUpsert = [];

    for (const d of Array.from(allDates).sort()) {
        const steamV = steamMap[d] || 0;
        const packV = packMap[d] || null;
        const peelV = peelMap[d] || 0;
        const shellV = shellMap[d] || 0;

        const e = energyMap[d];
        const c = compMap[d];
        const sh = shellingKwhMap[d];

        // SEU 1: Electricity
        if (e && e.electricity_kwh !== undefined) {
            entriesToUpsert.push({
                entry_date: d,
                seu_id: 1,
                actual_energy: e.electricity_kwh,
                rcn_hap_duoc_kg: steamV, 
                ck_obtained_mt: packV,
                notes: 'Auto-sync EVN'
            });
        }
        
        // SEU 2: Wood
        if (e && e.wood_kg !== undefined && e.wood_kg > 0) {
            entriesToUpsert.push({
                entry_date: d,
                seu_id: 2,
                actual_energy: e.wood_kg * 1000, 
                rcn_hap_duoc_kg: steamV, // Steam volume
                ck_obtained_mt: packV,
                notes: 'Auto-sync Boiler'
            });
        }

        // SEU 3: Peeling MC
        if (c !== undefined && c > 0) {
            entriesToUpsert.push({
                entry_date: d,
                seu_id: 3,
                actual_energy: c,
                rcn_hap_duoc_kg: peelV, // PEELING VOLUME
                ck_obtained_mt: packV,
                notes: 'Auto-sync Compressor'
            });
        }

        // SEU 4: Shelling
        if (sh !== undefined && sh > 0) {
            entriesToUpsert.push({
                entry_date: d,
                seu_id: 4,
                actual_energy: sh,
                rcn_hap_duoc_kg: shellV, // SHELLING VOLUME
                ck_obtained_mt: packV,
                notes: 'Auto-sync Shelling'
            });
        }
    }

    if (entriesToUpsert.length === 0) {
        console.log("No data found to sync.");
        return;
    }

    console.log(`Upserting ${entriesToUpsert.length} records into iso50001_daily_entry...`);
    const { error } = await supabase.from('iso50001_daily_entry').upsert(entriesToUpsert, { onConflict: 'seu_id,entry_date' });
    
    if (error) {
        console.error("Error upserting:", error);
    } else {
        console.log("Sync complete!");
    }
}
syncMarch();
