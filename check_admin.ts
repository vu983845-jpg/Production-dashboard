import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkAdmin() {
    const { data: users, error: err1 } = await supabase.auth.admin.listUsers()
    if (err1) {
        console.error('Error fetching users:', err1)
        return
    }

    const adminUser = users.users.find(u => u.email === 'admin@dds.com')
    if (!adminUser) {
        console.log('admin@dds.com not found')
        return
    }

    console.log('Found admin:', adminUser.id, adminUser.email)

    const { data: profile, error: err2 } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', adminUser.id)
        .single()

    console.log('Profile:', profile)
}

checkAdmin()
