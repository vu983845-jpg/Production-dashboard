/**
 * import-meal-excel.js
 * Import data từ Google Sheets "Báo Cơm 2026" vào Supabase meal_headcount
 *
 * Cách dùng:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node import-meal-excel.js [SHEET_URL_CSV]
 *
 * Mặc định dùng sheet 12.2025
 * Để import tháng khác, export sheet đó thành CSV rồi truyền path vào:
 *   node import-meal-excel.js ./data-03-2026.csv
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iekjajbmbkqrbalnjwit.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
    console.error('❌ Cần set SUPABASE_SERVICE_KEY env var');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Section → dept_code + shift + type ───────────────────────────────────
// type: "official" | "seasonal" | "ot"
const SECTION_MAP = {
    // LOADING / WH (FGWH + RCN)
    'Loading S1':                               { code: 'FGWH',       shift: '1', type: 'official' },
    'Loading S2':                               { code: 'FGWH',       shift: '2', type: 'official' },
    'Loading S3':                               { code: 'FGWH',       shift: '3', type: 'official' },
    // STEAMING
    'Steaming S1':                              { code: 'STEAM',      shift: '1', type: 'official' },
    'Steaming S2':                              { code: 'STEAM',      shift: '2', type: 'official' },
    'Steaming S3':                              { code: 'STEAM',      shift: '3', type: 'official' },
    // SHELLING
    'Shelling S1':                              { code: 'SHELL',      shift: '1', type: 'official' },
    'Shelling thời vụ S1':                      { code: 'SHELL',      shift: '1', type: 'seasonal' },
    'Shelling S2':                              { code: 'SHELL',      shift: '2', type: 'official' },
    'Shelling thời vụ S2':                      { code: 'SHELL',      shift: '2', type: 'seasonal' },
    'Shelling S3':                              { code: 'SHELL',      shift: '3', type: 'official' },
    'Shelling thời vụ S3':                      { code: 'SHELL',      shift: '3', type: 'seasonal' },
    // MAINTENANCE SHELLING
    'Maintenance shelling S1':                  { code: 'MAINT_SHELL', shift: '1', type: 'official' },
    'Maintenance shelling S2':                  { code: 'MAINT_SHELL', shift: '2', type: 'official' },
    'Maintenance shelling S3':                  { code: 'MAINT_SHELL', shift: '3', type: 'official' },
    // BORMA
    'Borma S1':                                 { code: 'BORMA',      shift: '1', type: 'official' },
    'Borma thời vụ S1':                         { code: 'BORMA',      shift: '1', type: 'seasonal' },
    'Borma S2':                                 { code: 'BORMA',      shift: '2', type: 'official' },
    'Borma thời vụ S2':                         { code: 'BORMA',      shift: '2', type: 'seasonal' },
    'Borma S3':                                 { code: 'BORMA',      shift: '3', type: 'official' },
    'Borma thời vụ S3':                         { code: 'BORMA',      shift: '3', type: 'seasonal' },
    // PEELING MACHINE
    'Peeling S1':                               { code: 'PEEL',       shift: '1', type: 'official' },
    'Peeling thời vụ S1':                       { code: 'PEEL',       shift: '1', type: 'seasonal' },
    'Peeling S2':                               { code: 'PEEL',       shift: '2', type: 'official' },
    'Peeling thời vụ S2':                       { code: 'PEEL',       shift: '2', type: 'seasonal' },
    'Peeling S3':                               { code: 'PEEL',       shift: '3', type: 'official' },
    'Peeling thời vụ S3':                       { code: 'PEEL',       shift: '3', type: 'seasonal' },
    // COLOR SORTER (Machine Grading)
    'Machine Grading - shift 1 ':               { code: 'CS',         shift: '1', type: 'official' },
    'Machine Grading - shift 1':                { code: 'CS',         shift: '1', type: 'official' },
    'Machine Grading  - thời vụ 1':             { code: 'CS',         shift: '1', type: 'seasonal' },
    'Machine Grading  - shift 2':               { code: 'CS',         shift: '2', type: 'official' },
    'Machine Grading  thời vụ - shift 2':       { code: 'CS',         shift: '2', type: 'seasonal' },
    'Machine Grading  - shift 3':               { code: 'CS',         shift: '3', type: 'official' },
    'Machine Grading  thời vụ- shift 3':        { code: 'CS',         shift: '3', type: 'seasonal' },
    // HANDPEELING – Manual Grading (Ms Huệ) + Manual Peeling (Liên/Dung)
    'Manual Grading -Shift 1 (Ms Huệ)':         { code: 'HPEEL',      shift: '1', type: 'official' },
    'Manual Grading Thời vụ -Shift 1 (Ms Huệ)': { code: 'HPEEL',     shift: '1', type: 'seasonal' },
    'Manual Grading -Shift 2 (Ms Huệ)':         { code: 'HPEEL',      shift: '2', type: 'official' },
    'Manual Grading Thời vụ -Shift 2 (Ms Huệ)': { code: 'HPEEL',     shift: '2', type: 'seasonal' },
    'Manual Grading -Shift 3 (Ms Huệ)':         { code: 'HPEEL',      shift: '3', type: 'official' },
    'Manual Grading Thời vụ -Shift 3 (Ms Huệ)': { code: 'HPEEL',     shift: '3', type: 'seasonal' },
    'Manual peeling S1 - Liên':                 { code: 'HPEEL',      shift: '1', type: 'official' },
    'Manual peeling S1 thời vụ - Liên':         { code: 'HPEEL',      shift: '1', type: 'seasonal' },
    'Manual peeling S1 - Dung':                 { code: 'HPEEL',      shift: '1', type: 'official' },
    'Manual peeling S1 thời vụ - Dung':         { code: 'HPEEL',      shift: '1', type: 'seasonal' },
    'Manual peeling S2 - Liên':                 { code: 'HPEEL',      shift: '2', type: 'official' },
    'Manual peeling S2 thời vụ - Liên':         { code: 'HPEEL',      shift: '2', type: 'seasonal' },
    'Manual peeling S2 - Dung':                 { code: 'HPEEL',      shift: '2', type: 'official' },
    'Manual peeling S2 thời vụ - Dung':         { code: 'HPEEL',      shift: '2', type: 'seasonal' },
    'Manual peeling S3 - Liên':                 { code: 'HPEEL',      shift: '3', type: 'official' },
    'Manual peeling S3 thời vụ - Liên':         { code: 'HPEEL',      shift: '3', type: 'seasonal' },
    'Manual peeling S3 - Dung':                 { code: 'HPEEL',      shift: '3', type: 'official' },
    'Manual peeling S3 thời vụ - Dung':         { code: 'HPEEL',      shift: '3', type: 'seasonal' },
    // PACKING
    'Packing S1':                               { code: 'PACK',       shift: '1', type: 'official' },
    'Packing thời vụ S1':                       { code: 'PACK',       shift: '1', type: 'seasonal' },
    'Packing S2':                               { code: 'PACK',       shift: '2', type: 'official' },
    'Packing thời vụ S2':                       { code: 'PACK',       shift: '2', type: 'seasonal' },
    'Packing S3':                               { code: 'PACK',       shift: '3', type: 'official' },
    // BOILER
    'Boiler worker S1':                         { code: 'BOILER',     shift: '1', type: 'official' },
    'Boiler worker S2':                         { code: 'BOILER',     shift: '2', type: 'official' },
    'Boiler worker S3':                         { code: 'BOILER',     shift: '3', type: 'official' },
    // MAINTENANCE HCA
    'Maintenance S1':                           { code: 'MAINT_HCA',  shift: '1', type: 'official' },
    'Maintenance S2':                           { code: 'MAINT_HCA',  shift: '2', type: 'official' },
    'Maintenance S3':                           { code: 'MAINT_HCA',  shift: '3', type: 'official' },
    // CLEANING
    'Cleaning worker':                          { code: 'CLEAN',      shift: '1', type: 'official' },
    'Cleaning worker S2':                       { code: 'CLEAN',      shift: '2', type: 'official' },
    'Cleaning worker S3':                       { code: 'CLEAN',      shift: '3', type: 'official' },
    // QC
    'QC':                                       { code: 'QC',         shift: '1', type: 'official' },
    'QC S2':                                    { code: 'QC',         shift: '2', type: 'official' },
    'QC S3':                                    { code: 'QC',         shift: '3', type: 'official' },
    // OFFICE
    'Office 1':                                 { code: 'OFFICE',     shift: '1', type: 'official' },
    'Office 2':                                 { code: 'OFFICE',     shift: '2', type: 'official' },
    'Office 3':                                 { code: 'OFFICE',     shift: '3', type: 'official' },
};

// OT section names that belong to specific depts
const NAMED_OT_SECTIONS = {
    'Packing OT':     'PACK',
    'Boiler OT':      'BOILER',
    'Maintenance OT': 'MAINT_HCA',
    'QC OT':          'QC',
    'Cleaning OT':    'CLEAN',
};

// ─── Parse period từ header CSV ───────────────────────────────────────────
function parsePeriod(csvText) {
    // "Từ ngày 26/11/2025 đến ngày 25/12/2025"
    const m = csvText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return {
        fromDay: parseInt(m[1]), fromMonth: parseInt(m[2]), fromYear: parseInt(m[3]),
        toDay:   parseInt(m[4]), toMonth:   parseInt(m[5]), toYear:   parseInt(m[6]),
    };
}

// ─── Chuyển cột số (26..30, 1..25) → ISO date ────────────────────────────
function colToDate(colDay, period) {
    if (colDay >= 26) {
        // Tháng trước
        const y = period.fromYear;
        const m = period.fromMonth;
        return `${y}-${String(m).padStart(2,'0')}-${String(colDay).padStart(2,'0')}`;
    } else {
        // Tháng hiện tại
        const y = period.toYear;
        const m = period.toMonth;
        return `${y}-${String(m).padStart(2,'0')}-${String(colDay).padStart(2,'0')}`;
    }
}

// ─── Parse CSV ────────────────────────────────────────────────────────────
function parseCSV(csvText) {
    const lines = csvText.replace(/\r/g, '').split('\n');
    const period = parsePeriod(csvText);
    if (!period) throw new Error('Không tìm thấy thông tin kỳ thanh toán trong CSV');
    console.log(`📅 Chu kỳ: ${period.fromDay}/${period.fromMonth}/${period.fromYear} → ${period.toDay}/${period.toMonth}/${period.toYear}`);

    // Tìm header row (chứa "Section")
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
    if (headerIdx === -1) throw new Error('Không tìm thấy header row "Section" trong CSV');
    console.log(`📊 Số cột ngày: ${colDays.length} (${colDays[0]}..${colDays[colDays.length-1]})`);

    // key: "DEPTCODE|shift|work_date"
    // value: { official_present, seasonal_present, ot_count, ... }
    const grouped = new Map();

    // Named OT sections → dept code (moved to top-level const NAMED_OT_SECTIONS above)

    const dataLines = lines.slice(headerIdx + 1);
    let seenTotal = false;
    let lastDeptCode = null;
    let lastSectionName = null;

    for (const line of dataLines) {
        if (!line.trim()) continue;
        const cols = line.split(',');
        const sectionRaw = cols[0];
        const section = sectionRaw.trim();

        // Khi gặp hàng Total → tất cả phía sau là summary, bỏ qua
        if (section === 'Total') { seenTotal = true; continue; }
        if (seenTotal) continue;
        if (!section) continue;

        // Normalize Unicode NFC (CSV sometimes uses NFD decomposed Vietnamese)
        const sectionNFC = section.normalize('NFC');


        // ── Xác định dept code cho OT row ──────────────────────
        let otDeptCode = NAMED_OT_SECTIONS[sectionNFC] || null;
        if (!otDeptCode && sectionNFC === 'OT' && lastDeptCode) otDeptCode = lastDeptCode;

        if (otDeptCode) {
            // OT row: department_name = section name + " OT" for named OT, or lastSectionName for generic OT
            const otSectionName = NAMED_OT_SECTIONS[sectionNFC] ? sectionNFC : (lastSectionName ? `${lastSectionName} OT` : `${otDeptCode} OT`)
            for (let ci = 0; ci < colDays.length; ci++) {
                const colDay = colDays[ci];
                const val = parseInt((cols[ci + 1] || '').trim());
                if (isNaN(val) || val === 0) continue;
                const workDate = colToDate(colDay, period);
                // Key by OT section name + shift OT
                const key = `${otSectionName}|OT|${workDate}`;
                if (!grouped.has(key)) {
                    grouped.set(key, { code: otDeptCode, shift: 'OT', work_date: workDate,
                        section_name: otSectionName,
                        official_present: 0, seasonal_present: 0, ot_count: 0 });
                }
                grouped.get(key).official_present += val;
            }
            continue;
        }

        // ── Regular section ─────────────────────────────────────
        // Use NFC-normalized name to match SECTION_MAP (handles NFD CSV vs NFC map keys)
        const mapping = SECTION_MAP[sectionNFC] || SECTION_MAP[section] || SECTION_MAP[sectionRaw];
        if (!mapping) continue;

        lastDeptCode = mapping.code; // cập nhật dept hiện tại
        lastSectionName = sectionNFC; // lưu NFC section name để dùng cho OT row tiếp theo

        for (let ci = 0; ci < colDays.length; ci++) {
            const colDay = colDays[ci];
            const val = parseInt((cols[ci + 1] || '').trim());
            if (isNaN(val) || val === 0) continue;

            const workDate = colToDate(colDay, period);
            // Key by NFC SECTION NAME to preserve section-level granularity
            const key = `${sectionNFC}|${mapping.shift}|${workDate}`;

            if (!grouped.has(key)) {
                grouped.set(key, {
                    code: mapping.code, shift: mapping.shift, work_date: workDate,
                    section_name: sectionNFC,  // store NFC normalized name in DB
                    official_present: 0, seasonal_present: 0, ot_count: 0,
                });
            }
            const entry = grouped.get(key);
            if (mapping.type === 'official')  entry.official_present += val;
            if (mapping.type === 'seasonal')  entry.seasonal_present += val;
            if (mapping.type === 'ot')        entry.ot_count += val;
        }
    }

    return { period, records: [...grouped.values()] };
}

// ─── Fetch CSV từ URL ─────────────────────────────────────────────────────
function fetchCSV(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return resolve(fetchCSV(res.headers.location));
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
    const arg = process.argv[2];

    let csvText;
    if (arg && arg.startsWith('http')) {
        console.log('🌐 Fetching từ URL...');
        csvText = await fetchCSV(arg);
    } else if (arg && fs.existsSync(arg)) {
        console.log('📂 Đọc từ file:', arg);
        csvText = fs.readFileSync(arg, 'utf-8');
    } else {
        // Default: Google Sheets sheet mặc định (12.2025)
        const sheetUrl = 'https://docs.google.com/spreadsheets/d/1YUkb4zjYDqp6BaJz3el29P14LBdmtFnTymh29nb-Ztk/export?format=csv';
        console.log('🌐 Fetching sheet mặc định...');
        csvText = await fetchCSV(sheetUrl);
    }

    // Parse
    const { period, records } = parseCSV(csvText);
    console.log(`\n✅ Parsed: ${records.length} grouped records`);

    // Fetch departments để lấy ID
    const { data: depts, error: deptErr } = await supabase.from('departments').select('id, code, name_en');
    if (deptErr) throw deptErr;
    const codeToId   = {};
    const codeToName = {};
    depts.forEach(d => { codeToId[d.code] = d.id; codeToName[d.code] = d.name_en; });

    // Build payload - use section_name as department_name for full granularity
    const payload = records.map(r => ({
        work_date:        r.work_date,
        department_name:  r.section_name || codeToName[r.code] || r.code,
        department_id:    codeToId[r.code] || null,
        shift:            r.shift,
        official_present: r.official_present,
        official_absent:  0,
        seasonal_present: r.seasonal_present,
        seasonal_absent:  0,
        ot_count:         r.ot_count,
        vegetarian:       0,
        note:             `Imported from Excel ${period.fromDay}/${period.fromMonth}/${period.fromYear}→${period.toDay}/${period.toMonth}/${period.toYear}`,
    }));

    // Preview
    console.log('\n📋 Preview 5 records đầu:');
    payload.slice(0, 5).forEach(r =>
        console.log(`  ${r.work_date} | ${r.department_name} | Ca ${r.shift} | CT=${r.official_present} TV=${r.seasonal_present}`)
    );

    // Confirm
    console.log(`\n⏳ Chuẩn bị upsert ${payload.length} records vào DB...`);

    // Batch upsert (50 records/batch)
    const BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += BATCH) {
        const batch = payload.slice(i, i + BATCH);
        const { error } = await supabase
            .from('meal_headcount')
            .upsert(batch, { onConflict: 'work_date,department_name,shift' });
        if (error) {
            console.error(`  ❌ Batch ${i}-${i+BATCH} error:`, error.message);
        } else {
            inserted += batch.length;
            process.stdout.write(`  ✅ ${inserted}/${payload.length}\r`);
        }
    }
    console.log(`\n\n🎉 Xong! Đã import ${inserted} records vào meal_headcount.`);
    console.log(`   Chu kỳ: ${period.fromDay}/${period.fromMonth}/${period.fromYear} → ${period.toDay}/${period.toMonth}/${period.toYear}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
