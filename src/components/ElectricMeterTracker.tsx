"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
    format, parseISO, startOfMonth, endOfMonth,
    eachDayOfInterval, subMonths, addMonths, getDay, subDays,
} from "date-fns"
import { ChevronLeft, ChevronRight, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { calculateMeterConsumption } from "@/lib/electricity-meters"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type OtherMeterField =
    | "transformer" | "maintenance" | "eco2" | "db_hvac" | "db_ac_hca"
    | "vent_1" | "ac_2_panel" | "cooling_fan" | "boiler" | "office"

const OTHER_METERS: { field: OtherMeterField; label: string }[] = [
    { field: "transformer", label: "Transformer" },
    { field: "maintenance", label: "Maint" },
    { field: "eco2", label: "ECO2" },
    { field: "db_hvac", label: "DB-HVAC" },
    { field: "db_ac_hca", label: "Color Sorter" },
    { field: "vent_1", label: "Vent 1" },
    { field: "ac_2_panel", label: "AC 2" },
    { field: "cooling_fan", label: "Cooling" },
    { field: "boiler", label: "Lò hơi" },
    { field: "office", label: "DB-Office" },
]

type DayRecord = {
    work_date: string
    transformer?: number; maintenance?: number; eco2?: number; db_hvac?: number
    db_ac_hca?: number; vent_1?: number; ac_2_panel?: number; cooling_fan?: number
    boiler?: number; office?: number
    kwh_transformer: number; kwh_maintenance: number; kwh_eco2: number; kwh_db_hvac: number
    kwh_db_ac_hca: number; kwh_vent_1: number; kwh_ac_2_panel: number; kwh_cooling_fan: number
    kwh_boiler: number; kwh_office: number
    shelling_meter?: number
    shelling_kwh: number
    shelling_ton: number
}

type LocalData = Record<string, Partial<Record<OtherMeterField | "shelling_meter", string>>>

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KWH_ZERO = {
    kwh_transformer: 0, kwh_maintenance: 0, kwh_eco2: 0, kwh_db_hvac: 0, kwh_db_ac_hca: 0,
    kwh_vent_1: 0, kwh_ac_2_panel: 0, kwh_cooling_fan: 0, kwh_boiler: 0, kwh_office: 0,
}

function makeBlankRow(dayStr: string): DayRecord {
    return { work_date: dayStr, ...KWH_ZERO, shelling_kwh: 0, shelling_ton: 0 }
}

function recomputeOtherKwh(records: DayRecord[]) {
    for (let i = 1; i < records.length; i++) {
        const c = records[i], p = records[i - 1]
        c.kwh_transformer = calculateMeterConsumption(c.transformer, p.transformer)
        c.kwh_maintenance = calculateMeterConsumption(c.maintenance, p.maintenance)
        c.kwh_eco2 = calculateMeterConsumption(c.eco2, p.eco2)
        c.kwh_db_hvac = calculateMeterConsumption(c.db_hvac, p.db_hvac)
        c.kwh_db_ac_hca = calculateMeterConsumption(c.db_ac_hca, p.db_ac_hca)
        c.kwh_vent_1 = calculateMeterConsumption(c.vent_1, p.vent_1)
        c.kwh_ac_2_panel = calculateMeterConsumption(c.ac_2_panel, p.ac_2_panel)
        c.kwh_cooling_fan = calculateMeterConsumption(c.cooling_fan, p.cooling_fan)
        c.kwh_boiler = calculateMeterConsumption(c.boiler, p.boiler)
        c.kwh_office = calculateMeterConsumption(c.office, p.office)
    }
}

function recomputeShellingKwh(records: DayRecord[]) {
    // Sunday reading = next day's (Monday) reading → Sunday kWh = 0
    for (let i = 0; i < records.length; i++) {
        if (getDay(parseISO(records[i].work_date)) === 0 && records[i + 1]?.shelling_meter !== undefined) {
            records[i].shelling_meter = records[i + 1].shelling_meter
        }
    }
    // kWh is look-ahead: today's meter to tomorrow's meter
    for (let i = 0; i < records.length; i++) {
        const today = records[i].shelling_meter
        const tomorrow = records[i + 1]?.shelling_meter
        records[i].shelling_kwh = today != null && tomorrow != null
            ? Math.max(0, tomorrow - today) : 0
    }
}

function otherKwhSum(r: DayRecord): number {
    return r.kwh_transformer + r.kwh_maintenance + r.kwh_eco2 + r.kwh_db_hvac +
        r.kwh_db_ac_hca + r.kwh_vent_1 + r.kwh_ac_2_panel + r.kwh_cooling_fan +
        r.kwh_boiler + r.kwh_office
}

function fmtKwh(kwh: number): string {
    if (kwh >= 10000) return `${(kwh / 1000).toFixed(1)}k`
    return kwh.toLocaleString("vi-VN")
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ElectricMeterTracker({ userRole }: { userRole?: string }) {
    const supabase = createClient()
    const canEdit = ["admin", "HSE", "maint", "hse_admin"].includes(userRole ?? "")

    const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    // Fetched data: index 0 = prev month last day (baseline for kWh), 1..N = current month days
    const [fetchedBase, setFetchedBase] = useState<DayRecord[]>([])
    const [fetchedPrev, setFetchedPrev] = useState<DayRecord[]>([])
    // Shell dept id is discovered during fetch and kept in a ref for save
    const shellDeptIdRef = useRef<string | null>(null)

    const [localData, setLocalData] = useState<LocalData>({})
    const [originalData, setOriginalData] = useState<LocalData>({})
    const [compMode, setCompMode] = useState<"full" | "same">("full")
    const [focusedDate, setFocusedDate] = useState<string | null>(null)

    const todayStr = format(new Date(), "yyyy-MM-dd")
    const daysInMonth = useMemo(() =>
        eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
            .map(d => format(d, "yyyy-MM-dd")),
        [currentMonth]
    )

    // ── Fetch ──────────────────────────────────────────────────────────────

    const fetchData = useCallback(async () => {
        setIsLoading(true)

        const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
            .map(d => format(d, "yyyy-MM-dd"))

        const startStr = days[0]
        const endStr = days[days.length - 1]
        const prevLastDayStr = format(subDays(parseISO(startStr), 1), "yyyy-MM-dd")

        const prevMonth = subMonths(currentMonth, 1)
        const prevStartStr = format(startOfMonth(prevMonth), "yyyy-MM-dd")
        const prevEndStr = format(endOfMonth(prevMonth), "yyyy-MM-dd")

        // Discover shell dept (fast, small query)
        const { data: deptData } = await supabase.from("departments").select("id, code")
        const shell = (deptData as any[] | null)?.find((d: any) => d.code === "SHELL")
        const deptId: string | null = shell?.id ?? null
        shellDeptIdRef.current = deptId

        const [otherRes, prevOtherRes, kpiRes, prevKpiRes, actualRes] = await Promise.all([
            supabase.from("daily_electricity_others").select("*")
                .gte("work_date", prevLastDayStr).lte("work_date", endStr).order("work_date"),
            supabase.from("daily_electricity_others").select("*")
                .gte("work_date", prevStartStr).lte("work_date", prevEndStr).order("work_date"),
            deptId
                ? supabase.from("daily_kpi").select("work_date, electricity_meter_reading")
                    .eq("department_id", deptId)
                    .gte("work_date", prevLastDayStr).lte("work_date", endStr).order("work_date")
                : Promise.resolve({ data: [] as any[] }),
            deptId
                ? supabase.from("daily_kpi").select("work_date, electricity_meter_reading")
                    .eq("department_id", deptId)
                    .gte("work_date", prevStartStr).lte("work_date", prevEndStr).order("work_date")
                : Promise.resolve({ data: [] as any[] }),
            deptId
                ? supabase.from("daily_actual").select("work_date, actual_ton")
                    .eq("department_id", deptId)
                    .gte("work_date", startStr).lte("work_date", endStr).order("work_date")
                : Promise.resolve({ data: [] as any[] }),
        ])

        const otherRows: any[] = otherRes.data ?? []
        const prevOtherRows: any[] = prevOtherRes.data ?? []
        const kpiRows: any[] = (kpiRes as any).data ?? []
        const prevKpiRows: any[] = (prevKpiRes as any).data ?? []
        const actualRows: any[] = (actualRes as any).data ?? []

        function buildRow(dayStr: string, otherSource: any[], kpiSource: any[], actualSource: any[]): DayRecord {
            const other = otherSource.find((r: any) => r.work_date === dayStr)
            const kpi = kpiSource.find((r: any) => r.work_date === dayStr)
            const actual = actualSource.find((r: any) => r.work_date === dayStr)
            const row: DayRecord = { work_date: dayStr, ...KWH_ZERO, shelling_kwh: 0, shelling_ton: 0 }
            for (const m of OTHER_METERS) {
                if (other?.[m.field] != null) (row as any)[m.field] = Number(other[m.field])
            }
            if (kpi?.electricity_meter_reading != null) row.shelling_meter = Number(kpi.electricity_meter_reading)
            if (actual?.actual_ton) row.shelling_ton = Number(actual.actual_ton)
            return row
        }

        // Current month (with baseline at index 0)
        const allDays = [prevLastDayStr, ...days]
        const compiled = allDays.map(d => buildRow(d, otherRows, kpiRows, actualRows))
        recomputeOtherKwh(compiled)
        recomputeShellingKwh(compiled)
        setFetchedBase(compiled)

        // Build local data from current month records
        const newLocal: LocalData = {}
        compiled.slice(1).forEach(row => {
            newLocal[row.work_date] = {}
            for (const m of OTHER_METERS) {
                const v = (row as any)[m.field]
                if (v !== undefined) newLocal[row.work_date][m.field] = String(v)
            }
            if (row.shelling_meter !== undefined) {
                newLocal[row.work_date]["shelling_meter"] = String(row.shelling_meter)
            }
        })
        setLocalData(newLocal)
        setOriginalData(JSON.parse(JSON.stringify(newLocal)))

        // Previous month (for comparison — no baseline available so day 1 kWh = 0)
        const prevDays = eachDayOfInterval({ start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) })
            .map(d => format(d, "yyyy-MM-dd"))
        const prevCompiled = prevDays.map(d => buildRow(d, prevOtherRows, prevKpiRows, []))
        recomputeOtherKwh(prevCompiled)
        recomputeShellingKwh(prevCompiled)
        setFetchedPrev(prevCompiled)

        setIsLoading(false)
    }, [currentMonth, supabase])

    useEffect(() => { fetchData() }, [fetchData])

    // ── Live display data (base + local edits + recomputed kWh) ────────────

    const displayData = useMemo((): DayRecord[] => {
        if (fetchedBase.length === 0) return daysInMonth.map(makeBlankRow)

        // Prepend baseline so day-1 kWh can reference the prev-month last-day reading
        const merged: DayRecord[] = [{ ...fetchedBase[0] }]
        for (const dayStr of daysInMonth) {
            const base = fetchedBase.find(r => r.work_date === dayStr) ?? makeBlankRow(dayStr)
            const edits = localData[dayStr] ?? {}
            const row: DayRecord = { ...base, ...KWH_ZERO, shelling_kwh: 0 }

            for (const m of OTHER_METERS) {
                if (m.field in edits) {
                    const raw = edits[m.field]!
                    const n = raw === "" ? undefined : parseFloat(raw)
                    ;(row as any)[m.field] = n !== undefined && !isNaN(n) ? n : undefined
                }
            }
            if ("shelling_meter" in edits) {
                const raw = edits["shelling_meter"]!
                const n = raw === "" ? undefined : parseFloat(raw)
                row.shelling_meter = n !== undefined && !isNaN(n) ? n : undefined
            }

            merged.push(row)
        }

        recomputeOtherKwh(merged)
        recomputeShellingKwh(merged)
        return merged.slice(1)
    }, [fetchedBase, localData, daysInMonth])

    const hasChanges = useMemo(() => {
        for (const dayStr of daysInMonth) {
            const o = originalData[dayStr] ?? {}
            const c = localData[dayStr] ?? {}
            const keys = new Set([...Object.keys(o), ...Object.keys(c)]) as Set<string>
            for (const k of keys) {
                if (((o as any)[k] ?? "") !== ((c as any)[k] ?? "")) return true
            }
        }
        return false
    }, [localData, originalData, daysInMonth])

    // ── Summary stats ──────────────────────────────────────────────────────

    const stats = useMemo(() => {
        const activeDays = displayData.filter(r => r.work_date <= todayStr && (otherKwhSum(r) > 0 || r.shelling_kwh > 0))
        const currentTotal = activeDays.reduce((s, r) => s + otherKwhSum(r), 0)
        const currentAvg = activeDays.length > 0 ? currentTotal / activeDays.length : 0
        const shellingTotal = displayData
            .filter(r => r.work_date <= todayStr)
            .reduce((s, r) => s + r.shelling_kwh, 0)

        const prevActive = fetchedPrev.filter(r => otherKwhSum(r) > 0 || r.shelling_kwh > 0)
        const prevFullAvg = prevActive.length > 0
            ? prevActive.reduce((s, r) => s + otherKwhSum(r), 0) / prevActive.length : 0
        const samePeriod = prevActive.slice(0, activeDays.length)
        const prevSameAvg = samePeriod.length > 0
            ? samePeriod.reduce((s, r) => s + otherKwhSum(r), 0) / samePeriod.length : 0

        return {
            currentTotal, currentAvg, activeDays: activeDays.length,
            shellingTotal, prevFullAvg, prevSameAvg,
        }
    }, [displayData, fetchedPrev, todayStr])

    const prevAvg = compMode === "full" ? stats.prevFullAvg : stats.prevSameAvg
    const hasPrev = prevAvg > 0
    const avgDiff = hasPrev ? stats.currentAvg - prevAvg : 0
    const avgPct = hasPrev ? Math.round((avgDiff / prevAvg) * 1000) / 10 : null

    // ── Interactions ───────────────────────────────────────────────────────

    function updateCell(dayStr: string, field: OtherMeterField | "shelling_meter", val: string) {
        setLocalData(prev => ({
            ...prev,
            [dayStr]: { ...(prev[dayStr] ?? {}), [field]: val },
        }))
    }

    async function handleSave() {
        setIsSaving(true)
        try {
            const deptId = shellDeptIdRef.current

            const otherPayload = displayData
                .filter(r => OTHER_METERS.some(m => (r as any)[m.field] !== undefined))
                .map(r => ({
                    work_date: r.work_date,
                    transformer: r.transformer ?? null,
                    maintenance: r.maintenance ?? null,
                    eco2: r.eco2 ?? null,
                    db_hvac: r.db_hvac ?? null,
                    db_ac_hca: r.db_ac_hca ?? null,
                    vent_1: r.vent_1 ?? null,
                    ac_2_panel: r.ac_2_panel ?? null,
                    cooling_fan: r.cooling_fan ?? null,
                    boiler: r.boiler ?? null,
                    office: r.office ?? null,
                    updated_at: new Date().toISOString(),
                }))

            // displayData already has Sunday shelling_meter synced to Monday's value
            const shellingPayload = deptId
                ? displayData
                    .filter(r => r.shelling_meter !== undefined)
                    .map(r => ({
                        work_date: r.work_date,
                        department_id: deptId,
                        electricity_meter_reading: r.shelling_meter,
                        updated_at: new Date().toISOString(),
                    }))
                : []

            const errors: string[] = []
            if (otherPayload.length > 0) {
                const { error } = await supabase.from("daily_electricity_others")
                    .upsert(otherPayload, { onConflict: "work_date" })
                if (error) errors.push("Điện khu vực: " + error.message)
            }
            if (shellingPayload.length > 0) {
                const { error } = await supabase.from("daily_kpi")
                    .upsert(shellingPayload, { onConflict: "work_date,department_id" })
                if (error) errors.push("Điện Shelling: " + error.message)
            }

            if (errors.length > 0) {
                toast.error("Lỗi: " + errors.join("; "))
            } else {
                toast.success("Đã lưu dữ liệu điện thành công")
                setOriginalData(JSON.parse(JSON.stringify(localData)))
            }
        } finally {
            setIsSaving(false)
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Summary panel */}
            <section className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-[0_8px_24px_-12px_rgba(245,158,11,0.4)]">
                <div className="flex flex-col gap-2 border-b border-amber-100 bg-gradient-to-r from-amber-900 via-amber-700 to-yellow-600 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-sm font-black tracking-wide">
                            ⚡ Đồng hồ điện khu vực · tháng {format(currentMonth, "MM/yyyy")}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-amber-100">
                            Lũy kế đến ngày {format(new Date(), "dd/MM")} · Đơn vị kWh
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Month navigation */}
                        <div className="flex items-center gap-0.5 rounded-lg border border-white/20 bg-white/10 p-0.5">
                            <button
                                onClick={() => setCurrentMonth(m => subMonths(m, 1))}
                                className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-[72px] text-center text-xs font-bold">
                                {format(currentMonth, "MM/yyyy")}
                            </span>
                            <button
                                onClick={() => setCurrentMonth(m => addMonths(m, 1))}
                                className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        {/* Comparison mode toggle */}
                        <div className="flex items-center gap-0.5 rounded-md border border-white/20 bg-white/10 p-0.5 text-[10px] font-bold">
                            <button
                                onClick={() => setCompMode("full")}
                                className={cn("rounded px-2.5 py-0.5 transition-colors",
                                    compMode === "full" ? "bg-white text-amber-900" : "text-white/60 hover:text-white")}>
                                Cả tháng trước
                            </button>
                            <button
                                onClick={() => setCompMode("same")}
                                className={cn("rounded px-2.5 py-0.5 transition-colors",
                                    compMode === "same" ? "bg-white text-amber-900" : "text-white/60 hover:text-white")}>
                                Cùng kỳ
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
                    <div className="px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Tổng khu vực</p>
                        <p className="mt-1 text-xl font-black tabular-nums text-amber-900">
                            {Math.round(stats.currentTotal).toLocaleString("vi-VN")}{" "}
                            <span className="text-xs font-normal text-slate-400">kWh</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{stats.activeDays} ngày có số liệu</p>
                    </div>
                    <div className="px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">AVG hiện tại</p>
                        <p className="mt-1 text-xl font-black tabular-nums text-amber-900">
                            {Math.round(stats.currentAvg).toLocaleString("vi-VN")}{" "}
                            <span className="text-xs font-normal text-slate-400">kWh/ngày</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Không tính ngày 0</p>
                    </div>
                    <div className={cn("px-4 py-3",
                        hasPrev && avgDiff > 0 ? "bg-rose-50/70" : hasPrev ? "bg-emerald-50/60" : "")}>
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                            So với AVG {compMode === "full" ? "cả tháng trước" : "cùng kỳ trước"}
                        </p>
                        {hasPrev ? (
                            <>
                                <p className={cn("mt-1 text-xl font-black tabular-nums",
                                    avgDiff > 0 ? "text-rose-600" : "text-emerald-600")}>
                                    {avgPct != null
                                        ? `${avgDiff > 0 ? "+" : ""}${avgPct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`
                                        : "—"}
                                </p>
                                <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                                    KT {Math.round(prevAvg).toLocaleString("vi-VN")} kWh/ngày
                                </p>
                            </>
                        ) : (
                            <p className="mt-1 text-xl font-black text-slate-300">—</p>
                        )}
                    </div>
                    <div className="px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Shelling tháng này</p>
                        <p className="mt-1 text-xl font-black tabular-nums text-amber-900">
                            {Math.round(stats.shellingTotal).toLocaleString("vi-VN")}{" "}
                            <span className="text-xs font-normal text-slate-400">kWh</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Tích lũy đến hôm nay</p>
                    </div>
                </div>
            </section>

            {/* Monthly table */}
            <div className="overflow-hidden rounded-xl border bg-card shadow">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                            Nhập chỉ số đồng hồ · khu vực + Shelling
                        </p>
                        <h3 className="text-sm font-semibold text-slate-800">
                            Tháng {format(currentMonth, "MM/yyyy")}
                        </h3>
                    </div>
                    {canEdit && (
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !hasChanges}
                            size="sm"
                            className="hidden md:inline-flex bg-emerald-600 hover:bg-emerald-700 text-white">
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            {isSaving ? "Đang lưu..." : hasChanges ? "Lưu tháng" : "Đã lưu"}
                        </Button>
                    )}
                </div>

                <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
                    <table className="w-full border-collapse text-xs" style={{ minWidth: 1200 }}>
                        <thead>
                            <tr className="border-b bg-slate-50">
                                <th className="sticky left-0 z-20 w-[52px] border-r bg-slate-50 px-2 py-2.5 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                    Ngày
                                </th>
                                {OTHER_METERS.map(m => (
                                    <th
                                        key={m.field}
                                        className="border-r px-1.5 py-2.5 text-center text-[9px] font-bold uppercase tracking-wider text-emerald-700"
                                        style={{ minWidth: 88 }}>
                                        {m.label}
                                    </th>
                                ))}
                                <th
                                    className="border-r px-1.5 py-2.5 text-center text-[9px] font-bold uppercase tracking-wider text-amber-700"
                                    style={{ minWidth: 88 }}>
                                    Shelling
                                </th>
                                <th
                                    className="px-1.5 py-2.5 text-center text-[9px] font-bold uppercase tracking-wider text-slate-400"
                                    style={{ minWidth: 72 }}>
                                    kWh/Tấn
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {displayData.map(row => {
                                const isToday = row.work_date === todayStr
                                const isSun = getDay(parseISO(row.work_date)) === 0
                                const isFocused = focusedDate === row.work_date
                                const ratio = row.shelling_ton > 0 && row.shelling_kwh > 0
                                    ? (row.shelling_kwh / row.shelling_ton).toFixed(2) : null

                                return (
                                    <tr
                                        key={row.work_date}
                                        className={cn(
                                            "transition-colors",
                                            isToday && "bg-amber-50/40",
                                            isFocused && "bg-amber-50/60",
                                            isSun && !isToday && !isFocused && "bg-slate-50/60",
                                        )}>
                                        {/* Date cell */}
                                        <td className={cn(
                                            "sticky left-0 z-10 border-r px-2 py-1 text-center backdrop-blur-md transition-colors",
                                            isFocused
                                                ? "bg-amber-100 text-amber-900 font-bold"
                                                : "bg-slate-50/90 text-slate-700 font-semibold",
                                        )}>
                                            <div className="text-[10px] leading-tight">
                                                {format(parseISO(row.work_date), "dd/MM")}
                                            </div>
                                            {isSun && (
                                                <div className="mt-0.5 text-[8px] leading-none text-slate-400">CN</div>
                                            )}
                                        </td>

                                        {/* Other meter cells */}
                                        {OTHER_METERS.map(m => {
                                            const kwh = (row as any)[`kwh_${m.field}`] as number
                                            const stored = (row as any)[m.field]
                                            const inputVal = localData[row.work_date]?.[m.field]
                                                ?? (stored !== undefined ? String(stored) : "")

                                            return (
                                                <td
                                                    key={m.field}
                                                    className={cn("border-r p-0.5 align-top transition-colors",
                                                        isFocused && "bg-amber-50/20")}>
                                                    <input
                                                        type="number"
                                                        step="1"
                                                        disabled={!canEdit}
                                                        value={inputVal}
                                                        placeholder="—"
                                                        onFocus={() => setFocusedDate(row.work_date)}
                                                        onBlur={() => setFocusedDate(null)}
                                                        onChange={e => updateCell(row.work_date, m.field, e.target.value)}
                                                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-right text-[11px] font-semibold text-slate-700 outline-none focus:border-emerald-300 focus:bg-emerald-50/40 focus:ring-1 focus:ring-emerald-300 disabled:cursor-default"
                                                    />
                                                    {kwh > 0 && (
                                                        <div className="mt-0.5 text-center text-[8px] font-semibold text-emerald-600 leading-tight">
                                                            {fmtKwh(kwh)} kWh
                                                        </div>
                                                    )}
                                                </td>
                                            )
                                        })}

                                        {/* Shelling cell */}
                                        <td className={cn("border-r p-0.5 align-top transition-colors",
                                            isFocused && "bg-amber-50/20")}>
                                            <input
                                                type="number"
                                                step="1"
                                                disabled={!canEdit || isSun}
                                                title={isSun ? "Chủ nhật: tự lấy chỉ số Thứ 2" : undefined}
                                                value={
                                                    isSun
                                                        ? (row.shelling_meter !== undefined ? String(row.shelling_meter) : "")
                                                        : (localData[row.work_date]?.["shelling_meter"]
                                                            ?? (row.shelling_meter !== undefined ? String(row.shelling_meter) : ""))
                                                }
                                                placeholder="—"
                                                onFocus={() => { if (!isSun) setFocusedDate(row.work_date) }}
                                                onBlur={() => setFocusedDate(null)}
                                                onChange={e => { if (!isSun) updateCell(row.work_date, "shelling_meter", e.target.value) }}
                                                className={cn(
                                                    "w-full rounded border border-transparent bg-transparent px-1 py-1 text-right text-[11px] font-semibold outline-none focus:border-amber-300 focus:bg-amber-50/40 focus:ring-1 focus:ring-amber-300",
                                                    isSun ? "cursor-not-allowed text-slate-400 bg-slate-100/60" : "text-slate-700 disabled:cursor-default",
                                                )}
                                            />
                                            {row.shelling_kwh > 0 && (
                                                <div className="mt-0.5 text-center text-[8px] font-semibold text-amber-600 leading-tight">
                                                    {row.shelling_kwh.toLocaleString("vi-VN")} kWh
                                                </div>
                                            )}
                                        </td>

                                        {/* kWh/Tấn */}
                                        <td className="p-1 text-center align-middle">
                                            {ratio
                                                ? <span className="text-[11px] font-bold text-indigo-700">{ratio}</span>
                                                : <span className="text-[11px] text-slate-300">—</span>}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile save button */}
                {canEdit && (
                    <div className="sticky bottom-0 z-30 border-t border-emerald-100 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur md:hidden">
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !hasChanges}
                            className="min-h-12 w-full bg-emerald-700 text-base font-bold text-white shadow-lg hover:bg-emerald-800">
                            <Save className="mr-2 h-5 w-5" />
                            {isSaving ? "Đang lưu..." : hasChanges ? "Lưu tháng" : "Đã lưu"}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
