require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rawData = `
01/03/2026 | 2,000,475.47 | 5,437,358.36 | 2,294,435.69
02/03/2026 | 2,002,970.34 | 5,444,254.28 | 2,295,473.59
03/03/2026 | 2,006,346.26 | 5,452,598.16 | 2,299,273.83
04/03/2026 | 2,010,038.46 | 5,460,778.37 | 2,303,405.74
05/03/2026 | 2,013,055.12 | 5,469,043.08 | 2,307,209.11
06/03/2026 | 2,016,680.15 | 5,477,978.21 | 2,310,826.25
07/03/2026 | 2,019,094.98 | 5,485,728.22 | 2,314,266.67
08/03/2026 | 2,019,094.98 | 5,486,770.59 | 2,315,152.15
09/03/2026 | 2,022,310.65 | 5,493,941.00 | 2,316,769.13
10/03/2026 | 2,026,135.41 | 5,502,332.64 | 2,320,194.82
11/03/2026 | 2,029,580.58 | 5,510,868.72 | 2,324,409.05
12/03/2026 | 2,032,788.38 | 5,519,031.68 | 2,327,777.14
13/03/2026 | 2,036,303.90 | 5,527,855.11 | 2,331,892.13
14/03/2026 | 2,039,300.87 | 5,535,490.35 | 2,335,817.02
15/03/2026 | 2,039,300.87 | 5,536,551.99 | 2,337,803.69
16/03/2026 | 2,041,581.26 | 5,543,843.48 | 2,338,897.54
17/03/2026 | 2,044,483.29 | 5,551,848.05 | 2,342,016.65
18/03/2026 | 2,047,740.54 | 5,559,106.13 | 2,345,578.11
19/03/2026 | 2,050,909.24 | 5,567,085.46 | 2,349,211.92
`;

async function injectMeters() {
  const lines = rawData.trim().split('\n');
  const updates = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Split by pipe
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 4) continue;
    
    // Parse date (DD/MM/YYYY -> YYYY-MM-DD)
    const dateParts = parts[0].split('/');
    const work_date = dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0];
    
    // Parse commas
    const parseNumber = (str) => parseFloat(str.replace(/,/g, ''));
    
    const peak = parseNumber(parts[1]);
    const normal = parseNumber(parts[2]);
    const offpeak = parseNumber(parts[3]);
    
    updates.push({
      work_date,
      meter_peak: peak,
      meter_normal: normal,
      meter_offpeak: offpeak,
      updated_at: new Date().toISOString()
    });
  }

  console.log("Parsed " + updates.length + " records. Updating database...");

  // We do not want to wipe out existing data in daily_energy (like water/wood). 
  // Wait, Supabase UPSERT natively overwrites fields that are specified, and keeps others ONLY IF we don't accidentally update them to null.
  // Actually, standard UPSERT in Supabase replaces the entire row if we don't specify the columns, OR it updates the specified columns.
  // Since we don't have all columns, the safest way is to fetch the existing row, merge, and then upsert, OR just do an UPDATE if the row exists, and INSERT if not.
  // We can do it one by one to avoid destroying water/wood data.
  
  for (const record of updates) {
    const { data: existing, error: fetchErr } = await supabase
      .from('daily_energy')
      .select('*')
      .eq('work_date', record.work_date)
      .single();
      
    if (existing) {
      // Update
      const { error: updErr } = await supabase
        .from('daily_energy')
        .update({
          meter_peak: record.meter_peak,
          meter_normal: record.meter_normal,
          meter_offpeak: record.meter_offpeak
        })
        .eq('work_date', record.work_date);
        
      if (updErr) console.error("Failed to update " + record.work_date + ": ", updErr);
      else console.log("Updated " + record.work_date);
    } else {
      // Insert
      const { error: insErr } = await supabase
        .from('daily_energy')
        .insert([{
          work_date: record.work_date,
          meter_peak: record.meter_peak,
          meter_normal: record.meter_normal,
          meter_offpeak: record.meter_offpeak
        }]);
        
      if (insErr) console.error("Failed to insert " + record.work_date + ": ", insErr);
      else console.log("Inserted " + record.work_date);
    }
  }
  
  console.log('Injection complete');
}

injectMeters();
