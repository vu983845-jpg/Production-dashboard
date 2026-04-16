const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testWithFakeToken() {
    console.log('Testing with fake captcha token...');
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'colorsorter@dds.com',
        password: 'colorsorter123',
        options: { captchaToken: '10000000-ffff-ffff-ffff-000000000001' } // A mock token (or anything)
    });
    console.log('Fake token error:', error?.message);
}

testWithFakeToken();
