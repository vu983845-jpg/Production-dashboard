const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/Cashew/.gemini/PPE/factory-dashboard/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProfiles() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*');

    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

checkProfiles();
