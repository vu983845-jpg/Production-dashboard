"use client"
import { DashboardLoader } from "@/components/dashboard-loader"

import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import { format, startOfMonth, startOfWeek, isSunday, endOfMonth, addDays, subDays } from "date-fns"
import { vi } from "date-fns/locale"
import {
    FileSymlink,
    TrendingDown,
    TrendingUp,
    Percent,
    Clock,
    BatteryWarning,
    Download
} from "lucide-react"
import { AreaChart, Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, ReferenceLine } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/contexts/LanguageContext"
import { GaugeChart } from "@/components/ui/gauge-chart"
import { FadeIn, FadeInStagger } from "@/components/magicui/fade-in"
import { AnimatedNumber } from "@/components/magicui/animated-number"
import { BadgePulse } from "@/components/magicui/badge-pulse"
import { OverviewTab } from "@/components/dashboard/OverviewTab"
import { RCNStockChart } from "@/components/RCNStockChart"

const CustomTooltip = memo(({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/98 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-2xl p-4 z-50 ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95 duration-150 min-w-[140px]">
                <p className="font-black text-slate-700 mb-3 pb-2 border-b border-slate-100 text-sm tracking-wide">{label}</p>
                <div className="space-y-2.5">
                    {payload.map((entry: any, i: number) => {
                        let color = entry.color || '#334155';
                        if (entry.name && (entry.name.includes('Thực tế') || entry.name.includes('Actual'))) {
                            color = entry.payload.Actual >= entry.payload.Plan ? '#10b981' : '#e63121';
                        }
                        return (
                            <div key={i} className="flex justify-between items-center gap-8">
                                <span className="text-slate-500 text-xs font-medium flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full shadow-md flex-shrink-0" style={{ backgroundColor: color }}></div>
                                    {entry.name}
                                </span>
                                <span className="font-black text-slate-900 text-sm tabular-nums">{Number(entry.value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</span>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }
    return null;
})

// ChartWrapper: dismisses tooltip reliably on mobile touch-end
const ChartWrapper = memo(({ children, className }: { children: React.ReactNode; className?: string }) => {
    const ref = useRef<HTMLDivElement>(null);
    const handleTouchEnd = () => {
        setTimeout(() => {
            const wrapper = ref.current?.querySelector('.recharts-wrapper');
            if (wrapper) {
                wrapper.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true }));
                wrapper.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
            }
        }, 50);
    };
    return (
        <div ref={ref} className={className} onTouchEnd={handleTouchEnd}>
            {children}
        </div>
    );
})


// ── Pure helper functions (module-level, not recreated on render) ─────────────

const getRemainingWorkingDays = (monthDate: Date) => {
    const today = new Date();
    const startOfSelected = startOfMonth(monthDate);
    const endOfSelected = endOfMonth(monthDate);
    if (today > endOfSelected) return 0;
    let current = today < startOfSelected ? startOfSelected : today;
    let remainingDays = 0;
    while (current <= endOfSelected) {
        if (!isSunday(current)) remainingDays++;
        current = addDays(current, 1);
    }
    return remainingDays;
}

const buildSummary = (records: any[], isTotal: boolean) => {
    let tPlan = 0, tActual = 0, tDown = 0, tInput = 0, tOutput = 0, tWip = 0;
    let tPlanCont = 0, tActualCont = 0;
    let tPlanIsp = 0, tActualIsp = 0, tPlanNonIsp = 0, tActualNonIsp = 0;
    let sumBroken = 0, countBroken = 0;
    let sumUnpeel = 0, countUnpeel = 0;
    let sumIsp = 0, countIsp = 0;
    let sumSw = 0, countSw = 0;
    let tElecCons = 0, tElecTarget = 0;
    let tActualIspCS = 0;

    const todayStr = format(new Date(), "yyyy-MM-dd");
    let cutoffDate = "";
    records.forEach(r => {
        const actT = Number(isTotal ? r.total_actual_ton : r.actual_ton || 0);
        const actC = Number(isTotal ? r.total_actual_container : r.actual_container || 0);
        if (actT > 0 || actC > 0) {
            if (!cutoffDate || r.work_date > cutoffDate) cutoffDate = r.work_date;
        }
    });
    if (!cutoffDate || cutoffDate > todayStr) cutoffDate = todayStr;

    let tPlanMTD = 0, tPlanContMTD = 0, remainingWorkingDays = 0, remainingContWorkingDays = 0;

    records.forEach(r => {
        const planVal = Number(isTotal ? r.total_plan_ton : r.plan_ton || 0);
        const planContVal = Number(isTotal ? r.total_plan_container : r.plan_container || 0);
        tPlan += planVal;
        tPlanCont += planContVal;
        if (r.work_date <= cutoffDate) { tPlanMTD += planVal; tPlanContMTD += planContVal; }
        if (r.work_date >= todayStr) {
            if (planVal > 0) remainingWorkingDays++;
            if (planContVal > 0) remainingContWorkingDays++;
        }
        tActual += Number(isTotal ? r.total_actual_ton : r.actual_ton || 0);
        tActualCont += Number(isTotal ? r.total_actual_container : r.actual_container || 0);
        tDown += Number(isTotal ? r.total_downtime_min : r.downtime_min || 0);
        tInput += Number(isTotal ? r.total_input_ton : r.input_ton || 0);
        tOutput += Number(isTotal ? r.total_good_output_ton : r.good_output_ton || 0);
        tWip = Number(isTotal ? r.total_wip_close_ton : r.wip_close_ton || 0);
        tElecCons += Number(r.electricity_consumption_kwh || 0);
        tElecTarget += Number(r.target_electricity_kwh || 0);
        if (isTotal) {
            tPlanIsp += Number(r.total_plan_isp_ton || 0);
            tActualIsp += Number(r.total_actual_isp_ton || 0);
            tPlanNonIsp += Number(r.total_plan_non_isp_ton || 0);
            tActualNonIsp += Number(r.total_actual_non_isp_ton || 0);
        }
        if (!isTotal) {
            if (Number(r.broken_pct) > 0) { sumBroken += Number(r.broken_pct); countBroken++; }
            if (Number(r.unpeel_pct) > 0) { sumUnpeel += Number(r.unpeel_pct); countUnpeel++; }
            if (Number(r.isp_pct) > 0) { sumIsp += Number(r.isp_pct); countIsp++; }
            if (Number(r.sw_pct) > 0) { sumSw += Number(r.sw_pct); countSw++; }
            tActualIspCS += Number(r.isp_ton || 0);
            tPlanIsp += Number(r.plan_isp_ton || 0);
        } else {
            if (Number(r.avg_broken_pct) > 0) { sumBroken += Number(r.avg_broken_pct); countBroken++; }
            if (Number(r.avg_unpeel_pct) > 0) { sumUnpeel += Number(r.avg_unpeel_pct); countUnpeel++; }
            if (Number(r.avg_isp_pct) > 0) { sumIsp += Number(r.avg_isp_pct); countIsp++; }
            if (Number(r.avg_sw_pct) > 0) { sumSw += Number(r.avg_sw_pct); countSw++; }
        }
    });

    const latestRecord = records[records.length - 1] || {};
    const latestPlan = Number(isTotal ? latestRecord.total_plan_ton : latestRecord.plan_ton || 0);
    const latestActual = Number(isTotal ? latestRecord.total_actual_ton : latestRecord.actual_ton || 0);
    const latestPlanCont = Number(isTotal ? latestRecord.total_plan_container : latestRecord.plan_container || 0);
    const latestActualCont = Number(isTotal ? latestRecord.total_actual_container : latestRecord.actual_container || 0);
    const latestActualIsp_val = Number(latestRecord.total_actual_isp_ton || 0);
    const latestPlanIsp_val = Number(latestRecord.total_plan_isp_ton || 0);
    const latestActualNonIsp_val = Number(latestRecord.total_actual_non_isp_ton || 0);
    const latestPlanNonIsp_val = Number(latestRecord.total_plan_non_isp_ton || 0);

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
    };
};

export default function DashboardPage() {
    const supabase = createClient()
    const { t, language } = useLanguage()
    const [selectedMonth, setSelectedMonth] = useState<Date>(new Date()) // Current month by default
    const [selectedDept, setSelectedDept] = useState("all")
    const [selectedTab, setSelectedTab] = useState("stations") // "stations" or "regions"
    const [departments, setDepartments] = useState<{ id: string, name_vi: string, name_en: string, code: string }[]>([])

    const [dailyData, setDailyData] = useState<any[]>([])
    const [deptData, setDeptData] = useState<any[]>([])
    const [dailyRecords, setDailyRecords] = useState<any[]>([]) // For specific dept table

    // Store data per department for mini-dashboards
    const [dashboardsData, setDashboardsData] = useState<{
        [key: string]: {
            summary: any,
            history: any[]
        }
    }>({})

    // Shelling line view
    const SHELLING_LINES_DASH = ['A', 'B', 'C', 'D1', 'D2'] as const
    const [shellingLineMonthData, setShellingLineMonthData] = useState<Record<string, { actual_ton: number; run_hours: number }>>({})
    const [peelingLineMonthData, setPeelingLineMonthData] = useState<Record<string, { actual_ton: number }>>({})
    const [deptViewModes, setDeptViewModes] = useState<Record<string, 'chart' | 'details' | 'lines' | 'isp'>>({})
    const [shellingSubView, setShellingSubView] = useState<'production' | 'capacity'>('production')
    const [showCo2Intensity, setShowCo2Intensity] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<{ deptCode: string; userName: string } | null>(null)
    const [tablePage, setTablePage] = useState(0)
    const TABLE_PAGE_SIZE = 20


    const [energyHistory, setEnergyHistory] = useState<any[]>([])
    const [shellingElecHistory, setShellingElecHistory] = useState<any[]>([])
    const [compressorHistory, setCompressorHistory] = useState<any[]>([])
    const [compressorMtd, setCompressorMtd] = useState({ total: 0, m1: 0, m2: 0, m3: 0 })
    const [otherElecSummary, setOtherElecSummary] = useState({ shellingKwh: 0, compressorKwh: 0, peelingCompKwh: 0, woodKg: 0 })
    const [otherElecMtd, setOtherElecMtd] = useState<Record<string, number>>({})
    const [dailyElecVsProd, setDailyElecVsProd] = useState<any[]>([]) // kWh/T daily breakdown
    const [kpiSummary, setKpiSummary] = useState({
        steamActual: 0, steamTarget: 0,
        fgwhActual: 0, fgwhTarget: 0,
        contActual: 0, contTarget: 0,
        elecActual: 0, elecTarget: 0,
        waterActual: 0, waterTarget: 0,
        woodActual: 0, woodTarget: 0,
        totalEmission: 0, totalEmissionTarget: 265
    })

    // Load user profile for loader greeting
    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: p } = await supabase.from("profiles")
                .select("full_name, department_id")
                .eq("id", user.id).single()
            if (p?.department_id) {
                const { data: dept } = await supabase.from("departments")
                    .select("code").eq("id", p.department_id).single()
                setUserProfile({ deptCode: dept?.code || "", userName: p.full_name || "" })
            }
        }
        loadProfile()
    }, [])

    // Load Departments
    useEffect(() => {
        async function loadDepts() {
            const { data } = await supabase.from("departments").select("id, name_vi, name_en, code").order("sort_order")
            if (data) setDepartments(data)
        }
        loadDepts()
    }, [])


    // Load Dashboard Data
    useEffect(() => {
        async function fetchDashboard() {
            setPageLoading(true);
            const dashboards: any = {};
            const startFilter = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
            const endFilter = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
            const prevMonthDateStr = format(subDays(startOfMonth(selectedMonth), 1), "yyyy-MM-dd");
            const nextDayStr = format(addDays(endOfMonth(selectedMonth), 1), "yyyy-MM-dd");

            // Parallel fetch all data for better performance
            const [
                { data: dtEvents },
                { data: eData },
                { data: totalData },
                { data: dData },
                { data: compData },
                { data: shellLineData },
                { data: deptRows },
                { data: shellKpiRaw },
                { data: othersRaw },
                { data: peelLineData },
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
                // Shelling electricity (meter index) - need +1 day for delta
                (async () => {
                    const { data: shellDept } = await supabase.from('departments').select('id').eq('code', 'SHELL').single()
                    if (!shellDept) return { data: [] }
                    return supabase.from('daily_kpi')
                        .select('work_date, electricity_meter_reading')
                        .eq('department_id', shellDept.id)
                        .gte('work_date', prevMonthDateStr)
                        .lte('work_date', nextDayStr)
                        .order('work_date')
                })(),
                // daily_electricity_others (sub-meters: contains peeling info via db_ac_hca)
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
            ]);


            const nativeDownTimeSum: Record<string, number> = {};
            const nativeTotalDownTimeSum: Record<string, number> = {};

            if (dtEvents) {
                dtEvents.forEach((evt: any) => {
                    const mins = Number(evt.duration_mins || 0);
                    if (mins <= 0) return;

                    const issueDate = evt.work_date;
                    const deptId = evt.department_id;

                    const key = `${deptId}_${issueDate}`;
                    if (!nativeDownTimeSum[key]) nativeDownTimeSum[key] = 0;
                    nativeDownTimeSum[key] += mins;

                    if (!nativeTotalDownTimeSum[issueDate]) nativeTotalDownTimeSum[issueDate] = 0;
                    nativeTotalDownTimeSum[issueDate] += mins;
                });
            }




            let elecActual = 0, elecTarget = 0, waterActual = 0, waterTarget = 0, woodActual = 0, woodTarget = 0;
            let totalEmissionTons = 0;
            const dailyEmissionsByDate: Record<string, number> = {};

            if (eData) {
                eData.forEach(r => {
                    const elec = Number(r.electricity_kwh || 0);
                    const water = Number(r.water_m3 || 0);
                    const wood = Number(r.wood_kg || 0);

                    elecActual += elec;
                    elecTarget += Number(r.electricity_target_kwh || 0);
                    waterActual += water;
                    waterTarget += Number(r.water_target_m3 || 0);
                    woodActual += wood;
                    woodTarget += Number(r.wood_target_kg || 0);

                    // Scope 1: Wood (tons -> * 0.028) + Wastewater (Water * 0.6 -> * 0.201)
                    const scope1 = (wood * 0.028) + (water * 0.6 * 0.201);
                    // Scope 2: Electricity (kWh -> * 0.6592)
                    const scope2 = elec * 0.6592;
                    const dailyEmission = (scope1 + scope2) / 1000; // Convert to Tons CO₂e

                    dailyEmissionsByDate[r.work_date] = dailyEmission;
                    totalEmissionTons += dailyEmission;
                });

                setEnergyHistory(eData.map(r => ({
                    name: format(new Date(r.work_date), 'dd/MM'),
                    ElectricityActual: Number(r.electricity_kwh || 0),
                    ElectricityTarget: Number(r.electricity_target_kwh || 0),
                    WaterActual: Number(r.water_m3 || 0),
                    WaterTarget: Number(r.water_target_m3 || 0),
                    WoodActual: Number(r.wood_kg || 0),
                    WoodTarget: Number(r.wood_target_kg || 0),
                    Emission: Number((dailyEmissionsByDate[r.work_date] || 0).toFixed(2))
                })));
            }


            if (totalData) {
                // Pre-process and inject native downtime mappings 
                totalData.forEach((d: any) => {
                    d.total_downtime_min = nativeTotalDownTimeSum[d.work_date] || 0;
                });
                const history = totalData.map(d => ({
                    name: format(new Date(d.work_date), 'dd/MM'),
                    Actual: Number(d.total_actual_ton),
                    Plan: Number(d.total_plan_ton),
                    Emission: dailyEmissionsByDate[d.work_date] || 0
                }));
                const fgwhIspHistory = totalData.map(d => ({
                    name: format(new Date(d.work_date), 'dd/MM'),
                    Actual: Number(d.total_actual_isp_ton || 0),
                    Plan: Number(d.total_plan_isp_ton || 0)
                }));

                // Correct factory total downtime = sum of nativeTotalDownTimeSum values (one per date, not multiplied by dept rows)
                const factoryTotalDowntimeMin = Object.values(nativeTotalDownTimeSum).reduce((s: number, v: any) => s + (v as number), 0);
                const allSummary = buildSummary(totalData, true);
                allSummary.downtime = factoryTotalDowntimeMin;
                dashboards["all"] = { summary: allSummary, history };
                const fgwhSummary = buildSummary(totalData, true);
                fgwhSummary.downtime = factoryTotalDowntimeMin;
                dashboards["fgwh"] = { summary: fgwhSummary, history: fgwhIspHistory };
            }


            if (dData) {
                // Map the downloaded native Downtime values
                dData.forEach((curr: any) => {
                    curr.downtime_min = nativeDownTimeSum[`${curr.department_id}_${curr.work_date}`] || 0;
                });

                // --- Build dailyElecVsProd chart data ---
                // Fetch dept IDs inline to avoid race condition with departments state

                const shellDeptObj = deptRows?.find((d: any) => d.code === 'SHELL');
                const peelDeptObj = deptRows?.find((d: any) => d.code === 'PEEL');
                const SHELL_RECOVERY_FETCH = 0.22;
                const shellByDate: Record<string, number> = {};
                const peelByDate: Record<string, number> = {};
                dData.forEach((r: any) => {
                    if (shellDeptObj && r.department_id === shellDeptObj.id) {
                        shellByDate[r.work_date] = (shellByDate[r.work_date] || 0) + Number(r.actual_ton || 0);
                    }
                    if (peelDeptObj && r.department_id === peelDeptObj.id) {
                        peelByDate[r.work_date] = (peelByDate[r.work_date] || 0) + Number(r.actual_ton || 0);
                    }
                });
                if (eData) {
                    const elecVsProd = eData.map(r => {
                        const elec = Number(r.electricity_kwh || 0);
                        const shellInput = shellByDate[r.work_date] || 0;
                        const shellOut = shellInput * SHELL_RECOVERY_FETCH;
                        const peel = peelByDate[r.work_date] || 0;
                        const combined = shellOut + peel;
                        return {
                            name: format(new Date(r.work_date), 'dd/MM'),
                            ShellOut: Number(shellOut.toFixed(2)),
                            PeelOut: Number(peel.toFixed(2)),
                            ElecKwh: elec,
                            KwhPerT: combined > 0 ? Number((elec / combined).toFixed(1)) : 0,
                        };
                    });
                    setDailyElecVsProd(elecVsProd);
                }

                // Determine regions mapping
                // Map RCN: STEAM (RCN dept merged into FGWH; STEAM = raw cashew input)
                // Map LCA: SHELL, BORMA
                // Map HCA: PEEL, CS, HPEEL, PACK
                const mappingLCA = ["SHELL", "BORMA"];
                const mappingHCA = ["PEEL", "CS", "HPEEL", "PACK"];

                const grouped = dData.reduce((acc: any, curr: any) => {
                    // Group by stations setup
                    if (!acc[curr.department_id]) acc[curr.department_id] = [];
                    acc[curr.department_id].push(curr);

                    // Group by Regions
                    let regionCode = "OTHER";
                    if (curr.dept_code === "STEAM") regionCode = "RCN";
                    else if (mappingLCA.includes(curr.dept_code)) regionCode = "LCA";
                    else if (mappingHCA.includes(curr.dept_code)) regionCode = "HCA";

                    if (!acc[`region-${regionCode}`]) acc[`region-${regionCode}`] = [];
                    acc[`region-${regionCode}`].push(curr);

                    return acc;
                }, {});

                // Build summary and history
                Object.keys(grouped).forEach(key => {
                    const records = grouped[key];
                    const summary = buildSummary(records, false);

                    // DOWNTIME FIX: v_dashboard_daily can have N rows per (dept, date)
                    // (e.g. per shift or per line), causing downtime_min to be summed N times.
                    // Override summary.downtime by de-duplicating on unique dept+date keys.
                    const seen = new Set<string>();
                    let correctDowntime = 0;
                    records.forEach((r: any) => {
                        const dkey = `${r.department_id}_${r.work_date}`;
                        if (!seen.has(dkey)) {
                            correctDowntime += nativeDownTimeSum[dkey] || 0;
                            seen.add(dkey);
                        }
                    });
                    summary.downtime = correctDowntime;

                    // Build daily history (group by work_date, summing across depts for regions)
                    const recordsByDay = records.reduce((dayAcc: any, r: any) => {
                        if (!dayAcc[r.work_date]) {
                            dayAcc[r.work_date] = { plan: 0, actual: 0, plan_cont: 0, actual_cont: 0, elec: 0, isp_actual: 0, isp_plan: 0 };
                        }
                        dayAcc[r.work_date].plan += Number(r.plan_ton);
                        dayAcc[r.work_date].actual += Number(r.actual_ton);
                        dayAcc[r.work_date].plan_cont += Number(r.plan_container || 0);
                        dayAcc[r.work_date].actual_cont += Number(r.actual_container || 0);
                        dayAcc[r.work_date].elec += Number(r.electricity_consumption_kwh || 0);
                        dayAcc[r.work_date].isp_actual += Number(r.isp_ton || 0);
                        dayAcc[r.work_date].isp_plan += Number(r.plan_isp_ton || 0);
                        return dayAcc;
                    }, {});

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
                    }));

                    dashboards[key] = { summary, history };
                });

                // Extract Container data from PACK department to create a Virtual Container Dashboard
                const packRecords = dData.filter((r: any) => r.dept_code === 'PACK');
                if (packRecords.length > 0) {
                    const contRecordsByDay = packRecords.reduce((dayAcc: any, r: any) => {
                        if (!dayAcc[r.work_date]) {
                            dayAcc[r.work_date] = { plan: 0, actual: 0 };
                        }
                        dayAcc[r.work_date].plan += Number(r.plan_container || 0);
                        dayAcc[r.work_date].actual += Number(r.actual_container || 0);
                        return dayAcc;
                    }, {});

                    const contHistory = Object.keys(contRecordsByDay).sort().map(d => ({
                        name: format(new Date(d), 'dd/MM'),
                        Actual: Number(contRecordsByDay[d].actual.toFixed(1)),
                        Plan: Number(contRecordsByDay[d].plan.toFixed(1)),
                    }));

                    const packSummary = buildSummary(packRecords, false);
                    dashboards["virtual-container"] = {
                        summary: {
                            ...packSummary,
                            totalPlan: packSummary.totalPlanCont,
                            totalActual: packSummary.totalActualCont,
                            totalPlanMTD: packSummary.totalPlanContMTD,
                            achivementPct: packSummary.achivementContPct,
                        },
                        history: contHistory
                    };
                }


                let totalCompressorKwhMtd = 0;
                let dailyCompressorKwhMap: Record<string, number> = {};
                const compChartPoints: any[] = [];

                if (compData && compData.length > 0) {
                    const mapByDate = Object.fromEntries(compData.map((c: any) => [c.work_date, c]));
                    const daysInSelectedMonth = compData.filter((c: any) => c.work_date >= startFilter);

                    daysInSelectedMonth.forEach((curr: any) => {
                        // Find previous available reading (handles gaps in data)
                        const prevDateStr = format(subDays(new Date(curr.work_date), 1), "yyyy-MM-dd");
                        const prev = mapByDate[prevDateStr];
                        if (prev && prev.meter1 != null && prev.meter2 != null && prev.meter3 != null) {
                            const diffDays = 1; // prev is always 1 day before (guaranteed by prevDateStr lookup)
                            // meter unit = MWh → multiply by 1000 to get kWh (same as energy page computeDeltas multiplier=1000)
                            const m1 = Math.max(0, ((curr.meter1 || 0) - prev.meter1) / diffDays) * 1000;
                            const m2 = Math.max(0, ((curr.meter2 || 0) - prev.meter2) / diffDays) * 1000;
                            const m3 = Math.max(0, ((curr.meter3 || 0) - prev.meter3) / diffDays) * 1000;
                            // Total = tổng 3 cụm MNK (#1 + #2,4 + #3,5,6)
                            const dailyTotal = m1 + m2 + m3;
                            const normalizedDate = format(new Date(curr.work_date), 'yyyy-MM-dd');
                            dailyCompressorKwhMap[normalizedDate] = dailyTotal;
                            totalCompressorKwhMtd += dailyTotal;
                            compChartPoints.push({
                                name: format(new Date(curr.work_date), 'dd/MM'),
                                work_date: normalizedDate,
                                MNK1: Math.round(m1),  // Cụm #1
                                MNK2: Math.round(m2),  // Cụm #2, #4
                                MNK3: Math.round(m3),  // Cụm #3, #5, #6
                                Total: Math.round(dailyTotal),
                            });
                        }
                    });
                }
                setCompressorHistory(compChartPoints);

                // Capture per-meter MTD totals for the new dashboard section
                const mtdM1 = compChartPoints.reduce((s: number, d: any) => s + (d.MNK1 || 0), 0);
                const mtdM2 = compChartPoints.reduce((s: number, d: any) => s + (d.MNK2 || 0), 0);
                const mtdM3 = compChartPoints.reduce((s: number, d: any) => s + (d.MNK3 || 0), 0);
                setCompressorMtd({ m1: Math.round(mtdM1), m2: Math.round(mtdM2), m3: Math.round(mtdM3), total: Math.round(mtdM1 + mtdM2 + mtdM3) });

                // Process Shelling electricity deltas
                const shellKpiArr = (shellKpiRaw as any[]) || [];
                let totalShellingKwh = 0;
                const shellElecPoints: any[] = [];
                for (let i = 1; i < shellKpiArr.length; i++) {
                    const prev = shellKpiArr[i - 1];
                    const curr = shellKpiArr[i];
                    if (curr.work_date >= startFilter && curr.work_date <= endFilter) {
                        const delta = Math.max(0, (curr.electricity_meter_reading || 0) - (prev.electricity_meter_reading || 0));
                        totalShellingKwh += delta;
                        shellElecPoints.push({
                            name: format(new Date(prev.work_date), 'dd/MM'),
                            work_date: prev.work_date,
                            kWh: Math.round(delta),
                        });
                    }
                }
                setShellingElecHistory(shellElecPoints);

                // Process Others electricity (peeling = db_ac_hca proxy) 
                const othersArr = (othersRaw as any[]) || [];
                let peelingCompKwhMtd = 0;
                for (let i = 1; i < othersArr.length; i++) {
                    const prev = othersArr[i - 1];
                    const curr = othersArr[i];
                    if (curr.work_date >= startFilter && curr.work_date <= endFilter) {
                        peelingCompKwhMtd += Math.max(0, (curr.db_ac_hca || 0) - (prev.db_ac_hca || 0));
                    }
                }

                setOtherElecSummary({
                    shellingKwh: Math.round(totalShellingKwh),
                    compressorKwh: Math.round(totalCompressorKwhMtd),
                    peelingCompKwh: Math.round(peelingCompKwhMtd),
                    woodKg: 0, // will be updated below
                });

                // ── Compute per-key MTD sums for auxiliary electricity mini-cards ──
                if (othersRaw && othersRaw.length > 1) {
                    const KEYS = ['cooling_fan', 'boiler', 'office', 'db_ac_hca', 'eco2', 'canteen', 'transformer', 'maintenance'];
                    const sums: Record<string, number> = {};
                    KEYS.forEach(k => sums[k] = 0);
                    for (let i = 1; i < othersRaw.length; i++) {
                        const prevR = othersRaw[i - 1] as any;
                        const currR = othersRaw[i] as any;
                        if (currR.work_date >= startFilter && currR.work_date <= endFilter) {
                            KEYS.forEach(k => {
                                sums[k] += Math.max(0, (currR[k] || 0) - (prevR[k] || 0));
                            });
                        }
                    }
                    setOtherElecMtd(sums);
                }

                Object.keys(dashboards).forEach(key => {
                    const recordsInfo = grouped[key] || [];
                    const dCode = recordsInfo.length > 0 ? recordsInfo[0].dept_code : null;

                    if (dCode === 'PEEL') {
                        dashboards[key].summary.totalCompressorKwhMtd = totalCompressorKwhMtd;

                        // Inject into history for the line chart
                        dashboards[key].history = dashboards[key].history.map((h: any) => {
                            const normalizedHDate = format(new Date(h.workDate), 'yyyy-MM-dd');
                            const kwh = dailyCompressorKwhMap[normalizedHDate] || 0;
                            return {
                                ...h,
                                Intensity: h.Actual > 0 ? Number((kwh / h.Actual).toFixed(2)) : 0
                            };
                        });
                    }
                });
            }

            setDashboardsData(dashboards);

            // 3. Build Remaining KPIs (Energy already fetched above)

            // Calculate FGWH KPIs
            let fgwhActual = 0, fgwhTarget = 0;
            if (totalData) {
                totalData.forEach(r => {
                    fgwhActual += Number(r.total_actual_isp_ton || 0);
                    fgwhTarget += Number(r.total_plan_isp_ton || 0);
                });
            }

            // Calculate Steaming vs RCN KPIs (Steam actual vs steam target)
            let steamActual = 0, steamTarget = 0;
            if (dData) {
                const steamRecords = dData.filter(r => r.dept_code === 'STEAM');
                steamRecords.forEach(r => {
                    steamActual += Number(r.actual_ton || 0);
                    steamTarget += Number(r.plan_ton || 0);
                });
            }

            // Calculate Container KPIs
            let contActual = 0, contTarget = 0;
            if (dData) {
                const packRecords = dData.filter(r => r.dept_code === 'PACK');
                packRecords.forEach(r => {
                    contActual += Number(r.actual_container || 0);
                    contTarget += Number(r.plan_container || 0);
                });
            }

            setKpiSummary({
                steamActual, steamTarget, fgwhActual, fgwhTarget, elecActual, elecTarget, waterActual, waterTarget, woodActual, woodTarget, contActual, contTarget,
                totalEmission: totalEmissionTons, totalEmissionTarget: 265
            });

            // Still populate legacy states for the Master Table if needed
            if (dData) {
                const map = new Map()
                dData.forEach(r => {
                    // FGWH dept has no data in daily_actual — skip it here, will be added separately
                    if (r.dept_code === 'FGWH') return;
                    if (!map.has(r.dept_name_en)) map.set(r.dept_name_en, { name: r.dept_name_en, code: r.dept_code, Actual: 0, Plan: 0, Down: 0 })
                    const current = map.get(r.dept_name_en)
                    current.Actual += Number(r.actual_ton)
                    current.Plan += Number(r.plan_ton)
                    current.Down += Number(r.downtime_min)
                })
                // Add correct FGWH row from daily_fgwh (joined via v_dashboard_total_daily)
                if (totalData && totalData.length > 0) {
                    const fgwhPlan = totalData.reduce((s: number, r: any) => s + Number(r.total_plan_isp_ton || 0), 0);
                    const fgwhActualRow = totalData.reduce((s: number, r: any) => s + Number(r.total_actual_isp_ton || 0), 0);
                    if (fgwhPlan > 0 || fgwhActualRow > 0) {
                        map.set('FGWH', { name: 'FGWH – ISP', code: 'FGWH', Actual: fgwhActualRow, Plan: fgwhPlan, Down: 0 })
                    }
                }
                setDeptData(Array.from(map.values()))

                if (selectedDept !== 'all') {
                    setDailyRecords(dData.filter(d => d.department_id === selectedDept));
                    setTablePage(0);
                }
            }

            // Shelling Line Data (pre-fetched in parallel above)

            if (shellLineData) {
                const aggregated: Record<string, { actual_ton: number; run_hours: number }> = {}
                let totalBrokenWeight = 0, totalBrokenTon = 0;
                shellLineData.forEach((r: any) => {
                    if (!aggregated[r.line_code]) aggregated[r.line_code] = { actual_ton: 0, run_hours: 0 }
                    aggregated[r.line_code].actual_ton += Number(r.actual_ton || 0)
                    aggregated[r.line_code].run_hours += Number(r.run_hours || 0)
                    // Weighted average broken pct
                    const brk = Number(r.broken_pct || 0);
                    const ton = Number(r.actual_ton || 0);
                    if (brk > 0 && ton > 0) { totalBrokenWeight += brk * ton; totalBrokenTon += ton; }
                })
                setShellingLineMonthData(aggregated)

                // Inject avg broken_pct into SHELL dashboard summary
                const avgBrokenPct = totalBrokenTon > 0 ? totalBrokenWeight / totalBrokenTon : 0;
                if (avgBrokenPct > 0) {
                    setDashboardsData(prev => {
                        const shellKey = Object.keys(prev).find(k => {
                            const recs = (dData || []).filter((r: any) => r.department_id === k);
                            return recs.length > 0 && recs[0].dept_code === 'SHELL';
                        });
                        if (!shellKey) return prev;
                        return {
                            ...prev,
                            [shellKey]: {
                                ...prev[shellKey],
                                summary: { ...prev[shellKey].summary, brokenPct: avgBrokenPct }
                            }
                        };
                    });
                }
            }
            if (peelLineData) {
                let totalBrokenWeight = 0, totalBrokenTon = 0;
                let totalUnpeelWeight = 0, totalUnpeelTon = 0;
                peelLineData.forEach((r: any) => {
                    const ton = Number(r.actual_ton || 0);
                    const brk = Number(r.broken_pct || 0);
                    const unp = Number(r.unpeel_pct || 0);
                    if (ton > 0 && brk > 0) { totalBrokenWeight += brk * ton; totalBrokenTon += ton; }
                    if (ton > 0 && unp > 0) { totalUnpeelWeight += unp * ton; totalUnpeelTon += ton; }
                });
                const avgBrokenPct = totalBrokenTon > 0 ? totalBrokenWeight / totalBrokenTon : 0;
                const avgUnpeelPct = totalUnpeelTon > 0 ? totalUnpeelWeight / totalUnpeelTon : 0;
                const peelMonthData: Record<string, { actual_ton: number }> = {};
                peelLineData.forEach((r: any) => {
                    const lc = r.line_code;
                    const ton = Number(r.actual_ton || 0);
                    if (!peelMonthData[lc]) peelMonthData[lc] = { actual_ton: 0 };
                    peelMonthData[lc].actual_ton += ton;
                });
                setPeelingLineMonthData(peelMonthData);

                if (avgBrokenPct > 0 || avgUnpeelPct > 0) {
                    setDashboardsData(prev => {
                        const peelKey = Object.keys(prev).find(k => {
                            const recs = (dData || []).filter((r: any) => r.department_id === k);
                            return recs.length > 0 && recs[0].dept_code === 'PEEL';
                        });
                        if (!peelKey) return prev;
                        return {
                            ...prev,
                            [peelKey]: {
                                ...prev[peelKey],
                                summary: {
                                    ...prev[peelKey].summary,
                                    brokenPct: avgBrokenPct > 0 ? avgBrokenPct : prev[peelKey].summary.brokenPct,
                                    unpeelPct: avgUnpeelPct > 0 ? avgUnpeelPct : prev[peelKey].summary.unpeelPct
                                }
                            }
                        };
                    });
                }
            }
            setPageLoading(false);
        }
        fetchDashboard()
    }, [selectedDept, selectedMonth])

    const handleExportCSV = useCallback(() => {
        let headers = [];
        let rows = [];

        if (selectedDept === 'all') {
            headers = ["Bộ phận", "Plan (Tấn)", "Actual (Tấn)", "% Đạt", "Variance (Tấn)", "Downtime (Phút)"];
            rows = deptData.map(d => {
                const pct = d.Plan > 0 ? ((d.Actual / d.Plan) * 100).toFixed(1) : "0.0";
                const variance = (d.Actual - d.Plan).toFixed(2);
                return `"${d.name}",${d.Plan},${d.Actual},${pct},${variance},${d.Down}`;
            });
        } else {
            const isPack = departments.find(d => d.id === selectedDept)?.code === 'PACK';
            if (isPack) {
                headers = ["Ngày", "Mã BP", "Plan (Tấn)", "Actual (Tấn)", "Plan Cont", "Actual Cont", "Input (Tấn)", "Output (Tấn)", "Downtime (Phút)"];
                rows = dailyRecords.map(d => {
                    return `"${format(new Date(d.work_date), 'dd/MM/yyyy')}",${d.dept_code},${d.plan_ton},${d.actual_ton},${d.plan_container || 0},${d.actual_container || 0},${d.input_ton},${d.good_output_ton},${d.downtime_min}`;
                });
            } else {
                headers = ["Ngày", "Mã BP", "Plan (Tấn)", "Actual (Tấn)", "Input (Tấn)", "Output (Tấn)", "Downtime (Phút)"];
                rows = dailyRecords.map(d => {
                    return `"${format(new Date(d.work_date), 'dd/MM/yyyy')}",${d.dept_code},${d.plan_ton},${d.actual_ton},${d.input_ton},${d.good_output_ton},${d.downtime_min}`;
                });
            }
        }


        const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute("download", `BaoCao_SanLuong_${format(new Date(), "yyyyMMdd")}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [selectedDept, deptData, dailyRecords, departments])


    const renderMiniDashboard = (id: string, name: string, isTotal: boolean = false) => {
        const data = dashboardsData[id];
        if (!data) return null; // Loading or no data
        const { summary, history } = data;

        const isFgwh = id === 'fgwh';

        // Use the dynamically computed remaining planned days to respect "cutoff" limits
        const remainingDays = id === 'virtual-container' ? summary.remainingContWorkingDays : summary.remainingWorkingDays;

        const remainingTarget = Math.max(0, summary.totalPlan - summary.totalActual);
        const dailyNeeded = remainingDays > 0 ? (remainingTarget / remainingDays).toFixed(1) : "0";

        const isReachTonnage = summary.totalActual >= summary.totalPlan && summary.totalPlan > 0;
        const isReached = isReachTonnage;

        const deptCode = id === 'all' ? 'ALL' : (id.startsWith('region-') ? id.replace('region-', '') : (id === 'virtual-container' ? 'CONT' : (departments.find(d => d.id === id)?.code || "ALL")));

        const displayHistory = history.map((h: any) => {
            // For STEAM card: inject Emission data from the all card's history
            let emission = h.Emission;
            if (!emission && deptCode === 'STEAM') {
                const allHistory = dashboardsData['all']?.history || [];
                const allEntry = allHistory.find((a: any) => a.name === h.name);
                emission = allEntry?.Emission || 0;
            }
            return {
                ...h,
                Emission: emission,
                CO2ePerTon: deptCode === 'STEAM' && (h.Actual || 0) > 0 ? Number(((emission || 0) * 1000 / h.Actual).toFixed(2)) : undefined,
                DailyNeeded: id === 'virtual-container' && !isReached && Number(dailyNeeded) > 0 && h.Plan > 0 ? Number(dailyNeeded) : undefined
            };
        });

        const actualNum = summary.totalActual;
        const planNum = summary.totalPlan;
        const unit = id === 'virtual-container' ? "Cont" : "T";
        const variance = actualNum - planNum;



        if (isFgwh) {
            return (
                <Card key={id} className="bg-white/80 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-xl transition-all duration-300 relative overflow-hidden flex flex-col h-full border-l-[4px] border-l-primary">
                    {/* Glossy highlight effect on top edge */}
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent z-10"></div>

                    <CardHeader className="p-3 pb-2 md:p-5 md:pb-3 bg-gradient-to-b from-white/60 to-transparent border-b border-white/40 flex-shrink-0">
                        <CardTitle className="text-lg font-bold flex flex-row flex-wrap justify-between items-start md:items-center gap-2 md:gap-4 text-slate-800">
                            <span className="flex items-center gap-2 whitespace-nowrap">
                                FGWH - Finished Goods
                                <FileSymlink className="h-4 w-4 text-primary" />
                            </span>
                            <div className="flex flex-row flex-wrap items-center gap-4 mt-2 md:mt-0">
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-muted-foreground uppercase mb-0.5">{language === 'vi' ? 'ISP (Thực tế / KH)' : 'ISP (Actual / Plan)'}</span>
                                    <span className="text-lg md:text-xl font-black text-blue-700">{summary.totalActualIsp?.toFixed(1) ?? 0} <span className="text-xs md:text-sm font-normal text-muted-foreground">/ {summary.totalPlanIsp?.toFixed(1) ?? 0} T</span></span>
                                </div>
                                <div className="flex flex-col items-end border-l pl-4 border-gray-200 ml-2">
                                    <span className="text-[10px] text-muted-foreground uppercase mb-0.5">{language === 'vi' ? 'Non-ISP (Thực tế / KH)' : 'Non-ISP (Actual / Plan)'}</span>
                                    <span className="text-lg md:text-xl font-black text-slate-700">{summary.totalActualNonIsp?.toFixed(1) ?? 0} <span className="text-xs md:text-sm font-normal text-muted-foreground">/ {summary.totalPlanNonIsp?.toFixed(1) ?? 0} T</span></span>
                                </div>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-3 md:p-5 md:pt-4 flex-1 flex flex-col">
                        <ChartWrapper className="flex-1">
                            <ResponsiveContainer width="100%" height={220}>
                                <ComposedChart data={displayHistory} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="fgwhGreenGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.95} /><stop offset="100%" stopColor="#059669" stopOpacity={0.75} /></linearGradient>
                                        <linearGradient id="fgwhRedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e63121" stopOpacity={0.95} /><stop offset="100%" stopColor="#b91c1c" stopOpacity={0.75} /></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, dy: 4, fill: '#94a3b8', fontWeight: 500 }} tickLine={false} axisLine={false} height={28} minTickGap={12} tickMargin={5} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)} width={40} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.06)', radius: 4 }} />
                                    <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '11px', paddingTop: '6px', fontWeight: 500 }} />
                                    <Bar dataKey="Actual" name={t('legend.actual')} radius={[3, 3, 0, 0]} animationDuration={900} animationEasing="ease-out">
                                        {history.map((entry: any, index: number) => {
                                            const color = (entry.Plan > 0 && entry.Actual < entry.Plan) ? "url(#fgwhRedGrad)" : "url(#fgwhGreenGrad)";
                                            return <Cell key={`cell-${index}`} fill={color} />;
                                        })}
                                    </Bar>
                                    <Line type="monotone" dataKey="Plan" name={t('legend.plan')} stroke="#94a3b8" strokeDasharray="4 3" dot={false} strokeWidth={1.5} animationDuration={600} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    </CardContent>
                </Card>
            );
        }

        if (id === 'virtual-container') {
            return (
                <Card key={id} className={`bg-white/80 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-xl transition-all duration-300 relative overflow-hidden flex flex-col justify-start h-full border-l-[4px] border-l-[#e63121]`}>
                    {/* Glowing ambient background highlights */}
                    <div className="absolute -top-32 -right-32 w-64 h-64 bg-red-400/20 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-rose-400/10 rounded-full blur-3xl pointer-events-none"></div>

                    <CardHeader className="p-4 md:p-5 bg-white/60 border-b border-red-100/60 flex-shrink-0 relative z-10 backdrop-blur-md">
                        <div className="flex justify-between items-start mb-3 px-1">
                            <span className="flex items-center gap-3 uppercase font-black tracking-tight text-lg md:text-xl text-red-800 drop-shadow-sm">
                                <div className="p-2 bg-gradient-to-br from-red-100 to-rose-50 rounded-xl shadow-inner border border-white/80">
                                    <FileSymlink className="h-5 w-5 text-[#e63121] drop-shadow-sm" />
                                </div>
                                CONTAINER
                            </span>

                            <div className="flex items-center drop-shadow-sm">
                                <span className={`font-black flex items-baseline gap-1 ${summary.achivementPct >= 100 ? 'text-emerald-600' : summary.achivementPct >= 80 ? 'text-amber-600' : 'text-rose-600'} text-2xl md:text-3xl`}>
                                    {summary.achivementPct.toFixed(0)}% <span className="font-bold uppercase text-slate-500 opacity-80 text-xs md:text-sm">MTD</span>
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-2 bg-white/70 rounded-2xl p-3 border border-red-50 shadow-sm backdrop-blur-sm">
                            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-gradient-to-br from-red-50/80 to-white/50 border border-red-100/60 shadow-inner group">
                                <span className="text-[10px] md:text-xs uppercase text-[#e63121] font-bold tracking-widest mb-1.5 opacity-80 group-hover:opacity-100 transition-opacity">MTD / Plan</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="font-black text-red-700 text-xl md:text-2xl drop-shadow-sm">{actualNum.toFixed(1)}</span>
                                    <span className="text-slate-500 text-sm md:text-base font-semibold">/{planNum.toFixed(1)} <span className="text-[10px] uppercase font-normal ml-0.5">Cont</span></span>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-gradient-to-br from-emerald-50/80 to-teal-50/50 border border-emerald-100/60 shadow-inner group">
                                <span className="text-[10px] md:text-xs uppercase text-emerald-700 font-bold tracking-widest mb-1.5 opacity-80 group-hover:opacity-100 transition-opacity">Daily Target</span>
                                <div className={`font-black text-xl md:text-2xl drop-shadow-sm ${isReached ? 'text-emerald-500' : 'text-emerald-600'}`}>
                                    {isReached ? 'Reached 🎉' : `${dailyNeeded} Cont`}
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="flex-1 flex flex-col justify-start p-2 pt-3 md:p-4 md:pt-4 relative z-10">
                        <div className="w-full bg-white/70 rounded-2xl flex-1 min-h-[220px] p-2 border border-red-50 shadow-inner">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={displayHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="contActualGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                                            <stop offset="100%" stopColor="#059669" stopOpacity={0.6} />
                                        </linearGradient>
                                        <linearGradient id="contActualMissGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#e63121" stopOpacity={0.9} />
                                            <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.6} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <defs>
                                        <linearGradient id="actualGreenGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.9} /><stop offset="100%" stopColor="#059669" stopOpacity={0.7} /></linearGradient>
                                        <linearGradient id="actualRedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e63121" stopOpacity={0.9} /><stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} /></linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                        tickFormatter={(val) => {
                                            const day = parseInt(val, 10);
                                            return (!isNaN(day) && (day === 1 || day === 8 || day === 15 || day === 22 || day === 29)) ? val : '';
                                        }}
                                        minTickGap={0}
                                    />
                                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} dx={-10} />

                                    <Tooltip
                                        trigger="hover"
                                        cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }}
                                        content={({ active, payload, label }: any) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-xl p-3.5 text-xs z-50 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200">
                                                        <p className="font-bold text-slate-800 mb-2.5 border-b pb-1.5 uppercase tracking-wider">{label}</p>
                                                        <div className="space-y-1.5">
                                                            {payload.map((entry: any, i: number) => (
                                                                <div key={i} className="flex justify-between items-center gap-6">
                                                                    <span className="text-slate-600 font-medium flex items-center gap-2">
                                                                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: (entry.name === 'Thực tế (Cont)' || entry.name === 'Actual (Cont)') ? '#e63121' : (entry.color || '#334155') }}></div>
                                                                        {entry.name}
                                                                    </span>
                                                                    <span className="font-black text-slate-800">{Number(entry.value).toFixed(1)} Cont</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            }
                                            return null;
                                        }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '15px', fontSize: '12px', fontWeight: 600, color: '#334155' }} iconType="circle" />

                                    {!isReached && Number(dailyNeeded) > 0 && remainingDays > 0 && (
                                        <Line type="step" dataKey="DailyNeeded" stroke="#10b981" strokeDasharray="4 4" dot={false} strokeWidth={2.5} name="Target / Day" connectNulls={false} />
                                    )}

                                    <Bar dataKey="Actual" name={language === 'vi' ? "Thực tế (Cont)" : "Actual (Cont)"} radius={[6, 6, 0, 0]} maxBarSize={45} fill="#10b981" legendType="circle">
                                        {displayHistory.map((entry: any, index: number) => {
                                            const isMiss = entry.Plan > 0 && entry.Actual < entry.Plan;
                                            return <Cell key={`cell-${index}`} fill={isMiss ? "url(#contActualMissGradient)" : "url(#contActualGradient)"} />;
                                        })}
                                    </Bar>

                                    <Line type="step" dataKey="Plan" stroke="#6366f1" strokeDasharray="3 3" dot={false} strokeWidth={2} name={language === 'vi' ? "Kế hoạch (Cont)" : "Plan (Cont)"} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            );
        }

        // ── RCN Warehouse: show stock-by-size bar chart ──────────────────────────
        if (deptCode === 'RCN') {
            return (
                <Card key={id} className="bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-xl transition-all duration-300 relative overflow-hidden flex flex-col justify-start h-full border-l-[4px] border-l-primary">
                    {/* Subtle gradient glow */}
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#e63121]/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-400/5 rounded-full blur-3xl pointer-events-none" />

                    <CardHeader className="p-2 md:p-3 pb-0 md:pb-0 bg-gradient-to-b from-slate-50/80 to-transparent flex-shrink-0 relative z-10">
                        <div className="flex justify-between items-center mb-1">
                            <span className="flex items-center gap-1.5 uppercase font-black tracking-tight text-base md:text-lg text-primary">
                                {name}
                                <FileSymlink className="h-4 w-4 text-primary" />
                            </span>
                        </div>
                    </CardHeader>

                    <CardContent className="flex-1 flex flex-col p-1.5 pt-1 min-h-0 relative z-10">
                        <RCNStockChart />
                    </CardContent>
                </Card>
            )
        }

        return (
            <Card key={id} className={`bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-xl transition-all duration-300 relative overflow-hidden flex flex-col justify-start h-full border-l-[4px] ${isTotal ? 'border-l-primary' : 'border-l-slate-400'}`}>

                {/* Subtle gradient glow in background */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#e63121]/5 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-slate-400/10 rounded-full blur-3xl pointer-events-none"></div>

                <CardHeader className={`${(isTotal || isFgwh) ? 'p-2 md:p-3' : 'p-2'} bg-gradient-to-b from-slate-50/80 to-transparent border-b border-slate-200/50 flex-shrink-0 relative z-10`}>
                    {/* Row 1: dept name + % MTD inline */}
                    <div className="flex justify-between items-center mb-1.5">
                        <span className={`flex items-center gap-1.5 flex-wrap uppercase font-black tracking-tight ${(isTotal || isFgwh) ? 'text-base md:text-lg text-primary' : 'text-base md:text-lg text-slate-800'}`}>
                            {!(isTotal || isFgwh) && <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${summary.achivementPct >= 100 ? 'bg-emerald-500' : summary.achivementPct >= 80 ? 'bg-amber-500' : 'bg-red-500'} shadow-sm`} />}
                            {name}
                            {isTotal && <FileSymlink className="h-4 w-4 text-primary" />}
                            {deptCode === 'SHELL' && summary.brokenPct > 0 && (
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-normal normal-case border ${summary.brokenPct <= 6 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                    💔 {summary.brokenPct.toFixed(1)}% <span className="font-normal opacity-70">{language === 'vi' ? 'bể' : 'broken'}</span>
                                </span>
                            )}
                            {deptCode === 'PEEL' && summary.brokenPct > 0 && (
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-normal normal-case border ${summary.brokenPct <= 20 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                    💔 {summary.brokenPct.toFixed(1)}% <span className="font-normal opacity-70">{language === 'vi' ? 'bể' : 'broken'}</span>
                                </span>
                            )}
                            {deptCode === 'PEEL' && summary.unpeelPct > 0 && (
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-normal normal-case border bg-amber-50 text-amber-700 border-amber-200`}>
                                    🍂 {summary.unpeelPct.toFixed(1)}% <span className="font-normal opacity-70">{language === 'vi' ? 'sót lụa' : 'unpeel'}</span>
                                </span>
                            )}
                        </span>
                        <span className={`font-black flex items-baseline gap-0.5 ${summary.achivementPct >= 100 ? 'text-emerald-600' : summary.achivementPct >= 80 ? 'text-amber-600' : 'text-red-500'} ${'text-xl md:text-2xl'}`}>
                            {summary.achivementPct.toFixed(0)}%
                            <span className={`font-semibold uppercase text-muted-foreground ${'text-[10px] md:text-xs'}`}>MTD</span>
                        </span>
                    </div>

                    {/* Row 2: Stats compact inline */}
                    <div className={`grid ${id === 'virtual-container' ? 'grid-cols-2' : ((deptCode === 'PEEL' && !isTotal) ? 'grid-cols-4' : 'grid-cols-3')} gap-0 divide-x divide-slate-200/60 bg-white/60 rounded-lg border border-slate-100/80`}>
                        <div className="flex flex-col items-center py-1.5 px-1">
                            <span className="text-[9px] md:text-[10px] uppercase text-slate-400 tracking-tight leading-none mb-0.5">{t('stat.mtd_plan')}</span>
                            <div className="flex items-baseline gap-0.5">
                                <span className={`font-bold text-slate-800 ${(isTotal || isFgwh) ? 'text-sm md:text-base' : 'text-xs md:text-sm'}`}>{actualNum.toFixed(1)}</span>
                                <span className={`text-slate-400 text-[9px] md:text-[10px]`}>/{planNum.toFixed(1)}</span>
                            </div>
                        </div>

                        <div className="flex flex-col items-center py-1.5 px-1">
                            <span className="text-[9px] md:text-[10px] uppercase text-slate-400 tracking-tight leading-none mb-0.5">DAILY TARGET</span>
                            <div className={`font-bold ${(isTotal || isFgwh) ? 'text-sm md:text-base' : 'text-xs md:text-sm'} ${isReached ? 'text-emerald-600' : 'text-primary'}`}>
                                {isReached ? '✓ Đạt' : `${dailyNeeded} ${unit}`}
                            </div>
                        </div>

                        {id !== 'virtual-container' && (
                            <div className="flex flex-col items-center py-1.5 px-1">
                                <span className="text-[9px] md:text-[10px] uppercase text-slate-400 tracking-tight leading-none mb-0.5">{t('stat.downtime').toUpperCase()}</span>
                                <div className={`font-bold text-amber-600 ${(isTotal || isFgwh) ? 'text-sm md:text-base' : 'text-xs md:text-sm'}`}>
                                    {(() => {
                                        const totalMin = summary.downtime || 0
                                        const h = Math.floor(totalMin / 60)
                                        const m = totalMin % 60
                                        return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
                                    })()}
                                </div>
                            </div>
                        )}

                        {(deptCode === 'PEEL' && !isTotal) && (
                            <div className="flex flex-col items-center py-1.5 px-1">
                                <span className="text-[9px] md:text-[10px] uppercase text-slate-400 tracking-tight leading-none mb-0.5">{t('stat.compressor')}</span>
                                <div className="font-bold text-purple-600 text-xs md:text-sm">
                                    {((summary.totalCompressorKwhMtd || 0) / 1000).toFixed(0)}<span className="text-[9px] font-normal text-slate-400">MWh</span>
                                </div>
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className={`flex flex-col gap-1 ${deptCode === 'STEAM' ? 'flex-1' : ''} ${(isTotal || isFgwh) ? 'p-2 pt-1 md:p-3 md:pt-2' : 'p-1.5 pt-1'}`}>


                    {/* Fixed-height toggle row — always present so charts align across all cards */}
                    {!(isTotal || isFgwh) && (
                        <div className="h-7 flex items-center">
                            {(["PEEL", "SHELL", "HPEEL", "BORMA", "CS"].includes(deptCode)) && (
                                <div className="flex items-center gap-1 w-full justify-center bg-slate-100/50 rounded-md p-0.5">
                                    <button onClick={() => setDeptViewModes(p => ({ ...p, [id]: 'chart' }))}
                                        className={`text-[9px] uppercase tracking-tighter px-2 py-0.5 rounded shadow-sm transition-all flex-1 ${(!deptViewModes[id] || deptViewModes[id] === 'chart') ? 'bg-white text-slate-800 font-bold border border-slate-200' : 'text-muted-foreground'}`}>
                                        Chart
                                    </button>
                                    <button onClick={() => setDeptViewModes(p => ({ ...p, [id]: 'details' }))}
                                        className={`text-[9px] uppercase tracking-tighter px-2 py-0.5 rounded shadow-sm transition-all flex-1 ${deptViewModes[id] === 'details' ? 'bg-white text-slate-800 font-bold border border-slate-200' : 'text-muted-foreground'}`}>
                                        Details
                                    </button>
                                    {deptCode === 'SHELL' && (
                                        <button onClick={() => setDeptViewModes(p => ({ ...p, [id]: 'lines' }))}
                                            className={`text-[9px] uppercase tracking-tighter px-2 py-0.5 rounded shadow-sm transition-all flex-1 ${deptViewModes[id] === 'lines' ? 'bg-white text-slate-800 font-bold border border-slate-200' : 'text-muted-foreground'}`}>
                                            By Line
                                        </button>
                                    )}
                                    {['CS', 'HPEEL'].includes(deptCode) && (
                                        <button onClick={() => setDeptViewModes(p => ({ ...p, [id]: 'isp' }))}
                                            className={`text-[9px] uppercase tracking-tighter px-2 py-0.5 rounded shadow-sm transition-all flex-1 ${deptViewModes[id] === 'isp' ? 'bg-white text-slate-800 font-bold border border-slate-200' : 'text-muted-foreground'}`}>
                                            ISP
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* CO2e/T info line for STEAM card - hidden */}

                    {/* View Switching Logic */}
                    {!(isTotal || isFgwh) && deptViewModes[id] === 'details' ? (
                        <div className="flex-1 w-full mt-auto bg-slate-50/80 rounded-md border border-slate-100 p-2 grid grid-cols-2 gap-2 content-center items-center">
                            {["PEEL", "SHELL"].includes(deptCode) && (
                                <div>
                                    <p className="text-[9px] text-muted-foreground mb-0.5">{language === 'vi' ? 'Tỷ lệ Bể (%)' : 'Broken (%)'}</p>
                                    <div className="font-bold text-red-600 text-[11px]">{summary.brokenPct.toFixed(1)}%</div>
                                </div>
                            )}
                            {deptCode === "SHELL" && (
                                <>
                                    <div>
                                        <p className="text-[9px] text-muted-foreground mb-0.5">{language === 'vi' ? 'Điện (kWh)' : 'Elec (kWh)'}</p>
                                        <div className="font-bold text-amber-600 text-[11px]">{summary.totalElectricityConsumption?.toLocaleString()} / {summary.totalTargetElectricityKwh?.toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-muted-foreground mb-0.5">{language === 'vi' ? 'kWh / Tấn' : 'kWh / Ton'}</p>
                                        <div className="font-bold text-amber-700 text-[11px]">{summary.totalActual > 0 ? (summary.totalElectricityConsumption / summary.totalActual).toFixed(2) : "0.00"}</div>
                                    </div>
                                </>
                            )}
                            {["PEEL"].includes(deptCode) && (
                                <div>
                                    <p className="text-[9px] text-muted-foreground mb-0.5">{language === 'vi' ? 'Sót lụa (%)' : 'Unpeeled (%)'}</p>
                                    <div className="font-bold text-orange-600 text-[11px]">{summary.unpeelPct.toFixed(1)}%</div>
                                </div>
                            )}
                            {["HPEEL"].includes(deptCode) && (
                                <div>
                                    <p className="text-[9px] text-muted-foreground mb-0.5">Tỷ lệ ISP (%)</p>
                                    <div className="font-bold text-blue-600 text-[11px]">{summary.ispPct.toFixed(1)}%</div>
                                </div>
                            )}
                            {["BORMA"].includes(deptCode) && (
                                <div>
                                    <p className="text-[9px] text-muted-foreground mb-0.5">Tỷ lệ SW (%)</p>
                                    <div className="font-bold text-amber-700 text-[11px]">{summary.swPct.toFixed(1)}%</div>
                                </div>
                            )}
                            {['CS', 'HPEEL'].includes(deptCode) && (
                                <div className="col-span-2 p-1 bg-blue-50/50 border border-blue-100 rounded flex justify-between items-center">
                                    <span className="text-blue-800 font-bold text-[9px]">ISP (Thực tế/KH):</span>
                                    <span className="font-black text-blue-600 text-[11px]">{summary.totalActualIspCS?.toFixed(1) || 0} / {summary.totalPlanIsp?.toFixed(1) || 100} T ({summary.totalPlanIsp > 0 ? ((summary.totalActualIspCS || 0) / summary.totalPlanIsp * 100).toFixed(1) : 0}%)</span>
                                </div>
                            )}
                        </div>
                    ) : deptCode === "SHELL" && deptViewModes[id] === 'lines' ? (
                        <div className="w-full mt-auto border-t pt-2 space-y-1.5 flex-1 flex flex-col justify-center">
                            {deptCode === 'SHELL' && (
                                <div className="flex items-center gap-1 mb-1">
                                    <button onClick={() => setShellingSubView('production')}
                                        className={`text-[9px] px-2 py-0.5 rounded border transition-all ${shellingSubView === 'production' ? 'bg-slate-700 text-white border-slate-700' : 'border-gray-300 text-muted-foreground'}`}>
                                        {language === 'vi' ? '📊 Sản lượng MTD' : '📊 Production MTD'}
                                    </button>
                                    <button onClick={() => setShellingSubView('capacity')}
                                        className={`text-[9px] px-2 py-0.5 rounded border transition-all ${shellingSubView === 'capacity' ? 'bg-slate-700 text-white border-slate-700' : 'border-gray-300 text-muted-foreground'}`}>
                                        {language === 'vi' ? '⚡ Công suất' : '⚡ Capacity'}
                                    </button>
                                </div>
                            )}

                            {shellingSubView === 'production' ? (
                                SHELLING_LINES_DASH.map(line => {
                                    const lc: Record<string, string> = { A: '#3b82f6', B: '#10b981', C: '#f59e0b', D1: '#ef4444', D2: '#8b5cf6' }
                                    const ld = shellingLineMonthData[line] || { actual_ton: 0, run_hours: 0 }
                                    const eff = ld.run_hours > 0 ? (ld.actual_ton / ld.run_hours).toFixed(2) : '—'
                                    const pct = summary.totalActual > 0 ? Math.min(100, (ld.actual_ton / summary.totalActual) * 100) : 0
                                    const color = lc[line] || '#64748b'
                                    return (
                                        <div key={line} className="flex items-center gap-2">
                                            <span className="text-[10px] font-black w-5 text-center shrink-0" style={{ color }}>{line}</span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
                                            </div>
                                            <span className="text-[10px] font-bold w-11 text-right shrink-0" style={{ color }}>{ld.actual_ton.toFixed(1)}T</span>
                                            <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{ld.run_hours.toFixed(0)}h</span>
                                            <span className="text-[10px] font-bold text-emerald-700 w-14 text-right shrink-0">{eff !== '—' ? eff + ' T/h' : '—'}</span>
                                        </div>
                                    )
                                })
                            ) : (() => {
                                const designCapDay: Record<string, number> = { A: 33.6, B: 43.2, C: 36.0, D1: 28.8, D2: 28.8 }
                                const lc: Record<string, string> = { A: '#3b82f6', B: '#10b981', C: '#f59e0b', D1: '#ef4444', D2: '#8b5cf6' }
                                const daysElapsed = Math.max(1, displayHistory.filter((d: any) => d.Actual > 0).length)
                                return (
                                    <>
                                        {SHELLING_LINES_DASH.map(line => {
                                            const ld = shellingLineMonthData[line] || { actual_ton: 0, run_hours: 0 }
                                            const design = designCapDay[line]
                                            const actualPerDay = ld.actual_ton / daysElapsed
                                            const capPct = design > 0 ? Math.min(150, (actualPerDay / design) * 100) : 0
                                            const barColor = capPct >= 90 ? '#22c55e' : capPct >= 60 ? '#f59e0b' : '#ef4444'
                                            const lineColor = lc[line] || '#64748b'
                                            return (
                                                <div key={line} className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black w-5 text-center shrink-0" style={{ color: lineColor }}>{line}</span>
                                                    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                                        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(100, capPct)}%`, backgroundColor: barColor }} />
                                                    </div>
                                                    <span className="text-[10px] font-bold w-14 text-right shrink-0" style={{ color: barColor }}>
                                                        {actualPerDay.toFixed(1)}<span className="font-normal text-muted-foreground">/{design}T</span>
                                                    </span>
                                                    <span className="text-[10px] font-bold w-9 text-right shrink-0" style={{ color: barColor }}>
                                                        {capPct.toFixed(0)}%
                                                    </span>
                                                </div>
                                            )
                                        })}
                                        <div className="text-[8px] text-muted-foreground pt-1 border-t flex justify-between">
                                            <span>Thực tế TB/Ngày vs Thiết kế (T/ngày)</span>
                                            <span>{daysElapsed} ngày có SL</span>
                                        </div>
                                    </>
                                )
                            })()}
                        </div>
                    ) : ['CS', 'HPEEL'].includes(deptCode) && deptViewModes[id] === 'isp' ? (
                        <ChartWrapper className={`w-full rounded-xl border-t h-[160px] md:h-[200px] bg-gradient-to-b from-slate-50/20 to-transparent`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={displayHistory} margin={{ top: 8, right: 6, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 10, dy: 4, fill: '#94a3b8', fontWeight: 500 }}
                                        tickLine={false}
                                        axisLine={false}
                                        height={22}
                                        tickFormatter={(val) => {
                                            const day = parseInt(val, 10);
                                            if (!isNaN(day) && (day === 1 || day === 8 || day === 15 || day === 22 || day === 29)) {
                                                return val;
                                            }
                                            return '';
                                        }}
                                        interval={0}
                                        tickMargin={4}
                                    />
                                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(0)} width={28} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(139, 92, 246, 0.08)' }} />
                                    {deptCode === 'HPEEL' ? (
                                        <>
                                            <Line
                                                type="monotone"
                                                dataKey="IspActual"
                                                name="ISP Thực tế (T)"
                                                stroke="#8b5cf6"
                                                strokeWidth={2.5}
                                                dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
                                                activeDot={{ r: 5, fill: '#8b5cf6', strokeWidth: 0 }}
                                                animationDuration={800}
                                                animationEasing="ease-out"
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="IspPlan"
                                                name="ISP Kế hoạch"
                                                stroke="#c4b5fd"
                                                strokeDasharray="4 3"
                                                strokeWidth={1.5}
                                                dot={false}
                                                animationDuration={600}
                                            />
                                            <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', paddingTop: '4px', fontWeight: 600, color: '#64748b' }} iconType="plainline" />
                                        </>
                                    ) : (
                                        <>
                                            <defs>
                                                <linearGradient id="ispGreenGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.95} /><stop offset="100%" stopColor="#059669" stopOpacity={0.7} /></linearGradient>
                                                <linearGradient id="ispRedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e63121" stopOpacity={0.95} /><stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} /></linearGradient>
                                            </defs>
                                            <Bar dataKey="IspActual" name="ISP Thực tế (T)" radius={[3, 3, 0, 0]} animationDuration={900} animationEasing="ease-out" legendType="none">
                                                {displayHistory.map((entry: any, index: number) => {
                                                    const color = (entry.IspPlan > 0 && entry.IspActual < entry.IspPlan) ? "url(#ispRedGrad)" : "url(#ispGreenGrad)";
                                                    return <Cell key={`isp-cell-${index}`} fill={color} />;
                                                })}
                                            </Bar>
                                            <Line type="monotone" dataKey="IspPlan" stroke="#94a3b8" strokeDasharray="4 3" dot={false} strokeWidth={1.5} name="ISP Kế hoạch" animationDuration={600} />
                                            <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', paddingTop: '4px', fontWeight: 600, color: '#64748b' }} iconType="plainline" />
                                        </>
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    ) : (
                        <ChartWrapper className={`w-full rounded-xl border-t ${deptCode === 'STEAM' ? 'flex-1 min-h-[220px]' : 'h-[140px] md:h-[160px]'} bg-gradient-to-b from-slate-50/20 to-transparent`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={displayHistory} margin={{ top: 10, right: 8, left: 0, bottom: 5 }}>
                                    <defs>
                                        <linearGradient id="mainGreenGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.95} /><stop offset="100%" stopColor="#059669" stopOpacity={0.75} /></linearGradient>
                                        <linearGradient id="mainRedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e63121" stopOpacity={0.95} /><stop offset="100%" stopColor="#b91c1c" stopOpacity={0.75} /></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11, dy: 4, fill: '#94a3b8', fontWeight: 500 }}
                                        tickLine={false}
                                        axisLine={false}
                                        height={24}
                                        tickFormatter={(val) => {
                                            const day = parseInt(val, 10);
                                            if (!isNaN(day) && (day === 1 || day === 8 || day === 15 || day === 22 || day === 29)) {
                                                return val;
                                            }
                                            return '';
                                        }}
                                        interval={0}
                                        tickMargin={5}
                                    />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)} width={40} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.06)', radius: 4 }} />
                                    {id === 'virtual-container' && !isReached && Number(dailyNeeded) > 0 && remainingDays > 0 && (
                                        <Line type="step" dataKey="DailyNeeded" stroke="#10b981" strokeDasharray="3 3" dot={false} strokeWidth={2} name={t('legend.daily_needed')} connectNulls={false} animationDuration={600} />
                                    )}
                                    {(deptCode === "SHELL" || deptCode === "PEEL") && (
                                        <>
                                            <YAxis yAxisId="intensity" orientation="right" tick={{ fontSize: 10, fill: '#f59e0b', fontWeight: 600 }} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => v.toFixed(0)} />
                                            <Line yAxisId="intensity" type="monotone" dataKey="Intensity" stroke="#f59e0b" dot={false} strokeWidth={2} name={t('legend.intensity')} animationDuration={700} />
                                        </>
                                    )}
                                    <Bar dataKey="Actual" name={t('legend.actual')} radius={[3, 3, 0, 0]} animationDuration={900} animationEasing="ease-out" legendType="none">
                                        {displayHistory.map((entry: any, index: number) => {
                                            const color = (entry.Plan > 0 && entry.Actual < entry.Plan) ? "url(#mainRedGrad)" : "url(#mainGreenGrad)";
                                            return <Cell key={`cell-${index}`} fill={color} />;
                                        })}
                                    </Bar>
                                    <Line type="monotone" dataKey="Plan" stroke="#94a3b8" strokeDasharray="4 3" dot={false} strokeWidth={1.5} name={t('legend.plan')} animationDuration={600} legendType="none" />

                                    {deptCode === "HPEEL" && (
                                        <Line
                                            type="monotone"
                                            dataKey="IspActual"
                                            name="ISP (T)"
                                            stroke="#8b5cf6"
                                            strokeWidth={2}
                                            dot={{ r: 2.5, fill: '#8b5cf6', strokeWidth: 0 }}
                                            activeDot={{ r: 4.5, fill: '#8b5cf6', strokeWidth: 0 }}
                                            animationDuration={800}
                                            animationEasing="ease-out"
                                        />
                                    )}

                                    {deptCode === "ALL" && (
                                        <>
                                            <YAxis yAxisId="emission" orientation="right" hide />
                                            <Line yAxisId="emission" type="monotone" dataKey="Emission" stroke="#e63121" dot={false} strokeWidth={2} name={t('legend.emission')} animationDuration={700} />
                                        </>
                                    )}
                                    {/* CO2e/T chart line for STEAM - hidden */}
                                    {(deptCode === "HPEEL" || deptCode === "SHELL" || deptCode === "PEEL" || deptCode === "ALL" || deptCode === "STEAM" || isTotal || isFgwh) && (
                                        <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', paddingTop: '4px', fontWeight: 600, color: '#64748b' }} iconType="plainline" />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    )}
                </CardContent>
            </Card>
        );
    };

    return (
        <>
            <DashboardLoader
                isLoading={pageLoading}
                deptCode={userProfile?.deptCode}
                userName={userProfile?.userName}
            />
            <div
                className="flex-col md:flex w-full relative z-0"
                style={{
                    opacity: pageLoading ? 0 : 1,
                    transform: pageLoading ? 'translateY(12px)' : 'translateY(0)',
                    transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
                }}
            >
                {/* Ambient Background Gradient for Glassmorphism to pop out */}
                <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-emerald-50 pointer-events-none -z-10"></div>

                <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-2 md:space-y-0 pb-2 md:pb-4 mb-2 md:mb-4 backdrop-blur-sm sticky top-0 z-40 bg-white/40 border-b border-white/60 rounded-b-2xl px-2">
                        <div>
                            <h2 className="text-xl md:text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-500 drop-shadow-sm">{t('command_center')}</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
                            <TabsList>
                                <TabsTrigger value="stations">{t('tab_stations')}</TabsTrigger>
                                <TabsTrigger value="regions">{t('tab_regions')}</TabsTrigger>
                                <TabsTrigger value="overview">⚡ Overview</TabsTrigger>
                            </TabsList>
                            <div className="flex space-x-2">
                                {/* Month selector */}
                                <Select
                                    value={String(selectedMonth.getMonth() + 1)}
                                    onValueChange={(val) => {
                                        const d = new Date(selectedMonth)
                                        d.setMonth(Number(val) - 1)
                                        setSelectedMonth(d)
                                    }}
                                >
                                    <SelectTrigger className="w-[110px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: 12 }, (_, i) => (
                                            <SelectItem key={i + 1} value={String(i + 1)}>
                                                Tháng {i + 1}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {/* Year selector */}
                                <Select
                                    value={String(selectedMonth.getFullYear())}
                                    onValueChange={(val) => {
                                        const d = new Date(selectedMonth)
                                        d.setFullYear(Number(val))
                                        setSelectedMonth(d)
                                    }}
                                >
                                    <SelectTrigger className="w-[90px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[2024, 2025, 2026, 2027].map(y => (
                                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={selectedDept} onValueChange={setSelectedDept}>
                                    <SelectTrigger className="w-[180px] hidden md:flex">
                                        <SelectValue placeholder={t('dropdown_placeholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('all_factory')}</SelectItem>
                                        {departments.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name_en}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" onClick={handleExportCSV}>
                                    <Download className="h-4 w-4 mr-2" />
                                    {t('export_btn')} <span className="hidden sm:inline">&nbsp;CSV</span>
                                </Button>
                            </div>
                        </div>
                    </div>

                    {selectedDept === 'all' && selectedTab !== 'overview' && (
                        <FadeInStagger faster>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 mt-2">
                                <FadeIn>
                                    {(() => {
                                        const pct = kpiSummary.steamTarget > 0
                                            ? (kpiSummary.steamActual / kpiSummary.steamTarget) * 100 : 0
                                        const isGood = pct >= 100
                                        const barColor = isGood ? '#10b981' : pct >= 85 ? '#f59e0b' : '#e63121'
                                        return (
                                            <div className="flex flex-col justify-between p-3 md:px-5 md:py-4 bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all h-full gap-2">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-[10px] md:text-xs font-bold text-slate-500 tracking-widest uppercase">Hấp / Steam</span>
                                                    <BadgePulse
                                                        label={isGood ? 'Đạt KH' : 'Chưa đạt'}
                                                        color={isGood ? 'green' : 'red'}
                                                    />
                                                </div>
                                                {/* Big value */}
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">
                                                        <AnimatedNumber value={kpiSummary.steamActual} />
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 font-medium">
                                                        / {Number(kpiSummary.steamTarget).toLocaleString(undefined, { maximumFractionDigits: 1 })} T
                                                    </span>
                                                </div>
                                                {/* Progress bar with % label */}
                                                <div className="w-full">
                                                    <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-[1200ms] ease-out"
                                                            style={{
                                                                width: `${Math.min(pct, 100)}%`,
                                                                background: isGood
                                                                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                                                                    : pct >= 85
                                                                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                                                        : 'linear-gradient(90deg, #e63121, #f87171)',
                                                            }}
                                                        />
                                                        <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)', animation: 'shimmer 2s infinite', backgroundSize: '200% 100%' }} />
                                                    </div>
                                                    <div className="flex justify-end mt-1">
                                                        <span className="text-[10px] font-black tabular-nums" style={{ color: barColor }}>{pct.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </FadeIn>
                                <FadeIn>
                                    {(() => {
                                        const pct = kpiSummary.contTarget > 0
                                            ? (kpiSummary.contActual / kpiSummary.contTarget) * 100 : 0
                                        const isGood = pct >= 100
                                        const barColor = isGood ? '#10b981' : pct >= 85 ? '#f59e0b' : '#e63121'
                                        return (
                                            <div className="flex flex-col justify-between p-3 md:px-5 md:py-4 bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all h-full gap-2">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-[10px] md:text-xs font-bold text-slate-500 tracking-widest uppercase">Container</span>
                                                    <BadgePulse
                                                        label={isGood ? 'Đạt KH' : 'Chưa đạt'}
                                                        color={isGood ? 'blue' : 'yellow'}
                                                    />
                                                </div>
                                                {/* Big value */}
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">
                                                        <AnimatedNumber value={kpiSummary.contActual} />
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 font-medium">
                                                        / {Number(kpiSummary.contTarget).toLocaleString(undefined, { maximumFractionDigits: 1 })} Cont
                                                    </span>
                                                </div>
                                                {/* Progress bar with % label */}
                                                <div className="w-full">
                                                    <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-[1200ms] ease-out"
                                                            style={{
                                                                width: `${Math.min(pct, 100)}%`,
                                                                background: isGood
                                                                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                                                                    : pct >= 85
                                                                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                                                        : 'linear-gradient(90deg, #e63121, #f87171)',
                                                            }}
                                                        />
                                                        <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)', animation: 'shimmer 2s infinite', backgroundSize: '200% 100%' }} />
                                                    </div>
                                                    <div className="flex justify-end mt-1">
                                                        <span className="text-[10px] font-black tabular-nums" style={{ color: barColor }}>{pct.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </FadeIn>
                                <FadeIn className="col-span-2 sm:col-span-1">
                                    {(() => {
                                        const co2Pct = kpiSummary.totalEmissionTarget > 0
                                            ? (kpiSummary.totalEmission / kpiSummary.totalEmissionTarget) * 100
                                            : 0
                                        const isGood = co2Pct <= 100
                                        const barColor = isGood ? '#10b981' : '#e63121'


                                        return (
                                            <div className="flex flex-col justify-between p-3 md:px-5 md:py-4 bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all h-full gap-2">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-[10px] md:text-xs font-bold text-slate-500 tracking-widest uppercase">CO₂e (Scope 1+2)</span>
                                                    <BadgePulse
                                                        label={isGood ? 'Trong mục tiêu' : 'Vượt mục tiêu'}
                                                        color={isGood ? 'green' : 'red'}
                                                    />
                                                </div>
                                                {/* Big percentage */}
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-2xl md:text-3xl font-black tracking-tighter" style={{ color: barColor }}>
                                                        {co2Pct.toFixed(1)}%
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-medium">/ 100% target</span>
                                                </div>
                                                {/* Animated progress bar */}
                                                <div className="w-full">
                                                    <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-[1200ms] ease-out"
                                                            style={{
                                                                width: `${Math.min(co2Pct, 100)}%`,
                                                                background: isGood
                                                                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                                                                    : 'linear-gradient(90deg, #e63121, #f87171)',
                                                            }}
                                                        />
                                                        {/* Shimmer effect */}
                                                        <div
                                                            className="absolute inset-0 rounded-full"
                                                            style={{
                                                                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                                                                animation: 'shimmer 2s infinite',
                                                                backgroundSize: '200% 100%',
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between mt-1">
                                                        <span className="text-[9px] text-slate-400">
                                                            {kpiSummary.totalEmission.toFixed(1)} T CO₂e
                                                        </span>
                                                        <span className="text-[9px] text-slate-400">
                                                            Target: {kpiSummary.totalEmissionTarget} T
                                                        </span>
                                                    </div>
                                                </div>

                                            </div>
                                        )
                                    })()}
                                </FadeIn>
                            </div>
                        </FadeInStagger>
                    )}


                    <TabsContent value="stations" className="mt-0 pt-2">
                        <FadeInStagger faster>
                            {/* TOP 2 WIDGETS: RCN Warehouse & Container */}
                            <div className="mb-3 md:mb-4 grid gap-3 md:gap-4 grid-cols-1 lg:grid-cols-2">
                                <FadeIn className="lg:col-span-1 h-full">
                                    {renderMiniDashboard(
                                        departments.find(d => d.code === 'RCN')?.id || 'region-RCN',
                                        t('region_rcn') || 'RCN WAREHOUSE'
                                    )}
                                </FadeIn>
                                <FadeIn className="lg:col-span-1 h-full">
                                    {renderMiniDashboard("virtual-container", "Container")}
                                </FadeIn>
                            </div>

                            {/* MID WIDGETS: Chronological workflow order */}
                            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {['STEAM', 'SHELL', 'BORMA', 'PEEL', 'CS', 'HPEEL', 'PACK'].map((code) => {
                                    const d = departments.find(d => d.code === code);
                                    if (!d) return null;

                                    // Dynamic name for steaming based on language mapping
                                    const displayName = code === 'STEAM' && language === 'vi' ? 'Hấp / Steaming' : d.name_en;

                                    return (
                                        <FadeIn key={d.id} className="h-full">
                                            {renderMiniDashboard(d.id, displayName)}
                                        </FadeIn>
                                    );
                                })}

                                {/* BOTTOM WIDGET: FGWH Finished Goods */}
                                <FadeIn className="h-full sm:col-span-2 lg:col-span-1 xl:col-span-2 2xl:col-span-1">
                                    {renderMiniDashboard("fgwh", "FGWH - Finished Goods", true)}
                                </FadeIn>
                            </div>
                        </FadeInStagger>
                    </TabsContent>

                    <TabsContent value="regions" className="mt-0 pt-2">
                        <FadeInStagger faster>
                            <div className="grid gap-3 md:gap-4 grid-cols-1 lg:grid-cols-3">
                                <FadeIn className="h-full">{renderMiniDashboard("region-RCN", t('region_rcn'), true)}</FadeIn>
                                <FadeIn className="h-full">{renderMiniDashboard("region-LCA", t('region_lca'), true)}</FadeIn>
                                <FadeIn className="h-full">{renderMiniDashboard("region-HCA", t('region_hca'), true)}</FadeIn>
                            </div>
                        </FadeInStagger>
                    </TabsContent>

                    <TabsContent value="overview" className="mt-0 pt-0">
                        <OverviewTab
                            selectedMonth={selectedMonth}
                            departments={departments}
                            dashboardsData={dashboardsData}
                            kpiSummary={kpiSummary}
                            seuData={{
                                elecKwh: kpiSummary.elecActual,
                                mnkKwh: otherElecSummary.compressorKwh,
                                shellingKwh: otherElecSummary.shellingKwh,
                                woodKg: kpiSummary.woodActual,
                                // RCN = Steam department input (total RCN steamed this month)
                                rcnTons: dashboardsData['region-RCN']?.summary?.totalActual || 0,
                                // Peeling tons = PEEL actual
                                peelingTons: (() => {
                                    const peelId = departments.find(d => d.code === 'PEEL')?.id
                                    return peelId ? (dashboardsData[peelId]?.summary?.totalActual || 0) : 0
                                })(),
                                // Shelling tons = SHELL actual
                                shellingTons: (() => {
                                    const shellId = departments.find(d => d.code === 'SHELL')?.id
                                    return shellId ? (dashboardsData[shellId]?.summary?.totalActual || 0) : 0
                                })(),
                                // ISO 50001 baselines (from natural-resources-report/index.html store object)
                                elecTarget: 248.94,   // kWh / RCN ton
                                mnkTarget: 281.4,     // kWh / peeling ton
                                shellingTarget: 0.0402, // kWh / kg shelling output
                                woodTarget: 0.08,       // kg wood / kg RCN
                            }}
                        />
                    </TabsContent>
                </Tabs>

                {
                    selectedDept === 'all' && energyHistory.length > 0 && (
                        <Card className="mt-3 md:mt-4 bg-white border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-blue-500/5 pointer-events-none"></div>
                            <CardHeader className="p-3 pb-2 md:p-5 md:pb-3 bg-white/40 border-b border-white/50 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <CardTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                                    Theo dõi Điện - Nước - Củi ({format(selectedMonth, 'MM/yyyy')})
                                </CardTitle>
                                <div className="flex flex-wrap items-center gap-4 md:gap-6 bg-white/50 px-4 py-2 rounded-lg border border-white/80 shadow-sm">
                                    <div className="flex flex-col items-start md:items-end">
                                        <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-tight">Điện (kWh)</span>
                                        <span className="text-sm font-black text-amber-600">{Number(kpiSummary.elecActual).toLocaleString()} <span className="text-[11px] text-muted-foreground font-medium">/ {Number(kpiSummary.elecTarget).toLocaleString()}</span></span>
                                    </div>
                                    <div className="hidden sm:block w-px h-8 bg-slate-200"></div>
                                    <div className="flex flex-col items-start md:items-end">
                                        <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-tight">Nước (m³)</span>
                                        <span className="text-sm font-black text-blue-600">{Number(kpiSummary.waterActual).toLocaleString()} <span className="text-[11px] text-muted-foreground font-medium">/ {Number(kpiSummary.waterTarget).toLocaleString()}</span></span>
                                    </div>
                                    <div className="hidden sm:block w-px h-8 bg-slate-200"></div>
                                    <div className="flex flex-col items-start md:items-end">
                                        <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-tight">Củi (Tấn)</span>
                                        <span className="text-sm font-black text-orange-600">{Number(kpiSummary.woodActual).toLocaleString()} <span className="text-[11px] text-muted-foreground font-medium">/ {Number(kpiSummary.woodTarget).toLocaleString()}</span></span>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-2 pt-4 md:p-5 md:pt-4 relative z-10">
                                {/* DESKTOP VIEW: Combined Chart with 3 Y-Axes */}
                                <div className="hidden md:block h-80 w-full pb-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={energyHistory} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <defs>
                                                <linearGradient id="actualGreenGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.9} /><stop offset="100%" stopColor="#059669" stopOpacity={0.7} /></linearGradient>
                                                <linearGradient id="actualRedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e63121" stopOpacity={0.9} /><stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} /></linearGradient>
                                            </defs>
                                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                            <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="#eab308" />
                                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="#3b82f6" />
                                            <YAxis yAxisId="right2" orientation="right" tick={{ fontSize: 12 }} stroke="#f97316" width={80} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} trigger="hover" />
                                            <Legend wrapperStyle={{ bottom: -5, fontSize: '11px' }} />
                                            <Bar yAxisId="left" dataKey="ElectricityActual" name="Điện (kWh)" fill="#eab308" radius={[4, 4, 0, 0]} barSize={20} />
                                            <Line yAxisId="left" type="monotone" dataKey="ElectricityTarget" name="Target Điện" stroke="#ca8a04" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                                            <Bar yAxisId="right" dataKey="WaterActual" name="Nước (m³)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                                            <Line yAxisId="right" type="monotone" dataKey="WaterTarget" name="Target Nước" stroke="#2563eb" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                                            <Bar yAxisId="right2" dataKey="WoodActual" name="Củi (Tấn)" fill="#f97316" radius={[4, 4, 0, 0]} barSize={20} />
                                            <Line yAxisId="right2" type="monotone" dataKey="WoodTarget" name="Target Củi" stroke="#c2410c" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                                            <YAxis yAxisId="emission" orientation="right" tick={{ fontSize: 12 }} stroke="#10b981" width={60} />
                                            <Line yAxisId="emission" type="monotone" dataKey="Emission" name="Phát thải (TCO₂e)" stroke="#10b981" strokeWidth={3} dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* MOBILE VIEW: 3 Separate Charts for better readability */}
                                <div className="md:hidden flex flex-col gap-10 py-4">
                                    {/* Electricity Chart */}
                                    <div className="h-48 w-full">
                                        <p className="text-xs font-bold text-amber-600 mb-2 uppercase tracking-tight">Electricity Chart (kWh)</p>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={energyHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <defs>
                                                    <linearGradient id="actualGreenGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.9} /><stop offset="100%" stopColor="#059669" stopOpacity={0.7} /></linearGradient>
                                                    <linearGradient id="actualRedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e63121" stopOpacity={0.9} /><stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} /></linearGradient>
                                                </defs>
                                                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                                <YAxis tick={{ fontSize: 9 }} stroke="#eab308" />
                                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} trigger="hover" />
                                                <Bar dataKey="ElectricityActual" name={t('legend.actual')} fill="#eab308" radius={[2, 2, 0, 0]} barSize={12} />
                                                <Line type="monotone" dataKey="ElectricityTarget" name="Mục tiêu" stroke="#ca8a04" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Water Chart */}
                                    <div className="h-48 w-full">
                                        <p className="text-xs font-bold text-blue-600 mb-2 uppercase tracking-tight">Water Chart (m³)</p>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={energyHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <defs>
                                                    <linearGradient id="actualGreenGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.9} /><stop offset="100%" stopColor="#059669" stopOpacity={0.7} /></linearGradient>
                                                    <linearGradient id="actualRedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e63121" stopOpacity={0.9} /><stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} /></linearGradient>
                                                </defs>
                                                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                                <YAxis tick={{ fontSize: 9 }} stroke="#3b82f6" />
                                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} trigger="hover" />
                                                <Bar dataKey="WaterActual" name={t('legend.actual')} fill="#3b82f6" radius={[2, 2, 0, 0]} barSize={12} />
                                                <Line type="monotone" dataKey="WaterTarget" name="Mục tiêu" stroke="#2563eb" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Wood Chart */}
                                    <div className="h-48 w-full">
                                        <p className="text-xs font-bold text-orange-600 mb-2 uppercase tracking-tight">Wood Chart (Tons)</p>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={energyHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <defs>
                                                    <linearGradient id="actualGreenGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.9} /><stop offset="100%" stopColor="#059669" stopOpacity={0.7} /></linearGradient>
                                                    <linearGradient id="actualRedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e63121" stopOpacity={0.9} /><stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} /></linearGradient>
                                                </defs>
                                                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                                <YAxis tick={{ fontSize: 9 }} stroke="#f97316" />
                                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} trigger="hover" />
                                                <Bar dataKey="WoodActual" name={t('legend.actual')} fill="#f97316" radius={[2, 2, 0, 0]} barSize={12} />
                                                <Line type="monotone" dataKey="WoodTarget" name="Mục tiêu" stroke="#c2410c" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Emission Chart */}
                                    <div className="h-48 w-full">
                                        <p className="text-xs font-bold text-emerald-600 mb-2 uppercase tracking-tight">Cacbon (TCO₂e)</p>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={energyHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                                <YAxis tick={{ fontSize: 9 }} stroke="#10b981" />
                                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} trigger="hover" />
                                                <Line type="monotone" dataKey="Emission" name="Phát thải" stroke="#10b981" strokeWidth={3} dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                }

                {/* ⚡ Sub-Energy Summary: Điện Shelling / MNK / Củi / Peeling */}
                {selectedDept === 'all' && (shellingElecHistory.length > 0 || compressorHistory.length > 0) && (
                    <div className="mt-3 md:mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">

                        {/* KPI Cards — top row: 4 energy items */}
                        <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {/* Điện Shelling */}
                            <div className="flex flex-col gap-1.5 p-3 md:p-4 bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 tracking-widest uppercase">⚡ Điện Shelling</span>
                                <span className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter">
                                    {otherElecSummary.shellingKwh.toLocaleString('vi-VN')}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">kWh MTD</span>
                                <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden mt-1">
                                    <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500" style={{ width: '100%' }} />
                                </div>
                            </div>

                            {/* Máy nén khí total */}
                            <div className="flex flex-col gap-1.5 p-3 md:p-4 bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 tracking-widest uppercase">🔧 Máy nén khí</span>
                                <span className="text-xl md:text-2xl font-black text-purple-700 tracking-tighter">
                                    {otherElecSummary.compressorKwh.toLocaleString('vi-VN')}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">kWh MTD (3 cụm)</span>
                                <div className="h-1.5 bg-purple-100 rounded-full overflow-hidden mt-1">
                                    <div className="h-full rounded-full bg-gradient-to-r from-purple-400 to-violet-500" style={{ width: '100%' }} />
                                </div>
                            </div>

                            {/* Củi */}
                            <div className="flex flex-col gap-1.5 p-3 md:p-4 bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 tracking-widest uppercase">🪵 Củi (Biomass)</span>
                                <span className="text-xl md:text-2xl font-black text-orange-700 tracking-tighter">
                                    {(kpiSummary.woodActual / 1000).toFixed(1)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">
                                    Tấn MTD / {(kpiSummary.woodTarget / 1000).toFixed(1)} T KH
                                </span>
                                <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden mt-1">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-600"
                                        style={{ width: `${Math.min(kpiSummary.woodTarget > 0 ? (kpiSummary.woodActual / kpiSummary.woodTarget) * 100 : 0, 100)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Peeling Compressor */}
                            <div className="flex flex-col gap-1.5 p-3 md:p-4 bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 tracking-widest uppercase">🧊 Điện Peeling</span>
                                <span className="text-xl md:text-2xl font-black text-cyan-700 tracking-tighter">
                                    {otherElecSummary.peelingCompKwh > 0 ? otherElecSummary.peelingCompKwh.toLocaleString('vi-VN') : '—'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">kWh MTD (DB-AC HCA)</span>
                                <div className="h-1.5 bg-cyan-100 rounded-full overflow-hidden mt-1">
                                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-500" style={{ width: '100%' }} />
                                </div>
                            </div>
                        </div>

                        {/* Điện Shelling Chart */}
                        {shellingElecHistory.length > 0 && (
                            <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
                                <p className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-3">⚡ Điện Shelling (kWh/ngày)</p>
                                <ChartWrapper className="h-[180px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={shellingElecHistory} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="shellElecGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.9} />
                                                    <stop offset="100%" stopColor="#ea580c" stopOpacity={0.7} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={Math.floor(shellingElecHistory.length / 6)} />
                                            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} width={32} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(249,115,22,0.08)' }} />
                                            <Bar dataKey="kWh" name="Điện Shelling" fill="url(#shellElecGrad)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartWrapper>
                            </div>
                        )}

                        {/* Máy nén khí chart */}
                        {compressorHistory.length > 0 && (
                            <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
                                <p className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-3">🔧 Máy Nén Khí – 3 Cụm (kWh/ngày)</p>
                                <ChartWrapper className="h-[180px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={compressorHistory} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="mnk1Grad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="mnk2Grad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.05} />
                                                </linearGradient>
                                                <linearGradient id="mnk3Grad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.6} />
                                                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.05} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={Math.floor(compressorHistory.length / 6)} />
                                            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} width={32} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                                            <Area type="monotone" dataKey="MNK1" name="Cụm #1" stroke="#8b5cf6" fill="url(#mnk1Grad)" strokeWidth={2} dot={false} />
                                            <Area type="monotone" dataKey="MNK2" name="Cụm #2,4" stroke="#ec4899" fill="url(#mnk2Grad)" strokeWidth={2} dot={false} />
                                            <Area type="monotone" dataKey="MNK3" name="Cụm #3,5,6" stroke="#14b8a6" fill="url(#mnk3Grad)" strokeWidth={2} dot={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </ChartWrapper>
                            </div>
                        )}

                        {/* Củi chart */}
                        {energyHistory.length > 0 && (
                            <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
                                <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-3">🪵 Củi Biomass (kg/ngày)</p>
                                <ChartWrapper className="h-[180px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={energyHistory} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="woodGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.85} />
                                                    <stop offset="100%" stopColor="#c2410c" stopOpacity={0.6} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={Math.floor(energyHistory.length / 6)} />
                                            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={32} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(249,115,22,0.08)' }} />
                                            <Bar dataKey="WoodActual" name="Củi (kg)" fill="url(#woodGrad)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                                            <Line type="monotone" dataKey="WoodTarget" name="Mục tiêu" stroke="#c2410c" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </ChartWrapper>
                            </div>
                        )}
                    </div>
                )}


                {/* ⚡ Daily Electricity Intensity vs Shell+Peel Output — moved below energy card */}
                {dailyElecVsProd.length > 0 && (
                    <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 md:p-5 mt-3 md:mt-4 mb-3 md:mb-4">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">⚡ Phát thải điện vs Sản lượng (Shell + Peeling)</span>
                                <p className="text-[10px] text-slate-400 mt-0.5">Cột: Sản lượng output (T) · Đường: kWh/T · Shell output = Input × 0.22</p>
                            </div>
                        </div>
                        <ChartWrapper className="w-full">
                            <ResponsiveContainer width="100%" height={200}>
                                <ComposedChart data={dailyElecVsProd} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} unit="T" />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#f59e0b' }} axisLine={false} tickLine={false} width={44} unit=" k/T" />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            return (
                                                <div className="bg-white/98 border border-slate-100 rounded-xl shadow-xl p-3 text-xs min-w-[180px]">
                                                    <p className="font-black text-slate-700 mb-2 border-b border-slate-100 pb-1">{label}</p>
                                                    {payload.map((p: any, i: number) => (
                                                        <div key={i} className="flex justify-between gap-6 py-0.5">
                                                            <span className="flex items-center gap-1.5 text-slate-500">
                                                                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.color }} />
                                                                {p.name}
                                                            </span>
                                                            <span className="font-bold text-slate-800 tabular-nums">{Number(p.value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}{p.name === 'kWh/T' ? '' : ' T'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                                    <Bar yAxisId="left" dataKey="ShellOut" name="Shell output (×0.22)" stackId="prod" fill="#6366f1" opacity={0.85} radius={[0, 0, 0, 0]} maxBarSize={28} />
                                    <Bar yAxisId="left" dataKey="PeelOut" name="Peel output" stackId="prod" fill="#22d3ee" opacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={28} />
                                    <Line yAxisId="right" type="monotone" dataKey="KwhPerT" name="kWh/T" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    </div>
                )}

                <div className="grid gap-4 mt-4">
                    <Card className="bg-white border border-slate-200 shadow-sm">
                        <CardHeader className="border-b border-white/50 bg-white/40">
                            <CardTitle className="text-xl font-bold text-slate-800">{t('master_data_table')}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto w-full">
                                <Table className="bg-white w-full text-xs sm:text-sm border-collapse">

                                    <TableHeader className="bg-slate-50 border-b border-slate-200">
                                        {selectedDept === 'all' ? (
                                            <TableRow>
                                                <TableHead>{t('col_dept')}</TableHead>
                                                <TableHead className="text-right">{t('col_plan')}</TableHead>
                                                <TableHead className="text-right">{t('col_actual')}</TableHead>
                                                <TableHead className="text-right hidden sm:table-cell">{t('col_achv')}</TableHead>
                                                <TableHead className="text-right hidden sm:table-cell">{t('col_variance')}</TableHead>
                                                <TableHead className="text-right">{t('col_downtime')}</TableHead>
                                            </TableRow>
                                        ) : (
                                            <TableRow>
                                                <TableHead>Ngày / Date</TableHead>
                                                <TableHead className="text-right">{t('col_plan')}</TableHead>
                                                <TableHead className="text-right">{t('col_actual')}</TableHead>
                                                <TableHead className="text-right hidden sm:table-cell">Input (Tấn)</TableHead>
                                                <TableHead className="text-right hidden sm:table-cell">Output (Tấn)</TableHead>
                                                {departments.find(d => d.id === selectedDept)?.code === 'PACK' && (
                                                    <>
                                                        <TableHead className="text-right hidden md:table-cell">Plan Cont</TableHead>
                                                        <TableHead className="text-right hidden md:table-cell">Actual Cont</TableHead>
                                                    </>
                                                )}
                                                {['CS', 'HPEEL'].includes(departments.find(d => d.id === selectedDept)?.code || '') && (
                                                    <TableHead className="text-right text-blue-600">ISP (T)</TableHead>
                                                )}
                                                <TableHead className="text-right">{t('col_downtime')}</TableHead>
                                            </TableRow>
                                        )}
                                    </TableHeader>
                                    <TableBody>
                                        {selectedDept === 'all' ? (
                                            deptData.filter(d => d.Actual > 0 || d.Plan > 0).map((d) => {
                                                const pct = d.Plan > 0 ? ((d.Actual / d.Plan) * 100).toFixed(1) : "0.0";
                                                const variance = (d.Actual - d.Plan).toFixed(2);
                                                return (
                                                    <TableRow key={d.name}>
                                                        <TableCell className="font-medium">{d.name}</TableCell>
                                                        <TableCell className="text-right">{d.Plan.toFixed(1)}</TableCell>
                                                        <TableCell className="text-right text-primary font-bold">{d.Actual.toFixed(1)}</TableCell>
                                                        <TableCell className="text-right hidden sm:table-cell">{pct}%</TableCell>
                                                        <TableCell className={`text-right hidden sm:table-cell ${Number(variance) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                            {Number(variance) > 0 ? '+' : ''}{variance}
                                                        </TableCell>
                                                        <TableCell className="text-right">{d.Down}</TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        ) : (
                                            dailyRecords.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE).map((d) => (
                                                <TableRow key={d.work_date}>
                                                    <TableCell className="font-medium">{format(new Date(d.work_date), 'dd/MM/yyyy')}</TableCell>
                                                    <TableCell className="text-right">{Number(d.plan_ton).toFixed(2)}</TableCell>
                                                    <TableCell className="text-right text-primary font-bold">{Number(d.actual_ton).toFixed(2)}</TableCell>
                                                    <TableCell className="text-right hidden sm:table-cell">{Number(d.input_ton).toFixed(2)}</TableCell>
                                                    <TableCell className="text-right hidden sm:table-cell">{Number(d.good_output_ton).toFixed(2)}</TableCell>
                                                    {d.dept_code === 'PACK' && (
                                                        <>
                                                            <TableCell className="text-right hidden md:table-cell">{Number(d.plan_container || 0).toFixed(2)}</TableCell>
                                                            <TableCell className="text-right font-bold text-indigo-600 hidden md:table-cell">{Number(d.actual_container || 0).toFixed(2)}</TableCell>
                                                        </>
                                                    )}
                                                    {['CS', 'HPEEL'].includes(d.dept_code) && (
                                                        <TableCell className="text-right text-blue-600 font-medium">
                                                            {Number(d.isp_ton || 0).toFixed(1)}
                                                            <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">/ {Number(d.plan_isp_ton || 0).toFixed(1)}</span>
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="text-right">{d.downtime_min}</TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            {selectedDept !== 'all' && dailyRecords.length > TABLE_PAGE_SIZE && (
                                <div className="flex items-center justify-between px-4 py-2 border-t text-sm text-muted-foreground">
                                    <span>{tablePage * TABLE_PAGE_SIZE + 1}–{Math.min((tablePage + 1) * TABLE_PAGE_SIZE, dailyRecords.length)} / {dailyRecords.length} dòng</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => setTablePage(p => Math.max(0, p - 1))} disabled={tablePage === 0} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-slate-50">←</button>
                                        <button onClick={() => setTablePage(p => p + 1)} disabled={(tablePage + 1) * TABLE_PAGE_SIZE >= dailyRecords.length} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-slate-50">→</button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div >
        </>
    )
}
