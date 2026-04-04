"use client"

import { format, parseISO } from "date-fns"
import { Zap, Flame, Droplets, TrendingDown, TrendingUp, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer } from "recharts"
import { SeuSummary, MonthlyHistorical, fmtNum, deviationColor, deviationBg } from "./types"

interface Props {
    summaries: SeuSummary[]
    historical: MonthlyHistorical[]
    currentMonth: Date
}

export function TabSeu({ summaries, historical, currentMonth }: Props) {
    if (summaries.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-12 text-sm">
                Chưa có dữ liệu cho tháng này.
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {summaries.map(s => {
                const seuHistory = historical.filter(h => h.seu_id === s.seu_id)
                return <SeuCard key={s.seu_id} summary={s} historical={seuHistory} currentMonth={currentMonth} />
            })}
        </div>
    )
}

function SeuCard({ summary: s, historical, currentMonth }: { summary: SeuSummary, historical: MonthlyHistorical[], currentMonth: Date }) {
    const isElec = s.energy_type === 'electricity'
    const isWater = s.energy_type === 'water'
    const Icon = isElec ? Zap : isWater ? Droplets : Flame
    const iconColor = isElec ? 'text-blue-600' : isWater ? 'text-teal-600' : 'text-orange-600'
    const devColor = deviationColor(s.monthly_deviation_pct)
    const devBg = deviationBg(s.monthly_deviation_pct)
    const saving = s.monthly_deviation_pct != null && s.monthly_deviation_pct <= 0

    // YTD Calculations
    const currentYearStr = format(currentMonth, 'yyyy')
    const ytdData = historical.filter(h => h.month_year.startsWith(currentYearStr))
    let ytdActual = 0
    let ytdExpected = 0
    ytdData.forEach(h => {
        ytdActual += h.total_energy || 0
        ytdExpected += h.expected_energy || 0
    })
    const ytdSaving = ytdExpected > 0 ? ytdExpected - ytdActual : 0
    const ytdDeviation = ytdExpected > 0 ? ((ytdActual - ytdExpected) / ytdExpected) * 100 : null
    const ytdIsSaving = ytdDeviation != null && ytdDeviation <= 0

    // Chart Data (Past 12 months)
    const sortedHist = [...historical].sort((a, b) => a.month_year.localeCompare(b.month_year)).slice(-12)
    const chartData = sortedHist.map(h => ({
        name: h.month_year,
        Thực_tế: h.total_energy,
        Dự_báo: h.expected_energy,
    }))

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${iconColor}`} />
                        {s.seu_name}
                    </CardTitle>
                    {s.has_baseline && s.monthly_deviation_pct != null ? (
                        <Badge variant="outline" className={`text-xs ${devBg} ${devColor} border`}>
                            {saving
                                ? <TrendingDown className="h-3.5 w-3.5 mr-1 inline" />
                                : <TrendingUp className="h-3.5 w-3.5 mr-1 inline" />
                            }
                            {saving ? '' : '+'}{fmtNum(s.monthly_deviation_pct)}%
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                            <Info className="h-3 w-3 mr-1 inline" />Chưa có baseline
                        </Badge>
                    )}
                </div>
                {s.baseline && (
                    <CardDescription className="text-xs mt-1">
                        Đường cơ sở: <strong>{s.baseline.label}</strong> | 
                        y = {Number(s.baseline.slope).toFixed(4)}x + {Number(s.baseline.intercept).toFixed(0)} | 
                        R² = <span className={s.baseline.r_squared >= 0.85 ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                            {(s.baseline.r_squared * 100).toFixed(1)}%
                        </span>
                    </CardDescription>
                )}
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Actual */}
                    <StatBox
                        label="Thực tế (MTD)"
                        value={fmtNum(s.total_actual)}
                        unit={s.unit}
                        className={isElec ? 'border-blue-100 bg-blue-50/40' : isWater ? 'border-teal-100 bg-teal-50/40' : 'border-orange-100 bg-orange-50/40'}
                    />
                    {/* Expected */}
                    {s.has_baseline && (
                        <StatBox
                            label="Dự báo (MTD)"
                            value={fmtNum(s.total_expected)}
                            unit={s.unit}
                            className="border-slate-100 bg-slate-50/40"
                        />
                    )}
                    {/* MTD Saving */}
                    {s.has_baseline && (
                        <StatBox
                            label={s.total_saving >= 0 ? 'MTD Tiết kiệm' : 'MTD Lãng phí'}
                            value={fmtNum(Math.abs(s.total_saving))}
                            unit={s.unit}
                            className={s.total_saving >= 0
                                ? 'border-emerald-100 bg-emerald-50/40'
                                : 'border-red-100 bg-red-50/40'}
                        />
                    )}
                    {/* YTD Saving */}
                    {s.has_baseline && (
                        <div className={`rounded-xl border p-3 ${ytdIsSaving ? 'border-emerald-100 bg-emerald-50/40' : 'border-red-100 bg-red-50/40'}`}>
                            <p className="text-xs text-muted-foreground mb-1">YTD {ytdSaving >= 0 ? 'Tiết kiệm' : 'Lãng phí'}</p>
                            <p className="text-lg font-black text-foreground">{fmtNum(Math.abs(ytdSaving))}</p>
                            <p className="text-xs text-muted-foreground">{ytdDeviation != null ? `${ytdSaving >= 0 ? '' : '+'}${ytdDeviation.toFixed(1)}% so với baseline` : 'N/A'}</p>
                        </div>
                    )}
                    {/* EnPI */}
                    <div className="rounded-xl border bg-purple-50/40 border-purple-100 p-3">
                        <p className="text-xs text-muted-foreground mb-1">EnPI (MTD)</p>
                        <p className="text-lg font-black text-purple-700">
                            {fmtNum(s.monthly_enpi_actual, 4)}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.unit} / kg Sản lượng</p>
                        {s.monthly_enpi_baseline != null && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Baseline: {fmtNum(s.monthly_enpi_baseline, 4)}
                            </p>
                        )}
                    </div>
                </div>

                {/* Days summary */}
                <p className="text-xs text-muted-foreground mt-3 mb-4">
                    Dữ liệu từ <strong>{s.days}</strong> ngày | Tổng sản lượng (MTD): <strong>{fmtNum(s.total_rcn, 0)} kg</strong>
                </p>

                {/* Historical Chart */}
                {chartData.length > 0 && (
                    <div className="mt-4 pt-5 border-t border-slate-100">
                        <p className="text-sm font-bold text-slate-700 mb-4">Biểu đồ Lịch sử {s.has_baseline ? 'Chênh lệch Baseline' : 'Tiêu thụ'} (12 Tháng)</p>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => typeof v === 'number' ? new Intl.NumberFormat('en-US', { notation: 'compact' }).format(v) : v} tickLine={false} axisLine={false} />
                                    <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                                    <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                                    <Bar dataKey="Thực_tế" name="Thực tế" fill={isElec ? '#3b82f6' : isWater ? '#0d9488' : '#f97316'} radius={[4, 4, 0, 0]} maxBarSize={45} />
                                    {s.has_baseline && (
                                        <Line type="monotone" dataKey="Dự_báo" name="Cơ sở (Baseline)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function StatBox({ label, value, unit, className }: { label: string; value: string; unit: string; className: string }) {
    return (
        <div className={`rounded-xl border p-3 ${className}`}>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-lg font-black text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{unit}</p>
        </div>
    )
}
