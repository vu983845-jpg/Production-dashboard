const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xczzowebjdfhswdnhuuo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking user...");
    const { data: users, error } = await supabase.auth.admin.listUsers();
    if (error) {
        console.error(error);
        return;
    }
    const user = users.users.find(u => u.email === 'maint@viccla.com');
    if (user) {
        console.log("User exists:", user.id);
        const { error: updateProfileError } = await supabase.from('profiles').upsert({
            id: user.id,
            email: 'maint@viccla.com',
            role: 'maint',
            display_name: 'Maintenance'
        });
        if (updateProfileError) console.error("Profile update error:", updateProfileError);
        else console.log("Profile updated!");
    } else {
        console.log("User does not exist.");
    }
}
check();
