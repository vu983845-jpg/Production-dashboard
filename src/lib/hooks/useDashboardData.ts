import { useQuery } from "@tanstack/react-query"
import { format, startOfMonth, endOfMonth, subDays, addDays } from "date-fns"
import { createClient } from "@/lib/supabase/client"

// ── Pure helper: build summary from a set of records ─────────────────────────
export const buildSummary = (records: any[], isTotal: boolean) => {
    let tPlan = 0, tActual = 0, tDown = 0, tInput = 0, tOutput = 0, tWip = 0
    let tPlanCont = 0, tActualCont = 0
    let tPlanIsp = 0, tActualIsp = 0, tPlanNonIsp = 0, tActualNonIsp = 0
    let sumBroken = 0, countBroken = 0
    let sumUnpeel = 0, countUnpeel = 0
    let sumIsp = 0, countIsp = 0
    let sumSw = 0, countSw = 0
    let tElecCons = 0, tElecTarget = 0
    let tActualIspCS = 0

    const todayStr = format(new Date(), "yyyy-MM-dd")
    let cutoffDate = ""
    records.forEach(r => {
        const actT = Number(isTotal ? r.total_actual_ton : r.actual_ton || 0)
        const actC = Number(isTotal ? r.total_actual_container : r.actual_container || 0)
        if (actT > 0 || actC > 0) {
            if (!cutoffDate || r.work_date > cutoffDate) cutoffDate = r.work_date
        }
    })
    if (!cutoffDate || cutoffDate > todayStr) cutoffDate = todayStr

    let tPlanMTD = 0, tPlanContMTD = 0, remainingWorkingDays = 0, remainingContWorkingDays = 0

    records.forEach(r => {
        const planVal = Number(isTotal ? r.total_plan_ton : r.plan_ton || 0)
        const planContVal = Number(isTotal ? r.total_plan_container : r.plan_container || 0)
        tPlan += planVal
        tPlanCont += planContVal
        if (r.work_date <= cutoffDate) { tPlanMTD += planVal; tPlanContMTD += planContVal }
        if (r.work_date >= todayStr) {
            if (planVal > 0) remainingWorkingDays++
            if (planContVal > 0) remainingContWorkingDays++
        }
        tActual += Number(isTotal ? r.total_actual_ton : r.actual_ton || 0)
        tActualCont += Number(isTotal ? r.total_actual_container : r.actual_container || 0)
        tDown += Number(isTotal ? r.total_downtime_min : r.downtime_min || 0)
        tInput += Number(isTotal ? r.total_input_ton : r.input_ton || 0)
        tOutput += Number(isTotal ? r.total_good_output_ton : r.good_output_ton || 0)
        tWip = Number(isTotal ? r.total_wip_close_ton : r.wip_close_ton || 0)
        tElecCons += Number(r.electricity_consumption_kwh || 0)
        tElecTarget += Number(r.target_electricity_kwh || 0)
        if (isTotal) {
            tPlanIsp += Number(r.total_plan_isp_ton || 0)
            tActualIsp += Number(r.total_actual_isp_ton || 0)
            tPlanNonIsp += Number(r.total_plan_non_isp_ton || 0)
            tActualNonIsp += Number(r.total_actual_non_isp_ton || 0)
        }
        if (!isTotal) {
            if (Number(r.broken_pct) > 0) { sumBroken += Number(r.broken_pct); countBroken++ }
            if (Number(r.unpeel_pct) > 0) { sumUnpeel += Number(r.unpeel_pct); countUnpeel++ }
            if (Number(r.isp_pct) > 0) { sumIsp += Number(r.isp_pct); countIsp++ }
            if (Number(r.sw_pct) > 0) { sumSw += Number(r.sw_pct); countSw++ }
            tActualIspCS += Number(r.isp_ton || 0)
            tPlanIsp += Number(r.plan_isp_ton || 0)
        } else {
            if (Number(r.avg_broken_pct) > 0) { sumBroken += Number(r.avg_broken_pct); countBroken++ }
            if (Number(r.avg_unpeel_pct) > 0) { sumUnpeel += Number(r.avg_unpeel_pct); countUnpeel++ }
            if (Number(r.avg_isp_pct) > 0) { sumIsp += Number(r.avg_isp_pct); countIsp++ }
            if (Number(r.avg_sw_pct) > 0) { sumSw += Number(r.avg_sw_pct); countSw++ }
        }
    })

    const latestRecord = records[records.length - 1] || {}
    const latestPlan = Number(isTotal ? latestRecord.total_plan_ton : latestRecord.plan_ton || 0)
    const latestActual = Number(isTotal ? latestRecord.total_actual_ton : latestRecord.actual_ton || 0)
    const latestPlanCont = Number(isTotal ? latestRecord.total_plan_container : latestRecord.plan_container || 0)
    const latestActualCont = Number(isTotal ? latestRecord.total_actual_container : latestRecord.actual_container || 0)
    const latestActualIsp_val = Number(latestRecord.total_actual_isp_ton || 0)
    const latestPlanIsp_val = Number(latestRecord.total_plan_isp_ton || 0)
    const latestActualNonIsp_val = Number(latestRecord.total_actual_non_isp_ton || 0)
    const latestPlanNonIsp_val = Number(latestRecord.total_plan_non_isp_ton || 0)

    return {
        totalPlan: tPlan, totalPlanCont: tPlanCont, totalActual: tActual, totalActualCont: tActualCont,
        totalPlanMTD: tPlanMTD, totalPlanContMTD: tPlanContMTD, latestPlan, latestActual,
        latestPlanCont, latestActualCont, latestActualIsp: latestActualIsp_val, latestPlanIsp: latestPlanIsp_val,
        latestActualNonIsp: latestActualNonIsp_val, latestPlanNonIsp: latestPlanNonIsp_val,
        achivementPct: tPlanMTD > 0 ? (tActual / tPlanMTD) * 100 : 0,
        achivementContPct: tPlanContMTD > 0 ? (tActualCont / tPlanContMTD) * 100 : 0,
        variance: tActual - tPlanMTD, downtime: tDown, wipClose: tWip,
        yieldPct: tInput > 0 ? (tOutput / tInput) * 100 : 0,
        brokenPct: countBroken > 0 ? sumBroken / countBroken : 0,
        unpeelPct: countUnpeel > 0 ? sumUnpeel / countUnpeel : 0,
        ispPct: countIsp > 0 ? sumIsp / countIsp : 0,
        swPct: countSw > 0 ? sumSw / countSw : 0,
        totalPlanIsp: tPlanIsp, totalActualIsp: tActualIsp,
        totalPlanNonIsp: tPlanNonIsp, totalActualNonIsp: tActualNonIsp,
        totalActualIspCS: tActualIspCS,
        totalActualNonIspCS: Math.max(0, tActual - tActualIspCS),
        totalElectricityConsumption: tElecCons, totalTargetElectricityKwh: tElecTarget,
        remainingWorkingDays, remainingContWorkingDays
    }
}

// ── Main fetcher (called by React Query, keyed by month) ────────────────────
async function fetchDashboardRaw(selectedMonth: Date) {
    const supabase = createClient()
    const startFilter = format(startOfMonth(selectedMonth), "yyyy-MM-dd")
    const endFilter = format(endOfMonth(selectedMonth), "yyyy-MM-dd")
    const prevMonthDateStr = format(subDays(startOfMonth(selectedMonth), 1), "yyyy-MM-dd")
    const nextDayStr = format(addDays(endOfMonth(selectedMonth), 1), "yyyy-MM-dd")

    // fetch SHELL dept id once for the KPI meter query below
    const shellDeptPromise = supabase.from('departments').select('id').eq('code', 'SHELL').single()

    const [
        { data: dtEvents },
        { data: eData },
        { data: totalData },
        { data: dData },
        { data: compData },
        { data: shellLineData },
        { data: deptRows },
        { data: othersRaw },
        { data: peelLineData },
        shellDeptResult,
    ] = await Promise.all([
        supabase
            .from('downtime_events')
            .select('department_id, work_date, duration_mins, start_time, end_time, is_ongoing')
            .eq('exclude_downtime', false)
            .gte('work_date', startFilter)
            .lte('work_date', endFilter),
        supabase
            .from('daily_energy')
            .select('*')
            .gte('work_date', startFilter)
            .lte('work_date', endFilter)
            .order('work_date'),
        supabase
            .from("v_dashboard_total_daily")
            .select("*")
            .gte("work_date", startFilter)
            .lte("work_date", endFilter)
            .order("work_date"),
        supabase
            .from("v_dashboard_daily")
            .select("*")
            .gte("work_date", startFilter)
            .lte("work_date", endFilter)
            .order("work_date"),
        supabase
            .from('daily_compressor')
            .select('*')
            .gte('work_date', prevMonthDateStr)
            .lte('work_date', nextDayStr)
            .order('work_date'),
        supabase
            .from('shelling_line_daily')
            .select('line_code, actual_ton, run_hours, broken_pct')
            .gte('work_date', startFilter)
            .lte('work_date', endFilter),
        supabase
            .from('departments')
            .select('id, code')
            .in('code', ['SHELL', 'PEEL']),
        supabase
            .from('daily_electricity_others')
            .select('*')
            .gte('work_date', prevMonthDateStr)
            .lte('work_date', nextDayStr)
            .order('work_date'),
        supabase
            .from('peeling_line_daily')
            .select('line_code, actual_ton, broken_pct, unpeel_pct')
            .gte('work_date', startFilter)
            .lte('work_date', endFilter),
        shellDeptPromise,
    ])

    // Fetch shell KPI separately (needs shell dept id) — but we already have it
    let shellKpiRaw: any[] = []
    const shellDept = shellDeptResult.data
    if (shellDept) {
        const { data } = await supabase
            .from('daily_kpi')
            .select('work_date, electricity_meter_reading')
            .eq('department_id', shellDept.id)
            .gte('work_date', prevMonthDateStr)
            .lte('work_date', nextDayStr)
            .order('work_date')
        shellKpiRaw = data || []
    }

    return {
        dtEvents, eData, totalData, dData, compData,
        shellLineData, deptRows, othersRaw, peelLineData,
        shellKpiRaw,
        startFilter, endFilter, prevMonthDateStr, nextDayStr,
    }
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface DashboardComputedData {
    dashboardsData: Record<string, { summary: any; history: any[] }>
    energyHistory: any[]
    shellingElecHistory: any[]
    compressorHistory: any[]
    compressorMtd: { total: number; m1: number; m2: number; m3: number }
    otherElecSummary: { shellingKwh: number; compressorKwh: number; peelingCompKwh: number; woodKg: number }
    otherElecMtd: Record<string, number>
    dailyElecVsProd: any[]
    kpiSummary: {
        steamActual: number; steamTarget: number
        fgwhActual: number; fgwhTarget: number
        contActual: number; contTarget: number
        elecActual: number; elecTarget: number
        waterActual: number; waterTarget: number
        woodActual: number; woodTarget: number
        totalEmission: number; totalEmissionTarget: number
    }
    deptData: any[]
    dailyRecords: any[]
    shellingLineMonthData: Record<string, { actual_ton: number; run_hours: number }>
    peelingLineMonthData: Record<string, { actual_ton: number }>
}

// ── Data processor: takes raw API responses => computed state ─────────────────
function processRawData(raw: Awaited<ReturnType<typeof fetchDashboardRaw>>): DashboardComputedData {
    const {
        dtEvents, eData, totalData, dData, compData,
        shellLineData, deptRows, othersRaw, peelLineData,
        shellKpiRaw, startFilter, endFilter, prevMonthDateStr,
    } = raw

    // ── Downtime aggregation ─────────────────────────────────────────────────
    const nativeDownTimeSum: Record<string, number> = {}
    const nativeTotalDownTimeSum: Record<string, number> = {}
    if (dtEvents) {
        dtEvents.forEach((evt: any) => {
            const mins = Number(evt.duration_mins || 0)
            if (mins <= 0) return
            const key = `${evt.department_id}_${evt.work_date}`
            nativeDownTimeSum[key] = (nativeDownTimeSum[key] || 0) + mins
            nativeTotalDownTimeSum[evt.work_date] = (nativeTotalDownTimeSum[evt.work_date] || 0) + mins
        })
    }

    // ── Energy ───────────────────────────────────────────────────────────────
    let elecActual = 0, elecTarget = 0, waterActual = 0, waterTarget = 0, woodActual = 0, woodTarget = 0
    let totalEmissionTons = 0
    const dailyEmissionsByDate: Record<string, number> = {}
    const energyHistory: any[] = []

    if (eData) {
        eData.forEach(r => {
            const elec = Number(r.electricity_kwh || 0)
            const water = Number(r.water_m3 || 0)
            const wood = Number(r.wood_kg || 0)
            elecActual += elec; elecTarget += Number(r.electricity_target_kwh || 0)
            waterActual += water; waterTarget += Number(r.water_target_m3 || 0)
            woodActual += wood; woodTarget += Number(r.wood_target_kg || 0)
            const scope1 = (wood * 0.028) + (water * 0.6 * 0.201)
            const scope2 = elec * 0.6592
            const dailyEmission = (scope1 + scope2) / 1000
            dailyEmissionsByDate[r.work_date] = dailyEmission
            totalEmissionTons += dailyEmission
        })
        eData.forEach(r => energyHistory.push({
            name: format(new Date(r.work_date), 'dd/MM'),
            ElectricityActual: Number(r.electricity_kwh || 0),
            ElectricityTarget: Number(r.electricity_target_kwh || 0),
            WaterActual: Number(r.water_m3 || 0),
            WaterTarget: Number(r.water_target_m3 || 0),
            WoodActual: Number(r.wood_kg || 0),
            WoodTarget: Number(r.wood_target_kg || 0),
            Emission: Number((dailyEmissionsByDate[r.work_date] || 0).toFixed(2))
        }))
    }

    // ── Total dashboard ("all" key) ──────────────────────────────────────────
    const dashboards: Record<string, { summary: any; history: any[] }> = {}

    if (totalData) {
        totalData.forEach((d: any) => {
            d.total_downtime_min = nativeTotalDownTimeSum[d.work_date] || 0
        })
        const history = totalData.map(d => ({
            name: format(new Date(d.work_date), 'dd/MM'),
            Actual: Number(d.total_actual_ton),
            Plan: Number(d.total_plan_ton),
            Emission: dailyEmissionsByDate[d.work_date] || 0
        }))
        const fgwhIspHistory = totalData.map(d => ({
            name: format(new Date(d.work_date), 'dd/MM'),
            Actual: Number(d.total_actual_isp_ton || 0),
            Plan: Number(d.total_plan_isp_ton || 0)
        }))
        const factoryTotalDowntimeMin = Object.values(nativeTotalDownTimeSum).reduce((s, v) => s + v, 0)
        const allSummary = buildSummary(totalData, true)
        allSummary.downtime = factoryTotalDowntimeMin
        dashboards["all"] = { summary: allSummary, history }
        const fgwhSummary = buildSummary(totalData, true)
        fgwhSummary.downtime = factoryTotalDowntimeMin
        dashboards["fgwh"] = { summary: fgwhSummary, history: fgwhIspHistory }
    }

    // ── Per-dept dashboards ──────────────────────────────────────────────────
    const mappingLCA = ["SHELL", "BORMA"]
    const mappingHCA = ["PEEL", "CS", "HPEEL", "PACK"]
    const shellDeptObj = deptRows?.find((d: any) => d.code === 'SHELL')
    const peelDeptObj = deptRows?.find((d: any) => d.code === 'PEEL')
    const SHELL_RECOVERY_FETCH = 0.22
    const shellByDate: Record<string, number> = {}
    const peelByDate: Record<string, number> = {}

    let deptData: any[] = []
    let dailyRecords: any[] = []
    let totalCompressorKwhMtd = 0
    let dailyCompressorKwhMap: Record<string, number> = {}
    const compChartPoints: any[] = []

    if (dData) {
        dData.forEach((curr: any) => {
            curr.downtime_min = nativeDownTimeSum[`${curr.department_id}_${curr.work_date}`] || 0
        })
        dData.forEach((r: any) => {
            if (shellDeptObj && r.department_id === shellDeptObj.id)
                shellByDate[r.work_date] = (shellByDate[r.work_date] || 0) + Number(r.actual_ton || 0)
            if (peelDeptObj && r.department_id === peelDeptObj.id)
                peelByDate[r.work_date] = (peelByDate[r.work_date] || 0) + Number(r.actual_ton || 0)
        })

        const grouped = dData.reduce((acc: any, curr: any) => {
            if (!acc[curr.department_id]) acc[curr.department_id] = []
            acc[curr.department_id].push(curr)
            let regionCode = "OTHER"
            if (curr.dept_code === "STEAM") regionCode = "RCN"
            else if (mappingLCA.includes(curr.dept_code)) regionCode = "LCA"
            else if (mappingHCA.includes(curr.dept_code)) regionCode = "HCA"
            if (!acc[`region-${regionCode}`]) acc[`region-${regionCode}`] = []
            acc[`region-${regionCode}`].push(curr)
            return acc
        }, {})

        Object.keys(grouped).forEach(key => {
            const records = grouped[key]
            const summary = buildSummary(records, false)
            const seen = new Set<string>()
            let correctDowntime = 0
            records.forEach((r: any) => {
                const dkey = `${r.department_id}_${r.work_date}`
                if (!seen.has(dkey)) { correctDowntime += nativeDownTimeSum[dkey] || 0; seen.add(dkey) }
            })
            summary.downtime = correctDowntime
            const recordsByDay = records.reduce((dayAcc: any, r: any) => {
                if (!dayAcc[r.work_date]) dayAcc[r.work_date] = { plan: 0, actual: 0, plan_cont: 0, actual_cont: 0, elec: 0, isp_actual: 0, isp_plan: 0 }
                dayAcc[r.work_date].plan += Number(r.plan_ton)
                dayAcc[r.work_date].actual += Number(r.actual_ton)
                dayAcc[r.work_date].plan_cont += Number(r.plan_container || 0)
                dayAcc[r.work_date].actual_cont += Number(r.actual_container || 0)
                dayAcc[r.work_date].elec += Number(r.electricity_consumption_kwh || 0)
                dayAcc[r.work_date].isp_actual += Number(r.isp_ton || 0)
                dayAcc[r.work_date].isp_plan += Number(r.plan_isp_ton || 0)
                return dayAcc
            }, {})
            const history = Object.keys(recordsByDay).sort().map(d => ({
                workDate: d,
                name: format(new Date(d), 'dd/MM'),
                Actual: Number(recordsByDay[d].actual.toFixed(1)),
                Plan: Number(recordsByDay[d].plan.toFixed(1)),
                ContActual: recordsByDay[d].actual_cont,
                ContPlan: recordsByDay[d].plan_cont,
                Intensity: recordsByDay[d].actual > 0 ? Number((recordsByDay[d].elec / recordsByDay[d].actual).toFixed(2)) : 0,
                IspActual: recordsByDay[d].isp_actual,
                IspPlan: recordsByDay[d].isp_plan,
                NonIspActual: Math.max(0, recordsByDay[d].actual - recordsByDay[d].isp_actual)
            }))
            dashboards[key] = { summary, history }
        })

        // Virtual container
        const packRecords = dData.filter((r: any) => r.dept_code === 'PACK')
        if (packRecords.length > 0) {
            const contByDay = packRecords.reduce((a: any, r: any) => {
                if (!a[r.work_date]) a[r.work_date] = { plan: 0, actual: 0 }
                a[r.work_date].plan += Number(r.plan_container || 0)
                a[r.work_date].actual += Number(r.actual_container || 0)
                return a
            }, {})
            const contHistory = Object.keys(contByDay).sort().map(d => ({
                name: format(new Date(d), 'dd/MM'),
                Actual: Number(contByDay[d].actual.toFixed(1)),
                Plan: Number(contByDay[d].plan.toFixed(1)),
            }))
            const packSummary = buildSummary(packRecords, false)
            dashboards["virtual-container"] = {
                summary: { ...packSummary, totalPlan: packSummary.totalPlanCont, totalActual: packSummary.totalActualCont, totalPlanMTD: packSummary.totalPlanContMTD, achivementPct: packSummary.achivementContPct },
                history: contHistory
            }
        }

        // Compressor
        if (compData && compData.length > 0) {
            const mapByDate = Object.fromEntries(compData.map((c: any) => [c.work_date, c]))
            const daysInSelectedMonth = compData.filter((c: any) => c.work_date >= startFilter)
            daysInSelectedMonth.forEach((curr: any) => {
                const prevDateStr = format(subDays(new Date(curr.work_date), 1), "yyyy-MM-dd")
                const prev = mapByDate[prevDateStr]
                if (prev && prev.meter1 != null && prev.meter2 != null && prev.meter3 != null) {
                    const m1 = Math.max(0, ((curr.meter1 || 0) - prev.meter1)) * 1000
                    const m2 = Math.max(0, ((curr.meter2 || 0) - prev.meter2)) * 1000
                    const m3 = Math.max(0, ((curr.meter3 || 0) - prev.meter3)) * 1000
                    const dailyTotal = m1 + m2 + m3
                    const normalizedDate = format(new Date(curr.work_date), 'yyyy-MM-dd')
                    dailyCompressorKwhMap[normalizedDate] = dailyTotal
                    totalCompressorKwhMtd += dailyTotal
                    compChartPoints.push({ name: format(new Date(curr.work_date), 'dd/MM'), work_date: normalizedDate, MNK1: Math.round(m1), MNK2: Math.round(m2), MNK3: Math.round(m3), Total: Math.round(dailyTotal) })
                }
            })
        }

        // Inject compressor intensity into PEEL history
        Object.keys(dashboards).forEach(key => {
            const recs = (dData || []).filter((r: any) => r.department_id === key)
            if (recs.length > 0 && recs[0].dept_code === 'PEEL') {
                dashboards[key].summary.totalCompressorKwhMtd = totalCompressorKwhMtd
                dashboards[key].history = dashboards[key].history.map((h: any) => {
                    const normalizedHDate = format(new Date(h.workDate), 'yyyy-MM-dd')
                    const kwh = dailyCompressorKwhMap[normalizedHDate] || 0
                    return { ...h, Intensity: h.Actual > 0 ? Number((kwh / h.Actual).toFixed(2)) : 0 }
                })
            }
        })

        // Legacy deptData for table
        const map = new Map()
        dData.forEach(r => {
            if (r.dept_code === 'FGWH') return
            if (!map.has(r.dept_name_en)) map.set(r.dept_name_en, { name: r.dept_name_en, code: r.dept_code, Actual: 0, Plan: 0, Down: 0 })
            const current = map.get(r.dept_name_en)
            current.Actual += Number(r.actual_ton); current.Plan += Number(r.plan_ton); current.Down += Number(r.downtime_min)
        })
        if (totalData && totalData.length > 0) {
            const fgwhPlan = totalData.reduce((s: number, r: any) => s + Number(r.total_plan_isp_ton || 0), 0)
            const fgwhActualRow = totalData.reduce((s: number, r: any) => s + Number(r.total_actual_isp_ton || 0), 0)
            if (fgwhPlan > 0 || fgwhActualRow > 0) map.set('FGWH', { name: 'FGWH – ISP', code: 'FGWH', Actual: fgwhActualRow, Plan: fgwhPlan, Down: 0 })
        }
        deptData = Array.from(map.values())
        dailyRecords = dData
    }

    // ── dailyElecVsProd ──────────────────────────────────────────────────────
    const dailyElecVsProd: any[] = []
    if (eData) {
        eData.forEach(r => {
            const elec = Number(r.electricity_kwh || 0)
            const shellInput = shellByDate[r.work_date] || 0
            const shellOut = shellInput * SHELL_RECOVERY_FETCH
            const peel = peelByDate[r.work_date] || 0
            const combined = shellOut + peel
            dailyElecVsProd.push({
                name: format(new Date(r.work_date), 'dd/MM'),
                ShellOut: Number(shellOut.toFixed(2)),
                PeelOut: Number(peel.toFixed(2)),
                ElecKwh: elec,
                KwhPerT: combined > 0 ? Number((elec / combined).toFixed(1)) : 0,
            })
        })
    }

    // ── Shelling elec delta ──────────────────────────────────────────────────
    let totalShellingKwh = 0
    const shellingElecHistory: any[] = []
    for (let i = 1; i < shellKpiRaw.length; i++) {
        const prev = shellKpiRaw[i - 1], curr = shellKpiRaw[i]
        if (curr.work_date >= startFilter && curr.work_date <= endFilter) {
            const delta = Math.max(0, (curr.electricity_meter_reading || 0) - (prev.electricity_meter_reading || 0))
            totalShellingKwh += delta
            shellingElecHistory.push({ name: format(new Date(prev.work_date), 'dd/MM'), work_date: prev.work_date, kWh: Math.round(delta) })
        }
    }

    // ── Others electricity ───────────────────────────────────────────────────
    const othersArr = (othersRaw as any[]) || []
    let peelingCompKwhMtd = 0
    const otherElecMtd: Record<string, number> = {}
    const KEYS = ['cooling_fan', 'boiler', 'office', 'db_ac_hca', 'eco2', 'canteen', 'transformer', 'maintenance']
    KEYS.forEach(k => (otherElecMtd[k] = 0))
    for (let i = 1; i < othersArr.length; i++) {
        const prevR = othersArr[i - 1] as any, currR = othersArr[i] as any
        if (currR.work_date >= startFilter && currR.work_date <= endFilter) {
            peelingCompKwhMtd += Math.max(0, (currR.db_ac_hca || 0) - (prevR.db_ac_hca || 0))
            KEYS.forEach(k => { otherElecMtd[k] += Math.max(0, (currR[k] || 0) - (prevR[k] || 0)) })
        }
    }

    // ── Shelling line data ───────────────────────────────────────────────────
    const shellingLineMonthData: Record<string, { actual_ton: number; run_hours: number }> = {}
    if (shellLineData) {
        let totalBrokenWeight = 0, totalBrokenTon = 0
        shellLineData.forEach((r: any) => {
            if (!shellingLineMonthData[r.line_code]) shellingLineMonthData[r.line_code] = { actual_ton: 0, run_hours: 0 }
            shellingLineMonthData[r.line_code].actual_ton += Number(r.actual_ton || 0)
            shellingLineMonthData[r.line_code].run_hours += Number(r.run_hours || 0)
            const brk = Number(r.broken_pct || 0), ton = Number(r.actual_ton || 0)
            if (brk > 0 && ton > 0) { totalBrokenWeight += brk * ton; totalBrokenTon += ton }
        })
        const avgBrokenPct = totalBrokenTon > 0 ? totalBrokenWeight / totalBrokenTon : 0
        if (avgBrokenPct > 0) {
            const shellKey = Object.keys(dashboards).find(k => {
                const recs = (dData || []).filter((r: any) => r.department_id === k)
                return recs.length > 0 && recs[0].dept_code === 'SHELL'
            })
            if (shellKey) dashboards[shellKey].summary.brokenPct = avgBrokenPct
        }
    }

    // ── Peeling line data ────────────────────────────────────────────────────
    const peelingLineMonthData: Record<string, { actual_ton: number }> = {}
    if (peelLineData) {
        let totalBrokenWeight = 0, totalBrokenTon = 0, totalUnpeelWeight = 0, totalUnpeelTon = 0
        peelLineData.forEach((r: any) => {
            const ton = Number(r.actual_ton || 0), brk = Number(r.broken_pct || 0), unp = Number(r.unpeel_pct || 0)
            if (ton > 0 && brk > 0) { totalBrokenWeight += brk * ton; totalBrokenTon += ton }
            if (ton > 0 && unp > 0) { totalUnpeelWeight += unp * ton; totalUnpeelTon += ton }
            const lc = r.line_code
            if (!peelingLineMonthData[lc]) peelingLineMonthData[lc] = { actual_ton: 0 }
            peelingLineMonthData[lc].actual_ton += ton
        })
        const avgBrokenPct = totalBrokenTon > 0 ? totalBrokenWeight / totalBrokenTon : 0
        const avgUnpeelPct = totalUnpeelTon > 0 ? totalUnpeelWeight / totalUnpeelTon : 0
        if (avgBrokenPct > 0 || avgUnpeelPct > 0) {
            const peelKey = Object.keys(dashboards).find(k => {
                const recs = (dData || []).filter((r: any) => r.department_id === k)
                return recs.length > 0 && recs[0].dept_code === 'PEEL'
            })
            if (peelKey) {
                if (avgBrokenPct > 0) dashboards[peelKey].summary.brokenPct = avgBrokenPct
                if (avgUnpeelPct > 0) dashboards[peelKey].summary.unpeelPct = avgUnpeelPct
            }
        }
    }

    // ── KPI summary ──────────────────────────────────────────────────────────
    let fgwhActual = 0, fgwhTarget = 0, steamActual = 0, steamTarget = 0, contActual = 0, contTarget = 0
    if (totalData) {
        totalData.forEach(r => { fgwhActual += Number(r.total_actual_isp_ton || 0); fgwhTarget += Number(r.total_plan_isp_ton || 0) })
    }
    if (dData) {
        dData.filter(r => r.dept_code === 'STEAM').forEach(r => { steamActual += Number(r.actual_ton || 0); steamTarget += Number(r.plan_ton || 0) })
        dData.filter(r => r.dept_code === 'PACK').forEach(r => { contActual += Number(r.actual_container || 0); contTarget += Number(r.plan_container || 0) })
    }
    const mtdM1 = compChartPoints.reduce((s, d) => s + (d.MNK1 || 0), 0)
    const mtdM2 = compChartPoints.reduce((s, d) => s + (d.MNK2 || 0), 0)
    const mtdM3 = compChartPoints.reduce((s, d) => s + (d.MNK3 || 0), 0)

    return {
        dashboardsData: dashboards,
        energyHistory,
        shellingElecHistory,
        compressorHistory: compChartPoints,
        compressorMtd: { m1: Math.round(mtdM1), m2: Math.round(mtdM2), m3: Math.round(mtdM3), total: Math.round(mtdM1 + mtdM2 + mtdM3) },
        otherElecSummary: { shellingKwh: Math.round(totalShellingKwh), compressorKwh: Math.round(totalCompressorKwhMtd), peelingCompKwh: Math.round(peelingCompKwhMtd), woodKg: 0 },
        otherElecMtd,
        dailyElecVsProd,
        kpiSummary: { steamActual, steamTarget, fgwhActual, fgwhTarget, elecActual, elecTarget, waterActual, waterTarget, woodActual, woodTarget, contActual, contTarget, totalEmission: totalEmissionTons, totalEmissionTarget: 265 },
        deptData,
        dailyRecords,
        shellingLineMonthData,
        peelingLineMonthData,
    }
}

// ── Public hook ──────────────────────────────────────────────────────────────
export function useDashboardData(selectedMonth: Date) {
    const monthKey = format(selectedMonth, "yyyy-MM")
    return useQuery<DashboardComputedData>({
        queryKey: ["dashboard", monthKey],
        queryFn: async () => {
            const raw = await fetchDashboardRaw(selectedMonth)
            return processRawData(raw)
        },
        staleTime: 5 * 60 * 1000,   // cache 5 minutes — avoids re-fetch on tab switch
        gcTime: 10 * 60 * 1000,     // keep in memory 10 minutes
        refetchOnWindowFocus: false,
    })
}
