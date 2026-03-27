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
    const [compressorMonthly, setCompressorMonthly] = useState<{work_date: string; total_kwh: number}[]>([])
    const [shellingEnergyMonthly, setShellingEnergyMonthly] = useState<{work_date: string; kwh: number}[]>([])

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
        // Bỏ setHasData(false) ở đây để giữ Data cũ trên màn hình -> Không bị chớp UI
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

        // Fetch Native Downtime Events
        const nativeDownByDate: Record<string, number> = {}
        if (dept?.id) {
            const { data: dtEvents } = await supabase
                .from('downtime_events')
                .select('work_date, duration_mins, start_time, end_time, is_ongoing')
                .eq('department_id', dept.id)
                .eq('exclude_downtime', false)
                .gte('work_date', start)
                .lte('work_date', end)
                
            if (dtEvents) {
                dtEvents.forEach((evt: any) => {
                    const d = evt.work_date
                    let mins = Number(evt.duration_mins || 0)
                    if (evt.is_ongoing && evt.start_time) {
                        const endT = evt.end_time ? new Date(evt.end_time) : new Date()
                        mins = Math.max(0, Math.round((endT.getTime() - new Date(evt.start_time).getTime()) / 60000))
                    }
                    nativeDownByDate[d] = (nativeDownByDate[d] || 0) + mins
                })
            }
        }

        const rows: DailyRecord[] = (data ?? []).map((r: any) => ({
            work_date:      r.work_date,
            actual_ton:     Number(r.actual_ton || 0),
            plan_ton:       Number(r.plan_ton || 0),
            downtime_min:   nativeDownByDate[r.work_date] || Number(r.downtime_min || 0),
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
        
        // Weighted Average for Broken % and Unpeel %
        const sumBrokenWeight = rows.reduce((s, r) => s + (r.avg_broken_pct * r.actual_ton), 0)
        const sumUnpeelWeight = rows.reduce((s, r) => s + (r.avg_unpeel_pct * r.actual_ton), 0)
        
        setSummary({
            totalActual,
            totalPlan,
            totalDowntime,
            avgBroken:  totalActual > 0 ? sumBrokenWeight / totalActual : 0,
            avgUnpeel:  totalActual > 0 ? sumUnpeelWeight / totalActual : 0,
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
            
            // Canonical normalization of shift leader names (Unify all variations into exactly 3 leaders)
            const cleanedLD = (ld ?? []).map((r: any) => {
                let name = (r.shift_leader || "").trim();
                if (name) {
                    const lower = name.toLowerCase();
                    // Explicitly map to canonical names based on keywords
                    if (lower.includes("trí")) name = "Mr. Trí";
                    else if (lower.includes("tâm")) name = "Mrs. Tâm";
                    else if (lower.includes("linh")) name = "Ms. Linh";
                    else {
                        // Fallback for any other names
                        name = name.replace(/^(mrs|mr|ms)\.?\s*/i, (m: string, p: string) => {
                            const pre = p.toLowerCase();
                            if (pre === 'mrs') return 'Mrs. ';
                            if (pre === 'mr') return 'Mr. ';
                            if (pre === 'ms') return 'Ms. ';
                            return m;
                        }).replace(/\s+/g, ' ').trim();
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

        // Fetch compressor data for PEEL_MC and CS
        if (['PEEL_MC', 'CS'].includes(selectedDept)) {
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
                const result: {work_date: string; total_kwh: number}[] = compData.map((row: any, i: number) => {
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

        XLSX.writeFile(wb, `BaoCao_${dept.code}_${monthLabel.replace("/","-")}.xlsx`)
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
        })).sort((a,b) => a.name.localeCompare(b.name));
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
        })).sort((a,b) => a.name.localeCompare(b.name));
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
                row[line] = hrs > 0 ? Number((tons/hrs).toFixed(2)) : null;
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

    // ── OEE constants & helpers (Report Page) ─────────────────────────────
    const SHELLING_IDEAL_RATE_REPORT: Record<string, number> = { A: 1.4, B: 1.8, C: 1.5, D1: 1.2, D2: 1.2 }
    const SHELL_PLANNED_H = 8

    // Compute OEE from a group of shelling_line_daily rows
    const calcGroupOEE = (rows: ShellingLineRecord[], line: string) => {
        const rate = SHELLING_IDEAL_RATE_REPORT[line] ?? 1
        const totalTon = rows.reduce((s, r) => s + Number(r.actual_ton || 0), 0)
        const totalRunH = rows.reduce((s, r) => s + Number(r.run_hours || 0), 0)
        const totalDownMin = rows.reduce((s, r) => s + Number(r.downtime_min || 0), 0)
        const totalSessions = rows.length  // number of shifts
        if (totalSessions === 0 || (totalTon === 0 && totalRunH === 0)) return null
        const totalPlannedH = totalSessions * SHELL_PLANNED_H
        const effRunH = Math.max(0, totalPlannedH - totalDownMin / 60)
        const avail = effRunH / totalPlannedH
        const idealTon = totalRunH > 0 ? totalRunH * rate : effRunH * rate
        const perf = idealTon > 0 ? Math.min(1, totalTon / idealTon) : 0
        // Weighted quality
        const totalBrokenW = rows.reduce((s, r) => s + (Number(r.broken_pct || 0) / 100) * Number(r.actual_ton || 0), 0)
        const qual = totalTon > 0 ? 1 - totalBrokenW / totalTon : 1
        return { avail, perf, qual, oee: avail * perf * qual }
    }

    // OEE trend chart data: per-day, all lines combined
    const oeeChartData = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return []
        const map = new Map<string, any>()
        filteredShellingLines.forEach(r => {
            const dateStr = format(parseISO(r.work_date), 'dd/MM')
            if (!map.has(dateStr)) map.set(dateStr, { name: dateStr, _rows: {} })
            const curr = map.get(dateStr)
            if (!curr._rows[r.line_code]) curr._rows[r.line_code] = []
            curr._rows[r.line_code].push(r)
        })
        return Array.from(map.values()).map(day => {
            const row: any = { name: day.name }
            ;['A','B','C','D1','D2'].forEach(line => {
                const rows: ShellingLineRecord[] = day._rows[line] || []
                const oee = calcGroupOEE(rows, line)
                row[line] = oee ? Number((oee.oee * 100).toFixed(1)) : null
            })
            return row
        })
    })()

    // OEE monthly summary per line
    const oeeSummaryByLine = (() => {
        if (selectedDept !== 'SHELL' || !filteredShellingLines.length) return [] as { line: string; avail: number; perf: number; qual: number; oee: number }[]
        return ['A','B','C','D1','D2'].map(line => {
            const rows = filteredShellingLines.filter(r => r.line_code === line)
            const oee = calcGroupOEE(rows, line)
            return oee ? { line, ...oee } : null
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
                                {Array.from({length:12},(_,i)=>i+1).map(m =>
                                    <option key={m} value={m}>Month {m}</option>
                                )}
                            </select>
                        </div>
                        {/* Year picker */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Year</label>
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                {[currentYear-1, currentYear, currentYear+1].map(y =>
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
                            {dept.name_vi || dept.name_en} — Month {String(selectedMonth).padStart(2,"0")}/{selectedYear}
                        </h2>
                        <span className="text-sm text-muted-foreground">{summary.daysWithData} days with data</span>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <KPICard label="Actual Production" value={`${summary.totalActual.toFixed(1)} T`}
                            sub={`KH: ${summary.totalPlan.toFixed(1)} T`} />
                        <KPICard
                            label="MTD Achievement"
                            value={achievePct !== null ? `${achievePct.toFixed(1)}%` : "—"}
                            color={achievePct !== null ? (achievePct >= 100 ? "text-green-600" : "text-red-600") : undefined}
                            sub={achievePct !== null ? (achievePct >= 100 ? "✅ Target Met" : "⚠️ Target Not Met") : undefined}
                        />
                        <KPICard
                            label="Variance"
                            value={`${summary.totalActual - summary.totalPlan >= 0 ? "+" : ""}${(summary.totalActual - summary.totalPlan).toFixed(1)} T`}
                            color={summary.totalActual >= summary.totalPlan ? "text-green-600" : "text-red-600"}
                        />
                        <KPICard label="Total Downtime" value={`${summary.totalDowntime} mins`}
                            sub={`~${(summary.totalDowntime/60).toFixed(1)} hrs`} />
                    </div>

                    {/* Quality KPIs */}
                    {(summary.avgBroken > 0 || summary.avgUnpeel > 0) && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {summary.avgBroken > 0 && (
                                <KPICard label="Avg Broken %" value={`${summary.avgBroken.toFixed(2)}%`} color="text-red-600" />
                            )}
                            {summary.avgUnpeel > 0 && (
                                <KPICard label="Avg Unpeel %" value={`${summary.avgUnpeel.toFixed(2)}%`} color="text-amber-600" />
                            )}
                        </div>
                    )}

                    {/* Shelling Lines Summary */}
                    {selectedDept === "SHELL" && (
                        <div className="space-y-6">
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
                                            {["A","B","C","D1","D2"].flatMap(line => {
                                                const lineRows = filteredShellingLines.filter(r => r.line_code === line)
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
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>

                        {/* OEE Summary KPI Cards */}
                        {oeeSummaryByLine.length > 0 && (
                            <Card>
                                <CardHeader className="pb-2 flex flex-row items-center justify-between border-b bg-indigo-50/30">
                                    <CardTitle className="text-sm font-bold text-indigo-800">📈 OEE — Hiệu suất Tổng thể từng Line (Tháng)</CardTitle>
                                    <span className="text-[10px] text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">Avail × Perf × Quality | Lý thuyết 8h/ca</span>
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
                                                        <Tooltip contentStyle={{ fontSize: '13px' }} cursor={{fill: 'transparent'}} />
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

                                    {/* Chart 2: Downtime */}
                                    <Card className="col-span-1 lg:col-span-3">
                                        <CardHeader className="pb-2 border-b">
                                            <CardTitle className="text-sm font-bold">{language === 'vi' ? 'Phân tích Giờ dừng máy (Phút)' : 'Downtime Analysis (Mins)'}</CardTitle>
                                            <CardDescription className="text-xs leading-relaxed text-slate-600">
                                                {language === 'vi'
                                                    ? 'Biểu đồ cột tích lũy (stacked) tổng thời gian dừng máy (phút) mỗi ngày, chia theo từng máy. Ngày nào cột cao là ngày có tổng downtime lớn. Màu của mỗi lớp cột cho biết máy nào chịu trách nhiệm nhiều nhất cho sự cố hôm đó. Phối hợp với chart Hiệu suất để xác định nguyên nhân năng suất giảm.'
                                                    : 'Stacked bars show daily downtime (minutes) broken down by each shelling line. Tall bars = high total downtime that day. Each color layer identifies which line caused the most stoppage. Cross-reference with the efficiency chart to pinpoint root causes of productivity drops.'}
                                            </CardDescription>
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
                                                        <Bar yAxisId="left" dataKey="actual_ton" name={t("report.shelling.energy.prod")} fill="#fcd34d" radius={[4,4,0,0]} maxBarSize={40} />
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
                                                            <Tooltip contentStyle={{ fontSize: '12px' }} formatter={(v: any, name: any, props: any) => [`${Number(v).toFixed(2)} T/h`, `Hiệu suất (Line: ${props.payload.Lines})`]} cursor={{fill: 'transparent'}} />
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
                                                            <Tooltip contentStyle={{ fontSize: '12px' }} formatter={(v: any, name: any, props: any) => [`${Number(v).toFixed(2)}%`, `Tỷ lệ Bể (Line: ${props.payload.Lines})`]} cursor={{fill: 'transparent'}} />
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
                                                            <Tooltip contentStyle={{ fontSize: '12px' }} formatter={(v: any) => [`${Number(v).toFixed(2)} T/h`, `Hiệu suất`]} cursor={{fill: 'transparent'}} />
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
                                                            <Tooltip contentStyle={{ fontSize: '12px' }} formatter={(v: any) => [`${Number(v).toFixed(2)}%`, `Tỷ lệ Bể`]} cursor={{fill: 'transparent'}} />
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

                    {/* Compressor kWh vs Production Chart */}
                    {['PEEL_MC', 'CS'].includes(selectedDept) && compressorMonthly.length > 0 && (() => {
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
                                                <Bar yAxisId="left" dataKey="SanLuong" name="Production" fill="#0d9488" barSize={20} radius={[3,3,0,0]} />
                                                <Line yAxisId="right" type="monotone" dataKey="kwhMayNen" name="kWh Máy Nén" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2 text-center">Hover for daily kWh/Ton</p>
                                </CardContent>
                            </Card>
                        )
                    })()}

                    {/* Daily Detail Table */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold flex items-center justify-between">
                                <span>Daily Details</span>
                                <span className="text-xs font-normal text-muted-foreground">{records.length} ngày</span>
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
                                            <td className="p-3">Total / Avg</td>
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
                                                            <td className="p-3 text-right font-medium text-amber-600 px-6">{Number(r.downtime_min) > 0 ? `${r.downtime_min}p` : "—"}</td>
                                                            <td className="p-3 text-center font-bold text-purple-700">{r.size || "—"}</td>
                                                            <td className="p-3 text-right font-medium text-red-600">{Number(r.broken_pct) > 0 ? `${Number(r.broken_pct)}%` : "—"}</td>
                                                            <td className="p-3 text-left text-muted-foreground text-xs max-w-[200px] truncate" title={r.note || ""}>{r.note || "—"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="border-t-2 bg-muted/30 font-bold text-right text-xs">
                                                        <td colSpan={3} className="p-2">Monthly Total:</td>
                                                        <td className="p-2 text-primary">{shellingLines.reduce((s, r)=>s+Number(r.actual_ton),0).toFixed(2)}</td>
                                                        <td className="p-2 text-muted-foreground">{shellingLines.reduce((s, r)=>s+Number(r.run_hours),0).toFixed(1)}</td>
                                                        <td className="p-2 text-amber-600 px-6">{shellingLines.reduce((s, r)=>s+Number(r.downtime_min||0),0)}p</td>
                                                        <td></td>
                                                        <td className="p-2 text-red-600">
                                                            {(shellingLines.filter(r => Number(r.broken_pct)>0).length > 0) ? 
                                                                (shellingLines.reduce((s, r)=>s+Number(r.broken_pct||0),0) / shellingLines.filter(r => Number(r.broken_pct)>0).length).toFixed(2) + '%' 
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
