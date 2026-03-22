"use client"

import { useState, useEffect, useCallback } from "react"
import { startOfMonth, subMonths, addMonths, format } from "date-fns"
import { vi } from "date-fns/locale"
import { ChevronLeft, ChevronRight, CalendarIcon, ShieldCheck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { TabDashboard } from "./tab-dashboard"
import { TabSeu } from "./tab-seu"
import { TabInput } from "./tab-input"
import { TabBaseline } from "./tab-baseline"
import { SeuMaster, MonthlyHistorical, BaselineModel, DailyEntry, SeuSummary } from "./types"

interface ISOProps {
    userRole: string;
    userEmail: string;
}

export function ISO50001Content({ userRole, userEmail }: ISOProps) {
    const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
    const [isLoading, setIsLoading] = useState(true)
    const [blLoading, setBlLoading] = useState(true)

    // Dashboard data
    const [entries, setEntries] = useState<DailyEntry[]>([])
    const [summaries, setSummaries] = useState<SeuSummary[]>([])
    const [dashboardHistorical, setDashboardHistorical] = useState<MonthlyHistorical[]>([])

    // Baseline engine data  
    const [seus, setSeus] = useState<SeuMaster[]>([])
    const [historical, setHistorical] = useState<MonthlyHistorical[]>([])
    const [baselines, setBaselines] = useState<BaselineModel[]>([])

    const monthStr = format(currentMonth, 'yyyy-MM')

    const fetchDashboard = useCallback(async () => {
        setIsLoading(true)
        try {
            const res = await fetch(`/api/iso50001/dashboard?month=${monthStr}`)
            const json = await res.json()
            setEntries(json.entries || [])
            setSummaries(json.summaries || [])
            setDashboardHistorical(json.historicalData || [])
        } catch (e) {
            console.error('ISO dashboard fetch error:', e)
        } finally {
            setIsLoading(false)
        }
    }, [monthStr])

    const fetchBaseline = useCallback(async () => {
        setBlLoading(true)
        try {
            const res = await fetch('/api/iso50001/baseline')
            const json = await res.json()
            setSeus(json.seus || [])
            setHistorical(json.historical || [])
            setBaselines(json.baselines || [])
        } catch (e) {
            console.error('ISO baseline fetch error:', e)
        } finally {
            setBlLoading(false)
        }
    }, [])

    const handleRefresh = useCallback(() => {
        fetchDashboard()
        fetchBaseline()
    }, [fetchDashboard, fetchBaseline])

    useEffect(() => { fetchDashboard() }, [fetchDashboard])
    useEffect(() => { fetchBaseline() }, [fetchBaseline])

    return (
        <div className="flex-1 space-y-4 md:space-y-5 w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-primary">
                        <ShieldCheck className="h-5 w-5" />
                        Energy Management System (ISO 50001)
                    </h2>
                    <p className="text-muted-foreground text-xs mt-0.5">
                        Performance monitoring and energy baseline tracking.
                    </p>
                </div>

                {/* Month selector */}
                <div className="flex items-center gap-1.5 bg-background border rounded-md p-1 shadow-sm">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="h-7 w-7">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center justify-center min-w-[130px] text-sm font-semibold">
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                        {format(currentMonth, 'MM/yyyy')}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="h-7 w-7"
                        disabled={currentMonth >= startOfMonth(new Date())}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="dashboard" className="space-y-4">
                <TabsList className="grid grid-cols-4 w-full h-9">
                    <TabsTrigger value="dashboard" className="text-xs">📊 Dashboard</TabsTrigger>
                    <TabsTrigger value="seu" className="text-xs">⚡ Theo dõi SEU</TabsTrigger>
                    {(userRole === 'admin' || userRole === 'HSE' || userRole === 'hse') && userEmail !== 'admin@dds.com' && (
                        <TabsTrigger value="input" className="text-xs">✏️ Nhập liệu</TabsTrigger>
                    )}
                    {(userRole === 'admin' || userRole === 'HSE' || userRole === 'hse') && userEmail !== 'admin@dds.com' && (
                        <TabsTrigger value="baseline" className="text-xs">📐 Baseline</TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="dashboard">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : (
                        <TabDashboard entries={entries} summaries={summaries} historical={dashboardHistorical} currentMonth={currentMonth} />
                    )}
                </TabsContent>

                <TabsContent value="seu">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : (
                        <TabSeu summaries={summaries} currentMonth={currentMonth} />
                    )}
                </TabsContent>

                {(userRole === 'admin' || userRole === 'HSE' || userRole === 'hse') && userEmail !== 'admin@dds.com' && (
                    <TabsContent value="input">
                        <TabInput seus={seus} currentMonth={currentMonth} onSaved={handleRefresh} />
                    </TabsContent>
                )}

                {(userRole === 'admin' || userRole === 'HSE' || userRole === 'hse') && userEmail !== 'admin@dds.com' && (
                    <TabsContent value="baseline">
                        {blLoading ? (
                            <div className="flex justify-center items-center h-48">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : (
                            <TabBaseline seus={seus} historical={historical} baselines={baselines} onRefresh={handleRefresh} />
                        )}
                    </TabsContent>
                )}
            </Tabs>
        </div>
    )
}
