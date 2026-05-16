"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns"
import { Download, Search, FileText, TrendingUp, TrendingDown, PieChart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ComposedChart, BarChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Scatter, Cell, ReferenceLine } from "recharts"
import * as XLSX from "xlsx"
import { useLanguage } from "@/contexts/LanguageContext"


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
    shift_leader?: string
    actual_ton: number
    run_hours: number
    downtime_min: number;
    manpower: number;
    broken_pct: number;
    size: string | null;
    note: string | null;
}

interface PeelingLineRecord {
    work_date: string
    line_code: string
    shift_name: string
    shift_leader: string | null
    actual_ton: number
    pass2_ton: number
    broken_pct: number
    unpeel_pct: number
    note: string | null
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
        <div className="bg-white rounded-r-xl border border-l-[4px] border-l-primary shadow-sm p-4 flex flex-col gap-1 transition-all hover:shadow-md">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-black ${color ?? "text-slate-800"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
    )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ReportPage() {
    const supabase = createClient()
    const { language, t } = useLanguage()

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
    const [selectedLeader, setSelectedLeader] = useState("Tất cả")
    const [deepDiveMode, setDeepDiveMode] = useState<'line' | 'leader'>('line')
    const [selectedDeepDiveLeader, setSelectedDeepDiveLeader] = useState("")
    const [hasData, setHasData] = useState(false)
    const [showShiftDetails, setShowShiftDetails] = useState(false)
    const [showOEEHelp, setShowOEEHelp] = useState(false)
    const [compressorMonthly, setCompressorMonthly] = useState<{ work_date: string; total_kwh: number }[]>([])
    const [shellingEnergyMonthly, setShellingEnergyMonthly] = useState<{ work_date: string; kwh: number }[]>([])
    // Headcount từ báo cơm: { work_date → { official, seasonal } }
    const [headcountDaily, setHeadcountDaily] = useState<Record<string, { official: number; seasonal: number; shifts: number }>>({})
    // Raw downtime events (with cause detail) for analysis in report
    const [downtimeEvents, setDowntimeEvents] = useState<any[]>([])
    // Peeling line daily records for quality deep-dive
    const [peelingLines, setPeelingLines] = useState<PeelingLineRecord[]>([])
    const [userDeptCode, setUserDeptCode] = useState("")


    // Báo cơm dept code (meal_headcount.department_id lookup) may differ from report code
    const MEAL_CODE_MAP: Record<string, string> = {}
    const getMealCode = (code: string) => MEAL_CODE_MAP[code] ?? code

    // Priority order for department dropdown
    const DEPT_PRIORITY = ['SHELL', 'STEAM', 'PEEL', 'HPEEL', 'CS', 'BORMA', 'PACK', 'FGWH', 'BOILER', 'QC', 'OFFICE']

    // Only show departments that have production plans + output tracked (exclude MAINT)
    const PRODUCTION_DEPT_CODES = new Set([
        'STEAM', 'SHELL', 'BORMA', 'PEEL', 'CS', 'HPEEL', 'PACK', 'FGWH',
    ])

    // Load departments from DB (same as dashboard)
    useEffect(() => {
        supabase.from("departments").select("id, code, name_vi, name_en").order("sort_order")
            .then(({ data }) => {
                if (data && data.length > 0) {
                    const productionDepts = data
                        .filter(d => PRODUCTION_DEPT_CODES.has(d.code))
                        .sort((a, b) => {
                            const ai = DEPT_PRIORITY.indexOf(a.code)
                            const bi = DEPT_PRIORITY.indexOf(b.code)
                            return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
                        })
                    setDepartments(productionDepts)
                    setSelectedDept(productionDepts[0]?.code ?? data[0].code)
                }
            })
    }, [])

    useEffect(() => {
        async function loadUserDept() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: profile } = await supabase
                .from("profiles")
                .select("department_id")
                .eq("id", user.id)
                .single()
            if (!profile?.department_id) return
            const { data: dept } = await supabase
                .from("departments")
                .select("code")
                .eq("id", profile.department_id)
                .single()
            setUserDeptCode(dept?.code || "")
        }
        loadUserDept()
    }, [])

    useEffect(() => {
        if (userDeptCode === "SHELL" && departments.some(d => d.code === "SHELL")) {
            setSelectedDept("SHELL")
        }
    }, [departments, userDeptCode])


    const dept = departments.find(d => d.code === selectedDept)

    const fetchReport = useCallback(async () => {
        setLoading(true)
        // Bỏ setHasData(false) ở đây để giữ Data cũ trên màn hình -> Không bị chớp UI
        const start = format(startOfMonth(new Date(selectedYear, selectedMonth - 1, 1)), "yyyy-MM-dd")
        const end = format(endOfMonth(new Date(selectedYear, selectedMonth - 1, 1)), "yyyy-MM-dd")

        const { data, error } = await supabase
            .from("v_dashboard_daily")
            .select("*")
            .eq("dept_code", selectedDept)
            .gte("work_date", start)
            .lte("work_date", end)
            .order("work_date")

        if (error) console.error("Report query error:", error)

        // Fetch Native Downtime Events (with cause detail for analysis)
        const nativeDownByDate: Record<string, number> = {}
        if (dept?.id) {
            const { data: dtEvents } = await supabase
                .from('downtime_events')
                .select('work_date, duration_mins, start_time, end_time, is_ongoing, root_cause, severity, machine_area')
                .eq('department_id', dept.id)
                .eq('exclude_downtime', false)
                .gte('work_date', start)
                .lte('work_date', end)

            if (dtEvents) {
                setDowntimeEvents(dtEvents)
                dtEvents.forEach((evt: any) => {
                    const d = evt.work_date
                    let mins = Number(evt.duration_mins || 0)
                    if (evt.is_ongoing && evt.start_time) {
                        const endT = evt.end_time ? new Date(evt.end_time) : new Date()
                        mins = Math.max(0, Math.round((endT.getTime() - new Date(evt.start_time).getTime()) / 60000))
                    }
                    nativeDownByDate[d] = (nativeDownByDate[d] || 0) + mins
                })
            } else {
                setDowntimeEvents([])
            }
        } else {
            setDowntimeEvents([])
        }

        const rows: DailyRecord[] = (data ?? []).map((r: any) => ({
            work_date: r.work_date,
            actual_ton: Number(r.actual_ton || 0),
            plan_ton: Number(r.plan_ton || 0),
            downtime_min: nativeDownByDate[r.work_date] || Number(r.downtime_min || 0),
            input_ton: Number(r.input_ton || 0),
            output_ton: Number(r.output_ton || 0),
            avg_broken_pct: Number(r.broken_pct || r.avg_broken_pct || 0),
            avg_unpeel_pct: Number(r.unpeel_pct || r.avg_unpeel_pct || 0),
            note: r.note || "",
        }))
        setRecords(rows)

        // Build summary
        const daysWithData = rows.filter(r => r.actual_ton > 0).length
        const totalActual = rows.reduce((s, r) => s + r.actual_ton, 0)
        const totalPlan = rows.reduce((s, r) => s + r.plan_ton, 0)
        const totalDowntime = rows.reduce((s, r) => s + r.downtime_min, 0)

        // Weighted Average for Broken % and Unpeel %
        const sumBrokenWeight = rows.reduce((s, r) => s + (r.avg_broken_pct * r.actual_ton), 0)
        const sumUnpeelWeight = rows.reduce((s, r) => s + (r.avg_unpeel_pct * r.actual_ton), 0)

        setSummary({
            totalActual,
            totalPlan,
            totalDowntime,
            avgBroken: totalActual > 0 ? sumBrokenWeight / totalActual : 0,
            avgUnpeel: totalActual > 0 ? sumUnpeelWeight / totalActual : 0,
            daysWithData,
        })

        // Shelling lines
        if (selectedDept === "SHELL") {
            const { data: ld } = await supabase
                .from("shelling_line_daily")
                .select("work_date,line_code,shift_name,shift_leader,actual_ton,run_hours,downtime_min,manpower,broken_pct,size,note")
                .gte("work_date", start)
                .lte("work_date", end)
                .order("work_date", { ascending: true })
                .order("line_code", { ascending: true })

            // Canonical normalization of shift leader names (only 3 valid: Mr. Trí, Mrs. Tâm, Ms. Linh)
            const cleanedLD = (ld ?? []).map((r: any) => {
                let name = (r.shift_leader || "").trim();
                if (name) {
                    // Strip diacritics for robust comparison (handles mojibake/encoding issues)
                    const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                    // Check raw name too for mojibake patterns
                    const raw = name.toLowerCase();
                    if (raw.includes("linh") || normalized.includes("linh")) {
                        name = "Ms. Linh";
                    } else if (raw.includes("tâm") || raw.includes("tam") || raw.includes("tã¢m") || normalized.includes("tam")) {
                        name = "Mrs. Tâm";
                    } else {
                        // Everything else (Mr. Trí, corrupted Trí, TrÃ­, etc.) → Mr. Trí
                        name = "Mr. Trí";
                    }
                }
                return { ...r, shift_leader: name };
            });
            setShellingLines(cleanedLD)

            // Fetch Shelling Energy
            const { data: deptInfo } = await supabase.from("departments").select("id").eq("code", "SHELL").single();
            if (deptInfo) {
                const { data: energyData } = await supabase
                    .from("daily_kpi")
                    .select("work_date, electricity_meter_reading")
                    .eq("department_id", deptInfo.id)
                    .gte("work_date", start)
                    .lte("work_date", end)
                    .order("work_date", { ascending: true });
                setShellingEnergyMonthly((energyData ?? []).map((r: any) => ({
                    work_date: r.work_date,
                    kwh: Number(r.electricity_meter_reading || 0)
                })));
            }
        } else {
            setShellingLines([])
            setShellingEnergyMonthly([])
        }

        // Peeling line daily for PEEL quality analysis
        if (selectedDept === "PEEL" && dept?.id) {
            const { data: peelingData } = await supabase
                .from("peeling_line_daily")
                .select("work_date,line_code,shift_name,shift_leader,actual_ton,pass2_ton,broken_pct,unpeel_pct,note")
                .eq("department_id", dept.id)
                .gte("work_date", start)
                .lte("work_date", end)
                .order("work_date", { ascending: true })
                .order("line_code", { ascending: true })
            setPeelingLines(peelingData ?? [])
        } else {
            setPeelingLines([])
        }

        // Fetch compressor data for PEEL and CS
        if (['PEEL', 'CS'].includes(selectedDept)) {
            const { data: compData } = await supabase
                .from('daily_compressor')
                .select('work_date, meter1, meter2, meter3')
                .gte('work_date', start)
                .lte('work_date', end)
                .order('work_date');

            // Also fetch the day before the month for initial diff
            const prevDateStr = format(new Date(selectedYear, selectedMonth - 2, 0), "yyyy-MM-dd");
            const { data: prevComp } = await supabase
                .from('daily_compressor')
                .select('meter1, meter2, meter3')
                .eq('work_date', prevDateStr)
                .single();

            if (compData && compData.length > 0) {
                const calcKwh = (curr: number | null, prev: number | null) =>
                    curr != null && prev != null ? Math.max(0, curr - prev) : 0;
                const result: { work_date: string; total_kwh: number }[] = compData.map((row: any, i: number) => {
                    const prevRow = i === 0 ? prevComp : compData[i - 1];
                    const kwh = calcKwh(row.meter1, prevRow?.meter1 ?? null) +
                        calcKwh(row.meter2, prevRow?.meter2 ?? null) +
                        calcKwh(row.meter3, prevRow?.meter3 ?? null);
                    return { work_date: row.work_date, total_kwh: kwh };
                });
                setCompressorMonthly(result);
            } else {
                setCompressorMonthly([]);
            }
        } else {
            setCompressorMonthly([]);
        }

        // ── Fetch headcount từ meal_headcount ──────────────────────────────────
        const mealCode = getMealCode(selectedDept)
        const { data: mealDeptRow } = await supabase
            .from('departments').select('id').eq('code', mealCode).single()
        if (mealDeptRow?.id) {
            const { data: hcRows } = await supabase
                .from('meal_headcount')
                .select('work_date, shift, official_present, seasonal_present')
                .eq('department_id', mealDeptRow.id)
                .gte('work_date', start)
                .lte('work_date', end)
                .neq('shift', 'OT')   // bỏ OT khỏi nhân sự chính thức

            const hcMap: Record<string, { official: number; seasonal: number; shifts: number }> = {}
                ; (hcRows ?? []).forEach((r: any) => {
                    const d = r.work_date
                    if (!hcMap[d]) hcMap[d] = { official: 0, seasonal: 0, shifts: 0 }
                    hcMap[d].official += Number(r.official_present ?? 0)
                    hcMap[d].seasonal += Number(r.seasonal_present ?? 0)
                    hcMap[d].shifts += 1
                })
            setHeadcountDaily(hcMap)
        } else {
            setHeadcountDaily({})
        }

        setLoading(false)
        setHasData(true)
    }, [selectedYear, selectedMonth, selectedDept, supabase])


    // ── Excel Export ─────────────────────────────────────────────────────────
    const exportExcel = () => {
        if (!summary || !dept) return
        const deptName = dept.name_vi || dept.name_en
        const monthLabel = `${String(selectedMonth).padStart(2, "0")}/${selectedYear}`
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
            summaryRows.push(["", ""])
            summaryRows.push(["SHELLING LINES - T/tháng", ""])
            const lines = ["A", "B", "C", "D1", "D2"]
            lines.forEach(l => {
                const lineRows = shellingLines.filter(r => r.line_code === l)
                const lineTons = lineRows.reduce((s, r) => s + Number(r.actual_ton), 0)
                const lineHours = lineRows.reduce((s, r) => s + Number(r.run_hours), 0)
                summaryRows.push([`Line ${l} Tổng - Sản lượng (T)`, lineTons.toFixed(2)])
                summaryRows.push([`Line ${l} Tổng - Giờ chạy (h)`, lineHours.toFixed(1)])
                summaryRows.push([`Line ${l} Tổng - Hiệu suất (T/h)`, lineHours > 0 ? (lineTons / lineHours).toFixed(3) : "—"])

                const shifts = ['Ca 1', 'Ca 2', 'Ca 3']
                shifts.forEach(shift => {
                    const shiftRows = lineRows.filter(r => (r.shift_name || 'Ca 1') === shift)
                    const shiftTons = shiftRows.reduce((s, r) => s + Number(r.actual_ton), 0)
                    const shiftHours = shiftRows.reduce((s, r) => s + Number(r.run_hours), 0)
                    if (shiftTons > 0 || shiftHours > 0) {
                        summaryRows.push([`Line ${l} (${shift}) - Sản lượng (T)`, shiftTons.toFixed(2)])
                        summaryRows.push([`Line ${l} (${shift}) - Giờ chạy (h)`, shiftHours.toFixed(1)])
                        summaryRows.push([`Line ${l} (${shift}) - Hiệu suất (T/h)`, shiftHours > 0 ? (shiftTons / shiftHours).toFixed(3) : "—"])
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
            const slHeaders = ["Ngày", "Line", "Ca", "Trưởng ca", "Sản lượng (T)", "Giờ chạy (h)", "Hiệu suất (T/h)", "Nhân sự (Ng)", "Năng suất (T/Ng)", "Dừng máy (phút)", "Tỷ lệ bể (%)", "Size", "Ghi chú"]
            const slRows = [slHeaders, ...shellingLines.map(r => [
                fmtDate(r.work_date),
                r.line_code,
                r.shift_name || 'Ca 1',
                r.shift_leader || '',
                Number(r.actual_ton).toFixed(2),
                Number(r.run_hours).toFixed(1),
                Number(r.run_hours) > 0 ? (Number(r.actual_ton) / Number(r.run_hours)).toFixed(3) : "—",
                Number(r.manpower || 0),
                Number(r.manpower) > 0 ? (Number(r.actual_ton) / Number(r.manpower)).toFixed(3) : "—",
                Number(r.downtime_min || 0),
                r.broken_pct ? Number(r.broken_pct).toFixed(2) + "%" : "",
                r.size || "",
                r.note || ""
            ])]
            const ws3 = XLSX.utils.aoa_to_sheet(slRows)
            ws3["!cols"] = [{ wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 30 }]
            XLSX.utils.book_append_sheet(wb, ws3, "Shelling Line Details")
        }

        XLSX.writeFile(wb, `BaoCao_${dept.code}_${monthLabel.replace("/", "-")}.xlsx`)
    }

    const filteredShellingLines = useMemo(() => {
        if (selectedLeader === "Tất cả") return shellingLines;
        return shellingLines.filter(r => r.shift_leader === selectedLeader);
    }, [shellingLines, selectedLeader]);

    const uniqueLeaders = useMemo(() => {
        const nameMap = new Map<string, string>();
        shellingLines.forEach(r => {
            const name = r.shift_leader;
            if (!name) return;
            const lower = name.toLowerCase();
            // We keep the first encountered casing as the display name
            if (!nameMap.has(lower)) nameMap.set(lower, name);
        });
        return Array.from(nameMap.values()).sort();
    }, [shellingLines]);

    useEffect(() => {
        if (uniqueLeaders.length > 0 && !selectedDeepDiveLeader) {
            setSelectedDeepDiveLeader(uniqueLeaders[0]);
        }
    }, [uniqueLeaders, selectedDeepDiveLeader]);

    // ── General: daily actual vs plan chart (all depts) ─────────────────────
    const dailyOutputChartData = (() => {
        if (!records || records.length === 0) return []
        return records
            .filter(r => r.actual_ton > 0 || r.plan_ton > 0)
            .map(r => ({
                name: format(parseISO(r.work_date), 'dd/MM'),
                date: r.work_date,
                Actual: Number(Number(r.actual_ton).toFixed(2)),
                Plan: Number(Number(r.plan_ton).toFixed(2)),
                Gap: Number((r.actual_ton - r.plan_ton).toFixed(2)),
                isMon: parseISO(r.work_date).getDay() === 1,
            }))
    })()

    // ── Downtime Analysis computed data ──────────────────────────────────────
    const PLANNED_CODES = new Set(['BT', 'CIL', 'MP', 'PT', 'PW', 'TP', 'TT'])

    const dtPareto = (() => {
        if (!downtimeEvents.length) return []
        const map: Record<string, number> = {}
        downtimeEvents.forEach(e => {
            const code = e.root_cause || 'Unknown'
            let mins = Number(e.duration_mins || 0)
            if (e.is_ongoing && e.start_time) {
                const endT = e.end_time ? new Date(e.end_time) : new Date()
                mins = Math.max(0, Math.round((endT.getTime() - new Date(e.start_time).getTime()) / 60000))
            }
            map[code] = (map[code] || 0) + mins
        })
        const total = Object.values(map).reduce((s, v) => s + v, 0)
        let cum = 0
        return Object.entries(map)
            .sort(([, a], [, b]) => b - a)
            .map(([code, mins]) => {
                cum += mins
                return {
                    code,
                    mins,
                    hrs: +(mins / 60).toFixed(1),
                    pct: total > 0 ? +((mins / total) * 100).toFixed(1) : 0,
                    cumPct: total > 0 ? +((cum / total) * 100).toFixed(1) : 0,
                    planned: PLANNED_CODES.has(code),
                }
            })
    })()

    const dtPlannedMins = downtimeEvents.reduce((s, e) => PLANNED_CODES.has(e.root_cause) ? s + Number(e.duration_mins || 0) : s, 0)
    const dtUnplannedMins = Math.max(0, (summary?.totalDowntime || 0) - Math.max(0, dtPlannedMins))

    // Estimated lost production: unplanned downtime hours × avg throughput (T/h)
    // Use actual run_hours from shelling data if available; otherwise skip estimate
    const { avgThroughputPerHr, throughputMethod } = (() => {
        // Method 1: use real run_hours from shelling line records
        if (shellingLines && shellingLines.length > 0) {
            const totalTons = shellingLines.reduce((s, r) => s + Number(r.actual_ton || 0), 0)
            const totalRunHrs = shellingLines.reduce((s, r) => s + Number(r.run_hours || 0), 0)
            if (totalRunHrs > 0 && totalTons > 0) {
                return { avgThroughputPerHr: totalTons / totalRunHrs, throughputMethod: 'shelling run_hours' }
            }
        }
        // Method 2: fallback — daily records ÷ actual working hours (assume 20h/day for 3-shift)
        const daysWithOutput = records.filter(r => r.actual_ton > 0)
        if (!daysWithOutput.length) return { avgThroughputPerHr: null, throughputMethod: null }
        const totalTons = daysWithOutput.reduce((s, r) => s + r.actual_ton, 0)
        const totalProductiveHrs = daysWithOutput.length * 20 // 3-shift factory ~20h net
        return { avgThroughputPerHr: totalTons / totalProductiveHrs, throughputMethod: 'daily ÷ 20h' }
    })()

    const estimatedLostTons = avgThroughputPerHr !== null && dtUnplannedMins > 0
        ? +((dtUnplannedMins / 60) * avgThroughputPerHr).toFixed(1)
        : null

    const perfChartData = (() => {

        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const lines = filteredShellingLines.filter(r => r.line_code === selectedShellLine);
        const map = new Map<string, any>();
        lines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr });
            const curr = map.get(dateStr);
            const eff = Number(r.run_hours) > 0 ? Number(r.actual_ton) / Number(r.run_hours) : 0;
            if (r.shift_name === 'Ca 1') {
                curr.Ca1 = Number(eff.toFixed(2));
                curr.Ca1_leader = r.shift_leader;
            }
            if (r.shift_name === 'Ca 2') {
                curr.Ca2 = Number(eff.toFixed(2));
                curr.Ca2_leader = r.shift_leader;
            }
            if (r.shift_name === 'Ca 3') {
                curr.Ca3 = Number(eff.toFixed(2));
                curr.Ca3_leader = r.shift_leader;
            }
        });
        return Array.from(map.values());
    })();

    const downChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const map = new Map<string, any>();
        filteredShellingLines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr, A: 0, B: 0, C: 0, D1: 0, D2: 0 });
            const curr = map.get(dateStr);
            curr[r.line_code] += Number(r.downtime_min || 0);
        });
        return Array.from(map.values());
    })();

    const manpowerChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const lines = filteredShellingLines.filter(r => r.line_code === selectedShellLine);
        const map = new Map<string, any>();
        lines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr });
            const curr = map.get(dateStr);
            const eff = Number(r.manpower) > 0 ? Number(r.actual_ton) / Number(r.manpower) : 0;
            if (r.shift_name === 'Ca 1') {
                curr.Ca1 = Number(eff.toFixed(2));
                curr.Ca1_leader = r.shift_leader;
            }
            if (r.shift_name === 'Ca 2') {
                curr.Ca2 = Number(eff.toFixed(2));
                curr.Ca2_leader = r.shift_leader;
            }
            if (r.shift_name === 'Ca 3') {
                curr.Ca3 = Number(eff.toFixed(2));
                curr.Ca3_leader = r.shift_leader;
            }
        });
        return Array.from(map.values());
    })();

    const brokenChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const lines = filteredShellingLines.filter(r => r.line_code === selectedShellLine);
        const map = new Map<string, any>();
        lines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr });
            const curr = map.get(dateStr);
            const brk = Number(r.broken_pct);
            if (r.shift_name === 'Ca 1' && brk > 0) {
                curr.Ca1 = brk;
                curr.Ca1_leader = r.shift_leader;
            }
            if (r.shift_name === 'Ca 2' && brk > 0) {
                curr.Ca2 = brk;
                curr.Ca2_leader = r.shift_leader;
            }
            if (r.shift_name === 'Ca 3' && brk > 0) {
                curr.Ca3 = brk;
                curr.Ca3_leader = r.shift_leader;
            }
        });
        return Array.from(map.values());
    })();

    // --- LEADER DEEP-DIVE DATA ---
    const leaderDeepDiveData = useMemo(() => {
        if (selectedDept !== 'SHELL' || !shellingLines.length || !selectedDeepDiveLeader) return { perf: [], mp: [], broken: [] };

        const isAll = selectedDeepDiveLeader === "Tất cả";
        const leaderRows = isAll ? shellingLines : shellingLines.filter(r => r.shift_leader === selectedDeepDiveLeader);

        const perfMap = new Map<string, any>();
        const mpMap = new Map<string, any>();
        const brokenMap = new Map<string, any>();

        leaderRows.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');

            if (!perfMap.has(dateStr)) perfMap.set(dateStr, { name: dateStr, _sums: {}, _counts: {} });
            if (!mpMap.has(dateStr)) mpMap.set(dateStr, { name: dateStr, _sums: {}, _counts: {} });
            if (!brokenMap.has(dateStr)) brokenMap.set(dateStr, { name: dateStr, _sums: {}, _counts: {} });

            const pCurr = perfMap.get(dateStr);
            const mCurr = mpMap.get(dateStr);
            const bCurr = brokenMap.get(dateStr);

            const eff = Number(r.run_hours) > 0 ? Number(r.actual_ton) / Number(r.run_hours) : null;
            const mpEff = Number(r.manpower) > 0 ? Number(r.actual_ton) / Number(r.manpower) : null;
            const brk = Number(r.broken_pct) > 0 ? Number(r.broken_pct) : null;

            if (eff !== null) {
                pCurr._sums[r.line_code] = (pCurr._sums[r.line_code] || 0) + eff;
                pCurr._counts[r.line_code] = (pCurr._counts[r.line_code] || 0) + 1;
                pCurr[r.line_code] = Number((pCurr._sums[r.line_code] / pCurr._counts[r.line_code]).toFixed(3));
            }
            if (mpEff !== null) {
                mCurr._sums[r.line_code] = (mCurr._sums[r.line_code] || 0) + mpEff;
                mCurr._counts[r.line_code] = (mCurr._counts[r.line_code] || 0) + 1;
                mCurr[r.line_code] = Number((mCurr._sums[r.line_code] / mCurr._counts[r.line_code]).toFixed(3));
            }
            if (brk !== null) {
                bCurr._sums[r.line_code] = (bCurr._sums[r.line_code] || 0) + (brk * Number(r.actual_ton || 0));
                bCurr._counts[r.line_code] = (bCurr._counts[r.line_code] || 0) + Number(r.actual_ton || 0);
                bCurr[r.line_code] = bCurr._counts[r.line_code] > 0
                    ? Number((bCurr._sums[r.line_code] / bCurr._counts[r.line_code]).toFixed(2))
                    : 0;
            }
        });

        return {
            perf: Array.from(perfMap.values()),
            mp: Array.from(mpMap.values()),
            broken: Array.from(brokenMap.values())
        };
    }, [selectedDept, shellingLines, selectedDeepDiveLeader]);

    const leaderCompareData = (() => {
        if (selectedDept !== 'SHELL' || !shellingLines.length) return [];
        const map = new Map<string, { leader: string; totalTon: number; totalManpower: number; totalDowntime: number; totalRunHours: number; totalBroken: number; brokenCount: number; lines: Set<string> }>();
        uniqueLeaders.forEach(l => map.set(l, { leader: l, totalTon: 0, totalManpower: 0, totalDowntime: 0, totalRunHours: 0, totalBroken: 0, brokenCount: 0, lines: new Set() }));

        shellingLines.forEach(r => {
            const l = r.shift_leader;
            if (l && map.has(l)) {
                const curr = map.get(l)!;
                curr.totalTon += Number(r.actual_ton || 0);
                curr.totalManpower += Number(r.manpower || 0);
                curr.totalDowntime += Number(r.downtime_min || 0);
                curr.totalRunHours += Number(r.run_hours || 0);
                if (Number(r.broken_pct) > 0) {
                    curr.totalBroken += (Number(r.broken_pct) * Number(r.actual_ton || 0));
                    curr.brokenCount += Number(r.actual_ton || 0); // Using weight for weighted avg
                }
                if (r.line_code) curr.lines.add(r.line_code);
            }
        });

        return Array.from(map.values()).map(r => ({
            name: r.leader,
            Sản_Lượng: Number(r.totalTon.toFixed(2)),
            Downtime: r.totalDowntime,
            Hiệu_Suất_T_h: r.totalRunHours > 0 ? Number((r.totalTon / r.totalRunHours).toFixed(3)) : 0,
            Năng_Suất_TNg: r.totalManpower > 0 ? Number((r.totalTon / r.totalManpower).toFixed(3)) : 0,
            Tỷ_Lệ_Bể: r.brokenCount > 0 ? Number((r.totalBroken / r.brokenCount).toFixed(2)) : 0,
            Lines: Array.from(r.lines).sort().join(", ")
        }));
    })();

    const sizePerfChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const map = new Map<string, { size: string, totalTon: number, totalRunHours: number, lines: Set<string> }>();
        filteredShellingLines.forEach(r => {
            if (!r.size) return;
            if (!map.has(r.size)) map.set(r.size, { size: r.size, totalTon: 0, totalRunHours: 0, lines: new Set() });
            const curr = map.get(r.size)!;
            curr.totalTon += Number(r.actual_ton || 0);
            curr.totalRunHours += Number(r.run_hours || 0);
            if (r.line_code) curr.lines.add(r.line_code);
        });
        return Array.from(map.values()).map(r => ({
            name: r.size,
            Hiệu_Suất_T_h: r.totalRunHours > 0 ? Number((r.totalTon / r.totalRunHours).toFixed(3)) : 0,
            Lines: Array.from(r.lines).sort().join(', ')
        })).sort((a, b) => a.name.localeCompare(b.name));
    })();

    const sizeBrokenChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const map = new Map<string, { size: string, totalBroken: number, weight: number, lines: Set<string> }>();
        filteredShellingLines.forEach(r => {
            if (!r.size || !Number(r.broken_pct)) return;
            if (!map.has(r.size)) map.set(r.size, { size: r.size, totalBroken: 0, weight: 0, lines: new Set() });
            const curr = map.get(r.size)!;
            curr.totalBroken += (Number(r.broken_pct) * Number(r.actual_ton || 0));
            curr.weight += Number(r.actual_ton || 0);
            if (r.line_code) curr.lines.add(r.line_code);
        });
        return Array.from(map.values()).map(r => ({
            name: r.size,
            Tỷ_Lệ_Bể: r.weight > 0 ? Number((r.totalBroken / r.weight).toFixed(2)) : 0,
            Lines: Array.from(r.lines).sort().join(', ')
        })).sort((a, b) => a.name.localeCompare(b.name));
    })();

    // All-lines daily broken % overview (weighted by ton)
    const allLineBrokenData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const map = new Map<string, { weightedBroken: number; totalTon: number }>();
        filteredShellingLines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');
            if (!map.has(dateStr)) map.set(dateStr, { weightedBroken: 0, totalTon: 0 });
            const curr = map.get(dateStr)!;
            const ton = Number(r.actual_ton || 0);
            const brk = Number(r.broken_pct || 0);
            curr.totalTon += ton;
            if (brk > 0) curr.weightedBroken += brk * ton;
        });
        return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, d]) => ({
                name,
                broken: d.totalTon > 0 && d.weightedBroken > 0
                    ? Number((d.weightedBroken / d.totalTon).toFixed(2))
                    : null,
                totalTon: Number(d.totalTon.toFixed(2))
            }));
    })();

    const lineSizePerfChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const map = new Map<string, { line: string, size: string, totalTon: number, totalRunHours: number }>();
        filteredShellingLines.forEach(r => {
            if (!r.line_code || !r.size) return;
            const key = `${r.line_code}-${r.size}`;
            if (!map.has(key)) map.set(key, { line: r.line_code, size: r.size, totalTon: 0, totalRunHours: 0 });
            const curr = map.get(key)!;
            curr.totalTon += Number(r.actual_ton || 0);
            curr.totalRunHours += Number(r.run_hours || 0);
        });
        return Array.from(map.values()).map(r => ({
            name: `${r.line} (${r.size})`,
            Line: r.line,
            Size: r.size,
            Hiệu_Suất_T_h: r.totalRunHours > 0 ? Number((r.totalTon / r.totalRunHours).toFixed(3)) : 0
        })).sort((a, b) => a.name.localeCompare(b.name));
    })();

    const lineSizeBrokenChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const map = new Map<string, { line: string, size: string, totalBroken: number, count: number }>();
        filteredShellingLines.forEach(r => {
            if (!r.line_code || !r.size || !Number(r.broken_pct)) return;
            const key = `${r.line_code}-${r.size}`;
            if (!map.has(key)) map.set(key, { line: r.line_code, size: r.size, totalBroken: 0, count: 0 });
            const curr = map.get(key)!;
            curr.totalBroken += Number(r.broken_pct);
            curr.count += 1;
        });
        return Array.from(map.values()).map(r => ({
            name: `${r.line} (${r.size})`,
            Line: r.line,
            Size: r.size,
            Tỷ_Lệ_Bể: r.count > 0 ? Number((r.totalBroken / r.count).toFixed(2)) : 0
        })).sort((a, b) => a.name.localeCompare(b.name));
    })();

    const achievePct = summary && summary.totalPlan > 0 ? (summary.totalActual / summary.totalPlan * 100) : null

    // --- NEW OPTIMIZED SHELLING CHARTS DATA ---
    const crossLinePerfChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        const map = new Map<string, any>();
        filteredShellingLines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM');
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr });
            const curr = map.get(dateStr);
            if (!curr[`totalTon_${r.line_code}`]) { curr[`totalTon_${r.line_code}`] = 0; curr[`totalRunHours_${r.line_code}`] = 0; }
            curr[`totalTon_${r.line_code}`] += Number(r.actual_ton || 0);
            curr[`totalRunHours_${r.line_code}`] += Number(r.run_hours || 0);
        });
        return Array.from(map.values()).map(curr => {
            const row: any = { name: curr.name };
            ['A', 'B', 'C', 'D1', 'D2'].forEach(line => {
                const tons = curr[`totalTon_${line}`] || 0;
                const hrs = curr[`totalRunHours_${line}`] || 0;
                row[line] = hrs > 0 ? Number((tons / hrs).toFixed(2)) : null;
            });
            return row;
        });
    })();

    const speedQualityData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [];
        return filteredShellingLines
            .filter(r => Number(r.run_hours) > 0 && Number(r.broken_pct) > 0)
            .map(r => ({
                speed: Number((Number(r.actual_ton) / Number(r.run_hours)).toFixed(2)),
                broken: Number(r.broken_pct),
                line: r.line_code || 'Unknown',
                size: r.size || 'Unknown',
                name: `${r.line_code} - ${format(parseISO(r.work_date), 'dd/MM')} ${r.shift_name}`
            }));
    })();

    const shellingEnergyChartData = (() => {
        if (selectedDept !== 'SHELL' || !shellingEnergyMonthly.length || !records.length) return [];
        const map = new Map<string, any>();
        records.forEach(r => {
            const dStr = format(parseISO(r.work_date), 'dd/MM');
            map.set(r.work_date, { name: dStr, actual_ton: r.actual_ton, kwh: 0, intensity: 0 });
        });
        shellingEnergyMonthly.forEach(r => {
            if (map.has(r.work_date)) {
                const row = map.get(r.work_date);
                row.kwh = r.kwh;
                row.intensity = row.actual_ton > 0 ? Number((r.kwh / row.actual_ton).toFixed(1)) : 0;
            }
        });
        return Array.from(map.values()).filter(d => Boolean(d.actual_ton));
    })();

    // Threshold constant for visual alarm line on broken chart
    const THRESHOLD_BROKEN = 4.5;

    // ── PEEL_MC Quality Analysis Computed Data ──────────────────────────────
    const peelingLeaderSummary = useMemo(() => {
        if (selectedDept !== 'PEEL' || !peelingLines.length) return []
        const map = new Map<string, { leader: string; totalTon: number; totalPass2: number; brokenW: number; unpeelW: number; shifts: number }>()
        // Only include records that have a shift_leader (skip old data without leader)
        peelingLines.filter(r => r.shift_leader && r.shift_leader.trim() !== '').forEach(r => {
            const leader = r.shift_leader!.trim()
            if (!map.has(leader)) map.set(leader, { leader, totalTon: 0, totalPass2: 0, brokenW: 0, unpeelW: 0, shifts: 0 })
            const curr = map.get(leader)!
            const ton = Number(r.actual_ton || 0)
            curr.totalTon += ton
            curr.totalPass2 += Number(r.pass2_ton || 0)
            if (Number(r.broken_pct) > 0 && ton > 0) curr.brokenW += Number(r.broken_pct) * ton
            if (Number(r.unpeel_pct) > 0 && ton > 0) curr.unpeelW += Number(r.unpeel_pct) * ton
            curr.shifts += 1
        })
        return Array.from(map.values()).map(r => ({
            name: r.leader,
            Sản_Lượng: Number(r.totalTon.toFixed(2)),
            Pass2_Ratio: r.totalTon > 0 ? Number(((r.totalPass2 / r.totalTon) * 100).toFixed(1)) : 0,
            Broken: r.totalTon > 0 ? Number((r.brokenW / r.totalTon).toFixed(2)) : 0,
            Unpeel: r.totalTon > 0 ? Number((r.unpeelW / r.totalTon).toFixed(2)) : 0,
            Shifts: r.shifts,
        })).sort((a, b) => b.Sản_Lượng - a.Sản_Lượng)
    }, [selectedDept, peelingLines])

    const peelingDailyQuality = useMemo(() => {
        if (selectedDept !== 'PEEL' || !peelingLines.length) return []
        const map = new Map<string, { brokenW: number; unpeelW: number; totalTon: number }>()
        peelingLines.forEach(r => {
            const d = format(parseISO(r.work_date), 'dd/MM')
            if (!map.has(d)) map.set(d, { brokenW: 0, unpeelW: 0, totalTon: 0 })
            const curr = map.get(d)!
            const ton = Number(r.actual_ton || 0)
            curr.totalTon += ton
            if (Number(r.broken_pct) > 0 && ton > 0) curr.brokenW += Number(r.broken_pct) * ton
            if (Number(r.unpeel_pct) > 0 && ton > 0) curr.unpeelW += Number(r.unpeel_pct) * ton
        })
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([name, d]) => ({
            name,
            Broken: d.totalTon > 0 && d.brokenW > 0 ? Number((d.brokenW / d.totalTon).toFixed(2)) : null,
            Unpeel: d.totalTon > 0 && d.unpeelW > 0 ? Number((d.unpeelW / d.totalTon).toFixed(2)) : null,
            Tons: Number(d.totalTon.toFixed(2)),
        }))
    }, [selectedDept, peelingLines])

    const peelingShiftSummary = useMemo(() => {
        if (selectedDept !== 'PEEL' || !peelingLines.length) return []
        const shifts = ['Ca 1', 'Ca 2', 'Ca 3']
        return shifts.map(shift => {
            const rows = peelingLines.filter(r => r.shift_name === shift)
            const totalTon = rows.reduce((s, r) => s + Number(r.actual_ton || 0), 0)
            const brokenW = rows.reduce((s, r) => s + (Number(r.broken_pct || 0) * Number(r.actual_ton || 0)), 0)
            const unpeelW = rows.reduce((s, r) => s + (Number(r.unpeel_pct || 0) * Number(r.actual_ton || 0)), 0)
            const pass2 = rows.reduce((s, r) => s + Number(r.pass2_ton || 0), 0)
            return {
                name: shift,
                Broken: totalTon > 0 ? Number((brokenW / totalTon).toFixed(2)) : 0,
                Unpeel: totalTon > 0 ? Number((unpeelW / totalTon).toFixed(2)) : 0,
                Pass2_Ratio: totalTon > 0 ? Number(((pass2 / totalTon) * 100).toFixed(1)) : 0,
                Tons: Number(totalTon.toFixed(2)),
            }
        })
    }, [selectedDept, peelingLines])

    const peelingLineSummary = useMemo(() => {
        if (selectedDept !== 'PEEL' || !peelingLines.length) return []
        const lines = ['A', 'B', 'C', 'D1', 'D2']
        return lines.map(line => {
            const rows = peelingLines.filter(r => r.line_code === line)
            if (rows.length === 0) return null
            const totalTon = rows.reduce((s, r) => s + Number(r.actual_ton || 0), 0)
            const brokenW = rows.reduce((s, r) => s + (Number(r.broken_pct || 0) * Number(r.actual_ton || 0)), 0)
            const unpeelW = rows.reduce((s, r) => s + (Number(r.unpeel_pct || 0) * Number(r.actual_ton || 0)), 0)
            const pass2 = rows.reduce((s, r) => s + Number(r.pass2_ton || 0), 0)
            return {
                name: `Line ${line}`,
                line,
                Broken: totalTon > 0 ? Number((brokenW / totalTon).toFixed(2)) : 0,
                Unpeel: totalTon > 0 ? Number((unpeelW / totalTon).toFixed(2)) : 0,
                Pass2_Ratio: totalTon > 0 ? Number(((pass2 / totalTon) * 100).toFixed(1)) : 0,
                Tons: Number(totalTon.toFixed(2)),
            }
        }).filter(Boolean) as { name: string; line: string; Broken: number; Unpeel: number; Pass2_Ratio: number; Tons: number }[]
    }, [selectedDept, peelingLines])

    const peelingInsights = useMemo(() => {
        if (selectedDept !== 'PEEL' || !peelingLeaderSummary.length) return []
        const insights: { icon: string; text: string; color: string }[] = []
        // Worst/best leader by broken
        const withBroken = peelingLeaderSummary.filter(l => l.Broken > 0)
        if (withBroken.length > 1) {
            const worst = withBroken.reduce((a, b) => b.Broken > a.Broken ? b : a)
            const best = withBroken.reduce((a, b) => b.Broken < a.Broken ? b : a)
            insights.push({ icon: '🔴', text: `Tổ trưởng có tỷ lệ bể cao nhất: ${worst.name} (${worst.Broken}%) — SL: ${worst.Sản_Lượng}T`, color: 'text-red-700' })
            insights.push({ icon: '🟢', text: `Tổ trưởng có tỷ lệ bể thấp nhất: ${best.name} (${best.Broken}%) — SL: ${best.Sản_Lượng}T`, color: 'text-emerald-700' })
        }
        // Worst leader by unpeel
        const withUnpeel = peelingLeaderSummary.filter(l => l.Unpeel > 0)
        if (withUnpeel.length > 1) {
            const worst = withUnpeel.reduce((a, b) => b.Unpeel > a.Unpeel ? b : a)
            insights.push({ icon: '🟠', text: `Sót lụa cao nhất: ${worst.name} (${worst.Unpeel}%) — cần kiểm tra dao cắt`, color: 'text-orange-700' })
        }
        // Pass2 ratio anomaly
        const highPass2 = peelingLeaderSummary.filter(l => l.Pass2_Ratio > 30)
        if (highPass2.length > 0) {
            insights.push({ icon: '♻️', text: `Lượt bóc lần 2 cao (>${30}%): ${highPass2.map(l => `${l.name} (${l.Pass2_Ratio}%)`).join(', ')} — giảm hiệu suất`, color: 'text-purple-700' })
        }
        // Line with consistently high unpeel
        const highUnpeelLine = peelingLineSummary.filter(l => l.Unpeel > 3)
        if (highUnpeelLine.length > 0) {
            insights.push({ icon: '⚙️', text: `Line sót lụa cao >3%: ${highUnpeelLine.map(l => `${l.name} (${l.Unpeel}%)`).join(', ')} — kiểm tra lưỡi dao`, color: 'text-amber-700' })
        }
        // Trend: 1st vs 2nd half of month
        if (peelingDailyQuality.length >= 6) {
            const half = Math.floor(peelingDailyQuality.length / 2)
            const firstBroken = peelingDailyQuality.slice(0, half).filter(d => d.Broken !== null)
            const secondBroken = peelingDailyQuality.slice(half).filter(d => d.Broken !== null)
            if (firstBroken.length > 0 && secondBroken.length > 0) {
                const avg1 = firstBroken.reduce((s, d) => s + d.Broken!, 0) / firstBroken.length
                const avg2 = secondBroken.reduce((s, d) => s + d.Broken!, 0) / secondBroken.length
                const diff = ((avg2 - avg1) / avg1) * 100
                if (Math.abs(diff) > 5) {
                    insights.push({
                        icon: diff < 0 ? '📈' : '📉',
                        text: `Xu hướng bể nửa sau ${diff < 0 ? 'giảm' : 'tăng'} ${Math.abs(diff).toFixed(0)}% so với nửa đầu tháng (${avg1.toFixed(2)}% → ${avg2.toFixed(2)}%)`,
                        color: diff < 0 ? 'text-blue-700' : 'text-red-700'
                    })
                }
            }
        }
        return insights
    }, [selectedDept, peelingLeaderSummary, peelingLineSummary, peelingDailyQuality])

    // ── CS Quality Analysis Computed Data ────────────────────────────────────
    const csDailyQuality = useMemo(() => {
        if (selectedDept !== 'CS' || !records.length) return []
        return records.filter(r => r.actual_ton > 0).map(r => ({
            name: format(parseISO(r.work_date), 'dd/MM'),
            Broken: Number(r.avg_broken_pct) > 0 ? Number(Number(r.avg_broken_pct).toFixed(2)) : null,
            Unpeel: Number(r.avg_unpeel_pct) > 0 ? Number(Number(r.avg_unpeel_pct).toFixed(2)) : null,
            Actual: Number(Number(r.actual_ton).toFixed(2)),
        }))
    }, [selectedDept, records])

    const csInsights = useMemo(() => {
        if (selectedDept !== 'CS' || !records.length) return []
        const insights: { icon: string; text: string; color: string }[] = []
        const withBroken = records.filter(r => r.avg_broken_pct > 0 && r.actual_ton > 0)
        if (withBroken.length > 0) {
            const worst = withBroken.reduce((a, b) => b.avg_broken_pct > a.avg_broken_pct ? b : a)
            const best = withBroken.reduce((a, b) => b.avg_broken_pct < a.avg_broken_pct ? b : a)
            insights.push({ icon: '🔴', text: `Ngày bể cao nhất: ${fmtDate(worst.work_date)} (${worst.avg_broken_pct.toFixed(2)}%) — SL: ${worst.actual_ton.toFixed(2)}T`, color: 'text-red-700' })
            insights.push({ icon: '🟢', text: `Ngày bể thấp nhất: ${fmtDate(best.work_date)} (${best.avg_broken_pct.toFixed(2)}%) — SL: ${best.actual_ton.toFixed(2)}T`, color: 'text-emerald-700' })
            const highBroken = withBroken.filter(r => r.avg_broken_pct > 5)
            if (highBroken.length > 0) {
                insights.push({ icon: '⚠️', text: `${highBroken.length} ngày có bể > 5%: cần kiểm tra cài đặt máy`, color: 'text-amber-700' })
            }
        }
        const withUnpeel = records.filter(r => r.avg_unpeel_pct > 0 && r.actual_ton > 0)
        if (withUnpeel.length > 0) {
            const worstUnpeel = withUnpeel.reduce((a, b) => b.avg_unpeel_pct > a.avg_unpeel_pct ? b : a)
            insights.push({ icon: '🟠', text: `Sót lụa cao nhất: ${fmtDate(worstUnpeel.work_date)} (${worstUnpeel.avg_unpeel_pct.toFixed(2)}%)`, color: 'text-orange-700' })
        }
        // Volume-quality correlation
        if (withBroken.length >= 5) {
            const avgTon = withBroken.reduce((s, r) => s + r.actual_ton, 0) / withBroken.length
            const highVolDays = withBroken.filter(r => r.actual_ton > avgTon)
            const lowVolDays = withBroken.filter(r => r.actual_ton <= avgTon)
            const avgBrkHigh = highVolDays.length > 0 ? highVolDays.reduce((s, r) => s + r.avg_broken_pct, 0) / highVolDays.length : 0
            const avgBrkLow = lowVolDays.length > 0 ? lowVolDays.reduce((s, r) => s + r.avg_broken_pct, 0) / lowVolDays.length : 0
            if (Math.abs(avgBrkHigh - avgBrkLow) > 0.5) {
                insights.push({
                    icon: '📊',
                    text: `Ngày SL cao (>${avgTon.toFixed(1)}T): bể TB ${avgBrkHigh.toFixed(2)}% — Ngày SL thấp: ${avgBrkLow.toFixed(2)}% (${avgBrkHigh > avgBrkLow ? 'chạy nhanh = bể nhiều hơn' : 'chạy chậm bể hơn'})`,
                    color: 'text-blue-700'
                })
            }
        }
        // Trend
        if (withBroken.length >= 6) {
            const half = Math.floor(withBroken.length / 2)
            const avg1 = withBroken.slice(0, half).reduce((s, r) => s + r.avg_broken_pct, 0) / half
            const avg2 = withBroken.slice(half).reduce((s, r) => s + r.avg_broken_pct, 0) / (withBroken.length - half)
            const diff = avg1 > 0 ? ((avg2 - avg1) / avg1) * 100 : 0
            if (Math.abs(diff) > 10) {
                insights.push({
                    icon: diff < 0 ? '📈' : '📉',
                    text: `Xu hướng bể ${diff < 0 ? 'cải thiện' : 'xấu đi'} ${Math.abs(diff).toFixed(0)}% nửa sau tháng (${avg1.toFixed(2)}% → ${avg2.toFixed(2)}%)`,
                    color: diff < 0 ? 'text-blue-700' : 'text-red-700'
                })
            }
        }
        return insights
    }, [selectedDept, records])

    // ── OEE constants & helpers (Report Page) ─────────────────────────────
    const SHELLING_IDEAL_RATE_REPORT: Record<string, number> = { A: 1.4, B: 1.8, C: 1.5, D1: 1.2, D2: 1.2 }
    const SHELL_PLANNED_H = 8

    // OEE (Report) — cross-line active-shift approach:
    // Planned time for a line = all shifts where ANY line ran × 8h
    // If a line was idle in an active shift → its run_hours=0 for that shift → Availability drops

    // OEE trend chart data: per-day OEE per line
    const oeeChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return []
        const map = new Map<string, any>()
        filteredShellingLines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM')
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr, _rows: {} as Record<string, ShellingLineRecord[]>, _activeShifts: new Set<string>() })
            const curr = map.get(dateStr)
            if (!curr._rows[r.line_code]) curr._rows[r.line_code] = []
            curr._rows[r.line_code].push(r)
            if (Number(r.actual_ton || 0) > 0 || Number(r.run_hours || 0) > 0) {
                curr._activeShifts.add(r.shift_name || 'Ca 1')
            }
        })
        return Array.from(map.values()).map(day => {
            const row: any = { name: day.name }
            const activeShifts = day._activeShifts as Set<string>
            if (activeShifts.size === 0) return row
                ;['A', 'B', 'C', 'D1', 'D2'].forEach(line => {
                    const rate = SHELLING_IDEAL_RATE_REPORT[line] ?? 1
                    const lineRows: ShellingLineRecord[] = day._rows[line] || []
                    const shiftMap = new Map<string, ShellingLineRecord>()
                    lineRows.forEach((r: ShellingLineRecord) => shiftMap.set(r.shift_name || 'Ca 1', r))
                    let runH = 0, ton = 0, brokenW = 0
                    activeShifts.forEach(shift => {
                        const r = shiftMap.get(shift)
                        if (r) { runH += Number(r.run_hours || 0); ton += Number(r.actual_ton || 0); brokenW += (Number(r.broken_pct || 0) / 100) * Number(r.actual_ton || 0) }
                    })
                    if (runH === 0) { row[line] = null; return }
                    const plannedH = activeShifts.size * SHELL_PLANNED_H
                    const avail = runH / plannedH
                    const perf = Math.min(1, ton / (runH * rate))
                    const qual = ton > 0 ? 1 - brokenW / ton : 1
                    row[line] = Number(((avail * perf * qual) * 100).toFixed(1))
                })
            return row
        })
    })()

    // OEE monthly summary per line
    const oeeSummaryByLine = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [] as { line: string; avail: number; perf: number; qual: number; oee: number }[]
        // Active shifts = all (date|shift) where any line ran this month
        const activeShiftKeys = new Set<string>()
        filteredShellingLines.forEach(r => {
            if (Number(r.actual_ton || 0) > 0 || Number(r.run_hours || 0) > 0)
                activeShiftKeys.add(`${r.work_date}|${r.shift_name || 'Ca 1'}`)
        })
        if (activeShiftKeys.size === 0) return []
        const totalPlannedH = activeShiftKeys.size * SHELL_PLANNED_H
        return ['A', 'B', 'C', 'D1', 'D2'].map(line => {
            const rate = SHELLING_IDEAL_RATE_REPORT[line] ?? 1
            const rowMap = new Map<string, ShellingLineRecord>()
            filteredShellingLines.filter(r => r.line_code === line).forEach(r => rowMap.set(`${r.work_date}|${r.shift_name || 'Ca 1'}`, r))
            let totalRunH = 0, totalTon = 0, totalBrokenW = 0
            activeShiftKeys.forEach(key => {
                const r = rowMap.get(key)
                if (r) {
                    totalRunH += Number(r.run_hours || 0)
                    totalTon += Number(r.actual_ton || 0)
                    totalBrokenW += (Number(r.broken_pct || 0) / 100) * Number(r.actual_ton || 0)
                }
            })
            if (totalRunH === 0 && totalTon === 0) return null
            const avail = totalRunH / totalPlannedH
            const perf = totalRunH > 0 ? Math.min(1, totalTon / (totalRunH * rate)) : 0
            const qual = totalTon > 0 ? 1 - totalBrokenW / totalTon : 1
            return { line, avail, perf, qual, oee: avail * perf * qual }
        }).filter(Boolean) as { line: string; avail: number; perf: number; qual: number; oee: number }[]
    })()


    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="max-w-5xl mx-auto space-y-6"
        >
            {/* Header */}
            <div className="flex items-center gap-3">
                <FileText className="h-7 w-7 text-primary" />
                <div>
                    <h1 className="text-2xl font-black">{language === 'vi' ? 'Báo cáo Sản Xuất' : 'Production Report'}</h1>
                    <p className="text-sm text-muted-foreground">{language === 'vi' ? 'Chọn tháng và bộ phận để xem báo cáo' : 'Select month and department to load production report'}</p>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-5">
                    <div className="flex flex-wrap items-end gap-4">
                        {/* Month picker */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Month</label>
                            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
                                    <option key={m} value={m}>Month {m}</option>
                                )}
                            </select>
                        </div>
                        {/* Year picker */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Year</label>
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                {[currentYear - 1, currentYear, currentYear + 1].map(y =>
                                    <option key={y} value={y}>{y}</option>
                                )}
                            </select>
                        </div>
                        {/* Department picker */}
                        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Department</label>
                            <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                {departments.map(d => <option key={d.code} value={d.code}>{language === 'vi' ? (d.name_vi || d.name_en) : (d.name_en || d.name_vi)}</option>)}
                            </select>
                        </div>

                        <Button onClick={fetchReport} disabled={loading} className="gap-2">
                            <Search className="h-4 w-4" />
                            {loading ? "Loading..." : "View Report"}
                        </Button>
                        {hasData && (
                            <Button variant="outline" onClick={exportExcel} disabled={!dept} className="gap-2 text-green-700 border-green-600 hover:bg-green-50">
                                <Download className="h-4 w-4" />
                                Export Excel
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Results */}
            {hasData && summary && dept && (
                <>
                    {/* Results Title */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold">
                            {dept.name_vi || dept.name_en} — Month {String(selectedMonth).padStart(2, "0")}/{selectedYear}
                        </h2>
                        <span className="text-sm text-muted-foreground">{summary.daysWithData} days with data</span>
                    </div>

                    {/* ── Sticky Report Navigator ── */}
                    <div className="sticky top-0 z-20 -mx-1 px-1 py-1.5">
                        <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl shadow-sm px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto">
                            <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0 mr-1">
                                {language === 'vi' ? 'Mục lục' : 'Navigate'}
                            </span>
                            {[
                                { id: 'report-kpi', icon: '📊', label: language === 'vi' ? 'KPI' : 'KPIs', always: true },
                                { id: 'report-daily', icon: '📈', label: language === 'vi' ? 'Sản lượng' : 'Output Trend', always: true },
                                { id: 'report-downtime', icon: '⚠️', label: language === 'vi' ? 'Downtime' : 'Downtime', show: summary.totalDowntime > 0 },
                                { id: 'report-manpower', icon: '👷', label: language === 'vi' ? 'Nhân lực' : 'Manpower', show: Object.keys(headcountDaily).length > 0 },
                                { id: 'report-shelling', icon: '🦐', label: language === 'vi' ? 'Shelling Lines' : 'Shelling', show: selectedDept === 'SHELL' },
                                { id: 'report-oee', icon: '⚙️', label: 'OEE', show: selectedDept === 'SHELL' },
                                { id: 'report-quality', icon: '🔬', label: language === 'vi' ? 'Chất lượng' : 'Quality', show: ['PEEL', 'CS'].includes(selectedDept) },
                                { id: 'report-energy', icon: '⚡', label: language === 'vi' ? 'Năng lượng' : 'Energy', show: ['PEEL', 'CS'].includes(selectedDept) },
                                { id: 'report-table', icon: '🗒️', label: language === 'vi' ? 'Chi tiết' : 'Detail Table', always: true },
                            ].filter(s => s.always || s.show).map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all duration-150 whitespace-nowrap"
                                >
                                    <span>{s.icon}</span>
                                    <span>{s.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* KPI Cards — Production + Quality in one row */}
                    <div id="report-kpi" className="grid grid-cols-2 md:grid-cols-4 gap-3">

                        <KPICard label="Actual Production" value={`${summary.totalActual.toFixed(1)} T`}
                            sub={`Plan: ${summary.totalPlan.toFixed(1)} T`} />
                        <KPICard
                            label="MTD Achievement"
                            value={achievePct !== null ? `${achievePct.toFixed(1)}%` : "—"}
                            color={achievePct !== null ? (achievePct >= 100 ? "text-green-600" : "text-red-600") : undefined}
                            sub={achievePct !== null ? (achievePct >= 100 ? "✅ Target Met" : "⚠️ Below Target") : undefined}
                        />
                        <KPICard
                            label="Variance"
                            value={`${summary.totalActual - summary.totalPlan >= 0 ? "+" : ""}${(summary.totalActual - summary.totalPlan).toFixed(1)} T`}
                            color={summary.totalActual >= summary.totalPlan ? "text-green-600" : "text-red-600"}
                        />
                        <KPICard label="Total Downtime" value={`${summary.totalDowntime} mins`}
                            sub={`~${(summary.totalDowntime / 60).toFixed(1)} hrs`} />
                        {summary.avgBroken > 0 && (
                            <KPICard label="Avg Broken %" value={`${summary.avgBroken.toFixed(2)}%`} color="text-red-600"
                                sub="Quality loss" />
                        )}
                        {summary.avgUnpeel > 0 && (
                            <KPICard label="Avg Unpeel %" value={`${summary.avgUnpeel.toFixed(2)}%`} color="text-amber-600"
                                sub="Unpeeled shell" />
                        )}
                    </div>

                    {/* ── SECTION 1: Daily Output vs Plan ──────────────────── */}
                    {dailyOutputChartData.length > 0 && (
                        <Card className="border-emerald-100" id="report-daily">
                            <CardHeader className="pb-2 border-b bg-emerald-50/40">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    📊 Daily Production — Actual vs Plan
                                    <span className="text-xs font-normal text-muted-foreground">({summary.daysWithData} working days)</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-3">
                                <div className="h-52 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={dailyOutputChartData} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0fdf4" />
                                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                                                label={{ value: 'Tons', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#94a3b8' }, offset: 12 }} />
                                            <Tooltip
                                                content={({ active, payload, label }: any) => {
                                                    if (!active || !payload?.length) return null
                                                    const row = dailyOutputChartData.find(d => d.name === label)
                                                    const gap = row ? row.Gap : 0
                                                    return (
                                                        <div className="bg-white/95 border border-slate-200 rounded-lg shadow-xl p-2.5 text-[11px] min-w-[150px]">
                                                            <p className="font-bold text-slate-700 border-b pb-1 mb-1.5">{label}</p>
                                                            {payload.map((e: any, i: number) => (
                                                                <div key={i} className="flex justify-between gap-4">
                                                                    <span style={{ color: e.color }}>{e.name}</span>
                                                                    <span className="font-bold">{Number(e.value).toFixed(2)} T</span>
                                                                </div>
                                                            ))}
                                                            <div className={`flex justify-between gap-4 mt-1 pt-1 border-t font-semibold ${gap >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                <span>Variance</span>
                                                                <span>{gap >= 0 ? '+' : ''}{gap.toFixed(2)} T</span>
                                                            </div>
                                                        </div>
                                                    )
                                                }}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                                            {/* Week separators on Mondays */}
                                            {dailyOutputChartData.filter(d => d.isMon).map(d => (
                                                <ReferenceLine key={`w-${d.name}`} x={d.name}
                                                    stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3"
                                                />
                                            ))}
                                            <Bar dataKey="Actual" name="Actual (T)" fill="#10b981" radius={[3, 3, 0, 0]} barSize={14}
                                                label={false}
                                            >
                                                {dailyOutputChartData.map((d, i) => (
                                                    <Cell key={i} fill={d.Gap >= 0 ? '#10b981' : '#f43f5e'} />
                                                ))}
                                            </Bar>
                                            <Bar dataKey="Plan" name="Plan (T)" fill="#94a3b8" opacity={0.4} radius={[3, 3, 0, 0]} barSize={14} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                                <p className="text-[10px] text-center text-muted-foreground mt-1">🟢 Green = above plan &nbsp;·&nbsp; 🔴 Red = below plan &nbsp;·&nbsp; Dashed lines = week start (Monday)</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* ── SECTION 2: Downtime Impact Analysis ────────────── */}
                    {summary.totalDowntime > 0 && (
                        <Card className="border-red-100" id="report-downtime">
                            <CardHeader className="pb-2 border-b bg-red-50/40">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    ⚠️ {language === 'vi' ? 'Phân tích Ảnh hưởng Downtime' : 'Downtime Impact Analysis'}
                                    <span className="text-xs font-normal text-muted-foreground">
                                        {language === 'vi' ? 'Tổng' : 'Total'}: {summary.totalDowntime} mins ({(summary.totalDowntime / 60).toFixed(1)} hrs)
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-3 space-y-3">
                                {/* KPI row */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-center">
                                        <p className="text-[10px] text-red-600 font-semibold uppercase">
                                            {language === 'vi' ? 'DT Ngoài kế hoạch' : 'Unplanned DT'}
                                        </p>
                                        <p className="text-lg font-black text-red-700">{dtUnplannedMins} min</p>
                                        <p className="text-[10px] text-red-500">{(dtUnplannedMins / 60).toFixed(1)} hrs</p>
                                    </div>
                                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-center">
                                        <p className="text-[10px] text-blue-600 font-semibold uppercase">
                                            {language === 'vi' ? 'DT Có kế hoạch' : 'Planned DT'}
                                        </p>
                                        <p className="text-lg font-black text-blue-700">{dtPlannedMins} min</p>
                                        <p className="text-[10px] text-blue-500">{(dtPlannedMins / 60).toFixed(1)} hrs</p>
                                    </div>
                                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-center">
                                        <p className="text-[10px] text-amber-600 font-semibold uppercase">
                                            {language === 'vi' ? '% Ngoài kế hoạch' : 'Unplanned %'}
                                        </p>
                                        <p className="text-lg font-black text-amber-700">
                                            {summary.totalDowntime > 0 ? ((dtUnplannedMins / summary.totalDowntime) * 100).toFixed(0) : 0}%
                                        </p>
                                        <p className="text-[10px] text-amber-500">
                                            {language === 'vi' ? 'so với tổng DT' : 'of total DT'}
                                        </p>
                                    </div>
                                    <div className={`rounded-lg border p-2.5 text-center ${estimatedLostTons !== null && estimatedLostTons > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                                        <p className="text-[10px] text-rose-600 font-semibold uppercase">
                                            {language === 'vi' ? 'Sản lượng Mất ước tính' : 'Est. Lost Output'}
                                        </p>
                                        <p className="text-lg font-black text-rose-700">
                                            {estimatedLostTons !== null ? `${estimatedLostTons} T` : '—'}
                                        </p>
                                        <p className="text-[10px] text-rose-400">
                                            {avgThroughputPerHr !== null
                                                ? `${avgThroughputPerHr.toFixed(2)} T/h × ${(dtUnplannedMins / 60).toFixed(1)} h`
                                                : (language === 'vi' ? 'không đủ dữ liệu' : 'insufficient data')}
                                        </p>
                                    </div>
                                </div>

                                {/* Formula explanation */}
                                {estimatedLostTons !== null && (
                                    <div className="text-[10px] text-muted-foreground bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
                                        <span className="font-semibold text-slate-600">
                                            {language === 'vi' ? '📌 Cách tính: ' : '📌 Formula: '}
                                        </span>
                                        {language === 'vi'
                                            ? `Sản lượng mất ≈ Downtime ngoài KH (${(dtUnplannedMins / 60).toFixed(1)} giờ) × Năng suất thực tế (${avgThroughputPerHr?.toFixed(2)} T/h từ ${throughputMethod === 'shelling run_hours' ? 'tổng run_hours thực chạy' : 'sản lượng ngày ÷ 20h ca'}). Đây là ước tính — không tính downtime có kế hoạch (MP, CIL, BT…).`
                                            : `Est. lost ≈ Unplanned downtime (${(dtUnplannedMins / 60).toFixed(1)} h) × actual throughput (${avgThroughputPerHr?.toFixed(2)} T/h from ${throughputMethod === 'shelling run_hours' ? 'actual shelling run_hours' : 'daily output ÷ 20h shifts'}). Planned downtime (MP, CIL, BT…) is excluded.`
                                        }
                                    </div>
                                )}

                                {/* Pareto chart */}
                                {dtPareto.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">
                                            {language === 'vi' ? 'Downtime theo Nguyên nhân — Pareto' : 'Downtime by Root Cause — Pareto'}
                                        </p>
                                        <div className="h-44 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={dtPareto} margin={{ top: 4, right: 16, left: -16, bottom: 0 }} layout="vertical">
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                                    <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                                                        label={{ value: language === 'vi' ? 'Giờ' : 'Hours', position: 'insideBottomRight', style: { fontSize: 9, fill: '#94a3b8' }, offset: 0 }} />
                                                    <YAxis type="category" dataKey="code" tick={{ fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false} width={36} />
                                                    <Tooltip
                                                        content={({ active, payload }: any) => {
                                                            if (!active || !payload?.length) return null
                                                            const d = payload[0].payload
                                                            return (
                                                                <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-2.5 text-[11px]">
                                                                    <p className="font-bold text-slate-700">{d.code} — {d.planned ? (language === 'vi' ? '✅ Có KH' : '✅ Planned') : (language === 'vi' ? '🔴 Ngoài KH' : '🔴 Unplanned')}</p>
                                                                    <p>{d.mins} mins ({d.hrs} hrs)</p>
                                                                    <p className="text-muted-foreground">{d.pct}% {language === 'vi' ? 'tổng' : 'of total'} · {language === 'vi' ? 'Tích lũy' : 'Cumulative'} {d.cumPct}%</p>
                                                                </div>
                                                            )
                                                        }}
                                                    />
                                                    <Bar dataKey="hrs" name={language === 'vi' ? 'Giờ' : 'Hours'} radius={[0, 3, 3, 0]} barSize={14}>
                                                        {dtPareto.map((d, i) => (
                                                            <Cell key={i} fill={d.planned ? '#3b82f6' : '#ef4444'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <p className="text-[10px] text-center text-muted-foreground mt-1">
                                            🔴 {language === 'vi' ? 'Đỏ = Ngoài kế hoạch' : 'Red = Unplanned'} (BD/WT/LU/MS/BL/PF/SP) &nbsp;·&nbsp; 🔵 {language === 'vi' ? 'Xanh = Có kế hoạch' : 'Blue = Planned'} (MP/CIL/BT/PT/PW/TP/TT)
                                        </p>
                                    </div>
                                )}
                                {dtPareto.length === 0 && (
                                    <p className="text-xs text-center text-muted-foreground italic py-2">
                                        {language === 'vi' ? 'Chưa có dữ liệu nguyên nhân downtime cho kỳ này.' : 'No detailed downtime cause data recorded for this period.'}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}


                    {/* ── Manpower Efficiency Deep-Dive (from Báo Cơm) ── */}
                    <div id="report-manpower" />
                    {(() => {
                        const hcEntries = Object.entries(headcountDaily).sort(([a], [b]) => a.localeCompare(b))
                        if (hcEntries.length === 0) return null

                        // MTD totals
                        const totalOfficialMTD = hcEntries.reduce((s, [, v]) => s + v.official, 0)
                        const totalSeasonalMTD = hcEntries.reduce((s, [, v]) => s + v.seasonal, 0)
                        const totalHeadcountMTD = totalOfficialMTD + totalSeasonalMTD
                        const avgDailyHC = totalHeadcountMTD / hcEntries.length
                        const avgOfficial = totalOfficialMTD / hcEntries.length
                        const avgSeasonal = totalSeasonalMTD / hcEntries.length
                        const mpEfficiency = avgDailyHC > 0 ? summary.totalActual / avgDailyHC : null

                        // ── Build daily combined dataset ──────────────────────────────
                        // Dùng UNION của dates từ records VÀ headcountDaily
                        // → đảm bảo không bỏ sót ngày nào có báo cơm dù không có row trong v_dashboard_daily
                        const recordsMap = new Map(records.map(r => [r.work_date, r]))
                        const allDates = new Set([
                            ...records.map(r => r.work_date),
                            ...Object.keys(headcountDaily)
                        ])

                        const dailyMpData: {
                            name: string
                            date: string
                            output: number
                            official: number
                            seasonal: number
                            totalHC: number
                            effPerPerson: number | null   // T / người (null nếu output=0 hoặc HC=0)
                            effPerOfficial: number | null // T / CT
                            shellingLineMP: number        // sum of on-line manpower (SHELL only)
                            gap: number                   // dept HC – line HC
                            noProductionData: boolean     // true nếu ko có row trong records
                            isWeekStart: boolean          // true nếu là thứ Hai (ngăn cách tuần)
                        }[] = Array.from(allDates)
                            .sort()
                            .map(date => {
                                const r = recordsMap.get(date)
                                const hc = headcountDaily[date]
                                const off = hc?.official ?? 0
                                const seas = hc?.seasonal ?? 0
                                const tot = off + seas
                                const ton = r ? Number(r.actual_ton ?? 0) : 0

                                // SHELL: sum on-line manpower for the same date
                                const lineMP = selectedDept === 'SHELL'
                                    ? shellingLines.filter(sl => sl.work_date === date)
                                        .reduce((s, sl) => s + Number(sl.manpower || 0), 0)
                                    : 0

                                return {
                                    name: format(parseISO(date), 'dd/MM'),
                                    date,
                                    output: Number(ton.toFixed(2)),
                                    official: off,
                                    seasonal: seas,
                                    totalHC: tot,
                                    // null khi không có output (không làm đường eff xuống 0 sai)
                                    effPerPerson: tot > 0 && ton > 0 ? Number((ton / tot).toFixed(3)) : null,
                                    effPerOfficial: off > 0 && ton > 0 ? Number((ton / off).toFixed(3)) : null,
                                    shellingLineMP: lineMP,
                                    gap: tot > 0 && lineMP > 0 ? tot - lineMP : 0,
                                    noProductionData: !r || ton === 0,
                                    // Mark Monday (day of week === 1) → week separator
                                    isWeekStart: parseISO(date).getDay() === 1,
                                }
                            })
                            .filter(d => d.totalHC > 0 || d.output > 0)

                        // ── Auto Insights ─────────────────────────────────────────────
                        const withEff = dailyMpData.filter(d => d.effPerPerson !== null && d.output > 0)
                        const bestDay = withEff.length > 0 ? withEff.reduce((a, b) => (b.effPerPerson! > a.effPerPerson! ? b : a)) : null
                        const worstDay = withEff.length > 0 ? withEff.reduce((a, b) => (b.effPerPerson! < a.effPerPerson! ? b : a)) : null

                        // Trend: compare first-half avg vs second-half avg efficiency
                        const half = Math.floor(withEff.length / 2)
                        const firstHalfEff = half > 0 ? withEff.slice(0, half).reduce((s, d) => s + d.effPerPerson!, 0) / half : null
                        const secondHalfEff = half > 0 ? withEff.slice(half).reduce((s, d) => s + d.effPerPerson!, 0) / (withEff.length - half) : null
                        const trendPct = firstHalfEff && secondHalfEff && firstHalfEff > 0
                            ? ((secondHalfEff - firstHalfEff) / firstHalfEff) * 100 : null

                        // TV ratio correlation with efficiency (simple: high TV → eff change)
                        const avgTVRatio = avgDailyHC > 0 ? avgSeasonal / avgDailyHC : 0
                        const highTVDays = withEff.filter(d => d.totalHC > 0 && d.seasonal / d.totalHC > avgTVRatio)
                        const lowTVDays = withEff.filter(d => d.totalHC > 0 && d.seasonal / d.totalHC <= avgTVRatio)
                        const avgEffHighTV = highTVDays.length > 0 ? highTVDays.reduce((s, d) => s + d.effPerPerson!, 0) / highTVDays.length : null
                        const avgEffLowTV = lowTVDays.length > 0 ? lowTVDays.reduce((s, d) => s + d.effPerPerson!, 0) / lowTVDays.length : null

                        // SHELL gap avg
                        const shellGapDays = dailyMpData.filter(d => d.gap > 0)
                        const avgGap = shellGapDays.length > 0 ? shellGapDays.reduce((s, d) => s + d.gap, 0) / shellGapDays.length : 0

                        const insights: { icon: string; text: string; color: string }[] = []
                        if (bestDay) insights.push({ icon: '🏆', text: `Ngày năng suất cao nhất: ${bestDay.name} — ${bestDay.effPerPerson!.toFixed(3)} T/người (${bestDay.output} T, ${bestDay.totalHC} người)`, color: 'text-emerald-700' })
                        if (worstDay) insights.push({ icon: '⚠️', text: `Ngày năng suất thấp nhất: ${worstDay.name} — ${worstDay.effPerPerson!.toFixed(3)} T/người (${worstDay.output} T, ${worstDay.totalHC} người)`, color: 'text-red-700' })
                        if (trendPct !== null) insights.push({
                            icon: trendPct >= 0 ? '📈' : '📉',
                            text: `Xu hướng nửa tháng sau ${trendPct >= 0 ? 'tốt hơn' : 'thấp hơn'} nửa đầu ${Math.abs(trendPct).toFixed(1)}% (${firstHalfEff?.toFixed(3)} → ${secondHalfEff?.toFixed(3)} T/người)`,
                            color: trendPct >= 0 ? 'text-blue-700' : 'text-amber-700'
                        })
                        if (avgEffHighTV !== null && avgEffLowTV !== null && Math.abs(avgEffHighTV - avgEffLowTV) > 0.005) insights.push({
                            icon: '👷',
                            text: `Ngày nhiều thời vụ: ${avgEffHighTV.toFixed(3)} T/người — ngày ít thời vụ: ${avgEffLowTV.toFixed(3)} T/người (${avgEffHighTV > avgEffLowTV ? 'TV giúp tăng năng suất' : 'CT hiệu quả hơn TV'})`,
                            color: 'text-purple-700'
                        })
                        if (selectedDept === 'SHELL' && avgGap > 0) insights.push({
                            icon: '🔧',
                            text: `Nhân sự hỗ trợ Shelling (không tại line) TB: ${avgGap.toFixed(0)} người/ngày (${((avgGap / avgDailyHC) * 100).toFixed(0)}% tổng BP)`,
                            color: 'text-orange-700'
                        })

                        return (
                            <Card className="border-blue-100">
                                <CardHeader className="pb-3 border-b">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        👥 Manpower Efficiency — Phân Tích Theo Ngày
                                        <span className="text-xs font-normal text-muted-foreground">(nguồn: Báo Cơm)</span>
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Nhân sự toàn bộ phận (chính thức + thời vụ) từ báo cơm hằng ngày
                                        {selectedDept === 'SHELL' && ' — bao gồm cả người hỗ trợ, không chỉ tại line'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-5">

                                    {/* KPI Summary Row */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <KPICard
                                            label="Nhân Sự TB / Ngày"
                                            value={`${Math.round(avgDailyHC)} người`}
                                            sub={`CT: ${Math.round(avgOfficial)} | TV: ${Math.round(avgSeasonal)}`}
                                        />
                                        <KPICard
                                            label="Hiệu Suất Nhân Sự"
                                            value={mpEfficiency !== null ? `${mpEfficiency.toFixed(3)} T/người` : '—'}
                                            sub="Tổng SL ÷ Nhân sự TB"
                                            color="text-blue-600"
                                        />
                                        <KPICard
                                            label="Ngày có Báo Cơm"
                                            value={`${hcEntries.length} ngày`}
                                            sub={`/ ${summary.daysWithData} ngày có SL`}
                                        />
                                        <KPICard
                                            label="Tổng Người-Ca MTD"
                                            value={`${totalHeadcountMTD.toLocaleString()}`}
                                            sub={`CT: ${totalOfficialMTD} | TV: ${totalSeasonalMTD}`}
                                        />
                                    </div>

                                    {/* Main Combo Chart */}
                                    {dailyMpData.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                📊 Sản lượng · Nhân sự · Hiệu suất T/người theo ngày
                                            </p>
                                            <ResponsiveContainer width="100%" height={260}>
                                                <ComposedChart data={dailyMpData} margin={{ top: 4, right: 40, left: -10, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                                    <YAxis yAxisId="ton" orientation="left" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} label={{ value: 'Tấn', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#94a3b8' }, offset: 10 }} />
                                                    <YAxis yAxisId="hc" orientation="right" tick={{ fontSize: 9, fill: '#6366f1' }} tickLine={false} axisLine={false} label={{ value: 'Người', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: '#6366f1' }, offset: 10 }} />
                                                    <YAxis yAxisId="eff" orientation="right" hide />
                                                    <Tooltip
                                                        content={({ active, payload, label }: any) => {
                                                            if (!active || !payload?.length) return null
                                                            return (
                                                                <div className="bg-white/95 border border-slate-200 rounded-lg shadow-xl p-2.5 text-[10px] z-50 min-w-[160px]">
                                                                    <p className="font-bold text-slate-700 mb-1.5 border-b pb-1">{label}</p>
                                                                    {payload.map((e: any, i: number) => (
                                                                        <div key={i} className="flex justify-between gap-4 py-0.5">
                                                                            <span className="text-slate-500 flex items-center gap-1">
                                                                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }} />
                                                                                {e.name}
                                                                            </span>
                                                                            <span className="font-black text-slate-800">{e.value !== null && e.value !== undefined ? Number(e.value).toLocaleString('vi-VN', { maximumFractionDigits: 3 }) : '—'}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )
                                                        }}
                                                    />
                                                    <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '6px' }} />
                                                    {/* Week separators — dashed line before each Monday */}
                                                    {dailyMpData.filter(d => d.isWeekStart).map(d => (
                                                        <ReferenceLine key={`w-${d.name}`} yAxisId="hc" x={d.name}
                                                            stroke="#475569" strokeWidth={1.5} strokeDasharray="4 3"
                                                            label={{ value: 'W', position: 'insideTopLeft', fontSize: 8, fill: '#475569' }}
                                                        />
                                                    ))}
                                                    {/* Stacked headcount bars */}
                                                    <Bar yAxisId="hc" dataKey="official" name="CT (người)" stackId="hc" fill="#818cf8" opacity={0.75} radius={[0, 0, 0, 0]} />
                                                    <Bar yAxisId="hc" dataKey="seasonal" name="TV (người)" stackId="hc" fill="#c4b5fd" opacity={0.65} radius={[2, 2, 0, 0]} />
                                                    {/* Output line */}
                                                    <Line yAxisId="ton" type="monotone" dataKey="output" name="Output (T)" stroke="#E30613" strokeWidth={2} dot={{ r: 3, fill: '#E30613' }} activeDot={{ r: 5 }} />
                                                    {/* Efficiency line */}
                                                    <Line yAxisId="eff" type="monotone" dataKey="effPerPerson" name="T/người" stroke="#059669" strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}

                                    {/* SHELL: Gap chart — Dept HC vs Line Manpower */}
                                    {selectedDept === 'SHELL' && dailyMpData.some(d => d.shellingLineMP > 0) && (
                                        <div className="space-y-1">
                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                🔧 Shelling: Tổng BP vs Nhân sự tại Line theo ngày
                                                <span className="ml-1 text-[10px] font-normal text-slate-400">(vùng xám = người hỗ trợ, điều phối, vệ sinh...)</span>
                                            </p>
                                            <ResponsiveContainer width="100%" height={180}>
                                                <ComposedChart data={dailyMpData.filter(d => d.shellingLineMP > 0)} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                                    <Tooltip
                                                        content={({ active, payload, label }: any) => {
                                                            if (!active || !payload?.length) return null
                                                            const d = dailyMpData.find(x => x.name === label)
                                                            return (
                                                                <div className="bg-white/95 border border-slate-200 rounded-lg shadow-xl p-2.5 text-[10px] z-50">
                                                                    <p className="font-bold text-slate-700 mb-1 border-b pb-1">{label}</p>
                                                                    <div className="flex justify-between gap-4"><span className="text-blue-500">Tại line</span><span className="font-black">{d?.shellingLineMP} người</span></div>
                                                                    <div className="flex justify-between gap-4"><span className="text-slate-400">Hỗ trợ</span><span className="font-black">{d?.gap ?? 0} người</span></div>
                                                                    <div className="flex justify-between gap-4 border-t mt-1 pt-1"><span className="text-indigo-600 font-semibold">Tổng BP</span><span className="font-black">{d?.totalHC} người</span></div>
                                                                </div>
                                                            )
                                                        }}
                                                    />
                                                    <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '4px' }} />
                                                    <Bar dataKey="shellingLineMP" name="Người tại Line" stackId="mp" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                                                    <Bar dataKey="gap" name="Hỗ trợ / Khác" stackId="mp" fill="#cbd5e1" opacity={0.8} radius={[2, 2, 0, 0]} />
                                                    <Line type="monotone" dataKey="totalHC" name="Tổng BP (BC)" stroke="#6366f1" strokeWidth={2} dot={{ r: 2.5, fill: '#6366f1' }} connectNulls />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}

                                    {/* Auto Insights */}
                                    {insights.length > 0 && (
                                        <div className="space-y-1.5 border-t pt-3">
                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">🧠 Phân tích tự động</p>
                                            <div className="space-y-1.5">
                                                {insights.map((ins, i) => (
                                                    <div key={i} className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
                                                        <span className="text-sm mt-0.5 flex-shrink-0">{ins.icon}</span>
                                                        <span className={`text-xs font-medium ${ins.color}`}>{ins.text}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                </CardContent>
                            </Card>
                        )
                    })()}


                    {/* Shelling Lines Summary */}
                    {selectedDept === "SHELL" && (
                        <div id="report-shelling" className="space-y-6">
                            <Card>
                                <CardHeader className="pb-2 flex flex-row items-center justify-between border-b bg-slate-50/50">
                                    <CardTitle className="text-sm font-bold text-slate-800">Shelling Lines — {language === 'vi' ? 'Tổng tháng' : 'Monthly Total'}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b bg-muted/40">
                                                    <th className="text-left p-2 font-semibold">Line</th>
                                                    <th className="text-right p-2 font-semibold">Production (T)</th>
                                                    <th className="text-right p-2 font-semibold">Run Hours (h)</th>
                                                    <th className="text-right p-2 font-semibold">Efficiency (T/h)</th>
                                                    <th className="text-right p-2 font-semibold">Manpower (P)</th>
                                                    <th className="text-right p-2 font-semibold">Productivity (T/P)</th>
                                                    <th className="text-right p-2 font-semibold">% Total SL</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {["A", "B", "C", "D1", "D2"].flatMap(line => {
                                                    const lineRows = filteredShellingLines.filter(r => r.line_code === line)
                                                    const tons = lineRows.reduce((s, r) => s + Number(r.actual_ton), 0)
                                                    const hours = lineRows.reduce((s, r) => s + Number(r.run_hours), 0)
                                                    const manpower = lineRows.reduce((s, r) => s + Number(r.manpower || 0), 0)

                                                    if (tons === 0 && hours === 0) return []

                                                    const eff = hours > 0 ? tons / hours : 0
                                                    const mpEff = manpower > 0 ? tons / manpower : 0
                                                    const pctTot = summary.totalActual > 0 ? (tons / summary.totalActual * 100) : 0
                                                    const colors: Record<string, string> = { A: "text-blue-600", B: "text-emerald-600", C: "text-amber-600", D1: "text-red-600", D2: "text-purple-600" }

                                                    const shifts = ['Ca 1', 'Ca 2', 'Ca 3']
                                                    const shiftElems = shifts.map(shift => {
                                                        const shiftRows = lineRows.filter(r => (r.shift_name || 'Ca 1') === shift)
                                                        const sTons = shiftRows.reduce((s, r) => s + Number(r.actual_ton), 0)
                                                        const sHours = shiftRows.reduce((s, r) => s + Number(r.run_hours), 0)
                                                        const sManpower = shiftRows.reduce((s, r) => s + Number(r.manpower || 0), 0)
                                                        if (sTons === 0 && sHours === 0) return null

                                                        const sEff = sHours > 0 ? sTons / sHours : 0
                                                        const sMpEff = sManpower > 0 ? sTons / sManpower : 0
                                                        const sPctTot = summary.totalActual > 0 ? (sTons / summary.totalActual * 100) : 0

                                                        const effDiff = eff > 0 ? ((sEff - eff) / eff) * 100 : 0;
                                                        const sEffColor = effDiff <= -10 ? "text-red-700 bg-red-100 px-1 rounded font-bold inline-block shadow-sm" : "text-emerald-700 font-medium";
                                                        const mpEffDiff = mpEff > 0 ? ((sMpEff - mpEff) / mpEff) * 100 : 0;
                                                        const sMpEffColor = mpEffDiff <= -10 ? "text-red-700 bg-red-100 px-1 rounded font-bold inline-block shadow-sm" : "text-blue-600 font-medium";

                                                        return (
                                                            <tr key={`${line}-${shift}`} className="border-b hover:bg-muted/20 text-sm">
                                                                <td className="p-2 pl-6 font-medium text-muted-foreground">↳ Shift {shift.split(' ')[1]}</td>
                                                                <td className="p-2 text-right font-medium">{sTons.toFixed(2)}</td>
                                                                <td className="p-2 text-right text-muted-foreground">{sHours.toFixed(1)}</td>
                                                                <td className="p-2 text-right">
                                                                    <span className={sEffColor}>{sEff > 0 ? sEff.toFixed(3) : "—"}</span>
                                                                    {effDiff <= -10 && <span className="text-[10px] text-red-500 ml-1 font-bold">({effDiff.toFixed(0)}%)</span>}
                                                                </td>
                                                                <td className="p-2 text-right text-amber-600">{sManpower}</td>
                                                                <td className="p-2 text-right">
                                                                    <span className={sMpEffColor}>{sMpEff > 0 ? sMpEff.toFixed(3) : "—"}</span>
                                                                    {mpEffDiff <= -10 && <span className="text-[10px] text-red-500 ml-1 font-bold">({mpEffDiff.toFixed(0)}%)</span>}
                                                                </td>
                                                                <td className="p-2 text-right text-muted-foreground">{sPctTot.toFixed(1)}%</td>
                                                            </tr>
                                                        )
                                                    })

                                                    return [
                                                        <tr key={line} className="border-b bg-muted/10">
                                                            <td className={`p-2 font-black ${colors[line]}`}>{line} (Total)</td>
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
                                                {/* ── GRAND TOTAL ROW ── */}
                                                {(() => {
                                                    const allTons = filteredShellingLines.reduce((s, r) => s + Number(r.actual_ton || 0), 0)
                                                    const allHours = filteredShellingLines.reduce((s, r) => s + Number(r.run_hours || 0), 0)
                                                    const allManpower = filteredShellingLines.reduce((s, r) => s + Number(r.manpower || 0), 0)
                                                    const allEff = allHours > 0 ? allTons / allHours : 0
                                                    const allMpEff = allManpower > 0 ? allTons / allManpower : 0
                                                    if (allTons === 0 && allHours === 0) return null
                                                    return (
                                                        <tr className="border-t-2 border-slate-400 bg-slate-100">
                                                            <td className="p-2 text-sm font-black text-slate-800 uppercase tracking-wide">
                                                                🏭 {language === 'vi' ? 'TỔNG TẤT CẢ LINE' : 'ALL LINES TOTAL'}
                                                            </td>
                                                            <td className="p-2 text-right text-base font-black text-slate-900">{allTons.toFixed(2)}</td>
                                                            <td className="p-2 text-right font-bold text-slate-700">{allHours.toFixed(1)}</td>
                                                            <td className="p-2 text-right font-black text-emerald-800">{allEff > 0 ? allEff.toFixed(3) : '—'}</td>
                                                            <td className="p-2 text-right font-bold text-amber-700">{allManpower}</td>
                                                            <td className="p-2 text-right font-black text-blue-800">{allMpEff > 0 ? allMpEff.toFixed(3) : '—'}</td>
                                                            <td className="p-2 text-right font-bold text-slate-600">100%</td>
                                                        </tr>
                                                    )
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* OEE Summary KPI Cards */}
                            <div id="report-oee" />
                            {oeeSummaryByLine.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2 flex flex-row items-center justify-between border-b bg-indigo-50/30">
                                        <CardTitle className="text-sm font-bold text-indigo-800">📈 OEE — Hiệu suất Tổng thể từng Line (Tháng)</CardTitle>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">Avail × Perf × Quality | Lý thuyết 8h/ca</span>
                                            <button
                                                onClick={() => setShowOEEHelp(true)}
                                                className="w-5 h-5 rounded-full bg-indigo-200 hover:bg-indigo-300 text-indigo-700 text-[11px] font-black flex items-center justify-center transition-colors"
                                                title="Hướng dẫn cách tính OEE"
                                            >?</button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-4">
                                        <div className="grid grid-cols-5 gap-3">
                                            {oeeSummaryByLine.map(({ line, avail, perf, qual, oee }) => {
                                                const lineColors: Record<string, string> = { A: 'border-blue-400', B: 'border-emerald-400', C: 'border-amber-400', D1: 'border-red-400', D2: 'border-purple-400' }
                                                const oeeColor = oee >= 0.75 ? 'text-green-700 bg-green-50' : oee >= 0.55 ? 'text-yellow-700 bg-yellow-50' : 'text-red-700 bg-red-50'
                                                return (
                                                    <div key={line} className={`flex flex-col items-center gap-1.5 p-3 border-2 rounded-xl ${lineColors[line]} bg-white shadow-sm`}>
                                                        <span className="text-xs font-black text-slate-700">Line {line}</span>
                                                        <div className={`text-xl font-black px-3 py-1 rounded-lg ${oeeColor}`}>{(oee * 100).toFixed(1)}%</div>
                                                        <div className="w-full text-[10px] text-center space-y-0.5 text-slate-500">
                                                            <div>Avail: <b className="text-blue-600">{(avail * 100).toFixed(1)}%</b></div>
                                                            <div>Perf: <b className="text-emerald-600">{(perf * 100).toFixed(1)}%</b></div>
                                                            <div>Quality: <b className="text-rose-600">{(qual * 100).toFixed(1)}%</b></div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-3 text-center">🟢 ≥75% tốt · 🟡 55–74% cần cải thiện · 🔴 &lt;55% kém</p>
                                    </CardContent>
                                </Card>
                            )}

                            {/* OEE Help Modal */}
                            {showOEEHelp && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowOEEHelp(false)}>
                                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 relative" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => setShowOEEHelp(false)}
                                            className="absolute top-3 right-4 text-slate-400 hover:text-slate-700 text-lg font-bold"
                                        >✕</button>
                                        <h2 className="text-base font-black text-indigo-800 mb-1">📈 Cách tính OEE — Shelling</h2>
                                        <p className="text-[11px] text-slate-500 mb-4">OEE (Overall Equipment Effectiveness) = Tính sẵn sàng × Hiệu suất × Chất lượng</p>

                                        <div className="space-y-4 text-[12px]">
                                            {/* Formula box */}
                                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-center">
                                                <span className="font-black text-indigo-700 text-sm">OEE = Avail × Perf × Quality</span>
                                            </div>

                                            {/* Availability */}
                                            <div className="border rounded-xl p-3 space-y-1">
                                                <div className="font-bold text-blue-700">🕐 Tính sẵn sàng (Availability)</div>
                                                <div className="bg-slate-50 rounded-lg px-3 py-1.5 font-mono text-[11px] text-slate-700">
                                                    Avail = Giờ chạy thực tế ÷ Giờ kế hoạch
                                                </div>
                                                <ul className="text-slate-600 space-y-0.5 pl-2 list-disc list-inside">
                                                    <li><b>Giờ chạy thực tế</b>: cột <code className="bg-slate-100 px-1 rounded">run_hours</code> nhập từ màn hình Input mỗi ca</li>
                                                    <li><b>Giờ kế hoạch</b>: số ca hoạt động trong ngày × 8h/ca</li>
                                                    <li>Ca hoạt động = ca có bất kỳ line nào có <code className="bg-slate-100 px-1 rounded">run_hours &gt; 0</code> hoặc <code className="bg-slate-100 px-1 rounded">actual_ton &gt; 0</code></li>
                                                </ul>
                                            </div>

                                            {/* Performance */}
                                            <div className="border rounded-xl p-3 space-y-1">
                                                <div className="font-bold text-emerald-700">⚡ Hiệu suất (Performance)</div>
                                                <div className="bg-slate-50 rounded-lg px-3 py-1.5 font-mono text-[11px] text-slate-700">
                                                    Perf = Sản lượng thực ÷ (Giờ chạy × Công suất lý thuyết)
                                                </div>
                                                <ul className="text-slate-600 space-y-0.5 pl-2 list-disc list-inside">
                                                    <li><b>Sản lượng thực</b>: cột <code className="bg-slate-100 px-1 rounded">actual_ton</code></li>
                                                    <li><b>Công suất lý thuyết</b>: A=1.4 T/h · B=1.8 T/h · C=1.5 T/h · D1=1.2 T/h · D2=1.2 T/h</li>
                                                    <li>Tối đa 100% (nếu vượt lý thuyết vẫn tính bằng 100%)</li>
                                                </ul>
                                            </div>

                                            {/* Quality */}
                                            <div className="border rounded-xl p-3 space-y-1">
                                                <div className="font-bold text-rose-700">🎯 Chất lượng (Quality)</div>
                                                <div className="bg-slate-50 rounded-lg px-3 py-1.5 font-mono text-[11px] text-slate-700">
                                                    Quality = 1 − (Tổng tấn vỡ ÷ Tổng sản lượng)
                                                </div>
                                                <ul className="text-slate-600 space-y-0.5 pl-2 list-disc list-inside">
                                                    <li><b>Tỷ lệ vỡ</b>: cột <code className="bg-slate-100 px-1 rounded">broken_pct</code> (%) nhập từ Input</li>
                                                    <li>Tấn vỡ = <code className="bg-slate-100 px-1 rounded">broken_pct/100 × actual_ton</code></li>
                                                    <li>Tính weighted average theo sản lượng khi tổng hợp nhiều ca</li>
                                                </ul>
                                            </div>

                                            {/* Data source */}
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
                                                <b>📋 Dữ liệu lấy từ:</b> bảng <code className="bg-amber-100 px-1 rounded">shelling_line_daily</code> — nhập tại màn hình <b>Input → Shelling</b> mỗi ca (run_hours, actual_ton, broken_pct)
                                            </div>

                                            {/* Thresholds */}
                                            <div className="flex gap-2 text-[11px]">
                                                <span className="flex-1 text-center bg-green-50 border border-green-200 rounded-lg py-1.5 font-bold text-green-700">🟢 ≥ 75%<br /><span className="font-normal">Tốt</span></span>
                                                <span className="flex-1 text-center bg-yellow-50 border border-yellow-200 rounded-lg py-1.5 font-bold text-yellow-700">🟡 55–74%<br /><span className="font-normal">Cần cải thiện</span></span>
                                                <span className="flex-1 text-center bg-red-50 border border-red-200 rounded-lg py-1.5 font-bold text-red-700">🔴 &lt; 55%<br /><span className="font-normal">Kém</span></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Shelling Analytics Overview */}
                            <div>
                                {/* SECTION 1: OVERALL FACTORY PERFORMANCE */}
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">1. {language === 'vi' ? 'Hiệu suất Tổng thể' : 'Overall Performance'}</h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                        {/* Cross-Line Performance */}
                                        <Card className="col-span-1 lg:col-span-3 shadow-sm border-emerald-100">
                                            <CardHeader className="pb-2 bg-emerald-50/30 border-b border-emerald-50">
                                                <div className="flex flex-col gap-1">
                                                    <CardTitle className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                                                        <TrendingUp className="h-4 w-4" />
                                                        {t("report.shelling.crossLine.title")}
                                                    </CardTitle>
                                                    <CardDescription className="text-xs text-emerald-700 leading-relaxed">
                                                        {language === 'vi'
                                                            ? 'Biểu đồ theo dõi hiệu suất tốc độ (Tấn/Giờ) của từng máy shelling (A, B, C, D1, D2) theo ngày trong tháng. Dùng để so sánh các máy với nhau: máy nào đang chạy nhanh, máy nào chậm, và xu hướng thay đổi hiệu suất theo thời gian. Nếu một đường tụt đột ngột, cần kiểm tra lý do (dao cụ, nguyên liệu, v.v.)'
                                                            : 'Tracks the hourly throughput (Tons/Hour) of each shelling line (A, B, C, D1, D2) day by day. Use this to compare lines against each other and spot trends — a sudden drop in a line may indicate a tooling issue, raw material problem, or maintenance event.'}
                                                    </CardDescription>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="pt-4">
                                                <div className="h-72 w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart data={crossLinePerfChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                            <YAxis tick={{ fontSize: 10 }} />
                                                            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                                                            <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                            <Line type="monotone" dataKey="A" name="Line A" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
                                                            <Line type="monotone" dataKey="B" name="Line B" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                                                            <Line type="monotone" dataKey="C" name="Line C" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                                                            <Line type="monotone" dataKey="D1" name="Line D1" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
                                                            <Line type="monotone" dataKey="D2" name="Line D2" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* OEE Trend Chart */}
                                        {oeeChartData.length > 0 && (
                                            <Card className="col-span-1 lg:col-span-3 shadow-sm border-indigo-100">
                                                <CardHeader className="pb-2 bg-indigo-50/30 border-b border-indigo-50">
                                                    <CardTitle className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                                                        <TrendingUp className="h-4 w-4" />
                                                        OEE (%) theo Ngày — Từng Line
                                                    </CardTitle>
                                                    <CardDescription className="text-xs text-indigo-600 leading-relaxed">
                                                        Biểu đồ OEE (%) của từng Line theo ngày trong tháng. OEE = Tính sẵn sàng × Hiệu suất × Chất lượng. Ngưỡng tốt ≥ 75%. Dùng để phát hiện ngày/Line nào có hiệu quả tổng thể thấp cần can thiệp.
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="pt-4">
                                                    <div className="h-72 w-full">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <ComposedChart data={oeeChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                                                                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} formatter={(v: any) => [`${v}%`, 'OEE']} />
                                                                <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                                <ReferenceLine y={75} stroke="#16a34a" strokeDasharray="4 2" opacity={0.5} label={{ position: 'insideTopLeft', value: 'Good ≥75%', fill: '#16a34a', fontSize: 9 }} />
                                                                <Line type="monotone" dataKey="A" name="Line A" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                <Line type="monotone" dataKey="B" name="Line B" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                <Line type="monotone" dataKey="C" name="Line C" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                <Line type="monotone" dataKey="D1" name="Line D1" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                <Line type="monotone" dataKey="D2" name="Line D2" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                            </ComposedChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {/* Chart 4: Leader Comparison */}
                                        <Card className="col-span-1 lg:col-span-3 shadow-sm border-violet-100">
                                            <CardHeader className="pb-2 bg-violet-50/30 border-b border-violet-50">
                                                <CardTitle className="text-sm font-bold text-violet-700">{language === 'vi' ? 'So sánh Ca trưởng (Tháng)' : 'Overall Leader Comparison (Month)'}</CardTitle>
                                                <CardDescription className="text-xs text-violet-600 leading-relaxed">
                                                    {language === 'vi'
                                                        ? 'So sánh kết quả tổng hợp theo từng Trưởng ca trong tháng: cột Xanh là Sản lượng (T), cột Đỏ là tổng Downtime (Phút). Đường Xanh lá là Hiệu suất T/h, đường Tím là Năng suất T/Người. Dùng để đánh giá hiệu quả quản lý ca của từng Leader, đặc biệt thấy được ai có downtime cao hoặc năng suất thấp.'
                                                        : 'Aggregated monthly comparison by shift leader. Blue bars = total production (tons), Red bars = total downtime (mins). Green line = efficiency (T/h), Purple line = productivity per person (T/person). Ideal: high production, low downtime, high efficiency lines.'}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="pt-4">
                                                <div className="h-72 w-full mt-4">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart data={leaderCompareData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                            <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 'bold' }} />
                                                            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                                                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                                                            <Tooltip contentStyle={{ fontSize: '13px' }} cursor={{ fill: 'transparent' }} />
                                                            <Legend wrapperStyle={{ fontSize: '12px', bottom: -5 }} />
                                                            <Bar yAxisId="left" dataKey="Sản_Lượng" name="Total Production (Tons)" fill="#3b82f6" barSize={40} radius={[4, 4, 0, 0]} />
                                                            <Bar yAxisId="left" dataKey="Downtime" name="Total Downtime (Mins)" fill="#f43f5e" barSize={40} radius={[4, 4, 0, 0]} />
                                                            <Line yAxisId="right" type="monotone" dataKey="Hiệu_Suất_T_h" name="Efficiency (Tons/Hour)" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} />
                                                            <Line yAxisId="right" type="monotone" dataKey="Năng_Suất_TNg" name="Productivity (Tons/Person)" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 5 }} />
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Chart 2: Downtime by Line (SHELL — per-line stacked)
                                        NOTE: Hidden — overall downtime analysis moved to Downtime Impact
                                        section at top of report. This chart (per-line breakdown) is
                                        available in Deep-Dive SECTION 3 below.
                                    */}

                                        {/* All-Lines Broken Rate Overview */}
                                        {allLineBrokenData.some(d => d.broken !== null) && (
                                            <Card className="col-span-1 lg:col-span-3 shadow-sm border-rose-100">
                                                <CardHeader className="pb-2 bg-rose-50/30 border-b border-rose-50">
                                                    <div className="flex flex-col gap-1">
                                                        <CardTitle className="text-sm font-bold text-rose-800 flex items-center gap-2">
                                                            <TrendingDown className="h-4 w-4" />
                                                            {language === 'vi' ? 'Tỷ lệ Bể Tổng thể — Tất cả Line (Theo ngày)' : 'Overall Broken Rate — All Lines (Daily)'}
                                                        </CardTitle>
                                                        <CardDescription className="text-xs text-rose-700 leading-relaxed">
                                                            {language === 'vi'
                                                                ? 'Đường đỏ = tỷ lệ bể trung bình có trọng số tấn của tất cả 5 line trong ngày. Cột nhạt = tổng sản lượng ngày (trục trái). Đường đứt nét = ngưỡng cảnh báo 4.5%. Ngày nào đường đỏ vượt ngưỡng → cần điều tra ngay.'
                                                                : 'Red line = tonnage-weighted average broken rate across all 5 lines per day. Bars = total daily production (left axis). Dashed line = 4.5% alert threshold. Days where the red line exceeds threshold need immediate investigation.'}
                                                        </CardDescription>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="pt-4">
                                                    <div className="h-72 w-full">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <ComposedChart data={allLineBrokenData} margin={{ top: 5, right: 30, left: -10, bottom: 0 }}>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}T`} />
                                                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
                                                                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                                                                    formatter={(v: any, name?: string) =>
                                                                        name === (language === 'vi' ? 'Sản lượng (T)' : 'Production (T)')
                                                                            ? [`${v} T`, name]
                                                                            : [`${v}%`, name]
                                                                    } />
                                                                <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                                <Bar yAxisId="left" dataKey="totalTon" name={language === 'vi' ? 'Sản lượng (T)' : 'Production (T)'} fill="#fca5a5" opacity={0.4} radius={[2, 2, 0, 0]} maxBarSize={40} />
                                                                <Line yAxisId="right" type="monotone" dataKey="broken" name={language === 'vi' ? 'Tỷ lệ Bể TB (%)' : 'Avg Broken Rate (%)'} stroke="#e11d48" strokeWidth={2.5} dot={(props: any) => {
                                                                    if (props.payload.broken === null) return <g key={props.key} />;
                                                                    const isBad = props.payload.broken > THRESHOLD_BROKEN;
                                                                    return <circle key={props.key} cx={props.cx} cy={props.cy} r={isBad ? 5 : 3} fill={isBad ? '#b91c1c' : '#e11d48'} stroke={isBad ? '#fff' : 'none'} strokeWidth={1.5} />;
                                                                }} connectNulls />
                                                                <ReferenceLine yAxisId="right" y={THRESHOLD_BROKEN} stroke="#dc2626" strokeDasharray="5 3" opacity={0.8}
                                                                    label={{ position: 'insideTopRight', value: `⚠ ${THRESHOLD_BROKEN}%`, fill: '#dc2626', fontSize: 9, fontWeight: 'bold' }} />
                                                            </ComposedChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </div>
                                </div>

                                {/* SECTION 2: ADVANCED CORRELATIONS (QUALITY & ENERGY) */}
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">2. Phân tích Chuyên sâu (Advanced Correlations)</h3>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {/* Speed vs Quality Correlation */}
                                        <Card className="shadow-sm border-blue-100">
                                            <CardHeader className="pb-2 bg-blue-50/30 border-b border-blue-50">
                                                <CardTitle className="text-sm font-bold text-blue-800">{t("report.shelling.speedQuality.title")}</CardTitle>
                                                <CardDescription className="text-xs text-blue-700 leading-relaxed">
                                                    {language === 'vi'
                                                        ? 'Mỗi chấm = một ca sản xuất (trục X: tốc độ T/h, trục Y: tỷ lệ bể %). Nếu các chấm có xu hướng đi lên theo X → tốc độ cao làm bể nhiều. Chấm màu đỏ = ca vượt ngưỡng bể 4.5%, cần kiểm tra lại cài đặt máy. Nên duy trì điểm hoạt động ở vùng tốc độ cao nhưng bể thấp.'
                                                        : 'Each dot = one production shift (X-axis: speed in T/h, Y-axis: broken %). An upward trend as X increases means higher speed causes more broken kernels. Red dots = shifts exceeding the 4.5% broken alarm threshold. Aim to keep operating points in the high-speed, low-broken zone.'}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="pt-4">
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart data={speedQualityData} margin={{ top: 5, right: 30, left: -20, bottom: 20 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                            <XAxis dataKey="speed" type="number" name={t("report.shelling.speedQuality.x").replace(" (T/h)", "")} domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: t("report.shelling.speedQuality.x"), position: "insideBottomRight", offset: -5, fontSize: 10 }} />
                                                            <YAxis dataKey="broken" type="number" name={t("report.shelling.speedQuality.y").replace(" (%)", "")} tick={{ fontSize: 10 }} label={{ value: t("report.shelling.speedQuality.y"), angle: -90, position: "insideLeft", fontSize: 10 }} />
                                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: '11px', borderRadius: '8px' }} formatter={(value: any, name: any) => [value, name === 'speed' ? 'T/h' : '%']} />
                                                            <Scatter name={t("report.shelling.speedQuality.scatter")} dataKey="broken" fillOpacity={0.6}>
                                                                {speedQualityData.map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.broken > THRESHOLD_BROKEN ? '#e11d48' : '#3b82f6'} />
                                                                ))}
                                                            </Scatter>
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <p className="text-xs text-center text-slate-500 mt-2 font-medium">{t("report.shelling.speedQuality.desc")}</p>
                                            </CardContent>
                                        </Card>

                                        {/* Energy Intensity */}
                                        <Card className="shadow-sm border-amber-100">
                                            <CardHeader className="pb-2 bg-amber-50/30 border-b border-amber-50">
                                                <CardTitle className="text-sm font-bold text-amber-800">{t("report.shelling.energy.title")}</CardTitle>
                                                <CardDescription className="text-xs text-amber-700 leading-relaxed">
                                                    {language === 'vi'
                                                        ? 'Cột vàng = sản lượng ngày (Tấn, trục trái). Đường cam = định mức kWh tiêu thụ trên mỗi tấn sản phẩm (trục phải). Định mức thấp = tốt (ít điện cho mỗi tấn). Nên để ý ngày nào đường cam tăng đột biến trong khi sản lượng thấp — có thể máy chạy không tải hoặc kém hiệu quả năng lượng.'
                                                        : 'Yellow bars = daily production (Tons, left axis). Orange line = energy intensity in kWh per ton processed (right axis). Lower intensity = better efficiency. Flag days when intensity spikes while production drops — this may indicate idle running or energy-wasting conditions.'}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="pt-4">
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart data={shellingEnergyChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                                                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                                                            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                                                            <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                            <Bar yAxisId="left" dataKey="actual_ton" name={t("report.shelling.energy.prod")} fill="#fcd34d" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                                            <Line yAxisId="right" type="monotone" dataKey="intensity" name={t("report.shelling.energy.intens")} stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <p className="text-xs text-center text-slate-500 mt-2 font-medium">{t("report.shelling.energy.desc")}</p>
                                            </CardContent>
                                        </Card>
                                    </div>
                                    <div className="mt-4 grid grid-cols-1 gap-4">
                                        {/* Chart 6: Size Performance */}
                                        <Card className="col-span-1 shadow-sm">
                                            <CardHeader className="pb-0">
                                                <div className="flex flex-col gap-1">
                                                    <CardTitle className="text-sm font-bold text-teal-700">{language === 'vi' ? 'Phân tích Năng suất & tỉ lệ vỡ theo Kích cỡ' : 'Performance & Broken Rate Analysis by Size'}</CardTitle>
                                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                                        💡 <span className="font-semibold text-slate-700">Mẹo Xem:</span> Di chuột (hover) vào hình cột để xem danh sách các Máy (Line) đang chạy Size hạt đó. Hoặc cuộn xuống bảng <span className="font-semibold">Chi tiết từng ca Shelling</span> cuối trang để xem cụ thể.
                                                    </p>
                                                </div>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                                                    {/* Size Performance */}
                                                    <div className="h-64 w-full">
                                                        <p className="text-xs font-semibold text-center text-teal-800 mb-2">Hiệu suất (Tấn/Giờ) theo Size</p>
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <ComposedChart data={sizePerfChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'bold' }} />
                                                                <YAxis tick={{ fontSize: 10 }} />
                                                                <Tooltip contentStyle={{ fontSize: '12px' }} formatter={(v: any, name: any, props: any) => [`${Number(v).toFixed(2)} T/h`, `Hiệu suất (Line: ${props.payload.Lines})`]} cursor={{ fill: 'transparent' }} />
                                                                <Bar dataKey="Hiệu_Suất_T_h" name="Hiệu suất (T/h)" fill="#0d9488" barSize={30} radius={[4, 4, 0, 0]} />
                                                            </ComposedChart>
                                                        </ResponsiveContainer>
                                                    </div>

                                                    {/* Size Broken Pct */}
                                                    <div className="h-64 w-full">
                                                        <p className="text-xs font-semibold text-center text-rose-800 mb-2">Tỷ lệ Bể TB (%) theo Size</p>
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <ComposedChart data={sizeBrokenChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'bold' }} />
                                                                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                                                                <Tooltip contentStyle={{ fontSize: '12px' }} formatter={(v: any, name: any, props: any) => [`${Number(v).toFixed(2)}%`, `Tỷ lệ Bể (Line: ${props.payload.Lines})`]} cursor={{ fill: 'transparent' }} />
                                                                <Bar dataKey="Tỷ_Lệ_Bể" name="Tỷ lệ Bể (%)" barSize={30} radius={[4, 4, 0, 0]}>
                                                                    {sizeBrokenChartData.map((entry, index) => (
                                                                        <Cell key={`cell-${index}`} fill={entry.Tỷ_Lệ_Bể > THRESHOLD_BROKEN ? '#b51739' : '#e11d48'} />
                                                                    ))}
                                                                </Bar>
                                                            </ComposedChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Chart 7 & 8: Line-Size Analysis */}
                                        {(lineSizePerfChartData.length > 0 || lineSizeBrokenChartData.length > 0) && (
                                            <Card className="col-span-1 shadow-sm">
                                                <CardHeader className="pb-0">
                                                    <CardTitle className="text-sm font-bold text-slate-700">{language === 'vi' ? 'Chi tiết Theo Chuyền & Kích cỡ' : 'By Line & Size Details'}</CardTitle>
                                                    <CardDescription className="text-[11px] leading-relaxed text-slate-600">
                                                        {language === 'vi'
                                                            ? 'Phân tích hiệu suất và tỷ lệ bể chi tiết cho từng loại kích cỡ hạt trên từng chuyền máy. Giúp xác định các điểm nghẽn hoặc vấn đề chất lượng đặc thù của từng Size.'
                                                            : 'Detailed analysis of efficiency and broken rates for each product size on each specific line. Helps identify bottlenecks or quality issues specific to certain sizes.'
                                                        }
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                                                        {/* Line-Size Performance */}
                                                        <div className="h-72 w-full">
                                                            <p className="text-xs font-semibold text-center text-teal-800 mb-2">Efficiency (T/h) by Line & Size</p>
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <ComposedChart data={lineSizePerfChartData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                                    <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'bold' }} angle={-30} textAnchor="end" />
                                                                    <YAxis tick={{ fontSize: 10 }} />
                                                                    <Tooltip contentStyle={{ fontSize: '12px' }} formatter={(v: any) => [`${Number(v).toFixed(2)} T/h`, `Hiệu suất`]} cursor={{ fill: 'transparent' }} />
                                                                    <Bar dataKey="Hiệu_Suất_T_h" name="Efficiency (T/h)" fill="#0d9488" barSize={30} radius={[4, 4, 0, 0]} />
                                                                </ComposedChart>
                                                            </ResponsiveContainer>
                                                        </div>

                                                        {/* Line-Size Broken Pct */}
                                                        <div className="h-72 w-full">
                                                            <p className="text-xs font-semibold text-center text-rose-800 mb-2">Broken Rate (%) by Line & Size</p>
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <ComposedChart data={lineSizeBrokenChartData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                                    <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'bold' }} angle={-30} textAnchor="end" />
                                                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                                                                    <Tooltip contentStyle={{ fontSize: '12px' }} formatter={(v: any) => [`${Number(v).toFixed(2)}%`, `Tỷ lệ Bể`]} cursor={{ fill: 'transparent' }} />
                                                                    <Bar dataKey="Tỷ_Lệ_Bể" name="Broken Rate (%)" fill="#e11d48" barSize={30} radius={[4, 4, 0, 0]} />
                                                                </ComposedChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </div>
                                </div>

                                {/* SECTION 3: DEEP-DIVE ANALYSIS */}
                                <div className="pt-6 mt-4">
                                    <div className="flex flex-col gap-4 mb-4 rounded-xl shadow-sm border p-4 bg-slate-50/50">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div>
                                                <h3 className="text-base font-bold text-slate-800">
                                                    3. {deepDiveMode === 'line'
                                                        ? (language === 'vi' ? 'Phân tích chi tiết Thiết bị (Line Deep-dive)' : 'Equipment Detailed Analysis (Line Deep-dive)')
                                                        : (language === 'vi' ? 'Phân tích theo Tổ trưởng (Leader Deep-dive)' : 'Leader Detailed Analysis (Leader Deep-dive)')
                                                    }
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {deepDiveMode === 'line'
                                                        ? (language === 'vi' ? 'Chọn một chuyền cụ thể để xem hiệu suất theo từng ca.' : 'Select a specific line to view its shift-by-shift performance metrics.')
                                                        : (language === 'vi' ? 'Chọn một tổ trưởng để xem hiệu suất trên tất cả các chuyền.' : 'Select a shift leader to view their performance across all lines.')
                                                    }
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg shadow-sm self-start sm:self-center">
                                                <Button
                                                    variant={deepDiveMode === 'line' ? 'default' : 'ghost'}
                                                    size="sm"
                                                    className="h-8 text-xs px-3"
                                                    onClick={() => setDeepDiveMode('line')}
                                                >
                                                    {language === 'vi' ? 'Theo Chuyền' : 'By Line'}
                                                </Button>
                                                <Button
                                                    variant={deepDiveMode === 'leader' ? 'default' : 'ghost'}
                                                    size="sm"
                                                    className="h-8 text-xs px-3"
                                                    onClick={() => setDeepDiveMode('leader')}
                                                >
                                                    {language === 'vi' ? 'Theo Tổ trưởng' : 'By Leader'}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm self-start">
                                            <span className="text-sm font-semibold text-slate-700">
                                                {deepDiveMode === 'line' ? (language === 'vi' ? 'Chọn Line:' : 'Select Line:') : (language === 'vi' ? 'Chọn Tổ trưởng:' : 'Select Leader:')}
                                            </span>
                                            {deepDiveMode === 'line' ? (
                                                <select
                                                    value={selectedShellLine}
                                                    onChange={e => setSelectedShellLine(e.target.value)}
                                                    className="h-8 text-sm font-bold text-primary rounded-md border-none bg-transparent px-2 focus:outline-none cursor-pointer"
                                                >
                                                    {["A", "B", "C", "D1", "D2"].map(l => <option key={l} value={l}>Line {l}</option>)}
                                                </select>
                                            ) : (
                                                <select
                                                    value={selectedDeepDiveLeader}
                                                    onChange={e => {
                                                        setSelectedDeepDiveLeader(e.target.value);
                                                        setSelectedLeader(e.target.value); // Sync back to top level
                                                    }}
                                                    className="h-8 text-sm font-bold text-primary rounded-md border-none bg-transparent px-2 focus:outline-none cursor-pointer"
                                                >
                                                    <option value="Tất cả">{language === 'vi' ? 'Tất cả' : 'All Leaders'}</option>
                                                    {uniqueLeaders.map(l => <option key={l} value={l}>{l}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    </div>

                                    {selectedDept === 'SHELL' && leaderCompareData.length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                            {/* Comparison Chart 1: Production & Throughput */}
                                            <Card className="shadow-sm border-slate-200 overflow-hidden">
                                                <CardHeader className="pb-2 bg-slate-50/50 border-b">
                                                    <CardTitle className="text-[13px] font-bold flex items-center gap-2">
                                                        <div className="p-1 rounded bg-blue-100 italic">
                                                            <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                                                        </div>
                                                        {language === 'vi' ? 'Hiệu suất Tổng thể (So sánh)' : 'Overall Performance Comparison'}
                                                    </CardTitle>
                                                    <CardDescription className="text-[11px] leading-relaxed text-slate-600 px-1 pt-1 opacity-90">
                                                        {language === 'vi'
                                                            ? 'So sánh tổng sản lượng (Tấn) và công suất chạy máy trung bình (T/h) giữa các tổ trưởng. Giúp đánh giá khả năng vận hành và tiến độ hoàn thành kế hoạch của từng nhóm ca.'
                                                            : 'Compares total production (Tons) and average throughput (T/h) across shift leaders. Evaluates operational capability and plan attainment for each shift group.'
                                                        }
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="pt-4 px-2 sm:px-4">
                                                    <div className="h-60 sm:h-64">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart data={leaderCompareData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.4} />
                                                                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#475569' }} axisLine={false} tickLine={false} />
                                                                <YAxis yAxisId="left" tick={{ fontSize: 9 }} unit="T" axisLine={false} tickLine={false} />
                                                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} unit="h" axisLine={false} tickLine={false} />
                                                                <Tooltip
                                                                    contentStyle={{ fontSize: '11px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                                    cursor={{ fill: '#f1f5f9' }}
                                                                />
                                                                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} iconType="circle" />
                                                                <Bar yAxisId="left" dataKey="Sản_Lượng" name={language === 'vi' ? 'Sản Lượng (T)' : 'Production (T)'} fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24} />
                                                                <Bar yAxisId="right" dataKey="Hiệu_Suất_T_h" name={language === 'vi' ? 'Hiệu Suất (T/h)' : 'Throughput (T/h)'} fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            {/* Comparison Chart 2: Quality (% Broken) */}
                                            <Card className="shadow-sm border-slate-200 overflow-hidden">
                                                <CardHeader className="pb-2 bg-slate-50/50 border-b">
                                                    <CardTitle className="text-[13px] font-bold flex items-center gap-2">
                                                        <div className="p-1 rounded bg-rose-100 italic">
                                                            <PieChart className="h-3.5 w-3.5 text-rose-600" />
                                                        </div>
                                                        {language === 'vi' ? 'Kiểm soát Chất lượng (% Bể)' : 'Quality Control (% Broken)'}
                                                    </CardTitle>
                                                    <CardDescription className="text-[11px] leading-relaxed text-slate-600 px-1 pt-1 opacity-90">
                                                        {language === 'vi'
                                                            ? 'So sánh tỷ lệ hạt bể trung bình, được tính theo trọng số sản lượng (Weighted Average). Cột đỏ đậm cảnh báo tỷ lệ bể vượt ngưỡng cho phép (>0.8%).'
                                                            : 'Compares average broken kernel rates, weighted by production volume (Weighted Average). Dark red bars indicate rates exceeding the 0.8% threshold.'
                                                        }
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="pt-4 px-2 sm:px-4">
                                                    <div className="h-60 sm:h-64">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart data={leaderCompareData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.4} />
                                                                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#475569' }} axisLine={false} tickLine={false} />
                                                                <YAxis tick={{ fontSize: 9 }} unit="%" domain={[0, 'auto']} axisLine={false} tickLine={false} />
                                                                <Tooltip
                                                                    contentStyle={{ fontSize: '11px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                                    cursor={{ fill: '#f1f5f9' }}
                                                                    formatter={(value: any, name: any, props: any) => {
                                                                        const lines = props.payload.Lines;
                                                                        return [`${value}%`, `${language === 'vi' ? 'Chuyền làm việc' : 'Lines'}: ${lines}`];
                                                                    }}
                                                                />
                                                                <ReferenceLine y={THRESHOLD_BROKEN} stroke="#e11d48" strokeDasharray="3 3" opacity={0.6} label={{ position: 'insideTopLeft', value: `Limit ${THRESHOLD_BROKEN}%`, fill: '#be123c', fontSize: 9, fontWeight: 'bold' }} />
                                                                <Bar dataKey="Tỷ_Lệ_Bể" name={language === 'vi' ? 'Tỷ lệ bể trung bình' : 'Avg Broken %'} radius={[4, 4, 0, 0]} barSize={32}>
                                                                    {leaderCompareData.map((entry, index) => (
                                                                        <Cell key={`cell-${index}`} fill={entry.Tỷ_Lệ_Bể > THRESHOLD_BROKEN ? "#b91c1c" : "#f43f5e"} />
                                                                    ))}
                                                                </Bar>
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                        {/* Chart 1: Performance */}
                                        <Card>
                                            <CardHeader className="pb-2 border-b">
                                                <CardTitle className="text-xs font-bold">
                                                    {language === 'vi' ? 'Hiệu suất T/h' : 'Efficiency T/h'}
                                                    {deepDiveMode === 'line' ? ` (Line ${selectedShellLine})` : ` (${selectedDeepDiveLeader})`}
                                                </CardTitle>
                                                <CardDescription className="text-[11px] leading-relaxed text-slate-600">
                                                    {deepDiveMode === 'line'
                                                        ? (language === 'vi'
                                                            ? `Hiệu suất tốc độ chạy (T/h) của Line ${selectedShellLine} theo ngày, chia theo 3 ca.`
                                                            : `Daily throughput speed (T/h) for Line ${selectedShellLine} broken down by shift.`)
                                                        : (language === 'vi'
                                                            ? `Hiệu suất tốc độ chạy (T/h) của Tổ trưởng ${selectedDeepDiveLeader} trên các chuyền họ quản lý.`
                                                            : `Daily throughput speed (T/h) of ${selectedDeepDiveLeader} across managed lines.`)}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="h-64 w-full mt-2">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart
                                                            data={deepDiveMode === 'line' ? perfChartData : leaderDeepDiveData.perf}
                                                            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                            <YAxis tick={{ fontSize: 10 }} />
                                                            <Tooltip
                                                                contentStyle={{ fontSize: '11px' }}
                                                                formatter={(value: any, name: any, props: any) => {
                                                                    if (deepDiveMode === 'line') {
                                                                        const leader = props.payload[`${name}_leader`];
                                                                        return [`${Number(value).toFixed(3)} T/h`, `${name} (Leader: ${leader || '?'})`];
                                                                    }
                                                                    return [`${Number(value).toFixed(3)} T/h`, `Line ${name}`];
                                                                }}
                                                            />
                                                            <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                            {deepDiveMode === 'line' ? (
                                                                <>
                                                                    <Line type="monotone" dataKey="Ca1" name="Ca 1 (T/h)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                                                                    <Line type="monotone" dataKey="Ca2" name="Ca 2 (T/h)" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                                                                    <Line type="monotone" dataKey="Ca3" name="Ca 3 (T/h)" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Line type="monotone" dataKey="A" name="Line A" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="B" name="Line B" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="C" name="Line C" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="D1" name="Line D1" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="D2" name="Line D2" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                </>
                                                            )}
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Chart 3: Manpower */}
                                        <Card>
                                            <CardHeader className="pb-2 border-b">
                                                <CardTitle className="text-xs font-bold text-amber-700">
                                                    {language === 'vi' ? 'Năng suất Lao động' : 'Manpower Productivity'}
                                                    {deepDiveMode === 'line' ? ` (Line ${selectedShellLine})` : ` (${selectedDeepDiveLeader})`}
                                                </CardTitle>
                                                <CardDescription className="text-[11px] leading-relaxed text-slate-600">
                                                    {deepDiveMode === 'line'
                                                        ? (language === 'vi'
                                                            ? `Năng suất lao động (Tấn/Người/Ca) của Line ${selectedShellLine}.`
                                                            : `Labor productivity (Tons per person per shift) for Line ${selectedShellLine}.`)
                                                        : (language === 'vi'
                                                            ? `Năng suất lao động (Tấn/Người/Ca) của Tổ trưởng ${selectedDeepDiveLeader} trên các chuyền.`
                                                            : `Labor productivity of ${selectedDeepDiveLeader} across managed lines.`)}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="h-64 w-full mt-2">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart
                                                            data={deepDiveMode === 'line' ? manpowerChartData : leaderDeepDiveData.mp}
                                                            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                            <YAxis tick={{ fontSize: 10 }} />
                                                            <Tooltip
                                                                contentStyle={{ fontSize: '11px' }}
                                                                formatter={(value: any, name: any, props: any) => {
                                                                    if (deepDiveMode === 'line') {
                                                                        const leader = props.payload[`${name}_leader`];
                                                                        return [`${Number(value).toFixed(3)} T/P`, `${name} (Leader: ${leader || '?'})`];
                                                                    }
                                                                    return [`${Number(value).toFixed(3)} T/P`, `Line ${name}`];
                                                                }}
                                                            />
                                                            <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                            {deepDiveMode === 'line' ? (
                                                                <>
                                                                    <Line type="monotone" dataKey="Ca1" name="Ca 1 (T/Ng)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                                                                    <Line type="monotone" dataKey="Ca2" name="Ca 2 (T/Ng)" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} />
                                                                    <Line type="monotone" dataKey="Ca3" name="Ca 3 (T/Ng)" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Line type="monotone" dataKey="A" name="Line A" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="B" name="Line B" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="C" name="Line C" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="D1" name="Line D1" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="D2" name="Line D2" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                </>
                                                            )}
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Chart 5: % Broken per shift */}
                                        <Card>
                                            <CardHeader className="pb-2 border-b">
                                                <CardTitle className="text-xs font-bold text-red-700">
                                                    💔 {language === 'vi' ? '% Vỡ Đặc trưng' : '% Broken Trend'}
                                                    {deepDiveMode === 'line' ? ` (Line ${selectedShellLine})` : ` (${selectedDeepDiveLeader})`}
                                                </CardTitle>
                                                <CardDescription className="text-[11px] leading-relaxed text-slate-600">
                                                    {deepDiveMode === 'line'
                                                        ? (language === 'vi'
                                                            ? `Tỷ lệ bể (%) từng ca của Line ${selectedShellLine}.`
                                                            : `Broken kernel rate (%) per shift for Line ${selectedShellLine}.`)
                                                        : (language === 'vi'
                                                            ? `Tỷ lệ bể (%) của Tổ trưởng ${selectedDeepDiveLeader} trên các chuyền.`
                                                            : `Broken kernel rate of ${selectedDeepDiveLeader} across managed lines.`)}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="h-64 w-full mt-2">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart
                                                            data={deepDiveMode === 'line' ? brokenChartData : leaderDeepDiveData.broken}
                                                            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
                                                            <Tooltip
                                                                contentStyle={{ fontSize: '11px' }}
                                                                formatter={(value: any, name: any, props: any) => {
                                                                    if (deepDiveMode === 'line') {
                                                                        const leader = props.payload[`${name}_leader`];
                                                                        return [`${Number(value).toFixed(2)}%`, `${name} (Leader: ${leader || '?'})`];
                                                                    }
                                                                    return [`${Number(value).toFixed(2)}%`, `Line ${name}`];
                                                                }}
                                                            />
                                                            <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                                            <ReferenceLine y={THRESHOLD_BROKEN} stroke="red" strokeDasharray="3 3" opacity={0.5} label={{ position: 'insideTopLeft', value: `Alarm >${THRESHOLD_BROKEN}%`, fill: 'red', fontSize: 10 }} />
                                                            {deepDiveMode === 'line' ? (
                                                                <>
                                                                    <Line type="monotone" dataKey="Ca1" name="Ca 1 (% Bể)" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                                                    <Line type="monotone" dataKey="Ca2" name="Ca 2 (% Bể)" stroke="#fb923c" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                                                    <Line type="monotone" dataKey="Ca3" name="Ca 3 (% Bể)" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Line type="monotone" dataKey="A" name="Line A" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="B" name="Line B" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="C" name="Line C" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="D1" name="Line D1" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                    <Line type="monotone" dataKey="D2" name="Line D2" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                                </>
                                                            )}
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── PEEL_MC Quality Deep-Dive ────────────────────────── */}
                    <div id="report-quality" />
                    {selectedDept === 'PEEL' && peelingLines.length > 0 && (
                        <Card className="border-teal-100">
                            <CardHeader className="pb-3 border-b bg-teal-50/40">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    🔬 {language === 'vi' ? 'Phân Tích Chất Lượng — Peeling MC' : 'Quality Analysis — Peeling MC'}
                                    <span className="text-xs font-normal text-muted-foreground">({peelingLines.length} records)</span>
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    {language === 'vi' ? 'Phân tích Tỷ lệ Bể, Sót lụa, Pass2 theo Tổ trưởng, Ca, Line' : 'Broken %, Unpeel %, Pass2 analysis by Leader, Shift, Line'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-6">

                                {/* A. Overview KPI Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <KPICard label="Avg Broken %" value={summary?.avgBroken ? `${summary.avgBroken.toFixed(2)}%` : '—'} color="text-red-600" sub="Tỷ lệ bể TB (có trọng số)" />
                                    <KPICard label="Avg Unpeel %" value={summary?.avgUnpeel ? `${summary.avgUnpeel.toFixed(2)}%` : '—'} color="text-amber-600" sub="Sót lụa TB (có trọng số)" />
                                    <KPICard label="Pass2 Ratio" value={(() => {
                                        const totalTon = peelingLines.reduce((s, r) => s + Number(r.actual_ton || 0), 0)
                                        const totalP2 = peelingLines.reduce((s, r) => s + Number(r.pass2_ton || 0), 0)
                                        return totalTon > 0 ? `${((totalP2 / totalTon) * 100).toFixed(1)}%` : '—'
                                    })()} color="text-purple-600" sub="Lượt bóc lần 2 / Tổng" />
                                    <KPICard label="Tổ trưởng" value={`${peelingLeaderSummary.length} người`} sub={`${peelingLines.length} records`} />
                                </div>

                                {/* B. Leader Comparison */}
                                {peelingLeaderSummary.length > 0 && (
                                    <div className="space-y-3">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">👷 So sánh Tổ trưởng</p>
                                        <div className="h-48 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={peelingLeaderSummary} margin={{ top: 4, right: 16, left: -16, bottom: 0 }} layout="vertical">
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                                    <XAxis type="number" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={false} width={80} />
                                                    <Tooltip contentStyle={{ fontSize: '11px' }} />
                                                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                                                    <Bar dataKey="Broken" name="Bể (%)" fill="#ef4444" barSize={10} radius={[0, 3, 3, 0]} />
                                                    <Bar dataKey="Unpeel" name="Sót lụa (%)" fill="#f59e0b" barSize={10} radius={[0, 3, 3, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        {/* Leader Table */}
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b bg-muted/50">
                                                        <th className="text-left p-2 font-semibold">Tổ trưởng</th>
                                                        <th className="text-right p-2 font-semibold">SL (T)</th>
                                                        <th className="text-right p-2 font-semibold text-red-600">Bể %</th>
                                                        <th className="text-right p-2 font-semibold text-amber-600">Unpeel %</th>
                                                        <th className="text-right p-2 font-semibold text-purple-600">Pass2 %</th>
                                                        <th className="text-right p-2 font-semibold">Số ca</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {peelingLeaderSummary.map(l => (
                                                        <tr key={l.name} className="border-b hover:bg-muted/20">
                                                            <td className="p-2 font-medium">{l.name}</td>
                                                            <td className="p-2 text-right font-bold text-primary">{l.Sản_Lượng}</td>
                                                            <td className="p-2 text-right font-bold text-red-600">{l.Broken > 0 ? `${l.Broken}%` : '—'}</td>
                                                            <td className="p-2 text-right font-bold text-amber-600">{l.Unpeel > 0 ? `${l.Unpeel}%` : '—'}</td>
                                                            <td className="p-2 text-right font-bold text-purple-600">{l.Pass2_Ratio > 0 ? `${l.Pass2_Ratio}%` : '—'}</td>
                                                            <td className="p-2 text-right text-muted-foreground">{l.Shifts}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* C. Daily Quality Trend */}
                                {peelingDailyQuality.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">📈 Xu hướng Chất lượng hàng ngày</p>
                                        <div className="h-48 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={peelingDailyQuality} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                                                        label={{ value: '%', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#94a3b8' }, offset: 12 }} />
                                                    <YAxis yAxisId="tons" orientation="right" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                                                        label={{ value: 'Tons', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: '#94a3b8' }, offset: 12 }} />
                                                    <Tooltip contentStyle={{ fontSize: '11px' }} />
                                                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                                                    <Bar yAxisId="tons" dataKey="Tons" name="Sản lượng (T)" fill="#e2e8f0" barSize={16} radius={[3, 3, 0, 0]} />
                                                    <Line type="monotone" dataKey="Broken" name="Bể (%)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                                    <Line type="monotone" dataKey="Unpeel" name="Sót lụa (%)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* D. Per-Shift Analysis */}
                                {peelingShiftSummary.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">🕐 Phân tích theo Ca</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="h-44">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={peelingShiftSummary} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                                        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                                        <Tooltip contentStyle={{ fontSize: '11px' }} />
                                                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                                                        <Bar dataKey="Broken" name="Bể (%)" fill="#ef4444" barSize={16} radius={[3, 3, 0, 0]} />
                                                        <Bar dataKey="Unpeel" name="Sót lụa (%)" fill="#f59e0b" barSize={16} radius={[3, 3, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="h-44">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={peelingShiftSummary} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                                        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                                        <Tooltip contentStyle={{ fontSize: '11px' }} />
                                                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                                                        <Bar dataKey="Tons" name="Sản lượng (T)" fill="#0d9488" barSize={16} radius={[3, 3, 0, 0]} />
                                                        <Bar dataKey="Pass2_Ratio" name="Pass2 (%)" fill="#8b5cf6" barSize={16} radius={[3, 3, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* E. Per-Line Analysis */}
                                {peelingLineSummary.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">🔧 Phân tích theo Line</p>
                                        <div className="h-48 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={peelingLineSummary} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                                    <Tooltip contentStyle={{ fontSize: '11px' }} />
                                                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                                                    <Bar dataKey="Broken" name="Bể (%)" fill="#ef4444" barSize={14} radius={[3, 3, 0, 0]} />
                                                    <Bar dataKey="Unpeel" name="Sót lụa (%)" fill="#f59e0b" barSize={14} radius={[3, 3, 0, 0]} />
                                                    <Bar dataKey="Pass2_Ratio" name="Pass2 (%)" fill="#8b5cf6" barSize={14} radius={[3, 3, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* F. Auto-Insights */}
                                {peelingInsights.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">💡 Phân tích tự động</p>
                                        <div className="space-y-1">
                                            {peelingInsights.map((ins, i) => (
                                                <div key={i} className={`flex items-start gap-2 text-xs ${ins.color} bg-slate-50 border border-slate-100 rounded-lg px-3 py-2`}>
                                                    <span className="shrink-0">{ins.icon}</span>
                                                    <span>{ins.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* ── CS Quality Deep-Dive ────────────────────────────── */}
                    {selectedDept === 'CS' && summary && (summary.avgBroken > 0 || summary.avgUnpeel > 0) && (
                        <Card className="border-indigo-100">
                            <CardHeader className="pb-3 border-b bg-indigo-50/40">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    🔬 {language === 'vi' ? 'Phân Tích Chất Lượng — Color Sorter' : 'Quality Analysis — Color Sorter'}
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    {language === 'vi' ? 'Phân tích Broken %, Unpeel % hàng ngày và tương quan sản lượng - chất lượng' : 'Daily broken%, unpeel% analysis and production-quality correlation'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-6">

                                {/* A. Overview KPI Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <KPICard label="Avg Broken %" value={`${summary.avgBroken.toFixed(2)}%`} color="text-red-600" sub="Tỷ lệ bể TB" />
                                    <KPICard label="Avg Unpeel %" value={summary.avgUnpeel > 0 ? `${summary.avgUnpeel.toFixed(2)}%` : '—'} color="text-amber-600" sub="Sót lụa TB" />
                                    <KPICard label="Production" value={`${summary.totalActual.toFixed(1)} T`} sub={`Plan: ${summary.totalPlan.toFixed(1)} T`} />
                                    <KPICard label="Days with Data" value={`${summary.daysWithData} ngày`} sub={`${csDailyQuality.filter(d => d.Broken !== null).length} ngày có chất lượng`} />
                                </div>

                                {/* B. Daily Quality Trend Chart */}
                                {csDailyQuality.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">📈 Xu hướng Chất lượng hàng ngày</p>
                                        <div className="h-52 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={csDailyQuality} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                                                        label={{ value: '%', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#94a3b8' }, offset: 12 }} />
                                                    <YAxis yAxisId="tons" orientation="right" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                                                        label={{ value: 'Tons', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: '#94a3b8' }, offset: 12 }} />
                                                    <Tooltip contentStyle={{ fontSize: '11px' }} />
                                                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                                                    <Bar yAxisId="tons" dataKey="Actual" name="Sản lượng (T)" fill="#e2e8f0" barSize={16} radius={[3, 3, 0, 0]} />
                                                    <Line type="monotone" dataKey="Broken" name="Bể (%)" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3, fill: '#ef4444' }} connectNulls />
                                                    <Line type="monotone" dataKey="Unpeel" name="Sót lụa (%)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} connectNulls />
                                                    <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="4 3" opacity={0.4} label={{ position: 'insideTopLeft', value: 'Alarm 5%', fill: '#ef4444', fontSize: 9 }} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* C. Volume-Quality Scatter */}
                                {csDailyQuality.filter(d => d.Broken !== null && d.Actual > 0).length >= 3 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">🎯 Sản lượng vs Bể — Volume-Quality Trade-off</p>
                                        <div className="h-48 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={csDailyQuality.filter(d => d.Broken !== null && d.Actual > 0)} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis dataKey="Actual" type="number" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                                                        label={{ value: 'Sản lượng (T)', position: 'insideBottomRight', style: { fontSize: 9, fill: '#94a3b8' }, offset: -5 }} />
                                                    <YAxis dataKey="Broken" type="number" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                                                        label={{ value: 'Bể (%)', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#94a3b8' }, offset: 12 }} />
                                                    <Tooltip content={({ active, payload }: any) => {
                                                        if (!active || !payload?.length) return null
                                                        const d = payload[0]?.payload
                                                        return (
                                                            <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-2 text-[11px]">
                                                                <p className="font-bold text-slate-700">{d?.name}</p>
                                                                <p>SL: {d?.Actual} T</p>
                                                                <p className="text-red-600">Bể: {d?.Broken}%</p>
                                                                {d?.Unpeel && <p className="text-amber-600">Sót lụa: {d?.Unpeel}%</p>}
                                                            </div>
                                                        )
                                                    }} />
                                                    <Scatter dataKey="Broken" fill="#ef4444" r={5} name="Bể %" />
                                                    <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="4 3" opacity={0.4} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <p className="text-[10px] text-center text-muted-foreground">Mỗi điểm = 1 ngày. Nếu điểm tập trung ở góc phải-trên = chạy nhanh bể nhiều</p>
                                    </div>
                                )}

                                {/* D. Auto-Insights */}
                                {csInsights.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">💡 Phân tích tự động</p>
                                        <div className="space-y-1">
                                            {csInsights.map((ins, i) => (
                                                <div key={i} className={`flex items-start gap-2 text-xs ${ins.color} bg-slate-50 border border-slate-100 rounded-lg px-3 py-2`}>
                                                    <span className="shrink-0">{ins.icon}</span>
                                                    <span>{ins.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Compressor kWh vs Production Chart */}
                    <div id="report-energy" />
                    {['PEEL', 'CS'].includes(selectedDept) && compressorMonthly.length > 0 && (() => {
                        const chartData = records.map(r => {
                            const comp = compressorMonthly.find(c => c.work_date === r.work_date)
                            const kwh = comp?.total_kwh || 0
                            return {
                                name: fmtDate(r.work_date).slice(0, 5),
                                work_date: r.work_date,
                                SanLuong: r.actual_ton,
                                kwhMayNen: kwh,
                                kwhTrenTan: r.actual_ton > 0 ? Number((kwh / r.actual_ton).toFixed(1)) : 0,
                            }
                        }).filter(r => r.SanLuong > 0 || r.kwhMayNen > 0)
                        return (
                            <Card>
                                <CardHeader className="pb-0">
                                    <CardTitle className="text-sm font-bold text-purple-700">🌬️ {language === 'vi' ? 'Năng lượng MNK vs Sản lượng' : 'Compressor Energy vs Production'}</CardTitle>
                                    <CardDescription className="text-[11px] text-slate-600 leading-relaxed">
                                        {language === 'vi'
                                            ? 'Theo dõi mối tương quan giữa điện tiêu thụ của máy nén khí (kWh) và sản lượng sản xuất. Giúp đánh giá hiệu quả sử dụng năng lượng (kWh/Tấn). Nếu sản lượng thấp mà điện cao, cần kiểm tra rò rỉ khí hoặc máy chạy không tải.'
                                            : 'Tracks the correlation between air compressor electricity (kWh) and production output. Helps evaluate energy intensity (kWh/Ton). High energy with low output may indicate air leaks or excessive idling.'
                                        }
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-72 w-full mt-4">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                <YAxis yAxisId="left" tick={{ fontSize: 10 }} label={{ value: 'Tấn', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10 } }} />
                                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} label={{ value: 'kWh', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 10 } }} />
                                                <Tooltip contentStyle={{ fontSize: '12px' }} formatter={(v: any, name: string | undefined) => {
                                                    if (name === 'kWh Máy Nén') return [`${Number(v).toLocaleString()} kWh`, name]
                                                    if (name === 'Sản lượng') return [`${Number(v).toFixed(3)} Tons`, 'Production']
                                                    return [v, name]
                                                }} />
                                                <Legend />
                                                <Bar yAxisId="left" dataKey="SanLuong" name="Production" fill="#0d9488" barSize={20} radius={[3, 3, 0, 0]} />
                                                <Line yAxisId="right" type="monotone" dataKey="kwhMayNen" name="kWh Máy Nén" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2 text-center">Hover for daily kWh/Ton</p>
                                </CardContent>
                            </Card>
                        )
                    })()}

                    {/* Daily Detail Table — hidden for SHELL (Shelling Shift Details below is more granular) */}
                    <div id="report-table" />
                    {selectedDept !== 'SHELL' && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold flex items-center justify-between">
                                    <span>Daily Details</span>
                                    <span className="text-xs font-normal text-muted-foreground">{records.length} days</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-muted/50">
                                                <th className="text-left p-3 font-semibold whitespace-nowrap">Date</th>
                                                <th className="text-right p-3 font-semibold">Actual (T)</th>
                                                <th className="text-right p-3 font-semibold">Plan (T)</th>
                                                <th className="text-right p-3 font-semibold">Achieved %</th>
                                                <th className="text-right p-3 font-semibold">Downtime</th>
                                                {records.some(r => r.avg_broken_pct > 0) && <th className="text-right p-3 font-semibold">Broken %</th>}
                                                {records.some(r => r.avg_unpeel_pct > 0) && <th className="text-right p-3 font-semibold">Unpeel %</th>}
                                                <th className="text-left p-3 font-semibold">Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {records.map(r => {
                                                const ap = r.plan_ton > 0 ? r.actual_ton / r.plan_ton * 100 : null
                                                const hasBroken = records.some(x => x.avg_broken_pct > 0)
                                                const hasUnpeel = records.some(x => x.avg_unpeel_pct > 0)
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
                                                        <td className="p-3 text-right text-amber-600">{(() => { const m = r.downtime_min || 0; if (!m) return '—'; const h = Math.floor(m / 60), rm = m % 60; return h > 0 ? `${h}h${rm > 0 ? ` ${rm}m` : ''}` : `${rm}m` })()}</td>
                                                        {hasBroken && <td className="p-3 text-right text-red-600">{r.avg_broken_pct > 0 ? r.avg_broken_pct.toFixed(2) + "%" : "—"}</td>}
                                                        {hasUnpeel && <td className="p-3 text-right text-amber-700">{r.avg_unpeel_pct > 0 ? r.avg_unpeel_pct.toFixed(2) + "%" : "—"}</td>}
                                                        <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">{r.note}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 bg-muted/30 font-bold">
                                                <td className="p-3">Total / Avg</td>
                                                <td className="p-3 text-right text-primary">{summary.totalActual.toFixed(2)}</td>
                                                <td className="p-3 text-right text-muted-foreground">{summary.totalPlan.toFixed(2)}</td>
                                                <td className={`p-3 text-right ${achievePct !== null && achievePct >= 100 ? "text-green-600" : "text-red-600"}`}>
                                                    {achievePct !== null ? achievePct.toFixed(1) + "%" : "—"}
                                                </td>
                                                <td className="p-3 text-right text-amber-600">{(() => { const m = summary.totalDowntime || 0; const h = Math.floor(m / 60), rm = m % 60; return h > 0 ? `${h}h${rm > 0 ? ` ${rm}m` : ''}` : `${rm}m` })()}</td>
                                                {records.some(r => r.avg_broken_pct > 0) && <td className="p-3 text-right text-red-600">{summary.avgBroken > 0 ? summary.avgBroken.toFixed(2) + "%" : "—"}</td>}
                                                {records.some(r => r.avg_unpeel_pct > 0) && <td className="p-3 text-right text-amber-700">{summary.avgUnpeel > 0 ? summary.avgUnpeel.toFixed(2) + "%" : "—"}</td>}
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Shelling Daily Detail Table */}

                    {selectedDept === "SHELL" && shellingLines.length > 0 && (
                        <Card className="overflow-hidden">
                            <CardHeader className="pb-3 border-b bg-muted/20">
                                <CardTitle className="text-sm font-bold flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-primary" />
                                        <span>Shelling Shift Details</span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={() => setShowShiftDetails(!showShiftDetails)}
                                    >
                                        {showShiftDetails ? (
                                            <>Ẩn chi tiết <TrendingDown className="h-3 w-3" /></>
                                        ) : (
                                            <>Hiện chi tiết <TrendingUp className="h-3 w-3" /></>
                                        )}
                                    </Button>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-muted/50">
                                                <th className="text-left p-3 font-semibold whitespace-nowrap">Date</th>
                                                <th className="text-center p-3 font-semibold">Line</th>
                                                <th className="text-center p-3 font-semibold">Shift</th>
                                                <th className="text-right p-3 font-semibold">Production (T)</th>
                                                <th className="text-right p-3 font-semibold">Run Hours (h)</th>
                                                <th className="text-right p-3 font-semibold px-6">Downtime (mins)</th>
                                                <th className="text-center p-3 font-semibold text-purple-600">Size</th>
                                                <th className="text-right p-3 font-semibold text-red-600">% Broken</th>
                                                <th className="text-left p-3 font-semibold">Note</th>
                                            </tr>
                                        </thead>
                                        {showShiftDetails && (
                                            <>
                                                <tbody>
                                                    {shellingLines.map(r => (
                                                        <tr key={`${r.work_date}-${r.line_code}-${r.shift_name}`} className="border-b hover:bg-muted/20 text-sm">
                                                            <td className="p-3 font-medium whitespace-nowrap">{fmtDate(r.work_date)}</td>
                                                            <td className="p-3 text-center font-bold text-slate-700">{r.line_code}</td>
                                                            <td className="p-3 text-center text-muted-foreground">{r.shift_name || 'Ca 1'}</td>
                                                            <td className="p-3 text-right font-bold text-primary">{Number(r.actual_ton) > 0 ? Number(r.actual_ton).toFixed(2) : "—"}</td>
                                                            <td className="p-3 text-right font-medium text-muted-foreground">{Number(r.run_hours) > 0 ? Number(r.run_hours).toFixed(1) : "—"}</td>
                                                            <td className="p-3 text-right font-medium text-amber-600 px-6">{(() => { const m = Number(r.downtime_min) || 0; if (!m) return '—'; const h = Math.floor(m / 60), rm = m % 60; return h > 0 ? `${h}h${rm > 0 ? ` ${rm}m` : ''}` : `${rm}m` })()}</td>
                                                            <td className="p-3 text-center font-bold text-purple-700">{r.size || "—"}</td>
                                                            <td className="p-3 text-right font-medium text-red-600">{Number(r.broken_pct) > 0 ? `${Number(r.broken_pct)}%` : "—"}</td>
                                                            <td className="p-3 text-left text-muted-foreground text-xs max-w-[200px] truncate" title={r.note || ""}>{r.note || "—"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="border-t-2 bg-muted/30 font-bold text-right text-xs">
                                                        <td colSpan={3} className="p-2">Monthly Total:</td>
                                                        <td className="p-2 text-primary">{shellingLines.reduce((s, r) => s + Number(r.actual_ton), 0).toFixed(2)}</td>
                                                        <td className="p-2 text-muted-foreground">{shellingLines.reduce((s, r) => s + Number(r.run_hours), 0).toFixed(1)}</td>
                                                        <td className="p-2 text-amber-600 px-6">{(() => { const m = shellingLines.reduce((s, r) => s + Number(r.downtime_min || 0), 0); const h = Math.floor(m / 60), rm = m % 60; return h > 0 ? `${h}h${rm > 0 ? ` ${rm}m` : ''}` : `${rm}m` })()}</td>
                                                        <td></td>
                                                        <td className="p-2 text-red-600">
                                                            {(shellingLines.filter(r => Number(r.broken_pct) > 0).length > 0) ?
                                                                (shellingLines.reduce((s, r) => s + Number(r.broken_pct || 0), 0) / shellingLines.filter(r => Number(r.broken_pct) > 0).length).toFixed(2) + '%'
                                                                : "—"}
                                                        </td>
                                                        <td></td>
                                                    </tr>
                                                </tfoot>
                                            </>
                                        )}
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
                    <p className="text-sm">Select month and department then click <strong>View Report</strong></p>
                </div>
            )}
        </motion.div>
    )
}
