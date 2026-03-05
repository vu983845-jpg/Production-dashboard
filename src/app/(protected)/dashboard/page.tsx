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
import { useLanguage } from "@/contexts/LanguageContext"

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
        records.forEach(r => {
            tPlan += Number(isTotal ? r.total_plan_ton : r.plan_ton || 0);
            tPlanCont += Number(isTotal ? r.total_plan_container : r.plan_container || 0);
            tActual += Number(isTotal ? r.total_actual_ton : r.actual_ton || 0);
            tActualCont += Number(isTotal ? r.total_actual_container : r.actual_container || 0);
            tDown += Number(isTotal ? r.total_downtime_min : r.downtime_min || 0);
            tInput += Number(isTotal ? r.total_input_ton : r.input_ton || 0);
            tOutput += Number(isTotal ? r.total_good_output_ton : r.good_output_ton || 0);
            tWip = Number(isTotal ? r.total_wip_close_ton : r.wip_close_ton || 0);
        });
        return {
            totalPlan: tPlan,
            totalPlanCont: tPlanCont,
            totalActual: tActual,
            totalActualCont: tActualCont,
            achivementPct: tPlan > 0 ? (tActual / tPlan) * 100 : 0,
            variance: tActual - tPlan,
            downtime: tDown,
            wipClose: tWip,
            yieldPct: tInput > 0 ? (tOutput / tInput) * 100 : 0
        };
    };

    // Load Dashboard Data
    useEffect(() => {
        async function fetchDashboard() {
            const dashboards: any = {};
            const startFilter = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
            const endFilter = format(endOfMonth(selectedMonth), "yyyy-MM-dd");

            // 1. Fetch Total Factory Data
            const { data: totalData } = await supabase
                .from("v_dashboard_total_daily")
                .select("*")
                .gte("work_date", startFilter)
                .lte("work_date", endFilter)
                .order("work_date")

            if (totalData) {
                const history = totalData.map(d => ({
                    name: format(new Date(d.work_date), 'dd/MM'),
                    Actual: Number(d.total_actual_ton),
                    Plan: Number(d.total_plan_ton)
                }));
                const containerHistory = totalData.map(d => ({
                    name: format(new Date(d.work_date), 'dd/MM'),
                    Actual: Number(d.total_actual_container),
                    Plan: Number(d.total_plan_container)
                }));

                dashboards["all"] = {
                    summary: buildSummary(totalData, true),
                    history
                };
                dashboards["container"] = {
                    summary: buildSummary(totalData, true),
                    history: containerHistory
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
                            dayAcc[r.work_date] = { plan: 0, actual: 0 };
                        }
                        dayAcc[r.work_date].plan += Number(r.plan_ton);
                        dayAcc[r.work_date].actual += Number(r.actual_ton);
                        return dayAcc;
                    }, {});

                    const history = Object.keys(recordsByDay).sort().map(d => ({
                        name: format(new Date(d), 'dd/MM'),
                        Actual: recordsByDay[d].actual,
                        Plan: recordsByDay[d].plan
                    }));

                    dashboards[key] = {
                        summary: buildSummary(records, false),
                        history
                    };
                });
            }

            setDashboardsData(dashboards);

            // Still populate legacy states for the Master Table if needed
            if (dData) {
                const map = new Map()
                dData.forEach(r => {
                    if (!map.has(r.dept_name_vi)) map.set(r.dept_name_vi, { name: r.dept_name_vi, Actual: 0, Plan: 0, Down: 0 })
                    const current = map.get(r.dept_name_vi)
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
            headers = ["Ngày", "Mã BP", "Plan (Tấn)", "Actual (Tấn)", "Input (Tấn)", "Output (Tấn)", "Downtime (Phút)"];
            rows = dailyRecords.map(d => {
                return `"${format(new Date(d.work_date), 'dd/MM/yyyy')}",${d.dept_code},${d.plan_ton},${d.actual_ton},${d.input_ton},${d.good_output_ton},${d.downtime_min}`;
            });
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

        const isContainer = id === 'container';
        const remainingDays = getRemainingWorkingDays(selectedMonth);
        const remainingTarget = Math.max(0, summary.totalPlan - summary.totalActual);
        const dailyNeeded = remainingDays > 0 ? (remainingTarget / remainingDays).toFixed(2) : "0";

        const isReachTonnage = summary.totalActual >= summary.totalPlan && summary.totalPlan > 0;
        const isReachContainer = summary.totalActualCont >= summary.totalPlanCont && summary.totalPlanCont > 0;

        const isReached = isContainer ? isReachContainer : isReachTonnage;

        const actualNum = isContainer ? summary.totalActualCont : summary.totalActual;
        const planNum = isContainer ? summary.totalPlanCont : summary.totalPlan;
        const unit = isContainer ? "Cont" : "T";
        const variance = actualNum - planNum;

        return (
            <Card key={id} className={`bg-white shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col ${isTotal ? 'border-primary/50 border-2' : ''}`}>
                <CardHeader className="pb-2 bg-gray-50/50 border-b">
                    <CardTitle className={`text-md font-bold flex justify-between items-center ${isTotal ? 'text-primary' : ''}`}>
                        {name}
                        {isTotal && <FileSymlink className="h-4 w-4 text-primary" />}
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 flex-1">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">{t('actual_vs_plan')}</p>
                            <div className="text-lg font-bold">{isContainer ? actualNum : actualNum.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ {isContainer ? planNum : planNum.toFixed(1)} {unit}</span></div>
                            <p className="text-[10px] sm:text-xs text-primary mt-1 font-medium">
                                {variance >= 0 ? `+${isContainer ? variance : variance.toFixed(1)} ${unit}` : `${isContainer ? variance : variance.toFixed(1)} ${unit}`}
                            </p>
                        </div>
                        {!isContainer && (
                            <>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">{t('achv_pct')}</p>
                                    <div className="text-lg font-bold flex items-center gap-1">
                                        {summary.achivementPct.toFixed(1)}%
                                        {summary.achivementPct >= 100 ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                                    </div>
                                </div>
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
                    </div>
                    {/* Sparkline chart */}
                    <div className="h-24 w-full mt-auto border-t pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={history} margin={{ top: 5, right: 0, left: 0, bottom: 15 }}>
                                <XAxis dataKey="name" tick={{ fontSize: 10, dy: 5 }} tickLine={false} axisLine={false} height={20} minTickGap={10} tickMargin={5} />
                                <Tooltip contentStyle={{ fontSize: '10px', padding: '2px 4px' }} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                <Bar dataKey="Actual" radius={[2, 2, 0, 0]}>
                                    {history.map((entry: any, index: number) => {
                                        // If there is a plan AND actual is less than plan -> Red. Otherwise -> Green.
                                        const color = (entry.Plan > 0 && entry.Actual < entry.Plan) ? "#ef4444" : "#22c55e";
                                        return <Cell key={`cell-${index}`} fill={color} />;
                                    })}
                                </Bar>
                                {!isContainer && <Line type="step" dataKey="Plan" stroke="#94a3b8" strokeDasharray="3 3" dot={false} strokeWidth={1} />}
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
                        <p className="text-muted-foreground">{t('command_desc')}</p>
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
                                        <SelectItem key={d.id} value={d.id}>{language === 'en' && d.name_en ? d.name_en : d.name_vi}</SelectItem>
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

                <TabsContent value="stations" className="mt-0">
                    <div className="mb-4 grid gap-4 grid-cols-1 md:grid-cols-2">
                        {/* Total Factory Card - Full Width / 2 columns */}
                        {renderMiniDashboard("all", t('all_factory_card'), true)}

                        {/* Dedicated Container Export Card */}
                        {renderMiniDashboard("container", t('container') || "Xuất Container", true)}
                    </div>

                    {/* 9 MINI DASHBOARDS GRID - 3x3 format on standard desktops */}
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                        {/* Department Cards */}
                        {departments.map(d => renderMiniDashboard(d.id, language === 'en' && d.name_en ? d.name_en : d.name_vi))}
                    </div>
                </TabsContent>

                <TabsContent value="regions" className="mt-0">
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                        {renderMiniDashboard("region-RCN", t('region_rcn'), true)}
                        {renderMiniDashboard("region-LCA", t('region_lca'), true)}
                        {renderMiniDashboard("region-HCA", t('region_hca'), true)}
                    </div>
                </TabsContent>
            </Tabs>

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
                                        <TableHead className="text-right">Input (T)</TableHead>
                                        <TableHead className="text-right">Output (T)</TableHead>
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
                                            <TableCell className="text-right">{d.downtime_min}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
