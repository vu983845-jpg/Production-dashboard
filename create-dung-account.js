const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://iekjajbmbkqrbalnjwit.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
})

async function run() {
    console.log('🔧 Đang tạo/cập nhật tài khoản dung@vicc.com...')

    // 1. Tạo user qua Auth Admin API
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: 'dung@vicc.com',
        password: 'dung123',
        email_confirm: true,
        user_metadata: { full_name: 'Dũng', role: 'maint' }
    })

    let userId

    if (authError) {
        if (authError.message.includes('already been registered') || authError.code === 'email_exists') {
            console.log('⚠️  User đã tồn tại, đang lấy ID...')
            // Tìm user qua admin list
            const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 })
            const existing = list?.users?.find(u => u.email === 'dung@vicc.com')
            if (!existing) { console.error('❌ Không tìm được user!'); process.exit(1) }
            userId = existing.id
            // Cập nhật password
            const { error: upErr } = await supabase.auth.admin.updateUserById(userId, { password: 'dung123' })
            if (upErr) console.error('⚠️  Cập nhật password lỗi:', upErr.message)
            else console.log('✅ Đã cập nhật password')
        } else {
            console.error('❌ Lỗi tạo auth user:', authError.message)
            process.exit(1)
        }
    } else {
        userId = authData.user.id
        console.log('✅ Đã tạo auth user, ID:', userId)
    }

    // 2. Upsert profile với role = maint
    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: userId, email: 'dung@vicc.com', role: 'maint', display_name: 'Dũng' }, { onConflict: 'id' })

    if (profileError) {
        console.error('❌ Lỗi upsert profile:', profileError.message)
    } else {
        console.log('✅ Profile đã set: role = maint')
    }

    // 3. Cập nhật policy daily_water (xóa cũ, tạo mới có maint)
    console.log('\n🔧 Đang cập nhật RLS policy cho daily_water...')
    const { error: rpcError } = await supabase.rpc('exec_sql', {
        sql: `
      DROP POLICY IF EXISTS "water_write_admin_hse" ON daily_water;
      DROP POLICY IF EXISTS "water_write_admin_hse_maint" ON daily_water;
      CREATE POLICY "water_write_admin_hse_maint" ON daily_water
        FOR ALL TO authenticated
        USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','HSE','maint')))
        WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','HSE','maint')));
    `
    })

    if (rpcError) {
        // exec_sql rpc có thể không tồn tại – hướng dẫn chạy tay
        console.warn('⚠️  Không thể tự cập nhật policy (RPC không có), chạy SQL sau trên Supabase:')
        console.log(`
DROP POLICY IF EXISTS "water_write_admin_hse" ON daily_water;
CREATE POLICY "water_write_admin_hse_maint" ON daily_water
  FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','HSE','maint')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','HSE','maint')));
    `)
    } else {
        console.log('✅ Policy daily_water đã cập nhật')
    }

    console.log('\n🎉 XONG!')
    console.log('   Email   : dung@vicc.com')
    console.log('   Password: dung123')
    console.log('   Role    : maint (ghi điện + nước, xem các mục khác)')
}

run()
