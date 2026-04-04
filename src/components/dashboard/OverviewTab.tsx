"use client"

import { format } from "date-fns"
import { TrendingUp, TrendingDown, Zap, Droplets, Package, Factory, Leaf } from "lucide-react"
import {
    Bar, CartesianGrid, Cell, ComposedChart, Line,
    PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, Legend
} from "recharts"

// ─── Types ───────────────────────────────────────────────────────────────────
interface DashboardSummary {
    totalActual: number; totalPlan: number; totalPlanMTD: number
    totalActualIsp: number; totalPlanIsp: number
    achivementPct: number; downtime: number
    [key: string]: any
}

interface DashboardEntry { summary: DashboardSummary; history: any[] }

interface SeuData {
    /** kWh total electricity (SEU #1) */
    elecKwh: number
    /** kWh compressor / MNK (SEU #2) */
    mnkKwh: number
    /** kWh shelling electricity (SEU #3) */
    shellingKwh: number
    /** kg wood fuel (SEU #4) — DB stores as kg */
    woodKg: number
    /** RCN production tons */
    rcnTons: number
    /** Peeling output tons (for MNK intensity) */
    peelingTons: number
    /** Shelling output tons */
    shellingTons: number
    // Baselines / targets
    elecTarget: number   // kWh/RCN ton
    mnkTarget: number    // kWh/RCN ton (peeling)
    shellingTarget: number // kWh/kg shelling out
    woodTarget: number   // kg/kg RCN
}

interface OverviewTabProps {
    selectedMonth: Date
    departments: { id: string; name_en: string; name_vi: string; code: string }[]
    dashboardsData: Record<string, DashboardEntry>
    kpiSummary: {
        steamActual: number; steamTarget: number
        fgwhActual: number; fgwhTarget: number
        contActual: number; contTarget: number
        elecActual: number; elecTarget: number
        waterActual: number; waterTarget: number
        woodActual: number; woodTarget: number
        totalEmission: number; totalEmissionTarget: number
    }
    seuData: SeuData
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
const MiniTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-xl p-2.5 text-[10px] z-50">
            <p className="font-bold text-slate-700 mb-1.5 border-b pb-1">{label}</p>
            {payload.map((e: any, i: number) => (
                <div key={i} className="flex justify-between gap-4">
                    <span className="text-slate-500 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }} />
                        {e.name}
                    </span>
                    <span className="font-black text-slate-800">{Number(e.value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</span>
                </div>
            ))}
        </div>
    )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, sub, pct, icon: Icon, color, inverse }: {
    label: string; value: string; unit: string; sub: string
    pct: number; icon: any; color: string; inverse?: boolean
}) {
    const isGood = inverse ? pct <= 100 : pct >= 100
    const displayColor = isGood ? '#10b981' : pct >= (inverse ? 110 : 85) ? '#f59e0b' : '#E30613'
    const Arrow = isGood ? TrendingUp : TrendingDown

    return (
        <div className="bg-white/85 backdrop-blur-xl border border-white/50 rounded-xl p-3 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ backgroundColor: displayColor }} />
            <div className="flex justify-between items-start mb-1">
                <span className="text-[8px] text-slate-400 uppercase font-bold tracking-widest leading-tight">{label}</span>
                <Icon className="h-4 w-4" style={{ color: displayColor }} />
            </div>
            <div>
                <div className="flex items-baseline gap-1">
                    <span className="text-[22px] font-black text-slate-800 tracking-tighter leading-none">{value}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{unit}</span>
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">{sub}</div>
            </div>
            <div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-2 mb-1">
                    <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: displayColor }} />
                </div>
                <div className="flex items-center gap-1">
                    <Arrow className="w-3 h-3" style={{ color: displayColor }} />
                    <span className="text-[9px] font-black" style={{ color: displayColor }}>{pct.toFixed(1)}%</span>
                    <span className="text-[8px] text-slate-400">vs Target</span>
                </div>
            </div>
        </div>
    )
}

// ─── SEU Card ─────────────────────────────────────────────────────────────────
function SeuCard({
    label, icon, intensity, target, unit, color, miss
}: {
    label: string; icon: string; intensity: number; target: number
    unit: string; color: string; miss: boolean
}) {
    const pctVsBaseline = target > 0 ? ((intensity / target) - 1) * 100 : 0
    const isMet = !miss
    const statusColor = isMet ? '#10b981' : '#E30613'
    const barFill = Math.min((intensity / (target * 1.3)) * 100, 100)
    return (
        <div className="bg-white/85 backdrop-blur-xl border border-white/50 rounded-xl p-3 shadow-sm relative overflow-hidden flex flex-col gap-1.5">
            <div className="absolute top-0 left-0 bottom-0 w-[4px] rounded-l-xl" style={{ backgroundColor: color }} />
            <div className="flex items-start justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 leading-tight">
                    {icon} {label}
                </span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    isMet ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}>
                    {isMet ? '✓ MET' : '✗ MISS'}
                </span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-[22px] font-black tracking-tighter leading-none" style={{ color }}>
                    {intensity > 0 ? intensity.toFixed(1) : '—'}
                </span>
                <span className="text-[9px] text-slate-400">{unit}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${barFill}%`, backgroundColor: color }} />
            </div>
            <div className="flex justify-between items-center">
                <span className="text-[8px] text-slate-400">Baseline: <strong className="text-slate-600">{target}</strong></span>
                <span className="text-[9px] font-black" style={{ color: statusColor }}>
                    {pctVsBaseline >= 0 ? '▲' : '▼'} {Math.abs(pctVsBaseline).toFixed(1)}%
                </span>
            </div>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function OverviewTab({
    selectedMonth, departments, dashboardsData, kpiSummary, seuData
}: OverviewTabProps) {
    const allSum = dashboardsData['all']?.summary
    const allHistory = dashboardsData['all']?.history || []

    // KPI data
    const totalPct = allSum?.achivementPct || 0
    const contPct = kpiSummary.contTarget > 0 ? (kpiSummary.contActual / kpiSummary.contTarget) * 100 : 0
    const elecPct = kpiSummary.elecTarget > 0 ? (kpiSummary.elecActual / kpiSummary.elecTarget) * 100 : 0
    const waterPct = kpiSummary.waterTarget > 0 ? (kpiSummary.waterActual / kpiSummary.waterTarget) * 100 : 0
    const co2Pct = kpiSummary.totalEmissionTarget > 0 ? (kpiSummary.totalEmission / kpiSummary.totalEmissionTarget) * 100 : 0

    // Region donut data
    const regionData = [
        { name: 'RCN', value: Number((dashboardsData['region-RCN']?.summary?.totalActual || 0).toFixed(1)), fill: '#E30613' },
        { name: 'LCA', value: Number((dashboardsData['region-LCA']?.summary?.totalActual || 0).toFixed(1)), fill: '#1d4ed8' },
        { name: 'HCA', value: Number((dashboardsData['region-HCA']?.summary?.totalActual || 0).toFixed(1)), fill: '#059669' },
    ].filter(d => d.value > 0)

    // Dept rows — ẩn dept không có data (actual=0 AND plan=0)
    const deptRows = departments.filter(d => d.code !== 'FGWH').map(dept => {
        const s = dashboardsData[dept.id]?.summary
        return {
            name: dept.name_en, code: dept.code,
            pct: s?.achivementPct || 0,
            actual: s?.totalActual || 0,
            plan: s?.totalPlanMTD || s?.totalPlan || 0,
            downtime: s?.downtime || 0,
            badge: ''
        }
    }).filter(row => row.actual > 0 || row.plan > 0)

    // Add FGWH ISP
    const fgwhPct = kpiSummary.fgwhTarget > 0 ? (kpiSummary.fgwhActual / kpiSummary.fgwhTarget) * 100 : 0
    deptRows.push({ name: 'FGWH – ISP', code: 'FGWH', pct: fgwhPct, actual: kpiSummary.fgwhActual, plan: kpiSummary.fgwhTarget, downtime: 0, badge: 'ISP' })

    // Add Container
    deptRows.push({ name: 'Container', code: 'CONT', pct: contPct, actual: kpiSummary.contActual, plan: kpiSummary.contTarget, downtime: 0, badge: 'CNT' })



    // Energy list
    const energyItems = [
        { label: 'Electricity', actual: kpiSummary.elecActual, target: kpiSummary.elecTarget, unit: 'kWh', icon: '⚡', color: '#eab308', pct: elecPct },
        { label: 'Water', actual: kpiSummary.waterActual, target: kpiSummary.waterTarget, unit: 'm³', icon: '💧', color: '#3b82f6', pct: waterPct },
        { label: 'Wood Fuel', actual: kpiSummary.woodActual, target: kpiSummary.woodTarget, unit: 'kg', icon: '🪵', color: '#f97316', pct: kpiSummary.woodTarget > 0 ? (kpiSummary.woodActual / kpiSummary.woodTarget) * 100 : 0 },
    ]

    // SEU intensities
    const rcnT = seuData.rcnTons || 1
    const peelT = seuData.peelingTons || 1
    const shellT = seuData.shellingTons || 1

    const seu1 = rcnT > 0 ? seuData.elecKwh / rcnT : 0           // kWh / RCN ton
    const seu2 = peelT > 0 ? seuData.mnkKwh / peelT : 0          // kWh / peeling ton
    const seu3 = shellT > 0 ? seuData.shellingKwh / (shellT * 1000) : 0 // kWh / kg shelling
    const seu4 = rcnT > 0 ? seuData.woodKg / (rcnT * 1000) : 0   // kg / kg RCN

    const seuCards = [
        { label: 'SEU #1 — Điện Tổng NM', icon: '⚡', intensity: seu1, target: seuData.elecTarget, unit: 'kWh/RCN', color: '#E30613', miss: seu1 > seuData.elecTarget },
        { label: 'SEU #2 — Máy Nén Khí', icon: '💨', intensity: seu2, target: seuData.mnkTarget, unit: 'kWh/T Peel', color: '#1D4E8A', miss: seu2 > seuData.mnkTarget },
        { label: 'SEU #3 — Điện Shelling', icon: '🌀', intensity: seu3 * 1000, target: seuData.shellingTarget * 1000, unit: 'kWh/T Shell', color: '#E18E00', miss: seu3 > seuData.shellingTarget },
        { label: 'SEU #4 — Lò Hơi (Củi)', icon: '🪵', intensity: seu4 * 1000, target: seuData.woodTarget * 1000, unit: 'g/kg RCN', color: '#89A21D', miss: seu4 > seuData.woodTarget },
    ]

    return (
        <div className="flex flex-col gap-2 overflow-hidden h-[calc(100vh-152px)]">

            {/* ── HEADER STRIP ── */}
            <div className="flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-[#E30613]/8 via-white/70 to-white/50 backdrop-blur-sm border border-white/60 rounded-xl px-4 py-2">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-7 bg-[#E30613] rounded-full shadow-sm" />
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-black uppercase tracking-wider text-slate-800">Production Overview</span>
                        <span className="text-slate-300 text-lg">|</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Performance Analysis</span>
                    </div>
                    <span className="text-[9px] text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                        {format(selectedMonth, 'MMMM yyyy')}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
                    <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wider">Live</span>
                </div>
            </div>

            {/* ── 5 KPI CARDS ── */}
            <div className="grid grid-cols-5 gap-2 flex-shrink-0">
                <KpiCard label="Total Output MTD" value={(allSum?.totalActual || 0).toFixed(1)} unit="T"
                    sub={`/ ${(allSum?.totalPlanMTD || 0).toFixed(1)} T plan`} pct={totalPct} icon={Factory} color="#E30613" />
                <KpiCard label="Container MTD" value={kpiSummary.contActual.toFixed(0)} unit="Cont"
                    sub={`/ ${kpiSummary.contTarget.toFixed(0)} Cont`} pct={contPct} icon={Package} color="#7c3aed" />
                <KpiCard label="Electricity" value={(kpiSummary.elecActual / 1000).toFixed(1)} unit="MWh"
                    sub={`/ ${(kpiSummary.elecTarget / 1000).toFixed(1)} MWh`} pct={elecPct} icon={Zap} color="#eab308" inverse />
                <KpiCard label="Water" value={kpiSummary.waterActual.toFixed(0)} unit="m³"
                    sub={`/ ${kpiSummary.waterTarget.toFixed(0)} m³`} pct={waterPct} icon={Droplets} color="#3b82f6" inverse />
                <KpiCard label="CO₂e Emission" value={kpiSummary.totalEmission.toFixed(1)} unit="T CO₂e"
                    sub={`/ ${kpiSummary.totalEmissionTarget} T`} pct={co2Pct} icon={Leaf} color="#10b981" inverse />
            </div>

            {/* ── MAIN GRID ── */}
            <div className="grid grid-cols-12 gap-2 flex-1 min-h-0">

                {/* LEFT: Dept Achievement */}
                <div className="col-span-4 bg-white/80 backdrop-blur-xl border border-white/50 rounded-xl p-3 flex flex-col min-h-0">
                    <p className="text-[8px] font-black uppercase tracking-widest text-[#E30613] mb-2 flex-shrink-0 flex items-center gap-1.5">
                        <span className="w-1 h-3.5 bg-[#E30613] rounded-full inline-block" />
                        Department Achievement MTD
                    </p>
                    <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto pr-0.5 scrollbar-thin">
                        {deptRows.map((row, i) => {
                            const isGood = row.pct >= 100
                            const isMid = row.pct >= 88
                            const dotColor = isGood ? '#10b981' : isMid ? '#f59e0b' : '#E30613'
                            const bgCls = isGood ? 'bg-emerald-50 border-emerald-100' : isMid ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
                            const textCls = isGood ? 'text-emerald-700' : isMid ? 'text-amber-700' : 'text-red-700'
                            const unit = row.code === 'CONT' ? 'Cont' : 'T'
                            return (
                                <div key={i} className={`rounded-lg border px-2.5 py-1.5 ${bgCls}`}>
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                                            <span className="text-[10px] font-bold text-slate-700">{row.name}</span>
                                            {row.badge && (
                                                <span className={`text-[7px] px-1 py-0.5 rounded font-black uppercase ${row.code === 'FGWH' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                                                    {row.badge}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {row.downtime > 0 && (() => {
                                                const h = Math.floor(row.downtime / 60)
                                                const m = row.downtime % 60
                                                const dtLabel = h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`
                                                return <span className="text-[8px] text-orange-500 font-medium">▼{dtLabel}</span>
                                            })()}
                                            <span className={`text-[11px] font-black tabular-nums ${textCls}`}>
                                                {row.pct.toFixed(0)}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 bg-white/70 rounded-full overflow-hidden mb-1">
                                        <div className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${Math.min(row.pct, 100)}%`, backgroundColor: dotColor }} />
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[8px] text-slate-400 font-medium tabular-nums">
                                            Actual: <strong className="text-slate-600">{row.actual.toFixed(1)}</strong>
                                        </span>
                                        <span className="text-[8px] text-slate-400 font-medium tabular-nums">
                                            Plan MTD: {row.plan.toFixed(1)} {unit}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* CENTER: Charts */}
                <div className="col-span-5 flex flex-col gap-2 min-h-0">

                    {/* Daily Trend */}
                    <div className="flex-1 bg-white/80 backdrop-blur-xl border border-white/50 rounded-xl p-3 min-h-0 flex flex-col">
                        <p className="text-[8px] font-black uppercase tracking-widest text-blue-500 mb-1 flex-shrink-0 flex items-center gap-1.5">
                            <span className="w-1 h-3.5 bg-blue-500 rounded-full inline-block" />
                            Daily Production Trend — Actual vs Plan (Tons)
                        </p>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={allHistory} margin={{ top: 4, right: 4, left: -22, bottom: 14 }}>
                                    <defs>
                                        <linearGradient id="ovGreen" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                                            <stop offset="100%" stopColor="#059669" stopOpacity={0.65} />
                                        </linearGradient>
                                        <linearGradient id="ovRed" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#E30613" stopOpacity={0.95} />
                                            <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.65} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                                        height={16}
                                        tickFormatter={(v) => {
                                            const d = parseInt(v)
                                            return (!isNaN(d) && [1, 8, 15, 22, 29].includes(d)) ? v : ''
                                        }}
                                        interval={0} />
                                    <Tooltip content={<MiniTooltip />} cursor={{ fill: 'rgba(226,232,240,0.35)' }} />
                                    <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '2px' }} />
                                    <Bar dataKey="Actual" name="Actual (T)" radius={[2, 2, 0, 0]}>
                                        {allHistory.map((entry: any, index: number) => (
                                            <Cell key={`ov-${index}`}
                                                fill={(entry.Plan > 0 && entry.Actual < entry.Plan) ? "url(#ovRed)" : "url(#ovGreen)"} />
                                        ))}
                                    </Bar>
                                    <Line type="step" dataKey="Plan" name="Plan (T)" stroke="#94a3b8"
                                        strokeDasharray="3 3" dot={false} strokeWidth={1.5} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Downtime by Department */}
                    {(() => {
                        const downtimeRows = deptRows
                            .filter(r => r.downtime > 0 && r.code !== 'FGWH' && r.code !== 'CONT')
                            .sort((a, b) => b.downtime - a.downtime)
                        const maxDt = downtimeRows[0]?.downtime || 1
                        const totalDt = downtimeRows.reduce((s, r) => s + r.downtime, 0)
                        return (
                            <div className="flex-shrink-0 bg-white/80 backdrop-blur-xl border border-white/50 rounded-xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
                                        <span className="w-1 h-3.5 bg-orange-500 rounded-full inline-block" />
                                        Downtime by Department (MTD)
                                    </p>
                                    <span className="text-[9px] font-black text-orange-600 tabular-nums bg-orange-50 px-1.5 py-0.5 rounded-full border border-orange-100">
                                        {totalDt >= 60 ? `${Math.floor(totalDt / 60)}h ${totalDt % 60}m` : `${totalDt}m`} total
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    {downtimeRows.length === 0 ? (
                                        <span className="text-[9px] text-slate-400 italic">Không có downtime</span>
                                    ) : downtimeRows.map((row, i) => {
                                        const barPct = (row.downtime / maxDt) * 100
                                        const hrs = Math.floor(row.downtime / 60)
                                        const mins = row.downtime % 60
                                        const label = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins}m`
                                        const barColor = row.downtime > 1000 ? '#e63121' : row.downtime > 500 ? '#f59e0b' : '#94a3b8'
                                        return (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="text-[8px] font-bold text-slate-500 w-14 shrink-0 truncate">{row.name.replace(' MC', '').replace('Peeling', 'Peel')}</span>
                                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{ width: `${barPct}%`, backgroundColor: barColor }}
                                                    />
                                                </div>
                                                <span className="text-[8px] font-black tabular-nums w-10 text-right shrink-0" style={{ color: barColor }}>{label}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })()}
                </div>

                {/* RIGHT: Donut + Energy */}
                <div className="col-span-3 flex flex-col gap-2 min-h-0">

                    {/* Output by Region - Donut */}
                    <div className="flex-1 bg-white/80 backdrop-blur-xl border border-white/50 rounded-xl p-3 flex flex-col min-h-0">
                        <p className="text-[8px] font-black uppercase tracking-widest text-purple-500 mb-1 flex-shrink-0 flex items-center gap-1.5">
                            <span className="w-1 h-3.5 bg-purple-500 rounded-full inline-block" />
                            Output by Region (Tons)
                        </p>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={regionData} dataKey="value" nameKey="name"
                                        cx="50%" cy="48%" innerRadius="42%" outerRadius="70%"
                                        paddingAngle={3}
                                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                        labelLine={false}
                                        style={{ fontSize: 9, fontWeight: 700 }}>
                                        {regionData.map((entry, index) => (
                                            <Cell key={`rc-${index}`} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(val: any) => [`${Number(val).toFixed(1)} T`]} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        {/* Legend */}
                        <div className="flex-shrink-0 flex flex-col gap-1 pt-1 border-t border-slate-100">
                            {regionData.map(r => {
                                const total = regionData.reduce((a, b) => a + b.value, 0)
                                const pct = total > 0 ? (r.value / total * 100).toFixed(1) : '0'
                                return (
                                    <div key={r.name} className="flex items-center justify-between text-[9px]">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: r.fill }} />
                                            <span className="text-slate-600 font-bold">{r.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-black text-slate-700 tabular-nums">{r.value.toFixed(1)} T</span>
                                            <span className="text-slate-400">({pct}%)</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Energy Snapshot */}
                    <div className="flex-shrink-0 bg-white/80 backdrop-blur-xl border border-white/50 rounded-xl p-3">
                        <p className="text-[8px] font-black uppercase tracking-widest text-orange-500 mb-2 flex items-center gap-1.5">
                            <span className="w-1 h-3.5 bg-orange-500 rounded-full inline-block" />
                            Energy & Emission Snapshot
                        </p>
                        <div className="flex flex-col gap-2">
                            {energyItems.map((e, i) => {
                                const isGood = e.pct <= 100
                                const barColor = isGood ? e.color : '#E30613'
                                return (
                                    <div key={i}>
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className="text-[9px] text-slate-600 font-semibold">{e.icon} {e.label}</span>
                                            <span className={`text-[9px] font-black tabular-nums ${isGood ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {e.pct.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-700"
                                                style={{ width: `${Math.min(e.pct, 100)}%`, backgroundColor: barColor }} />
                                        </div>
                                        <div className="text-[7px] text-slate-400 mt-0.5 tabular-nums">
                                            {Number(e.actual).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} / {Number(e.target).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} {e.unit}
                                        </div>
                                    </div>
                                )
                            })}
                            {/* CO2e */}
                            <div>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] text-slate-600 font-semibold">🌿 CO₂e Scope 1+2</span>
                                    <span className={`text-[9px] font-black tabular-nums ${co2Pct <= 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {co2Pct.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700"
                                        style={{ width: `${Math.min(co2Pct, 100)}%`, backgroundColor: co2Pct <= 100 ? '#10b981' : '#E30613' }} />
                                </div>
                                <div className="text-[7px] text-slate-400 mt-0.5 tabular-nums">
                                    {kpiSummary.totalEmission.toFixed(1)} / {kpiSummary.totalEmissionTarget} T CO₂e
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── SEU ISO 50001 PANEL ── */}
            <div className="flex-shrink-0 bg-gradient-to-r from-slate-900/95 to-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl p-3 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="w-1 h-4 bg-[#E30613] rounded-full inline-block" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">ISO 50001 — SEU Intensity MTD</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold border ${
                            seuCards.filter(s => s.miss).length === 0
                                ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40'
                                : 'bg-red-900/40 text-red-400 border-red-700/40'
                        }`}>
                            {seuCards.filter(s => s.miss).length === 0 ? 'ALL MET ✓' : `${seuCards.filter(s => s.miss).length} MISS`}
                        </span>
                    </div>
                    <span className="text-[8px] text-slate-500 font-mono">
                        RCN: {seuData.rcnTons.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} T
                    </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {seuCards.map((s, i) => (
                        <SeuCard key={i} {...s} />
                    ))}
                </div>
            </div>
        </div>
    )
}
