// Use Supabase Admin Exchange Token API to get a session for hr_admin
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://iekjajbmbkqrbalnjwit.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8';
const ANON_KEY = 'sb_publishable__4fPtAE-FtU7UCszNKLevA_7kfK-gyX';
const HR_ADMIN_ID = 'a2831f69-0b56-4c60-bda6-32eb00db4ef9';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
    // Use admin.auth.admin.getUserById + generate a token
    // Available in newer supabase-js as admin.auth.admin.createSession
    
    console.log('Trying admin.auth.admin.createSession...');
    let accessToken = null;
    
    try {
        // This API may need @supabase/supabase-js >= 2.38
        const { data, error } = await admin.auth.admin.createSession({
            userId: HR_ADMIN_ID
        });
        if (error) {
            console.log('createSession error:', error.message);
        } else {
            accessToken = data.session.access_token;
            console.log('✅ Got session via createSession!');
        }
    } catch (e) {
        console.log('createSession not available:', e.message);
    }
    
    if (!accessToken) {
        // Try Exchange API via HTTP
        console.log('\nTrying Exchange Token API via HTTP...');
        const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${HR_ADMIN_ID}/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'apikey': SERVICE_KEY,
                'Content-Type': 'application/json'
            }
        });
        if (resp.ok) {
            const body = await resp.json();
            accessToken = body.access_token;
            console.log('✅ Got token via Exchange API!');
        } else {
            console.log('Exchange API status:', resp.status, await resp.text().then(t => t.slice(0,100)));
        }
    }
    
    if (!accessToken) {
        console.log('\n❌ Cannot get user session programmatically');
        console.log('\n📋 MANUAL TEST INSTRUCTIONS:');
        console.log('1. Open http://localhost:3000 in browser');
        console.log('2. Login as hr_admin@dds.com');
        console.log('3. Open DevTools > Console');
        console.log('4. Go to Bao Com > Kitchen Summary tab');
        console.log('5. Pick a date/shift, click "Tổng hợp"');
        console.log('6. Click Edit on any row, change a value, click Lưu');
        console.log('7. Watch browser console for any alert/error');
        console.log('');
        console.log('OR: In DevTools Console, paste this to test directly:');
        console.log(`
const sb = window.__supabase || (window.supabase);
// If supabase not exposed, look for it in React state
// Try Network tab - filter by "meal_headcount" after clicking Save
// Check the PATCH request response status and body
        `);
        return;
    }
    
    // Test with the token
    const authed = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const { data: rec } = await authed
        .from('meal_headcount')
        .select('id, official_present, department_name')
        .limit(1)
        .single();
    
    const { error: ue, data: ud } = await authed
        .from('meal_headcount')
        .update({ official_present: rec.official_present })
        .eq('id', rec.id)
        .select('id');
    
    console.log('Update error:', ue?.message || 'NONE');
    console.log('Rows updated:', ud?.length);
    console.log(ud?.length > 0 ? '✅ RLS WORKING!' : '❌ RLS STILL BLOCKING');
}

main().catch(console.error);
