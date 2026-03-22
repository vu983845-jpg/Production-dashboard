const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    const start = lastWeek.toISOString().split('T')[0];
    const end = today.toISOString().split('T')[0];
    
    console.log(`--- DỮ LIỆU SHELLING TỪ ${start} ĐẾN ${end} ---`);
    
    // 1. Dữ liệu tổng thể
    const { data: dept } = await supabase.from('departments').select('id').eq('code', 'SHELL').single();
    if (dept) {
        const { data: records } = await supabase.from('daily_records')
            .select('*').eq('department_id', dept.id).gte('work_date', start).lte('work_date', end);
        
        const actual = records.reduce((sum, r) => sum + Number(r.actual_ton||0), 0);
        const plan = records.reduce((sum, r) => sum + Number(r.plan_ton||0), 0);
        console.log(`\n1. TỔNG QUAN:`);
        console.log(`- Tổng sản lượng thực tế: ${actual.toFixed(2)} Tấn (Kế hoạch: ${plan.toFixed(2)} Tấn)`);
        console.log(`- Tỷ lệ đạt kế hoạch: ${plan > 0 ? (actual/plan*100).toFixed(2) : 0}%`);
        
        const validBroken = records.filter(r => r.broken_pct > 0);
        const avgBroken = validBroken.length > 0 ? validBroken.reduce((s, r) => s + Number(r.broken_pct), 0) / validBroken.length : 0;
        console.log(`- Tỷ lệ bể trung bình toàn bộ phận: ${avgBroken.toFixed(2)}%`);
    }
    
    // 2. Chi tiết theo máy
    const { data: lines } = await supabase.from('shelling_line_daily')
        .select('*').gte('work_date', start).lte('work_date', end);
        
    const lineStats = {};
    for (const r of lines) {
        if (!lineStats[r.line_code]) lineStats[r.line_code] = { ton: 0, hrs: 0, broken: 0, bCount: 0 };
        lineStats[r.line_code].ton += Number(r.actual_ton||0);
        lineStats[r.line_code].hrs += Number(r.run_hours||0);
        if (Number(r.broken_pct) > 0) {
            lineStats[r.line_code].broken += Number(r.broken_pct);
            lineStats[r.line_code].bCount++;
        }
    }
    
    console.log('\n2. HIỆU SUẤT THEO MÁY (A, B, C, D1, D2):');
    for (const line of Object.keys(lineStats).sort()) {
        const s = lineStats[line];
        const eff = s.hrs > 0 ? (s.ton / s.hrs) : 0;
        const b = s.bCount > 0 ? (s.broken / s.bCount) : 0;
        console.log(`- Máy ${line}: Năng suất ${eff.toFixed(2)} T/h | Tỷ lệ bể ${b.toFixed(2)}% | Tổng chạy ${s.hrs.toFixed(1)} giờ`);
    }
    
    // 3. Các ca bất thường (Tỷ lệ bể cao nhất)
    const badLines = lines.filter(r => Number(r.broken_pct) > 4.5).sort((a,b) => Number(b.broken_pct) - Number(a.broken_pct));
    console.log(`\n3. CẢNH BÁO BẤT THƯỜNG (Tỷ lệ bể vượt 4.5%):`);
    if (badLines.length === 0) {
        console.log('- Rất tốt! Không có ca nào vượt ngưỡng bể 4.5% trong tuần qua.');
    } else {
        for (let i=0; i<Math.min(5, badLines.length); i++) {
            console.log(`- ⚠️ Ngày ${badLines[i].work_date} | Máy ${badLines[i].line_code} | Ca ${badLines[i].shift_name} | Size: ${badLines[i].size} | Tỷ lệ bể: ${badLines[i].broken_pct}%`);
        }
    }
}

run().catch(console.error);
