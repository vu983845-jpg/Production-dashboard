"use client"

import { useState, useCallback, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ddsClient } from "@/lib/supabase/dds-client"
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns"
import { Download, Search, FileText, TrendingUp, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import * as XLSX from "xlsx"

// ── Types ────────────────────────────────────────────────────────────────────
interface DailyRecord {
    work_date: string
    actual_ton: number
    plan_ton: number
    downtime_min: number
    input_ton: number
    output_ton: number
    avg_broken_pct: number
    avg_unpeel_pct: number
    note: string
}

interface SummaryData {
    totalActual: number
    totalPlan: number
    totalDowntime: number
    avgBroken: number
    avgUnpeel: number
    daysWithData: number
}

interface ShellingLineRecord {
    work_date: string
    line_code: string
    shift_name?: string
    actual_ton: number
    run_hours: number
    downtime_min?: number
    manpower?: number
    note?: string
}

// ── Dept type ────────────────────────────────────────────────────────────────
interface Department {
    id: string
    code: string
    name_vi: string
    name_en: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
    try { return format(parseISO(d), "dd/MM/yyyy") } catch { return d }
}

function KPICard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-black ${color ?? "text-slate-800"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
    )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ReportPage() {
    const supabase = createClient()

    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1

    const [departments, setDepartments] = useState<Department[]>([])
    const [selectedYear, setSelectedYear] = useState(currentYear)
    const [selectedMonth, setSelectedMonth] = useState(currentMonth)
    const [selectedDept, setSelectedDept] = useState("")
    const [loading, setLoading] = useState(false)
    const [records, setRecords] = useState<DailyRecord[]>([])
    const [summary, setSummary] = useState<SummaryData | null>(null)
    const [shellingLines, setShellingLines] = useState<ShellingLineRecord[]>([])
    const [selectedShellLine, setSelectedShellLine] = useState("A")
    const [hasData, setHasData] = useState(false)

    // Load departments from DB (same as dashboard)
    useEffect(() => {
        supabase.from("departments").select("id, code, name_vi, name_en").order("sort_order")
            .then(({ data }) => {
                if (data && data.length > 0) {
                    setDepartments(data)
                    setSelectedDept(data[0].code)
                }
            })
    }, [])

    const dept = departments.find(d => d.code === selectedDept)

    const fetchReport = useCallback(async () => {
        setLoading(true)
        setHasData(false)
        const start = format(startOfMonth(new Date(selectedYear, selectedMonth - 1, 1)), "yyyy-MM-dd")
        const end   = format(endOfMonth(new Date(selectedYear, selectedMonth - 1, 1)), "yyyy-MM-dd")

        const { data, error } = await supabase
            .from("v_dashboard_daily")
            .select("*")
            .eq("dept_code", selectedDept)
            .gte("work_date", start)
            .lte("work_date", end)
            .order("work_date")

        if (error) console.error("Report query error:", error)

        // Fetch DDS downtime (same as dashboard)
        const deptCodeToDDS: Record<string, string> = {
            STEAM: 'Steaming', SHELL: 'Shelling', BORMA: 'Borma',
            PEEL_MC: 'Peeling MC', CS: 'ColorSorter', HAND: 'HandPeeling', PACK: 'Packing'
        }
        const ddsDeptName = deptCodeToDDS[selectedDept]
        const ddsDownByDate: Record<string, number> = {}
        if (ddsDeptName) {
            const { data: ddsIssues } = await ddsClient
                .from('issues')
                .select('department, duration_mins, start_time')
                .eq('is_downtime', true)
                .eq('status', 'Closed')
                .eq('department', ddsDeptName)
                .gte('start_time', `${start}T00:00:00Z`)
                .lte('start_time', `${end}T23:59:59Z`)
            if (ddsIssues) {
                ddsIssues.forEach((issue: any) => {
                    const d = format(new Date(issue.start_time), 'yyyy-MM-dd')
                    ddsDownByDate[d] = (ddsDownByDate[d] || 0) + Number(issue.duration_mins || 0)
                })
            }
        }

        const rows: DailyRecord[] = (data ?? []).map((r: any) => ({
            work_date:      r.work_date,
            actual_ton:     Number(r.actual_ton || 0),
            plan_ton:       Number(r.plan_ton || 0),
            downtime_min:   ddsDownByDate[r.work_date] || Number(r.downtime_min || 0),
            input_ton:      Number(r.input_ton || 0),
            output_ton:     Number(r.output_ton || 0),
            avg_broken_pct: Number(r.broken_pct || r.avg_broken_pct || 0),
            avg_unpeel_pct: Number(r.unpeel_pct || r.avg_unpeel_pct || 0),
            note:           r.note || "",
        }))
        setRecords(rows)

        // Build summary
        const daysWithData = rows.filter(r => r.actual_ton > 0).length
        const totalActual  = rows.reduce((s, r) => s + r.actual_ton, 0)
        const totalPlan    = rows.reduce((s, r) => s + r.plan_ton, 0)
        const totalDowntime = rows.reduce((s, r) => s + r.downtime_min, 0)
        const brokenRows   = rows.filter(r => r.avg_broken_pct > 0)
        const unpeelRows   = rows.filter(r => r.avg_unpeel_pct > 0)
        setSummary({
            totalActual,
            totalPlan,
            totalDowntime,
            avgBroken:  brokenRows.length > 0 ? brokenRows.reduce((s,r) => s + r.avg_broken_pct, 0) / brokenRows.length : 0,
            avgUnpeel:  unpeelRows.length > 0 ? unpeelRows.reduce((s,r) => s + r.avg_unpeel_pct, 0) / unpeelRows.length : 0,
            daysWithData,
        })

        // Shelling lines
        if (selectedDept === "SHELL") {
            const { data: ld } = await supabase
                .from("shelling_line_daily")
                .select("work_date,line_code,shift_name,actual_ton,run_hours,downtime_min,manpower,note")
                .gte("work_date", start)
                .lte("work_date", end)
                .order("work_date", { ascending: true })
                .order("line_code", { ascending: true })
            setShellingLines(ld ?? [])
        } else {
            setShellingLines([])
        }

        setLoading(false)
        setHasData(true)
    }, [selectedYear, selectedMonth, selectedDept, supabase])

    // ── Excel Export ─────────────────────────────────────────────────────────
    const exportExcel = () => {
        if (!summary || !dept) return
        const deptName = dept.name_vi || dept.name_en
        const monthLabel = `${String(selectedMonth).padStart(2,"0")}/${selectedYear}`
        const wb = XLSX.utils.book_new()

        // Sheet 1: Summary
        const achievePct = summary.totalPlan > 0 ? (summary.totalActual / summary.totalPlan * 100).toFixed(1) : "—"
        const summaryRows = [
            ["BÁO CÁO THÁNG " + monthLabel, ""],
            ["Bộ phận", deptName],
            ["", ""],
            ["Chỉ tiêu", "Giá trị"],
            ["Sản lượng thực tế (T)", summary.totalActual.toFixed(2)],
            ["Kế hoạch MTD (T)", summary.totalPlan.toFixed(2)],
            ["MTD Achievement (%)", achievePct + "%"],
            ["Variance (T)", (summary.totalActual - summary.totalPlan).toFixed(2)],
            ["Số ngày có sản lượng", summary.daysWithData],
            ["Tổng downtime (phút)", summary.totalDowntime],
        ]
        if (summary.avgBroken > 0) summaryRows.push(["Tỷ lệ bể TB (%)", summary.avgBroken.toFixed(2) + "%"])
        if (summary.avgUnpeel > 0) summaryRows.push(["Tỷ lệ chưa lột TB (%)", summary.avgUnpeel.toFixed(2) + "%"])

        if (shellingLines.length > 0) {
            summaryRows.push(["",""])
            summaryRows.push(["SHELLING LINES - T/tháng",""])
            const lines = ["A","B","C","D1","D2"]
            lines.forEach(l => {
                const lineRows = shellingLines.filter(r => r.line_code === l)
                const lineTons = lineRows.reduce((s,r) => s + Number(r.actual_ton), 0)
                const lineHours = lineRows.reduce((s,r) => s + Number(r.run_hours), 0)
                summaryRows.push([`Line ${l} Tổng - Sản lượng (T)`, lineTons.toFixed(2)])
                summaryRows.push([`Line ${l} Tổng - Giờ chạy (h)`, lineHours.toFixed(1)])
                summaryRows.push([`Line ${l} Tổng - Hiệu suất (T/h)`, lineHours > 0 ? (lineTons/lineHours).toFixed(3) : "—"])
                
                const shifts = ['Ca 1', 'Ca 2', 'Ca 3']
                shifts.forEach(shift => {
                    const shiftRows = lineRows.filter(r => (r.shift_name || 'Ca 1') === shift)
                    const shiftTons = shiftRows.reduce((s,r) => s + Number(r.actual_ton), 0)
                    const shiftHours = shiftRows.reduce((s,r) => s + Number(r.run_hours), 0)
                    if (shiftTons > 0 || shiftHours > 0) {
                        summaryRows.push([`Line ${l} (${shift}) - Sản lượng (T)`, shiftTons.toFixed(2)])
                        summaryRows.push([`Line ${l} (${shift}) - Giờ chạy (h)`, shiftHours.toFixed(1)])
                        summaryRows.push([`Line ${l} (${shift}) - Hiệu suất (T/h)`, shiftHours > 0 ? (shiftTons/shiftHours).toFixed(3) : "—"])
                    }
                })
            })
        }

        const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
        ws1["!cols"] = [{ wch: 35 }, { wch: 20 }]
        XLSX.utils.book_append_sheet(wb, ws1, "Tổng quan")

        // Sheet 2: Daily detail
        const headers = ["Ngày", "Thực tế (T)", "Kế hoạch (T)", "Đạt (%)", "Downtime (phút)", "Input (T)", "Output (T)", "Bể (%)", "Chưa lột (%)", "Ghi chú"]
        const detailRows = [headers, ...records.map(r => [
            fmtDate(r.work_date),
            r.actual_ton.toFixed(2),
            r.plan_ton.toFixed(2),
            r.plan_ton > 0 ? (r.actual_ton / r.plan_ton * 100).toFixed(1) + "%" : "—",
            r.downtime_min,
            r.input_ton > 0 ? r.input_ton.toFixed(2) : "",
            r.output_ton > 0 ? r.output_ton.toFixed(2) : "",
            r.avg_broken_pct > 0 ? r.avg_broken_pct.toFixed(2) + "%" : "",
            r.avg_unpeel_pct > 0 ? r.avg_unpeel_pct.toFixed(2) + "%" : "",
            r.note,
        ])]
        const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
        ws2["!cols"] = headers.map((_, i) => ({ wch: i === 0 ? 14 : i === 9 ? 30 : 16 }))
        XLSX.utils.book_append_sheet(wb, ws2, "Chi tiết ngày")

        // Sheet 3: Shelling lines detail (if applicable)
        if (shellingLines.length > 0) {
            const slHeaders = ["Ngày", "Line", "Ca", "Sản lượng (T)", "Giờ chạy (h)", "Hiệu suất (T/h)", "Nhân sự (Ng)", "Năng suất (T/Ng)", "Dừng máy (phút)", "Ghi chú"]
            const slRows = [slHeaders, ...shellingLines.map(r => [
                fmtDate(r.work_date),
                r.line_code,
                r.shift_name || 'Ca 1',
                Number(r.actual_ton).toFixed(2),
                Number(r.run_hours).toFixed(1),
                Number(r.run_hours) > 0 ? (Number(r.actual_ton) / Number(r.run_hours)).toFixed(3) : "—",
                Number(r.manpower || 0),
                Number(r.manpower) > 0 ? (Number(r.actual_ton) / Number(r.manpower)).toFixed(3) : "—",
                Number(r.downtime_min || 0),
                r.note || ""
            ])]
            const ws3 = XLSX.utils.aoa_to_sheet(slRows)
            ws3["!cols"] = [{ wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 30 }]
            XLSX.utils.book_append_sheet(wb, ws3, "Shelling Line Details")
        }

        XLSX.writeFile(wb, `BaoCao_${dept.code}_${monthLabel.replace("/","-")}.xlsx`)
    }

    // ── Chart Data Computations ──────────────────────────────────────────────
    const perfChartData = (() => {
        if (selectedDept !== 'SHELL' || !shellingLines.length) return [];
        const lines = shellingLines.filter(r => r.line_code === selectedShellLine);
        const map = new Map<string, any>();
        lines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr });
            const curr = map.get(dateStr);
            const eff = Number(r.run_hours) > 0 ? Number(r.actual_ton) / Number(r.run_hours) : 0;
            if (r.shift_name === 'Ca 1') curr.Ca1 = Number(eff.toFixed(2));
            if (r.shift_name === 'Ca 2') curr.Ca2 = Number(eff.toFixed(2));
            if (r.shift_name === 'Ca 3') curr.Ca3 = Number(eff.toFixed(2));
        });
        return Array.from(map.values());
    })();

    const downChartData = (() => {
        if (selectedDept !== 'SHELL' || !shellingLines.length) return [];
        const map = new Map<string, any>();
        shellingLines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr, A: 0, B: 0, C: 0, D1: 0, D2: 0 });
            const curr = map.get(dateStr);
            curr[r.line_code] += Number(r.downtime_min || 0);
        });
        return Array.from(map.values());
    })();

    const manpowerChartData = (() => {
        if (selectedDept !== 'SHELL' || !shellingLines.length) return [];
        const lines = shellingLines.filter(r => r.line_code === selectedShellLine);
        const map = new Map<string, any>();
        lines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr });
            const curr = map.get(dateStr);
            const eff = Number(r.manpower) > 0 ? Number(r.actual_ton) / Number(r.manpower) : 0;
            if (r.shift_name === 'Ca 1') curr.Ca1 = Number(eff.toFixed(2));
            if (r.shift_name === 'Ca 2') curr.Ca2 = Number(eff.toFixed(2));
            if (r.shift_name === 'Ca 3') curr.Ca3 = Number(eff.toFixed(2));
        });
        return Array.from(map.values());
    })();

    const achievePct = summary && summary.totalPlan > 0 ? (summary.totalActual / summary.totalPlan * 100) : null

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <FileText className="h-7 w-7 text-primary" />
                <div>
                    <h1 className="text-2xl font-black">Báo cáo</h1>
                    <p className="text-sm text-muted-foreground">Chọn tháng và bộ phận để xem và xuất báo cáo</p>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-5">
                    <div className="flex flex-wrap items-end gap-4">
                        {/* Month picker */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Tháng</label>
                            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                {Array.from({length:12},(_,i)=>i+1).map(m =>
                                    <option key={m} value={m}>Tháng {m}</option>
                                )}
                            </select>
                        </div>
                        {/* Year picker */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Năm</label>
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                {[currentYear-1, currentYear, currentYear+1].map(y =>
                                    <option key={y} value={y}>{y}</option>
                                )}
                            </select>
                        </div>
                        {/* Department picker */}
                        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Bộ phận</label>
                            <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                {departments.map(d => <option key={d.code} value={d.code}>{d.name_vi || d.name_en}</option>)}
                            </select>
                        </div>
                        <Button onClick={fetchReport} disabled={loading} className="gap-2">
                            <Search className="h-4 w-4" />
                            {loading ? "Đang tải..." : "Xem báo cáo"}
                        </Button>
                        {hasData && (
                            <Button variant="outline" onClick={exportExcel} disabled={!dept} className="gap-2 text-green-700 border-green-600 hover:bg-green-50">
                                <Download className="h-4 w-4" />
                                Xuất Excel
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Results */}
            {hasData && summary && dept && (
                <>
                    {/* Title */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold">
                            {dept.name_vi || dept.name_en} — Tháng {String(selectedMonth).padStart(2,"0")}/{selectedYear}
                        </h2>
                        <span className="text-sm text-muted-foreground">{summary.daysWithData} ngày có sản lượng</span>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <KPICard label="Sản lượng Thực tế" value={`${summary.totalActual.toFixed(1)} T`}
                            sub={`KH: ${summary.totalPlan.toFixed(1)} T`} />
                        <KPICard
                            label="MTD Achievement"
                            value={achievePct !== null ? `${achievePct.toFixed(1)}%` : "—"}
                            color={achievePct !== null ? (achievePct >= 100 ? "text-green-600" : "text-red-600") : undefined}
                            sub={achievePct !== null ? (achievePct >= 100 ? "✅ Đạt kế hoạch" : "⚠️ Chưa đạt") : undefined}
                        />
                        <KPICard
                            label="Variance"
                            value={`${summary.totalActual - summary.totalPlan >= 0 ? "+" : ""}${(summary.totalActual - summary.totalPlan).toFixed(1)} T`}
                            color={summary.totalActual >= summary.totalPlan ? "text-green-600" : "text-red-600"}
                        />
                        <KPICard label="Tổng Downtime" value={`${summary.totalDowntime} phút`}
                            sub={`~${(summary.totalDowntime/60).toFixed(1)} giờ`} />
                    </div>

                    {/* Quality KPIs */}
                    {(summary.avgBroken > 0 || summary.avgUnpeel > 0) && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {summary.avgBroken > 0 && (
                                <KPICard label="Tỷ lệ bể TB" value={`${summary.avgBroken.toFixed(2)}%`} color="text-red-600" />
                            )}
                            {summary.avgUnpeel > 0 && (
                                <KPICard label="Tỷ lệ chưa lột TB" value={`${summary.avgUnpeel.toFixed(2)}%`} color="text-amber-600" />
                            )}
                        </div>
                    )}

                    {/* Shelling Lines Summary */}
                    {selectedDept === "SHELL" && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold">Shelling Lines — Tổng tháng</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-muted/40">
                                                <th className="text-left p-2 font-semibold">Line</th>
                                                <th className="text-right p-2 font-semibold">Sản lượng (T)</th>
                                                <th className="text-right p-2 font-semibold">Giờ chạy (h)</th>
                                                <th className="text-right p-2 font-semibold">Hiệu suất (T/h)</th>
                                                <th className="text-right p-2 font-semibold">Nhân sự (Ng)</th>
                                                <th className="text-right p-2 font-semibold">Năng suất (T/Ng)</th>
                                                <th className="text-right p-2 font-semibold">% tổng SL</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {["A","B","C","D1","D2"].flatMap(line => {
                                                const lineRows = shellingLines.filter(r => r.line_code === line)
                                                const tons = lineRows.reduce((s,r) => s + Number(r.actual_ton), 0)
                                                const hours = lineRows.reduce((s,r) => s + Number(r.run_hours), 0)
                                                const manpower = lineRows.reduce((s,r) => s + Number(r.manpower || 0), 0)
                                                
                                                if (tons === 0 && hours === 0) return []
                                                
                                                const eff = hours > 0 ? tons/hours : 0
                                                const mpEff = manpower > 0 ? tons/manpower : 0
                                                const pctTot = summary.totalActual > 0 ? (tons/summary.totalActual*100) : 0
                                                const colors: Record<string,string> = { A:"text-blue-600", B:"text-emerald-600", C:"text-amber-600", D1:"text-red-600", D2:"text-purple-600" }
                                                
                                                const shifts = ['Ca 1', 'Ca 2', 'Ca 3']
                                                const shiftElems = shifts.map(shift => {
                                                    const shiftRows = lineRows.filter(r => (r.shift_name || 'Ca 1') === shift)
                                                    const sTons = shiftRows.reduce((s,r) => s + Number(r.actual_ton), 0)
                                                    const sHours = shiftRows.reduce((s,r) => s + Number(r.run_hours), 0)
                                                    const sManpower = shiftRows.reduce((s,r) => s + Number(r.manpower || 0), 0)
                                                    if (sTons === 0 && sHours === 0) return null
                                                    
                                                    const sEff = sHours > 0 ? sTons/sHours : 0
                                                    const sMpEff = sManpower > 0 ? sTons/sManpower : 0
                                                    const sPctTot = summary.totalActual > 0 ? (sTons/summary.totalActual*100) : 0
                                                    return (
                                                        <tr key={`${line}-${shift}`} className="border-b hover:bg-muted/20 text-sm">
                                                            <td className="p-2 pl-6 font-medium text-muted-foreground">↳ {shift}</td>
                                                            <td className="p-2 text-right font-medium">{sTons.toFixed(2)}</td>
                                                            <td className="p-2 text-right text-muted-foreground">{sHours.toFixed(1)}</td>
                                                            <td className="p-2 text-right font-medium text-emerald-700">{sEff > 0 ? sEff.toFixed(3) : "—"}</td>
                                                            <td className="p-2 text-right text-amber-600">{sManpower}</td>
                                                            <td className="p-2 text-right font-medium text-blue-600">{sMpEff > 0 ? sMpEff.toFixed(3) : "—"}</td>
                                                            <td className="p-2 text-right text-muted-foreground">{sPctTot.toFixed(1)}%</td>
                                                        </tr>
                                                    )
                                                })
                                                
                                                return [
                                                    <tr key={line} className="border-b bg-muted/10">
                                                        <td className={`p-2 font-black ${colors[line]}`}>{line} (Tổng)</td>
                                                        <td className="p-2 text-right font-bold">{tons.toFixed(2)}</td>
                                                        <td className="p-2 text-right font-semibold text-slate-600">{hours.toFixed(1)}</td>
                                                        <td className="p-2 text-right font-bold text-emerald-700">{eff > 0 ? eff.toFixed(3) : "—"}</td>
                                                        <td className="p-2 text-right font-semibold text-amber-600">{manpower}</td>
                                                        <td className="p-2 text-right font-bold text-blue-700">{mpEff > 0 ? mpEff.toFixed(3) : "—"}</td>
                                                        <td className="p-2 text-right font-semibold text-slate-600">{pctTot.toFixed(1)}%</td>
                                                    </tr>,
                                                    ...shiftElems
                                                ]
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Shelling Analytics Charts */}
                    {selectedDept === "SHELL" && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* Chart 1: Performance */}
                            <Card>
                                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                    <CardTitle className="text-xs font-bold">Hiệu suất T/h (Line {selectedShellLine})</CardTitle>
                                    <select 
                                        value={selectedShellLine} 
                                        onChange={e => setSelectedShellLine(e.target.value)}
                                        className="h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none"
                                    >
                                        {["A", "B", "C", "D1", "D2"].map(l => <option key={l} value={l}>Line {l}</option>)}
                                    </select>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-64 w-full mt-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={perfChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                <YAxis tick={{ fontSize: 10 }} />
                                                <Tooltip contentStyle={{ fontSize: '11px' }} />
                                                <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                <Line type="monotone" dataKey="Ca1" name="Ca 1 (T/h)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                                                <Line type="monotone" dataKey="Ca2" name="Ca 2 (T/h)" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                                                <Line type="monotone" dataKey="Ca3" name="Ca 3 (T/h)" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Chart 3: Manpower */}
                            <Card>
                                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                    <CardTitle className="text-xs font-bold text-amber-700">NS Nhân sự Tấn/Ng (Line {selectedShellLine})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-64 w-full mt-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={manpowerChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                <YAxis tick={{ fontSize: 10 }} />
                                                <Tooltip contentStyle={{ fontSize: '11px' }} />
                                                <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                <Line type="monotone" dataKey="Ca1" name="Ca 1 (T/Ng)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                                                <Line type="monotone" dataKey="Ca2" name="Ca 2 (T/Ng)" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} />
                                                <Line type="monotone" dataKey="Ca3" name="Ca 3 (T/Ng)" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Chart 2: Downtime */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-bold">Phân tích Dừng Máy (Phút)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-64 w-full mt-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={downChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                <YAxis tick={{ fontSize: 10 }} />
                                                <Tooltip contentStyle={{ fontSize: '11px' }} />
                                                <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                <Bar dataKey="A" stackId="a" fill="#3b82f6" name="Line A" />
                                                <Bar dataKey="B" stackId="a" fill="#10b981" name="Line B" />
                                                <Bar dataKey="C" stackId="a" fill="#f59e0b" name="Line C" />
                                                <Bar dataKey="D1" stackId="a" fill="#ef4444" name="Line D1" />
                                                <Bar dataKey="D2" stackId="a" fill="#8b5cf6" name="Line D2" />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Daily Detail Table */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold flex items-center justify-between">
                                <span>Chi tiết từng ngày</span>
                                <span className="text-xs font-normal text-muted-foreground">{records.length} ngày</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/50">
                                            <th className="text-left p-3 font-semibold whitespace-nowrap">Ngày</th>
                                            <th className="text-right p-3 font-semibold">Thực tế (T)</th>
                                            <th className="text-right p-3 font-semibold">KH (T)</th>
                                            <th className="text-right p-3 font-semibold">Đạt %</th>
                                            <th className="text-right p-3 font-semibold">Downtime</th>
                                            {records.some(r => r.avg_broken_pct > 0) && <th className="text-right p-3 font-semibold">Bể %</th>}
                                            {records.some(r => r.avg_unpeel_pct > 0) && <th className="text-right p-3 font-semibold">Chưa lột %</th>}
                                            <th className="text-left p-3 font-semibold">Ghi chú</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {records.map(r => {
                                            const ap = r.plan_ton > 0 ? r.actual_ton / r.plan_ton * 100 : null
                                            const hasBroken  = records.some(x => x.avg_broken_pct > 0)
                                            const hasUnpeel  = records.some(x => x.avg_unpeel_pct > 0)
                                            return (
                                                <tr key={r.work_date} className={`border-b hover:bg-muted/20 ${r.actual_ton === 0 ? "opacity-40" : ""}`}>
                                                    <td className="p-3 font-medium whitespace-nowrap">{fmtDate(r.work_date)}</td>
                                                    <td className="p-3 text-right font-bold text-primary">{r.actual_ton > 0 ? r.actual_ton.toFixed(2) : "—"}</td>
                                                    <td className="p-3 text-right text-muted-foreground">{r.plan_ton > 0 ? r.plan_ton.toFixed(2) : "—"}</td>
                                                    <td className={`p-3 text-right font-semibold whitespace-nowrap`}>
                                                        {ap !== null ? (
                                                            <span className={ap >= 100 ? "text-green-600" : "text-red-600"}>
                                                                {ap >= 100 ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
                                                                {ap.toFixed(1)}%
                                                            </span>
                                                        ) : "—"}
                                                    </td>
                                                    <td className="p-3 text-right text-amber-600">{r.downtime_min > 0 ? `${r.downtime_min}p` : "—"}</td>
                                                    {hasBroken && <td className="p-3 text-right text-red-600">{r.avg_broken_pct > 0 ? r.avg_broken_pct.toFixed(2)+"%" : "—"}</td>}
                                                    {hasUnpeel && <td className="p-3 text-right text-amber-700">{r.avg_unpeel_pct > 0 ? r.avg_unpeel_pct.toFixed(2)+"%" : "—"}</td>}
                                                    <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">{r.note}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 bg-muted/30 font-bold">
                                            <td className="p-3">Tổng / TB</td>
                                            <td className="p-3 text-right text-primary">{summary.totalActual.toFixed(2)}</td>
                                            <td className="p-3 text-right text-muted-foreground">{summary.totalPlan.toFixed(2)}</td>
                                            <td className={`p-3 text-right ${achievePct !== null && achievePct >= 100 ? "text-green-600" : "text-red-600"}`}>
                                                {achievePct !== null ? achievePct.toFixed(1)+"%" : "—"}
                                            </td>
                                            <td className="p-3 text-right text-amber-600">{summary.totalDowntime}p</td>
                                            {records.some(r => r.avg_broken_pct > 0) && <td className="p-3 text-right text-red-600">{summary.avgBroken > 0 ? summary.avgBroken.toFixed(2)+"%" : "—"}</td>}
                                            {records.some(r => r.avg_unpeel_pct > 0) && <td className="p-3 text-right text-amber-700">{summary.avgUnpeel > 0 ? summary.avgUnpeel.toFixed(2)+"%" : "—"}</td>}
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Shelling Daily Detail Table */}
                    {selectedDept === "SHELL" && shellingLines.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold flex items-center justify-between">
                                    <span>Chi tiết từng ca Shelling</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-muted/50">
                                                <th className="text-left p-3 font-semibold whitespace-nowrap">Ngày</th>
                                                <th className="text-center p-3 font-semibold">Line</th>
                                                <th className="text-center p-3 font-semibold">Ca</th>
                                                <th className="text-right p-3 font-semibold">Sản lượng (T)</th>
                                                <th className="text-right p-3 font-semibold">Giờ chạy (h)</th>
                                                <th className="text-right p-3 font-semibold px-6">Dừng máy (phút)</th>
                                                <th className="text-left p-3 font-semibold">Ghi chú</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {shellingLines.map(r => (
                                                <tr key={`${r.work_date}-${r.line_code}-${r.shift_name}`} className="border-b hover:bg-muted/20 text-sm">
                                                    <td className="p-3 font-medium whitespace-nowrap">{fmtDate(r.work_date)}</td>
                                                    <td className="p-3 text-center font-bold text-slate-700">{r.line_code}</td>
                                                    <td className="p-3 text-center text-muted-foreground">{r.shift_name || 'Ca 1'}</td>
                                                    <td className="p-3 text-right font-bold text-primary">{Number(r.actual_ton) > 0 ? Number(r.actual_ton).toFixed(2) : "—"}</td>
                                                    <td className="p-3 text-right font-medium text-muted-foreground">{Number(r.run_hours) > 0 ? Number(r.run_hours).toFixed(1) : "—"}</td>
                                                    <td className="p-3 text-right font-medium text-amber-600 px-6">{Number(r.downtime_min) > 0 ? `${r.downtime_min}p` : "—"}</td>
                                                    <td className="p-3 text-left text-muted-foreground text-xs max-w-[200px] truncate" title={r.note || ""}>{r.note || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 bg-muted/30 font-bold text-right text-xs">
                                                <td colSpan={3} className="p-2">Tổng Tháng:</td>
                                                <td className="p-2 text-primary">{shellingLines.reduce((s, r)=>s+Number(r.actual_ton),0).toFixed(2)}</td>
                                                <td className="p-2 text-muted-foreground">{shellingLines.reduce((s, r)=>s+Number(r.run_hours),0).toFixed(1)}</td>
                                                <td className="p-2 text-amber-600 px-6">{shellingLines.reduce((s, r)=>s+Number(r.downtime_min||0),0)}p</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {/* Empty state */}
            {!hasData && !loading && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                    <FileText className="h-12 w-12 opacity-30" />
                    <p className="text-sm">Chọn tháng và bộ phận rồi bấm <strong>Xem báo cáo</strong></p>
                </div>
            )}
        </div>
    )
}
