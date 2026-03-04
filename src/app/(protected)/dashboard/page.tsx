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
    Legend
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

    // Data States
    const [dailyData, setDailyData] = useState<any[]>([])
    const [deptData, setDeptData] = useState<any[]>([])
    const [summary, setSummary] = useState({
        totalActual: 0,
        totalPlan: 0,
        achivementPct: 0,
        variance: 0,
        mtdActual: 0,
        mtdPlan: 0,
        wtdActual: 0,
        wtdPlan: 0,
        downtime: 0,
        wipClose: 0,
        yieldPct: 0
    })

    // Load Departments
    useEffect(() => {
        async function loadDepts() {
            const { data } = await supabase.from("departments").select("id, name_vi").order("sort_order")
            if (data) setDepartments(data)
        }
        loadDepts()
    }, [])

    // Load Dashboard Data
    useEffect(() => {
        async function fetchDashboard() {
            // For a real app, date logic would filter properly, using simple logic here
            const today = new Date()
            // Let's assume view returns the total directly for all

            if (selectedDept === "all") {
                const { data: totalData } = await supabase
                    .from("v_dashboard_total_daily")
                    .select("*")
                    .order("work_date")

                if (totalData) {
                    setDailyData(totalData.map(d => ({
                        name: format(new Date(d.work_date), 'dd/MM'),
                        Actual: Number(d.total_actual_ton),
                        Plan: Number(d.total_plan_ton)
                    })))

                    let tPlan = 0, tActual = 0, tDown = 0, tInput = 0, tOutput = 0, tWip = 0
                    totalData.forEach(r => {
                        tPlan += Number(r.total_plan_ton)
                        tActual += Number(r.total_actual_ton)
                        tDown += Number(r.total_downtime_min)
                        tInput += Number(r.total_input_ton)
                        tOutput += Number(r.total_good_output_ton)
                        tWip = Number(r.total_wip_close_ton) // Taking last day WIP for total approx
                    })

                    setSummary({
                        totalPlan: tPlan,
                        totalActual: tActual,
                        achivementPct: tPlan > 0 ? (tActual / tPlan) * 100 : 0,
                        variance: tActual - tPlan,
                        mtdActual: tActual, mtdPlan: tPlan, // simplified demo
                        wtdActual: tActual, wtdPlan: tPlan, // simplified demo
                        downtime: tDown,
                        wipClose: tWip,
                        yieldPct: tInput > 0 ? (tOutput / tInput) * 100 : 0
                    })
                }

                // Aggregate by Dept for Table/BarChart
                const { data: dData } = await supabase
                    .from("v_dashboard_daily")
                    .select("dept_name_vi, actual_ton, plan_ton, downtime_min")

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
                }

            } else {
                // Individual Dept
                const { data: dData } = await supabase
                    .from("v_dashboard_daily")
                    .select("*")
                    .eq("department_id", selectedDept)
                    .order("work_date")

                if (dData) {
                    setDailyData(dData.map(d => ({
                        name: format(new Date(d.work_date), 'dd/MM'),
                        Actual: Number(d.actual_ton),
                        Plan: Number(d.plan_ton)
                    })))

                    let tPlan = 0, tActual = 0, tDown = 0, tInput = 0, tOutput = 0, tWip = 0
                    dData.forEach(r => {
                        tPlan += Number(r.plan_ton)
                        tActual += Number(r.actual_ton)
                        tDown += Number(r.downtime_min)
                        tInput += Number(r.input_ton)
                        tOutput += Number(r.good_output_ton)
                        tWip = Number(r.wip_close_ton)
                    })

                    setSummary({
                        totalPlan: tPlan,
                        totalActual: tActual,
                        achivementPct: tPlan > 0 ? (tActual / tPlan) * 100 : 0,
                        variance: tActual - tPlan,
                        mtdActual: tActual, mtdPlan: tPlan,
                        wtdActual: tActual, wtdPlan: tPlan,
                        downtime: tDown,
                        wipClose: tWip,
                        yieldPct: tInput > 0 ? (tOutput / tInput) * 100 : 0
                    })
                }
            }
        }
        fetchDashboard()
    }, [selectedDept, dateRange])

    const handleExportCSV = () => {
        const headers = ["Bộ phận", "Plan (Tấn)", "Actual (Tấn)", "% Đạt", "Variance (Tấn)", "Downtime (Phút)"];
        const rows = deptData.map(d => {
            const pct = d.Plan > 0 ? ((d.Actual / d.Plan) * 100).toFixed(1) : "0.0";
            const variance = (d.Actual - d.Plan).toFixed(2);
            return `"${d.name}",${d.Plan},${d.Actual},${pct},${variance},${d.Down}`;
        });
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


    return (
        <div className="flex-col md:flex">
            <div className="flex items-center justify-between space-y-2 border-b pb-4 mb-4">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <div className="flex space-x-2">
                    <Select value={selectedDept} onValueChange={setSelectedDept}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Bộ phận" />
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
                        Export CSV
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-white shadow-sm hover:shadow-md transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Actual vs Plan</CardTitle>
                        <FileSymlink className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.totalActual.toFixed(2)} / {summary.totalPlan.toFixed(2)} T</div>
                        <p className="text-xs text-muted-foreground mt-1 text-primary">
                            {summary.variance >= 0 ? `Vượt: +${summary.variance.toFixed(2)}` : `Thiếu: ${summary.variance.toFixed(2)}`} Tấn
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white shadow-sm hover:shadow-md transition-all relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 border-l border-b border-primary/20 rounded-bl-3xl bg-primary/5">
                        <Percent className="h-4 w-4 text-primary" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Tỷ lệ Đạt (Achievement)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.achivementPct.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground mt-1">MTD: {summary.achivementPct.toFixed(1)}%</p>
                    </CardContent>
                </Card>

                <Card className="bg-white shadow-sm hover:shadow-md transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Yield (Thu hồi/Hao hụt)</CardTitle>
                        {summary.yieldPct > 80 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.yieldPct > 0 ? `${summary.yieldPct.toFixed(2)}%` : 'N/A'}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Trung bình Weighted
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-white shadow-sm hover:shadow-md transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Tổng Downtime</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.downtime} Phút</div>
                        <p className="text-xs text-muted-foreground mt-1">WIP Tồn cuối: {summary.wipClose.toFixed(2)} Tấn</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
                <Card className="lg:col-span-4 bg-white">
                    <CardHeader>
                        <CardTitle>Biểu đồ Sản Lượng Ngày (Actual vs Plan)</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={dailyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={10} fontSize={12} />
                                <YAxis axisLine={false} tickLine={false} fontSize={12} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="Actual" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="Plan" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3 bg-white">
                    <CardHeader>
                        <CardTitle>Phân bổ theo Bộ phận</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={deptData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} fontSize={10} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="Actual" fill="var(--color-primary)" radius={[0, 4, 4, 0]} barSize={15} />
                                <Bar dataKey="Plan" fill="#cbd5e1" radius={[0, 4, 4, 0]} barSize={15} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 mt-4">
                <Card className="bg-white">
                    <CardHeader>
                        <CardTitle className="text-xl">Chi tiết Báo cáo Bộ Phận</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Bộ phận</TableHead>
                                    <TableHead className="text-right">Plan (T)</TableHead>
                                    <TableHead className="text-right">Actual (T)</TableHead>
                                    <TableHead className="text-right">% Đạt</TableHead>
                                    <TableHead className="text-right">Variance</TableHead>
                                    <TableHead className="text-right">Downtime (Phút)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deptData.map((d) => {
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
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
