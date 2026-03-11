"use client"

import { useState, useEffect } from "react"
import { format, startOfMonth, startOfWeek, isSunday, endOfMonth, addDays } from "date-fns"
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
import { AreaChart, Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { ddsClient } from "@/lib/supabase/dds-client"
import { useLanguage } from "@/contexts/LanguageContext"
import { GaugeChart } from "@/components/ui/gauge-chart"

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

    const [energyHistory, setEnergyHistory] = useState<any[]>([])
    const [kpiSummary, setKpiSummary] = useState({
        steamActual: 0, steamTarget: 0,
        fgwhActual: 0, fgwhTarget: 0,
        contActual: 0, contTarget: 0,
        elecActual: 0, elecTarget: 0,
        waterActual: 0, waterTarget: 0,
        woodActual: 0, woodTarget: 0
    })

    // Load Departments
    useEffect(() => {
        async function loadDepts() {
            const { data } = await supabase.from("departments").select("id, name_vi, name_en, code").order("sort_order")
            if (data) setDepartments(data)
        }
        loadDepts()
    }, [])

    // Optional helper to get working days left this month (excluding Sundays)
    const getRemainingWorkingDays = (monthDate: Date) => {
        const today = new Date();
        const startOfSelected = startOfMonth(monthDate);
        const endOfSelected = endOfMonth(monthDate);

        // If viewing a past month, no remaining days
        if (today > endOfSelected) return 0;

        // If viewing a future month, start from the 1st of that month
        let current = today < startOfSelected ? startOfSelected : today;
        let remainingDays = 0;

        while (current <= endOfSelected) {
            if (!isSunday(current)) {
                remainingDays++;
            }
            current = addDays(current, 1);
        }
        return remainingDays;
    }

    // Helper function to build summary object
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

        // MTD (Month To Date) Calculation Logic
        const todayStr = format(new Date(), "yyyy-MM-dd");

        // 1. Find Cutoff Date (The latest date that has any actual production)
        let cutoffDate = "";
        records.forEach(r => {
            const actT = Number(isTotal ? r.total_actual_ton : r.actual_ton || 0);
            const actC = Number(isTotal ? r.total_actual_container : r.actual_container || 0);
            if (actT > 0 || actC > 0) {
                if (!cutoffDate || r.work_date > cutoffDate) {
                    cutoffDate = r.work_date;
                }
            }
        });

        // Default cutoff to today if no actuals found (e.g. start of month) or if cutoff is in the future
        if (!cutoffDate || cutoffDate > todayStr) {
            cutoffDate = todayStr;
        }

        let tPlanMTD = 0;
        let tPlanContMTD = 0;

        records.forEach(r => {
            const planVal = Number(isTotal ? r.total_plan_ton : r.plan_ton || 0);
            const planContVal = Number(isTotal ? r.total_plan_container : r.plan_container || 0);

            tPlan += planVal;
            tPlanCont += planContVal;

            // Only add to MTD if the date is within the cutoff period
            if (r.work_date <= cutoffDate) {
                tPlanMTD += planVal;
                tPlanContMTD += planContVal;
            }

            tActual += Number(isTotal ? r.total_actual_ton : r.actual_ton || 0);
            tActualCont += Number(isTotal ? r.total_actual_container : r.actual_container || 0);
            tDown += Number(isTotal ? r.total_downtime_min : r.downtime_min || 0);
            tInput += Number(isTotal ? r.total_input_ton : r.input_ton || 0);
            tOutput += Number(isTotal ? r.total_good_output_ton : r.good_output_ton || 0);
            tWip = Number(isTotal ? r.total_wip_close_ton : r.wip_close_ton || 0);
            tElecCons += Number(r.electricity_consumption_kwh || 0);
            tElecTarget += Number(r.target_electricity_kwh || 0);

            // FGWH ISP / Non-ISP (only available on total records from v_dashboard_total_daily)
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
            totalPlan: tPlan,
            totalPlanCont: tPlanCont,
            totalActual: tActual,
            totalActualCont: tActualCont,
            totalPlanMTD: tPlanMTD,
            totalPlanContMTD: tPlanContMTD,
            latestPlan,
            latestActual,
            latestPlanCont,
            latestActualCont,
            latestActualIsp: latestActualIsp_val,
            latestPlanIsp: latestPlanIsp_val,
            latestActualNonIsp: latestActualNonIsp_val,
            latestPlanNonIsp: latestPlanNonIsp_val,
            achivementPct: tPlanMTD > 0 ? (tActual / tPlanMTD) * 100 : 0,
            achivementContPct: tPlanContMTD > 0 ? (tActualCont / tPlanContMTD) * 100 : 0,
            variance: tActual - tPlanMTD, // Variance compared to MTD plan
            downtime: tDown,
            wipClose: tWip,
            yieldPct: tInput > 0 ? (tOutput / tInput) * 100 : 0,
            brokenPct: countBroken > 0 ? sumBroken / countBroken : 0,
            unpeelPct: countUnpeel > 0 ? sumUnpeel / countUnpeel : 0,
            ispPct: countIsp > 0 ? sumIsp / countIsp : 0,
            swPct: countSw > 0 ? sumSw / countSw : 0,
            totalPlanIsp: tPlanIsp,
            totalActualIsp: tActualIsp,
            totalPlanNonIsp: tPlanNonIsp,
            totalActualNonIsp: tActualNonIsp,
            totalActualIspCS: tActualIspCS,
            totalActualNonIspCS: Math.max(0, tActual - tActualIspCS),
            totalElectricityConsumption: tElecCons,
            totalTargetElectricityKwh: tElecTarget
        };
    };

    // Load Dashboard Data
    useEffect(() => {
        async function fetchDashboard() {
            const dashboards: any = {};
            const startFilter = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
            const endFilter = format(endOfMonth(selectedMonth), "yyyy-MM-dd");

            // 0. Fetch DDS-meeting Downtime Data
            const { data: ddsIssues } = await ddsClient
                .from('issues')
                .select('department, duration_mins, start_time')
                .eq('is_downtime', true)
                .eq('status', 'Closed')
                .gte('start_time', `${startFilter}T00:00:00Z`)
                .lte('start_time', `${endFilter}T23:59:59Z`);

            const ddsDownTimeSum: Record<string, number> = {};
            const ddsTotalDownTimeSum: Record<string, number> = {};

            if (ddsIssues) {
                ddsIssues.forEach((issue: any) => {
                    const issueDate = format(new Date(issue.start_time), 'yyyy-MM-dd');
                    const deptName = issue.department;

                    const key = `${deptName}_${issueDate}`;
                    if (!ddsDownTimeSum[key]) ddsDownTimeSum[key] = 0;
                    ddsDownTimeSum[key] += Number(issue.duration_mins || 0);

                    if (!ddsTotalDownTimeSum[issueDate]) ddsTotalDownTimeSum[issueDate] = 0;
                    ddsTotalDownTimeSum[issueDate] += Number(issue.duration_mins || 0);
                });
            }

            const getExternalDeptName = (deptCode: string) => {
                switch (deptCode) {
                    case 'STEAM': return 'Steaming';
                    case 'SHELL': return 'Shelling';
                    case 'BORMA': return 'Borma';
                    case 'PEEL_MC': return 'Peeling MC';
                    case 'CS': return 'ColorSorter';
                    case 'HAND': return 'HandPeeling';
                    case 'PACK': return 'Packing';
                    default: return null;
                }
            };

            // 1. Fetch Total Factory Data
            const { data: totalData } = await supabase
                .from("v_dashboard_total_daily")
                .select("*")
                .gte("work_date", startFilter)
                .lte("work_date", endFilter)
                .order("work_date")

            if (totalData) {
                // Pre-process and inject external downtime mappings 
                totalData.forEach((d: any) => {
                    d.total_downtime_min = ddsTotalDownTimeSum[d.work_date] || 0;
                });
                const history = totalData.map(d => ({
                    name: format(new Date(d.work_date), 'dd/MM'),
                    Actual: Number(d.total_actual_ton),
                    Plan: Number(d.total_plan_ton)
                }));
                const fgwhIspHistory = totalData.map(d => ({
                    name: format(new Date(d.work_date), 'dd/MM'),
                    Actual: Number(d.total_actual_isp_ton || 0),
                    Plan: Number(d.total_plan_isp_ton || 0)
                }));

                dashboards["all"] = {
                    summary: buildSummary(totalData, true),
                    history
                };
                dashboards["fgwh"] = {
                    summary: buildSummary(totalData, true),
                    history: fgwhIspHistory
                };
            }

            // 2. Fetch All Individual Dept Data
            const { data: dData } = await supabase
                .from("v_dashboard_daily")
                .select("*")
                .gte("work_date", startFilter)
                .lte("work_date", endFilter)
                .order("work_date")

            if (dData) {
                // Map the downloaded external Downtime values
                dData.forEach((curr: any) => {
                    const extDept = getExternalDeptName(curr.dept_code);
                    if (extDept) {
                        curr.downtime_min = ddsDownTimeSum[`${extDept}_${curr.work_date}`] || 0;
                    } else {
                        curr.downtime_min = 0;
                    }
                });

                // Determine regions mapping
                // Map RCN: RCN
                // Map LCA: STEAM, SHELL, BORMA
                // Map HCA: PEEL_MC, CS, HAND, PACK
                const mappingLCA = ["STEAM", "SHELL", "BORMA"];
                const mappingHCA = ["PEEL_MC", "CS", "HAND", "PACK"];

                const grouped = dData.reduce((acc: any, curr: any) => {
                    // Group by stations setup
                    if (!acc[curr.department_id]) acc[curr.department_id] = [];
                    acc[curr.department_id].push(curr);

                    // Group by Regions
                    let regionCode = "OTHER";
                    if (curr.dept_code === "RCN") regionCode = "RCN";
                    else if (mappingLCA.includes(curr.dept_code)) regionCode = "LCA";
                    else if (mappingHCA.includes(curr.dept_code)) regionCode = "HCA";

                    if (!acc[`region-${regionCode}`]) acc[`region-${regionCode}`] = [];
                    acc[`region-${regionCode}`].push(curr);

                    return acc;
                }, {});

                // Build summary and history
                Object.keys(grouped).forEach(key => {
                    const records = grouped[key];
                    // Some regions contain multiple departments ON THE SAME DATE.
                    // To build an accurate history (Actual vs Plan per day), we must group regions by Work_Date!
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
                        name: format(new Date(d), 'dd/MM'),
                        Actual: recordsByDay[d].actual,
                        Plan: recordsByDay[d].plan,
                        ContActual: recordsByDay[d].actual_cont,
                        ContPlan: recordsByDay[d].plan_cont,
                        Intensity: recordsByDay[d].actual > 0 ? Number((recordsByDay[d].elec / recordsByDay[d].actual).toFixed(2)) : 0,
                        IspActual: recordsByDay[d].isp_actual,
                        IspPlan: recordsByDay[d].isp_plan,
                        NonIspActual: Math.max(0, recordsByDay[d].actual - recordsByDay[d].isp_actual)
                    }));

                    dashboards[key] = {
                        summary: buildSummary(records, false),
                        history
                    };
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
                        Actual: contRecordsByDay[d].actual,
                        Plan: contRecordsByDay[d].plan,
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
            }

            setDashboardsData(dashboards);

            // 3. Fetch Energy & Build KPIs
            const { data: eData } = await supabase
                .from('daily_energy')
                .select('*')
                .gte('work_date', startFilter)
                .lte('work_date', endFilter)
                .order('work_date');

            let elecActual = 0, elecTarget = 0, waterActual = 0, waterTarget = 0, woodActual = 0, woodTarget = 0;
            if (eData) {
                eData.forEach(r => {
                    elecActual += Number(r.electricity_kwh || 0);
                    elecTarget += Number(r.electricity_target_kwh || 0);
                    waterActual += Number(r.water_m3 || 0);
                    waterTarget += Number(r.water_target_m3 || 0);
                    woodActual += Number(r.wood_kg || 0);
                    woodTarget += Number(r.wood_target_kg || 0);
                });

                setEnergyHistory(eData.map(r => ({
                    name: format(new Date(r.work_date), 'dd/MM'),
                    ElectricityActual: Number(r.electricity_kwh || 0),
                    ElectricityTarget: Number(r.electricity_target_kwh || 0),
                    WaterActual: Number(r.water_m3 || 0),
                    WaterTarget: Number(r.water_target_m3 || 0),
                    WoodActual: Number(r.wood_kg || 0),
                    WoodTarget: Number(r.wood_target_kg || 0)
                })));
            }

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
                steamActual, steamTarget, fgwhActual, fgwhTarget, elecActual, elecTarget, waterActual, waterTarget, woodActual, woodTarget, contActual, contTarget
            });

            // Still populate legacy states for the Master Table if needed
            if (dData) {
                const map = new Map()
                dData.forEach(r => {
                    if (!map.has(r.dept_name_en)) map.set(r.dept_name_en, { name: r.dept_name_en, Actual: 0, Plan: 0, Down: 0 })
                    const current = map.get(r.dept_name_en)
                    current.Actual += Number(r.actual_ton)
                    current.Plan += Number(r.plan_ton)
                    current.Down += Number(r.downtime_min)
                })
                setDeptData(Array.from(map.values()))

                if (selectedDept !== 'all') {
                    setDailyRecords(dData.filter(d => d.department_id === selectedDept));
                }
            }
        }
        fetchDashboard()
    }, [selectedDept, selectedMonth])

    const handleExportCSV = () => {
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
    }


    const renderMiniDashboard = (id: string, name: string, isTotal: boolean = false) => {
        const data = dashboardsData[id];
        if (!data) return null; // Loading or no data
        const { summary, history } = data;

        const isFgwh = id === 'fgwh';
        const remainingDays = getRemainingWorkingDays(selectedMonth);
        const remainingTarget = Math.max(0, summary.totalPlan - summary.totalActual);
        const dailyNeeded = remainingDays > 0 ? (remainingTarget / remainingDays).toFixed(2) : "0";

        const isReachTonnage = summary.totalActual >= summary.totalPlan && summary.totalPlan > 0;
        const isReached = isReachTonnage;

        const actualNum = summary.totalActual;
        const planNum = summary.totalPlan;
        const unit = id === 'virtual-container' ? "Cont" : "T";
        const variance = actualNum - planNum;

        const deptCode = id === 'all' ? 'ALL' : (id.startsWith('region-') ? id.replace('region-', '') : (id === 'virtual-container' ? 'CONT' : (departments.find(d => d.id === id)?.code || "ALL")));

        if (isFgwh) {
            return (
                <Card key={id} className="bg-white shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col h-full border-primary/50 border-2">
                    <CardHeader className="pb-2 bg-gray-50/50 border-b flex-shrink-0">
                        <CardTitle className="text-md font-bold flex flex-wrap justify-between items-center gap-4 text-primary">
                            <span className="flex items-center gap-2">
                                FGWH - Kho Thành Phẩm
                                <FileSymlink className="h-4 w-4 text-primary" />
                            </span>
                            <div className="flex items-center gap-6">
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-muted-foreground uppercase mb-0.5">ISP (Thực tế / KH)</span>
                                    <span className="text-xl font-black text-blue-700">{summary.totalActualIsp?.toFixed(1) ?? 0} <span className="text-sm font-normal text-muted-foreground">/ {summary.totalPlanIsp?.toFixed(1) ?? 0} T</span></span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-muted-foreground uppercase mb-0.5">Non-ISP (Thực tế / KH)</span>
                                    <span className="text-xl font-black text-slate-700">{summary.totalActualNonIsp?.toFixed(1) ?? 0} <span className="text-sm font-normal text-muted-foreground">/ {summary.totalPlanNonIsp?.toFixed(1) ?? 0} T</span></span>
                                </div>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 flex-1 flex flex-col">
                        <div className="flex-1">
                            <ResponsiveContainer width="100%" height={160}>
                                <ComposedChart data={history} margin={{ top: 5, right: 0, left: 0, bottom: 25 }}>
                                    <XAxis dataKey="name" tick={{ fontSize: 10, dy: 5 }} tickLine={false} axisLine={false} height={30} minTickGap={10} tickMargin={5} />
                                    <Tooltip contentStyle={{ fontSize: '10px', padding: '2px 4px' }} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                    <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                                    <Bar dataKey="Actual" name="Thực tế" radius={[2, 2, 0, 0]}>
                                        {history.map((entry: any, index: number) => {
                                            const color = (entry.Plan > 0 && entry.Actual < entry.Plan) ? "#ef4444" : "#22c55e";
                                            return <Cell key={`cell-${index}`} fill={color} />;
                                        })}
                                    </Bar>
                                    <Line type="step" dataKey="Plan" name="Kế hoạch" stroke="#94a3b8" strokeDasharray="3 3" dot={false} strokeWidth={1} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card key={id} className={`bg-white shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col h-full ${isTotal ? 'border-primary/50 border-2' : ''}`}>
                <CardHeader className="pb-2 bg-gray-50/50 border-b flex-shrink-0">
                    <CardTitle className={`text-md font-bold flex flex-row flex-wrap justify-between items-start md:items-center gap-4 ${isTotal ? 'text-primary' : ''}`}>
                        <span className="flex items-center gap-2 uppercase tracking-wider whitespace-nowrap">
                            {name}
                            {isTotal && <FileSymlink className="h-4 w-4 text-primary" />}
                        </span>

                        <div className="flex flex-row flex-wrap items-center gap-4 xl:gap-6 mt-2 md:mt-0">
                            <div className="flex flex-col items-end border-r pr-4 border-gray-200">
                                <span className="text-[10px] text-muted-foreground mb-0.5">THÁNG / MONTHLY</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-slate-800">{actualNum.toFixed(1)}</span>
                                    <span className="text-sm text-muted-foreground">/ {planNum.toFixed(1)} {unit}</span>
                                </div>
                                <span className={`text-[10px] font-bold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {variance >= 0 ? `+${variance.toFixed(1)}` : variance.toFixed(1)} {unit}
                                </span>
                            </div>

                            <div className={`flex flex-col items-end ${deptCode === 'PACK' || deptCode === 'CS' ? 'border-r pr-4 border-gray-200' : ''}`}>
                                <span className="text-[10px] text-muted-foreground mb-0.5">MTD ACHIEVEMENT</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-2xl font-black ${summary.achivementPct >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                                        {summary.achivementPct.toFixed(1)}%
                                    </span>
                                    {summary.achivementPct >= 100 ? <TrendingUp className="h-6 w-6 text-green-500" /> : <TrendingDown className="h-6 w-6 text-red-500" />}
                                </div>
                            </div>
                            {deptCode === 'CS' && (
                                <div className="flex flex-col items-end pl-0 md:pl-2">
                                    <span className="text-[10px] text-muted-foreground uppercase mb-0.5 text-blue-600">ISP (Thực tế/KH)</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-blue-700">{summary.totalActualIspCS?.toFixed(1) ?? 0}</span>
                                        <span className="text-sm text-muted-foreground">/ {summary.totalPlanIsp?.toFixed(1) ?? 0} T</span>
                                    </div>
                                </div>
                            )}

                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 flex-1 flex flex-col">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        {(
                            <>
                                {id !== 'virtual-container' && (
                                    <>
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">{t('daily_needed')}</p>
                                            <div className={`text-md font-bold ${isReached ? 'text-green-600' : 'text-primary'}`}>
                                                {isReached ? 'Đạt' : `${dailyNeeded} T`}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">{t('downtime')}</p>
                                            <div className="text-md font-bold text-amber-600 flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> {summary.downtime}p
                                            </div>
                                        </div>
                                    </>
                                )}

                                {["PEEL_MC", "SHELL"].includes(deptCode) && (
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-1">Tỷ lệ Bể (%)</p>
                                        <div className="text-md font-bold text-red-600 flex items-center gap-1">
                                            {summary.brokenPct.toFixed(1)}%
                                        </div>
                                    </div>
                                )}
                                {deptCode === "SHELL" && (
                                    <>
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">Điện (kWh)</p>
                                            <div className="text-md font-bold text-amber-600 flex items-center gap-1">
                                                {summary.totalElectricityConsumption?.toLocaleString()} / {summary.totalTargetElectricityKwh?.toLocaleString()}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">kWh / Tấn</p>
                                            <div className="text-md font-bold text-amber-700 flex items-center gap-1">
                                                {summary.totalActual > 0 ? (summary.totalElectricityConsumption / summary.totalActual).toFixed(2) : "0.00"}
                                            </div>
                                        </div>
                                    </>
                                )}
                                {["PEEL_MC"].includes(deptCode) && (
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-1">Sót lụa (%)</p>
                                        <div className="text-md font-bold text-orange-600 flex items-center gap-1">
                                            {summary.unpeelPct.toFixed(1)}%
                                        </div>
                                    </div>
                                )}
                                {["HAND"].includes(deptCode) && (
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-1">Tỷ lệ ISP (%)</p>
                                        <div className="text-md font-bold text-blue-600 flex items-center gap-1">
                                            {summary.ispPct.toFixed(1)}%
                                        </div>
                                    </div>
                                )}
                                {["BORMA"].includes(deptCode) && (
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-1">Tỷ lệ SW (%)</p>
                                        <div className="text-md font-bold text-amber-700 flex items-center gap-1">
                                            {summary.swPct.toFixed(1)}%
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    {/* Sparkline chart */}
                    <div className="h-36 w-full mt-auto border-t pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={history} margin={{ top: 5, right: 0, left: 0, bottom: 25 }}>
                                <XAxis dataKey="name" tick={{ fontSize: 10, dy: 5 }} tickLine={false} axisLine={false} height={30} minTickGap={10} tickMargin={5} />
                                <Tooltip contentStyle={{ fontSize: '10px', padding: '2px 4px' }} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                {deptCode === "SHELL" && (
                                    <>
                                        <YAxis yAxisId="intensity" orientation="right" hide />
                                        <Line yAxisId="intensity" type="monotone" dataKey="Intensity" stroke="#f59e0b" dot={false} strokeWidth={2} name="kWh/T" />
                                    </>
                                )}
                                {deptCode === "CS" ? (
                                    <>
                                        <Bar dataKey="IspActual" name="ISP (Thực tế)" stackId="a" fill="#3b82f6" />
                                        <Bar dataKey="NonIspActual" name="Non-ISP (Thực tế)" stackId="a" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                                        <Line type="step" dataKey="IspPlan" stroke="#2563eb" strokeDasharray="3 3" dot={false} strokeWidth={2} name="Kế hoạch ISP" />
                                    </>
                                ) : (
                                    <Bar dataKey="Actual" name="Thực tế" radius={[2, 2, 0, 0]}>
                                        {history.map((entry: any, index: number) => {
                                            const color = (entry.Plan > 0 && entry.Actual < entry.Plan) ? "#ef4444" : "#22c55e";
                                            return <Cell key={`cell-${index}`} fill={color} />;
                                        })}
                                    </Bar>
                                )}
                                <Line type="step" dataKey="Plan" stroke="#94a3b8" strokeDasharray="3 3" dot={false} strokeWidth={1} name="Kế hoạch" />
                                <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="flex-col md:flex">
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 border-b pb-4 mb-4">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">{t('command_center')}</h2>
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
                        <TabsList>
                            <TabsTrigger value="stations">{t('tab_stations')}</TabsTrigger>
                            <TabsTrigger value="regions">{t('tab_regions')}</TabsTrigger>
                        </TabsList>
                        <div className="flex space-x-2">
                            <input
                                type="month"
                                value={format(selectedMonth, "yyyy-MM")}
                                onChange={(e) => {
                                    if (e.target.value) setSelectedMonth(new Date(e.target.value))
                                }}
                                className="border rounded-md px-3 py-1 text-sm bg-background border-input ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
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

                {selectedDept === 'all' && (
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6 mt-4">
                        <Card className="p-4 flex flex-col justify-center pb-2 bg-white">
                            <GaugeChart value={kpiSummary.steamActual} target={kpiSummary.steamTarget} label="TIẾN ĐỘ HẤP / STEAMING" unit="T" color="#f59e0b" />
                        </Card>
                        <Card className="p-4 flex flex-col justify-center pb-2 bg-white">
                            <GaugeChart value={kpiSummary.contActual} target={kpiSummary.contTarget} label="CONTAINER / ĐÓNG CÔNG" unit="Cont" color="#10b981" />
                        </Card>
                        <Card className="p-4 flex flex-col justify-center pb-2 bg-white">
                            <GaugeChart value={kpiSummary.elecActual} target={kpiSummary.elecTarget} label="ĐIỆN TIÊU THỤ" unit="kWh" color="#eab308" formatValue={(v) => Number(v).toLocaleString()} inverse />
                        </Card>
                        <Card className="p-4 flex flex-col justify-center pb-2 bg-white">
                            <GaugeChart value={kpiSummary.waterActual} target={kpiSummary.waterTarget} label="NƯỚC TIÊU THỤ" unit="m³" color="#3b82f6" formatValue={(v) => Number(v).toLocaleString()} inverse />
                        </Card>
                        <Card className="p-4 flex flex-col justify-center pb-2 bg-white">
                            <GaugeChart value={kpiSummary.woodActual} target={kpiSummary.woodTarget} label="CỦI TIÊU THỤ" unit="T" color="#f97316" formatValue={(v) => Number(v).toLocaleString()} inverse />
                        </Card>
                    </div>
                )}

                <TabsContent value="stations" className="mt-0">
                    <div className="mb-4 grid gap-4 grid-cols-1 md:grid-cols-2">
                        {/* Total Factory Card - Full Width / 2 columns */}
                        {renderMiniDashboard("all", t('all_factory_card'), true)}

                        {/* FGWH Finished Goods Warehouse Card */}
                        {renderMiniDashboard("fgwh", "FGWH - Kho Thành Phẩm", true)}
                    </div>

                    {/* MINI DASHBOARDS GRID */}
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        {/* Department Cards - exclude FGWH since it has its own card above */}
                        {departments.filter(d => d.code !== 'FGWH').map(d => renderMiniDashboard(d.id, d.name_en))}
                        {/* Virtual Container Card */}
                        {renderMiniDashboard("virtual-container", "Container")}
                    </div>
                </TabsContent>

                <TabsContent value="regions" className="mt-0">
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        {renderMiniDashboard("region-RCN", t('region_rcn'), true)}
                        {renderMiniDashboard("region-LCA", t('region_lca'), true)}
                        {renderMiniDashboard("region-HCA", t('region_hca'), true)}
                    </div>
                </TabsContent>
            </Tabs>

            {
                selectedDept === 'all' && energyHistory.length > 0 && (
                    <Card className="mt-4 bg-white">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xl">Theo dõi Điện - Nước - Củi ({format(selectedMonth, 'MM/yyyy')})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {/* DESKTOP VIEW: Combined Chart with 3 Y-Axes */}
                            <div className="hidden md:block h-80 w-full pb-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={energyHistory} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="#eab308" />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="#3b82f6" />
                                        <YAxis yAxisId="right2" orientation="right" tick={{ fontSize: 12 }} stroke="#f97316" width={80} />
                                        <Tooltip contentStyle={{ fontSize: '12px' }} />
                                        <Legend wrapperStyle={{ bottom: -5, fontSize: '11px' }} />
                                        <Bar yAxisId="left" dataKey="ElectricityActual" name="Điện (kWh)" fill="#eab308" radius={[4, 4, 0, 0]} barSize={20} />
                                        <Line yAxisId="left" type="monotone" dataKey="ElectricityTarget" name="Target Điện" stroke="#ca8a04" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                                        <Bar yAxisId="right" dataKey="WaterActual" name="Nước (m³)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                                        <Line yAxisId="right" type="monotone" dataKey="WaterTarget" name="Target Nước" stroke="#2563eb" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                                        <Bar yAxisId="right2" dataKey="WoodActual" name="Củi (Tấn)" fill="#f97316" radius={[4, 4, 0, 0]} barSize={20} />
                                        <Line yAxisId="right2" type="monotone" dataKey="WoodTarget" name="Target Củi" stroke="#c2410c" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>

                            {/* MOBILE VIEW: 3 Separate Charts for better readability */}
                            <div className="md:hidden flex flex-col gap-10 py-4">
                                {/* Electricity Chart */}
                                <div className="h-48 w-full">
                                    <p className="text-xs font-bold text-amber-600 mb-2 uppercase tracking-tight">Biểu đồ Điện (kWh)</p>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={energyHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                            <YAxis tick={{ fontSize: 9 }} stroke="#eab308" />
                                            <Tooltip contentStyle={{ fontSize: '11px' }} />
                                            <Bar dataKey="ElectricityActual" name="Thực tế" fill="#eab308" radius={[2, 2, 0, 0]} barSize={12} />
                                            <Line type="monotone" dataKey="ElectricityTarget" name="Mục tiêu" stroke="#ca8a04" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Water Chart */}
                                <div className="h-48 w-full">
                                    <p className="text-xs font-bold text-blue-600 mb-2 uppercase tracking-tight">Biểu đồ Nước (m³)</p>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={energyHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                            <YAxis tick={{ fontSize: 9 }} stroke="#3b82f6" />
                                            <Tooltip contentStyle={{ fontSize: '11px' }} />
                                            <Bar dataKey="WaterActual" name="Thực tế" fill="#3b82f6" radius={[2, 2, 0, 0]} barSize={12} />
                                            <Line type="monotone" dataKey="WaterTarget" name="Mục tiêu" stroke="#2563eb" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Wood Chart */}
                                <div className="h-48 w-full">
                                    <p className="text-xs font-bold text-orange-600 mb-2 uppercase tracking-tight">Biểu đồ Củi (Tấn)</p>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={energyHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                            <YAxis tick={{ fontSize: 9 }} stroke="#f97316" />
                                            <Tooltip contentStyle={{ fontSize: '11px' }} />
                                            <Bar dataKey="WoodActual" name="Thực tế" fill="#f97316" radius={[2, 2, 0, 0]} barSize={12} />
                                            <Line type="monotone" dataKey="WoodTarget" name="Mục tiêu" stroke="#c2410c" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )
            }

            <div className="grid gap-4 mt-4">
                <Card className="bg-white">
                    <CardHeader>
                        <CardTitle className="text-xl">{t('master_data_table')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                {selectedDept === 'all' ? (
                                    <TableRow>
                                        <TableHead>{t('col_dept')}</TableHead>
                                        <TableHead className="text-right">{t('col_plan')}</TableHead>
                                        <TableHead className="text-right">{t('col_actual')}</TableHead>
                                        <TableHead className="text-right">{t('col_achv')}</TableHead>
                                        <TableHead className="text-right">{t('col_variance')}</TableHead>
                                        <TableHead className="text-right">{t('col_downtime')}</TableHead>
                                    </TableRow>
                                ) : (
                                    <TableRow>
                                        <TableHead>Ngày / Date</TableHead>
                                        <TableHead className="text-right">{t('col_plan')}</TableHead>
                                        <TableHead className="text-right">{t('col_actual')}</TableHead>
                                        <TableHead className="text-right">Input (Tấn)</TableHead>
                                        <TableHead className="text-right">Output (Tấn)</TableHead>
                                        {departments.find(d => d.id === selectedDept)?.code === 'PACK' && (
                                            <>
                                                <TableHead className="text-right">Plan Cont</TableHead>
                                                <TableHead className="text-right">Actual Cont</TableHead>
                                            </>
                                        )}
                                        <TableHead className="text-right">{t('col_downtime')}</TableHead>
                                    </TableRow>
                                )}
                            </TableHeader>
                            <TableBody>
                                {selectedDept === 'all' ? (
                                    deptData.map((d) => {
                                        const pct = d.Plan > 0 ? ((d.Actual / d.Plan) * 100).toFixed(1) : "0.0";
                                        const variance = (d.Actual - d.Plan).toFixed(2);
                                        return (
                                            <TableRow key={d.name}>
                                                <TableCell className="font-medium">{d.name}</TableCell>
                                                <TableCell className="text-right">{d.Plan.toFixed(2)}</TableCell>
                                                <TableCell className="text-right text-primary font-bold">{d.Actual.toFixed(2)}</TableCell>
                                                <TableCell className="text-right">{pct}%</TableCell>
                                                <TableCell className={`text-right ${Number(variance) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {Number(variance) > 0 ? '+' : ''}{variance}
                                                </TableCell>
                                                <TableCell className="text-right">{d.Down}</TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    dailyRecords.map((d) => (
                                        <TableRow key={d.work_date}>
                                            <TableCell className="font-medium">{format(new Date(d.work_date), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell className="text-right">{Number(d.plan_ton).toFixed(2)}</TableCell>
                                            <TableCell className="text-right text-primary font-bold">{Number(d.actual_ton).toFixed(2)}</TableCell>
                                            <TableCell className="text-right">{Number(d.input_ton).toFixed(2)}</TableCell>
                                            <TableCell className="text-right">{Number(d.good_output_ton).toFixed(2)}</TableCell>
                                            {d.dept_code === 'PACK' && (
                                                <>
                                                    <TableCell className="text-right">{Number(d.plan_container || 0).toFixed(2)}</TableCell>
                                                    <TableCell className="text-right font-bold text-indigo-600">{Number(d.actual_container || 0).toFixed(2)}</TableCell>
                                                </>
                                            )}
                                            <TableCell className="text-right">{d.downtime_min}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div >
    )
}
