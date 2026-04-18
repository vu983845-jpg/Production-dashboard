const { Client } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const dbStr = env.match(/DATABASE_URL=\"?(.*?)\"?(\n|$)/)[1];
const client = new Client({ connectionString: dbStr });
client.connect().then(async () => {
    console.log('Connected');
    try {
        const queries = [
            `DROP POLICY IF EXISTS "energy_admin_hse_all" ON daily_energy;`,
            `CREATE POLICY "energy_admin_hse_all" ON daily_energy FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint'))) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint')));`,
            `DROP POLICY IF EXISTS "compressor_admin_hse_all" ON daily_compressor;`,
            `CREATE POLICY "compressor_admin_hse_all" ON daily_compressor FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint'))) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint')));`,
            `DROP POLICY IF EXISTS "daily_plan_admin_all" ON daily_plan;`,
            `DROP POLICY IF EXISTS "daily_plan_admin_all_v2" ON daily_plan;`,
            `CREATE POLICY "daily_plan_admin_all_v2" ON daily_plan FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint', 'hr', 'hr_admin'))) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin', 'maint', 'hr', 'hr_admin')));`,
        ];
        for (const q of queries) {
            console.log('Running: ', q);
            await client.query(q);
        }
        console.log('Success!');
    } catch (e) { console.error(e) }
    client.end();
});
