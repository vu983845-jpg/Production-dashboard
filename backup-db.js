const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iekjajbmbkqrbalnjwit.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Bảng cần backup và giới hạn rows (null = lấy hết)
const TABLES = [
    { name: 'departments',              limit: null },
    { name: 'daily_plan',               limit: null },
    { name: 'daily_actual',             limit: null },
    { name: 'daily_kpi',                limit: null },
    { name: 'daily_fgwh',               limit: null },
    { name: 'daily_energy',             limit: null },
    { name: 'daily_compressor',         limit: null },
    { name: 'daily_electricity_others', limit: null },
    { name: 'peeling_line_daily',       limit: null },
    { name: 'shelling_line_daily',      limit: null },
    { name: 'downtime_events',          limit: null },
    { name: 'cs_shift_daily',           limit: null },
];

async function fetchAll(tableName) {
    const PAGE = 1000;
    let rows = [];
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(from, from + PAGE - 1);

        if (error) {
            // Bảng không tồn tại hoặc không có quyền — bỏ qua
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                console.warn(`  ⚠ Bỏ qua ${tableName}: bảng không tồn tại`);
                return null;
            }
            throw new Error(`${tableName}: ${error.message}`);
        }

        rows = rows.concat(data || []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
    }

    return rows;
}

async function run() {
    const today = new Date().toISOString().slice(0, 10);
    const outDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

    const outFile = path.join(outDir, `backup-${today}.json`);
    const backup = { created_at: new Date().toISOString(), tables: {} };

    console.log(`\nBắt đầu backup → ${outFile}\n`);

    for (const { name } of TABLES) {
        process.stdout.write(`  Đang lấy ${name}...`);
        const rows = await fetchAll(name);
        if (rows === null) continue;
        backup.tables[name] = rows;
        console.log(` ${rows.length} rows`);
    }

    fs.writeFileSync(outFile, JSON.stringify(backup, null, 2), 'utf8');

    const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
    console.log(`\nHoàn tất! File: ${outFile} (${sizeKb} KB)`);

    // Giữ lại tối đa 10 file backup gần nhất, xóa cũ hơn
    const files = fs.readdirSync(outDir)
        .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
        .sort();
    if (files.length > 10) {
        const toDelete = files.slice(0, files.length - 10);
        toDelete.forEach(f => {
            fs.unlinkSync(path.join(outDir, f));
            console.log(`  Đã xóa backup cũ: ${f}`);
        });
    }
}

run().catch(err => {
    console.error('\nLỗi backup:', err.message);
    process.exit(1);
});
