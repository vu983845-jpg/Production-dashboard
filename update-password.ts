import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function changePassword() {
    const { data: users, error: err1 } = await supabase.auth.admin.listUsers()
    if (err1) {
        console.error('Error fetching users:', err1)
        return
    }

    const targetUser = users.users.find(u => u.email === 'shelling@dds.com')
    if (!targetUser) {
        console.log('shelling@dds.com not found')
        return
    }

    console.log('Found user:', targetUser.id, targetUser.email)

    const { data: user, error: err2 } = await supabase.auth.admin.updateUserById(
        targetUser.id,
        { password: 'Passwork789@' }
    )

    if (err2) {
        console.error('Error updating password:', err2)
        return
    }

    console.log('Successfully updated password for shelling@dds.com')
}

changePassword()
