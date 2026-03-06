const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/Cashew/.gemini/PPE/factory-dashboard/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncProfiles() {
    // Get all users from auth.users (via Admin API if using service role, but since we are just a JS snippet
    // without pg direct access, we will select via supabase.auth.admin.listUsers() if we have service key)

    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();

    if (usersErr) {
        console.error("Error fetching users", usersErr);
        return;
    }

    console.log(`Found ${usersData.users.length} users.`);

    for (const user of usersData.users) {
        const { id, raw_user_meta_data } = user;

        const { error: insertErr } = await supabase.from('profiles').upsert({
            id: id,
            full_name: raw_user_meta_data?.full_name || 'Nameless',
            role: raw_user_meta_data?.role || 'viewer',
            department_id: raw_user_meta_data?.department_id || null
        });

        if (insertErr) {
            console.error(`Failed to insert profile for ${user.email}:`, insertErr);
        } else {
            console.log(`Successfully synced profile for ${user.email}`);
        }
    }
}

syncProfiles();
