"use client"

import { useState, useEffect, useCallback } from "react"
import { format, startOfMonth, endOfMonth, subMonths, addMonths, addDays, differenceInDays } from "date-fns"
import { vi } from "date-fns/locale"
import {
    ChevronLeft, ChevronRight, CalendarIcon, Droplets, Save, Loader2,
    CheckCircle2, AlertCircle, ChevronDown, ChevronUp, History, PenLine
} from "lucide-react"
import {
    AreaChart, Area, BarChart, Bar, ResponsiveContainer, CartesianGrid,
    XAxis, YAxis, Tooltip, Legend, LineChart, Line
} from "recharts"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

// ─── Water meter definitions ────────────────────────────────────────────────
const WATER_METERS = [
    { key: "tong", label: "Tổng", shortLabel: "Tổng", color: "#0ea5e9", zone: "Tổng" },
    { key: "cap_vp", label: "Cấp VP", shortLabel: "VP", color: "#38bdf8", zone: "Văn phòng" },
    { key: "lo_hoi", label: "Lò hơi", shortLabel: "Lò hơi", color: "#f97316", zone: "Lò hơi" },
    { key: "lo_hoi_shelling", label: "Lò hơi cấp qua Shelling (ở dưới)", shortLabel: "LH Shell", color: "#fb923c", zone: "Lò hơi" },
    { key: "ro_cap_vao", label: "RO cấp vào", shortLabel: "RO vào", color: "#8b5cf6", zone: "RO" },
    { key: "ro_dau_ra", label: "RO đầu ra", shortLabel: "RO ra", color: "#a78bfa", zone: "RO" },
    { key: "canteen", label: "Canteen", shortLabel: "Canteen", color: "#10b981", zone: "Tiện ích" },
    { key: "nha_xe", label: "Nhà xe", shortLabel: "Nhà xe", color: "#34d399", zone: "Tiện ích" },
    { key: "cooling", label: "Cooling", shortLabel: "Cooling", color: "#06b6d4", zone: "Tiện ích" },
    { key: "nuoc_thai", label: "Nước thải", shortLabel: "Nước thải", color: "#64748b", zone: "Thải" },
] as const

type MeterKey = typeof WATER_METERS[number]["key"]

interface WaterRecord {
    id?: string
    work_date: string
    tong?: number | null
    cap_vp?: number | null
    lo_hoi?: number | null
    lo_hoi_shelling?: number | null
    ro_cap_vao?: number | null
    ro_dau_ra?: number | null
    canteen?: number | null
    nha_xe?: number | null
    cooling?: number | null
    nuoc_thai?: number | null
    notes?: string | null
}

type FormValues = Partial<Record<MeterKey, string>> & { notes?: string }

// ─── Zone grouping for display ───────────────────────────────────────────────
const ZONES = [
    { name: "Tổng", keys: ["tong"] },
    { name: "Văn phòng", keys: ["cap_vp"] },
    { name: "Lò hơi", keys: ["lo_hoi", "lo_hoi_shelling"] },
    { name: "RO", keys: ["ro_cap_vao", "ro_dau_ra"] },
    { name: "Tiện ích", keys: ["canteen", "nha_xe", "cooling"] },
    { name: "Nước thải", keys: ["nuoc_thai"] },
]

// ─── Tooltip ─────────────────────────────────────────────────────────────────
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

// ─── Main Component ───────────────────────────────────────────────────────────
export function WaterTracker({ userRole }: { userRole?: string }) {
    const supabase = createClient()
    const canEdit = userRole === "admin" || userRole === "HSE" || userRole === "maint"

    const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
    const [records, setRecords] = useState<WaterRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [viewMode, setViewMode] = useState<"input" | "history" | "chart">("input")

    // Input form state
    const [inputDate, setInputDate] = useState<string>(format(new Date(), "yyyy-MM-dd"))
    const [formValues, setFormValues] = useState<FormValues>({})
    const [isSaving, setIsSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
    const [saveMsg, setSaveMsg] = useState("")

    // History expand
    const [expandedRow, setExpandedRow] = useState<string | null>(null)

    // ── Fetch ────────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setIsLoading(true)
        const startDateStr = format(startOfMonth(currentMonth), "yyyy-MM-dd")
        // Fetch one extra day for delta calculation
        const endPlusOne = format(addDays(endOfMonth(currentMonth), 1), "yyyy-MM-dd")

        const { data, error } = await supabase
            .from("daily_water")
            .select("*")
            .gte("work_date", startDateStr)
            .lte("work_date", endPlusOne)
            .order("work_date", { ascending: true })

        if (!error && data) setRecords(data)
        setIsLoading(false)
    }, [currentMonth, supabase])

    useEffect(() => { fetchData() }, [fetchData])

    // Pre-fill form when date changes (if record exists)
    useEffect(() => {
        const existing = records.find(r => r.work_date === inputDate)
        if (existing) {
            const vals: FormValues = { notes: existing.notes ?? "" }
            WATER_METERS.forEach(m => {
                vals[m.key] = existing[m.key] != null ? String(existing[m.key]) : ""
            })
            setFormValues(vals)
        } else {
            setFormValues({})
        }
    }, [inputDate, records])

    // ── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!canEdit) return
        setIsSaving(true)
        setSaveStatus("idle")

        const body: any = { work_date: inputDate, notes: formValues.notes ?? "" }
        WATER_METERS.forEach(m => {
            const raw = formValues[m.key]
            body[m.key] = raw !== undefined && raw !== "" ? parseFloat(raw) : null
        })

        try {
            const res = await fetch("/api/water", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || "Save failed")
            }
            setSaveStatus("success")
            setSaveMsg("Đã lưu thành công!")
            await fetchData()
        } catch (e: any) {
            setSaveStatus("error")
            setSaveMsg(e.message)
        } finally {
            setIsSaving(false)
            setTimeout(() => setSaveStatus("idle"), 3000)
        }
    }

    // ── Compute consumption deltas for chart ──────────────────────────────────
    const startDateStr = format(startOfMonth(currentMonth), "yyyy-MM-dd")
    const endDateStr = format(endOfMonth(currentMonth), "yyyy-MM-dd")
    const chartData = (() => {
        const result: any[] = []
        for (let i = 1; i < records.length; i++) {
            const prev = records[i - 1]
            const curr = records[i]
            const diffDays = differenceInDays(new Date(curr.work_date), new Date(prev.work_date)) || 1
            if (prev.work_date < startDateStr || prev.work_date > endDateStr) continue
            const row: any = { fmtDate: format(new Date(prev.work_date), "dd/MM"), work_date: prev.work_date }
            WATER_METERS.forEach(m => {
                const a = Number(prev[m.key] ?? 0)
                const b = Number(curr[m.key] ?? 0)
                row[m.key] = a > 0 && b > 0 ? Math.max(0, (b - a) / diffDays) : null
            })
            result.push(row)
        }
        return result
    })()

    // ─── Filter records for history display (within current month) ────────────
    const historyRecords = records
        .filter(r => r.work_date >= startDateStr && r.work_date <= endDateStr)
        .slice()
        .reverse()

    // ── Month nav ─────────────────────────────────────────────────────────────
    const goBack = () => setCurrentMonth(prev => subMonths(prev, 1))
    const goForward = () => setCurrentMonth(prev => addMonths(prev, 1))

    // ─── Quick stats ──────────────────────────────────────────────────────────
    const latestRecord = [...historyRecords].sort((a, b) => b.work_date.localeCompare(a.work_date))[0]

    return (
        <div className="space-y-4">
            {/* ── Tab nav bar ─────────────────────────────────────────── */}
            <div className="flex gap-2 flex-wrap">
                {([
                    { id: "input", label: "📥 Nhập liệu", icon: <PenLine className="h-4 w-4" /> },
                    { id: "history", label: "📋 Lịch sử", icon: <History className="h-4 w-4" /> },
                    { id: "chart", label: "📊 Biểu đồ", icon: <Droplets className="h-4 w-4" /> },
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setViewMode(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${viewMode === tab.id
                            ? "bg-sky-500 text-white shadow-md"
                            : "bg-white/70 text-slate-600 border border-slate-200 hover:bg-sky-50"
                            }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Month selector (for history + chart) ────────────────── */}
            {viewMode !== "input" && (
                <div className="flex items-center gap-1 bg-white/80 border border-slate-200/60 rounded-xl p-1 shadow-sm w-fit">
                    <Button variant="ghost" size="icon" onClick={goBack} className="h-8 w-8 rounded-lg hover:bg-slate-100">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center justify-center min-w-[160px] font-bold text-sm text-slate-800 px-2">
                        <CalendarIcon className="mr-2 h-4 w-4 text-sky-500" />
                        {format(currentMonth, "MMMM - yyyy")}
                    </div>
                    <Button variant="ghost" size="icon" onClick={goForward} className="h-8 w-8 rounded-lg hover:bg-slate-100"
                        disabled={currentMonth >= startOfMonth(new Date())}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                INPUT VIEW
            ════════════════════════════════════════════════════════════ */}
            {viewMode === "input" && (
                <div className="space-y-4">
                    {!canEdit && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            Chỉ Admin / HSE mới được nhập liệu.
                        </div>
                    )}

                    {/* Date picker card */}
                    <Card className="bg-white/90 border-sky-100 shadow-sm">
                        <CardContent className="pt-4 pb-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                <label className="text-sm font-bold text-slate-700 shrink-0">
                                    <CalendarIcon className="inline h-4 w-4 mr-1 text-sky-500" /> Ngày nhập:
                                </label>
                                <input
                                    type="date"
                                    value={inputDate}
                                    onChange={e => setInputDate(e.target.value)}
                                    max={format(new Date(), "yyyy-MM-dd")}
                                    className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white shadow-inner focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
                                />
                                {records.find(r => r.work_date === inputDate) && (
                                    <span className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-semibold">
                                        ✓ Đã nhập – đang cập nhật
                                    </span>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Meter input groups by zone */}
                    {ZONES.map(zone => (
                        <Card key={zone.name} className="bg-white/90 shadow-sm border-slate-100 overflow-hidden">
                            <CardHeader className="pb-3 pt-4 px-4 bg-slate-50/80 border-b border-slate-100">
                                <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                                    {zone.name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 pb-4 px-4">
                                <div className="grid grid-cols-1 gap-3">
                                    {WATER_METERS.filter(m => zone.keys.includes(m.key)).map(meter => (
                                        <div key={meter.key} className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: meter.color }} />
                                            <label className="text-sm font-semibold text-slate-700 flex-1 leading-tight">
                                                {meter.label}
                                            </label>
                                            <div className="relative w-36 sm:w-44">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    inputMode="decimal"
                                                    placeholder="m³"
                                                    disabled={!canEdit}
                                                    value={formValues[meter.key] ?? ""}
                                                    onChange={e => setFormValues(prev => ({ ...prev, [meter.key]: e.target.value }))}
                                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-slate-800 text-right bg-white shadow-inner focus:outline-none focus:ring-2 focus:ring-sky-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-semibold pointer-events-none">m³</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {/* Notes */}
                    {canEdit && (
                        <Card className="bg-white/90 shadow-sm border-slate-100">
                            <CardContent className="pt-4 pb-4 px-4">
                                <label className="text-sm font-bold text-slate-600 block mb-2">Ghi chú (tùy chọn)</label>
                                <textarea
                                    rows={2}
                                    placeholder="Ví dụ: Ngày bảo trì, mất điện, v.v."
                                    value={formValues.notes ?? ""}
                                    onChange={e => setFormValues(prev => ({ ...prev, notes: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white shadow-inner focus:outline-none focus:ring-2 focus:ring-sky-400 transition resize-none"
                                />
                            </CardContent>
                        </Card>
                    )}

                    {/* Save button */}
                    {canEdit && (
                        <div className="sticky bottom-4 z-30">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold text-base shadow-xl shadow-sky-500/30 hover:from-sky-600 hover:to-blue-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <><Loader2 className="h-5 w-5 animate-spin" /> Đang lưu...</>
                                ) : (
                                    <><Save className="h-5 w-5" /> Lưu chỉ số nước {inputDate}</>
                                )}
                            </button>
                            {saveStatus !== "idle" && (
                                <div className={`mt-2 flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl ${saveStatus === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
                                    }`}>
                                    {saveStatus === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                    {saveMsg}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                HISTORY VIEW
            ════════════════════════════════════════════════════════════ */}
            {viewMode === "history" && (
                <div className="space-y-3">
                    {isLoading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                        </div>
                    ) : historyRecords.length === 0 ? (
                        <div className="text-center py-16 text-slate-400 font-medium">
                            <Droplets className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            Chưa có dữ liệu tháng này
                        </div>
                    ) : (
                        historyRecords.map(record => {
                            const isExpanded = expandedRow === record.work_date
                            return (
                                <Card key={record.work_date} className="bg-white/90 shadow-sm border-slate-100 overflow-hidden transition-all">
                                    <button
                                        className="w-full text-left"
                                        onClick={() => setExpandedRow(isExpanded ? null : record.work_date)}
                                    >
                                        <div className="flex items-center justify-between px-4 py-3.5">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">
                                                    {format(new Date(record.work_date), "EEEE, dd/MM/yyyy", { locale: vi })}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    Tổng: <span className="font-bold text-sky-600">{record.tong != null ? Number(record.tong).toLocaleString("vi-VN") : "–"} m³</span>
                                                    {record.notes && <span className="ml-2 italic">{record.notes}</span>}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {canEdit && (
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation()
                                                            setInputDate(record.work_date)
                                                            setViewMode("input")
                                                        }}
                                                        className="text-xs px-2.5 py-1 rounded-lg bg-sky-50 text-sky-600 border border-sky-200 font-semibold hover:bg-sky-100 transition"
                                                    >
                                                        Sửa
                                                    </button>
                                                )}
                                                {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                                            </div>
                                        </div>
                                    </button>
                                    {isExpanded && (
                                        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                                {WATER_METERS.map(m => (
                                                    <div key={m.key} className="flex items-center justify-between text-xs">
                                                        <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                                                            {m.shortLabel}
                                                        </span>
                                                        <span className="font-mono font-bold text-slate-800">
                                                            {record[m.key] != null ? Number(record[m.key]).toLocaleString("vi-VN") : "–"}
                                                            <span className="text-slate-400 font-normal ml-0.5">m³</span>
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            )
                        })
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                CHART VIEW
            ════════════════════════════════════════════════════════════ */}
            {viewMode === "chart" && (
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="text-center py-16 text-slate-400 font-medium">
                            <Droplets className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            Cần ít nhất 2 ngày dữ liệu để hiển thị biểu đồ
                        </div>
                    ) : (
                        <>
                            {/* Zone charts */}
                            {ZONES.map(zone => {
                                const meters = WATER_METERS.filter(m => zone.keys.includes(m.key))
                                return (
                                    <Card key={zone.name} className="bg-white/90 shadow-lg border-slate-100 overflow-hidden">
                                        <CardHeader className="pb-2 pt-4 px-5 bg-slate-50/80 border-b border-slate-100">
                                            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meters[0]?.color || "#64748b" }} />
                                                Khu vực: {zone.name}
                                            </CardTitle>
                                            <CardDescription className="text-xs">Tiêu thụ ngày (m³/ngày) – tính theo chênh lệch chỉ số</CardDescription>
                                        </CardHeader>
                                        <CardContent className="h-[240px] pt-4 px-2">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="fmtDate" tickLine={false} axisLine={false}
                                                        tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }} dy={6} />
                                                    <YAxis tickLine={false} axisLine={false}
                                                        tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                                                        tickFormatter={v => v.toLocaleString("vi-VN")} />
                                                    <Tooltip content={<WaterTooltip />} />
                                                    <Legend wrapperStyle={{ paddingTop: 12, fontSize: 11, fontWeight: 600, color: "#475569" }} iconType="circle" />
                                                    {meters.map(m => (
                                                        <Line key={m.key} type="monotone" dataKey={m.key}
                                                            name={m.shortLabel} stroke={m.color} strokeWidth={2.5}
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

                            {/* Summary table */}
                            <Card className="bg-white/90 shadow-sm border-slate-100">
                                <CardHeader className="pb-2 pt-4 px-4">
                                    <CardTitle className="text-sm font-bold text-slate-700">Bảng chỉ số thô (m³)</CardTitle>
                                    <CardDescription className="text-xs">Chỉ số đồng hồ ghi nhận theo ngày trong tháng</CardDescription>
                                </CardHeader>
                                <CardContent className="px-0 pb-4 overflow-x-auto">
                                    <table className="w-full text-[11px] min-w-[600px]">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50/80">
                                                <th className="text-left px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50/80">Ngày</th>
                                                {WATER_METERS.map(m => (
                                                    <th key={m.key} className="text-right px-2.5 py-2.5 font-bold text-slate-500 uppercase tracking-wider" title={m.label}>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                                                            {m.shortLabel}
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...historyRecords].reverse().map((r, idx) => (
                                                <tr key={r.work_date} className={`border-b border-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"} hover:bg-sky-50/30 transition-colors`}>
                                                    <td className="px-4 py-2 font-semibold text-slate-700 sticky left-0 bg-inherit whitespace-nowrap">
                                                        {format(new Date(r.work_date), "dd/MM")}
                                                    </td>
                                                    {WATER_METERS.map(m => (
                                                        <td key={m.key} className="text-right px-2.5 py-2 font-mono text-slate-600">
                                                            {r[m.key] != null ? Number(r[m.key]).toLocaleString("vi-VN") : <span className="text-slate-300">–</span>}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
