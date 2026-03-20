const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xczzowebjdfhswdnhuuo.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseKey) {
    console.error("Missing ANON KEY. Run with dotenv.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function signUpUser() {
    console.log("Signing up maint user...");
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: 'maint@viccla.com',
        password: 'Maint2026@',
        options: {
            data: {
                display_name: 'Maintenance'
            }
        }
    });

    if (authError) {
        console.error("SignUp error:", authError);
    } else if (authData?.user) {
        console.log("User signed up:", authData.user.id);
        
        // Use service role to update profile
        const adminSupabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { error: profileError } = await adminSupabase.from('profiles').upsert({
            id: authData.user.id,
            email: 'maint@viccla.com',
            role: 'maint',
            display_name: 'Maintenance'
        });
        
        if (profileError) console.error("Profile update error:", profileError);
        else console.log("Profile successfully updated to role maint!");
    }
}

signUpUser();
