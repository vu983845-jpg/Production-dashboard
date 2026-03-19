const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const startFilter = "2026-03-01";
    const endFilter = "2026-03-31";

    const { data: dData } = await supabase
        .from("v_dashboard_daily")
        .select("work_date, actual_ton, plan_ton")
        .eq("dept_code", "SHELL")
        .gte("work_date", startFilter)
        .lte("work_date", endFilter)
        .order("work_date");
        
    console.log("THỐNG KÊ THÁNG 3/2026\n=====================");
    let daysElapsed = 0;
    let totalShellActual = 0;
    if (dData) {
        dData.forEach(r => {
            if (Number(r.actual_ton) > 0) daysElapsed++;
            totalShellActual += Number(r.actual_ton);
        });
    }
    console.log(`1. Số ngày xưởng Shelling hoạt động (daysElapsed): ${daysElapsed} ngày`);
    console.log(`2. Tổng Sản Lượng Xưởng (Form Tổng): ${totalShellActual.toFixed(2)} T`);

    const { data: sData } = await supabase
        .from("shelling_line_daily")
        .select("work_date, line_code, actual_ton, run_hours")
        .gte("work_date", startFilter)
        .lte("work_date", endFilter);
        
    const lineAgg = {};
    const lines = ["A", "B", "C", "D1", "D2"];
    lines.forEach(l => lineAgg[l] = { actual_ton: 0, run_hours: 0, daysWithData: new Set() });
    
    let totalLinesActual = 0;
    if (sData) {
        sData.forEach(r => {
            if (lineAgg[r.line_code]) {
                lineAgg[r.line_code].actual_ton += Number(r.actual_ton || 0);
                lineAgg[r.line_code].run_hours += Number(r.run_hours || 0);
                if (Number(r.actual_ton) > 0) {
                    lineAgg[r.line_code].daysWithData.add(r.work_date);
                }
                totalLinesActual += Number(r.actual_ton || 0);
            }
        });
    }
    
    console.log(`3. Tổng Sản Lượng Các Line (Cộng gộp Form Chi tiết): ${totalLinesActual.toFixed(2)} T`);
    
    if (Math.abs(totalShellActual - totalLinesActual) > 1) {
        console.log("   => [CẢNH BÁO] Số liệu Form Tổng và Form Chi tiết lệch nhau!");
    } else {
        console.log("   => [OK] Số liệu hai bảng khớp nhau.");
    }
    
    console.log("\n--- PHÂN TÍCH TỪNG LINE (Hiệu suất hiển thị trên Tab Công Suất) ---");
    let uiDaysElapsed = Math.max(1, daysElapsed);
    lines.forEach(l => {
        const agg = lineAgg[l];
        const uiAvgPerDay = agg.actual_ton / uiDaysElapsed;
        const daysRan = agg.daysWithData.size;
        
        console.log(`\n🔴 LINE ${l}:`);
        console.log(`   - Tổng đang có: ${agg.actual_ton.toFixed(2)} T`);
        console.log(`   - T/Ngày (Trên UI): ${uiAvgPerDay.toFixed(2)} T/ngày`);
        console.log(`   - Thử phép nhân: ${uiAvgPerDay.toFixed(2)} T x ${uiDaysElapsed} ngày = ${(uiAvgPerDay * uiDaysElapsed).toFixed(2)} T`);
        
        if (daysRan < uiDaysElapsed) {
            console.log(`   👉 LƯU Ý: Line này chỉ thực sự ghi nhận chạy ${daysRan} ngày (nghỉ ${uiDaysElapsed - daysRan} ngày so với xưởng).`);
        }
    });
}
check();
