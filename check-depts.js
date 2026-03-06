const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/Cashew/.gemini/PPE/factory-dashboard/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Force failure if service_role_key is missing to see what's happening
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.log("No config for SUPABASE_SERVICE_ROLE_KEY found in .env.local!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDepartments() {
    const { data, error } = await supabase
        .from('departments')
        .select('id, code, name_vi');

    if (error) console.error(error);
    else console.log(data);
}

checkDepartments();
