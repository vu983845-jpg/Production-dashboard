const fs = require('fs');
const { parse } = require('csv-parse/sync');
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseNum(val) {
  if (!val) return null;
  val = val.toString().trim();
  if (val === '-' || val === '') return null;
  const numStr = val.replace(/,/g, '');
  
  let isNegative = false;
  let parsedStr = numStr;
  if (parsedStr.startsWith('(') && parsedStr.endsWith(')')) {
      parsedStr = parsedStr.substring(1, parsedStr.length - 1);
      isNegative = true;
  }
  
  const num = parseFloat(parsedStr);
  return isNaN(num) ? null : (isNegative ? -num : num);
}

function parseDateStr(dateStr) {
  if (!dateStr || !dateStr.includes('/')) return null;
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  
  const d = parts[0].padStart(2, '0');
  const m = parts[1].padStart(2, '0');
  const y = parts[2];
  if (y.length !== 4) return null;
  
  return `${y}-${m}-${d}`;
}

async function run() {
  // 1. Parse sheet_data_latest.csv for Compressors and Shelling
  const fileContentMain = fs.readFileSync('sheet_data_latest.csv', 'utf8');
  const recordsMain = parse(fileContentMain, { skip_empty_lines: true, relax_column_count: true });
  
  const compressorPayloads = [];
  const shellingPayloads = [];
  
  const DEPT_ID_SHELL = '00b28ca3-863e-48f1-b64c-68005c90c956';
  
  for (const row of recordsMain) {
    if (row.length < 10) continue;
    const work_date = parseDateStr(row[2]); // C: Date
    if (!work_date || work_date < '2026-03-01' || work_date > '2026-03-31') continue;

    // Compressors
    const m1 = parseNum(row[19]); // T
    const m2 = parseNum(row[20]); // U
    const m3 = parseNum(row[21]); // V
    if (m1 || m2 || m3) {
      compressorPayloads.push({ work_date, meter1: m1, meter2: m2, meter3: m3, updated_at: new Date().toISOString() });
    }
    
    // Shelling
    const shellMwh = parseNum(row[7]); // H
    if (shellMwh !== null) {
      shellingPayloads.push({ work_date, shelling_mwh: shellMwh });
    }
  }

  // Handle Compressors Upsert
  if (compressorPayloads.length > 0) {
    const { error } = await supabase.from('daily_compressor').upsert(compressorPayloads, { onConflict: 'work_date' });
    if (error) console.error("Error upserting compressors:", error);
    else console.log(`✅ Synced ${compressorPayloads.length} Compressor records for March 2026.`);
  }

  // Handle Shelling Update/Upsert safely
  if (shellingPayloads.length > 0) {
    const { data: existShell } = await supabase.from('daily_kpi').select('id, work_date').eq('department_id', DEPT_ID_SHELL);
    const shellMap = new Map();
    if(existShell) existShell.forEach(r => shellMap.set(r.work_date, r.id));
    
    const shellUpserts = [];
    const shellInserts = [];
    for (const p of shellingPayloads) {
      if (shellMap.has(p.work_date)) {
        shellUpserts.push({ id: shellMap.get(p.work_date), electricity_meter_reading: p.shelling_mwh * 1000, updated_at: new Date().toISOString() });
      } else {
        shellInserts.push({ department_id: DEPT_ID_SHELL, work_date: p.work_date, electricity_meter_reading: p.shelling_mwh * 1000, updated_at: new Date().toISOString() });
      }
    }
    if (shellUpserts.length > 0) {
      await supabase.from('daily_kpi').upsert(shellUpserts);
    }
    if (shellInserts.length > 0) {
      await supabase.from('daily_kpi').insert(shellInserts);
    }
    console.log(`✅ Synced ${shellingPayloads.length} Shelling records (Updates: ${shellUpserts.length}, Inserts: ${shellInserts.length}) for March 2026.`);
  }
  
  // 2. Parse dailytracking_correct.csv for daily_electricity_others
  const fileContentOthers = fs.readFileSync('dailytracking_correct.csv', 'utf8');
  // It's raw rows, some are just commas, so using manual split or relax
  const recordsOthers = parse(fileContentOthers, { skip_empty_lines: true, relax_column_count: true });
  
  const othersPayloads = [];
  
  for (const row of recordsOthers) {
    if (row.length < 10) continue;
    const work_date = parseDateStr(row[0]); // Index 0 is Date
    if (!work_date || work_date < '2026-03-01' || work_date > '2026-03-31') continue;

    const transformer = parseNum(row[1]);
    const boiler = parseNum(row[2]);
    const cooling_fan = parseNum(row[3]);
    const db_ac_hca = parseNum(row[4]);
    const eco2 = parseNum(row[5]);
    const canteen = parseNum(row[6]);
    const office = parseNum(row[8]);
    
    othersPayloads.push({
      work_date,
      transformer,
      boiler,
      cooling_fan,
      db_ac_hca,
      eco2,
      canteen,
      office,
      updated_at: new Date().toISOString()
    });
  }

  if (othersPayloads.length > 0) {
    const { error } = await supabase.from('daily_electricity_others').upsert(othersPayloads, { onConflict: 'work_date' });
    if (error) console.error("Error upserting daily_electricity_others:", error);
    else console.log(`✅ Synced ${othersPayloads.length} Other Electricity records for March 2026.`);
  }
  
  console.log("All syncs complete!");
}

run().catch(console.error);
