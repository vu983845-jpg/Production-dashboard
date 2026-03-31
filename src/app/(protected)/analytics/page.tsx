"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { format, startOfMonth, endOfMonth, subMonths, parseISO, getDaysInMonth, getDay } from "date-fns"
import { vi } from "date-fns/locale"
import {
    TrendingUp, TrendingDown, BarChart3, Target, Zap, AlertTriangle, Award,
    ChevronDown, RefreshCw, Calendar, Activity, Layers
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
    ComposedChart, BarChart, LineChart, ScatterChart,
    Bar, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, ReferenceLine, Cell, Area, AreaChart
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

// ── Types ────────────────────────────────────────────────────────────────────
interface MonthlyKPI {
    monthLabel: string      // "T01/2025"
    monthKey: string        // "2025-01"
    actual: number
    plan: number
    achievePct: number
    downtime: number
    daysWithData: number
    avgBroken: number
}

interface DeptMonth {
    deptCode: string
    deptName: string
    actual: number
    plan: number
    achievePct: number
    downtime: number
}

interface DailyRaw {
    work_date: string
    actual_ton: number
    plan_ton: number
    downtime_min: number
    broken_pct?: number
    avg_broken_pct?: number
}

interface Department {
    id: string
    code: string
    name_vi: string
    name_en: string
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PRODUCTION_DEPT_CODES = ['SHELL', 'STEAM', 'PEEL_MC', 'CS', 'BORMA', 'PACK', 'FGWH']

const LINE_COLORS = [
    "#E30613", "#2563EB", "#16A34A", "#D97706", "#7C3AED",
    "#0891B2", "#DC2626", "#059669", "#CA8A04", "#9333EA"
]

const MONTH_OPTIONS = [3, 6, 9, 12]

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMonthLabel(date: Date) {
    return `T${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
}

function getDowntimeColor(mins: number): string {
    if (mins === 0) return "bg-slate-100 text-slate-400"
    if (mins < 60) return "bg-green-100 text-green-700"
    if (mins < 120) return "bg-yellow-100 text-yellow-700"
    if (mins < 240) return "bg-orange-100 text-orange-700"
    return "bg-red-100 text-red-700"
}

function getDowntimeIntensity(mins: number): string {
    if (mins === 0) return "bg-slate-100"
    if (mins < 30) return "bg-emerald-200"
    if (mins < 60) return "bg-yellow-200"
    if (mins < 120) return "bg-orange-300"
    if (mins < 240) return "bg-red-400"
    return "bg-red-600"
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────
const TrendTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-sm min-w-[160px]">
            <p className="font-semibold text-slate-700 mb-2">{label}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} className="flex justify-between gap-4">
                    <span style={{ color: p.color }}>{p.name}</span>
                    <span className="font-bold">{typeof p.value === 'number' ? p.value.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : p.value}</span>
                </div>
            ))}
        </div>
    )
}

// ── KPI Summary Card ──────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, trend, color }: {
    label: string; value: string; sub?: string; icon: any; trend?: number; color?: string
}) {
    const isUp = trend !== undefined && trend >= 0
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
        >
            <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color ?? "bg-red-50"}`}>
                    <Icon className="h-5 w-5 text-[#E30613]" />
                </div>
                {trend !== undefined && (
                    <span className={`text-xs font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full ${isUp ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                        {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {Math.abs(trend).toFixed(1)}%
                    </span>
                )}
            </div>
            <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">{label}</p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">{value}</p>
                {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
            </div>
        </motion.div>
    )
}

// ── Section Header ────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, desc }: { icon: any; title: string; desc?: string }) {
    return (
        <div className="flex items-start gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="h-5 w-5 text-[#E30613]" />
            </div>
            <div>
                <h2 className="text-base font-bold text-slate-800">{title}</h2>
                {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
    const supabase = createClient()
    const now = new Date()

    const [departments, setDepartments] = useState<Department[]>([])
    const [selectedDept, setSelectedDept] = useState("SHELL")
    const [monthRange, setMonthRange] = useState(6)
    const [loading, setLoading] = useState(false)

    // Data states
    const [trendData, setTrendData] = useState<MonthlyKPI[]>([])
    const [currentMonthDaily, setCurrentMonthDaily] = useState<DailyRaw[]>([])
    const [allDeptMonth, setAllDeptMonth] = useState<DeptMonth[]>([])
    const [correlationData, setCorrelationData] = useState<{ x: number; y: number; date: string }[]>([])

    // Load departments
    useEffect(() => {
        supabase.from("departments").select("id, code, name_vi, name_en").order("sort_order")
            .then(({ data }) => {
                if (data) {
                    const prod = data.filter(d => PRODUCTION_DEPT_CODES.includes(d.code))
                    setDepartments(prod)
                }
            })
    }, [])

    // ── Fetch multi-month trend ──────────────────────────────────────────────
    const fetchAnalytics = useCallback(async () => {
        setLoading(true)

        // Build month ranges
        const months: Date[] = []
        for (let i = monthRange - 1; i >= 0; i--) {
            months.push(subMonths(now, i))
        }

        // Fetch each month in parallel
        const monthPromises = months.map(async (m) => {
            const start = format(startOfMonth(m), "yyyy-MM-dd")
            const end = format(endOfMonth(m), "yyyy-MM-dd")
            const { data } = await supabase
                .from("v_dashboard_daily")
                .select("work_date,actual_ton,plan_ton,downtime_min,broken_pct,avg_broken_pct")
                .eq("dept_code", selectedDept)
                .gte("work_date", start)
                .lte("work_date", end)
            return { month: m, rows: (data ?? []) as DailyRaw[] }
        })

        const results = await Promise.all(monthPromises)

        // Aggregate into monthly KPIs
        const trend: MonthlyKPI[] = results.map(({ month, rows }) => {
            const actual = rows.reduce((s, r) => s + Number(r.actual_ton || 0), 0)
            const plan = rows.reduce((s, r) => s + Number(r.plan_ton || 0), 0)
            const downtime = rows.reduce((s, r) => s + Number(r.downtime_min || 0), 0)
            const daysWithData = rows.filter(r => Number(r.actual_ton) > 0).length
            const sumBrokenW = rows.reduce((s, r) => s + (Number(r.broken_pct || r.avg_broken_pct || 0) * Number(r.actual_ton || 0)), 0)
            return {
                monthLabel: formatMonthLabel(month),
                monthKey: format(month, "yyyy-MM"),
                actual: +actual.toFixed(1),
                plan: +plan.toFixed(1),
                achievePct: plan > 0 ? +(actual / plan * 100).toFixed(1) : 0,
                downtime: +downtime.toFixed(0),
                daysWithData,
                avgBroken: actual > 0 ? +(sumBrokenW / actual).toFixed(2) : 0,
            }
        })
        setTrendData(trend)

        // Current month daily (for heatmap & projection)
        const currentStart = format(startOfMonth(now), "yyyy-MM-dd")
        const currentEnd = format(endOfMonth(now), "yyyy-MM-dd")
        const { data: dailyData } = await supabase
            .from("v_dashboard_daily")
            .select("work_date,actual_ton,plan_ton,downtime_min")
            .eq("dept_code", selectedDept)
            .gte("work_date", currentStart)
            .lte("work_date", currentEnd)
            .order("work_date")
        setCurrentMonthDaily((dailyData ?? []) as DailyRaw[])

        // Correlation data: downtime vs actual for selected dept (all months)
        const allRows: DailyRaw[] = results.flatMap(r => r.rows).filter(r => Number(r.actual_ton) > 0)
        setCorrelationData(allRows.map(r => ({
            x: Number(r.downtime_min || 0),
            y: Number(r.actual_ton || 0),
            date: r.work_date,
        })))

        // All-dept comparison for current month
        const deptPromises = departments.map(async (d) => {
            const { data } = await supabase
                .from("v_dashboard_daily")
                .select("actual_ton,plan_ton,downtime_min")
                .eq("dept_code", d.code)
                .gte("work_date", currentStart)
                .lte("work_date", currentEnd)
            const rows = data ?? []
            const actual = rows.reduce((s: number, r: any) => s + Number(r.actual_ton || 0), 0)
            const plan = rows.reduce((s: number, r: any) => s + Number(r.plan_ton || 0), 0)
            const downtime = rows.reduce((s: number, r: any) => s + Number(r.downtime_min || 0), 0)
            return {
                deptCode: d.code,
                deptName: d.name_vi || d.name_en,
                actual: +actual.toFixed(1),
                plan: +plan.toFixed(1),
                achievePct: plan > 0 ? +(actual / plan * 100).toFixed(1) : 0,
                downtime,
            } as DeptMonth
        })
        if (departments.length > 0) {
            const deptResults = await Promise.all(deptPromises)
            setAllDeptMonth(deptResults.filter(d => d.plan > 0).sort((a, b) => b.achievePct - a.achievePct))
        }

        setLoading(false)
    }, [selectedDept, monthRange, departments])

    useEffect(() => {
        if (departments.length > 0) fetchAnalytics()
    }, [departments, selectedDept, monthRange])

    // ── Derived: MTD Projection ──────────────────────────────────────────────
    const mtdProjection = useMemo(() => {
        const today = now.getDate()
        const daysInMonth = getDaysInMonth(now)
        const daysElapsed = Math.max(1, today)
        const actual = currentMonthDaily.reduce((s, r) => s + Number(r.actual_ton || 0), 0)
        const plan = currentMonthDaily.reduce((s, r) => s + Number(r.plan_ton || 0), 0) / daysElapsed * daysInMonth
        const projectedEndOfMonth = actual / daysElapsed * daysInMonth
        const gap = projectedEndOfMonth - plan
        return {
            actual: +actual.toFixed(1),
            projected: +projectedEndOfMonth.toFixed(1),
            plan: +plan.toFixed(1),
            gap: +gap.toFixed(1),
            pct: plan > 0 ? +(projectedEndOfMonth / plan * 100).toFixed(1) : 0,
            daysElapsed,
            daysInMonth,
        }
    }, [currentMonthDaily])

    // ── Derived: Heatmap data ────────────────────────────────────────────────
    const heatmapData = useMemo(() => {
        const daysInMonth = getDaysInMonth(now)
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        const startDow = getDay(firstDay) // 0=Sun

        const dayMap: Record<string, number> = {}
        currentMonthDaily.forEach(r => {
            dayMap[r.work_date] = Number(r.downtime_min || 0)
        })

        const cells = []
        // Padding cells for first week
        for (let i = 0; i < startDow; i++) {
            cells.push({ day: null, mins: 0 })
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = format(new Date(now.getFullYear(), now.getMonth(), d), "yyyy-MM-dd")
            cells.push({ day: d, date: dateStr, mins: dayMap[dateStr] ?? -1 })
        }
        return cells
    }, [currentMonthDaily])

    // ── Derived: Summary stats ────────────────────────────────────────────────
    const summaryStats = useMemo(() => {
        if (!trendData.length) return null
        const last = trendData[trendData.length - 1]
        const prev = trendData[trendData.length - 2]
        const avgAchieve = trendData.reduce((s, m) => s + m.achievePct, 0) / trendData.length
        const totalDowntime = trendData.reduce((s, m) => s + m.downtime, 0)
        const bestMonth = [...trendData].sort((a, b) => b.achievePct - a.achievePct)[0]
        return { last, prev, avgAchieve: +avgAchieve.toFixed(1), totalDowntime, bestMonth }
    }, [trendData])

    const selectedDeptInfo = departments.find(d => d.code === selectedDept)

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-8 pb-10">
            {/* ── Page Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <BarChart3 className="h-7 w-7 text-[#E30613]" />
                        Analytics
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Phân tích xu hướng & hiệu suất sản xuất</p>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Dept selector */}
                    <div className="relative">
                        <select
                            value={selectedDept}
                            onChange={e => setSelectedDept(e.target.value)}
                            className="appearance-none text-sm font-semibold bg-white border border-slate-200 rounded-xl pl-4 pr-8 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E30613]/20 cursor-pointer"
                        >
                            {departments.map(d => (
                                <option key={d.code} value={d.code}>{d.name_vi || d.code}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Month range selector */}
                    <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                        {MONTH_OPTIONS.map(m => (
                            <button
                                key={m}
                                onClick={() => setMonthRange(m)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${monthRange === m
                                    ? "bg-white shadow text-[#E30613]"
                                    : "text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                {m}T
                            </button>
                        ))}
                    </div>

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={fetchAnalytics}
                        disabled={loading}
                        className="gap-1.5 rounded-xl"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        {loading ? "Đang tải..." : "Làm mới"}
                    </Button>
                </div>
            </div>

            {/* ── Loading skeleton ── */}
            <AnimatePresence>
                {loading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl"
                    />
                )}
            </AnimatePresence>

            {/* ── Summary KPI Cards ── */}
            {summaryStats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        label={`Đạt KPI tháng này`}
                        value={`${summaryStats.last?.achievePct ?? 0}%`}
                        sub={`Kế hoạch vs Thực tế`}
                        icon={Target}
                        trend={summaryStats.prev ? summaryStats.last.achievePct - summaryStats.prev.achievePct : undefined}
                        color="bg-red-50"
                    />
                    <StatCard
                        label={`TB ${monthRange} tháng`}
                        value={`${summaryStats.avgAchieve}%`}
                        sub={`Tỷ lệ đạt KPI trung bình`}
                        icon={Activity}
                        color="bg-blue-50"
                    />
                    <StatCard
                        label="Tháng tốt nhất"
                        value={`${summaryStats.bestMonth?.achievePct ?? 0}%`}
                        sub={summaryStats.bestMonth?.monthLabel}
                        icon={Award}
                        color="bg-green-50"
                    />
                    <StatCard
                        label="Tổng Downtime"
                        value={`${(summaryStats.totalDowntime / 60).toFixed(0)}h`}
                        sub={`Trong ${monthRange} tháng qua`}
                        icon={AlertTriangle}
                        color="bg-orange-50"
                    />
                </div>
            )}

            {/* ── Section 1: Multi-Month Trend ── */}
            <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
                <CardHeader className="pb-2">
                    <SectionHeader
                        icon={TrendingUp}
                        title={`Xu hướng sản lượng — ${selectedDeptInfo?.name_vi ?? selectedDept}`}
                        desc={`${monthRange} tháng gần nhất | Thực tế vs Kế hoạch`}
                    />
                </CardHeader>
                <CardContent>
                    {trendData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Không có dữ liệu</div>
                    ) : (
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: "#64748b" }} />
                                    <YAxis yAxisId="ton" tick={{ fontSize: 12, fill: "#64748b" }} unit="T" width={55} />
                                    <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 12, fill: "#64748b" }} unit="%" width={45} domain={[0, 120]} />
                                    <Tooltip content={<TrendTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar yAxisId="ton" dataKey="actual" name="Thực tế (T)" fill="#E30613" radius={[4, 4, 0, 0]} maxBarSize={48} />
                                    <Bar yAxisId="ton" dataKey="plan" name="Kế hoạch (T)" fill="#e2e8f0" radius={[4, 4, 0, 0]} maxBarSize={48} />
                                    <Line yAxisId="pct" type="monotone" dataKey="achievePct" name="Đạt KPI (%)" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, fill: "#2563eb" }} />
                                    <ReferenceLine yAxisId="pct" y={100} stroke="#16a34a" strokeDasharray="4 4" label={{ value: "100%", position: "right", fontSize: 11, fill: "#16a34a" }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Section 2: Downtime Trend ── */}
            <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
                <CardHeader className="pb-2">
                    <SectionHeader
                        icon={AlertTriangle}
                        title="Xu hướng Downtime theo tháng"
                        desc={`${monthRange} tháng | Tổng thời gian dừng máy (giờ)`}
                    />
                </CardHeader>
                <CardContent>
                    {trendData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Không có dữ liệu</div>
                    ) : (
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData.map(d => ({
                                    ...d,
                                    downtimeHrs: +(d.downtime / 60).toFixed(1)
                                }))} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                                    <defs>
                                        <linearGradient id="dtGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#E30613" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#E30613" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: "#64748b" }} />
                                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} unit="h" width={45} />
                                    <Tooltip content={<TrendTooltip />} />
                                    <Area type="monotone" dataKey="downtimeHrs" name="Downtime (h)" stroke="#E30613" strokeWidth={2.5} fill="url(#dtGrad)" dot={{ r: 4, fill: "#E30613" }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Section 3: Heatmap & MTD Projection (2 col) ── */}
            <div className="grid lg:grid-cols-2 gap-4">

                {/* Heatmap */}
                <Card className="rounded-2xl border-slate-100 shadow-sm">
                    <CardHeader className="pb-2">
                        <SectionHeader
                            icon={Calendar}
                            title={`Heatmap Downtime — ${format(now, "MM/yyyy")}`}
                            desc="Cường độ dừng máy theo ngày trong tháng"
                        />
                    </CardHeader>
                    <CardContent>
                        {/* Day of week headers */}
                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map(d => (
                                <div key={d} className="text-center text-[10px] font-semibold text-slate-400">{d}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {heatmapData.map((cell, i) => (
                                <div
                                    key={i}
                                    title={cell.day ? (cell.mins >= 0 ? `Ngày ${cell.day}: ${cell.mins} phút` : `Ngày ${cell.day}: Chưa có dữ liệu`) : ""}
                                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] font-bold transition-transform hover:scale-110 cursor-default
                                        ${!cell.day ? "bg-transparent" : cell.mins < 0 ? "bg-slate-50 text-slate-300" : getDowntimeIntensity(cell.mins) + " text-white"}`}
                                >
                                    {cell.day && (
                                        <>
                                            <span className={cell.mins >= 0 ? "text-white/90 font-black" : "text-slate-300"}>{cell.day}</span>
                                            {cell.mins > 0 && <span className="text-[8px] opacity-80">{cell.mins >= 60 ? `${(cell.mins / 60).toFixed(0)}h` : `${cell.mins}'`}</span>}
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        {/* Legend */}
                        <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-500 flex-wrap">
                            <span>Downtime:</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 inline-block"></span> 0</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 inline-block"></span> &lt;30'</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block"></span> &lt;60'</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-300 inline-block"></span> &lt;2h</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block"></span> &lt;4h</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600 inline-block"></span> ≥4h</span>
                        </div>
                    </CardContent>
                </Card>

                {/* MTD Projection */}
                <Card className="rounded-2xl border-slate-100 shadow-sm">
                    <CardHeader className="pb-2">
                        <SectionHeader
                            icon={Target}
                            title="Dự báo cuối tháng (MTD)"
                            desc={`${format(now, "MMMM yyyy", { locale: vi })} · Dựa trên tốc độ ${mtdProjection.daysElapsed} ngày qua`}
                        />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {currentMonthDaily.length === 0 ? (
                            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Chưa có dữ liệu tháng này</div>
                        ) : (
                            <>
                                {/* Gauge bar */}
                                <div>
                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                        <span>Dự báo đạt: <strong className={mtdProjection.pct >= 100 ? "text-green-600" : "text-orange-500"}>{mtdProjection.pct}%</strong></span>
                                        <span>Kế hoạch: {mtdProjection.plan.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} T</span>
                                    </div>
                                    <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, mtdProjection.pct)}%` }}
                                            transition={{ duration: 0.8, ease: "easeOut" }}
                                            className={`h-full rounded-full ${mtdProjection.pct >= 100 ? "bg-green-500" : mtdProjection.pct >= 90 ? "bg-yellow-400" : "bg-red-500"}`}
                                        />
                                    </div>
                                </div>

                                {/* Stats grid */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">Thực tế MTD</p>
                                        <p className="text-xl font-black text-slate-800">{mtdProjection.actual.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</p>
                                        <p className="text-[10px] text-slate-400">tấn</p>
                                    </div>
                                    <div className="text-center p-3 rounded-xl border-2 border-blue-100 bg-blue-50">
                                        <p className="text-[10px] text-blue-600 uppercase tracking-wide font-semibold">Dự báo EOM</p>
                                        <p className="text-xl font-black text-blue-700">{mtdProjection.projected.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</p>
                                        <p className="text-[10px] text-blue-400">tấn</p>
                                    </div>
                                    <div className={`text-center p-3 rounded-xl border-2 ${mtdProjection.gap >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                                        <p className={`text-[10px] uppercase tracking-wide font-semibold ${mtdProjection.gap >= 0 ? "text-green-600" : "text-red-500"}`}>Gap</p>
                                        <p className={`text-xl font-black ${mtdProjection.gap >= 0 ? "text-green-700" : "text-red-600"}`}>
                                            {mtdProjection.gap >= 0 ? "+" : ""}{mtdProjection.gap.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                                        </p>
                                        <p className={`text-[10px] ${mtdProjection.gap >= 0 ? "text-green-400" : "text-red-400"}`}>tấn so KH</p>
                                    </div>
                                </div>

                                {/* Progress within month */}
                                <div className="text-xs text-slate-500 text-center">
                                    Ngày {mtdProjection.daysElapsed} / {mtdProjection.daysInMonth} trong tháng
                                    <span className="ml-2 text-slate-300">|</span>
                                    <span className="ml-2">Còn {mtdProjection.daysInMonth - mtdProjection.daysElapsed} ngày</span>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Section 4: Department Ranking ── */}
            <Card className="rounded-2xl border-slate-100 shadow-sm">
                <CardHeader className="pb-2">
                    <SectionHeader
                        icon={Award}
                        title={`Ranking Bộ phận — ${format(now, "MM/yyyy")}`}
                        desc="So sánh % đạt KPI tất cả bộ phận trong tháng hiện tại"
                    />
                </CardHeader>
                <CardContent>
                    {allDeptMonth.length === 0 ? (
                        <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
                    ) : (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={allDeptMonth}
                                    layout="vertical"
                                    margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                    <XAxis type="number" domain={[0, 120]} unit="%" tick={{ fontSize: 11, fill: "#64748b" }} />
                                    <YAxis type="category" dataKey="deptCode" tick={{ fontSize: 12, fill: "#475569", fontWeight: 600 }} width={65} />
                                    <Tooltip
                                        formatter={(v: any) => [`${v}%`, "Đạt KPI"]}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null
                                            const d = payload[0].payload as DeptMonth
                                            return (
                                                <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-sm">
                                                    <p className="font-bold text-slate-700">{d.deptName}</p>
                                                    <p>Thực tế: <strong>{d.actual.toLocaleString()} T</strong></p>
                                                    <p>Kế hoạch: <strong>{d.plan.toLocaleString()} T</strong></p>
                                                    <p>Đạt KPI: <strong className={d.achievePct >= 100 ? "text-green-600" : "text-orange-500"}>{d.achievePct}%</strong></p>
                                                    <p>Downtime: <strong>{(d.downtime / 60).toFixed(0)}h</strong></p>
                                                </div>
                                            )
                                        }}
                                    />
                                    <ReferenceLine x={100} stroke="#16a34a" strokeDasharray="4 4" />
                                    <Bar dataKey="achievePct" name="Đạt KPI (%)" radius={[0, 6, 6, 0]} maxBarSize={22}
                                        label={{ position: "right", formatter: (v: any) => `${v}%`, fontSize: 11, fill: "#475569" }}
                                    >
                                        {allDeptMonth.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.achievePct >= 100 ? "#16a34a" : entry.achievePct >= 90 ? "#d97706" : "#E30613"}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Section 5: Downtime vs Output Correlation ── */}
            <Card className="rounded-2xl border-slate-100 shadow-sm">
                <CardHeader className="pb-2">
                    <SectionHeader
                        icon={Layers}
                        title={`Tương quan Downtime ↔ Sản lượng — ${selectedDeptInfo?.name_vi ?? selectedDept}`}
                        desc={`${monthRange} tháng | Mỗi điểm = 1 ngày sản xuất`}
                    />
                </CardHeader>
                <CardContent>
                    {correlationData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Không có dữ liệu</div>
                    ) : (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis
                                        type="number" dataKey="x" name="Downtime"
                                        label={{ value: "Downtime (phút)", position: "insideBottom", offset: -2, fontSize: 11, fill: "#94a3b8" }}
                                        tick={{ fontSize: 11, fill: "#64748b" }}
                                    />
                                    <YAxis
                                        type="number" dataKey="y" name="Sản lượng"
                                        label={{ value: "Sản lượng (T)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#94a3b8" }}
                                        tick={{ fontSize: 11, fill: "#64748b" }}
                                    />
                                    <Tooltip
                                        cursor={{ strokeDasharray: "3 3" }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null
                                            const pt = payload[0].payload
                                            return (
                                                <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-sm">
                                                    <p className="font-bold text-slate-600 text-xs mb-1">{pt.date}</p>
                                                    <p>Downtime: <strong>{pt.x} phút</strong></p>
                                                    <p>Sản lượng: <strong>{pt.y.toFixed(1)} T</strong></p>
                                                </div>
                                            )
                                        }}
                                    />
                                    <Scatter name="Ngày SX" data={correlationData} fill="#E30613" opacity={0.65} />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    <p className="text-xs text-slate-400 text-center mt-2">
                        💡 Điểm nằm phía trái & cao = ít downtime, sản lượng tốt.  Điểm phía phải & thấp = downtime nhiều, sản lượng thấp.
                    </p>
                </CardContent>
            </Card>

            {/* ── Section 6: Monthly table summary ── */}
            <Card className="rounded-2xl border-slate-100 shadow-sm">
                <CardHeader className="pb-2">
                    <SectionHeader
                        icon={BarChart3}
                        title={`Bảng tổng hợp — ${selectedDeptInfo?.name_vi ?? selectedDept}`}
                        desc={`${monthRange} tháng gần nhất`}
                    />
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="text-left py-3 px-3 text-xs uppercase tracking-wide text-slate-500 font-semibold">Tháng</th>
                                    <th className="text-right py-3 px-3 text-xs uppercase tracking-wide text-slate-500 font-semibold">Thực tế (T)</th>
                                    <th className="text-right py-3 px-3 text-xs uppercase tracking-wide text-slate-500 font-semibold">KH (T)</th>
                                    <th className="text-right py-3 px-3 text-xs uppercase tracking-wide text-slate-500 font-semibold">Đạt KPI</th>
                                    <th className="text-right py-3 px-3 text-xs uppercase tracking-wide text-slate-500 font-semibold">Downtime</th>
                                    <th className="text-right py-3 px-3 text-xs uppercase tracking-wide text-slate-500 font-semibold">Ngày SX</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trendData.map((row, i) => {
                                    const isCurrentMonth = i === trendData.length - 1
                                    return (
                                        <tr key={row.monthKey}
                                            className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${isCurrentMonth ? "bg-blue-50/60" : ""}`}
                                        >
                                            <td className="py-3 px-3 font-semibold text-slate-700">
                                                {row.monthLabel}
                                                {isCurrentMonth && <span className="ml-2 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Hiện tại</span>}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono">{row.actual.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                                            <td className="py-3 px-3 text-right font-mono text-slate-400">{row.plan.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                                            <td className="py-3 px-3 text-right">
                                                <span className={`inline-flex items-center gap-1 font-bold text-xs px-2 py-1 rounded-full
                                                    ${row.achievePct >= 100 ? "bg-green-100 text-green-700" : row.achievePct >= 90 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"}`}>
                                                    {row.achievePct >= 100 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                                    {row.achievePct}%
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-right text-slate-600">
                                                <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${getDowntimeColor(row.downtime)}`}>
                                                    {(row.downtime / 60).toFixed(0)}h
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-right text-slate-500">{row.daysWithData} ngày</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
