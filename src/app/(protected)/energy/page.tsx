"use client"

import { useState, useEffect } from "react"
import { format, startOfMonth, endOfMonth, subMonths, addMonths, subDays, differenceInDays } from "date-fns"
import { vi } from "date-fns/locale"
import { CalendarIcon, ChevronLeft, ChevronRight, Zap, Loader2 } from "lucide-react"
import {
    AreaChart, Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, ReferenceLine, PieChart, Pie
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"


export default function EnergyDashboardPage() {
    const supabase = createClient()
    const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
    const [isLoading, setIsLoading] = useState(true)

    // Data States
    const [energyData, setEnergyData] = useState<any[]>([])
    const [mainChartMode, setMainChartMode] = useState<'kwh' | 'vnd'>('kwh')
    const [compressorData, setCompressorData] = useState<any[]>([])
    const [otherElecData, setOtherElecData] = useState<any[]>([])
    const [shellingData, setShellingData] = useState<any[]>([])

    const goToPreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1))
    const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1))

    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true)
            const startDateStr = format(startOfMonth(currentMonth), "yyyy-MM-dd")
            const endDateStr = format(endOfMonth(currentMonth), "yyyy-MM-dd")
            
            // Fetch starting 1 day earlier to compute daily consumption (deltas)
            const fetchStartStr = format(subDays(startOfMonth(currentMonth), 1), "yyyy-MM-dd")

            try {
                // 1. Fetch Main Energy (Factory Total) - already in daily consumption
                const { data: energy } = await supabase
                    .from("daily_energy")
                    .select("*")
                    .gte("work_date", fetchStartStr) // Changed to fetch 1 day earlier to compute deltas
                    .lte("work_date", endDateStr)
                    .order("work_date", { ascending: true })

                // 2. Fetch Compressors (MNK) - Raw Meter Index
                const { data: compressorsRaw } = await supabase
                    .from("daily_compressor")
                    .select("*")
                    .gte("work_date", fetchStartStr)
                    .lte("work_date", endDateStr)
                    .order("work_date", { ascending: true })

                // 3. Fetch Other Electricity (8 meters) - Raw Meter Index
                const { data: othersRaw } = await supabase
                    .from("daily_electricity_others")
                    .select("*")
                    .gte("work_date", fetchStartStr)
                    .lte("work_date", endDateStr)
                    .order("work_date", { ascending: true })

                // 4. Fetch Shelling KPIs (Shelling Energy) - Need to fetch Dept ID first
                const { data: shellDept } = await supabase.from("departments").select("id").eq("code", "SHELL").single()
                let shelling: any[] = []
                if (shellDept) {
                    const { data: shellingRaw } = await supabase
                        .from("daily_kpi")
                        .select("work_date, electricity_meter_reading")
                        .eq("department_id", shellDept.id)
                        .gte("work_date", fetchStartStr)
                        .lte("work_date", endDateStr)
                        .order("work_date", { ascending: true })
                    shelling = shellingRaw || []
                }

                // Compute Deltas
                const computeDeltas = (rawData: any[], multiplier = 1, startDate: string) => {
                    if (!rawData || rawData.length === 0) return []
                    let result = []
                    for (let i = 1; i < rawData.length; i++) {
                        const prev = rawData[i - 1]
                        const curr = rawData[i]
                        const diffDays = differenceInDays(new Date(curr.work_date), new Date(prev.work_date)) || 1
                        
                        let mapped: any = { work_date: curr.work_date, fmtDate: format(new Date(curr.work_date), "dd/MM") }
                        
                        Object.keys(curr).forEach(k => {
                            if (k !== 'work_date' && k !== 'id' && k !== 'created_at' && k !== 'updated_at' && typeof curr[k] === 'number') {
                                if (curr[k] !== null && prev[k] !== null && curr[k] !== undefined && prev[k] !== undefined) {
                                    mapped[k] = Math.max(0, (curr[k] - prev[k]) / diffDays) * multiplier
                                } else {
                                    mapped[k] = 0
                                }
                            }
                        })
                        if (curr.work_date >= startDate) {
                            result.push(mapped)
                        }
                    }
                    return result
                }

                const compDeltas = computeDeltas(compressorsRaw || [], 1000, startDateStr) // MNK index is MWh, graph in kWh
                const othersDeltas = computeDeltas(othersRaw || [], 1, startDateStr)       // Others index is exactly kWh
                
                // Shelling delta
                const shellDeltasExtracted = computeDeltas(shelling, 1, startDateStr)
                const shellMapped = shellDeltasExtracted.map(d => ({ ...d, energy_kwh: d.electricity_meter_reading }))

                // Pre-process energy to compute kWh from meter readings if missing
                const processedEnergy = [...(energy || [])];
                for (let i = 1; i < processedEnergy.length; i++) {
                    const curr = processedEnergy[i];
                    const prev = processedEnergy[i - 1];
                    const diffDays = differenceInDays(new Date(curr.work_date), new Date(prev.work_date)) || 1;
                    
                    if (!curr.electricity_peak_kwh && curr.meter_peak && prev.meter_peak) {
                        curr.electricity_peak_kwh = Math.max(0, (curr.meter_peak - prev.meter_peak) / diffDays);
                    }
                    if (!curr.electricity_normal_kwh && curr.meter_normal && prev.meter_normal) {
                        curr.electricity_normal_kwh = Math.max(0, (curr.meter_normal - prev.meter_normal) / diffDays);
                    }
                    if (!curr.electricity_offpeak_kwh && curr.meter_offpeak && prev.meter_offpeak) {
                        curr.electricity_offpeak_kwh = Math.max(0, (curr.meter_offpeak - prev.meter_offpeak) / diffDays);
                    }
                    if (!curr.electricity_kwh && curr.electricity_meter_reading && prev.electricity_meter_reading) {
                        curr.electricity_kwh = Math.max(0, (curr.electricity_meter_reading - prev.electricity_meter_reading) / diffDays);
                    }
                }

                // Make sure to filter out the previous month's overlapping days
                const validEnergy = processedEnergy.filter(e => e.work_date >= startDateStr);

                setEnergyData(validEnergy.map(e => {
                    const p = e.electricity_peak_kwh || 0;
                    const n = e.electricity_normal_kwh || 0;
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

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                    <p className="font-semibold mb-2">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center justify-between gap-4">
                            <span style={{ color: entry.color }}>
                                {entry.name}:
                            </span>
                            <span className="font-mono font-medium">
                                {Number(entry.value).toLocaleString('vi-VN')} kWh
                            </span>
                        </div>
                    ))}
                </div>
            )
        }
        return null
    }

    return (
        <div className="flex-1 space-y-4 md:space-y-6 max-w-7xl mx-auto w-full pb-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight whitespace-nowrap flex items-center gap-2 text-primary">
                        <Zap className="h-6 w-6" />
                        Dashboard Năng Lượng
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        Theo dõi dữ liệu tiêu thụ điện năng toàn bộ nhà máy
                    </p>
                </div>
                
                {/* Month Selector */}
                <div className="flex items-center gap-2 bg-background border rounded-md p-1 shadow-sm">
                    <Button variant="ghost" size="icon" onClick={goToPreviousMonth} className="h-8 w-8 hover:bg-muted">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center justify-center min-w-[140px] font-semibold text-sm">
                        <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                        {format(currentMonth, "MMMM - yyyy", { locale: vi })}
                    </div>
                    <Button variant="ghost" size="icon" onClick={goToNextMonth} className="h-8 w-8 hover:bg-muted" disabled={currentMonth >= startOfMonth(new Date())}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-[500px]">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
                    
                    {/* COMBINED ENERGY & COST CHART */}
                    <Card className="col-span-2 shadow-sm border-blue-100">
                        <CardHeader className="pb-2 border-b border-slate-100 mb-2">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <CardTitle>Điện Năng Toàn Nhà Máy (Main Energy)</CardTitle>
                                    <CardDescription>Tiêu thụ Điện / Chi phí thực tế (MTD)</CardDescription>
                                </div>
                                <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                                    <button 
                                        onClick={() => setMainChartMode('kwh')}
                                        className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${mainChartMode === 'kwh' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                                        Sản lượng (kWh)
                                    </button>
                                    <button 
                                        onClick={() => setMainChartMode('vnd')}
                                        className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${mainChartMode === 'vnd' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}>
                                        Chi phí (VNĐ)
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {(() => {
                                const mtdPeakKwh = energyData.reduce((acc, curr) => acc + (curr.stacked_peak || 0), 0);
                                const mtdNormalKwh = energyData.reduce((acc, curr) => acc + (curr.stacked_normal || 0), 0);
                                const mtdOffpeakKwh = energyData.reduce((acc, curr) => acc + (curr.stacked_offpeak || 0), 0);
                                const fallbackKwh = energyData.reduce((acc, curr) => acc + (curr.fallback_kwh || 0), 0);
                                const mtdTotalKwh = mtdPeakKwh + mtdNormalKwh + mtdOffpeakKwh;

                                const mtdPeakVnd = energyData.reduce((acc, curr) => acc + (curr.cost_peak || 0), 0);
                                const mtdNormalVnd = energyData.reduce((acc, curr) => acc + (curr.cost_normal || 0), 0);
                                const mtdOffpeakVnd = energyData.reduce((acc, curr) => acc + (curr.cost_offpeak || 0), 0);
                                const fallbackVnd = energyData.reduce((acc, curr) => acc + (curr.fallback_cost || 0), 0);
                                const mtdTotalVnd = mtdPeakVnd + mtdNormalVnd + mtdOffpeakVnd;

                                const isKwh = mainChartMode === 'kwh';

                                return (
                                    <div className="flex flex-col lg:flex-row gap-6">
                                        {/* SUMMARY TABLE (LEFT) */}
                                        <div className="w-full lg:w-1/4 flex flex-col gap-3 shrink-0">
                                            <div className={`p-4 rounded-xl border ${isKwh ? 'bg-blue-50/50 border-blue-100' : 'bg-amber-50/50 border-amber-100'}`}>
                                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-tight mb-1">TỔNG MTD THEO {isKwh ? 'KWH' : 'VNĐ'}</p>
                                                <p className={`text-2xl font-black ${isKwh ? 'text-blue-700' : 'text-amber-600'}`}>
                                                    {isKwh ? mtdTotalKwh.toLocaleString('vi-VN') : mtdTotalVnd.toLocaleString('vi-VN')}
                                                    <span className="text-sm font-semibold ml-1">{isKwh ? 'kWh' : 'đ'}</span>
                                                </p>
                                            </div>
                                            
                                            <div className="rounded-xl border bg-white overflow-hidden text-sm shadow-sm ring-1 ring-black/5">
                                                <div className="flex justify-between p-2.5 border-b bg-rose-50/30">
                                                    <span className="font-semibold text-rose-600 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div>Cao điểm</span>
                                                    <span className="font-mono">{isKwh ? mtdPeakKwh.toLocaleString('vi-VN') : mtdPeakVnd.toLocaleString('vi-VN')}</span>
                                                </div>
                                                <div className="flex justify-between p-2.5 border-b bg-blue-50/30">
                                                    <span className="font-semibold text-blue-600 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Bình thường</span>
                                                    <span className="font-mono">{isKwh ? mtdNormalKwh.toLocaleString('vi-VN') : mtdNormalVnd.toLocaleString('vi-VN')}</span>
                                                </div>
                                                <div className="flex justify-between p-2.5 bg-emerald-50/30">
                                                    <span className="font-semibold text-emerald-600 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Thấp điểm</span>
                                                    <span className="font-mono">{isKwh ? mtdOffpeakKwh.toLocaleString('vi-VN') : mtdOffpeakVnd.toLocaleString('vi-VN')}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* CHART (RIGHT) */}
                                        <div className="w-full lg:w-3/4 h-[320px] lg:h-[350px] shrink-0 lg:shrink">
                                            {energyData.length === 0 ? (
                                                <div className="h-full flex items-center justify-center text-muted-foreground">Chưa có dữ liệu tháng này</div>
                                            ) : (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    {isKwh ? (
                                                        <ComposedChart data={energyData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                            <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(val) => val.toLocaleString('en-US')} />
                                                            <Tooltip content={<CustomTooltip />} />
                                                            <Legend />
                                                            <Bar dataKey="stacked_offpeak" stackId="a" name="Thấp điểm" fill="#10B981" />
                                                            <Bar dataKey="stacked_normal" stackId="a" name="Bình thường" fill="#3B82F6" />
                                                            <Bar dataKey="stacked_peak" stackId="a" name="Cao điểm" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                                            <Line type="monotone" dataKey="electricity_target_kwh" name="Mục tiêu (Target)" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                                        </ComposedChart>
                                                    ) : (
                                                        <BarChart data={energyData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                            <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                                                            <YAxis 
                                                                tickLine={false} 
                                                                axisLine={false} 
                                                                tick={{ fontSize: 11 }} 
                                                                tickFormatter={(val) => new Intl.NumberFormat('vi-VN', { notation: "compact" }).format(val)} 
                                                                width={55}
                                                            />
                                                            <Tooltip 
                                                                formatter={(value: any, name: any) => [`${Number(value).toLocaleString('vi-VN')} đ`, name]}
                                                            />
                                                            <Legend />
                                                            <Bar dataKey="cost_offpeak" stackId="cost" name="Thấp điểm (1,190đ)" fill="#10B981" />
                                                            <Bar dataKey="cost_normal" stackId="cost" name="Bình thường (1,833đ)" fill="#3B82F6" />
                                                            <Bar dataKey="cost_peak" stackId="cost" name="Cao điểm (3,398đ)" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={60} />
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

                    {/* MTD PIE CHART - FACTORY ENERGY COMPONENT */}
                    <Card className="col-span-2 lg:col-span-2 shadow-sm">
                        <CardHeader>
                            <CardTitle>Tỷ Trọng Điện MTD (Peak/Normal/Offpeak)</CardTitle>
                            <CardDescription>Cơ cấu lượng điện tiêu thụ trong tháng hiện tại</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            {(() => {
                                const mtdPeak = energyData.reduce((acc, curr) => acc + (curr.stacked_peak || 0), 0);
                                const mtdNormal = energyData.reduce((acc, curr) => acc + (curr.stacked_normal || 0), 0);
                                const mtdOffpeak = energyData.reduce((acc, curr) => acc + (curr.stacked_offpeak || 0), 0);
                                const total = mtdPeak + mtdNormal + mtdOffpeak;
                                
                                if (energyData.length === 0 || total === 0) {
                                    return <div className="h-full flex items-center justify-center text-muted-foreground">Chưa có dữ liệu phân bổ giờ cao điểm tháng này</div>;
                                }

                                const pieData = [
                                    { name: 'Thấp điểm', value: mtdOffpeak, fill: '#10B981' },
                                    { name: 'Bình thường', value: mtdNormal, fill: '#3B82F6' },
                                    { name: 'Cao điểm', value: mtdPeak, fill: '#EF4444' }
                                ].filter(d => d.value > 0);

                                return (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={110}
                                                paddingAngle={5}
                                                dataKey="value"
                                                label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(1)}%`}
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: any) => `${Number(value || 0).toLocaleString('vi-VN')} kWh`} />
                                            <Legend verticalAlign="bottom" height={36} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                );
                            })()}
                        </CardContent>
                    </Card>

                    {/* DEPARTMENT BREAKDOWN STACKED BAR */}
                    {(() => {
                        // Build a date-keyed lookup from each source
                        const compMap: Record<string, number> = {}
                        compressorData.forEach((d: any) => {
                            compMap[d.work_date] = Math.round((d.meter1 || 0) + (d.meter2 || 0) + (d.meter3 || 0))
                        })
                        const shellMap: Record<string, number> = {}
                        shellingData.forEach((d: any) => {
                            shellMap[d.work_date] = Math.round(d.energy_kwh || 0)
                        })
                        const otherMap: Record<string, any> = {}
                        otherElecData.forEach((d: any) => {
                            otherMap[d.work_date] = d
                        })

                        // Collect all unique dates across all sources (within current month)
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
                                shelling:   shellMap[date] || 0,
                                boiler:     Math.round(oth.boiler    || 0),
                                office:     Math.round(oth.office    || 0),
                                canteen:    Math.round(oth.canteen   || 0),
                                db_ac_hca:  Math.round(oth.db_ac_hca || 0),
                                eco2:       Math.round(oth.eco2      || 0),
                                maint:      Math.round(oth.maintenance || 0),
                            }
                        })

                        const SEGMENTS = [
                            { key: 'compressor', name: 'Máy Nén Khí',  color: '#8B5CF6' },
                            { key: 'shelling',   name: 'Shelling',     color: '#F97316' },
                            { key: 'boiler',     name: 'Boiler',       color: '#EAB308' },
                            { key: 'db_ac_hca',  name: 'DB AC HAVC',   color: '#3B82F6' },
                            { key: 'eco2',       name: 'ECO2',         color: '#10B981' },
                            { key: 'office',     name: 'Office',       color: '#64748B' },
                            { key: 'canteen',    name: 'Canteen',      color: '#F43F5E' },
                            { key: 'maint',      name: 'Đồng hồ Maint',color: '#06B6D4' },
                        ]

                        return (
                            <Card className="col-span-2 shadow-sm">
                                <CardHeader>
                                    <CardTitle>Tỷ Trọng Điện Theo Khu Vực Phụ Trợ (kWh / Ngày)</CardTitle>
                                    <CardDescription>Biểu đồ Stack — thấy ngay bộ phận nào tiêu nhiều nhất từng ngày</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[380px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={breakdownData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                            <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString('en-US')} width={55} />
                                            <Tooltip
                                                content={({ active, payload, label }) => {
                                                    if (!active || !payload) return null
                                                    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0)
                                                    return (
                                                        <div className="bg-background border rounded-lg shadow-lg p-3 text-xs">
                                                            <p className="font-semibold mb-2">{label}</p>
                                                            {[...payload].reverse().map((p: any, i: number) => (
                                                                <div key={i} className="flex items-center justify-between gap-4">
                                                                    <span style={{ color: p.fill }}>● {p.name}:</span>
                                                                    <span className="font-mono">{Number(p.value).toLocaleString('vi-VN')} kWh ({total > 0 ? ((p.value/total)*100).toFixed(1) : 0}%)</span>
                                                                </div>
                                                            ))}
                                                            <div className="border-t mt-2 pt-2 font-bold flex justify-between">
                                                                <span>Tổng:</span>
                                                                <span className="font-mono">{total.toLocaleString('vi-VN')} kWh</span>
                                                            </div>
                                                        </div>
                                                    )
                                                }}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '11px' }} />
                                            {SEGMENTS.map(s => (
                                                <Bar key={s.key} dataKey={s.key} name={s.name} stackId="dept" fill={s.color} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        )
                    })()}


                    <Card className="col-span-2 shadow-sm">
                        <CardHeader>
                            <CardTitle>Hệ Thống Máy Nén Khí (Air Compressors)</CardTitle>
                            <CardDescription>Tiêu thụ điện 3 Cụm MNK (kWh)</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            {compressorData.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted-foreground">Chưa có dữ liệu tháng này</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={compressorData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorMnk1" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorMnk2" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#EC4899" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorMnk3" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#14B8A6" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                                        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(val) => val.toLocaleString('en-US')} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Area type="monotone" dataKey="meter1" name="MNK Số 1" stroke="#8B5CF6" fillOpacity={1} fill="url(#colorMnk1)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="meter2" name="MNK 2,4" stroke="#EC4899" fillOpacity={1} fill="url(#colorMnk2)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="meter3" name="MNK 3,5,6" stroke="#14B8A6" fillOpacity={1} fill="url(#colorMnk3)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                    {/* OTHER ELECTRICITY */}
                    <Card className="col-span-2 shadow-sm">
                        <CardHeader>
                            <CardTitle>Điện Phụ Trợ Khác (Other Electricity)</CardTitle>
                            <CardDescription>Tiêu thụ điện 8 thiết bị/vùng phụ trợ (kWh)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {otherElecData.length === 0 ? (
                                <div className="h-64 flex items-center justify-center text-muted-foreground">Chưa có dữ liệu tháng này</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {[
                                        { key: 'cooling_fan', name: 'Cooling Fan', color: '#F97316' },
                                        { key: 'boiler', name: 'Boiler', color: '#EAB308' },
                                        { key: 'office', name: 'Office', color: '#3B82F6' },
                                        { key: 'db_ac_hca', name: 'DB-AC HCA', color: '#8B5CF6' },
                                        { key: 'eco2', name: 'ECO2', color: '#10B981' },
                                        { key: 'canteen', name: 'Canteen', color: '#F43F5E' },
                                        { key: 'transformer', name: 'Transformer', color: '#64748B' },
                                        { key: 'maintenance', name: 'Đồng hồ Maint', color: '#06B6D4' }
                                    ].map(meter => (
                                        <div key={meter.key} className="border rounded-md p-3 bg-slate-50/50 h-[220px] flex flex-col">
                                            <h4 className="text-xs font-semibold mb-2 text-slate-700">{meter.name}</h4>
                                            <div className="flex-1 w-full relative">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={otherElecData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                        <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                                                        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} tickFormatter={(val) => new Intl.NumberFormat('en-US', { notation: "compact" }).format(val)} />
                                                        <Tooltip content={<CustomTooltip />} />
                                                        <Line type="monotone" dataKey={meter.key} name={meter.name} stroke={meter.color} strokeWidth={2} dot={{r: 1}} activeDot={{ r: 4 }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* SHELLING ENERGY */}
                    <Card className="col-span-2 shadow-sm">
                        <CardHeader>
                            <CardTitle>Điện Khu Vực Shelling</CardTitle>
                            <CardDescription>Chỉ số tiêu thụ điện theo khu vực Shelling (kWh)</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            {shellingData.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted-foreground">Chưa có dữ liệu tháng này</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={shellingData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                                        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(val) => val.toLocaleString('en-US')} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Bar dataKey="energy_kwh" name="Điện Shelling (kWh)" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                </div>
            )}
        </div>
    )
}
