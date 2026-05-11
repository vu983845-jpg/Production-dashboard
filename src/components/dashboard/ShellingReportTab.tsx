"use client"

import { AlertTriangle, CalendarDays, Clock, Factory, Gauge, LineChart as LineChartIcon, Target, Users } from "lucide-react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Line,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { ShellingReportBucket, ShellingReportData } from "@/lib/hooks/useDashboardData"

interface ShellingReportTabProps {
    data: ShellingReportData
}

const fmt = (value: number, digits = 1) => value.toLocaleString("vi-VN", { maximumFractionDigits: digits })
const hours = (minutes: number) => `${fmt(minutes / 60, 1)}h`

function ReportStat({ label, value, sub, icon: Icon, tone }: {
    label: string
    value: string
    sub: string
    icon: typeof Target
    tone: "green" | "red" | "amber" | "blue" | "slate"
}) {
    const toneMap = {
        green: "border-emerald-200 bg-emerald-50 text-emerald-700",
        red: "border-red-200 bg-red-50 text-red-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
        blue: "border-sky-200 bg-sky-50 text-sky-700",
        slate: "border-slate-200 bg-slate-50 text-slate-700",
    }

    return (
        <Card className="rounded-lg border-white/70 bg-white/85 py-0 shadow-sm">
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                        <div className="mt-2 flex items-baseline gap-1">
                            <span className="text-2xl font-black leading-none tracking-tight text-slate-900">{value}</span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">{sub}</p>
                    </div>
                    <div className={`rounded-lg border p-2 ${toneMap[tone]}`}>
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function MiniTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-xl">
            <p className="mb-2 border-b pb-1 font-black text-slate-700">{label}</p>
            <div className="space-y-1.5">
                {payload.map((entry: any) => (
                    <div key={entry.dataKey} className="flex items-center justify-between gap-5">
                        <span className="flex items-center gap-1.5 text-slate-500">
                            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
                            {entry.name}
                        </span>
                        <span className="font-black text-slate-800">{fmt(Number(entry.value), 2)}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function BucketRows({ rows, mode }: { rows: ShellingReportBucket[]; mode: "line" | "shift" | "size" }) {
    const visible = rows.slice(0, mode === "size" ? 6 : rows.length)
    return (
        <div className="space-y-2">
            {visible.map((row) => {
                const bar = Math.min(row.share, 100)
                const isQualityRisk = row.brokenPct > 5.5
                return (
                    <div key={`${mode}-${row.name}`} className="rounded-lg border border-slate-100 bg-white/75 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-slate-900 px-2 text-xs font-black text-white">{row.name}</span>
                                <div>
                                    <p className="text-sm font-black text-slate-800">{fmt(row.actual, 1)} T</p>
                                    <p className="text-[10px] font-medium text-slate-400">{fmt(row.tph, 2)} T/h · {fmt(row.tonPerMan, 2)} T/man</p>
                                </div>
                            </div>
                            <Badge variant="outline" className={isQualityRisk ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                                {fmt(row.brokenPct, 2)}% broken
                            </Badge>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${isQualityRisk ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${bar}%` }} />
                        </div>
                        <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-400">
                            <span>{fmt(row.share, 1)}% share</span>
                            <span>{hours(row.downtimeMin)} downtime</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export function ShellingReportTab({ data }: ShellingReportTabProps) {
    const achievementTone = data.totals.achievementPct >= 100 ? "green" : data.totals.achievementPct >= 85 ? "amber" : "red"
    const brokenTone = data.totals.brokenPct <= 5.5 ? "green" : "red"
    const rootCauseChart = data.rootCauses.slice(0, 5).map((row, index) => ({
        ...row,
        fill: ["#ef4444", "#f59e0b", "#0ea5e9", "#6366f1", "#64748b"][index] || "#94a3b8",
    }))
    const weakestLine = [...data.lines].sort((a, b) => a.tph - b.tph)[0]
    const highestBrokenLine = [...data.lines].sort((a, b) => b.brokenPct - a.brokenPct)[0]
    const topDowntimeCause = data.rootCauses[0]
    const topDowntimeMachine = data.machineDowntime[0]
    const comments = [
        {
            title: "Nhận xét sản lượng",
            body: data.totals.achievementPct >= 100
                ? `Kỳ này Shelling đạt kế hoạch, nhưng vẫn cần kiểm tra tính ổn định theo tuần để tránh phụ thuộc vào vài ngày chạy vượt.`
                : `Sản lượng chưa đạt kế hoạch; ưu tiên xem lại các ngày/tuần có achievement thấp trong biểu đồ weekly cadence.`,
        },
        {
            title: "Nhận xét chất lượng",
            body: highestBrokenLine
                ? `Broken đang tập trung mạnh ở line ${highestBrokenLine.name} (${fmt(highestBrokenLine.brokenPct, 2)}%). Cần kiểm tra size chạy chính, dao cắt, setup máy và điều kiện nguyên liệu trong các ca bị cảnh báo.`
                : "Chưa đủ dữ liệu broken để đưa ra nhận xét chất lượng.",
        },
        {
            title: "Nhận xét downtime",
            body: topDowntimeCause
                ? `${topDowntimeCause.name} là nguyên nhân downtime lớn nhất (${fmt(topDowntimeCause.share, 1)}%). Khu vực chịu ảnh hưởng nhiều nhất là ${topDowntimeMachine?.name ?? "N/A"}, cần review theo ca để tách lỗi cấp liệu, chờ ẩm và lỗi thiết bị.`
                : "Chưa có downtime event trong kỳ báo cáo.",
        },
        {
            title: "Hành động đề xuất",
            body: weakestLine
                ? `Theo dõi riêng line ${weakestLine.name} vì năng suất thấp nhất (${fmt(weakestLine.tph, 2)} T/h). Nếu line này cải thiện, output tổng sẽ tăng mà không cần mở rộng thêm nhân sự.`
                : "Chưa đủ dữ liệu line để đề xuất hành động cụ thể.",
        },
    ]

    return (
        <div className="space-y-4 pb-8">
            <section className="overflow-hidden rounded-xl border border-white/70 bg-white/75 shadow-sm">
                <div className="bg-slate-950 px-5 py-5 text-white">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <div className="mb-2 flex items-center gap-2">
                                <Badge className="bg-red-600 text-white hover:bg-red-600">Weekly Operating Report</Badge>
                                <Badge variant="outline" className="border-white/20 text-slate-200">Shelling</Badge>
                            </div>
                            <h3 className="text-2xl font-black tracking-tight md:text-3xl">Shelling performance report</h3>
                            <p className="mt-1 text-sm font-medium text-slate-300">{data.period.label} · cập nhật theo tháng đang chọn</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-right">
                            <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
                                <p className="text-[10px] font-bold uppercase text-slate-300">Active days</p>
                                <p className="text-xl font-black">{data.coverage.activeDays}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
                                <p className="text-[10px] font-bold uppercase text-slate-300">Line rows</p>
                                <p className="text-xl font-black">{data.coverage.lineRows}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
                                <p className="text-[10px] font-bold uppercase text-slate-300">Events</p>
                                <p className="text-xl font-black">{data.coverage.downtimeEvents}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <ReportStat label="Actual / Plan" value={`${fmt(data.totals.actual, 1)} T`} sub={`${fmt(data.totals.plan, 1)} T plan · ${fmt(data.totals.achievementPct, 1)}%`} icon={Target} tone={achievementTone} />
                <ReportStat label="Productivity" value={`${fmt(data.totals.productivityTph, 2)} T/h`} sub={`${fmt(data.totals.hours, 1)} running hours`} icon={Gauge} tone="blue" />
                <ReportStat label="Broken rate" value={`${fmt(data.totals.brokenPct, 2)}%`} sub="Target threshold 5.5%" icon={AlertTriangle} tone={brokenTone} />
                <ReportStat label="Downtime" value={hours(data.totals.downtimeMin)} sub={`${fmt(data.totals.downtimeMin, 0)} minutes`} icon={Clock} tone="amber" />
                <ReportStat label="Manpower" value={`${fmt(data.totals.tonPerMan, 2)} T`} sub={`${fmt(data.totals.manpower, 0)} man-shifts`} icon={Users} tone="slate" />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Daily production</p>
                                <h4 className="text-lg font-black text-slate-900">Actual vs plan · broken overlay</h4>
                            </div>
                            <LineChartIcon className="h-5 w-5 text-slate-400" />
                        </div>
                        <div className="h-[310px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={data.daily} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={10} />
                                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#ef4444" }} tickLine={false} axisLine={false} />
                                    <Tooltip content={<MiniTooltip />} />
                                    <Bar yAxisId="left" dataKey="actual" name="Actual T" radius={[4, 4, 0, 0]}>
                                        {data.daily.map((row) => (
                                            <Cell key={row.date} fill={row.achievementPct >= 100 ? "#10b981" : row.achievementPct >= 85 ? "#f59e0b" : "#ef4444"} />
                                        ))}
                                    </Bar>
                                    <Line yAxisId="left" type="monotone" dataKey="plan" name="Plan T" stroke="#64748b" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                                    <Line yAxisId="right" type="monotone" dataKey="brokenPct" name="Broken %" stroke="#ef4444" dot={false} strokeWidth={2} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Weekly cadence</p>
                                <h4 className="text-lg font-black text-slate-900">Báo cáo định kỳ theo tuần</h4>
                            </div>
                            <CalendarDays className="h-5 w-5 text-slate-400" />
                        </div>
                        <div className="h-[310px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.weekly} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                                    <Tooltip content={<MiniTooltip />} />
                                    <Bar dataKey="achievementPct" name="Achievement %" radius={[5, 5, 0, 0]}>
                                        {data.weekly.map((row) => (
                                            <Cell key={row.name} fill={row.achievementPct >= 100 ? "#10b981" : row.achievementPct >= 85 ? "#f59e0b" : "#ef4444"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm">
                    <CardContent className="p-4">
                        <h4 className="mb-3 text-lg font-black text-slate-900">Line performance</h4>
                        <BucketRows rows={data.lines} mode="line" />
                    </CardContent>
                </Card>
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm">
                    <CardContent className="p-4">
                        <h4 className="mb-3 text-lg font-black text-slate-900">Shift performance</h4>
                        <BucketRows rows={data.shifts} mode="shift" />
                    </CardContent>
                </Card>
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm">
                    <CardContent className="p-4">
                        <h4 className="mb-3 text-lg font-black text-slate-900">Size mix risk</h4>
                        <BucketRows rows={data.sizes} mode="size" />
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm">
                    <CardContent className="p-4">
                        <h4 className="mb-3 text-lg font-black text-slate-900">Downtime root causes</h4>
                        <div className="grid gap-4 md:grid-cols-[190px_1fr]">
                            <div className="h-[190px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={rootCauseChart} dataKey="minutes" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3} />
                                        <Tooltip content={<MiniTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-2">
                                {data.rootCauses.slice(0, 5).map((row) => (
                                    <div key={row.name} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white/70 px-3 py-2">
                                        <div>
                                            <p className="text-sm font-black text-slate-800">{row.name}</p>
                                            <p className="text-[10px] font-medium text-slate-400">{row.events} events</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-800">{hours(row.minutes)}</p>
                                            <p className="text-[10px] font-bold text-red-500">{fmt(row.share, 1)}%</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm">
                    <CardContent className="p-4">
                        <h4 className="mb-3 text-lg font-black text-slate-900">Broken alerts</h4>
                        <div className="overflow-hidden rounded-lg border border-slate-100">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Date</th>
                                        <th className="px-3 py-2 text-left">Line</th>
                                        <th className="px-3 py-2 text-left">Size</th>
                                        <th className="px-3 py-2 text-left">Leader</th>
                                        <th className="px-3 py-2 text-right">Broken</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.alerts.map((row) => (
                                        <tr key={`${row.date}-${row.line}-${row.shift}-${row.brokenPct}`} className="bg-white/60">
                                            <td className="px-3 py-2 font-bold text-slate-700">{row.date.slice(5)}</td>
                                            <td className="px-3 py-2 text-slate-600">{row.line} · {row.shift}</td>
                                            <td className="px-3 py-2 text-slate-600">{row.size}</td>
                                            <td className="px-3 py-2 text-slate-600">{row.leader}</td>
                                            <td className="px-3 py-2 text-right font-black text-red-600">{fmt(row.brokenPct, 2)}%</td>
                                        </tr>
                                    ))}
                                    {data.alerts.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-3 py-8 text-center text-sm font-medium text-slate-400">Không có ca vượt ngưỡng broken 5.5%.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-3 md:grid-cols-5">
                {data.insights.map((insight, index) => (
                    <div key={insight} className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Insight {index + 1}</p>
                        <p className="text-sm font-bold leading-snug text-slate-800">{insight}</p>
                    </div>
                ))}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white/85 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Comments</p>
                        <h4 className="text-lg font-black text-slate-900">Nhận xét định kỳ của báo cáo</h4>
                    </div>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">Auto generated</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {comments.map((comment) => (
                        <div key={comment.title} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                            <p className="mb-2 text-sm font-black text-slate-900">{comment.title}</p>
                            <p className="text-sm font-medium leading-relaxed text-slate-600">{comment.body}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
