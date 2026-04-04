const https = require('https');

const sql = [
  "DROP POLICY IF EXISTS \"iso_seu_write_admin_hse\" ON public.iso50001_seu_master",
  "CREATE POLICY \"iso_seu_write_admin_hse\" ON public.iso50001_seu_master FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin'))) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin')))",
  "DROP POLICY IF EXISTS \"iso_hist_write_admin_hse\" ON public.iso50001_monthly_historical",
  "CREATE POLICY \"iso_hist_write_admin_hse\" ON public.iso50001_monthly_historical FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin'))) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin')))",
  "DROP POLICY IF EXISTS \"iso_baseline_write_admin_hse\" ON public.iso50001_baseline_model",
  "CREATE POLICY \"iso_baseline_write_admin_hse\" ON public.iso50001_baseline_model FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin'))) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin')))",
  "DROP POLICY IF EXISTS \"iso_daily_write_admin_hse\" ON public.iso50001_daily_entry",
  "CREATE POLICY \"iso_daily_write_admin_hse\" ON public.iso50001_daily_entry FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin'))) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'HSE', 'hse', 'hse_admin')))"
];

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8';
const HOST = 'iekjajbmbkqrbalnjwit.supabase.co';

function runQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const options = {
      hostname: HOST,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Running ISO 50001 RLS migration...\n');
  for (const stmt of sql) {
    const preview = stmt.substring(0, 60) + '...';
    try {
      const result = await runQuery(stmt);
      const ok = result.status >= 200 && result.status < 300;
      console.log((ok ? '✅' : '❌') + ' [' + result.status + '] ' + preview);
      if (!ok) console.log('   Error:', result.body);
    } catch (e) {
      console.log('❌ ERROR:', preview, e.message);
    }
  }
  console.log('\nDone!');
}

main();
