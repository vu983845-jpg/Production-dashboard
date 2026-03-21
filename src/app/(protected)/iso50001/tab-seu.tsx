"use client"

import { format, parseISO } from "date-fns"
import { Zap, Flame, TrendingDown, TrendingUp, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SeuSummary, fmtNum, deviationColor, deviationBg } from "./types"

interface Props {
    summaries: SeuSummary[]
    currentMonth: Date
}

export function TabSeu({ summaries, currentMonth }: Props) {
    if (summaries.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-12 text-sm">
                Chưa có dữ liệu cho tháng này.
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {summaries.map(s => (
                <SeuCard key={s.seu_id} summary={s} />
            ))}
        </div>
    )
}

function SeuCard({ summary: s }: { summary: SeuSummary }) {
    const isElec = s.energy_type === 'electricity'
    const Icon = isElec ? Zap : Flame
    const iconColor = isElec ? 'text-blue-600' : 'text-orange-600'
    const devColor = deviationColor(s.monthly_deviation_pct)
    const devBg = deviationBg(s.monthly_deviation_pct)
    const saving = s.monthly_deviation_pct != null && s.monthly_deviation_pct <= 0

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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Actual */}
                    <StatBox
                        label="Thực tế (MTD)"
                        value={fmtNum(s.total_actual)}
                        unit={s.unit}
                        className={isElec ? 'border-blue-100 bg-blue-50/40' : 'border-orange-100 bg-orange-50/40'}
                    />
                    {/* Expected */}
                    {s.has_baseline && (
                        <StatBox
                            label="Dự báo (baseline)"
                            value={fmtNum(s.total_expected)}
                            unit={s.unit}
                            className="border-slate-100 bg-slate-50/40"
                        />
                    )}
                    {/* Saving */}
                    {s.has_baseline && (
                        <StatBox
                            label={s.total_saving >= 0 ? 'Tiết kiệm' : 'Lãng phí'}
                            value={fmtNum(Math.abs(s.total_saving))}
                            unit={s.unit}
                            className={s.total_saving >= 0
                                ? 'border-emerald-100 bg-emerald-50/40'
                                : 'border-red-100 bg-red-50/40'}
                        />
                    )}
                    {/* EnPI */}
                    <div className="rounded-xl border bg-purple-50/40 border-purple-100 p-3">
                        <p className="text-xs text-muted-foreground mb-1">EnPI thực tế</p>
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
                <p className="text-xs text-muted-foreground mt-3">
                    Dữ liệu từ <strong>{s.days}</strong> ngày | Tổng sản lượng: <strong>{fmtNum(s.total_rcn, 0)} kg</strong>
                </p>
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
