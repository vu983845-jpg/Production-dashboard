import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data } = await sb.from('meal_headcount')
  .select('work_date, department_name, shift, official_present, seasonal_present, ot_count')
  .gte('work_date', '2026-03-27').lte('work_date', '2026-03-31')
  .order('work_date, department_name');

const byDate = {};
data?.forEach(r => {
  const d = r.work_date;
  if (!byDate[d]) byDate[d] = { total: 0, rows: [] };
  byDate[d].total += (r.official_present||0) + (r.seasonal_present||0) + (r.ot_count||0);
  byDate[d].rows.push({ dept: r.department_name, shift: r.shift, off: r.official_present, sea: r.seasonal_present, ot: r.ot_count });
});

for (const [d, v] of Object.entries(byDate)) {
  console.log(`\n=== ${d} | TOTAL: ${v.total} ===`);
  for (const r of v.rows) {
    if ((r.off||0)+(r.ot||0)+(r.sea||0) > 0)
      console.log(`  ${r.dept.padEnd(30)} shift=${r.shift}  off=${r.off}  sea=${r.sea}  ot=${r.ot}`);
  }
}
