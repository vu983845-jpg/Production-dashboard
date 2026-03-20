const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase.rpc('get_roles_constraint_definition', {}); // I'll just write a quick query using raw query instead.
    // Supabase JS doesn't support raw SQL query directly, let's use the postgres module.
}
check();
