// Apply RLS fix directly via Supabase Management API
const https = require('https');

const PROJECT_REF = 'iekjajbmbkqrbalnjwit';
// Use service role key as the personal access token for management API
// Note: Management API needs a personal access token, not service role key
// But we can run SQL via the pg connection string approach

// Alternative: Use the REST API with service role to call a SQL runner
const SUPABASE_URL = 'https://iekjajbmbkqrbalnjwit.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8';

const { createClient } = require('@supabase/supabase-js');
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// The key insight: we need to check if the RLS policies are set up correctly
// Since we cannot run arbitrary DDL via supabase-js client,
// let's check what role the aggregated record's id belongs to

async function main() {
    console.log('=== Diagnosing the actual issue ===\n');
    
    // 1. Get today's records
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayRecs } = await admin
        .from('meal_headcount')
        .select('id, department_id, department_name, shift, official_present, official_absent, seasonal_present, ot_count, vegetarian')
        .eq('work_date', today)
        .order('department_name');
    
    console.log(`Today (${today}) records: ${todayRecs?.length ?? 0}`);
    if (todayRecs && todayRecs.length > 0) {
        console.log('Sample IDs:', todayRecs.slice(0,3).map(r => `${r.id.slice(0,8)} | ${r.department_name} | ca${r.shift}`));
    }
    
    // 2. Check if aggregate issue: multiple records for same dept
    const deptCount = {};
    (todayRecs || []).forEach(r => {
        const key = `${r.department_id}|${r.shift}`;
        deptCount[key] = (deptCount[key] || 0) + 1;
    });
    const dupes = Object.entries(deptCount).filter(([k,v]) => v > 1);
    if (dupes.length > 0) {
        console.log('\nDepartments with MULTIPLE records (aggregate issue):');
        dupes.forEach(([k,v]) => console.log(`  ${k}: ${v} records`));
    } else {
        console.log('No duplicate dept/shift combos today');
    }
    
    // 3. Check the exact error by verifying policies exist
    // The SQL we ran via Supabase Dashboard should have created policies
    // Let's verify by trying to check indirectly
    
    console.log('\n=== Verifying via fetch API ===');
    try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/meal_headcount?select=id&limit=1`, {
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Prefer': 'return=representation'
            }
        });
        console.log('SELECT status:', resp.status);
        
        // Try UPDATE with service role via fetch
        if (todayRecs && todayRecs.length > 0) {
            const testId = todayRecs[0].id;
            const testVal = todayRecs[0].official_present;
            
            const upResp = await fetch(`${SUPABASE_URL}/rest/v1/meal_headcount?id=eq.${testId}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SERVICE_KEY,
                    'Authorization': `Bearer ${SERVICE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ official_present: testVal })
            });
            const upBody = await upResp.text();
            console.log('UPDATE via REST (service role) status:', upResp.status);
            console.log('UPDATE result:', upBody.substring(0, 200));
        }
    } catch (e) {
        console.log('Fetch error:', e.message);
    }
    
    // 4. The actual fix we need to apply
    console.log('\n=== SQL TO RUN IN SUPABASE DASHBOARD ===\n');
    console.log(`-- COPY THIS ENTIRE BLOCK AND RUN IN SUPABASE SQL EDITOR --

-- Drop ALL existing policies on meal_headcount
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'meal_headcount' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.meal_headcount', pol.policyname);
    RAISE NOTICE 'Dropped: %', pol.policyname;
  END LOOP;
END $$;

-- Make sure RLS is ON
ALTER TABLE public.meal_headcount ENABLE ROW LEVEL SECURITY;

-- Policy 1: SELECT - all authenticated users
CREATE POLICY "mhc_select" ON public.meal_headcount
FOR SELECT TO authenticated USING (true);

-- Policy 2: INSERT - admin roles
CREATE POLICY "mhc_insert" ON public.meal_headcount
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) 
  IN ('admin', 'hr_admin', 'hse_admin')
);

-- Policy 3: UPDATE - admin roles  
CREATE POLICY "mhc_update" ON public.meal_headcount
FOR UPDATE TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) 
  IN ('admin', 'hr_admin', 'hse_admin')
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) 
  IN ('admin', 'hr_admin', 'hse_admin')
);

-- Policy 4: DELETE - admin roles
CREATE POLICY "mhc_delete" ON public.meal_headcount
FOR DELETE TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) 
  IN ('admin', 'hr_admin', 'hse_admin')
);

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'meal_headcount';
`);
}

main().catch(console.error);
