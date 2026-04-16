const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Use the exact anon key the client uses to simulate normal login
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
    console.log('Testing login for colorsorter@dds.com...');
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'colorsorter@dds.com',
        password: 'colorsorter123',
    });

    if (error) {
        console.error('Login failed:', error.message);
    } else {
        console.log('Login successful! User ID:', data.user.id);
    }
}

testLogin();
