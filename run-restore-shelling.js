const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

async function restoreShelling() {
    console.log('🔧 Khôi phục quyền shelling@dds.com...\n')

    // 1. Tìm user ID
    const { data: users, error: e1 } = await supabase.auth.admin.listUsers()
    if (e1) return console.error('❌ Lỗi listUsers:', e1.message)

    const user = users.users.find(u => u.email === 'shelling@dds.com')
    if (!user) return console.error('❌ Không tìm thấy shelling@dds.com')
    console.log('✅ Tìm thấy user:', user.id, '| banned_until:', user.banned_until || 'không bị ban')

    // 2. Unban + restore metadata
    const { error: e2 } = await supabase.auth.admin.updateUserById(user.id, {
        ban_duration: 'none',
        user_metadata: { ...user.user_metadata, role: 'dept_user' }
    })
    if (e2) console.error('❌ Lỗi unban:', e2.message)
    else console.log('✅ Unban + metadata role = dept_user')

    // 3. Lấy department IDs
    const { data: depts, error: e3 } = await supabase
        .from('departments')
        .select('id, code')
        .in('code', ['SHELL', 'BORMA'])
    if (e3) return console.error('❌ Lỗi lấy departments:', e3.message)

    const shellDept = depts.find(d => d.code === 'SHELL')
    const allDeptIds = depts.map(d => d.id)
    console.log('✅ Departments:', depts.map(d => d.code).join(', '))

    // 4. Cập nhật profiles
    const { data: profile, error: e4 } = await supabase
        .from('profiles')
        .update({
            role: 'dept_user',
            department_id: shellDept.id,
            allowed_dept_ids: allDeptIds
        })
        .eq('id', user.id)
        .select()
        .single()

    if (e4) console.error('❌ Lỗi update profile:', e4.message)
    else console.log('✅ Profile cập nhật:', {
        role: profile.role,
        department_id: profile.department_id,
        allowed_dept_ids: profile.allowed_dept_ids
    })

    console.log('\n🎉 Hoàn tất! shelling@dds.com đã có quyền dashboard + downtime + report SHELL/BORMA')
}

restoreShelling()
