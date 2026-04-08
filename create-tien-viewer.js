const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xczzowebjdfhswdnhuuo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Run with:");
    console.error("  node -r dotenv/config create-tien-viewer.js dotenv_config_path=.env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_EMAIL = 'tien.nguyen@icc.com';
const TARGET_PASSWORD = 'Tien123@';
const DISPLAY_NAME = 'Tiến Nguyễn';

async function createViewerUser() {
    console.log(`🔄 Creating viewer account for: ${TARGET_EMAIL}`);

    // Step 1: Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: TARGET_EMAIL,
        password: TARGET_PASSWORD,
        email_confirm: true,
        user_metadata: {
            display_name: DISPLAY_NAME,
            role: 'viewer'
        }
    });

    let userId;

    if (authError) {
        if (authError.message.toLowerCase().includes('already registered') || 
            authError.message.toLowerCase().includes('already been registered')) {
            console.log('⚠️  Auth user already exists. Fetching existing user...');
            const { data: listData } = await supabase.auth.admin.listUsers();
            const existing = listData?.users?.find(u => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase());
            if (existing) {
                userId = existing.id;
                console.log(`✅ Found existing user: ${userId}`);
            } else {
                console.error('❌ Could not find existing user.');
                process.exit(1);
            }
        } else {
            console.error('❌ Auth creation error:', authError.message);
            process.exit(1);
        }
    } else {
        userId = authData.user.id;
        console.log(`✅ Auth user created: ${userId}`);
    }

    // Step 2: Upsert profile with viewer role
    const { error: profileError } = await supabase.from('profiles').upsert({
        id: userId,
        email: TARGET_EMAIL.toLowerCase(),
        role: 'viewer',
        display_name: DISPLAY_NAME
    }, { onConflict: 'id' });

    if (profileError) {
        console.error('❌ Profile upsert error:', profileError.message);
        process.exit(1);
    }

    console.log(`✅ Profile set to role: viewer`);
    console.log('');
    console.log('=============================');
    console.log('  Account created successfully!');
    console.log('=============================');
    console.log(`  Email    : ${TARGET_EMAIL}`);
    console.log(`  Password : ${TARGET_PASSWORD}`);
    console.log(`  Role     : viewer (chỉ xem, không chỉnh sửa)`);
    console.log('=============================');
}

createViewerUser();
