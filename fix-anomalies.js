const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://iekjajbmbkqrbalnjwit.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'REMOVED_SECRET_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

const rows = [
    { date: '2026-03-03', eco2: 344142 }, // Only updating ECO2 for Mar 3 
    { date: '2026-03-04', office: 93765, canteen: 288949, eco2: 344218, maintenance: 597810 },
    { date: '2026-03-05', office: 95043, canteen: 289281, eco2: 344227, maintenance: 606820 },
    { date: '2026-03-06', office: 96165, canteen: 289618, eco2: 344231, maintenance: 615670 },
    { date: '2026-03-07', office: 97210, canteen: 290009, eco2: 344597, maintenance: 625020 },
    { date: '2026-03-08', office: 97210, canteen: 290009, eco2: 344597, maintenance: 625020 },
    { date: '2026-03-09', office: 98190, canteen: 290293, eco2: 345235, maintenance: 631700 },
    { date: '2026-03-10', office: 99151, canteen: 290578, eco2: 345386, maintenance: 641320 },
    { date: '2026-03-11', office: 100251, canteen: 290839, eco2: 345668, maintenance: 649810 },
    { date: '2026-03-12', office: 101391, canteen: 291097, eco2: 346012, maintenance: 658720 },
    { date: '2026-03-13', office: 102441, canteen: 291404, eco2: 346332, maintenance: 667450 },
    { date: '2026-03-14', office: 103471, canteen: 291706, eco2: 346513, maintenance: 676650 },
    { date: '2026-03-15', office: 103471, canteen: 291706, eco2: 346513, maintenance: 676650 },
    { date: '2026-03-16', office: 104441, canteen: 292033, eco2: 346853, maintenance: 684720 },
    { date: '2026-03-17', office: 105641, canteen: 292313, eco2: 347211, maintenance: 692690 },
    { date: '2026-03-18', office: 106701, canteen: 292608, eco2: 347409, maintenance: 700850 },
    { date: '2026-03-19', office: 107761, canteen: 292898, eco2: 347477 },
    { date: '2026-03-20', office: 108691, canteen: 293224, eco2: 347551 },
    { date: '2026-03-21', office: 109711, canteen: 293539, eco2: 347646 }
];

async function updateDB() {
    console.log('Bắt đầu cập nhật...');
    for (const r of rows) {
        let updateData = {};
        if (r.office !== undefined) updateData.office = r.office;
        if (r.canteen !== undefined) updateData.canteen = r.canteen;
        if (r.eco2 !== undefined) updateData.eco2 = r.eco2;
        if (r.maintenance !== undefined) updateData.maintenance = r.maintenance;
        
        console.log(`Đang lưu ngày ${r.date}...`);
        const { error } = await supabase
            .from('daily_electricity_others')
            .update(updateData)
            .eq('work_date', r.date);
            
        if (error) {
            console.error(`Lỗi ngày ${r.date}:`, error.message);
        }
    }
    console.log('Hoàn tất ghi đè thành công!');
}

updateDB();
