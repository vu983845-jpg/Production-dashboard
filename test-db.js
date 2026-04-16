const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

supabase.from('meal_headcount').select('*')
.eq('work_date', '2026-04-13').like('department_name', '%eeling%').then(r => {
    console.log(JSON.stringify(r.data, null, 2));
    process.exit(0);
});
