"use client"

import { AlertTriangle, Clock, Gauge, LineChart as LineChartIcon, Target, Users } from "lucide-react"
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
    const bestLine = [...data.lines].sort((a, b) => b.tph - a.tph)[0]
    const highestBrokenLine = [...data.lines].sort((a, b) => b.brokenPct - a.brokenPct)[0]
    const highestDowntimeLine = [...data.lines].sort((a, b) => b.downtimeMin - a.downtimeMin)[0]
    const topDowntimeCause = data.rootCauses[0]
    const topDowntimeMachine = data.machineDowntime[0]
    const comparison = data.comparison
    const planGap = data.totals.actual - data.totals.plan
    const lineDowntimeTotal = data.lines.reduce((sum, row) => sum + row.downtimeMin, 0)
    const bestDays = [...data.daily].filter((row) => row.plan > 0 || row.actual > 0).sort((a, b) => b.actual - a.actual).slice(0, 5)
    const riskDays = [...data.daily].filter((row) => row.plan > 0).sort((a, b) => a.achievementPct - b.achievementPct).slice(0, 5)
    const qualityAlerts = data.alerts.slice(0, 8)
    const productionLabel = data.totals.achievementPct >= 100 ? "??t k? ho?ch" : "ch?a ??t k? ho?ch"
    const stabilityNote = data.weekly.length > 1
        ? `Tu?n y?u nh?t l? ${[...data.weekly].filter((row) => row.plan > 0).sort((a, b) => a.achievementPct - b.achievementPct)[0]?.name ?? "N/A"}; c?n ??c c?ng downtime ?? tr?nh ??nh gi? ch? theo t?ng th?ng.`
        : "Ch?a ?? d? li?u tu?n ?? ??nh gi? ?? ?n ??nh trong th?ng."

    const executiveNotes = [
        `Shelling ${productionLabel}: ${fmt(data.totals.actual, 1)} T actual / ${fmt(data.totals.plan, 1)} T plan, ch?nh ${planGap >= 0 ? "+" : ""}${fmt(planGap, 1)} T.`,
        `N?ng su?t b?nh qu?n ??t ${fmt(data.totals.productivityTph, 3)} T/h v?i ${fmt(data.totals.hours, 1)} gi? ch?y line v? ${fmt(data.totals.tonPerMan, 2)} T/man-shift.`,
        `Broken b?nh qu?n c? tr?ng s? l? ${fmt(data.totals.brokenPct, 2)}%, ${data.totals.brokenPct > 5.5 ? "v??t" : "d??i"} ng??ng m?c ti?u 5,5%.`,
        topDowntimeCause ? `Downtime l?n nh?t thu?c nh?m ${topDowntimeCause.name}, chi?m ${fmt(topDowntimeCause.share, 1)}% t?ng downtime event.` : "Ch?a c? downtime event trong k? b?o c?o.",
        stabilityNote,
    ]

    const actionPlan = [
        highestDowntimeLine ? `Kh?a nguy?n nh?n downtime line ${highestDowntimeLine.name}: daily review theo root cause, ca, m?y/khu v?c; m?c ti?u gi?m ?t nh?t 15-20% ph?t d?ng trong th?ng k? ti?p.` : "Chu?n h?a ghi nh?n downtime theo line/ca ?? x?c ??nh bottleneck ch?nh x?c h?n.",
        highestBrokenLine ? `M? containment ch?t l??ng cho line ${highestBrokenLine.name}: ki?m tra size mix, dao/c? m?y, ?? ?m nguy?n li?u v? ca c? alert broken cao.` : "Duy tr? ki?m so?t broken theo t?ng line c? s?n l??ng ??ng k?.",
        weakestLine ? `T?ch b?i to?n n?ng su?t line ${weakestLine.name}: so s?nh setup, manpower v? th?i gian ch? v?i line benchmark ${bestLine?.name ?? "t?t nh?t"}.` : "B? sung d? li?u line ?? ph?n t?ch n?ng su?t theo bottleneck.",
        topDowntimeCause ? `V?i nh?m ${topDowntimeCause.name}, l?p Pareto 3 nguy?n nh?n con v? owner h?nh ??ng trong h?p s?n xu?t h?ng ng?y.` : "Thi?t l?p Pareto downtime chu?n tr??c khi ph?n c?ng h?nh ??ng.",
    ]

    return (
        <div className="space-y-4 pb-8">
            <section className="overflow-hidden rounded-xl border border-white/70 bg-white/75 shadow-sm">
                <div className="bg-slate-950 px-5 py-5 text-white">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <div className="mb-2 flex items-center gap-2">
                                <Badge className="bg-red-600 text-white hover:bg-red-600">Monthly Report</Badge>
                                <Badge variant="outline" className="border-white/20 text-slate-200">Shelling</Badge>
                            </div>
                            <h3 className="text-2xl font-black tracking-tight md:text-3xl">Shelling Monthly Report</h3>
                            <p className="mt-1 text-sm font-medium text-slate-300">Full-month operating review: {data.period.label}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-right">
                            <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2"><p className="text-[10px] font-bold uppercase text-slate-300">Ng?y SX</p><p className="text-xl font-black">{data.coverage.activeDays}</p></div>
                            <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2"><p className="text-[10px] font-bold uppercase text-slate-300">D?ng line</p><p className="text-xl font-black">{data.coverage.lineRows}</p></div>
                            <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2"><p className="text-[10px] font-bold uppercase text-slate-300">Events</p><p className="text-xl font-black">{data.coverage.downtimeEvents}</p></div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <ReportStat label="Actual / Plan" value={`${fmt(data.totals.actual, 1)} T`} sub={`${fmt(data.totals.achievementPct, 1)}% k? ho?ch`} icon={Target} tone={achievementTone} />
                <ReportStat label="Productivity" value={`${fmt(data.totals.productivityTph, 3)} T/h`} sub={`${fmt(data.totals.hours, 1)} gi? ch?y`} icon={Gauge} tone="blue" />
                <ReportStat label="Downtime" value={hours(data.totals.downtimeMin)} sub={`${fmt(data.totals.downtimeMin, 0)} ph?t event`} icon={Clock} tone="red" />
                <ReportStat label="Broken" value={`${fmt(data.totals.brokenPct, 2)}%`} sub="M?c ti?u ki?m so?t 5,5%" icon={AlertTriangle} tone={brokenTone} />
                <ReportStat label="Manpower" value={`${fmt(data.totals.tonPerMan, 2)} T/man`} sub={`${fmt(data.totals.manpower, 0)} man-shift`} icon={Users} tone="slate" />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Executive summary</p>
                    <h4 className="mt-1 text-lg font-black text-slate-900">Nh?n ??nh ?i?u h?nh th?ng</h4>
                    <div className="mt-4 space-y-3">{executiveNotes.map((note) => <p key={note} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{note}</p>)}</div>
                </CardContent></Card>
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Data coverage</p>
                    <h4 className="mt-1 text-lg font-black text-slate-900">?? ph? d? li?u</h4>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-bold text-slate-700">
                        <div className="rounded-lg bg-slate-50 p-3">Plan rows<br/><span className="text-xl font-black text-slate-900">{data.coverage.planRows}</span></div>
                        <div className="rounded-lg bg-slate-50 p-3">Actual days<br/><span className="text-xl font-black text-slate-900">{data.coverage.actualRows}</span></div>
                        <div className="rounded-lg bg-slate-50 p-3">Line rows<br/><span className="text-xl font-black text-slate-900">{data.coverage.lineRows}</span></div>
                        <div className="rounded-lg bg-slate-50 p-3">Downtime events<br/><span className="text-xl font-black text-slate-900">{data.coverage.downtimeEvents}</span></div>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-slate-500">Ghi ch?: s? li?u production ?u ti?n daily actual; n?ng su?t, broken, manpower v? downtime line l?y t? d? li?u line/ca.</p>
                </CardContent></Card>
            </section>

            {comparison && (
                <section className="rounded-xl border border-white/70 bg-white/85 p-4 shadow-sm">
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Month over month</p><h4 className="text-lg font-black text-slate-900">So v?i th?ng tr??c</h4></div>
                        <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 text-slate-600">Previous: {comparison.previousLabel}</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-5">
                        {[
                            { label: "Actual", value: `${comparison.actualDelta > 0 ? "+" : ""}${fmt(comparison.actualDelta, 1)} T`, good: comparison.actualDelta >= 0 },
                            { label: "Achievement", value: `${comparison.achievementDelta > 0 ? "+" : ""}${fmt(comparison.achievementDelta, 1)} pts`, good: comparison.achievementDelta >= 0 },
                            { label: "Productivity", value: `${comparison.productivityDelta > 0 ? "+" : ""}${fmt(comparison.productivityDelta, 2)} T/h`, good: comparison.productivityDelta >= 0 },
                            { label: "Broken", value: `${comparison.brokenDelta > 0 ? "+" : ""}${fmt(comparison.brokenDelta, 2)} pts`, good: comparison.brokenDelta <= 0 },
                            { label: "Downtime", value: `${comparison.downtimeDelta > 0 ? "+" : ""}${fmt(comparison.downtimeDelta, 0)} min`, good: comparison.downtimeDelta <= 0 },
                        ].map((metric) => <div key={metric.label} className={`rounded-lg border p-3 ${metric.good ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><p className={`text-[10px] font-black uppercase tracking-widest ${metric.good ? "text-emerald-600" : "text-red-600"}`}>{metric.label}</p><p className={`mt-2 text-xl font-black ${metric.good ? "text-emerald-700" : "text-red-700"}`}>{metric.value}</p></div>)}
                    </div>
                    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{comparison.summary}</p>
                </section>
            )}

            <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Daily production</p><h4 className="text-lg font-black text-slate-900">Actual vs plan ? broken overlay</h4></div><LineChartIcon className="h-5 w-5 text-slate-400" /></div>
                    <div className="h-[310px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.daily} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={10} /><YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#ef4444" }} tickLine={false} axisLine={false} /><Tooltip content={<MiniTooltip />} /><Bar yAxisId="left" dataKey="actual" name="Actual T" radius={[4, 4, 0, 0]}>{data.daily.map((row) => <Cell key={row.date} fill={row.achievementPct >= 100 ? "#10b981" : row.achievementPct >= 85 ? "#f59e0b" : "#ef4444"} />)}</Bar><Line yAxisId="left" type="monotone" dataKey="plan" name="Plan T" stroke="#64748b" strokeDasharray="4 4" dot={false} strokeWidth={2} /><Line yAxisId="right" type="monotone" dataKey="brokenPct" name="Broken %" stroke="#ef4444" dot={false} strokeWidth={2} /></ComposedChart></ResponsiveContainer></div>
                </CardContent></Card>
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Weekly cadence</p><h4 className="mb-3 text-lg font-black text-slate-900">Ti?n ?? theo tu?n</h4>
                    <div className="h-[310px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.weekly} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><Tooltip content={<MiniTooltip />} /><Bar dataKey="achievementPct" name="Achievement %" radius={[4, 4, 0, 0]}>{data.weekly.map((row) => <Cell key={row.name} fill={row.achievementPct >= 100 ? "#10b981" : row.achievementPct >= 85 ? "#f59e0b" : "#ef4444"} />)}</Bar></BarChart></ResponsiveContainer></div>
                </CardContent></Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Line performance</p><h4 className="mb-3 text-lg font-black text-slate-900">S?n l??ng ? n?ng su?t ? broken</h4><BucketRows rows={data.lines} mode="line" /></CardContent></Card>
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Shift performance</p><h4 className="mb-3 text-lg font-black text-slate-900">Ph?n t?ch theo ca</h4><BucketRows rows={data.shifts} mode="shift" /></CardContent></Card>
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Size mix</p><h4 className="mb-3 text-lg font-black text-slate-900">Size mix risk</h4><BucketRows rows={data.sizes} mode="size" /></CardContent></Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Downtime Pareto</p><h4 className="mb-3 text-lg font-black text-slate-900">Root cause v? m?y/khu v?c</h4><div className="grid gap-4 md:grid-cols-2"><div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rootCauseChart} dataKey="minutes" nameKey="name" innerRadius={54} outerRadius={90} paddingAngle={2}>{rootCauseChart.map((row) => <Cell key={row.name} fill={row.fill} />)}</Pie><Tooltip content={<MiniTooltip />} /></PieChart></ResponsiveContainer></div><div className="space-y-2">{data.rootCauses.slice(0, 6).map((row) => <div key={row.name} className="rounded-lg border border-slate-100 bg-slate-50 p-3"><div className="flex justify-between text-sm font-black text-slate-800"><span>{row.name}</span><span>{fmt(row.share, 1)}%</span></div><p className="mt-1 text-xs font-semibold text-slate-500">{fmt(row.events, 0)} events ? {hours(row.minutes)}</p></div>)}</div></div><p className="mt-3 text-xs font-semibold text-slate-500">Downtime line ?? ghi nh?n: {hours(lineDowntimeTotal)}; downtime event: {hours(data.totals.downtimeMin)}.</p></CardContent></Card>
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Top downtime area</p><h4 className="mb-3 text-lg font-black text-slate-900">M?y/khu v?c ?nh h??ng l?n</h4><div className="space-y-2">{data.machineDowntime.slice(0, 8).map((row) => <div key={row.name} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3"><div><p className="text-sm font-black text-slate-800">{row.name}</p><p className="text-xs font-semibold text-slate-500">{fmt(row.events, 0)} events</p></div><p className="text-sm font-black text-red-600">{hours(row.minutes)}</p></div>)}</div></CardContent></Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Best days</p><h4 className="mb-3 text-lg font-black text-slate-900">5 ng?y s?n l??ng cao nh?t</h4><div className="space-y-2">{bestDays.map((row) => <div key={row.date} className="grid grid-cols-4 gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-slate-700"><span>{row.name}</span><span>{fmt(row.actual, 1)} T</span><span>{fmt(row.achievementPct, 1)}%</span><span>{fmt(row.brokenPct, 2)}% broken</span></div>)}</div></CardContent></Card>
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Risk days</p><h4 className="mb-3 text-lg font-black text-slate-900">5 ng?y c?n review</h4><div className="space-y-2">{riskDays.map((row) => <div key={row.date} className="grid grid-cols-4 gap-2 rounded-lg bg-red-50 p-3 text-sm font-bold text-slate-700"><span>{row.name}</span><span>{fmt(row.actual, 1)} T</span><span>{fmt(row.achievementPct, 1)}%</span><span>{hours(row.downtimeMin)}</span></div>)}</div></CardContent></Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-5"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Quality alerts</p><h4 className="mt-1 text-lg font-black text-slate-900">C?c d?ng c? broken cao</h4><div className="mt-4 space-y-2">{qualityAlerts.length ? qualityAlerts.map((row) => <div key={`${row.date}-${row.line}-${row.shift}-${row.size}`} className="rounded-lg border border-red-100 bg-red-50 p-3"><div className="flex justify-between gap-3 text-sm font-black text-red-700"><span>{row.date} ? Line {row.line} ? {row.shift}</span><span>{fmt(row.brokenPct, 2)}%</span></div><p className="mt-1 text-xs font-semibold text-slate-600">Size {row.size} ? {fmt(row.ton, 2)} T ? Leader: {row.leader}</p></div>) : <p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Kh?ng c? alert broken v??t ng??ng trong d? li?u hi?n t?i.</p>}</div></CardContent></Card>
                <Card className="rounded-xl border-white/70 bg-white/85 py-0 shadow-sm"><CardContent className="p-5"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Action plan</p><h4 className="mt-1 text-lg font-black text-slate-900">Khuy?n ngh? h?nh ??ng sau b?o c?o</h4><div className="mt-4 space-y-3">{actionPlan.map((note, index) => <div key={note} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{index + 1}</span><p className="text-sm font-semibold text-slate-700">{note}</p></div>)}</div></CardContent></Card>
            </section>
        </div>
    )
}
