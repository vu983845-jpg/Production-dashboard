require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function injectMeters() {
  const parts = "20/03/2026 | 2,053,937.10 | 5,574,731.60 | 2,352,722.98".split('|').map(p => p.trim());
  
  const dateParts = parts[0].split('/');
  const work_date = dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0];
  
  const parseNumber = (str) => parseFloat(str.replace(/,/g, ''));
  
  const peak = parseNumber(parts[1]);
  const normal = parseNumber(parts[2]);
  const offpeak = parseNumber(parts[3]);
  
  console.log("Injecting for " + work_date);
  
  const { data: existing } = await supabase
    .from('daily_energy')
    .select('*')
    .eq('work_date', work_date)
    .single();
    
  if (existing) {
    await supabase.from('daily_energy').update({
        meter_peak: peak,
        meter_normal: normal,
        meter_offpeak: offpeak
    }).eq('work_date', work_date);
    console.log("Updated!");
  } else {
    await supabase.from('daily_energy').insert([{
        work_date: work_date,
        meter_peak: peak,
        meter_normal: normal,
        meter_offpeak: offpeak
    }]);
    console.log("Inserted!");
  }
}
injectMeters();
