const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRoles() {
    const { data, error } = await supabase
        .from('profiles')
        .select('email, role, full_name')
        .in('role', ['admin', 'HSE', 'hse']);

    if (error) {
        console.error('Error fetching profiles:', error);
        return;
    }

    console.table(data);
}

checkRoles();
