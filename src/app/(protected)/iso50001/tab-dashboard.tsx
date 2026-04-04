"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, ReferenceLine, ScatterChart, Scatter,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, TrendingDown, TrendingUp, Zap, Flame, Droplets } from "lucide-react"
import { DailyEntry, SeuSummary, MonthlyHistorical, fmtNum, deviationColor, deviationBg } from "./types"

interface Props {
    entries: DailyEntry[]
    summaries: SeuSummary[]
    historical: MonthlyHistorical[]
    currentMonth: Date
}

export function TabDashboard({ entries, summaries, historical, currentMonth }: Props) {
    const elecSummary = summaries.find(s => s.energy_type === 'electricity')
    const woodSummary = summaries.find(s => s.energy_type === 'wood')
    const waterSummary = summaries.find(s => s.energy_type === 'water')

    const elecEntries = entries.filter(e => e.seu?.energy_type === 'electricity')
    const woodEntries = entries.filter(e => e.seu?.energy_type === 'wood')

    // Chart data — daily actual vs expected
    const elecChartData = elecEntries.map(e => ({
        date: format(new Date(e.entry_date), 'dd/MM'),
        actual: e.actual_energy,
        expected: e.expected_energy,
        saving: e.saving,
    }))
    const woodChartData = woodEntries.map(e => ({
        date: format(new Date(e.entry_date), 'dd/MM'),
        actual: e.actual_energy,
        expected: e.expected_energy,
        saving: e.saving,
    }))

    const noBaseline = summaries.some(s => !s.has_baseline)

    return (
        <div className="space-y-4">
            {/* Month label */}
            <p className="text-sm text-muted-foreground">
                Tháng: <span className="font-semibold text-foreground">
                    {format(currentMonth, "MMMM yyyy", { locale: vi })}
                </span>
            </p>

            {noBaseline && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Một hoặc nhiều SEU chưa có <strong>đường cơ sở kích hoạt</strong>.
                    Vui lòng vào tab "Baseline Engine" để thiết lập.
                </div>
            )}

            {/* BẢNG TỔNG HỢP SEU */}
            <Card className="shadow-sm border-blue-100">
                <CardHeader className="bg-slate-50/50 border-b pb-3">
                    <CardTitle className="text-sm">Bảng Tổng Hợp Kết Quả SEU (MTD)</CardTitle>
                    <CardDescription className="text-xs flex items-center gap-2 flex-wrap">
                        <span>Kết quả thực tế, dự báo dựa vào hồi quy và % tiết kiệm của từng khu vực</span>
                        {summaries.length > 0 && (
                            summaries[0].data_source === 'historical'
                                ? <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                                    📦 Tháng đã qua · Nguồn: Baseline Model (đã chốt)
                                  </span>
                                : <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                                    📡 Tháng hiện tại · Nguồn: Data Input (hàng ngày)
                                  </span>
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100/50 text-xs uppercase text-slate-500 border-b">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Tên SEU</th>
                                    <th className="px-4 py-3 font-semibold text-right">Thực tế</th>
                                    <th className="px-4 py-3 font-semibold text-right">Dự báo (Baseline)</th>
                                    <th className="px-4 py-3 font-semibold text-right">% Tiết kiệm / Vượt</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {summaries.map(s => {
                                    const devPct = s.monthly_deviation_pct
                                    const noData = s.days === 0
                                    const saving = devPct != null && devPct <= 0
                                    const color = deviationColor(devPct)
                                    const bg = deviationBg(devPct)

                                    return (
                                        <tr key={s.seu_id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 font-medium flex items-center gap-2">
                                                {s.energy_type === 'electricity'
                                                    ? <Zap className="h-4 w-4 text-blue-500" />
                                                    : s.energy_type === 'water'
                                                        ? <Droplets className="h-4 w-4 text-teal-500" />
                                                        : <Flame className="h-4 w-4 text-orange-500" />
                                                }
                                                {s.seu_name}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {noData
                                                    ? <span className="text-xs text-muted-foreground italic">Chưa có data</span>
                                                    : <>{fmtNum(s.total_actual)} <span className="text-xs text-muted-foreground">{s.unit}</span></>
                                                }
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {s.has_baseline ? (
                                                    noData
                                                        ? <span className="text-xs text-muted-foreground italic">— (cần data)</span>
                                                        : <>{fmtNum(s.total_expected)} <span className="text-xs text-muted-foreground">{s.unit}</span></>
                                                ) : <span className="text-xs text-muted-foreground italic">N/A</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {!s.has_baseline
                                                    ? <span className="text-xs text-muted-foreground italic">Chưa có baseline</span>
                                                    : noData
                                                        ? <span className="text-xs text-muted-foreground italic">—</span>
                                                        : devPct != null ? (
                                                            <Badge variant="outline" className={`font-mono text-xs ${bg} ${color} border-transparent`}>
                                                                {saving ? <TrendingDown className="h-3 w-3 mr-1 inline" /> : <TrendingUp className="h-3 w-3 mr-1 inline" />}
                                                                {saving ? '' : '+'}{fmtNum(devPct)}%
                                                            </Badge>
                                                        ) : <span className="text-xs text-muted-foreground italic">—</span>
                                                }
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* BẢNG 12 THÁNG LỊCH SỬ CHO TẤT CẢ SEU */}
            <Card className="shadow-sm">
                <CardHeader className="bg-slate-50/50 border-b pb-3">
                    <CardTitle className="text-sm">Lịch Sử Năng Lượng (12 Tháng Gần Nhất)</CardTitle>
                    <CardDescription className="text-xs">
                        Dữ liệu nhập từ tab Data Input (tổng hợp theo tháng), so sánh với đường cơ sở hiện tại
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100/50 text-xs uppercase text-slate-500 border-b sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Tháng</th>
                                    <th className="px-4 py-3 font-semibold">Khu vực / SEU</th>
                                    <th className="px-4 py-3 font-semibold text-right">Sản lượng</th>
                                    <th className="px-4 py-3 font-semibold text-right">Thực tế</th>
                                    <th className="px-4 py-3 font-semibold text-right">Dự báo</th>
                                    <th className="px-4 py-3 font-semibold text-right">% Tiết kiệm</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {historical.slice(0, 120).map(row => {
                                    // Use pre-calculated values from API (same source as summary −
                                    // both now come from iso50001_daily_entry aggregated by month)
                                    const seuSum = summaries.find(s => s.seu_id === row.seu_id)
                                    const actual  = Number(row.actual_energy) || 0
                                    const expected = row.expected_energy != null ? Number(row.expected_energy) : null
                                    const devPct   = (row as any).deviation_pct != null
                                        ? Number((row as any).deviation_pct)
                                        : (expected && expected > 0 ? ((actual - expected) / expected) * 100 : null)
                                    const rcn      = Number(row.rcn_hap_duoc_kg) || 0

                                    const saving = devPct != null && devPct <= 0
                                    const color  = deviationColor(devPct)
                                    const bg     = deviationBg(devPct)
                                    const unit   = seuSum?.unit || (row as any).seu?.unit || ''

                                    return (
                                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-2 font-mono text-muted-foreground whitespace-nowrap">
                                                {format(new Date(row.month_year), 'MM/yyyy')}
                                                {(row as any).days > 0 && (
                                                    <span className="text-[10px] text-muted-foreground/50 ml-1">({(row as any).days}d)</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 font-medium flex items-center gap-2 whitespace-nowrap">
                                                {seuSum?.energy_type === 'electricity' || (row as any).seu?.energy_type === 'electricity'
                                                    ? <Zap className="h-3.5 w-3.5 text-blue-500" />
                                                    : seuSum?.energy_type === 'water' || (row as any).seu?.energy_type === 'water'
                                                        ? <Droplets className="h-3.5 w-3.5 text-teal-500" />
                                                        : <Flame className="h-3.5 w-3.5 text-orange-500" />
                                                }
                                                {seuSum?.seu_name || (row as any).seu?.name}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                                                {fmtNum(rcn)} <span className="text-[10px]">kg</span>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono font-semibold">
                                                {fmtNum(actual)} <span className="text-[10px] text-muted-foreground font-normal">{unit}</span>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">
                                                {expected != null ? (
                                                    <>{fmtNum(expected)} <span className="text-[10px] text-muted-foreground font-normal">{unit}</span></>
                                                ) : <span className="text-xs text-muted-foreground italic">N/A</span>}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                {devPct != null ? (
                                                    <Badge variant="outline" className={`font-mono px-1.5 py-0 text-[11px] ${bg} ${color} border-transparent`}>
                                                        {saving ? '' : '+'}{fmtNum(devPct)}%
                                                    </Badge>
                                                ) : <span className="text-xs text-muted-foreground italic">N/A</span>}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <KpiCard
                    icon={<Zap className="h-4 w-4 text-blue-600" />}
                    label="Điện thực tế (MTD)"
                    value={fmtNum(elecSummary?.total_actual)}
                    unit="kWh"
                    color="blue"
                />
                <KpiCard
                    icon={<Flame className="h-4 w-4 text-orange-600" />}
                    label="Củi thực tế (MTD)"
                    value={fmtNum(woodSummary?.total_actual)}
                    unit="kg"
                    color="orange"
                />
                <KpiCard
                    icon={<Droplets className="h-4 w-4 text-teal-600" />}
                    label="Nước thực tế (MTD)"
                    value={fmtNum(waterSummary?.total_actual)}
                    unit="m³"
                    color="teal"
                />
            </div>

            {/* Deviation KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <DeviationCard label="Lệch chuẩn điện" pct={elecSummary?.monthly_deviation_pct} />
                <DeviationCard label="Lệch chuẩn củi" pct={woodSummary?.monthly_deviation_pct} />
                <DeviationCard label="Lệch chuẩn nước" pct={waterSummary?.monthly_deviation_pct} />
            </div>

            {/* EnPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <EnpiCard
                    title="EnPI — Điện"
                    unit="kWh / kg Sản lượng"
                    actual={elecSummary?.monthly_enpi_actual}
                    baseline={elecSummary?.monthly_enpi_baseline}
                />
                <EnpiCard
                    title="EnPI — Củi"
                    unit="kg củi / kg Sản lượng"
                    actual={woodSummary?.monthly_enpi_actual}
                    baseline={woodSummary?.monthly_enpi_baseline}
                />
                <EnpiCard
                    title="EnPI — Nước"
                    unit="m³ / kg Sản lượng"
                    actual={waterSummary?.monthly_enpi_actual}
                    baseline={waterSummary?.monthly_enpi_baseline}
                />
            </div>

            {/* Electricity Chart */}
            {elecChartData.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Zap className="h-4 w-4 text-blue-600" /> Điện: Thực tế vs Đường cơ sở (kWh/ngày)
                        </CardTitle>
                        <CardDescription>Thanh xanh = tiết kiệm, thanh đỏ = vượt chuẩn</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[280px]">
                        <ActualVsExpectedChart data={elecChartData} color="#3B82F6" />
                    </CardContent>
                </Card>
            )}

            {/* Wood/Boiler Chart */}
            {woodChartData.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Flame className="h-4 w-4 text-orange-600" /> Củi: Thực tế vs Đường cơ sở (kg/ngày)
                        </CardTitle>
                        <CardDescription>Thanh xanh = tiết kiệm, thanh đỏ = vượt chuẩn</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[280px]">
                        <ActualVsExpectedChart data={woodChartData} color="#F97316" />
                    </CardContent>
                </Card>
            )}

            {elecChartData.length === 0 && woodChartData.length === 0 && (
                <Card>
                    <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                        Chưa có dữ liệu cho tháng này. Vui lòng nhập dữ liệu ở tab "Nhập liệu".
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

// ─── Sub-components ──────────────────────────────────────────

function KpiCard({ icon, label, value, unit, color }: any) {
    const borderColor = color === 'blue' ? 'border-blue-100' : color === 'teal' ? 'border-teal-100' : 'border-orange-100'
    const bgColor = color === 'blue' ? 'bg-blue-50/40' : color === 'teal' ? 'bg-teal-50/40' : 'bg-orange-50/40'
    const textColor = color === 'blue' ? 'text-blue-700' : color === 'teal' ? 'text-teal-700' : 'text-orange-700'
    return (
        <div className={`rounded-xl border ${borderColor} ${bgColor} p-3`}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{icon}{label}</div>
            <p className={`text-xl font-black ${textColor}`}>
                {value} <span className="text-xs font-semibold">{unit}</span>
            </p>
        </div>
    )
}

function DeviationCard({ label, pct }: { label: string; pct?: number | null }) {
    const isNull = pct == null
    const saving = !isNull && pct <= 0
    const color = deviationColor(pct)
    const bg = deviationBg(pct)
    return (
        <div className={`rounded-xl border ${bg} p-3`}>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            {isNull
                ? <p className="text-sm text-muted-foreground">Chưa có baseline</p>
                : <div className={`flex items-center gap-1.5 text-xl font-black ${color}`}>
                    {saving ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                    {saving ? '' : '+'}{fmtNum(pct)}%
                </div>
            }
        </div>
    )
}

function EnpiCard({ title, unit, actual, baseline }: { title: string; unit: string; actual?: number | null; baseline?: number | null }) {
    const better = actual != null && baseline != null && actual < baseline
    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs text-muted-foreground">{title}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-2xl font-black text-foreground">{fmtNum(actual, 4)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{unit} — thực tế</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-semibold text-muted-foreground">{fmtNum(baseline, 4)}</p>
                        <p className="text-xs text-muted-foreground">baseline</p>
                    </div>
                </div>
                {actual != null && baseline != null && (
                    <Badge variant="outline" className={`mt-2 text-xs ${better ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-red-300 text-red-700 bg-red-50'}`}>
                        {better ? '✓ Tốt hơn baseline' : '⚠ Kém hơn baseline'}
                    </Badge>
                )}
            </CardContent>
        </Card>
    )
}

function ActualVsExpectedChart({ data, color }: { data: any[]; color: string }) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
                    tickFormatter={v => v.toLocaleString('en-US')} width={60} />
                <Tooltip
                    formatter={(val: any, name: any) => [Number(val).toLocaleString('vi-VN'), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#9CA3AF" />
                <Bar dataKey="actual" name="Thực tế" fill={color} opacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Line dataKey="expected" name="Đường cơ sở" stroke="#6B7280" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="5 3" />
            </ComposedChart>
        </ResponsiveContainer>
    )
}
