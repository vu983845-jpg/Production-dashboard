"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { format, startOfMonth, endOfMonth, subMonths, addMonths, addDays, eachDayOfInterval, isAfter } from "date-fns"
import { vi } from "date-fns/locale"
import {
    ChevronLeft, ChevronRight, CalendarIcon, Droplets, Save, Loader2,
    CheckCircle2, AlertCircle, PenLine, Activity, TrendingDown, TrendingUp,
    TriangleAlert,
} from "lucide-react"
import {
    LineChart, Line, ResponsiveContainer, CartesianGrid,
    XAxis, YAxis, Tooltip, Legend
} from "recharts"
import { createClient } from "@/lib/supabase/client"
import {
    calculateCanteenTotal,
    calculateOfficeConsumption,
    calculateWaterDelta,
    compareWaterPeriods,
    getWaterAnomaly,
    summarizeWaterPeriod,
} from "@/lib/water-units"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const WATER_METERS = [
    { key: "tong", label: "Tổng", shortLabel: "Tổng", color: "#0ea5e9", zone: "Tổng" },
    { key: "cap_vp", label: "Cấp VP", shortLabel: "VP", resultLabel: "Văn phòng", color: "#38bdf8", zone: "Văn phòng" },
    { key: "lo_hoi", label: "Lò hơi", shortLabel: "Lò hơi", color: "#f97316", zone: "Lò hơi" },
    { key: "lo_hoi_shelling", label: "Lò hơi (Shelling)", shortLabel: "LH Shell", color: "#fb923c", zone: "Lò hơi" },
    { key: "ro_cap_vao", label: "RO vào", shortLabel: "RO vào", color: "#8b5cf6", zone: "RO" },
    { key: "ro_dau_ra", label: "RO ra", shortLabel: "RO ra", color: "#a78bfa", zone: "RO" },
    { key: "canteen", label: "Canteen 1", shortLabel: "Canteen 1", resultLabel: "Canteen tổng", color: "#10b981", zone: "Tiện ích" },
    { key: "canteen_2", label: "Canteen 2", shortLabel: "Canteen 2", color: "#14b8a6", zone: "Tiện ích" },
    { key: "nha_xe", label: "Nhà xe", shortLabel: "Nhà xe", color: "#34d399", zone: "Tiện ích" },
    { key: "cooling", label: "Cooling", shortLabel: "Cooling", color: "#06b6d4", zone: "Tiện ích" },
    { key: "nuoc_thai", label: "Nước thải", shortLabel: "Nước thải", color: "#64748b", zone: "Thải" },
] as const

type MeterKey = typeof WATER_METERS[number]["key"]

interface WaterRecord {
    id?: string
    work_date: string
    [key: string]: any
}

type LocalDataMap = Record<string, Partial<Record<MeterKey, string>>>

const ZONES = [
    { name: "Tổng", keys: ["tong"] },
    { name: "Văn phòng", keys: ["cap_vp"] },
    { name: "Lò hơi", keys: ["lo_hoi", "lo_hoi_shelling"] },
    { name: "RO", keys: ["ro_cap_vao", "ro_dau_ra"] },
    { name: "Tiện ích", keys: ["canteen", "canteen_2", "nha_xe", "cooling"] },
    { name: "Nước thải", keys: ["nuoc_thai"] },
]

const formatWaterValue = (value: number) =>
    value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })

const WaterTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
        return (
            <div className="bg-white/95 backdrop-blur-md border border-blue-200/60 rounded-xl shadow-xl p-3 text-xs z-50 min-w-[160px]">
                <p className="font-bold text-slate-700 mb-2 border-b pb-1.5">{label}</p>
                <div className="space-y-1.5">
                    {payload.map((entry: any, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-slate-600">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                                {entry.name}
                            </span>
                            <span className="font-mono font-bold text-slate-800">
                                {Number(entry.value).toLocaleString("vi-VN")} m³
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        )
    }
    return null
}

export function WaterTracker({ userRole }: { userRole?: string }) {
    const supabase = createClient()
    const canEdit = userRole === "admin" || userRole === "HSE" || userRole === "maint" || userRole === "hse_admin"

    const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
    const [fetchedRecords, setFetchedRecords] = useState<WaterRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [viewMode, setViewMode] = useState<"table" | "chart">(canEdit ? "table" : "chart")

    // Local state for grid inputs
    const [localData, setLocalData] = useState<LocalDataMap>({})
    const [originalData, setOriginalData] = useState<LocalDataMap>({})
    const [isSaving, setIsSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
    const [saveMsg, setSaveMsg] = useState("")
    const [focusedWaterRowDate, setFocusedWaterRowDate] = useState<string | null>(null)

    // Generate days for the current month
    const daysInMonth = useMemo(() => {
        const start = startOfMonth(currentMonth)
        const end = endOfMonth(currentMonth)
        return eachDayOfInterval({ start, end }).map(d => format(d, "yyyy-MM-dd"))
    }, [currentMonth])

    const todayStr = format(new Date(), "yyyy-MM-dd")

    // Fetch two months of history: the extra month provides the baseline for
    // day 1 of the comparison month.
    const fetchData = useCallback(async () => {
        setIsLoading(true)
        const startDateStr = format(subMonths(startOfMonth(currentMonth), 2), "yyyy-MM-dd")
        const endPlusOne = format(addDays(endOfMonth(currentMonth), 1), "yyyy-MM-dd")

        const { data, error } = await supabase
            .from("daily_water")
            .select("*")
            .gte("work_date", startDateStr)
            .lte("work_date", endPlusOne)
            .order("work_date", { ascending: true })

        if (!error && data) {
            setFetchedRecords(data)

            // Map to local input state
            const newLocal: LocalDataMap = {}
            data.forEach(row => {
                newLocal[row.work_date] = {}
                WATER_METERS.forEach(m => {
                    if (row[m.key] != null) {
                        newLocal[row.work_date][m.key] = String(row[m.key])
                    }
                })
            })
            setLocalData(newLocal)
            // Deep copy to track dirtiness
            setOriginalData(JSON.parse(JSON.stringify(newLocal)))
        }
        setIsLoading(false)
    }, [currentMonth, supabase])

    useEffect(() => { fetchData() }, [fetchData])

    // Detect modified rows
    const modifiedRows = useMemo(() => {
        const modified: string[] = []
        Object.keys(localData).forEach(date => {
            const org = originalData[date] || {}
            const cur = localData[date] || {}
            let isChanged = false
            WATER_METERS.forEach(m => {
                const orgVal = org[m.key] || ""
                const curVal = cur[m.key] || ""
                if (orgVal !== curVal) isChanged = true
            })
            if (isChanged) modified.push(date)
        })
        return modified
    }, [localData, originalData])

    const hasChanges = modifiedRows.length > 0

    // Compute the physical consumption of one meter from consecutive readings.
    const getMeterDelta = (dateStr: string, meterKey: MeterKey) => {
        const valStr = localData[dateStr]?.[meterKey]
        if (!valStr || valStr.trim() === "") return null

        const currentVal = parseFloat(valStr)
        if (isNaN(currentVal)) return null

        // Use all known dates so the first reading of a month can use the
        // most recent valid reading from the previous month as its baseline.
        const allDates = Array.from(new Set([
            ...fetchedRecords.map(r => r.work_date),
            ...Object.keys(localData)
        ])).sort()

        const dateIndex = allDates.indexOf(dateStr)
        for (let i = dateIndex - 1; i >= 0; i--) {
            const prevD = allDates[i]
            const pvStr = localData[prevD]?.[meterKey] ?? (fetchedRecords.find(r => r.work_date === prevD)?.[meterKey]?.toString() || "")
            if (pvStr && pvStr.trim() !== "") {
                const previousVal = parseFloat(pvStr)
                if (!isNaN(previousVal)) {
                    return calculateWaterDelta(meterKey, currentVal, previousVal)
                }
            }
        }
        return null
    }

    // Derived display values:
    // Canteen = Canteen 1 + Canteen 2
    // Office = VP supply - Garage - total Canteen
    const getDelta = (dateStr: string, meterKey: MeterKey) => {
        const canteenTotal = calculateCanteenTotal(
            getMeterDelta(dateStr, "canteen"),
            getMeterDelta(dateStr, "canteen_2"),
        )

        if (meterKey === "canteen") return canteenTotal
        if (meterKey === "cap_vp") {
            return calculateOfficeConsumption(
                getMeterDelta(dateStr, "cap_vp"),
                getMeterDelta(dateStr, "nha_xe"),
                canteenTotal,
            )
        }
        return getMeterDelta(dateStr, meterKey)
    }

    const previousMonthDays = useMemo(() => {
        const previousMonth = subMonths(currentMonth, 1)
        return eachDayOfInterval({
            start: startOfMonth(previousMonth),
            end: endOfMonth(previousMonth),
        }).map(d => format(d, "yyyy-MM-dd"))
    }, [currentMonth])

    const meterAnalytics = useMemo(() => WATER_METERS.map(meter => {
        const currentValues = daysInMonth.map(date => getDelta(date, meter.key))
        const previousValues = previousMonthDays.map(date => getDelta(date, meter.key))
        const summary = summarizeWaterPeriod(currentValues)
        const comparison = compareWaterPeriods(currentValues, previousValues)

        return { meter, summary, comparison }
    }), [daysInMonth, previousMonthDays, localData, fetchedRecords])

    const anomalyMap = useMemo(() => {
        const result = new Map<string, ReturnType<typeof getWaterAnomaly>>()

        WATER_METERS.forEach(meter => {
            const values = daysInMonth.map(date => getDelta(date, meter.key))
            values.forEach((value, index) => {
                const anomaly = getWaterAnomaly(value, values.slice(0, index))
                if (anomaly) result.set(`${daysInMonth[index]}:${meter.key}`, anomaly)
            })
        })

        return result
    }, [daysInMonth, localData, fetchedRecords])

    const totalAnalytics = meterAnalytics.find(item => item.meter.key === "tong")
    const totalComparison = totalAnalytics?.comparison
    const hasTotalComparison = totalComparison && totalComparison.previousTotal > 0

    // Chart data based on LIVE values
    const chartData = useMemo(() => {
        const result: any[] = []
        daysInMonth.forEach(dateStr => {
            const row: any = { fmtDate: format(new Date(dateStr), "dd/MM"), work_date: dateStr }
            let hasAnyData = false
            WATER_METERS.forEach(m => {
                const delta = getDelta(dateStr, m.key)
                if (delta != null) {
                    row[m.key] = delta
                    row[`${m.key}Anomaly`] = anomalyMap.has(`${dateStr}:${m.key}`)
                    hasAnyData = true
                }
            })
            if (hasAnyData) result.push(row)
        })
        return result
    }, [daysInMonth, localData, fetchedRecords, anomalyMap])


    // Save
    const handleSaveMulti = async () => {
        if (!canEdit || !hasChanges) return
        setIsSaving(true)
        setSaveStatus("idle")

        const payload = modifiedRows.map(date => {
            const body: any = { work_date: date }
            WATER_METERS.forEach(m => {
                const raw = localData[date]?.[m.key]
                body[m.key] = raw && raw.trim() !== "" ? parseFloat(raw) : null
            })
            return body
        })

        try {
            const res = await fetch("/api/water", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || "Save failed")
            }
            setSaveStatus("success")
            setSaveMsg(`Đã lưu ${modifiedRows.length} ngày!`)
            await fetchData()
        } catch (e: any) {
            setSaveStatus("error")
            setSaveMsg(e.message)
        } finally {
            setIsSaving(false)
            setTimeout(() => setSaveStatus("idle"), 3000)
        }
    }

    const onChangeCell = (date: string, key: MeterKey, val: string) => {
        setLocalData(prev => ({
            ...prev,
            [date]: { ...(prev[date] || {}), [key]: val }
        }))
    }

    return (
        <div className="space-y-4">
            {/* ── Tab nav bar ─────────────────────────────────────────── */}
            <div className="flex gap-2 flex-wrap items-center justify-between">
                <div className="flex gap-2">
                    {canEdit && (
                        <button
                            onClick={() => setViewMode("table")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${viewMode === "table" ? "bg-sky-500 text-white shadow-md" : "bg-white/70 text-slate-600 border border-slate-200 hover:bg-sky-50"}`}
                        >
                            <PenLine className="h-4 w-4" /> Bảng Nhập Liệu
                        </button>
                    )}
                    <button
                        onClick={() => setViewMode("chart")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${viewMode === "chart" ? "bg-sky-500 text-white shadow-md" : "bg-white/70 text-slate-600 border border-slate-200 hover:bg-sky-50"}`}
                    >
                        <Droplets className="h-4 w-4" /> Biểu đồ Delta
                    </button>
                </div>

                {/* Month Picker */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))} className="h-8 w-8 hover:bg-slate-100">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center justify-center min-w-[130px] font-bold text-sm text-slate-700">
                        <CalendarIcon className="mr-2 h-4 w-4 text-sky-500" />
                        {format(currentMonth, "MM/yyyy")}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} className="h-8 w-8 hover:bg-slate-100" disabled={currentMonth >= startOfMonth(new Date())}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Monthly operating snapshot */}
            {!isLoading && totalAnalytics && (
                <section aria-labelledby="water-month-summary" className="overflow-hidden rounded-2xl border border-sky-100 bg-white/95 shadow-[0_14px_35px_-22px_rgba(2,132,199,0.55)]">
                    <div className="flex flex-col gap-1 border-b border-sky-100 bg-gradient-to-r from-sky-950 via-sky-800 to-cyan-700 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 id="water-month-summary" className="flex items-center gap-2 text-sm font-black tracking-wide">
                                <Activity className="h-4 w-4 text-cyan-300" /> Tổng quan nước tháng {format(currentMonth, "MM/yyyy")}
                            </h2>
                            <p className="mt-0.5 text-[11px] text-sky-100">Cùng kỳ tính đến ngày có dữ liệu mới nhất · Đơn vị m³</p>
                        </div>
                        <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold sm:mt-0">
                            <TriangleAlert className="h-3 w-3 text-amber-300" /> Đỏ = cao hơn AVG trước đó trên 50%
                        </span>
                    </div>

                    <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        <div className="px-5 py-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Từ đầu tháng</p>
                            <p className="mt-1 text-2xl font-black tabular-nums text-sky-950">{formatWaterValue(totalAnalytics.summary.total)} <span className="text-xs text-slate-400">m³</span></p>
                            <p className="mt-1 text-[11px] font-medium text-slate-500">{totalAnalytics.summary.recordedDays} ngày có số liệu</p>
                        </div>
                        <div className="px-5 py-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">AVG hiện tại</p>
                            <p className="mt-1 text-2xl font-black tabular-nums text-sky-950">{formatWaterValue(totalAnalytics.summary.average)} <span className="text-xs text-slate-400">m³/ngày</span></p>
                            <p className="mt-1 text-[11px] font-medium text-slate-500">Không tính ngày trống</p>
                        </div>
                        <div className={`px-5 py-4 ${hasTotalComparison && totalComparison.difference > 0 ? "bg-rose-50/70" : "bg-emerald-50/60"}`}>
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">So với cùng kỳ tháng trước</p>
                            {hasTotalComparison ? (
                                <>
                                    <p className={`mt-1 flex items-center gap-1 text-2xl font-black tabular-nums ${totalComparison.difference > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                        {totalComparison.difference > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                                        {totalComparison.percentChange != null && `${Math.abs(totalComparison.percentChange).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`}
                                    </p>
                                    <p className="mt-1 text-[11px] font-bold text-slate-500">
                                        {totalComparison.difference > 0 ? "Tăng" : "Giảm"} {formatWaterValue(Math.abs(totalComparison.difference))} m³ · kỳ trước {formatWaterValue(totalComparison.previousTotal)} m³
                                    </p>
                                </>
                            ) : <p className="mt-2 text-sm font-bold text-slate-400">Chưa đủ dữ liệu tháng trước</p>}
                        </div>
                    </div>

                    <div className="overflow-x-auto border-t border-slate-100">
                        <table className="w-full min-w-[760px] text-xs">
                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-2 text-left">Đồng hồ / Khu vực</th>
                                    <th className="px-3 py-2 text-right">Lũy kế</th>
                                    <th className="px-3 py-2 text-right">AVG/ngày</th>
                                    <th className="px-3 py-2 text-right">Cùng kỳ trước</th>
                                    <th className="px-4 py-2 text-right">Chênh lệch</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {meterAnalytics.map(({ meter, summary, comparison }) => (
                                    <tr key={meter.key} className="hover:bg-sky-50/50">
                                        <td className="px-4 py-2 font-bold text-slate-700"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: meter.color }} />{"resultLabel" in meter ? meter.resultLabel : meter.shortLabel}</td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-700">{formatWaterValue(summary.total)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-600">{formatWaterValue(summary.average)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">{comparison.previousTotal > 0 ? formatWaterValue(comparison.previousTotal) : "—"}</td>
                                        <td className={`px-4 py-2 text-right font-mono font-black ${comparison.previousTotal <= 0 ? "text-slate-300" : comparison.difference > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                            {comparison.previousTotal > 0 && comparison.percentChange != null ? `${comparison.difference > 0 ? "+" : ""}${comparison.percentChange.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {!canEdit && viewMode === "table" && (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Bạn đang ở quyền View. Chỉ Admin / HSE / Maint mới được sửa số liệu.
                </div>
            )}

            {/* Save Status Banner */}
            {saveStatus !== "idle" && (
                <div className={`flex items-center justify-center gap-2 text-sm font-bold px-4 py-3 rounded-xl shadow-sm ${saveStatus === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
                    {saveStatus === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    {saveMsg}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                TABLE VIEW
            ════════════════════════════════════════════════════════════ */}
            {viewMode === "table" && (
                <Card className="bg-white/90 shadow-lg border-sky-100/50 flex flex-col max-h-[70vh]">
                    <div className="flex-1 overflow-auto rounded-t-xl relative border-b border-slate-100">
                        {isLoading ? (
                            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
                        ) : (
                            <table className="w-full text-sm border-separate border-spacing-0">
                                <thead>
                                    <tr>
                                        <th className="sticky top-0 left-0 z-30 bg-slate-100 border-b border-r border-slate-200 p-3 text-center w-[100px] shadow-[1px_1px_0_0_#e2e8f0]">
                                            <span className="font-bold text-slate-700">Ngày</span>
                                        </th>
                                        {WATER_METERS.map(m => (
                                            <th key={m.key} className="sticky top-0 z-20 bg-slate-50 border-b border-r border-slate-200 p-2 min-w-[120px] shadow-[0_1px_0_0_#e2e8f0]">
                                                <div className="flex flex-col items-center">
                                                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                                                        {m.shortLabel}
                                                    </div>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {daysInMonth.map((dateStr) => {
                                        const isFuture = isAfter(new Date(dateStr), new Date(todayStr))
                                        const isModified = modifiedRows.includes(dateStr)
                                        const rowHasAnomaly = WATER_METERS.some(m => anomalyMap.has(`${dateStr}:${m.key}`))
                                        return (
                                            <tr key={dateStr} className={`group transition-colors duration-150 ${isFuture ? "bg-slate-50/50 opacity-60" : rowHasAnomaly ? "bg-rose-50/55 hover:bg-rose-50" : "hover:bg-sky-50/40"} ${focusedWaterRowDate === dateStr ? "bg-sky-100/30" : ""}`}>
                                                <td className={`sticky left-0 z-10 border-b border-r p-0 shadow-[1px_0_0_0_#f1f5f9] align-top transition-colors duration-150 ${
                                                    focusedWaterRowDate === dateStr
                                                        ? "bg-sky-200 text-sky-950 font-bold"
                                                        : rowHasAnomaly
                                                            ? "border-rose-200 bg-rose-100"
                                                            : isModified
                                                                ? "border-slate-100 bg-sky-50"
                                                                : "border-slate-100 bg-white group-hover:bg-sky-50/40"
                                                }`}>
                                                    <div className="flex h-full flex-col items-center justify-center p-2">
                                                        <span className={`flex items-center gap-1 font-bold ${rowHasAnomaly ? "text-rose-700" : new Date(dateStr).getDay() === 0 ? "text-red-500" : "text-slate-700"}`}>
                                                            {rowHasAnomaly && <TriangleAlert className="h-3 w-3" />}
                                                            {format(new Date(dateStr), "dd/MM")}
                                                        </span>
                                                        <span className={`text-[10px] capitalize ${rowHasAnomaly ? "font-bold text-rose-500" : "text-slate-400"}`}>
                                                            {format(new Date(dateStr), "EEE", { locale: vi })}
                                                        </span>
                                                    </div>
                                                </td>
                                                {WATER_METERS.map(m => {
                                                    const delta = getDelta(dateStr, m.key)
                                                    const anomaly = anomalyMap.get(`${dateStr}:${m.key}`)
                                                    return (
                                                        <td key={m.key} className={`border-b border-r p-1.5 align-top transition-colors duration-150 ${anomaly ? "border-rose-200 bg-rose-100/80" : "border-slate-100"} ${focusedWaterRowDate === dateStr ? "bg-sky-50/20" : ""}`}>
                                                            <div className="flex flex-col gap-1">
                                                                <span className="block md:hidden text-[9px] text-sky-800 font-bold uppercase tracking-wider select-none mb-0.5">{m.shortLabel}</span>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    inputMode="decimal"
                                                                    disabled={!canEdit || isFuture}
                                                                    value={localData[dateStr]?.[m.key] ?? ""}
                                                                    onChange={e => onChangeCell(dateStr, m.key, e.target.value)}
                                                                    onFocus={() => setFocusedWaterRowDate(dateStr)}
                                                                    onBlur={() => setFocusedWaterRowDate(null)}
                                                                    className={`w-full border rounded-lg px-2 py-1.5 text-right font-mono text-base md:text-sm font-bold shadow-inner focus:outline-none focus:ring-2 focus:ring-sky-400 transition ${isFuture ? "bg-slate-100 text-slate-400 border-slate-100" :
                                                                        localData[dateStr]?.[m.key] !== originalData[dateStr]?.[m.key] ? "bg-sky-50 border-sky-300 text-sky-800" :
                                                                            "bg-white border-slate-200 text-slate-800 focus:border-sky-400"
                                                                        }`}
                                                                    placeholder="-"
                                                                />
                                                                <div className="h-4 flex items-center justify-end px-1">
                                                                    {delta != null && (
                                                                        <span
                                                                            className={`rounded px-1 font-mono text-[11px] font-bold ${anomaly ? "bg-rose-600 text-white shadow-sm" : "bg-emerald-50 text-emerald-600"}`}
                                                                            title={anomaly
                                                                                ? `Bất thường: cao hơn ${anomaly.percentAboveAverage.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% so với AVG trước đó (${formatWaterValue(anomaly.baselineAverage)} m³)`
                                                                                : "resultLabel" in m ? m.resultLabel : "Tiêu thụ"}
                                                                        >
                                                                            {anomaly && <TriangleAlert className="mr-0.5 inline h-3 w-3" />}
                                                                            {"resultLabel" in m ? `${m.resultLabel}: ` : "+"}{delta.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Fixed Action Bar at bottom of table */}
                    {canEdit && (
                        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between z-20">
                            <div className="text-sm">
                                {hasChanges ? (
                                    <span className="font-bold text-amber-600 flex items-center gap-1">
                                        <AlertCircle className="h-4 w-4" /> Đã sửa {modifiedRows.length} ngày chưa lưu
                                    </span>
                                ) : (
                                    <span className="text-slate-500 font-medium">Bảng đã cập nhật hoàn toàn</span>
                                )}
                            </div>
                            <Button
                                onClick={handleSaveMulti}
                                disabled={!hasChanges || isSaving}
                                className={`gap-2 font-bold shadow-md transition-all ${hasChanges ? "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700" : "bg-slate-200 text-slate-400"}`}
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Lưu Thay Đổi
                            </Button>
                        </div>
                    )}
                </Card>
            )}

            {/* ════════════════════════════════════════════════════════════
                CHART VIEW
            ════════════════════════════════════════════════════════════ */}
            {viewMode === "chart" && (
                <div className="space-y-4">
                    {ZONES.map(zone => {
                        const meters = WATER_METERS.filter(m => zone.keys.includes(m.key))
                        return (
                            <Card key={zone.name} className="bg-white/90 shadow-lg border-slate-100 overflow-hidden">
                                <CardHeader className="pb-2 pt-4 px-5 bg-slate-50/80 border-b border-slate-100">
                                    <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meters[0]?.color || "#64748b" }} />
                                        Khu vực: {zone.name}
                                    </CardTitle>
                                    <CardDescription className="text-xs">Tiêu thụ ngày (m³/ngày) – tính từ dữ liệu đang nhập</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[240px] pt-4 px-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }} dy={6} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }} tickFormatter={v => v.toLocaleString("vi-VN")} />
                                            <Tooltip content={<WaterTooltip />} />
                                            <Legend wrapperStyle={{ paddingTop: 12, fontSize: 11, fontWeight: 600, color: "#475569" }} iconType="circle" />
                                            {meters.map(m => (
                                                <Line key={m.key} type="monotone" dataKey={m.key} name={"resultLabel" in m ? m.resultLabel : m.shortLabel} stroke={m.color} strokeWidth={2.5}
                                                    dot={(props: any) => {
                                                        const isAnomaly = props.payload?.[`${m.key}Anomaly`]
                                                        return <circle cx={props.cx} cy={props.cy} r={isAnomaly ? 5 : 3} fill={isAnomaly ? "#e11d48" : m.color} stroke={isAnomaly ? "#fff" : "none"} strokeWidth={isAnomaly ? 2 : 0} />
                                                    }}
                                                    activeDot={{ r: 6, strokeWidth: 0, fill: m.color }}
                                                    connectNulls={false} />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
