const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sql = fs.readFileSync('add-electricity-peaks.sql', 'utf8');

async function run() {
    // Run the migration via simple queries, wait we can't run multiple commands easily in rest without a rpc
    // Let's create an RPC or just run them one by one if it's node-postgres, but here it's supabase-js
    
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
        console.error("Migration failed:", error);
    } else {
        console.log("Migration successful.");
    }
}
run();
