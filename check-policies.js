const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xczzowebjdfhswdnhuuo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Run with dotenv.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.rpc('get_policies');
    if (error) {
        console.error("RPC failed, trying raw sql if possible or just standard query...");
        const { data: qData, error: qError } = await supabase
            .from('pg_policies')
            .select('*')
            .eq('tablename', 'daily_compressor');
            
        if (qError) {
             console.error("Direct query failed:", qError);
        } else {
             console.log("Policies:", qData);
        }
    } else {
        console.log(data);
    }
}
check();
