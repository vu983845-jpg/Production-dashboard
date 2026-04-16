const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUsers() {
    console.log('Fetching users...');
    const { data: users, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
        console.error('Error fetching users:', error);
        return;
    }
    
    users.users.slice(0, 10).forEach(u => {
        console.log(`User: ${u.email} | Confirmed: ${u.email_confirmed_at ? 'Yes' : 'No'}`);
    });
}

checkUsers();
