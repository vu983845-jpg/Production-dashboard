import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function lockAdminInput() {
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

    // Update role in profiles table to 'viewer'
    const { data: profile, error: err2 } = await supabase
        .from('profiles')
        .update({ role: 'viewer' })
        .eq('id', adminUser.id)
        .select()
        .single()

    if (err2) {
        console.error('Error updating profile role:', err2)
        return
    }

    // Update user metadata in auth.users
    const { error: err3 } = await supabase.auth.admin.updateUserById(
        adminUser.id,
        { user_metadata: { ...adminUser.user_metadata, role: 'viewer' } }
    )

    if (err3) {
        console.error('Error updating user metadata:', err3)
        return
    }

    console.log('Successfully locked input data right for admin@dds.com. New profile:', profile)
}

lockAdminInput()
