/**
 * fix-cumulative-meters.js
 *
 * Từ kết quả tiêu thụ kWh/ngày (ảnh dashboard), tính ngược ra chỉ số đồng hồ tích lũy.
 * Công thức: meter[ngày N] = meter[baseline 2/27] + tổng(kwh từ 2/28 đến ngày N)
 *
 * Cột cập nhật trong daily_electricity_others:
 *   transformer  → Đồng hồ TRANSFORMER (kWh tích lũy)
 *   maintenance  → Đồng hồ MAIN HCA-Shelling (kWh tích lũy)
 *   eco2         → Đồng hồ ECO2 (kWh tích lũy)
 *   db_ac_hca    → Đồng hồ DB-HVAC làm ẩm (kWh tích lũy) [fix lại từ AC data]
 *   canteen      → Đồng hồ Canteen (kWh tích lũy, baseline=0)
 *   office       → DB-Office (kWh tích lũy)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── KWH TIÊU THỤ MỖI NGÀY (từ ảnh dashboard) ───────────────────────────────
// [date, transformer, maintenance, eco2, db_hvac_lam_am, canteen, office]
// ngày CN = 0 (không sản xuất)
const dailyKwh = [
  ['2026-02-28', 15100,  8440,  370,  3202,  246,  839],
  ['2026-03-01',     0,     0,    0,     0,    0,    0],  // CN
  ['2026-03-02', 14100,  7400,  580,  3279,  277, 1145],
  ['2026-03-03', 13400,  7540,  143,  2680,  310, 1024],
  ['2026-03-04', 15300,  8990,   76,  3299,  309, 1095],
  ['2026-03-05', 15100,  9010,    9,  3217,  332, 1278],
  ['2026-03-06', 14700,  8850,    4,  2971,  337, 1122],
  ['2026-03-07', 16600,  9350,  366,  3209,  391, 1045],
  ['2026-03-08',     0,     0,    0,     0,    0,    0],  // CN
  ['2026-03-09', 11900,  6680,  638,  2297,  284,  980],
  ['2026-03-10', 14500,  9620,  151,  2810,  285,  961],
  ['2026-03-11', 15700,  8490,  282,  2992,  261, 1100],
  ['2026-03-12', 15200,  8910,  344,  3085,  258, 1140],
  ['2026-03-13', 15100,  8730,  320,  3204,  307, 1050],
  ['2026-03-14', 15900,  9200,  181,  3272,  302, 1030],
  ['2026-03-15',     0,     0,    0,     0,    0,    0],  // CN
  ['2026-03-16', 14500,  8070,  340,  3390,  327,  970],
  ['2026-03-17', 13200,  7970,  358,  2376,  280, 1200],
  ['2026-03-18', 13700,  8160,  198,  2908,  295, 1060],
  ['2026-03-19', 13500,  7310,   68,  2991,  290, 1060],
  ['2026-03-20', 14600,  8040,   74,  3052,  326,  930],
  ['2026-03-21', 13500,  7540,   95,  2952,  315, 1020],
  ['2026-03-22',     0,     0,    0,     0,    0,    0],  // CN
  ['2026-03-23', 16300,  9710,  482,  3571,  308,  950],
  ['2026-03-24', 13100,  6880,  329,  2251,  302, 1180],
  ['2026-03-25', 15400,  9070,  345,  2981,  281, 1100],
  ['2026-03-26', 15400,  8520,  419,  3046,  282, 1180],
  ['2026-03-27', 14700,  8840,  365,  3135,  333, 1060],
  ['2026-03-28', 14500,  8510,  277,  3163,  299, 1110],
  ['2026-03-29',     0,     0,    0,     0,    0,    0],  // CN
  ['2026-03-30', 11600,  6340,   25,  2580,  270,    0],  // office sai (-116260) → 0
  ['2026-03-31',  8200,  4860,   30,  1903,  416,    0],
  ['2026-04-01',  7300,  4130,   46,  1239,  137,    0],
];

async function run() {
  // ─── 1. Lấy baseline (chỉ số đồng hồ ngày 2/27) từ DB ─────────────────────
  const { data: baseline27, error: baseErr } = await supabase
    .from('daily_electricity_others')
    .select('transformer, maintenance, eco2, db_ac_hca, canteen, office')
    .eq('work_date', '2026-02-27')
    .single();

  if (baseErr || !baseline27) {
    console.error('❌ Không lấy được baseline 2/27:', baseErr?.message);
    console.log('→ Dùng baseline từ file import-electricity-data.js');
  }

  // Baselines từ import-electricity-data.js (2/27)
  const base = {
    transformer:  baseline27?.transformer  ?? 1017600,
    maintenance:  baseline27?.maintenance  ?? 565440,
    eco2:         baseline27?.eco2         ?? 342830,
    db_ac_hca:    baseline27?.db_ac_hca    ?? 5872645,  // DB-HVAC làm ẩm
    canteen:      baseline27?.canteen      ?? 0,
    office:       baseline27?.office       ?? 89662,    // raw kWh (không chia 100)
  };

  console.log('📐 Baseline ngày 27/2/2026:');
  Object.entries(base).forEach(([k, v]) =>
    console.log(`   ${k.padEnd(12)}: ${v?.toLocaleString() ?? 'null'} kWh`)
  );

  // ─── 2. Tính tích lũy (cumulative) từng ngày ───────────────────────────────
  let cum = { ...base };                 // running cumulative
  const payload = [];

  // Fetch existing để giữ cooling_fan, boiler
  const { data: existing } = await supabase
    .from('daily_electricity_others')
    .select('*')
    .gte('work_date', '2026-02-28')
    .lte('work_date', '2026-04-01');
  const exMap = new Map((existing || []).map(r => [r.work_date, r]));

  for (const [date, transf, maint, eco2, hvac, canteen, office] of dailyKwh) {
    cum.transformer += transf;
    cum.maintenance += maint;
    cum.eco2        += eco2;
    cum.db_ac_hca   += hvac;
    cum.canteen     += canteen;
    cum.office      += office;

    const ex = exMap.get(date) || {};
    payload.push({
      work_date:   date,
      cooling_fan: ex.cooling_fan ?? null,
      boiler:      ex.boiler      ?? null,
      transformer: cum.transformer,
      maintenance: cum.maintenance,
      eco2:        cum.eco2,
      db_ac_hca:   cum.db_ac_hca,
      canteen:     cum.canteen,
      office:      cum.office,
      updated_at:  new Date().toISOString(),
    });
  }

  // ─── 3. Preview ─────────────────────────────────────────────────────────────
  console.log('\n📋 Preview (5 ngày đầu):');
  console.log('Date        | transf      | maint   | eco2    | db_hvac   | canteen | office');
  payload.slice(0, 5).forEach(r => {
    console.log(
      `${r.work_date} | ${String(r.transformer).padStart(11)} | ${String(r.maintenance).padStart(7)} | ${String(r.eco2).padStart(7)} | ${String(r.db_ac_hca).padStart(9)} | ${String(r.canteen).padStart(7)} | ${String(r.office).padStart(7)}`
    );
  });

  // Verify với expected values từ import-electricity-data.js
  const check = payload.find(r => r.work_date === '2026-03-04');
  if (check) {
    console.log(`\n✔ Kiểm tra 3/4/2026:`);
    console.log(`  transformer: ${check.transformer} (expected ~1,075,500)`);
    console.log(`  maintenance: ${check.maintenance} (expected ~597,810)`);
    console.log(`  eco2:        ${check.eco2} (expected ~343,999)`);
  }

  // ─── 4. Upsert ─────────────────────────────────────────────────────────────
  const { error } = await supabase
    .from('daily_electricity_others')
    .upsert(payload, { onConflict: 'work_date' });

  if (error) {
    console.error('\n❌ Lỗi upsert:', error.message);
  } else {
    console.log(`\n✅ Đã cập nhật ${payload.length} ngày với chỉ số đồng hồ tích lũy đúng!`);
    console.log('   Cột: transformer, maintenance, eco2, db_ac_hca, canteen, office');
  }
}

run().catch(console.error);
