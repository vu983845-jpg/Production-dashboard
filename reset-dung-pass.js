const { createClient } = require('@supabase/supabase-js')
const s = createClient(
    'https://iekjajbmbkqrbalnjwit.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8',
    { auth: { autoRefreshToken: false, persistSession: false } }
)

s.auth.admin.updateUserById('1935ee54-7dce-4240-83a5-7224ec053b0b', { password: 'dung123@' })
    .then(r => {
        if (r.error) console.error('Loi:', r.error.message)
        else console.log('OK - dung@vicc.com / dung123@')
    })
    .catch(e => console.error(e))
