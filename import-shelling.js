const fs = require('fs');
const { parse } = require('csv-parse/sync');
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const fileContent = fs.readFileSync('sheet_data.csv', 'utf8');
  const records = parse(fileContent, {
    skip_empty_lines: true,
    relax_column_count: true
  });
  
  const DEPT_ID = '00b28ca3-863e-48f1-b64c-68005c90c956';
  
  // 1. Fetch existing daily_kpi for SHELL
  const { data: existingData, error: fetchErr } = await supabase
    .from('daily_kpi')
    .select('id, work_date')
    .eq('department_id', DEPT_ID);
    
  if (fetchErr) throw fetchErr;
  
  const existingDates = new Map();
  for (const row of existingData) {
    existingDates.set(row.work_date, row.id);
  }

  const updates = [];
  const inserts = [];
  const processedDates = new Set();

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (row.length < 10) continue; // Safety check
    
    // Date is at index 2
    let dateStr = row[2];
    if (!dateStr || !dateStr.includes('/')) continue;
    
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) continue;
    
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    if (y.length !== 4) continue;
    
    const work_date = `${y}-${m}-${d}`;
    if (processedDates.has(work_date)) continue;
    
    // Skip if >= 2026-03-01 to avoid clashing with recent accurate data
    if (work_date >= '2026-03-01') continue;

    // Shelling Main Meter (MWh) is at column H, index 7 in CSV
    let valStr = row[7];
    if (!valStr || valStr.trim() === '-' || valStr.trim() === '') continue;
    
    // Clean string: remove commas
    valStr = valStr.replace(/,/g, '').trim();
    
    // Check if it's a number surrounded by parentheses like (197,530)
    let isNegative = false;
    if (valStr.startsWith('(') && valStr.endsWith(')')) {
        valStr = valStr.substring(1, valStr.length - 1);
        isNegative = true;
    }
    
    const mwh = parseFloat(valStr);
    if (isNaN(mwh)) continue;
    
    const finalMwh = isNegative ? -mwh : mwh;
    // Scale to kWh
    const kwhReading = finalMwh * 1000;
    
    const payloadInfo = {
      department_id: DEPT_ID,
      work_date,
      electricity_meter_reading: kwhReading,
      updated_at: new Date().toISOString()
    };
    
    if (existingDates.has(work_date)) {
      updates.push({
        id: existingDates.get(work_date),
        electricity_meter_reading: kwhReading,
        updated_at: payloadInfo.updated_at
      });
    } else {
      inserts.push(payloadInfo);
    }
    processedDates.add(work_date);
  }

  console.log(`Found ${updates.length} existing records to UPDATE.`);
  console.log(`Found ${inserts.length} new records to INSERT.`);
  
  if (updates.length > 0) {
      // Supabase JS 'upsert' can act as bulk update if we provide the PK ('id')
      let uCount = 0;
      const batchSize = 100;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        const { error } = await supabase.from('daily_kpi').upsert(batch);
        if (error) console.error("Error bulk updating batch", i, error.message);
        else uCount += batch.length;
      }
      console.log(`✅ Updated ${uCount} records.`);
  }

  if (inserts.length > 0) {
      let iCount = 0;
      const batchSize = 100;
      for (let i = 0; i < inserts.length; i += batchSize) {
        const batch = inserts.slice(i, i + batchSize);
        const { error } = await supabase.from('daily_kpi').insert(batch);
        if (error) console.error("Error inserting batch", i, error.message);
        else iCount += batch.length;
      }
      console.log(`✅ Inserted ${iCount} records.`);
  }
}

run().catch(console.error);
