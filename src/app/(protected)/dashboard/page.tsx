"use client"

import { useState, useEffect } from "react"
import { format, startOfMonth, startOfWeek } from "date-fns"
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
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Legend,
    AreaChart,
    Area
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"

export default function DashboardPage() {
    const supabase = createClient()
    const [dateRange, setDateRange] = useState("month") // default current month
    const [selectedDept, setSelectedDept] = useState("all")
    const [departments, setDepartments] = useState<{ id: string, name_vi: string }[]>([])

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
            const { data } = await supabase.from("departments").select("id, name_vi").order("sort_order")
            if (data) setDepartments(data)
        }
        loadDepts()
    }, [])

    // Helper function to build summary object
    const buildSummary = (records: any[], isTotal: boolean) => {
        let tPlan = 0, tActual = 0, tDown = 0, tInput = 0, tOutput = 0, tWip = 0;
        records.forEach(r => {
            tPlan += Number(isTotal ? r.total_plan_ton : r.plan_ton);
            tActual += Number(isTotal ? r.total_actual_ton : r.actual_ton);
            tDown += Number(isTotal ? r.total_downtime_min : r.downtime_min);
            tInput += Number(isTotal ? r.total_input_ton : r.input_ton);
            tOutput += Number(isTotal ? r.total_good_output_ton : r.good_output_ton);
            tWip = Number(isTotal ? r.total_wip_close_ton : r.wip_close_ton);
        });
        return {
            totalPlan: tPlan,
            totalActual: tActual,
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

            // 1. Fetch Total Factory Data
            const { data: totalData } = await supabase
                .from("v_dashboard_total_daily")
                .select("*")
                .order("work_date")

            if (totalData) {
                const history = totalData.map(d => ({
                    name: format(new Date(d.work_date), 'dd/MM'),
                    Actual: Number(d.total_actual_ton),
                    Plan: Number(d.total_plan_ton)
                }));
                dashboards["all"] = {
                    summary: buildSummary(totalData, true),
                    history
                };
            }

            // 2. Fetch All Individual Dept Data
            const { data: dData } = await supabase
                .from("v_dashboard_daily")
                .select("*")
                .order("work_date")

            if (dData) {
                // Group by department ID
                const grouped = dData.reduce((acc: any, curr: any) => {
                    if (!acc[curr.department_id]) acc[curr.department_id] = [];
                    acc[curr.department_id].push(curr);
                    return acc;
                }, {});

                // Build summary and history for each department
                Object.keys(grouped).forEach(deptId => {
                    const records = grouped[deptId];
                    const history = records.map((d: any) => ({
                        name: format(new Date(d.work_date), 'dd/MM'),
                        Actual: Number(d.actual_ton),
                        Plan: Number(d.plan_ton)
                    }));
                    dashboards[deptId] = {
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
    }, [selectedDept, dateRange])

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
                            <p className="text-xs text-muted-foreground mb-1">Actual / Plan</p>
                            <div className="text-lg font-bold">{summary.totalActual.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ {summary.totalPlan.toFixed(1)} T</span></div>
                            <p className="text-[10px] sm:text-xs text-primary mt-1 font-medium">
                                {summary.variance >= 0 ? `+${summary.variance.toFixed(1)} Tấn` : `${summary.variance.toFixed(1)} Tấn`}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Tỷ lệ (Achv %)</p>
                            <div className="text-lg font-bold flex items-center gap-1">
                                {summary.achivementPct.toFixed(1)}%
                                {summary.achivementPct >= 100 ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                            </div>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Yield (Thu hồi)</p>
                            <div className="text-md font-bold text-gray-700">{summary.yieldPct > 0 ? `${summary.yieldPct.toFixed(1)}%` : 'N/A'}</div>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Downtime</p>
                            <div className="text-md font-bold text-amber-600 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {summary.downtime}p
                            </div>
                        </div>
                    </div>
                    {/* Sparkline chart */}
                    <div className="h-16 w-full mt-auto border-t pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id={`colorActual-${id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Tooltip contentStyle={{ fontSize: '10px', padding: '2px 4px' }} />
                                <Area type="monotone" dataKey="Actual" stroke="var(--color-primary)" fillOpacity={1} fill={`url(#colorActual-${id})`} />
                                <Line type="monotone" dataKey="Plan" stroke="#94a3b8" strokeDasharray="3 3" dot={false} strokeWidth={1} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="flex-col md:flex">
            <div className="flex items-center justify-between space-y-2 border-b pb-4 mb-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Command Center</h2>
                    <p className="text-muted-foreground">Theo dõi toàn cảnh tất cả phòng ban</p>
                </div>
                <div className="flex space-x-2">
                    <Select value={selectedDept} onValueChange={setSelectedDept}>
                        <SelectTrigger className="w-[180px] hidden md:flex">
                            <SelectValue placeholder="Bảng Data phía dưới" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toàn bộ Nhà Máy</SelectItem>
                            {departments.map(d => (
                                <SelectItem key={d.id} value={d.id}>{d.name_vi}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={handleExportCSV}>
                        <Download className="h-4 w-4 mr-2" />
                        Export <span className="hidden sm:inline">&nbsp;CSV</span>
                    </Button>
                </div>
            </div>

            {/* 9 MINI DASHBOARDS GRID */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {/* Total Factory Card */}
                {renderMiniDashboard("all", "CẢ NHÀ MÁY (TỔNG HỢP)", true)}

                {/* Department Cards */}
                {departments.map(d => renderMiniDashboard(d.id, d.name_vi))}
            </div>

            <div className="grid gap-4 mt-4">
                <Card className="bg-white">
                    <CardHeader>
                        <CardTitle className="text-xl">{selectedDept === 'all' ? 'Chi tiết Báo cáo Tổng hợp' : 'Chi tiết Báo cáo Theo Ngày'}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                {selectedDept === 'all' ? (
                                    <TableRow>
                                        <TableHead>Bộ phận</TableHead>
                                        <TableHead className="text-right">Plan (T)</TableHead>
                                        <TableHead className="text-right">Actual (T)</TableHead>
                                        <TableHead className="text-right">% Đạt</TableHead>
                                        <TableHead className="text-right">Variance</TableHead>
                                        <TableHead className="text-right">Downtime (Phút)</TableHead>
                                    </TableRow>
                                ) : (
                                    <TableRow>
                                        <TableHead>Ngày</TableHead>
                                        <TableHead className="text-right">Plan (T)</TableHead>
                                        <TableHead className="text-right">Actual (T)</TableHead>
                                        <TableHead className="text-right">Input (T)</TableHead>
                                        <TableHead className="text-right">Output (T)</TableHead>
                                        <TableHead className="text-right">Downtime (Phút)</TableHead>
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
