const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAndResetPassword() {
    console.log('Fetching users...');
    const { data: users, error: err1 } = await supabase.auth.admin.listUsers();
    if (err1) {
        console.error('Error fetching users:', err1);
        return;
    }

    const email = 'colorsorter@dds.com';
    const targetUser = users.users.find(u => u.email === email);
    if (!targetUser) {
        console.log(`User ${email} not found`);
        return;
    }

    console.log('Found user:', targetUser.id, targetUser.email);
    console.log('Resetting password to colorsorter123');

    const { data: user, error: err2 } = await supabase.auth.admin.updateUserById(
        targetUser.id,
        { password: 'colorsorter123' }
    );

    if (err2) {
        console.error('Error updating password:', err2);
        return;
    }

    console.log(`Successfully updated password for ${email}`);
}

checkAndResetPassword();
