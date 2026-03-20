const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xczzowebjdfhswdnhuuo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Run with dotenv.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createMaintUser() {
    console.log("Creating maint user...");
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: 'maint@viccla.com',
        password: 'Maint2026@',
        email_confirm: true
    });

    if (authError) {
        console.error("Auth creation error:", authError);
        // Might already exist, let's try to get it
        if (authError.message.includes("already registered")) {
             console.log("Account already exists, proceeding to update profile.");
             const { data: users } = await supabase.auth.admin.listUsers();
             const extUser = users?.users.find(u => u.email === 'maint@viccla.com');
             if (extUser) {
                 await updateProfile(extUser.id);
             }
        }
    } else if (authData?.user) {
        console.log("User created:", authData.user.id);
        await updateProfile(authData.user.id);
    }
}

async function updateProfile(userId) {
    const { data, error } = await supabase.from('profiles').upsert({
        id: userId,
        email: 'maint@viccla.com',
        role: 'maint',
        display_name: 'Maintenance'
    });
    
    if (error) {
        console.error("Profile update error:", error);
    } else {
        console.log("Profile successfully updated to role maint!");
    }
}

createMaintUser();
