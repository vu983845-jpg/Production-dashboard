/**
 * import-meal-csv.js
 * Import dữ liệu từ file CSV "Báo Cơm" vào Supabase meal_headcount
 * Department name lấy theo tên trong file CSV (chuẩn hóa), không dùng code.
 *
 * Cách dùng:
 *   SUPABASE_SERVICE_KEY=xxx node import-meal-csv.js ./meal-04-2026.csv
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://iekjajbmbkqrbalnjwit.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) { console.error('❌ Cần SUPABASE_SERVICE_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Section → { dept_name (tên chuẩn), shift, type } ──────────────────────
// dept_name khớp với tên hiển thị trong dashboard (department_name trong meal_headcount)
const SECTION_MAP = {
    // LOADING / FGWH
    'Loading S1':                               { dept: 'Loading',            shift: '1', type: 'official' },
    'Loading S2':                               { dept: 'Loading',            shift: '2', type: 'official' },
    'Loading S3':                               { dept: 'Loading',            shift: '3', type: 'official' },
    // STEAMING
    'Steaming S1':                              { dept: 'Steaming',           shift: '1', type: 'official' },
    'Steaming S2':                              { dept: 'Steaming',           shift: '2', type: 'official' },
    'Steaming S3':                              { dept: 'Steaming',           shift: '3', type: 'official' },
    // SHELLING
    'Shelling S1':                              { dept: 'Shelling',           shift: '1', type: 'official' },
    'Shelling thời vụ S1':                      { dept: 'Shelling',           shift: '1', type: 'seasonal' },
    'Shelling S2':                              { dept: 'Shelling',           shift: '2', type: 'official' },
    'Shelling thời vụ S2':                      { dept: 'Shelling',           shift: '2', type: 'seasonal' },
    'Shelling S3':                              { dept: 'Shelling',           shift: '3', type: 'official' },
    'Shelling thời vụ S3':                      { dept: 'Shelling',           shift: '3', type: 'seasonal' },
    // MAINTENANCE SHELLING
    'Maintenance shelling S1':                  { dept: 'Maintenance Shelling', shift: '1', type: 'official' },
    'Maintenance shelling S2':                  { dept: 'Maintenance Shelling', shift: '2', type: 'official' },
    'Maintenance shelling S3':                  { dept: 'Maintenance Shelling', shift: '3', type: 'official' },
    // BORMA
    'Borma S1':                                 { dept: 'Borma',              shift: '1', type: 'official' },
    'Borma thời vụ S1':                         { dept: 'Borma',              shift: '1', type: 'seasonal' },
    'Borma S2':                                 { dept: 'Borma',              shift: '2', type: 'official' },
    'Borma thời vụ S2':                         { dept: 'Borma',              shift: '2', type: 'seasonal' },
    'Borma S3':                                 { dept: 'Borma',              shift: '3', type: 'official' },
    'Borma thời vụ S3':                         { dept: 'Borma',              shift: '3', type: 'seasonal' },
    // PEELING MACHINE (Peeling mc)
    'Peeling S1':                               { dept: 'Peeling Mc',         shift: '1', type: 'official' },
    'Peeling thời vụ S1':                       { dept: 'Peeling Mc',         shift: '1', type: 'seasonal' },
    'Peeling S2':                               { dept: 'Peeling Mc',         shift: '2', type: 'official' },
    'Peeling thời vụ S2':                       { dept: 'Peeling Mc',         shift: '2', type: 'seasonal' },
    'Peeling S3':                               { dept: 'Peeling Mc',         shift: '3', type: 'official' },
    'Peeling thời vụ S3':                       { dept: 'Peeling Mc',         shift: '3', type: 'seasonal' },
    // COLOR SORTER (Machine Grading)
    'Machine Grading - shift 1':                { dept: 'Color Sorter',       shift: '1', type: 'official' },
    'Machine Grading - shift 1 ':               { dept: 'Color Sorter',       shift: '1', type: 'official' },
    'Machine Grading  - thời vụ 1':             { dept: 'Color Sorter',       shift: '1', type: 'seasonal' },
    'Machine Grading  - shift 2':               { dept: 'Color Sorter',       shift: '2', type: 'official' },
    'Machine Grading  thời vụ - shift 2':       { dept: 'Color Sorter',       shift: '2', type: 'seasonal' },
    'Machine Grading  - shift 3':               { dept: 'Color Sorter',       shift: '3', type: 'official' },
    'Machine Grading  thời vụ- shift 3':        { dept: 'Color Sorter',       shift: '3', type: 'seasonal' },
    // HANDPEELING – Manual Grading (Ms Huệ)
    'Manual Grading -Shift 1 (Ms Huệ)':         { dept: 'Manual Grading (Ms Huệ)',  shift: '1', type: 'official' },
    'Manual Grading Thời vụ -Shift 1 (Ms Huệ)': { dept: 'Manual Grading (Ms Huệ)', shift: '1', type: 'seasonal' },
    'Manual Grading -Shift 2 (Ms Huệ)':         { dept: 'Manual Grading (Ms Huệ)',  shift: '2', type: 'official' },
    'Manual Grading Thời vụ -Shift 2 (Ms Huệ)': { dept: 'Manual Grading (Ms Huệ)', shift: '2', type: 'seasonal' },
    'Manual Grading -Shift 3 (Ms Huệ)':         { dept: 'Manual Grading (Ms Huệ)',  shift: '3', type: 'official' },
    'Manual Grading Thời vụ -Shift 3 (Ms Huệ)': { dept: 'Manual Grading (Ms Huệ)', shift: '3', type: 'seasonal' },
    // HANDPEELING – Manual Peeling (Liên)
    'Manual peeling S1 - Liên':                 { dept: 'Manual Peeling (Liên)',    shift: '1', type: 'official' },
    'Manual peeling S1 thời vụ - Liên':         { dept: 'Manual Peeling (Liên)',    shift: '1', type: 'seasonal' },
    'Manual peeling S2 - Liên':                 { dept: 'Manual Peeling (Liên)',    shift: '2', type: 'official' },
    'Manual peeling S2 thời vụ - Liên':         { dept: 'Manual Peeling (Liên)',    shift: '2', type: 'seasonal' },
    'Manual peeling S3 - Liên':                 { dept: 'Manual Peeling (Liên)',    shift: '3', type: 'official' },
    'Manual peeling S3 thời vụ - Liên':         { dept: 'Manual Peeling (Liên)',    shift: '3', type: 'seasonal' },
    // HANDPEELING – Manual Peeling (Dung)
    'Manual peeling S1 - Dung':                 { dept: 'Manual Peeling (Dung)',    shift: '1', type: 'official' },
    'Manual peeling S1 thời vụ - Dung':         { dept: 'Manual Peeling (Dung)',    shift: '1', type: 'seasonal' },
    'Manual peeling S2 - Dung':                 { dept: 'Manual Peeling (Dung)',    shift: '2', type: 'official' },
    'Manual peeling S2 thời vụ - Dung':         { dept: 'Manual Peeling (Dung)',    shift: '2', type: 'seasonal' },
    'Manual peeling S3 - Dung':                 { dept: 'Manual Peeling (Dung)',    shift: '3', type: 'official' },
    'Manual peeling S3 thời vụ - Dung':         { dept: 'Manual Peeling (Dung)',    shift: '3', type: 'seasonal' },
    // PACKING
    'Packing S1':                               { dept: 'Packing',            shift: '1', type: 'official' },
    'Packing thời vụ S1':                       { dept: 'Packing',            shift: '1', type: 'seasonal' },
    'Packing S2':                               { dept: 'Packing',            shift: '2', type: 'official' },
    'Packing thời vụ S2':                       { dept: 'Packing',            shift: '2', type: 'seasonal' },
    'Packing S3':                               { dept: 'Packing',            shift: '3', type: 'official' },
    // BOILER
    'Boiler worker S1':                         { dept: 'Boiler',             shift: '1', type: 'official' },
    'Boiler worker S2':                         { dept: 'Boiler',             shift: '2', type: 'official' },
    'Boiler worker S3':                         { dept: 'Boiler',             shift: '3', type: 'official' },
    // MAINTENANCE HCA
    'Maintenance S1':                           { dept: 'Maintenance',        shift: '1', type: 'official' },
    'Maintenance S2':                           { dept: 'Maintenance',        shift: '2', type: 'official' },
    'Maintenance S3':                           { dept: 'Maintenance',        shift: '3', type: 'official' },
    // QC
    'QC':                                       { dept: 'QC',                 shift: '1', type: 'official' },
    'QC S2':                                    { dept: 'QC',                 shift: '2', type: 'official' },
    'QC S3':                                    { dept: 'QC',                 shift: '3', type: 'official' },
    // CLEANING
    'Cleaning worker':                          { dept: 'Cleaning',           shift: '1', type: 'official' },
    'Cleaning worker S2':                       { dept: 'Cleaning',           shift: '2', type: 'official' },
    'Cleaning worker S3':                       { dept: 'Cleaning',           shift: '3', type: 'official' },
    // OFFICE
    'Office 1':                                 { dept: 'Office',             shift: '1', type: 'official' },
    'Office 2':                                 { dept: 'Office',             shift: '2', type: 'official' },
    'Office 3':                                 { dept: 'Office',             shift: '3', type: 'official' },
};

// Named OT sections
const NAMED_OT = {
    'Packing OT':     'Packing',
    'Boiler OT':      'Boiler',
    'Maintenance OT': 'Maintenance',
    'QC OT':          'QC',
};

function parsePeriod(csvText) {
    const m = csvText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return {
        fromDay: parseInt(m[1]), fromMonth: parseInt(m[2]), fromYear: parseInt(m[3]),
        toDay:   parseInt(m[4]), toMonth:   parseInt(m[5]), toYear:   parseInt(m[6]),
    };
}

function colToDate(colDay, period) {
    if (colDay >= 26) {
        return `${period.fromYear}-${String(period.fromMonth).padStart(2,'0')}-${String(colDay).padStart(2,'0')}`;
    } else {
        return `${period.toYear}-${String(period.toMonth).padStart(2,'0')}-${String(colDay).padStart(2,'0')}`;
    }
}

function parseCSV(csvText) {
    const lines = csvText.replace(/\r/g, '').split('\n');
    const period = parsePeriod(csvText);
    if (!period) throw new Error('Không tìm thấy thông tin kỳ thanh toán trong CSV');
    console.log(`📅 Chu kỳ: ${period.fromDay}/${period.fromMonth}/${period.fromYear} → ${period.toDay}/${period.toMonth}/${period.toYear}`);

    let headerIdx = -1;
    let colDays = [];
    for (let i = 0; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols[0].trim() === 'Section') {
            headerIdx = i;
            colDays = cols.slice(1, -1).map(d => parseInt(d.trim())).filter(d => !isNaN(d));
            break;
        }
    }
    if (headerIdx === -1) throw new Error('Không tìm thấy header row "Section"');
    console.log(`📊 Số cột ngày: ${colDays.length} (${colDays[0]}..${colDays[colDays.length-1]})`);

    // key: "dept_name|shift|work_date"
    const grouped = new Map();

    const dataLines = lines.slice(headerIdx + 1);
    let seenTotal = false;
    let lastDept = null;

    for (const line of dataLines) {
        if (!line.trim()) continue;
        const cols = line.split(',');
        const sectionRaw = cols[0];
        const section = sectionRaw.trim();

        if (section === 'Total') { seenTotal = true; continue; }
        if (seenTotal) continue;
        if (!section) continue;

        // OT rows
        let otDept = NAMED_OT[section] || null;
        if (!otDept && section === 'OT' && lastDept) otDept = lastDept;

        if (otDept) {
            for (let ci = 0; ci < colDays.length; ci++) {
                const colDay = colDays[ci];
                const val = parseInt((cols[ci + 1] || '').trim());
                if (isNaN(val) || val === 0) continue;
                const workDate = colToDate(colDay, period);
                const key = `${otDept}|OT|${workDate}`;
                if (!grouped.has(key)) {
                    grouped.set(key, { dept: otDept, shift: 'OT', work_date: workDate,
                        official_present: 0, seasonal_present: 0, ot_count: 0 });
                }
                grouped.get(key).official_present += val;
            }
            continue;
        }

        const mapping = SECTION_MAP[section] || SECTION_MAP[sectionRaw];
        if (!mapping) { continue; }

        lastDept = mapping.dept;

        for (let ci = 0; ci < colDays.length; ci++) {
            const colDay = colDays[ci];
            const val = parseInt((cols[ci + 1] || '').trim());
            if (isNaN(val) || val === 0) continue;

            const workDate = colToDate(colDay, period);
            const key = `${mapping.dept}|${mapping.shift}|${workDate}`;

            if (!grouped.has(key)) {
                grouped.set(key, {
                    dept: mapping.dept, shift: mapping.shift, work_date: workDate,
                    official_present: 0, seasonal_present: 0, ot_count: 0,
                });
            }
            const entry = grouped.get(key);
            if (mapping.type === 'official') entry.official_present += val;
            if (mapping.type === 'seasonal') entry.seasonal_present += val;
        }
    }

    return { period, records: [...grouped.values()] };
}

async function main() {
    const arg = process.argv[2];
    if (!arg || !fs.existsSync(arg)) {
        console.error('❌ Cần truyền path file CSV: node import-meal-csv.js ./meal-04-2026.csv');
        process.exit(1);
    }

    console.log('📂 Đọc từ file:', arg);
    const csvText = fs.readFileSync(arg, 'utf-8');

    const { period, records } = parseCSV(csvText);
    console.log(`\n✅ Parsed: ${records.length} grouped records`);

    // Build payload
    const payload = records.map(r => ({
        work_date:        r.work_date,
        department_name:  r.dept,
        department_id:    null,
        shift:            r.shift,
        official_present: r.official_present,
        official_absent:  0,
        seasonal_present: r.seasonal_present,
        seasonal_absent:  0,
        ot_count:         r.ot_count,
        vegetarian:       0,
        note:             `Imported CSV ${period.fromDay}/${period.fromMonth}/${period.fromYear}→${period.toDay}/${period.toMonth}/${period.toYear}`,
    }));

    console.log('\n📋 Preview 5 records đầu:');
    payload.slice(0, 5).forEach(r =>
        console.log(`  ${r.work_date} | ${r.department_name} | Ca ${r.shift} | CT=${r.official_present} TV=${r.seasonal_present}`)
    );

    // Upsert theo conflict (work_date, department_name, shift)
    console.log(`\n⏳ Upsert ${payload.length} records...`);
    const BATCH = 50;
    let inserted = 0;
    let failed = 0;
    for (let i = 0; i < payload.length; i += BATCH) {
        const batch = payload.slice(i, i + BATCH);
        const { error } = await supabase
            .from('meal_headcount')
            .upsert(batch, { onConflict: 'work_date,department_name,shift', ignoreDuplicates: false });
        if (error) {
            console.error(`  ❌ Batch ${i}-${i+BATCH} error:`, error.message);
            failed += batch.length;
        } else {
            inserted += batch.length;
            process.stdout.write(`  ✅ ${inserted}/${payload.length}\r`);
        }
    }
    console.log(`\n\n🎉 Xong! Upsert ${inserted} records, lỗi: ${failed}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
