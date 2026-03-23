const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://iekjajbmbkqrbalnjwit.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'REMOVED_SECRET_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAnomalies() {
    console.log('--- KIỂM TRA CHỈ SỐ BẤT THƯỜNG ---');
    console.log('Đang tải dữ liệu từ 2026-03-01...');
    
    // 1. Kiểm tra daily_energy
    const { data: energy } = await supabase
        .from('daily_energy')
        .select('work_date, meter_peak, meter_normal, meter_offpeak, water_meter_reading')
        .gte('work_date', '2026-03-01')
        .order('work_date', { ascending: true });
        
    console.log('\n[ĐIỆN & NƯỚC CHÍNH]');
    if (energy && energy.length > 0) {
        let prev = energy[0];
        let found = false;
        for (let i = 1; i < energy.length; i++) {
            const curr = energy[i];
            
            // Peak
            if (curr.meter_peak !== null && prev.meter_peak !== null && curr.meter_peak < prev.meter_peak) {
                console.log(`- Bất thường Peak: ${curr.work_date} (${curr.meter_peak}) thấp hơn ngày ${prev.work_date} (${prev.meter_peak})`);
                found = true;
            }
            if (curr.meter_peak !== null && prev.meter_peak !== null && curr.meter_peak - prev.meter_peak > 50000) {
                 console.log(`- Tăng đột biến Peak: ${curr.work_date} tăng ${(curr.meter_peak - prev.meter_peak).toFixed(2)} so với ngày ${prev.work_date}`);
                 found = true;
            }
            
            // Normal
            if (curr.meter_normal !== null && prev.meter_normal !== null && curr.meter_normal < prev.meter_normal) {
                console.log(`- Bất thường Normal: ${curr.work_date} (${curr.meter_normal}) thấp hơn ngày ${prev.work_date} (${prev.meter_normal})`);
                found = true;
            }
            if (curr.meter_normal !== null && prev.meter_normal !== null && curr.meter_normal - prev.meter_normal > 150000) {
                console.log(`- Tăng đột biến Normal: ${curr.work_date} tăng ${(curr.meter_normal - prev.meter_normal).toFixed(2)} so với ngày ${prev.work_date}`);
                found = true;
            }
            
            // Offpeak
            if (curr.meter_offpeak !== null && prev.meter_offpeak !== null && curr.meter_offpeak < prev.meter_offpeak) {
                console.log(`- Bất thường Offpeak: ${curr.work_date} (${curr.meter_offpeak}) thấp hơn ngày ${prev.work_date} (${prev.meter_offpeak})`);
                found = true;
            }
            if (curr.meter_offpeak !== null && prev.meter_offpeak !== null && curr.meter_offpeak - prev.meter_offpeak > 100000) {
                console.log(`- Tăng đột biến Offpeak: ${curr.work_date} tăng ${(curr.meter_offpeak - prev.meter_offpeak).toFixed(2)} so với ngày ${prev.work_date}`);
                found = true;
            }
            
            // Water
            if (curr.water_meter_reading !== null && prev.water_meter_reading !== null && curr.water_meter_reading < prev.water_meter_reading) {
                console.log(`- Bất thường Nước: ${curr.work_date} (${curr.water_meter_reading}) thấp hơn ngày ${prev.work_date} (${prev.water_meter_reading})`);
                found = true;
            }
            
            prev = curr;
        }
        if (!found) console.log('Không có bất thường (giảm số) ở đồng hồ năng lượng chính.');
    }
    
    // 2. Kiểm tra daily_compressor
    console.log('\n[MÁY NÉN KHÍ]');
    const { data: mnk } = await supabase
        .from('daily_compressor')
        .select('work_date, meter1, meter2, meter3')
        .gte('work_date', '2026-03-01')
        .order('work_date', { ascending: true });
        
    if (mnk && mnk.length > 0) {
        let prev = mnk[0];
        let found = false;
        for (let i = 1; i < mnk.length; i++) {
            const curr = mnk[i];
            
            if (curr.meter1 !== null && prev.meter1 !== null && curr.meter1 < prev.meter1) {
                console.log(`- Bất thường Meter 1: ${curr.work_date} (${curr.meter1}) < ${prev.work_date} (${prev.meter1})`);
                found = true;
            }
            if (curr.meter2 !== null && prev.meter2 !== null && curr.meter2 < prev.meter2) {
                console.log(`- Bất thường Meter 2: ${curr.work_date} (${curr.meter2}) < ${prev.work_date} (${prev.meter2})`);
                found = true;
            }
             if (curr.meter3 !== null && prev.meter3 !== null && curr.meter3 < prev.meter3) {
                console.log(`- Bất thường Meter 3: ${curr.work_date} (${curr.meter3}) < ${prev.work_date} (${prev.meter3})`);
                found = true;
            }
            prev = curr;
        }
        if (!found) console.log('Không có bất thường ở đồng hồ máy nén khí.');
    }
    
    // 3. Kiểm tra daily_electricity_others
    console.log('\n[ĐIỆN KHÁC (8 ĐỒNG HỒ PHỤ)]');
    const { data: others } = await supabase
        .from('daily_electricity_others')
        .select('*')
        .gte('work_date', '2026-03-01')
        .order('work_date', { ascending: true });
        
    if (others && others.length > 0) {
        let prev = others[0];
        let found = false;
        const keys = ['cooling_fan', 'boiler', 'office', 'db_ac_hca', 'eco2', 'canteen', 'transformer', 'maintenance'];
        for (let i = 1; i < others.length; i++) {
            const curr = others[i];
            for (const key of keys) {
                if (curr[key] !== null && prev[key] !== null && curr[key] < prev[key]) {
                    console.log(`- Bất thường ${key}: ${curr.work_date} (${curr[key]}) < ${prev.work_date} (${prev[key]})`);
                    found = true;
                }
            }
            prev = curr;
        }
        if (!found) console.log('Không có bất thường ở các đồng hồ điện phụ.');
    }
    
    // 4. Kiểm tra Shelling
    console.log('\n[SHELLING]');
    const { data: shellDept } = await supabase.from('departments').select('id').eq('code', 'SHELL').single();
    if (shellDept) {
        const { data: shellingKpi } = await supabase
            .from('daily_kpi')
            .select('work_date, electricity_meter_reading')
            .eq('department_id', shellDept.id)
            .gte('work_date', '2026-03-01')
            .order('work_date', { ascending: true });
            
        if (shellingKpi && shellingKpi.length > 0) {
            let prev = shellingKpi[0];
            let found = false;
            for (let i = 1; i < shellingKpi.length; i++) {
                const curr = shellingKpi[i];
                if (curr.electricity_meter_reading !== null && prev.electricity_meter_reading !== null && curr.electricity_meter_reading < prev.electricity_meter_reading) {
                    console.log(`- Bất thường Shelling: ${curr.work_date} (${curr.electricity_meter_reading}) < ${prev.work_date} (${prev.electricity_meter_reading})`);
                    found = true;
                }
                prev = curr;
            }
            if (!found) console.log('Không có bất thường ở đồng hồ Shelling.');
        }
    }
}

checkAnomalies().catch(console.error);
