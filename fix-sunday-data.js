/**
 * fix-sunday-data.js
 * Phát hiện tất cả ngày Chủ nhật có data trong các file CSV báo cơm
 * rồi dời toàn bộ records đó sang Thứ 2 liền kề trong DB.
 *
 * Usage: node fix-sunday-data.js [--dry-run]
 *   --dry-run: chỉ in ra danh sách, không thay đổi DB
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ───────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');

const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8')
      .split('\n')
      .filter(l => l.includes('='))
      .map(l => { const [k,...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CSV_FILES = [
    'meal-12-2025.csv',
    'meal-01-2026.csv',
    'meal-02-2026.csv',
    'meal-03-2026.csv',
    'meal-04-2026.csv',
];

// ─── Helpers ──────────────────────────────────────────────────────────────
function parsePeriod(csvText) {
    const m = csvText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return {
        fromDay: parseInt(m[1]), fromMonth: parseInt(m[2]), fromYear: parseInt(m[3]),
        toDay:   parseInt(m[4]), toMonth:   parseInt(m[5]), toYear:   parseInt(m[6]),
    };
}

function colToDate(colDay, period) {
    // ≥26 → tháng fromMonth, <26 → tháng toMonth
    if (colDay >= 26) {
        return `${period.fromYear}-${String(period.fromMonth).padStart(2,'0')}-${String(colDay).padStart(2,'0')}`;
    } else {
        return `${period.toYear}-${String(period.toMonth).padStart(2,'0')}-${String(colDay).padStart(2,'0')}`;
    }
}

// dayOfWeek replaced by dayOfWeekLocal below (timezone-aware)

function addOneDay(dateStr) {
    // Parse parts explicitly to avoid UTC vs local timezone ambiguity
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 1); // local time
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function dayOfWeekLocal(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getDay(); // 0=Sun, local time
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ─── Step 1: Phân tích CSV tìm ngày CN có data ────────────────────────────
function analyseCsv(file) {
    const csvText = fs.readFileSync(file, 'utf8');
    const lines   = csvText.replace(/\r/g, '').split('\n');
    const period  = parsePeriod(csvText);
    if (!period) return [];

    let hdrIdx = -1;
    let hdrCols = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('Section,')) {
            hdrIdx  = i;
            hdrCols = lines[i].split(',');
            break;
        }
    }
    if (hdrIdx < 0) return [];

    const colDays   = hdrCols.slice(1).map(d => parseInt(d.trim())).filter(d => !isNaN(d));
    const dataLines = lines.slice(hdrIdx + 1);
    const results   = [];

    for (const colDay of colDays) {
        const dateStr = colToDate(colDay, period);
        if (dayOfWeekLocal(dateStr) !== 0) continue; // bỏ qua không phải CN

        const colIdx    = hdrCols.indexOf(String(colDay));
        let   dataCount = 0;
        let   total     = 0;

        for (const line of dataLines) {
            if (!line.trim() || line.startsWith('Total')) break;
            const parts = line.split(',');
            const val   = parseInt((parts[colIdx] || '').trim());
            if (!isNaN(val) && val > 0) { dataCount++; total += val; }
        }

        if (dataCount > 0) {
            results.push({ date: dateStr, monDate: addOneDay(dateStr), sections: dataCount, total });
        }
    }
    return results;
}

// ─── Step 2: Fix DB ────────────────────────────────────────────────────────
async function fixSunday(sunDate, monDate) {
    // Fetch all Sunday records
    const { data: sunRows, error: e1 } = await sb
        .from('meal_headcount')
        .select('*')
        .eq('work_date', sunDate);
    if (e1) throw new Error(`Fetch ${sunDate}: ${e1.message}`);

    const dbCount = sunRows?.length ?? 0;
    if (dbCount === 0) {
        console.log(`  ℹ️  ${sunDate}: không có records trong DB`);
        return { sun: 0, mon: 0 };
    }

    // Count existing Monday records (for reporting)
    const { count: monCount } = await sb
        .from('meal_headcount')
        .select('*', { count: 'exact', head: true })
        .eq('work_date', monDate);

    console.log(`  📊 ${sunDate} → DB: ${dbCount} rows | Monday ${monDate} hiện có: ${monCount ?? 0} rows`);

    // ── Smart merge strategy ─────────────────────────────────────────────
    // Chỉ xoá các Monday records conflict với Sunday (cùng department_name + shift)
    // KHÔNG xoá toàn bộ Monday để tránh mất data quan trọng
    const conflictKeys = sunRows.map(r => `${r.department_name}|||${r.shift}`);
    console.log(`  🔍 ${dbCount} Sunday rows → cần xóa các Monday rows cùng (dept+shift)`);

    if (DRY_RUN) {
        console.log(`  🔵 [DRY RUN] Sẽ xoá tối đa ${dbCount} rows conflict ngày Thứ 2, chèn ${dbCount} rows mới từ CN`);
        return { sun: dbCount, mon: monCount ?? 0 };
    }

    // 1. Xoá các Monday records conflict (cùng dept_name + shift) từng cái
    let delCount = 0;
    for (const r of sunRows) {
        const { error: delErr } = await sb
            .from('meal_headcount')
            .delete()
            .eq('work_date',        monDate)
            .eq('department_name',  r.department_name)
            .eq('shift',            r.shift);
        if (delErr) throw new Error(`Delete conflict Monday ${monDate}: ${delErr.message}`);
        delCount++;
    }
    if (delCount > 0) console.log(`  🗑️  Đã xoá ${delCount} conflict rows ngày ${monDate}`);

    // 2. Insert Sunday records với work_date = Monday
    const newRows = sunRows.map(({ id, created_at, updated_at, ...rest }) => ({
        ...rest,
        work_date: monDate,
    }));

    const BATCH = 50;
    for (let i = 0; i < newRows.length; i += BATCH) {
        const { error: insErr } = await sb.from('meal_headcount').insert(newRows.slice(i, i + BATCH));
        if (insErr) throw new Error(`Insert Monday ${monDate} batch ${i}: ${insErr.message}`);
    }

    // 3. Delete original Sunday records
    const { error: delSun } = await sb.from('meal_headcount').delete().eq('work_date', sunDate);
    if (delSun) throw new Error(`Delete Sunday ${sunDate}: ${delSun.message}`);

    console.log(`  ✅ Đã dời ${dbCount} records: ${sunDate} (CN) → ${monDate} (Thứ 2)`);
    return { sun: dbCount, mon: monCount ?? 0 };
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${'═'.repeat(62)}`);
    console.log(DRY_RUN ? '🔵 DRY RUN MODE — chỉ phân tích, không sửa DB' : '🔧 FIX MODE — sẽ dời Sunday records → Monday trong DB');
    console.log(`${'═'.repeat(62)}\n`);

    // ── Phân tích tất cả CSV ─────────────────────────────────────────
    const allFixes = []; // [ { sunDate, monDate, csvSections, csvTotal, file } ]

    for (const file of CSV_FILES) {
        if (!fs.existsSync(file)) {
            console.log(`⚠️  ${file} không tồn tại, bỏ qua\n`);
            continue;
        }
        const findings = analyseCsv(file);
        console.log(`📁 ${file}:`);
        if (findings.length === 0) {
            console.log(`   ✅ Không có ngày CN nào có data trong CSV`);
        } else {
            findings.forEach(({ date, monDate, sections, total }) => {
                const dow = DAY_NAMES[dayOfWeekLocal(date)];
                console.log(`   ⚠️  ${date} (${dow}) → ${sections} sections, tổng ${total} người → cần dời sang ${monDate}`);
                // Deduplicate: một ngày CN chỉ fix 1 lần dù xuất hiện ở nhiều file
                if (!allFixes.find(f => f.sunDate === date)) {
                    allFixes.push({ sunDate: date, monDate, file, csvSections: sections });
                }
            });
        }
        console.log();
    }

    if (allFixes.length === 0) {
        console.log('🎉 Không tìm thấy ngày CN nào cần fix!\n');
        return;
    }

    console.log(`\n${'─'.repeat(62)}`);
    console.log(`🔎 Tổng cộng ${allFixes.length} ngày CN cần fix:\n`);
    allFixes.sort((a,b) => a.sunDate.localeCompare(b.sunDate)).forEach(f =>
        console.log(`   ${f.sunDate} → ${f.monDate}`)
    );
    console.log();

    // ── Fix trong DB ─────────────────────────────────────────────────
    let totalMoved = 0;
    for (const { sunDate, monDate } of allFixes) {
        console.log(`\n🔄 Xử lý ${sunDate} → ${monDate}:`);
        try {
            const { sun } = await fixSunday(sunDate, monDate);
            totalMoved += sun;
        } catch (err) {
            console.error(`  ❌ Lỗi: ${err.message}`);
        }
    }

    console.log(`\n${'═'.repeat(62)}`);
    if (DRY_RUN) {
        console.log(`🔵 DRY RUN xong. Chạy lại không có --dry-run để thực sự fix.`);
    } else {
        console.log(`🎉 Hoàn tất! Đã dời tổng ${totalMoved} DB records từ CN → Thứ 2.`);
    }
    console.log(`${'═'.repeat(62)}\n`);
}

main().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });
