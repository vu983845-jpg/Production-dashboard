const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testWrongPassword() {
    console.log('Testing WRONG password...');
    const { error } = await supabase.auth.signInWithPassword({
        email: 'colorsorter@dds.com',
        password: 'wrongpassword',
    });
    console.log('Wrong password error:', error?.message);
}

testWrongPassword();
