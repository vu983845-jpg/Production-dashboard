const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ddsClient = createClient('https://qktvbvyznxpugsxoxarx.supabase.co', 'sb_publishable_agrIIWuEfWaheajFAK2cKQ_NQgIiZsC');

const csvData = `Date,Shift,Leader,Line,Actual Output (Kg),% Broken,Headcount
3/2/2026,1,Ms.Linh,A,3597,3.1,2
3/2/2026,1,Ms.Linh,B,7986,5.1,2
3/2/2026,1,Ms.Linh,C,7953,9.25,2
3/2/2026,1,Ms.Linh,D1,4290,9.2,2
3/2/2026,1,Ms.Linh,D2,2046,10.1,3
3/2/2026,2,Mrs.Tâm,A,5940,3.75,2
3/2/2026,2,Mrs.Tâm,B,8679,3.6,2
3/2/2026,2,Mrs.Tâm,C,6501,7.1,2
3/2/2026,2,Mrs.Tâm,D1,4554,8.75,2
3/2/2026,2,Mrs.Tâm,D2,3465,9,3
3/2/2026,3,Mr.Trí,A,-,,2
3/2/2026,3,Mr.Trí,B,8745,4.5,2
3/2/2026,3,Mr.Trí,C,7623,7.2,2
3/2/2026,3,Mr.Trí,D1,4158,8.2,2
3/2/2026,3,Mr.Trí,D2,3300,9.55,3
3/3/2026,1,Ms.Linh,A,7491,1.95,2
3/3/2026,1,Ms.Linh,B,7854,4.5,2
3/3/2026,1,Ms.Linh,C,7392,7.1,2
3/3/2026,1,Ms.Linh,D1,4950,10.85,2
3/3/2026,1,Ms.Linh,D2,-,,3
3/3/2026,2,Mrs.Tâm,A,8415,2.5,2
3/3/2026,2,Mrs.Tâm,B,8250,4,2
3/3/2026,2,Mrs.Tâm,C,7590,7.3,2
3/3/2026,2,Mrs.Tâm,D1,5445,8.5,2
3/3/2026,2,Mrs.Tâm,D2,3320,11.15,3
3/3/2026,3,Mr.Trí,A,-,,2
3/3/2026,3,Mr.Trí,B,-,,2
3/3/2026,3,Mr.Trí,C,7920,8.3,2
3/3/2026,3,Mr.Trí,D1,4950,9.25,2
3/3/2026,3,Mr.Trí,D2,2805,11.45,3
3/4/2026,1,Ms.Linh,A,7458,1.85,2
3/4/2026,1,Ms.Linh,B,7755,4.55,2
3/4/2026,1,Ms.Linh,C,7359,14.6,2
3/4/2026,1,Ms.Linh,D1,4719,14.3,2
3/4/2026,1,Ms.Linh,D2,2508,10.4,3
3/4/2026,2,Mrs.Tâm,A,8283,1.7,2
3/4/2026,2,Mrs.Tâm,B,8679,3.55,2
3/4/2026,2,Mrs.Tâm,C,9042,9.55,2
3/4/2026,2,Mrs.Tâm,D1,6534,10.8,2
3/4/2026,2,Mrs.Tâm,D2,5181,9.75,3
3/4/2026,3,Mr.Trí,A,-,,2
3/4/2026,3,Mr.Trí,B,8910,2.7,2
3/4/2026,3,Mr.Trí,C,7359,7.5,2
3/4/2026,3,Mr.Trí,D1,5247,9.95,2
3/4/2026,3,Mr.Trí,D2,-,,3
3/5/2026,1,Ms.Linh,A,8910,2.35,2
3/5/2026,1,Ms.Linh,B,9240,3.35,2
3/5/2026,1,Ms.Linh,C,-,,2
3/5/2026,1,Ms.Linh,D1,4686,11.2,2
3/5/2026,1,Ms.Linh,D2,-,,3
3/5/2026,2,Mrs.Tâm,A,9372,3.05,2
3/5/2026,2,Mrs.Tâm,B,9801,3.95,2
3/5/2026,2,Mrs.Tâm,C,8217,10.5,2
3/5/2026,2,Mrs.Tâm,D1,6468,9.1,2
3/5/2026,2,Mrs.Tâm,D2,-,,3
3/5/2026,3,Mr.Trí,A,8052,2.55,2
3/5/2026,3,Mr.Trí,B,8877,4,2
3/5/2026,3,Mr.Trí,C,7359,10.2,2
3/5/2026,3,Mr.Trí,D1,5280,12.9,2
3/5/2026,3,Mr.Trí,D2,-,,3
3/6/2026,1,Ms.Linh,A,10329,2.3,2
3/6/2026,1,Ms.Linh,B,10659,4.1,2
3/6/2026,1,Ms.Linh,C,8250,10.65,2
3/6/2026,1,Ms.Linh,D1,6879,11,2
3/6/2026,1,Ms.Linh,D2,5280,10,3
3/6/2026,2,Mrs.Tâm,A,9372,2.6,2
3/6/2026,2,Mrs.Tâm,B,9768,4.9,2
3/6/2026,2,Mrs.Tâm,C,7722,11.9,2
3/6/2026,2,Mrs.Tâm,D1,1947,14.9,2
3/6/2026,2,Mrs.Tâm,D2,3234,16.05,3
3/6/2026,3,Mr.Trí,A,8712,2.25,2
3/6/2026,3,Mr.Trí,B,8976,3.8,2
3/6/2026,3,Mr.Trí,C,6930,11.05,2
3/6/2026,3,Mr.Trí,D1,4653,11.65,2
3/6/2026,3,Mr.Trí,D2,-,,3
3/7/2026,1,Ms.Linh,A,2706,2.2,2
3/7/2026,1,Ms.Linh,B,3366,5.2,2
3/7/2026,1,Ms.Linh,C,2310,11.2,2
3/7/2026,1,Ms.Linh,D1,1650,11.5,2
3/7/2026,1,Ms.Linh,D2,2178,16.8,3
3/7/2026,2,Mrs.Tâm,A,9834,2.4,2
3/7/2026,2,Mrs.Tâm,B,10263,4.9,2
3/7/2026,2,Mrs.Tâm,C,4059,10.1,2
3/7/2026,2,Mrs.Tâm,D1,-,,2
3/7/2026,2,Mrs.Tâm,D2,-,,3
3/7/2026,3,Mr.Trí,A,-,,2
3/7/2026,3,Mr.Trí,B,3366,4.1,2
3/7/2026,3,Mr.Trí,C,2706,9.3,2
3/7/2026,3,Mr.Trí,D1,1320,11.4,2
3/7/2026,3,Mr.Trí,D2,-,,3
3/9/2026,1,Mrs.Tâm,A,3828,1.9,2
3/9/2026,1,Mrs.Tâm,B,10032,4.65,2
3/9/2026,1,Mrs.Tâm,C,6864,6.9,2
3/9/2026,1,Mrs.Tâm,D1,6171,10.75,2
3/9/2026,1,Mrs.Tâm,D2,5412,13.15,3
3/9/2026,2,Mr.Trí,A,10230,2.75,2
3/9/2026,2,Mr.Trí,B,7755,4.19,2
3/9/2026,2,Mr.Trí,C,8019,6.55,2
3/9/2026,2,Mr.Trí,D1,5643,6.6,2
3/9/2026,2,Mr.Trí,D2,5511,14.05,3
3/9/2026,3,Ms.Linh,A,7392,2.55,2
3/9/2026,3,Ms.Linh,B,6435,3.9,2
3/9/2026,3,Ms.Linh,C,6930,6.8,2
3/9/2026,3,Ms.Linh,D1,5445,9.9,2
3/9/2026,3,Ms.Linh,D2,-,,3
3/10/2026,1,Mrs.Tâm,A,7128,2.25,2
3/10/2026,1,Mrs.Tâm,B,-,,2
3/10/2026,1,Mrs.Tâm,C,9636,8.8,2
3/10/2026,1,Mrs.Tâm,D1,3267,10.5,2
3/10/2026,1,Mrs.Tâm,D2,5577,11.95,3
3/10/2026,2,Mr.Trí,A,-,,2
3/10/2026,2,Mr.Trí,B,7722,7,2
3/10/2026,2,Mr.Trí,C,8415,7.85,2
3/10/2026,2,Mr.Trí,D1,-,,2
3/10/2026,2,Mr.Trí,D2,4620,10.5,3
3/10/2026,3,Ms.Linh,A,8349,2.6,2
3/10/2026,3,Ms.Linh,B,6633,10.6,2
3/10/2026,3,Ms.Linh,C,8679,6.75,2
3/10/2026,3,Ms.Linh,D1,-,,2
3/10/2026,3,Ms.Linh,D2,5412,9,3
3/11/2026,1,Mrs.Tâm,A,10923,1.95,2
3/11/2026,1,Mrs.Tâm,B,8415,10.55,2
3/11/2026,1,Mrs.Tâm,C,9075,6.5,2
3/11/2026,1,Mrs.Tâm,D1,-,,2
3/11/2026,1,Mrs.Tâm,D2,7260,11.35,3
3/11/2026,2,Mr.Trí,A,2112,2.3,2
3/11/2026,2,Mr.Trí,B,8283,11.6,2
3/11/2026,2,Mr.Trí,C,7968,6.35,2
3/11/2026,2,Mr.Trí,D1,4785,9.2,2
3/11/2026,2,Mr.Trí,D2,2409,10,3
3/11/2026,3,Ms.Linh,A,6237,2.1,2
3/11/2026,3,Ms.Linh,B,8151,8.7,2
3/11/2026,3,Ms.Linh,C,8943,6.3,2
3/11/2026,3,Ms.Linh,D1,5016,6.9,2
3/11/2026,3,Ms.Linh,D2,-,,3
3/12/2026,1,Mrs.Tâm,A,6105,1.5,2
3/12/2026,1,Mrs.Tâm,B,7161,9.65,2
3/12/2026,1,Mrs.Tâm,C,8481,7.25,2
3/12/2026,1,Mrs.Tâm,D1,5874,7.7,2
3/12/2026,1,Mrs.Tâm,D2,-,,3
3/12/2026,2,Mr.Trí,A,7425,1.5,2
3/12/2026,2,Mr.Trí,B,8877,10.75,2
3/12/2026,2,Mr.Trí,C,8283,7.3,2
3/12/2026,2,Mr.Trí,D1,2871,7.3,2
3/12/2026,2,Mr.Trí,D2,-,,3
3/12/2026,3,Ms.Linh,A,6699,1.9,2
3/12/2026,3,Ms.Linh,B,6501,9.6,2
3/12/2026,3,Ms.Linh,C,9372,6.1,2
3/12/2026,3,Ms.Linh,D1,-,,2
3/12/2026,3,Ms.Linh,D2,-,,3
3/13/2026,1,Mrs.Tâm,A,6879,1.5,2
3/13/2026,1,Mrs.Tâm,B,7920,10.6,2
3/13/2026,1,Mrs.Tâm,C,9141,6.35,2
3/13/2026,1,Mrs.Tâm,D1,7953,6.9,2
3/13/2026,1,Mrs.Tâm,D2,-,,3
3/13/2026,2,Mr.Trí,A,10131,1.9,2
3/13/2026,2,Mr.Trí,B,9405,9.75,2
3/13/2026,2,Mr.Trí,C,9669,7.7,2
3/13/2026,2,Mr.Trí,D1,6699,7.25,2
3/13/2026,2,Mr.Trí,D2,-,,3
3/13/2026,3,Ms.Linh,A,9702,1.25,2
3/13/2026,3,Ms.Linh,B,7326,9.6,2
3/13/2026,3,Ms.Linh,C,7326,7.15,2
3/13/2026,3,Ms.Linh,D1,-,,2
3/13/2026,3,Ms.Linh,D2,5800,7.3,3
3/14/2026,1,Mrs.Tâm,A,6468,1.7,2
3/14/2026,1,Mrs.Tâm,B,3795,10.1,2
3/14/2026,1,Mrs.Tâm,C,4917,5.9,2
3/14/2026,1,Mrs.Tâm,D1,3729,6.8,2
3/14/2026,1,Mrs.Tâm,D2,-,,3
3/14/2026,2,Mr.Trí,A,3630,1.9,2
3/14/2026,2,Mr.Trí,B,3003,6.3,2
3/14/2026,2,Mr.Trí,C,3036,6.5,2
3/14/2026,2,Mr.Trí,D1,1419,8.8,2
3/14/2026,2,Mr.Trí,D2,-,,3
3/14/2026,3,Ms.Linh,A,6765,1.6,2
3/14/2026,3,Ms.Linh,B,3960,6,2
3/14/2026,3,Ms.Linh,C,4950,6.9,2
3/14/2026,3,Ms.Linh,D1,4917,7.3,2
3/14/2026,3,Ms.Linh,D2,-,,3
3/16/2026,1,Mr.Trí,A,6897,2.45,2
3/16/2026,1,Mr.Trí,B,2640,5.7,2
3/16/2026,1,Mr.Trí,C,8250,7.6,2
3/16/2026,1,Mr.Trí,D1,5115,8.75,2
3/16/2026,1,Mr.Trí,D2,-,,3
3/16/2026,2,Ms.Linh,A,9009,1.65,2
3/16/2026,2,Ms.Linh,B,8745,5.3,2
3/16/2026,2,Ms.Linh,C,9075,5.95,2
3/16/2026,2,Ms.Linh,D1,6336,5.95,2
3/16/2026,2,Ms.Linh,D2,-,,3
3/16/2026,3,Mrs.Tâm,A,8448,2,2
3/16/2026,3,Mrs.Tâm,B,2739,4.6,2
3/16/2026,3,Mrs.Tâm,C,8613,7.4,2
3/16/2026,3,Mrs.Tâm,D1,6897,7.95,2
3/16/2026,3,Mrs.Tâm,D2,-,,3
3/17/2026,1,Mr.Trí,A,-,,2
3/17/2026,1,Mr.Trí,B,8415,4.75,2
3/17/2026,1,Mr.Trí,C,8085,7.25,2
3/17/2026,1,Mr.Trí,D1,-,,2
3/17/2026,1,Mr.Trí,D2,-,,3
3/17/2026,2,Ms.Linh,A,10098,2.95,2
3/17/2026,2,Ms.Linh,B,11154,4.1,2
3/17/2026,2,Ms.Linh,C,9900,9.55,2
3/17/2026,2,Ms.Linh,D1,6105,8.6,2
3/17/2026,2,Ms.Linh,D2,-,,3
3/17/2026,3,Mrs.Tâm,A,6996,2.5,2
3/17/2026,3,Mrs.Tâm,B,5577,5.1,2
3/17/2026,3,Mrs.Tâm,C,7854,10.15,2
3/17/2026,3,Mrs.Tâm,D1,7656,10.4,2
3/17/2026,3,Mrs.Tâm,D2,891,13.4,3
3/18/2026,1,Mr.Trí,A,7920,2.3,2
3/18/2026,1,Mr.Trí,B,7524,5.9,2
3/18/2026,1,Mr.Trí,C,6567,7.15,2
3/18/2026,1,Mr.Trí,D1,-,,2
3/18/2026,1,Mr.Trí,D2,5445,11.5,3
3/18/2026,2,Ms.Linh,A,10032,2.3,2
3/18/2026,2,Ms.Linh,B,10593,3.8,2
3/18/2026,2,Ms.Linh,C,7095,9.8,2
3/18/2026,2,Ms.Linh,D1,-,,2
3/18/2026,2,Ms.Linh,D2,2904,10.8,3
3/18/2026,3,Mrs.Tâm,A,-,,2
3/18/2026,3,Mrs.Tâm,B,8580,4,2
3/18/2026,3,Mrs.Tâm,C,6400,11.6,2
3/18/2026,3,Mrs.Tâm,D1,-,,2
3/18/2026,3,Mrs.Tâm,D2,6831,9.9,3`;

async function run() {
    const lines = csvData.trim().split('\n');
    lines.shift(); // remove header
    
    // Group records by work_date
    const payloadMap = {};
    const processedDates = new Set();
    
    for (const r of lines) {
        let [dateStr, shiftNum, leader, line, output, broken, headcount] = r.split(',');
        const [m, d, y] = dateStr.split('/');
        const workDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        
        const shiftMap = { '1': 'Ca 1', '2': 'Ca 2', '3': 'Ca 3' };
        const shiftName = shiftMap[shiftNum];
        
        let actualTon = 0;
        if (output && output !== '-') {
            actualTon = Number(output) / 1000;
        }
        
        let brokenPct = 0;
        if (broken && broken !== '-') {
            brokenPct = Number(broken);
        }
        
        let manpower = 0;
        if (headcount && headcount !== '-') {
            manpower = Number(headcount);
        }
        
        if (!payloadMap[workDate]) {
            payloadMap[workDate] = [];
            processedDates.add(workDate);
        }
        
        payloadMap[workDate].push({
            work_date: workDate,
            line_code: line,
            shift_name: shiftName,
            shift_leader: leader,
            actual_ton: actualTon,
            manpower: manpower,
            broken_pct: brokenPct,
            run_hours: 0,
            downtime_min: 0,
            note: null,
            updated_at: new Date().toISOString()
        });
    }

    // Now for each workDate, fetch DDS issues and compute downtime
    const datesArr = Array.from(processedDates).sort();
    
    for (const workDate of datesArr) {
        console.log(`Fetching issues for ${workDate}...`);
        const prevDay = new Date(new Date(workDate).getTime() - 24*60*60*1000).toISOString().split('T')[0];
        const nextDay = new Date(new Date(workDate).getTime() + 24*60*60*1000).toISOString().split('T')[0];
        
        const { data: ddsIssues } = await ddsClient
            .from('issues')
            .select('department, duration_mins, start_time, machine_area')
            .eq('is_downtime', true)
            .eq('status', 'Closed')
            .eq('department', 'Shelling')
            .gte('start_time', `${prevDay}T00:00:00Z`)
            .lte('start_time', `${nextDay}T23:59:59Z`);
            
        const ddsDownMap = {
            A: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
            B: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
            C: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
            D1: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
            D2: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
        };
        
        if (ddsIssues) {
            ddsIssues.forEach(iss => {
                const area = (iss.machine_area || "").toUpperCase();
                let targetLine = null;
                if (area.includes('D2')) targetLine = 'D2';
                else if (area.includes('D1')) targetLine = 'D1';
                else if (area.includes('A')) targetLine = 'A';
                else if (area.includes('B')) targetLine = 'B';
                else if (area.includes('C')) targetLine = 'C';
                
                if (targetLine) {
                    const st = new Date(iss.start_time);
                    const vnHour = (st.getUTCHours() + 7) % 24;
                    const vnDate = new Date(st.getTime() + 7 * 60 * 60 * 1000);
                    const vnDateStr = vnDate.toISOString().split('T')[0];
                    
                    let issueWorkDate = vnDateStr;
                    if (vnHour >= 0 && vnHour < 6) {
                        const prev = new Date(vnDate.getTime() - 24 * 60 * 60 * 1000);
                        issueWorkDate = prev.toISOString().split('T')[0];
                    }
                    
                    if (issueWorkDate === workDate) {
                        let shift = 'Ca 1';
                        if (vnHour >= 6 && vnHour < 14) shift = 'Ca 1';
                        else if (vnHour >= 14 && vnHour < 22) shift = 'Ca 2';
                        else shift = 'Ca 3';
                        ddsDownMap[targetLine][shift] += Number(iss.duration_mins || 0);
                    }
                }
            });
        }
        
        // Enrich the payload items
        for (const item of payloadMap[workDate]) {
            const dMin = ddsDownMap[item.line_code] ? ddsDownMap[item.line_code][item.shift_name] : 0;
            item.downtime_min = dMin;
            // Tính run_hours: luôn tính dựa trên downtime nếu có, bất kể sản lượng
            // Nếu có downtime (dMin > 0), run_hours = 7 - dMin/60
            // Nếu không có downtime và có sản lượng, run_hours = 7
            // Nếu không có cả hai, run_hours = 0
            const hasDowntime = dMin > 0;
            item.run_hours = hasDowntime ? Math.max(0, 7 - (dMin / 60)) : (item.actual_ton > 0 ? 7 : 0);
        }

        console.log(`Upserting ${payloadMap[workDate].length} records for ${workDate}...`);
        const { error } = await supabase.from('shelling_line_daily').upsert(payloadMap[workDate], { onConflict: 'work_date,line_code,shift_name' });
        if (error) {
            console.error('Error upserting for', workDate, error);
        }
    }
    
    console.log('Import Finished.');
}

run();
