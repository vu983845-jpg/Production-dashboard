// Import Compressor Meter Readings - March 2026
// Source: SEU - Daily raw data sheet (Google Sheets)
// meter1 = AC 1 (Máy nén khí 1)
// meter2 = AC 2,4 (Máy nén khí 2,4)
// meter3 = AC 3,5,6 (Máy nén khí 3,5,6)
// Unit: MWh (tích lũy)

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Data extracted from Google Sheets "SEU - Daily raw data"
// Column U = AC 1, Column V = AC 2,4, Column W = AC 3,5,6
const compressorData = [
    { work_date: '2026-03-01', meter1: 483.18, meter2: 346.11, meter3: 1371.5  }, // CN
    { work_date: '2026-03-02', meter1: 484.25, meter2: 346.86, meter3: 1375.9  },
    { work_date: '2026-03-03', meter1: 485.14, meter2: 347.51, meter3: 1379.6  },
    { work_date: '2026-03-04', meter1: 486.53, meter2: 347.98, meter3: 1384.6  },
    { work_date: '2026-03-05', meter1: 487.88, meter2: 348.42, meter3: 1389.2  },
    { work_date: '2026-03-06', meter1: 489.19, meter2: 348.71, meter3: 1394.0  },
    { work_date: '2026-03-07', meter1: 490.73, meter2: 349.49, meter3: 1398.9  },
    { work_date: '2026-03-08', meter1: 490.73, meter2: 349.49, meter3: 1398.9  }, // CN - giữ nguyên
    { work_date: '2026-03-09', meter1: 491.72, meter2: 349.68, meter3: 1402.5  },
    { work_date: '2026-03-10', meter1: 493.04, meter2: 349.78, meter3: 1407.0  },
    { work_date: '2026-03-11', meter1: 494.76, meter2: 349.89, meter3: 1412.5  },
    { work_date: '2026-03-12', meter1: 496.10, meter2: 350.28, meter3: 1417.2  },
    { work_date: '2026-03-13', meter1: 497.40, meter2: 350.71, meter3: 1421.8  },
    { work_date: '2026-03-14', meter1: 498.85, meter2: 351.11, meter3: 1426.8  },
    { work_date: '2026-03-15', meter1: 498.85, meter2: 351.11, meter3: 1426.8  }, // CN - giữ nguyên
    { work_date: '2026-03-16', meter1: 500.12, meter2: 351.47, meter3: 1431.4  },
    { work_date: '2026-03-17', meter1: 501.14, meter2: 351.81, meter3: 1435.5  },
    { work_date: '2026-03-18', meter1: 502.31, meter2: 351.96, meter3: 1439.8  },
    { work_date: '2026-03-19', meter1: 503.64, meter2: 352.82, meter3: 1443.1  },
    { work_date: '2026-03-20', meter1: 505.26, meter2: 353.51, meter3: 1447.2  },
    { work_date: '2026-03-21', meter1: 506.58, meter2: 354.11, meter3: 1450.6  },
    { work_date: '2026-03-22', meter1: 506.58, meter2: 354.11, meter3: 1450.6  }, // CN - giữ nguyên
]

async function importData() {
    console.log(`\n🔄 Bắt đầu import ${compressorData.length} ngày vào daily_compressor...`)
    console.log('   meter1 = AC 1, meter2 = AC 2,4, meter3 = AC 3,5,6\n')

    // Check existing data first
    const { data: existing, error: fetchErr } = await supabase
        .from('daily_compressor')
        .select('work_date, meter1, meter2, meter3')
        .gte('work_date', '2026-03-01')
        .lte('work_date', '2026-03-22')
        .order('work_date')

    if (fetchErr) {
        console.error('❌ Lỗi đọc dữ liệu cũ:', fetchErr.message)
        return
    }

    console.log(`📋 Hiện tại có ${existing?.length || 0} bản ghi trong DB cho tháng 3/2026`)
    if (existing?.length > 0) {
        console.log('   Các ngày đã có:')
        existing.forEach(r => {
            console.log(`   ${r.work_date}: m1=${r.meter1} | m2=${r.meter2} | m3=${r.meter3}`)
        })
        console.log()
    }

    // Upsert all records
    const payload = compressorData.map(r => ({
        ...r,
        updated_at: new Date().toISOString()
    }))

    const { error } = await supabase
        .from('daily_compressor')
        .upsert(payload, { onConflict: 'work_date' })

    if (error) {
        console.error('❌ Lỗi import:', error.message)
        return
    }

    console.log('✅ Import thành công! Preview kWh tiêu thụ từng ngày:\n')
    console.log('Ngày         | AC1 (kWh) | AC2,4 (kWh) | AC3,5,6 (kWh) | Tổng (kWh)')
    console.log('-------------|-----------|-------------|---------------|----------')

    let prevM1 = null, prevM2 = null, prevM3 = null

    // Get previous month's last reading for 28/02/2026
    const { data: prevMonthData } = await supabase
        .from('daily_compressor')
        .select('meter1, meter2, meter3')
        .eq('work_date', '2026-02-28')
        .single()

    if (prevMonthData) {
        prevM1 = prevMonthData.meter1
        prevM2 = prevMonthData.meter2
        prevM3 = prevMonthData.meter3
        console.log(`(28/02: m1=${prevM1}, m2=${prevM2}, m3=${prevM3})`)
    }

    compressorData.forEach(r => {
        const kwh1 = (prevM1 != null && r.meter1 != null) ? Math.max(0, (r.meter1 - prevM1) * 1000).toFixed(0) : '-'
        const kwh2 = (prevM2 != null && r.meter2 != null) ? Math.max(0, (r.meter2 - prevM2) * 1000).toFixed(0) : '-'
        const kwh3 = (prevM3 != null && r.meter3 != null) ? Math.max(0, (r.meter3 - prevM3) * 1000).toFixed(0) : '-'
        const total = (kwh1 !== '-' && kwh2 !== '-' && kwh3 !== '-') ? (Number(kwh1) + Number(kwh2) + Number(kwh3)).toFixed(0) : '-'
        console.log(`${r.work_date} | ${String(kwh1).padStart(9)} | ${String(kwh2).padStart(11)} | ${String(kwh3).padStart(13)} | ${total}`)
        prevM1 = r.meter1
        prevM2 = r.meter2
        prevM3 = r.meter3
    })

    console.log('\n✅ Hoàn tất!')
}

importData().catch(console.error)
