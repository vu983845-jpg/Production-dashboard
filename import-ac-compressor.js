/**
 * import-ac-compressor.js
 * 
 * - Lưu chỉ số đồng hồ AC (MWh tích lũy) vào daily_compressor:
 *     meter1 = AC 1 (Mwh)
 *     meter2 = AC 2,4 (Mwh)
 *     meter3 = AC 3,5,6 (Mwh)
 *
 * - Fix lại db_ac_hca trong daily_electricity_others thành giá trị tích lũy
 *   = (AC1 + AC2,4 + AC3,5,6) * 1000 kWh  (để app tính diff đúng)
 *
 * Data gộp từ 2 ảnh: 25/2/2026 → 1/4/2026
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Chỉ số đồng hồ tích lũy (Mwh) - gộp từ cả 2 ảnh
// [date, AC1_mwh, AC2_4_mwh, AC3_5_6_mwh]
const acMeterData = [
  // ── Ảnh 1: 25/2 → 14/3 ──────────────────────────
  ['2026-02-25', 480.29, 344.77, 1360.3],
  ['2026-02-26', 480.63, 344.94, 1362.5],
  ['2026-02-27', 481.88, 345.69, 1366.6],
  ['2026-02-28', 483.18, 346.11, 1371.5],
  ['2026-03-01', 483.18, 346.11, 1371.5], // CN - giữ nguyên
  ['2026-03-02', 484.25, 346.86, 1375.9],
  ['2026-03-03', 485.14, 347.51, 1379.6],
  ['2026-03-04', 486.53, 347.98, 1384.6],
  ['2026-03-05', 487.88, 348.42, 1389.2],
  ['2026-03-06', 489.19, 348.71, 1394.0],
  ['2026-03-07', 490.73, 349.49, 1398.9],
  ['2026-03-08', 490.73, 349.49, 1398.9], // CN
  ['2026-03-09', 491.72, 349.68, 1402.5],
  ['2026-03-10', 493.04, 349.78, 1407.0],
  ['2026-03-11', 494.76, 349.89, 1412.5],
  ['2026-03-12', 496.1,  350.28, 1417.2],
  ['2026-03-13', 497.4,  350.71, 1421.8],
  ['2026-03-14', 498.85, 351.11, 1426.8],
  // ── Ảnh 2: 15/3 → 1/4 (tiếp theo) ───────────────
  ['2026-03-15', 498.85, 351.11, 1426.8], // CN
  ['2026-03-16', 500.12, 351.47, 1431.4],
  ['2026-03-17', 501.14, 351.81, 1435.5],
  ['2026-03-18', 502.31, 351.96, 1439.8],
  ['2026-03-19', 503.64, 352.82, 1443.1],
  ['2026-03-20', 505.26, 353.51, 1447.2],
  ['2026-03-21', 506.58, 354.11, 1450.6],
  ['2026-03-22', 506.58, 354.11, 1450.6], // CN
  ['2026-03-23', 507.93, 354.51, 1455.4],
  ['2026-03-24', 509.09, 355.05, 1459.3],
  ['2026-03-25', 510.67, 355.21, 1464.4],
  ['2026-03-26', 512.28, 355.96, 1469.3],
  ['2026-03-27', 513.29, 356.22, 1473.1],
  ['2026-03-28', 514.52, 356.55, 1477.8],
  ['2026-03-29', 514.52, 356.55, 1477.8], // CN
  ['2026-03-30', 515.28, 356.64, 1481.5],
  ['2026-03-31', 516.21, 356.86, 1485.2],
  ['2026-04-01', 516.51, 356.98, 1486.9],
];

async function run() {
  const minDate = acMeterData[0][0];
  const maxDate = acMeterData[acMeterData.length - 1][0];
  console.log(`🔧 Import AC compressor meters: ${minDate} → ${maxDate}`);
  console.log(`   Tổng: ${acMeterData.length} records\n`);

  // ── 1. Upsert daily_compressor ────────────────────────────────────────────
  // Fetch existing để giữ MNK data (meter1 cũ nếu có) - nhưng ưu tiên AC data
  const { data: existComp } = await supabase
    .from('daily_compressor')
    .select('work_date, meter1, meter2, meter3')
    .gte('work_date', minDate)
    .lte('work_date', maxDate);

  const compMap = new Map((existComp || []).map(r => [r.work_date, r]));

  const compPayload = acMeterData.map(([date, ac1, ac24, ac356]) => {
    // const ex = compMap.get(date) || {}; // (giữ lại nếu muốn merge MNK cũ)
    return {
      work_date: date,
      meter1: ac1,    // AC 1 (Mwh)
      meter2: ac24,   // AC 2,4 (Mwh)
      meter3: ac356,  // AC 3,5,6 (Mwh)
      updated_at: new Date().toISOString(),
    };
  });

  const { error: compErr } = await supabase
    .from('daily_compressor')
    .upsert(compPayload, { onConflict: 'work_date' });

  if (compErr) {
    console.error('❌ Lỗi daily_compressor:', compErr.message);
  } else {
    console.log(`✅ daily_compressor: upserted ${compPayload.length} rows`);
    console.log('   → meter1=AC1 (Mwh), meter2=AC2,4 (Mwh), meter3=AC3,5,6 (Mwh)');
  }

  // ── 2. Fix db_ac_hca trong daily_electricity_others ───────────────────────
  // Lưu GIÁ TRỊ TÍCH LŨY (kWh) để app tính diff đúng
  const { data: existOthers } = await supabase
    .from('daily_electricity_others')
    .select('*')
    .gte('work_date', minDate)
    .lte('work_date', maxDate);

  const othersMap = new Map((existOthers || []).map(r => [r.work_date, r]));

  const othersPayload = acMeterData.map(([date, ac1, ac24, ac356]) => {
    const ex = othersMap.get(date) || {};
    const cumulativeKwh = Math.round((ac1 + ac24 + ac356) * 1000); // Mwh → kWh
    return {
      work_date: date,
      cooling_fan:  ex.cooling_fan  ?? null,
      boiler:       ex.boiler       ?? null,
      transformer:  ex.transformer  ?? null,
      maintenance:  ex.maintenance  ?? null,
      eco2:         ex.eco2         ?? null,
      canteen:      ex.canteen      ?? null,
      office:       ex.office       ?? null,
      db_ac_hca:    cumulativeKwh,           // ← tích lũy (kWh) để diff đúng
      updated_at:   new Date().toISOString(),
    };
  });

  const { error: othersErr } = await supabase
    .from('daily_electricity_others')
    .upsert(othersPayload, { onConflict: 'work_date' });

  if (othersErr) {
    console.error('❌ Lỗi daily_electricity_others:', othersErr.message);
  } else {
    console.log(`✅ daily_electricity_others: fixed db_ac_hca → cumulative kWh`);
    // Preview
    const preview = acMeterData.slice(0, 3);
    preview.forEach(([d, a, b, c]) => {
      const kwh = Math.round((a + b + c) * 1000);
      console.log(`   ${d}: (${a}+${b}+${c}) Mwh × 1000 = ${kwh.toLocaleString()} kWh cumulative`);
    });
  }

  console.log('\n🏁 Xong!');
}

run().catch(console.error);
