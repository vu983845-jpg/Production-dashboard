require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SIZES = ['A+', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];

async function setup() {
    console.log('Step 1: Add RCN department...');
    const { data: dept, error: deptErr } = await s
        .from('departments')
        .upsert({ name_en: 'RCN Warehouse', name_vi: 'Kho RCN', code: 'RCN', sort_order: 1 }, { onConflict: 'code' })
        .select()
        .single();
    if (deptErr) { console.error('Dept error:', deptErr.message); return; }
    console.log('✅ RCN dept:', dept.id);

    console.log('\nStep 2: Create rcn_inventory table...');
    const createSQL = `
        CREATE TABLE IF NOT EXISTS public.rcn_inventory (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            work_date       date NOT NULL,
            size_code       varchar(10) NOT NULL,
            opening_ton     numeric(10,3) NOT NULL DEFAULT 0,
            ton_received    numeric(10,3) NOT NULL DEFAULT 0,
            ton_dispatched  numeric(10,3) NOT NULL DEFAULT 0,
            note            text,
            updated_by      uuid,
            updated_at      timestamptz NOT NULL DEFAULT now(),
            UNIQUE(work_date, size_code)
        );
        CREATE INDEX IF NOT EXISTS rcn_inventory_date_idx ON public.rcn_inventory(work_date DESC);
    `;
    const { error: tableErr } = await s.rpc('exec_sql', { sql: createSQL }).catch(() => ({ error: { message: 'rpc not available' } }));
    if (tableErr) console.log('⚠️ Table creation via RPC not available - run rcn-setup.sql manually in Supabase SQL editor');
    else console.log('✅ Table created');

    console.log('\nStep 3: Link rcn@dds.com to RCN department...');
    // Get rcn user
    const users = await s.auth.admin.listUsers();
    const rcnUser = users.data.users.find(u => u.email === 'rcn@dds.com');
    if (rcnUser) {
        const { error: profErr } = await s.from('profiles').update({
            department_id: dept.id,
            allowed_dept_ids: [dept.id]
        }).eq('id', rcnUser.id);
        console.log(profErr ? '❌ Profile update failed: ' + profErr.message : '✅ rcn@dds.com linked to RCN dept');
    } else {
        console.log('⚠️ rcn@dds.com user not found');
    }

    console.log('\nDone! RCN department ID:', dept.id);
    console.log('Now run rcn-setup.sql in Supabase SQL Editor to create the table + RLS policies.');
}

setup().catch(console.error);
