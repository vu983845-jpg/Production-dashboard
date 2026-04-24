"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { format, startOfMonth, endOfMonth, subMonths, addMonths, subDays, addDays, differenceInDays } from "date-fns"
import { vi } from "date-fns/locale"
import { CalendarIcon, ChevronLeft, ChevronRight, Zap, Loader2, Droplets } from "lucide-react"
import {
    AreaChart, Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, ReferenceLine, PieChart, Pie, Treemap
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShieldCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { ISO50001Content } from "../iso50001/iso-content"
import { useLanguage } from "@/contexts/LanguageContext"
import { WaterTracker } from "@/components/WaterTracker"


export default function EnergyDashboardPage() {
    const supabase = createClient()
    const { language, t } = useLanguage()
    const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
    const [isLoading, setIsLoading] = useState(true)

    // Data States
    const [energyData, setEnergyData] = useState<any[]>([])
    const [mainChartMode, setMainChartMode] = useState<'kwh' | 'vnd'>('kwh')
    const [compressorData, setCompressorData] = useState<any[]>([])
    const [otherElecData, setOtherElecData] = useState<any[]>([])
    const [shellingData, setShellingData] = useState<any[]>([])
    // SEU multi-month trend
    const [seuTrend, setSeuTrend] = useState<any[]>([])
    const [seuLoading, setSeuLoading] = useState(false)

    const goToPreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1))
    const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1))

    const [userRole, setUserRole] = useState("viewer")
    const [userEmail, setUserEmail] = useState("")

    // Read ?tab= from URL to auto-switch tabs (e.g. from dashboard Water card link)
    const searchParams = useSearchParams()
    const defaultTab = searchParams?.get('tab') || 'energy_dashboard'

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) {
                setUserEmail(data.user.email || "")
                supabase.from('profiles').select('role').eq('id', data.user.id).single().then(r => {
                    if (r.data?.role) setUserRole(r.data.role)
                })
            }
        })
    }, [supabase])

    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true)
            const startDateStr = format(startOfMonth(currentMonth), "yyyy-MM-dd")
            const endDateStr = format(endOfMonth(currentMonth), "yyyy-MM-dd")

            // Lấy thêm 1 ngày của tháng sau để tính tiêu thụ cho ngày cuối tháng (reading hôm sau - hôm nay)
            const nextDayStr = format(addDays(endOfMonth(currentMonth), 1), "yyyy-MM-dd")

            try {
                // 1. Fetch Main Energy (Factory Total) - already in daily consumption
                const { data: energy } = await supabase
                    .from("daily_energy")
                    .select("*")
                    .gte("work_date", startDateStr)
                    .lte("work_date", nextDayStr)
                    .order("work_date", { ascending: true })

                // 2. Fetch Compressors (MNK) - Raw Meter Index
                const { data: compressorsRaw } = await supabase
                    .from("daily_compressor")
                    .select("*")
                    .gte("work_date", startDateStr)
                    .lte("work_date", nextDayStr)
                    .order("work_date", { ascending: true })

                // 3. Fetch Other Electricity (8 meters) - Raw Meter Index
                const { data: othersRaw } = await supabase
                    .from("daily_electricity_others")
                    .select("*")
                    .gte("work_date", startDateStr)
                    .lte("work_date", nextDayStr)
                    .order("work_date", { ascending: true })

                // 4. Fetch Shelling KPIs (Shelling Energy) - Need to fetch Dept ID first
                const { data: shellDept } = await supabase.from("departments").select("id").eq("code", "SHELL").single()
                let shelling: any[] = []
                if (shellDept) {
                    const { data: shellingRaw } = await supabase
                        .from("daily_kpi")
                        .select("work_date, electricity_meter_reading")
                        .eq("department_id", shellDept.id)
                        .gte("work_date", startDateStr)
                        .lte("work_date", nextDayStr)
                        .order("work_date", { ascending: true })
                    shelling = shellingRaw || []
                }

                // Compute Deltas
                const computeDeltas = (rawData: any[], multiplier = 1, startDate: string, endDateStr: string) => {
                    if (!rawData || rawData.length === 0) return []
                    let result = []
                    for (let i = 1; i < rawData.length; i++) {
                        const prev = rawData[i - 1]
                        const curr = rawData[i]
                        const diffDays = differenceInDays(new Date(curr.work_date), new Date(prev.work_date)) || 1

                        let mapped: any = { work_date: prev.work_date, fmtDate: format(new Date(prev.work_date), "dd/MM") }

                        Object.keys(curr).forEach(k => {
                            if (k !== 'work_date' && k !== 'id' && k !== 'created_at' && k !== 'updated_at' && typeof curr[k] === 'number') {
                                if (k === 'cooling_fan' || k === 'boiler') {
                                    mapped[k] = prev[k] || 0; // These columns are already deltas (kWh) per day
                                } else if (curr[k] !== null && prev[k] !== null && curr[k] !== undefined && prev[k] !== undefined) {
                                    mapped[k] = Math.max(0, (curr[k] - prev[k]) / diffDays) * multiplier
                                } else {
                                    mapped[k] = 0
                                }
                            }
                        })
                        if (prev.work_date >= startDate && prev.work_date <= endDateStr) {
                            result.push(mapped)
                        }
                    }
                    return result
                }

                const compDeltas = computeDeltas(compressorsRaw || [], 1000, startDateStr, endDateStr) // MNK index is MWh, graph in kWh
                const othersDeltas = computeDeltas(othersRaw || [], 1, startDateStr, endDateStr)       // Others index is exactly kWh

                // Shelling delta
                const shellDeltasExtracted = computeDeltas(shelling, 1, startDateStr, endDateStr)
                const shellMapped = shellDeltasExtracted.map(d => ({ ...d, energy_kwh: d.electricity_meter_reading }))

                // Pre-process energy to compute kWh from meter readings if missing
                const processedEnergy = [...(energy || [])];
                for (let i = 1; i < processedEnergy.length; i++) {
                    const curr = processedEnergy[i];
                    const prev = processedEnergy[i - 1];
                    const diffDays = differenceInDays(new Date(curr.work_date), new Date(prev.work_date)) || 1;

                    if (!prev.electricity_peak_kwh && curr.meter_peak && prev.meter_peak) {
                        prev.electricity_peak_kwh = Math.max(0, (curr.meter_peak - prev.meter_peak) / diffDays);
                    }
                    if (!prev.electricity_normal_kwh && curr.meter_normal && prev.meter_normal) {
                        prev.electricity_normal_kwh = Math.max(0, (curr.meter_normal - prev.meter_normal) / diffDays);
                    }
                    if (!prev.electricity_offpeak_kwh && curr.meter_offpeak && prev.meter_offpeak) {
                        prev.electricity_offpeak_kwh = Math.max(0, (curr.meter_offpeak - prev.meter_offpeak) / diffDays);
                    }
                    if (!prev.electricity_kwh && curr.electricity_meter_reading && prev.electricity_meter_reading) {
                        prev.electricity_kwh = Math.max(0, (curr.electricity_meter_reading - prev.electricity_meter_reading) / diffDays);
                    }
                }

                // Make sure to filter out the out of bounds
                const validEnergy = processedEnergy.filter(e => e.work_date >= startDateStr && e.work_date <= endDateStr);

                setEnergyData(validEnergy.map(e => {
                    // EVN tariff: NO Peak hours on Sunday (day = 0)
                    // Peak hours only exist Mon-Sat: 9:30-11:30 and 17:00-20:00
                    const isSunday = new Date(e.work_date).getDay() === 0;

                    const rawPeak = e.electricity_peak_kwh || 0;
                    // On Sundays, peak meter should be 0. If meter recorded something anyway,
                    // move it to Normal to preserve total consumption accuracy.
                    const p = isSunday ? 0 : rawPeak;
                    const n = (e.electricity_normal_kwh || 0) + (isSunday ? rawPeak : 0);
                    const o = e.electricity_offpeak_kwh || 0;
                    const sum = p + n + o;

                    const cost_peak = p * 3398;
                    const cost_normal = n * 1833;
                    const cost_offpeak = o * 1190;
                    const fallback_cost = sum > 0 ? 0 : Number(e.electricity_kwh || 0) * 1833;

                    return {
                        ...e,
                        fmtDate: format(new Date(e.work_date), "dd/MM"),
                        fallback_kwh: sum > 0 ? 0 : Number(e.electricity_kwh || 0),
                        stacked_peak: p,
                        stacked_normal: n,
                        stacked_offpeak: o,
                        cost_peak,
                        cost_normal,
                        cost_offpeak,
                        fallback_cost,
                        total_cost_vnd: cost_peak + cost_normal + cost_offpeak + fallback_cost
                    }
                }))
                setCompressorData(compDeltas)
                setOtherElecData(othersDeltas)
                setShellingData(shellMapped)

            } catch (error) {
                console.error("Error fetching energy dashboard data:", error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchDashboardData()
    }, [currentMonth, supabase])

    // ── SEU Multi-month trend fetch (independent of selected month) ──────────
    useEffect(() => {
        const fetchSeuTrend = async () => {
            setSeuLoading(true)
            try {
                const today = new Date()
                const NUM_MONTHS = 12
                // Build array of month start/end dates for last 12 months
                const months: { label: string; start: string; end: string; prevEnd: string }[] = []
                for (let i = NUM_MONTHS - 1; i >= 0; i--) {
                    const d = subMonths(startOfMonth(today), i)
                    months.push({
                        label: format(d, 'MM/yyyy'),
                        start: format(startOfMonth(d), 'yyyy-MM-dd'),
                        end: format(endOfMonth(d), 'yyyy-MM-dd'),
                        prevEnd: format(subDays(startOfMonth(d), 1), 'yyyy-MM-dd'),
                    })
                }

                // Fetch shell dept id once
                const { data: shellDept } = await supabase.from('departments').select('id').eq('code', 'SHELL').single()

                // Fetch all raw data in parallel covering the full range
                const rangeStart = months[0].prevEnd   // day before first month
                const rangeEnd = months[months.length - 1].end

                const [
                    { data: energyRaw },
                    { data: compRaw },
                    { data: shellKpiRaw },
                ] = await Promise.all([
                    supabase.from('daily_energy')
                        .select('work_date, electricity_kwh, wood_kg')
                        .gte('work_date', rangeStart)
                        .lte('work_date', rangeEnd)
                        .order('work_date'),
                    supabase.from('daily_compressor')
                        .select('work_date, meter1, meter2, meter3')
                        .gte('work_date', rangeStart)
                        .lte('work_date', rangeEnd)
                        .order('work_date'),
                    shellDept
                        ? supabase.from('daily_kpi')
                            .select('work_date, electricity_meter_reading')
                            .eq('department_id', shellDept.id)
                            .gte('work_date', rangeStart)
                            .lte('work_date', rangeEnd)
                            .order('work_date')
                        : Promise.resolve({ data: [] }),
                ])

                // Build lookup maps by date
                const energyMap: Record<string, { kwh: number; wood: number }> = {}
                    ; (energyRaw || []).forEach((r: any) => {
                        energyMap[r.work_date] = { kwh: Number(r.electricity_kwh || 0), wood: Number(r.wood_kg || 0) }
                    })

                const compMap: Record<string, { m1: number; m2: number; m3: number }> = {}
                    ; (compRaw || []).forEach((r: any) => {
                        compMap[r.work_date] = { m1: Number(r.meter1 || 0), m2: Number(r.meter2 || 0), m3: Number(r.meter3 || 0) }
                    })

                const shellMap: Record<string, number> = {}
                    ; (shellKpiRaw || []).forEach((r: any) => {
                        shellMap[r.work_date] = Number(r.electricity_meter_reading || 0)
                    })

                // Helper: find closest available reading on or before a given date
                const findReading = (map: Record<string, any>, dateStr: string) => {
                    if (map[dateStr]) return map[dateStr]
                    // Walk back up to 5 days
                    for (let d = 1; d <= 5; d++) {
                        const prev = format(subDays(new Date(dateStr), d), 'yyyy-MM-dd')
                        if (map[prev] !== undefined) return map[prev]
                    }
                    return null
                }

                // Aggregate per month
                const trendPoints = months.map(m => {
                    // Factory electricity: sum all days in month
                    let factoryKwh = 0
                    let woodKg = 0
                    const dates = Object.keys(energyMap).filter(d => d >= m.start && d <= m.end)
                    dates.forEach(d => {
                        factoryKwh += energyMap[d].kwh
                        woodKg += energyMap[d].wood
                    })

                    // Compressor: last reading in month minus last reading of prev month
                    const compEnd = findReading(compMap, m.end)
                    const compPrev = findReading(compMap, m.prevEnd)
                    let compKwh = 0
                    if (compEnd && compPrev) {
                        compKwh = Math.max(0,
                            ((compEnd.m1 - compPrev.m1) + (compEnd.m2 - compPrev.m2) + (compEnd.m3 - compPrev.m3)) * 1000
                        )
                    }

                    // Shelling: last reading in month minus last reading of prev month
                    const shellEnd = findReading(shellMap, m.end)
                    const shellPrev = findReading(shellMap, m.prevEnd)
                    let shellingKwh = 0
                    if (shellEnd !== null && shellPrev !== null) {
                        shellingKwh = Math.max(0, (shellEnd as number) - (shellPrev as number))
                    }

                    return {
                        label: m.label,
                        factoryKwh: Math.round(factoryKwh),
                        compKwh: Math.round(compKwh),
                        shellingKwh: Math.round(shellingKwh),
                        woodTons: Math.round((woodKg / 1000) * 10) / 10,  // kg → Tons, 1 decimal
                    }
                }).filter(m => m.factoryKwh > 0 || m.compKwh > 0 || m.shellingKwh > 0 || m.woodTons > 0)

                setSeuTrend(trendPoints)
            } catch (e) {
                console.error('SEU trend fetch error:', e)
            } finally {
                setSeuLoading(false)
            }
        }
        fetchSeuTrend()
    }, [supabase]) // runs once on mount
    // ─────────────────────────────────────────────────────────────────────────

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white/90 backdrop-blur-md border border-slate-200/60 rounded-xl shadow-xl p-4 text-sm z-50 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200">
                    <p className="font-bold text-slate-800 mb-3 text-xs uppercase tracking-wider border-b pb-2">{label}</p>
                    <div className="space-y-2">
                        {payload.map((entry: any, index: number) => (
                            <div key={index} className="flex items-center justify-between gap-6">
                                <span className="flex items-center gap-2 text-slate-600 font-medium text-xs">
                                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: entry.color || entry.fill }}></div>
                                    <span className="font-semibold text-slate-700">{entry.name}</span>
                                </span>
                                <span className="font-mono font-black text-slate-800">
                                    {Number(entry.value).toLocaleString('en-US')} {entry.name.includes('đ') || entry.name.includes('VNĐ') ? 'VND' : (entry.name.includes('%') ? '%' : 'kWh')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )
        }
        return null
    }

    const CustomTreemapContent = (props: any) => {
        const { x, y, width, height, name, value, fill } = props;
        if (width < 40 || height < 40) return null;
        return (
            <g>
                <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#ffffff" strokeWidth={3} rx={8} ry={8} style={{ filter: "drop-shadow(0px 4px 6px rgba(0,0,0,0.1))", cursor: "pointer" }} className="hover:opacity-90 transition-opacity" />
                <text x={x + 12} y={y + 24} fill="#ffffff" fontSize={14} fontWeight={800} style={{ textShadow: "0px 2px 4px rgba(0,0,0,0.6)" }}>
                    {name}
                </text>
                <text x={x + 12} y={y + 42} fill="#ffffff" fontSize={13} fontWeight={600} style={{ textShadow: "0px 1px 3px rgba(0,0,0,0.6)" }}>
                    {Number(value).toLocaleString('en-US')} kWh
                </text>
            </g>
        );
    }

    return (
        <div className="flex-1 space-y-4 md:space-y-8 max-w-7xl mx-auto w-full pb-10 relative z-0">
            {/* Premium Ambient Background */}
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-50/30 via-white to-slate-50/60 pointer-events-none -z-10"></div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-sm bg-white/40 p-4 rounded-2xl border border-white/60 shadow-sm sticky top-2 z-40">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3 bg-clip-text text-transparent bg-gradient-to-r from-red-600 to-[#e63121]">
                        <div className="p-2 bg-red-50 rounded-xl shadow-inner ring-1 ring-red-200/50">
                            <Zap className="h-6 w-6 md:h-8 md:w-8 text-[#e63121] drop-shadow-sm" />
                        </div>
                        Energy
                    </h2>
                    <p className="text-muted-foreground text-xs md:text-sm mt-1.5 font-medium ml-1">
                        Factory-wide energy monitoring and control center
                    </p>
                </div>

                {/* Month Selector */}
                <div className="flex items-center gap-1 bg-white/80 border border-slate-200/60 rounded-xl p-1 shadow-sm backdrop-blur-md">
                    <Button variant="ghost" size="icon" onClick={goToPreviousMonth} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center justify-center min-w-[150px] font-bold text-sm text-slate-800">
                        <CalendarIcon className="mr-2 h-4 w-4 text-[#e63121]" />
                        {format(currentMonth, "MMMM - yyyy")}
                    </div>
                    <Button variant="ghost" size="icon" onClick={goToNextMonth} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors" disabled={currentMonth >= startOfMonth(new Date())}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Tabs defaultValue={defaultTab} className="space-y-4">
                <TabsList className="bg-white/60 backdrop-blur-md border border-slate-200/60 shadow-sm rounded-xl p-1 w-full justify-start h-auto flex flex-wrap gap-1">
                    <TabsTrigger value="energy_dashboard" className="data-[state=active]:bg-[#e63121] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg px-4 py-2 font-semibold transition-all">
                        <Zap className="h-4 w-4 mr-2" /> Energy Dashboard
                    </TabsTrigger>

                    <TabsTrigger value="water" className="data-[state=active]:bg-sky-500 data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg px-4 py-2 font-semibold transition-all">
                        <Droplets className="h-4 w-4 mr-2" /> Nước
                    </TabsTrigger>

                    <TabsTrigger value="iso50001" className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg px-4 py-2 font-semibold transition-all">
                        <ShieldCheck className="h-4 w-4 mr-2" /> ISO 50001 EnMS
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="energy_dashboard" className="m-0 space-y-4">
                    {isLoading && energyData.length > 0 && (
                        <div className="absolute inset-0 z-50 flex items-start justify-center pt-8 bg-white/10 backdrop-blur-[1px] rounded-xl pointer-events-none">
                            <div className="flex items-center gap-3 bg-white/90 px-4 py-2 rounded-full shadow-lg border border-red-100">
                                <Loader2 className="h-5 w-5 animate-spin text-[#e63121]" />
                                <span className="text-sm font-semibold text-slate-700 animate-pulse">Đang tải dữ liệu...</span>
                            </div>
                        </div>
                    )}

                    {energyData.length === 0 && isLoading ? (
                        <div className="flex flex-col justify-center items-center h-[500px] gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-[#e63121]" />
                            <p className="text-muted-foreground font-medium animate-pulse">Loading energy data...</p>
                        </div>
                    ) : (
                        <div className={`grid gap-6 md:grid-cols-2 lg:grid-cols-2 transition-all duration-300 relative ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>

                            {/* COMBINED ENERGY & COST CHART */}
                            <Card className="col-span-2 shadow-xl shadow-red-900/5 hover:shadow-2xl transition-all duration-500 border-white/60 bg-white/70 backdrop-blur-xl overflow-hidden relative group">
                                <div className="absolute inset-0 bg-gradient-to-br from-red-100/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                                <CardHeader className="pb-4 border-b border-slate-200/50 bg-white/40 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <CardTitle className="text-xl font-bold flex flex-row items-center gap-2 text-slate-800">
                                            <div className="w-2.5 h-2.5 rounded-full bg-[#e63121]"></div>
                                            {language === 'vi' ? 'Điện năng Toàn Khu vực Chế biến' : 'Factory-wide Energy (Main)'}
                                        </CardTitle>
                                        <CardDescription className="text-slate-500 font-medium mt-1 ml-4 text-xs">
                                            {language === 'vi' ? 'Tiêu thụ / Chi phí thực tế (Theo tháng)' : 'Electricity Consumption / Actual Cost (MTD)'}
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center bg-slate-100/80 p-1 rounded-xl shadow-inner border border-slate-200/50">
                                        <button
                                            onClick={() => setMainChartMode('kwh')}
                                            className={`px-5 py-2 text-xs font-bold rounded-lg transition-all duration-300 ${mainChartMode === 'kwh' ? 'bg-white shadow-md text-[#e63121] scale-105' : 'text-slate-500 hover:text-slate-700'}`}>
                                            Consumption (kWh)
                                        </button>
                                        <button
                                            onClick={() => setMainChartMode('vnd')}
                                            className={`px-5 py-2 text-xs font-bold rounded-lg transition-all duration-300 ${mainChartMode === 'vnd' ? 'bg-white shadow-md text-amber-600 scale-105' : 'text-slate-500 hover:text-slate-700'}`}>
                                            Cost (VND)
                                        </button>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-6 relative z-10">
                                    {(() => {
                                        const mtdPeakKwh = energyData.reduce((acc, curr) => acc + (curr.stacked_peak || 0), 0);
                                        const mtdNormalKwh = energyData.reduce((acc, curr) => acc + (curr.stacked_normal || 0), 0);
                                        const mtdOffpeakKwh = energyData.reduce((acc, curr) => acc + (curr.stacked_offpeak || 0), 0);
                                        const fallbackKwh = energyData.reduce((acc, curr) => acc + (curr.fallback_kwh || 0), 0);
                                        const mtdTotalKwh = mtdPeakKwh + mtdNormalKwh + mtdOffpeakKwh + fallbackKwh;

                                        const mtdPeakVnd = energyData.reduce((acc, curr) => acc + (curr.cost_peak || 0), 0);
                                        const mtdNormalVnd = energyData.reduce((acc, curr) => acc + (curr.cost_normal || 0), 0);
                                        const mtdOffpeakVnd = energyData.reduce((acc, curr) => acc + (curr.cost_offpeak || 0), 0);
                                        const fallbackVnd = energyData.reduce((acc, curr) => acc + (curr.fallback_cost || 0), 0);
                                        const mtdTotalVnd = mtdPeakVnd + mtdNormalVnd + mtdOffpeakVnd + fallbackVnd;

                                        const isKwh = mainChartMode === 'kwh';

                                        return (
                                            <div className="flex flex-col lg:flex-row gap-8">
                                                {/* SUMMARY METRICS (LEFT) - kWh + VND cùng lúc */}
                                                <div className="w-full lg:w-[300px] flex flex-col gap-3 shrink-0">
                                                    {/* kWh Card */}
                                                    <div className="p-4 rounded-2xl border bg-gradient-to-br from-red-50 to-rose-50/30 border-red-200/60 shadow-sm relative overflow-hidden">
                                                        <div className="absolute -right-6 -top-6 w-16 h-16 rounded-full blur-2xl opacity-40 bg-[#e63121]"></div>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 relative z-10">{language === 'vi' ? 'Tổng MTD (kWh)' : 'TOTAL MTD (kWh)'}</p>
                                                        <p className="text-3xl font-black tracking-tight relative z-10 flex items-baseline gap-1 text-[#e63121]">
                                                            {mtdTotalKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                                            <span className="text-sm font-bold text-slate-400 opacity-60 ml-1">kWh</span>
                                                        </p>
                                                    </div>
                                                    {/* VND Card */}
                                                    <div className="p-4 rounded-2xl border bg-gradient-to-br from-amber-50 to-orange-50/30 border-amber-200/60 shadow-sm relative overflow-hidden">
                                                        <div className="absolute -right-6 -top-6 w-16 h-16 rounded-full blur-2xl opacity-40 bg-amber-400"></div>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 relative z-10">{language === 'vi' ? 'Tổng MTD (VND)' : 'TOTAL MTD (VND)'}</p>
                                                        <p className="text-3xl font-black tracking-tight relative z-10 flex items-baseline gap-1 text-amber-600">
                                                            {mtdTotalVnd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                                            <span className="text-sm font-bold text-slate-400 opacity-60 ml-1">VND</span>
                                                        </p>
                                                    </div>
                                                    {/* Breakdown cả 2 cột kWh và VND */}
                                                    <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-md overflow-hidden text-xs shadow-sm ring-1 ring-black/5">
                                                        <div className="grid grid-cols-4 bg-slate-50/80 px-3 py-2 border-b border-slate-100">
                                                            <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">Giờ</span>
                                                            <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider text-right">kWh</span>
                                                            <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider text-right">VND</span>
                                                            <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider text-right">%</span>
                                                        </div>
                                                        <div className="grid grid-cols-4 px-3 py-2.5 items-center hover:bg-rose-50/50 transition-colors border-b border-slate-100">
                                                            <span className="font-bold text-slate-700 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></div>Peak</span>
                                                            <span className="font-mono font-bold text-slate-800 text-right">{mtdPeakKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                                            <span className="font-mono font-bold text-rose-600 text-right">{(mtdPeakVnd / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M</span>
                                                            <span className="font-mono font-bold text-rose-500 text-right">{mtdTotalKwh > 0 ? ((mtdPeakKwh / mtdTotalKwh) * 100).toFixed(1) : '0.0'}%</span>
                                                        </div>
                                                        <div className="grid grid-cols-4 px-3 py-2.5 items-center hover:bg-blue-50/50 transition-colors border-b border-slate-100">
                                                            <span className="font-bold text-slate-700 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></div>Normal</span>
                                                            <span className="font-mono font-bold text-slate-800 text-right">{mtdNormalKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                                            <span className="font-mono font-bold text-blue-600 text-right">{(mtdNormalVnd / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M</span>
                                                            <span className="font-mono font-bold text-blue-500 text-right">{mtdTotalKwh > 0 ? ((mtdNormalKwh / mtdTotalKwh) * 100).toFixed(1) : '0.0'}%</span>
                                                        </div>
                                                        <div className="grid grid-cols-4 px-3 py-2.5 items-center hover:bg-emerald-50/50 transition-colors">
                                                            <span className="font-bold text-slate-700 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>Off-pk</span>
                                                            <span className="font-mono font-bold text-slate-800 text-right">{mtdOffpeakKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                                            <span className="font-mono font-bold text-emerald-600 text-right">{(mtdOffpeakVnd / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M</span>
                                                            <span className="font-mono font-bold text-emerald-500 text-right">{mtdTotalKwh > 0 ? ((mtdOffpeakKwh / mtdTotalKwh) * 100).toFixed(1) : '0.0'}%</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* CHART (RIGHT) */}
                                                <div className="w-full lg:w-3/4 h-[350px] lg:h-[400px] shrink-0 lg:shrink bg-white/40 rounded-2xl p-4 md:p-6 border border-slate-100 shadow-inner">
                                                    {energyData.length === 0 ? (
                                                        <div className="h-full flex items-center justify-center text-slate-400 font-medium">No data for this month</div>
                                                    ) : (
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            {isKwh ? (
                                                                <ComposedChart data={energyData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                                                    <defs>
                                                                        <linearGradient id="colorOffpeak" x1="0" y1="0" x2="0" y2="1">
                                                                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.9} />
                                                                            <stop offset="95%" stopColor="#10B981" stopOpacity={0.6} />
                                                                        </linearGradient>
                                                                        <linearGradient id="colorNormal" x1="0" y1="0" x2="0" y2="1">
                                                                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.9} />
                                                                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.6} />
                                                                        </linearGradient>
                                                                        <linearGradient id="colorPeak" x1="0" y1="0" x2="0" y2="1">
                                                                            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.9} />
                                                                            <stop offset="95%" stopColor="#EF4444" stopOpacity={0.6} />
                                                                        </linearGradient>
                                                                    </defs>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                                    <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} dy={10} />
                                                                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickFormatter={(val) => val.toLocaleString('en-US')} dx={-10} />
                                                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} />
                                                                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600, color: '#334155' }} iconType="circle" />
                                                                    <Bar dataKey="stacked_offpeak" name="Off-peak" fill="url(#colorOffpeak)" stackId="energy" maxBarSize={45} />
                                                                    <Bar dataKey="stacked_normal" name="Normal" fill="url(#colorNormal)" stackId="energy" maxBarSize={45} />
                                                                    <Bar dataKey="stacked_peak" name="Peak" fill="url(#colorPeak)" stackId="energy" radius={[6, 6, 0, 0]} maxBarSize={45} />
                                                                    <Line type="monotone" dataKey="electricity_target_kwh" name="Target" stroke="#F59E0B" strokeWidth={3} dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: '#F59E0B' }} />
                                                                </ComposedChart>
                                                            ) : (
                                                                <BarChart data={energyData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                                    <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} dy={10} />
                                                                    <YAxis
                                                                        tickLine={false}
                                                                        axisLine={false}
                                                                        tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                                                                        tickFormatter={(val) => new Intl.NumberFormat('vi-VN', { notation: "compact" }).format(val)}
                                                                        width={55}
                                                                        dx={-10}
                                                                    />
                                                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} />
                                                                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600, color: '#334155' }} iconType="circle" />
                                                                    <Bar dataKey="cost_offpeak" stackId="cost" name="Off-peak (1,190 VND)" fill="#10B981" maxBarSize={45} />
                                                                    <Bar dataKey="cost_normal" stackId="cost" name="Normal (1,833 VND)" fill="#3B82F6" maxBarSize={45} />
                                                                    <Bar dataKey="cost_peak" stackId="cost" name="Peak (3,398 VND)" fill="#EF4444" radius={[6, 6, 0, 0]} maxBarSize={45} />
                                                                </BarChart>
                                                            )}
                                                        </ResponsiveContainer>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </CardContent>
                            </Card>

                            {/* MTD PIE CHARTS - kWh (trái) và VND (phải), luôn hiển thị cả 2 */}
                            {(() => {
                                const kwhPeakMtd = energyData.reduce((acc, curr) => acc + (curr.stacked_peak || 0), 0);
                                const kwhNormalMtd = energyData.reduce((acc, curr) => acc + (curr.stacked_normal || 0), 0);
                                const kwhOffpeakMtd = energyData.reduce((acc, curr) => acc + (curr.stacked_offpeak || 0), 0);
                                const vndPeakMtd = energyData.reduce((acc, curr) => acc + (curr.cost_peak || 0), 0);
                                const vndNormalMtd = energyData.reduce((acc, curr) => acc + (curr.cost_normal || 0), 0);
                                const vndOffpeakMtd = energyData.reduce((acc, curr) => acc + (curr.cost_offpeak || 0), 0);
                                const kwhTotal = kwhPeakMtd + kwhNormalMtd + kwhOffpeakMtd;
                                const vndTotal = vndPeakMtd + vndNormalMtd + vndOffpeakMtd;
                                const kwhPieData = [
                                    { name: language === 'vi' ? 'Thấp điểm' : 'Off-peak', value: kwhOffpeakMtd, fill: '#10B981' },
                                    { name: language === 'vi' ? 'Bình thường' : 'Normal', value: kwhNormalMtd, fill: '#3B82F6' },
                                    { name: language === 'vi' ? 'Cao điểm' : 'Peak', value: kwhPeakMtd, fill: '#EF4444' },
                                ].filter(d => d.value > 0);
                                const vndPieData = [
                                    { name: language === 'vi' ? 'Thấp điểm' : 'Off-peak', value: vndOffpeakMtd, fill: '#10B981' },
                                    { name: language === 'vi' ? 'Bình thường' : 'Normal', value: vndNormalMtd, fill: '#3B82F6' },
                                    { name: language === 'vi' ? 'Cao điểm' : 'Peak', value: vndPeakMtd, fill: '#EF4444' },
                                ].filter(d => d.value > 0);

                                const MiniPie = ({ data, total }: { data: typeof kwhPieData; total: number }) => (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={data} cx="50%" cy="50%" innerRadius={65} outerRadius={110} paddingAngle={4} dataKey="value" stroke="none"
                                                label={({ payload, percent }) => `${payload.name} (${((percent || 0) * 100).toFixed(1)}%)`}
                                                labelLine={{ stroke: '#94A3B8', strokeWidth: 1.5 }}>
                                                {data.map((entry, i) => <Cell key={i} fill={entry.fill} className="hover:opacity-80 transition-opacity" />)}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                );

                                return (<>
                                    <Card className="col-span-2 lg:col-span-1 shadow-lg shadow-blue-900/5 bg-white/70 backdrop-blur-xl border-white/60 hover:shadow-xl transition-shadow duration-300">
                                        <CardHeader className="bg-white/40 border-b border-slate-200/50 rounded-t-xl px-6 py-5">
                                            <CardTitle className="text-lg font-bold text-slate-800">{language === 'vi' ? 'Cơ cấu tiêu thụ MTD (kWh)' : 'MTD Consumption Structure (kWh)'}</CardTitle>
                                            <CardDescription className="font-medium text-xs mt-1">{language === 'vi' ? 'Tỉ trọng kWh theo khung giờ' : 'kWh share by time-of-use slot'}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="h-[340px] pt-6 relative">
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-50/30 to-transparent pointer-events-none"></div>
                                            {kwhTotal === 0 ? <div className="h-full flex items-center justify-center text-slate-400 font-medium">No data</div> : <MiniPie data={kwhPieData} total={kwhTotal} />}
                                        </CardContent>
                                    </Card>
                                    <Card className="col-span-2 lg:col-span-1 shadow-lg shadow-amber-900/5 bg-white/70 backdrop-blur-xl border-white/60 hover:shadow-xl transition-shadow duration-300">
                                        <CardHeader className="bg-white/40 border-b border-slate-200/50 rounded-t-xl px-6 py-5">
                                            <CardTitle className="text-lg font-bold text-slate-800">{language === 'vi' ? 'Cơ cấu Chi phí MTD (VND)' : 'MTD Cost Structure (VND)'}</CardTitle>
                                            <CardDescription className="font-medium text-xs mt-1">{language === 'vi' ? 'Tỉ trọng tiền điện theo khung giờ' : 'Cost share by time-of-use slot'}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="h-[340px] pt-6 relative">
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-50/30 to-transparent pointer-events-none"></div>
                                            {vndTotal === 0 ? <div className="h-full flex items-center justify-center text-slate-400 font-medium">No data</div> : <MiniPie data={vndPieData} total={vndTotal} />}
                                        </CardContent>
                                    </Card>
                                </>);
                            })()}

                            {/* DEPARTMENT BREAKDOWN STACKED BAR */}
                            {(() => {
                                const compMap: Record<string, number> = {}
                                compressorData.forEach((d: any) => { compMap[d.work_date] = Math.round((d.meter1 || 0) + (d.meter2 || 0) + (d.meter3 || 0)) })
                                const shellMap: Record<string, number> = {}
                                shellingData.forEach((d: any) => { shellMap[d.work_date] = Math.round(d.energy_kwh || 0) })
                                const otherMap: Record<string, any> = {}
                                otherElecData.forEach((d: any) => { otherMap[d.work_date] = d })

                                const allDates = Array.from(new Set([
                                    ...compressorData.map((d: any) => d.work_date),
                                    ...shellingData.map((d: any) => d.work_date),
                                    ...otherElecData.map((d: any) => d.work_date)
                                ])).sort()

                                if (allDates.length === 0) return null;

                                const breakdownData = allDates.map(date => {
                                    const oth = otherMap[date] || {}
                                    return {
                                        fmtDate: format(new Date(date), 'dd/MM'),
                                        work_date: date,
                                        compressor: compMap[date] || 0,
                                        shelling: shellMap[date] || 0,
                                        cooling_fan: Math.round(oth.cooling_fan || 0),
                                        boiler: Math.round(oth.boiler || 0),
                                        office: Math.round(oth.office || 0),
                                        canteen: Math.round(oth.canteen || 0),
                                        db_ac_hca: Math.round(oth.db_ac_hca || 0),
                                        eco2: Math.round(oth.eco2 || 0),
                                        maint: Math.round(oth.maintenance || 0),
                                    }
                                })

                                const SEGMENTS = [
                                    { key: 'compressor', name: 'Air Compressor', color: '#8B5CF6' },
                                    { key: 'shelling', name: 'Shelling', color: '#F97316' },
                                    { key: 'cooling_fan', name: 'Cooling Fan', color: '#38BDF8' },
                                    { key: 'boiler', name: 'Boiler', color: '#EAB308' },
                                    { key: 'db_ac_hca', name: 'DB AC HCA', color: '#3B82F6' },
                                    { key: 'eco2', name: 'ECO2', color: '#10B981' },
                                    { key: 'office', name: 'Office', color: '#64748B' },
                                    { key: 'canteen', name: 'Canteen', color: '#F43F5E' },
                                    { key: 'maint', name: 'Maint. Meter', color: '#06B6D4' },
                                ]

                                const treemapData = SEGMENTS.map(s => {
                                    const total = breakdownData.reduce((sum, d) => sum + ((d as any)[s.key] as number || 0), 0);
                                    return { name: s.name, size: total > 0 ? total : 0, fill: s.color, fillOpacity: 0.9 };
                                }).filter(d => d.size > 0).sort((a, b) => b.size - a.size);

                                return (
                                    <Card className="col-span-2 lg:col-span-1 shadow-lg shadow-blue-900/5 bg-white/70 backdrop-blur-xl border-white/60 hover:shadow-xl transition-shadow duration-300">
                                        <CardHeader className="bg-white/40 border-b border-slate-200/50 rounded-t-xl px-6 py-5">
                                            <CardTitle className="text-lg font-bold text-slate-800">{language === 'vi' ? 'Phân bổ Điện năng Phụ trợ (MTD)' : 'Auxiliary Area Distribution (MTD)'}</CardTitle>
                                            <CardDescription className="font-medium text-xs mt-1">{language === 'vi' ? 'Dấu chân năng lượng theo từng khu vực phụ trợ' : 'Monthly energy footprint by auxiliary departments'}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="h-[380px] p-4">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <Treemap
                                                    data={treemapData}
                                                    dataKey="size"
                                                    stroke="#fff"
                                                    aspectRatio={4 / 3}
                                                    content={<CustomTreemapContent />}
                                                >
                                                    <Tooltip formatter={(value: number | string | undefined) => [`${Number(value || 0).toLocaleString('en-US')} kWh`, 'Consumption']} />
                                                </Treemap>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                )
                            })()}


                            <Card className="col-span-2 shadow-xl shadow-slate-900/5 bg-white/70 backdrop-blur-xl border-white/60 hover:shadow-2xl transition-shadow duration-500">
                                <CardHeader className="bg-white/40 border-b border-slate-200/50 rounded-t-xl px-6 py-5">
                                    <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
                                        <div className="w-3.5 h-3.5 rounded-full bg-purple-500 shadow-sm shadow-purple-200"></div>
                                        {language === 'vi' ? 'Hệ Thống Máy Nén Khí' : 'Air Compressors System'}
                                    </CardTitle>
                                    <CardDescription className="font-medium text-xs mt-1 ml-6">{language === 'vi' ? 'Biến động tiêu thụ điện 3 Cụm MNK (kWh/ngày)' : 'Daily electricity consumption of 3 Compressor clusters (kWh/day)'}</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[400px] pt-8 bg-gradient-to-t from-purple-50/20 to-transparent">
                                    {compressorData.length === 0 ? (
                                        <div className="h-full flex items-center justify-center text-slate-400 font-medium">No data for this month</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={compressorData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorMnk1" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.6} />
                                                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.05} />
                                                    </linearGradient>
                                                    <linearGradient id="colorMnk2" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#EC4899" stopOpacity={0.6} />
                                                        <stop offset="95%" stopColor="#EC4899" stopOpacity={0.05} />
                                                    </linearGradient>
                                                    <linearGradient id="colorMnk3" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.6} />
                                                        <stop offset="95%" stopColor="#14B8A6" stopOpacity={0.05} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} dy={10} />
                                                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickFormatter={(val) => val.toLocaleString('en-US')} dx={-10} />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px', fontWeight: 600, color: '#334155' }} iconType="circle" />
                                                <Area type="monotone" dataKey="meter1" name="Compressor #1" stroke="#8B5CF6" fillOpacity={1} fill="url(#colorMnk1)" strokeWidth={3} activeDot={{ r: 6, strokeWidth: 0, fill: '#8B5CF6' }} />
                                                <Area type="monotone" dataKey="meter2" name="Compressor #2,4" stroke="#EC4899" fillOpacity={1} fill="url(#colorMnk2)" strokeWidth={3} activeDot={{ r: 6, strokeWidth: 0, fill: '#EC4899' }} />
                                                <Area type="monotone" dataKey="meter3" name="Compressor #3,5,6" stroke="#14B8A6" fillOpacity={1} fill="url(#colorMnk3)" strokeWidth={3} activeDot={{ r: 6, strokeWidth: 0, fill: '#14B8A6' }} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>

                            {/* SHELLING ENERGY */}
                            <Card className="col-span-2 lg:col-span-2 shadow-xl shadow-slate-900/5 bg-white/70 backdrop-blur-xl border-white/60 hover:shadow-2xl transition-shadow duration-500">
                                <CardHeader className="bg-white/40 border-b border-slate-200/50 rounded-t-xl px-6 py-5">
                                    <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
                                        <div className="w-3.5 h-3.5 rounded-full bg-slate-600 shadow-sm"></div>
                                        {language === 'vi' ? 'Điện Khu Vực Shelling' : 'Shelling Area Electricity'}
                                    </CardTitle>
                                    <CardDescription className="font-medium text-xs mt-1 ml-6">{language === 'vi' ? 'Chỉ số tiêu thụ điện hệ thống cắt tách (kWh/ngày)' : 'Daily electricity consumption of shelling system (kWh/day)'}</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[380px] pt-8 bg-gradient-to-t from-slate-50/20 to-transparent">
                                    {shellingData.length === 0 ? (
                                        <div className="h-full flex items-center justify-center text-slate-400 font-medium">Chưa có dữ liệu tháng này</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={shellingData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorShelling" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                                                        <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} dy={10} />
                                                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickFormatter={(val) => val.toLocaleString('en-US')} dx={-10} />
                                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }} />
                                                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px', fontWeight: 600, color: '#334155' }} iconType="circle" />
                                                <Bar dataKey="energy_kwh" name="Shelling Energy (kWh)" fill="url(#colorShelling)" radius={[6, 6, 0, 0]} maxBarSize={60} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>

                            {/* OTHER ELECTRICITY GRID */}
                            <Card className="col-span-2 shadow-xl shadow-slate-900/5 bg-white/70 backdrop-blur-xl border-slate-200/50 border overflow-hidden">
                                <CardHeader className="bg-white/80 border-b border-slate-200/50 rounded-t-xl px-6 py-5 backdrop-blur-md">
                                    <CardTitle className="text-lg font-bold text-slate-800">{language === 'vi' ? 'Điện Phụ Trợ (Đồng hồ phụ)' : 'Auxiliary Electricity (Sub-meters)'}</CardTitle>
                                    <CardDescription className="text-slate-500 font-medium mt-1">{language === 'vi' ? 'Theo dõi mức tiêu thụ của hệ thống phụ trợ (kWh/ngày)' : 'Detailed monitoring of auxiliary devices/areas (kWh/day)'}</CardDescription>
                                </CardHeader>
                                <CardContent className="pt-6 bg-slate-50/30">
                                    {otherElecData.length === 0 ? (
                                        <div className="h-64 flex items-center justify-center text-slate-400 font-medium">No data for this month</div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            {[
                                                { key: 'cooling_fan', name: 'Cooling Fan', color: '#F97316' },
                                                { key: 'boiler', name: 'Boiler', color: '#EAB308' },
                                                { key: 'office', name: 'Office', color: '#3B82F6' },
                                                { key: 'db_ac_hca', name: 'DB-AC HCA', color: '#8B5CF6' },
                                                { key: 'eco2', name: 'ECO2', color: '#10B981' },
                                                { key: 'canteen', name: 'Canteen', color: '#F43F5E' },
                                                { key: 'transformer', name: 'Transformer', color: '#64748B' },
                                                { key: 'maintenance', name: 'Maintenance', color: '#06B6D4' }
                                            ].map(meter => (
                                                <div key={meter.key} className="border border-slate-200/80 rounded-2xl p-4 bg-white shadow-sm hover:shadow-lg transition-all duration-300 h-[240px] flex flex-col group relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: meter.color }}></div>
                                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300" style={{ backgroundColor: meter.color }}></div>
                                                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4 relative z-10">
                                                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: meter.color }}></div>
                                                        {meter.name}
                                                    </h4>
                                                    <div className="flex-1 w-full relative z-10">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <AreaChart data={otherElecData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                                <defs>
                                                                    <linearGradient id={`gradient-${meter.key}`} x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="5%" stopColor={meter.color} stopOpacity={0.4} />
                                                                        <stop offset="95%" stopColor={meter.color} stopOpacity={0} />
                                                                    </linearGradient>
                                                                </defs>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                                                <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#94A3B8', fontWeight: 500 }} />
                                                                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#94A3B8', fontWeight: 500 }} tickFormatter={(val) => new Intl.NumberFormat('en-US', { notation: "compact" }).format(val)} />
                                                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: meter.color, strokeWidth: 1, strokeDasharray: '3 3' }} />
                                                                <Area type="monotone" dataKey={meter.key} name={meter.name} stroke={meter.color} fill={`url(#gradient-${meter.key})`} strokeWidth={2.5} activeDot={{ r: 5, strokeWidth: 0, fill: meter.color }} />
                                                            </AreaChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                        </div>
                    )}
                </TabsContent>

                <TabsContent value="water" className="m-0 mt-4">
                    <div className="flex flex-col space-y-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur-sm bg-white/40 p-4 rounded-2xl border border-white/60 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-sky-50 rounded-xl shadow-inner ring-1 ring-sky-200/50">
                                    <Droplets className="h-6 w-6 text-sky-500 drop-shadow-sm" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black tracking-tight text-sky-600">Theo dõi Nước</h3>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">Nhập &amp; xem chỉ số đồng hồ nước hàng ngày</p>
                                </div>
                            </div>
                        </div>
                        <WaterTracker userRole={userRole} />
                    </div>
                </TabsContent>

                <TabsContent value="iso50001" className="m-0 mt-4">
                    <ISO50001Content userRole={userRole} userEmail={userEmail} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
