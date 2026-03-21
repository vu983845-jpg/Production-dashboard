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
                    .gte("work_date", startDateStr)
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

                setEnergyData((energy || []).map(e => {
                    const p = e.electricity_peak_kwh || 0;
                    const n = e.electricity_normal_kwh || 0;
                    const o = e.electricity_offpeak_kwh || 0;
                    const sum = p + n + o;
                    return {
                        ...e, 
                        fmtDate: format(new Date(e.work_date), "dd/MM"),
                        fallback_kwh: sum > 0 ? 0 : Number(e.electricity_kwh || 0),
                        stacked_peak: p,
                        stacked_normal: n,
                        stacked_offpeak: o
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
                    
                    {/* FACTORY TOTAL ENERGY */}
                    <Card className="col-span-2 shadow-sm">
                        <CardHeader>
                            <CardTitle>Điện Năng Toàn Nhà Máy (Main Energy)</CardTitle>
                            <CardDescription>Tiêu thụ Điện (kWh) thực tế so với Target</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            {energyData.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted-foreground">Chưa có dữ liệu tháng này</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={energyData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis dataKey="fmtDate" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                                        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(val) => val.toLocaleString('en-US')} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Bar dataKey="fallback_kwh" stackId="a" name="Tổng (Chưa phân chia)" fill="#9CA3AF" />
                                        <Bar dataKey="stacked_offpeak" stackId="a" name="Thấp điểm" fill="#10B981" />
                                        <Bar dataKey="stacked_normal" stackId="a" name="Bình thường" fill="#3B82F6" />
                                        <Bar dataKey="stacked_peak" stackId="a" name="Cao điểm" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                        <Line type="monotone" dataKey="electricity_target_kwh" name="Mục tiêu (Target)" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            )}
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

                    {/* AIR COMPRESSORS */}
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
