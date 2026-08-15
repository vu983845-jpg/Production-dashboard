"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, subDays } from "date-fns"
import { ChevronLeft, ChevronRight, Save } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CompressorField = "meter1" | "meter2" | "meter3"

const METERS: { field: CompressorField; label: string }[] = [
    { field: "meter1", label: "MNK Số 1" },
    { field: "meter2", label: "MNK Số 2" },
    { field: "meter3", label: "MNK Số 3" },
]

type DayRecord = {
    work_date: string
    meter1?: number
    meter2?: number
    meter3?: number
    kwh1: number
    kwh2: number
    kwh3: number
    total_kwh: number
}

type LocalData = Record<string, Partial<Record<CompressorField, string>>>

function calcKwh(curr: number | undefined, prev: number | undefined): number {
    return curr !== undefined && prev !== undefined ? Math.max(0, (curr - prev) * 1000) : 0
}

function recomputeKwh(records: DayRecord[]) {
    for (let i = 1; i < records.length; i++) {
        const c = records[i]
        const p = records[i - 1]
        c.kwh1 = calcKwh(c.meter1, p.meter1)
        c.kwh2 = calcKwh(c.meter2, p.meter2)
        c.kwh3 = calcKwh(c.meter3, p.meter3)
        c.total_kwh = c.kwh1 + c.kwh2 + c.kwh3
    }
}

function makeBlankDay(dateStr: string): DayRecord {
    return { work_date: dateStr, kwh1: 0, kwh2: 0, kwh3: 0, total_kwh: 0 }
}

interface Props {
    userRole?: string
}

export function CompressorTracker({ userRole: _userRole }: Props) {
    const supabase = createClient()
    const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
    // fetchedBase[0] = baseline (prev month last day), [1..] = current month days
    const [fetchedBase, setFetchedBase] = useState<DayRecord[]>([])
    const [fetchedPrev, setFetchedPrev] = useState<DayRecord[]>([])
    const [localData, setLocalData] = useState<LocalData>({})
    const [compMode, setCompMode] = useState<"full" | "same">("full")
    const [isSaving, setIsSaving] = useState(false)

    const fetchData = useCallback(async () => {
        const startStr = format(currentMonth, "yyyy-MM-dd")
        const endStr = format(endOfMonth(currentMonth), "yyyy-MM-dd")
        const prevMonthEnd = subDays(currentMonth, 1)
        const prevMonthStart = startOfMonth(prevMonthEnd)
        const prevLastDayStr = format(prevMonthEnd, "yyyy-MM-dd")
        const prevStartStr = format(prevMonthStart, "yyyy-MM-dd")

        const [{ data: currRows }, { data: prevRows }, { data: baseRow }] = await Promise.all([
            supabase.from("daily_compressor").select("work_date,meter1,meter2,meter3")
                .gte("work_date", startStr).lte("work_date", endStr).order("work_date"),
            supabase.from("daily_compressor").select("work_date,meter1,meter2,meter3")
                .gte("work_date", prevStartStr).lte("work_date", prevLastDayStr).order("work_date"),
            supabase.from("daily_compressor").select("meter1,meter2,meter3")
                .eq("work_date", prevLastDayStr).maybeSingle(),
        ])

        const toNum = (v: any) => (v !== null && v !== undefined ? Number(v) : undefined)

        // Baseline = last day of prev month
        const baseline: DayRecord = {
            ...makeBlankDay(prevLastDayStr),
            meter1: toNum(baseRow?.meter1),
            meter2: toNum(baseRow?.meter2),
            meter3: toNum(baseRow?.meter3),
        }

        // Current month
        const days = eachDayOfInterval({ start: currentMonth, end: endOfMonth(currentMonth) })
        const currRecords: DayRecord[] = days.map(d => {
            const dateStr = format(d, "yyyy-MM-dd")
            const ex = (currRows as any[])?.find(r => r.work_date === dateStr)
            return { ...makeBlankDay(dateStr), meter1: toNum(ex?.meter1), meter2: toNum(ex?.meter2), meter3: toNum(ex?.meter3) }
        })

        // Prev month (for comparison; day 0 has no baseline so kwh stays 0)
        const prevDays = eachDayOfInterval({ start: prevMonthStart, end: prevMonthEnd })
        const prevRecords: DayRecord[] = prevDays.map(d => {
            const dateStr = format(d, "yyyy-MM-dd")
            const ex = (prevRows as any[])?.find(r => r.work_date === dateStr)
            return { ...makeBlankDay(dateStr), meter1: toNum(ex?.meter1), meter2: toNum(ex?.meter2), meter3: toNum(ex?.meter3) }
        })
        recomputeKwh(prevRecords)

        setFetchedBase([baseline, ...currRecords])
        setFetchedPrev(prevRecords)
        setLocalData({})
    }, [currentMonth, supabase])

    useEffect(() => { fetchData() }, [fetchData])

    const displayData = useMemo((): DayRecord[] => {
        const merged = fetchedBase.map((r, i) => {
            if (i === 0) return r
            const edits = localData[r.work_date] ?? {}
            const resolve = (field: CompressorField) =>
                edits[field] !== undefined
                    ? (edits[field] === "" ? undefined : Number(edits[field]))
                    : r[field]
            return { ...r, meter1: resolve("meter1"), meter2: resolve("meter2"), meter3: resolve("meter3") }
        })
        recomputeKwh(merged)
        return merged.slice(1)
    }, [fetchedBase, localData])

    const summary = useMemo(() => {
        const activeDays = displayData.filter(r => r.total_kwh > 0)
        const total = activeDays.reduce((s, r) => s + r.total_kwh, 0)
        const avg = activeDays.length > 0 ? total / activeDays.length : 0

        const prevActive = compMode === "same"
            ? fetchedPrev.filter(r => r.total_kwh > 0).slice(0, activeDays.length)
            : fetchedPrev.filter(r => r.total_kwh > 0)
        const prevTotal = prevActive.reduce((s, r) => s + r.total_kwh, 0)
        const prevAvg = prevActive.length > 0 ? prevTotal / prevActive.length : 0

        return { total, avg, prevAvg, activeDays: activeDays.length }
    }, [displayData, fetchedPrev, compMode])

    function handleEdit(dateStr: string, field: CompressorField, val: string) {
        setLocalData(prev => ({ ...prev, [dateStr]: { ...prev[dateStr], [field]: val } }))
    }

    async function handleSave() {
        setIsSaving(true)
        const payload = displayData
            .filter(r => r.meter1 !== undefined || r.meter2 !== undefined || r.meter3 !== undefined)
            .map(r => ({
                work_date: r.work_date,
                meter1: r.meter1 ?? null,
                meter2: r.meter2 ?? null,
                meter3: r.meter3 ?? null,
                updated_at: new Date().toISOString(),
            }))

        const { error } = await supabase.from("daily_compressor").upsert(payload, { onConflict: "work_date" })
        if (error) toast.error("Lỗi khi lưu: " + error.message)
        else {
            toast.success("Đã lưu đồng hồ máy nén khí")
            await fetchData()
        }
        setIsSaving(false)
    }

    const monthLabel = format(currentMonth, "MM/yyyy")
    const prevMonthLabel = format(subDays(currentMonth, 1), "MM/yyyy")
    const diffPct = summary.prevAvg > 0
        ? (summary.avg - summary.prevAvg) / summary.prevAvg * 100
        : null

    return (
        <div className="space-y-4">
            {/* Summary panel */}
            <div className="rounded-xl border overflow-hidden shadow border-purple-100">
                <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600">
                    <button
                        onClick={() => setCurrentMonth(m => startOfMonth(subDays(m, 1)))}
                        className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <p className="text-white/70 text-xs font-medium uppercase tracking-widest">🌬️ Máy nén khí</p>
                        <p className="text-white font-bold text-lg">Tháng {monthLabel}</p>
                    </div>
                    <button
                        onClick={() => setCurrentMonth(m => startOfMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1)))}
                        className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gradient-to-r from-purple-50 to-indigo-50">
                    <div className="bg-white rounded-xl p-3 shadow-sm border border-purple-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500 mb-1">Tổng tháng</p>
                        <p className="text-xl font-black text-purple-800">
                            {summary.total > 0 ? summary.total.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "—"}
                        </p>
                        <p className="text-[10px] text-purple-500 mt-0.5">kWh</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 shadow-sm border border-indigo-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">TB ngày</p>
                        <p className="text-xl font-black text-indigo-800">
                            {summary.avg > 0 ? Math.round(summary.avg).toLocaleString("vi-VN") : "—"}
                        </p>
                        <p className="text-[10px] text-indigo-500 mt-0.5">kWh/ngày</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">T.{prevMonthLabel}</p>
                            <div className="flex gap-1">
                                {(["full", "same"] as const).map(m => (
                                    <button key={m} onClick={() => setCompMode(m)}
                                        className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold transition-colors",
                                            compMode === m ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                                        {m === "full" ? "Cả tháng" : "Cùng kỳ"}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {diffPct !== null ? (
                            <p className={cn("text-xl font-black", diffPct > 0 ? "text-rose-600" : "text-emerald-600")}>
                                {diffPct > 0 ? "+" : ""}{diffPct.toFixed(1)}%
                            </p>
                        ) : <p className="text-xl font-black text-slate-400">—</p>}
                        <p className="text-[10px] text-slate-400 mt-0.5">
                            TB T.trước: {summary.prevAvg > 0 ? Math.round(summary.prevAvg).toLocaleString("vi-VN") : "—"} kWh
                        </p>
                    </div>
                    <div className="bg-white rounded-xl p-3 shadow-sm border border-rose-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-1">Ngày có dữ liệu</p>
                        <p className="text-xl font-black text-rose-700">{summary.activeDays}</p>
                        <p className="text-[10px] text-rose-400 mt-0.5">ngày / {displayData.length} ngày</p>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border shadow overflow-hidden bg-white">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-purple-50">
                    <h3 className="font-bold text-purple-800 text-sm">🌬️ Đồng hồ Máy nén khí · Tháng {monthLabel}</h3>
                    <p className="text-[10px] text-muted-foreground italic">* Nhập chỉ số MWh. Tiêu thụ = (hôm nay − hôm trước) × 1000.</p>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                    <table className="w-full border-collapse text-sm min-w-[620px]">
                        <thead className="sticky top-0 z-20 shadow-sm">
                            <tr className="bg-slate-100 border-b">
                                <th rowSpan={2} className="border-r w-16 text-center font-bold text-slate-600 text-xs py-2 sticky left-0 top-0 z-30 bg-slate-100">Ngày</th>
                                <th colSpan={3} className="border-r text-center text-purple-700 bg-purple-50/80 text-xs py-1.5 font-bold">Chỉ số (MWh × 1000)</th>
                                <th colSpan={3} className="border-r text-center text-indigo-700 bg-indigo-50/80 text-xs py-1.5 font-bold">Tiêu thụ (kWh/ngày)</th>
                                <th className="text-center text-rose-700 bg-rose-50/80 text-xs py-1.5 font-bold">Tổng kWh</th>
                            </tr>
                            <tr className="bg-slate-100 border-b">
                                {METERS.map(m => (
                                    <th key={m.field} className="border-r text-center bg-purple-50/60 text-purple-700 text-xs py-1.5 font-semibold w-24">
                                        {m.label}
                                    </th>
                                ))}
                                {METERS.map(m => (
                                    <th key={`kwh-${m.field}`} className="border-r text-center bg-indigo-50/60 text-indigo-700 text-xs py-1.5 font-semibold w-20">
                                        {m.label}
                                    </th>
                                ))}
                                <th className="text-center bg-rose-50/60 text-rose-700 text-xs py-1.5 font-bold w-24">Tổng</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                            {displayData.map(row => {
                                const kwhs = [row.kwh1, row.kwh2, row.kwh3]
                                return (
                                    <tr key={row.work_date} className="hover:bg-purple-50/20 transition-colors">
                                        <td className="font-semibold border-r py-2 px-2 text-center text-xs sticky left-0 z-10 bg-slate-50/90 text-slate-700">
                                            {format(parseISO(row.work_date), "dd/MM")}
                                        </td>
                                        {METERS.map(({ field }) => {
                                            const editVal = localData[row.work_date]?.[field]
                                            const displayVal = editVal !== undefined
                                                ? editVal
                                                : (row[field] !== undefined ? String(row[field]) : "")
                                            return (
                                                <td key={field} className="border-r p-1 bg-white">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-full text-right p-1.5 rounded border-gray-200 outline-none focus:ring-1 focus:ring-purple-400 bg-transparent text-sm font-semibold"
                                                        value={displayVal}
                                                        onChange={e => handleEdit(row.work_date, field, e.target.value)}
                                                    />
                                                </td>
                                            )
                                        })}
                                        {kwhs.map((kwh, i) => (
                                            <td key={i} className="border-r p-2 text-right font-bold text-indigo-700 text-sm bg-indigo-50/20">
                                                {kwh > 0 ? kwh.toLocaleString("en-US", { maximumFractionDigits: 0 }) : <span className="text-slate-300">—</span>}
                                            </td>
                                        ))}
                                        <td className="p-2 text-right font-black text-rose-700 text-sm bg-rose-50/20">
                                            {row.total_kwh > 0
                                                ? row.total_kwh.toLocaleString("en-US", { maximumFractionDigits: 0 })
                                                : <span className="text-slate-300">—</span>}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end p-3 border-t bg-slate-50">
                    <Button onClick={handleSave} disabled={isSaving} className="bg-purple-600 hover:bg-purple-700 text-white">
                        <Save className="mr-2 h-4 w-4" />
                        {isSaving ? "Đang lưu..." : "Lưu tháng"}
                    </Button>
                </div>
            </div>
        </div>
    )
}
