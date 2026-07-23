"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { format, startOfMonth, endOfMonth, subMonths, addMonths, addDays, eachDayOfInterval, isAfter } from "date-fns"
import { vi } from "date-fns/locale"
import {
    ChevronLeft, ChevronRight, CalendarIcon, Droplets, Save, Loader2,
    CheckCircle2, AlertCircle, PenLine
} from "lucide-react"
import {
    LineChart, Line, ResponsiveContainer, CartesianGrid,
    XAxis, YAxis, Tooltip, Legend
} from "recharts"
import { createClient } from "@/lib/supabase/client"
import { calculateWaterDelta } from "@/lib/water-units"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const WATER_METERS = [
    { key: "tong", label: "Tổng", shortLabel: "Tổng", color: "#0ea5e9", zone: "Tổng" },
    { key: "cap_vp", label: "Cấp VP", shortLabel: "VP", color: "#38bdf8", zone: "Văn phòng" },
    { key: "lo_hoi", label: "Lò hơi", shortLabel: "Lò hơi", color: "#f97316", zone: "Lò hơi" },
    { key: "lo_hoi_shelling", label: "Lò hơi (Shelling)", shortLabel: "LH Shell", color: "#fb923c", zone: "Lò hơi" },
    { key: "ro_cap_vao", label: "RO vào", shortLabel: "RO vào", color: "#8b5cf6", zone: "RO" },
    { key: "ro_dau_ra", label: "RO ra", shortLabel: "RO ra", color: "#a78bfa", zone: "RO" },
    { key: "canteen", label: "Canteen", shortLabel: "Canteen", color: "#10b981", zone: "Tiện ích" },
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
    { name: "Tiện ích", keys: ["canteen", "nha_xe", "cooling"] },
    { name: "Nước thải", keys: ["nuoc_thai"] },
]

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

    // Fetch data including 1 month prior for baseline
    const fetchData = useCallback(async () => {
        setIsLoading(true)
        const startDateStr = format(subMonths(startOfMonth(currentMonth), 1), "yyyy-MM-dd")
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

    // Compute Delta for a cell dynamically (even un-saved inputs recalculate immediately)
    const getDelta = (dateStr: string, meterKey: MeterKey) => {
        const valStr = localData[dateStr]?.[meterKey]
        if (!valStr || valStr.trim() === "") return null

        const currentVal = parseFloat(valStr)
        if (isNaN(currentVal)) return null

        // Find the most recent date before `dateStr` that has a valid number for this meter
        // Search backwards in `daysInMonth` first, then in `fetchedRecords` if cross-month

        // Use a sorted list of all known dates (local modifications + fetched records)
        const allDates = Array.from(new Set([
            ...fetchedRecords.map(r => r.work_date),
            ...Object.keys(localData)
        ])).sort()

        const dateIndex = allDates.indexOf(dateStr)
        for (let i = dateIndex - 1; i >= 0; i--) {
            const prevD = allDates[i]
            const pvStr = localData[prevD]?.[meterKey] ?? (fetchedRecords.find(r => r.work_date === prevD)?.[meterKey]?.toString() || "")
            if (pvStr && pvStr.trim() !== "") {
                const pv = parseFloat(pvStr)
                if (!isNaN(pv)) {
                    return calculateWaterDelta(meterKey, currentVal, pv)
                }
            }
        }
        return null // No previous record
    }

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
                    hasAnyData = true
                }
            })
            if (hasAnyData) result.push(row)
        })
        return result
    }, [daysInMonth, localData, fetchedRecords])


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
                                        return (
                                            <tr key={dateStr} className={`group transition-colors duration-150 ${isFuture ? "bg-slate-50/50 opacity-60" : "hover:bg-sky-50/40"} ${focusedWaterRowDate === dateStr ? "bg-sky-100/30" : ""}`}>
                                                <td className={`sticky left-0 z-10 border-b border-r border-slate-100 p-0 shadow-[1px_0_0_0_#f1f5f9] align-top transition-colors duration-150 ${
                                                    focusedWaterRowDate === dateStr
                                                        ? "bg-sky-200 text-sky-950 font-bold"
                                                        : isModified
                                                            ? "bg-sky-50"
                                                            : "bg-white group-hover:bg-sky-50/40"
                                                }`}>
                                                    <div className="flex flex-col items-center justify-center h-full p-2">
                                                        <span className={`font-bold ${new Date(dateStr).getDay() === 0 ? "text-red-500" : "text-slate-700"}`}>
                                                            {format(new Date(dateStr), "dd/MM")}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 capitalize">
                                                            {format(new Date(dateStr), "EEE", { locale: vi })}
                                                        </span>
                                                    </div>
                                                </td>
                                                {WATER_METERS.map(m => {
                                                    const delta = getDelta(dateStr, m.key)
                                                    return (
                                                        <td key={m.key} className={`border-b border-r border-slate-100 p-1.5 align-top transition-colors duration-150 ${focusedWaterRowDate === dateStr ? "bg-sky-50/20" : ""}`}>
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
                                                                        <span className="text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50 px-1 rounded">
                                                                            +{delta.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}
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
                                                <Line key={m.key} type="monotone" dataKey={m.key} name={m.shortLabel} stroke={m.color} strokeWidth={2.5}
                                                    dot={{ r: 3, strokeWidth: 0, fill: m.color }}
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
