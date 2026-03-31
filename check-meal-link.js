// check-meal-link.js — Kiểm tra meal_headcount có link department_id đúng không
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://iekjajbmbkqrbalnjwit.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDc4MzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8'
)

async function main() {
    // 1. Lấy danh sách departments
    const { data: depts } = await supabase
        .from('departments')
        .select('id, code, name_vi, name_en')
        .order('sort_order')

    console.log('\n========== DEPARTMENTS TABLE ==========')
    const deptMap = {}
    depts.forEach(d => {
        deptMap[d.id] = d.code
        console.log(`  ${d.code.padEnd(15)} | ${d.name_vi || d.name_en}`)
    })

    // 2. Lấy toàn bộ meal_headcount tháng 3/2026
    const { data: rows, error } = await supabase
        .from('meal_headcount')
        .select('work_date, department_id, department_name, shift, official_present, seasonal_present, ot_count, vegetarian')
        .gte('work_date', '2026-03-01')
        .lte('work_date', '2026-03-31')
        .order('work_date')
        .order('department_name')

    if (error) { console.error('Error:', error); return }

    console.log('\n========== MEAL_HEADCOUNT (Tháng 3/2026) ==========')
    console.log(`${'Ngày'.padEnd(12)} | ${'DeptID link?'.padEnd(12)} | ${'Code'.padEnd(10)} | ${'dept_name'.padEnd(30)} | ${'Ca'} | ${'CT_HĐ'} | ${'TV_HĐ'} | OT | Chay`)
    console.log('-'.repeat(110))

    const noLink = []
    const linked = []

    rows.forEach(r => {
        const code = r.department_id ? (deptMap[r.department_id] ?? '???') : '❌ NULL'
        const linked_ok = r.department_id && deptMap[r.department_id]
        const line = `${r.work_date} | ${(r.department_id ? '✅ linked' : '❌ no link').padEnd(12)} | ${code.padEnd(10)} | ${(r.department_name||'').padEnd(30)} | ${(r.shift||'').padEnd(2)} | ${String(r.official_present??'—').padEnd(5)} | ${String(r.seasonal_present??'—').padEnd(5)} | ${r.ot_count??'—'} | ${r.vegetarian??'—'}`
        console.log(line)
        if (!linked_ok) noLink.push(r)
        else linked.push(r)
    })

    console.log('\n========== TÓM TẮT ==========')
    console.log(`✅ Đã link:  ${linked.length} records`)
    console.log(`❌ Chưa link: ${noLink.length} records`)

    if (noLink.length > 0) {
        console.log('\n--- Các record CHƯA có department_id ---')
        noLink.forEach(r => {
            console.log(`  ${r.work_date} | "${r.department_name}" | ca ${r.shift} | CT=${r.official_present}`)
        })
    }

    // 3. Thống kê theo dept code
    console.log('\n========== THỐNG KÊ THEO BỘ PHẬN ==========')
    const byDept = {}
    rows.forEach(r => {
        const code = r.department_id ? (deptMap[r.department_id] ?? 'UNKNOWN') : 'NO_LINK'
        if (!byDept[code]) byDept[code] = { count: 0, totalCT: 0, totalTV: 0 }
        byDept[code].count++
        byDept[code].totalCT += (r.official_present || 0)
        byDept[code].totalTV += (r.seasonal_present || 0)
    })
    Object.entries(byDept).sort().forEach(([code, s]) => {
        console.log(`  ${code.padEnd(15)} | ${s.count} records | CT tổng: ${s.totalCT} | TV tổng: ${s.totalTV}`)
    })
}

main().catch(console.error)
