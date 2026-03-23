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
  // Use relax_column_count because some rows might be jagged
  const records = parse(fileContent, {
    skip_empty_lines: true,
    relax_column_count: true
  });
  
  const payload = [];
  const existingDates = new Set(); // to prevent duplicate dates on same row or multiple rows due to bad data

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    
    // Make sure row is long enough
    if (row.length < 22) continue;
    
    // Date is at index 2
    let dateStr = row[2];
    if (!dateStr || !dateStr.includes('/')) continue;
    
    // Parse DD/MM/YYYY to YYYY-MM-DD
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) continue;
    
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    
    if (y.length !== 4) continue;
    
    const work_date = `${y}-${m}-${d}`;
    
    // Skip if already parsed this date (e.g. sometimes humans create duplicate dates by accident)
    if (existingDates.has(work_date)) continue;
    
    // Skip dates on or after 2026-03-01 to avoid overwriting recent accurate data from our other script
    if (work_date >= '2026-03-01') continue;

    // Helper to parse MWh numbers
    const parseNum = (val) => {
      if (!val) return null;
      // Remove any trailing or leading whitespace, minus signs (if they stand alone)
      if (val.trim() === '-' || val.trim() === '') return null;
      // remove commas
      const numStr = val.replace(/,/g, '').trim();
      const num = parseFloat(numStr);
      return isNaN(num) ? null : num;
    };
    
    const m1 = parseNum(row[19]);
    const m2 = parseNum(row[20]);
    const m3 = parseNum(row[21]);
    
    // Only insert if at least one meter has a reading
    if (m1 !== null || m2 !== null || m3 !== null) {
      payload.push({
        work_date,
        meter1: m1,
        meter2: m2,
        meter3: m3,
        updated_at: new Date().toISOString()
      });
      existingDates.add(work_date);
    }
  }

  console.log(`Found ${payload.length} historical records to import.`);
  if (payload.length > 0) {
    console.log("Sample [First 3]:", payload.slice(0, 3));
    console.log("Sample [Last 3]:", payload.slice(-3));
    
    // Import in batches of 100
    let successCount = 0;
    const batchSize = 100;
    for (let i = 0; i < payload.length; i += batchSize) {
      const batch = payload.slice(i, i + batchSize);
      const { error } = await supabase.from('daily_compressor').upsert(batch, { onConflict: 'work_date' });
      if (error) {
        console.error(`Error importing batch starting at index ${i}:`, error.message);
      } else {
        successCount += batch.length;
        console.log(`Inserted batch: ${successCount}/${payload.length}`);
      }
    }
    console.log("✅ Import historical compressor data successful!");
  }
}

run().catch(console.error);
