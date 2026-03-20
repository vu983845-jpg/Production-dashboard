const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // Check if broken_pct column exists by querying it directly
    const { data, error } = await supabase
        .from('shelling_line_daily')
        .select('id, broken_pct')
        .limit(1);

    if (error) {
        console.log('❌ broken_pct column MISSING or error:', error.message);
        console.log('\nRun this SQL in Supabase:\nALTER TABLE public.shelling_line_daily ADD COLUMN IF NOT EXISTS broken_pct numeric NOT NULL DEFAULT 0;\nNOTIFY pgrst, \'reload schema\';');
        return;
    }
    console.log('✅ broken_pct column EXISTS. Sample data:', data);
    
    // Check filter works
    const { data: filtered } = await supabase
        .from('shelling_line_daily')
        .select('shift_leader, actual_ton, broken_pct')
        .eq('shift_leader', 'Ms.Linh')
        .limit(5);
    console.log('\nFilter by Ms.Linh:', filtered?.length, 'rows found');
    filtered?.forEach(r => console.log(' -', r.shift_leader, r.actual_ton, r.broken_pct));
}

run();
