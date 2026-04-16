const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAllUsers() {
    console.log('Fetching details...');
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
        console.error('Error fetching users:', error);
        return;
    }
    
    // Sort by last_sign_in_at desc
    const sorted = data.users.sort((a, b) => {
        if (!a.last_sign_in_at) return 1;
        if (!b.last_sign_in_at) return -1;
        return new Date(b.last_sign_in_at) - new Date(a.last_sign_in_at);
    });

    sorted.slice(0, 5).forEach(u => {
        console.log(`Email: ${u.email} | Last Sign In: ${u.last_sign_in_at}`);
    });
}

checkAllUsers();
