const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    // get users from auth.users (requires service role, which we have)
    const { data: users, error: uErr } = await supabase.auth.admin.listUsers();
    if (uErr) { console.error(uErr); return; }

    const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['admin', 'HSE', 'hse']);
        
    if (pErr) { console.error(pErr); return; }

    const results = profiles.map(p => {
        const u = users.users.find(x => x.id === p.id);
        return {
            email: u?.email || 'N/A',
            role: p.role,
            full_name: p.full_name
        };
    });

    console.table(results);
}
check();
