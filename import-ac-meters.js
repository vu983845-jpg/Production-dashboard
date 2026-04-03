/**
 * import-ac-meters.js
 * Cập nhật chỉ số đồng hồ AC (AC1, AC2,4, AC3,5,6) vào daily_electricity_others
 * 
 * Nguồn: ảnh bảng Excel ngày 25/2/2026 - 1/4/2026
 * 
 * Logic: "cộng lại là ra số đồng hồ"
 *   - AC Total kWh = (AC1_kwh + AC2,4_kwh + AC3,5,6_kwh)
 *   - Mỗi AC_kwh = chỉ số hôm nay - chỉ số hôm qua (Mwh * 1000 = kWh)
 *   - Lưu vào cột db_ac_hca (kWh tiêu thụ mỗi ngày)
 * 
 * Dữ liệu từ ảnh: chỉ số đồng hồ tích lũy (Mwh) theo ngày
 * Format: [date, ac1_meter_mwh, ac24_meter_mwh, ac356_meter_mwh, ac_total_kwh]
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Dữ liệu từ ảnh: chỉ số đồng hồ tích lũy (Mwh)
// Cột: [Ngày, AC1_meter(Mwh), AC2,4_meter(Mwh), AC3,5,6_meter(Mwh), AC_Total_kWh/ngày]
// AC Total kWh = Điện sử dụng 1 + 2,4 + 3,5,6 (kWh/ngày từ ảnh)
const rawData = [
//  date          AC1_mwh   AC24_mwh  AC356_mwh  kwh1   kwh24   kwh356  total_kwh
  ['2026-02-25',  480.29,   344.77,   1360.3,    10,    110,    4200,   4320],
  ['2026-02-26',  480.63,   344.94,   1362.5,    340,   170,    2200,   2710],
  ['2026-02-27',  481.88,   345.69,   1366.6,    1250,  750,    4100,   6100],
  ['2026-02-28',  483.18,   346.11,   1371.5,    1300,  420,    4900,   6620],
  // CN 1/3 - nghỉ
  ['2026-03-02',  484.25,   346.86,   1375.9,    1070,  750,    4400,   6220],
  ['2026-03-03',  485.14,   347.51,   1379.6,    890,   650,    3700,   5240],
  ['2026-03-04',  486.53,   347.98,   1384.6,    1390,  470,    5000,   6860],
  ['2026-03-05',  487.88,   348.42,   1389.2,    1350,  440,    4600,   6390],
  ['2026-03-06',  489.19,   348.71,   1394.0,    1310,  290,    4800,   6400],
  ['2026-03-07',  490.73,   349.49,   1398.9,    1540,  780,    4900,   7220],
  // CN 8/3 - nghỉ
  ['2026-03-09',  491.72,   349.68,   1402.5,    990,   190,    3600,   4780],
  ['2026-03-10',  493.04,   349.78,   1407.0,    1320,  100,    4500,   5920],
  ['2026-03-11',  494.76,   349.89,   1412.5,    1720,  110,    5500,   7330],
  ['2026-03-12',  496.1,    350.28,   1417.2,    1340,  390,    4700,   6430],
  ['2026-03-13',  497.4,    350.71,   1421.8,    1300,  430,    4600,   6330],
  ['2026-03-14',  498.85,   351.11,   1426.8,    1450,  400,    5000,   6850],
  // CN 15/3 - nghỉ
  ['2026-03-16',  500.12,   351.47,   1431.4,    1270,  360,    4600,   6230],
  ['2026-03-17',  501.14,   351.81,   1435.5,    1020,  340,    4100,   5460],
  ['2026-03-18',  502.31,   351.96,   1439.8,    1170,  150,    4300,   5620],
  ['2026-03-19',  503.64,   352.82,   1443.1,    1330,  860,    3300,   5490],
  ['2026-03-20',  505.26,   353.51,   1447.2,    1620,  690,    4100,   6410],
  ['2026-03-21',  506.58,   354.11,   1450.6,    1320,  600,    3400,   5320],
  // CN 22/3 - nghỉ
  ['2026-03-23',  507.93,   354.51,   1455.4,    1350,  400,    4800,   6550],
  ['2026-03-24',  509.09,   355.05,   1459.3,    1160,  540,    3900,   5600],
  ['2026-03-25',  510.67,   355.21,   1464.4,    1580,  160,    5100,   6840],
  ['2026-03-26',  512.28,   355.96,   1469.3,    1610,  750,    4900,   7260],
  ['2026-03-27',  513.29,   356.22,   1473.1,    1010,  260,    3800,   5070],
  ['2026-03-28',  514.52,   356.55,   1477.8,    1230,  330,    4700,   6260],
  // CN 29/3 - nghỉ
  ['2026-03-30',  515.28,   356.64,   1481.5,    760,   90,     3700,   4550],
  ['2026-03-31',  516.21,   356.86,   1485.2,    930,   220,    3700,   4850],
  ['2026-04-01',  516.51,   356.98,   1486.9,    300,   120,    1700,   2120],
];

async function run() {
  console.log('🔌 Bắt đầu import chỉ số đồng hồ AC ...');

  // Fetch existing data để merge (không overwrite cooling_fan, boiler, etc.)
  const dates = rawData.map(r => r[0]);
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  const { data: existing, error: fetchErr } = await supabase
    .from('daily_electricity_others')
    .select('*')
    .gte('work_date', minDate)
    .lte('work_date', maxDate);

  if (fetchErr) {
    console.error('❌ Lỗi khi fetch existing data:', fetchErr.message);
    return;
  }

  const existingMap = new Map((existing || []).map(r => [r.work_date, r]));

  const payload = rawData.map(([date, ac1, ac24, ac356, kwh1, kwh24, kwh356, totalKwh]) => {
    const ex = existingMap.get(date) || {};
    
    // Chỉ lấy các cột hợp lệ từ existing record (không lấy id, created_at tự động)
    const base = {
      work_date: date,
      cooling_fan: ex.cooling_fan ?? null,
      boiler: ex.boiler ?? null,
      office: ex.office ?? null,
      eco2: ex.eco2 ?? null,
      canteen: ex.canteen ?? null,
      transformer: ex.transformer ?? null,
      maintenance: ex.maintenance ?? null,
    };
    
    return {
      ...base,
      db_ac_hca: totalKwh,           // Tổng kWh tiêu thụ AC trong ngày
      updated_at: new Date().toISOString(),
    };
  });

  console.log(`📊 Chuẩn bị upsert ${payload.length} records (${minDate} → ${maxDate})`);

  // Preview 3 dòng đầu
  console.log('\n📋 Preview 3 dòng đầu:');
  payload.slice(0, 3).forEach(r => {
    console.log(`  ${r.work_date}: db_ac_hca=${r.db_ac_hca} kWh`);
  });

  const { error } = await supabase
    .from('daily_electricity_others')
    .upsert(payload, { onConflict: 'work_date' });

  if (error) {
    console.error('❌ Lỗi khi upsert:', error.message);
  } else {
    console.log(`\n✅ Đã cập nhật thành công ${payload.length} ngày dữ liệu AC vào daily_electricity_others!`);
    console.log('   Cột cập nhật: db_ac_hca (kWh/ngày)');
    console.log('   Các cột khác (cooling_fan, boiler...) được giữ nguyên.');
  }
}

run().catch(console.error);
