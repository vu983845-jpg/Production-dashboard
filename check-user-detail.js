const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserDetailed() {
    console.log('Fetching details for colorsorter@dds.com...');
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
        console.error('Error fetching users:', error);
        return;
    }
    
    const u = data.users.find(x => x.email === 'colorsorter@dds.com');
    if (u) {
        console.log('ID:', u.id);
        console.log('Email:', u.email);
        console.log('Role:', u.role);
        console.log('Confirmed At:', u.email_confirmed_at);
        console.log('Banned Until:', u.banned_until);
        console.log('Is Anonymous:', u.is_anonymous);
        console.log('Last Sign In:', u.last_sign_in_at);
        console.log('App metadata:', u.app_metadata);
    } else {
        console.log('Not found.');
    }
}

checkUserDetailed();
