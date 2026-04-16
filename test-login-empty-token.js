const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testEmptyToken() {
    console.log('Testing with empty captcha token...');
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'colorsorter@dds.com',
        password: 'colorsorter123',
        options: { captchaToken: '' }
    });
    console.log('Empty token error:', error?.message);
}

testEmptyToken();
