/**
 * import-all-electric.js
 * Import toàn bộ data điện từ 2 bảng ảnh vào daily_electricity_others
 *
 * Từ ảnh 1: cooling_fan, boiler, db_ac_hca (AC Total kWh/ngày)
 * Từ ảnh 2: transformer, maintenance(MAIN HCA-Shelling), eco2, canteen, office (kWh/ngày)
 *
 * Các cột lưu kWh tiêu thụ mỗi ngày trực tiếp.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── DATA ────────────────────────────────────────────────────────────────────
// Format: date, cooling_fan, boiler, ac_highcare_kwh, ac_total_kwh (từ ảnh 1)
// "-" = không có data -> null
const img1Data = [
//  date          cooling_fan  boiler  ac_highcare  ac_total
  ['2026-02-25',  null,        null,   261,         4320],
  ['2026-02-26',  355,         308,    1390,        2710],
  ['2026-02-27',  385,         359,    1790,        6100],
  ['2026-02-28',  396,         379,    1763,        6620],
  // 1/3 CN - bỏ qua
  ['2026-03-02',  407,         305,    1852,        6220],
  ['2026-03-03',  373,         304,    1332,        5240],
  ['2026-03-04',  545,         317,    1847,        6860],
  ['2026-03-05',  586,         278,    1749,        6390],
  ['2026-03-06',  695,         279,    1602,        6400],
  ['2026-03-07',  473,         380,    1648,        7220],
  // 8/3 CN - bỏ qua
  ['2026-03-09',  509,         423,    1158,        4780],
  ['2026-03-10',  488,         null,   1428,        5920],
  ['2026-03-11',  480,         null,   1547,        7330],
  ['2026-03-12',  485,         null,   1733,        6430],
  ['2026-03-13',  435,         null,   1581,        6330],
  ['2026-03-14',  630,         null,   1625,        6850],
  // 15/3 CN - bỏ qua
  ['2026-03-16',  654,         null,   1896,        6230],
  ['2026-03-17',  725,         253,    1100,        5460],
  ['2026-03-18',  718,         421,    1576,        5620],
  ['2026-03-19',  691,         313,    1727,        5490],
  ['2026-03-20',  569,         300,    1698,        6410],
  ['2026-03-21',  631,         262,    1573,        5320],
  // 22/3 CN - bỏ qua
  ['2026-03-23',  578,         386,    2101,        6550],
  ['2026-03-24',  600,         265,    1056,        5600],
  ['2026-03-25',  596,         243,    1514,        6840],
  ['2026-03-26',  663,         238,    1601,        7260],
  ['2026-03-27',  615,         305,    1641,        5070],
  ['2026-03-28',  618,         296,    1719,        6260],
  // 29/3 CN - bỏ qua
  ['2026-03-30',  617,         194,    1216,        4550],
  ['2026-03-31',  553,         233,    1121,        4850],
  ['2026-04-01',  639,         224,    344,         2120],
];

// Từ ảnh 2 - RIGHT columns: kWh tiêu thụ mỗi ngày
// Format: date, transformer, maintenance(MAIN HCA-Shell), eco2, db_hvac_lam_am, canteen, office
const img2Data = [
//  date          transf   maint   eco2  canteen  office
  ['2026-03-04',  15300,   8990,   76,   309,     1095],
  ['2026-03-05',  15100,   9010,   9,    332,     1278],
  ['2026-03-06',  14700,   8850,   4,    337,     1122],
  ['2026-03-07',  16600,   9350,   366,  391,     1045],
  // 8/3 CN
  ['2026-03-09',  11900,   6680,   638,  284,     980],
  ['2026-03-10',  14500,   9620,   151,  285,     961],
  ['2026-03-11',  15700,   8490,   282,  261,     1100],
  ['2026-03-12',  15200,   8910,   344,  258,     1140],
  ['2026-03-13',  15100,   8730,   320,  307,     1050],
  ['2026-03-14',  15900,   9200,   181,  302,     1030],
  // 15/3 CN
  ['2026-03-16',  14500,   8070,   340,  327,     970],
  ['2026-03-17',  13200,   7970,   358,  280,     1200],
  ['2026-03-18',  13700,   8160,   198,  295,     1060],
  ['2026-03-19',  13500,   7310,   68,   290,     1060],
  ['2026-03-20',  14600,   8040,   74,   326,     930],
  ['2026-03-21',  13500,   7540,   95,   315,     1020],
  // 22/3 CN
  ['2026-03-23',  16300,   9710,   482,  308,     950],
  ['2026-03-24',  13100,   6880,   329,  302,     1180],
  ['2026-03-25',  15400,   9070,   345,  281,     1100],
  ['2026-03-26',  15400,   8520,   419,  282,     1180],
  ['2026-03-27',  14700,   8840,   365,  333,     1060],
  ['2026-03-28',  14500,   8510,   277,  299,     1110],
  // 29/3 CN
  ['2026-03-30',  11600,   6340,   25,   270,     null],  // office = -116260 bất thường -> null
  ['2026-03-31',  8200,    4860,   30,   416,     null],
  ['2026-04-01',  7300,    4130,   46,   137,     null],
];

// ── MERGE ───────────────────────────────────────────────────────────────────
// Gộp cả 2 nguồn vào 1 map theo date
const mergedMap = new Map();

for (const [date, cooling_fan, boiler, ac_highcare, ac_total] of img1Data) {
  mergedMap.set(date, {
    work_date: date,
    cooling_fan: cooling_fan,
    boiler: boiler,
    db_ac_hca: ac_total,   // AC Total kWh (AC1+AC2,4+AC3,5,6)
  });
}

for (const [date, transformer, maintenance, eco2, canteen, office] of img2Data) {
  const existing = mergedMap.get(date) || { work_date: date };
  mergedMap.set(date, {
    ...existing,
    transformer: transformer,
    maintenance: maintenance,
    eco2: eco2,
    canteen: canteen,
    office: office,
  });
}

async function run() {
  const dates = Array.from(mergedMap.keys()).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  console.log(`📊 Tổng ${mergedMap.size} ngày cần cập nhật (${minDate} → ${maxDate})`);

  // Fetch existing để không xóa data khác
  const { data: existing } = await supabase
    .from('daily_electricity_others')
    .select('*')
    .gte('work_date', minDate)
    .lte('work_date', maxDate);

  const existingMap = new Map((existing || []).map(r => [r.work_date, r]));

  const payload = dates.map(date => {
    const ex = existingMap.get(date) || {};
    const newData = mergedMap.get(date);

    // Merge: giữ nguyên các cột không có trong data mới
    return {
      work_date: date,
      cooling_fan:   newData.cooling_fan   ?? ex.cooling_fan   ?? null,
      boiler:        newData.boiler        ?? ex.boiler        ?? null,
      db_ac_hca:     newData.db_ac_hca     ?? ex.db_ac_hca     ?? null,
      transformer:   newData.transformer   ?? ex.transformer   ?? null,
      maintenance:   newData.maintenance   ?? ex.maintenance   ?? null,
      eco2:          newData.eco2          ?? ex.eco2          ?? null,
      canteen:       newData.canteen       ?? ex.canteen       ?? null,
      office:        newData.office        ?? ex.office        ?? null,
      updated_at: new Date().toISOString(),
    };
  });

  // Preview
  console.log('\n📋 Preview 3 dòng:');
  payload.slice(0, 3).forEach(r => {
    console.log(`  ${r.work_date}: fan=${r.cooling_fan} boiler=${r.boiler} ac=${r.db_ac_hca} transf=${r.transformer} maint=${r.maintenance} eco2=${r.eco2} canteen=${r.canteen} office=${r.office}`);
  });

  const { error } = await supabase
    .from('daily_electricity_others')
    .upsert(payload, { onConflict: 'work_date' });

  if (error) {
    console.error('\n❌ Lỗi upsert:', error.message);
  } else {
    console.log(`\n✅ Đã cập nhật ${payload.length} records thành công!`);
    console.log('   Cột đã cập nhật: cooling_fan, boiler, db_ac_hca, transformer, maintenance, eco2, canteen, office');
  }
}

run().catch(console.error);
