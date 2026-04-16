const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function massResetPasswords() {
    console.log('Fetching users to reset passwords...');
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
        console.error('Error fetching users:', error);
        return;
    }
    
    const results = [];
    
    for (const u of data.users) {
        if (!u.email) continue;
        
        let prefix = u.email.split('@')[0];
        // optional: lowercase the prefix? let's keep it exact to the left part or lowercase it
        let newPassword = `${prefix}123`;
        
        // Let's perform the update
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            u.id,
            { password: newPassword }
        );
        
        if (updateError) {
            results.push({ email: u.email, password: newPassword, status: `ERROR: ${updateError.message}` });
        } else {
            results.push({ email: u.email, password: newPassword, status: 'SUCCESS' });
        }
    }
    
    console.log('\n--- RESET RESULTS ---');
    results.forEach(r => {
        console.log(`${r.email} | ${r.password} | ${r.status}`);
    });
}

massResetPasswords();
