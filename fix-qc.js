const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixQCPassword() {
    const { data: users } = await supabase.auth.admin.listUsers();
    const u = users.users.find(x => x.email === 'QC@icc.com');
    if (u) {
        const { error } = await supabase.auth.admin.updateUserById(u.id, { password: 'QC_admin123' });
        console.log('QC updated:', error ? error.message : 'SUCCESS');
    }
}

fixQCPassword();
