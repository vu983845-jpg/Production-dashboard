"use client"

import { useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { Zap, Flame, Droplets, TrendingUp, TrendingDown } from "lucide-react"
import {
    ComposedChart, Bar, ReferenceLine, XAxis, YAxis,
    ResponsiveContainer, Tooltip, CartesianGrid, Cell,
} from "recharts"
import { MonthlyHistorical, SeuSummary } from "./types"

// ─── SEU Config ──────────────────────────────────────────────────────────────
const SEU_CFG: Record<number, { label: string; short: string; unit: string; color: string; bg: string; border: string; Icon: React.FC<{ className?: string; style?: React.CSSProperties }> }> = {
    1: { label: 'Điện Toàn NM', short: 'EVN', unit: 'kWh', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', Icon: Zap },
    2: { label: 'Củi (Boiler)', short: 'Củi', unit: 'kg', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', Icon: Flame },
    3: { label: 'Điện MNK', short: 'MNK', unit: 'kWh', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', Icon: Zap },
    4: { label: 'Điện Shelling', short: 'Shell', unit: 'kWh', color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', Icon: Zap },
    5: { label: 'Nước', short: 'Nước', unit: 'm³', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4', Icon: Droplets },
}
const SEU_IDS = [1, 2, 3, 4, 5]

// ─── Helpers ─────────────────────────────────────────────────────────────────
const vi = (v: number | null | undefined, d = 0) =>
    v == null ? '—' : Math.abs(v).toLocaleString('vi-VN', { maximumFractionDigits: d })

const pct = (a: number | null, b: number | null) =>
    a == null || b == null || b === 0 ? null : ((a - b) / b) * 100

const fmtPct = (v: number | null) =>
    v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
    summaries: SeuSummary[]
    historical: MonthlyHistorical[]
    currentMonth: Date
}

// ─── Component ───────────────────────────────────────────────────────────────
export function TabAnalysis({ summaries, historical, currentMonth }: Props) {
    const [prodBase, setProdBase] = useState<'rcn' | 'ck'>('rcn')
    const [selSeu, setSelSeu] = useState<number>(1)

    const currKey = format(currentMonth, 'yyyy-MM')

    // Index historical by month → seu_id
    const histMap = useMemo<Record<string, Record<number, MonthlyHistorical>>>(() => {
        const m: Record<string, Record<number, MonthlyHistorical>> = {}
        for (const h of historical) {
            const mo = h.month_year.slice(0, 7)
            if (!m[mo]) m[mo] = {}
            m[mo][h.seu_id] = h
        }
        return m
    }, [historical])

    const allMonths = useMemo(() => Object.keys(histMap).sort(), [histMap])

    // Compute EnPI for one record
    const calcEnpi = (h: MonthlyHistorical | undefined): number | null => {
        if (!h) return null
        const prod = prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : ((h.ck_obtained_mt ?? 0) * 1000)
        return prod > 0 ? h.actual_energy / prod : null
    }

    // 2025 average EnPI per SEU
    const avg2025 = useMemo<Record<number, number | null>>(() => {
        const res: Record<number, number | null> = {}
        for (const id of SEU_IDS) {
            const vals = allMonths
                .filter(m => m.startsWith('2025'))
                .map(m => calcEnpi(histMap[m]?.[id]))
                .filter((v): v is number => v != null)
            res[id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        }
        return res
    }, [histMap, allMonths, prodBase])

    // Current month EnPI & actual per SEU
    const currData = useMemo(() => {
        const res: Record<number, { enpi: number | null; actual: number | null; prod: number | null }> = {}
        for (const id of SEU_IDS) {
            const h = histMap[currKey]?.[id]
            const prod = h ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
            res[id] = { enpi: calcEnpi(h), actual: h?.actual_energy ?? null, prod }
        }
        return res
    }, [histMap, currKey, prodBase])

    // Saving vs 2025 avg (energy units): positive = saved
    const saving = useMemo(() => {
        const res: Record<number, number | null> = {}
        for (const id of SEU_IDS) {
            const { enpi, prod } = currData[id]
            const avg = avg2025[id]
            res[id] = (enpi != null && avg != null && prod != null) ? (avg - enpi) * prod : null
        }
        return res
    }, [currData, avg2025])

    // 12-month bar chart data for selected SEU
    const trendData = useMemo(() => {
        return allMonths.slice(-13).map(m => {
            const h = histMap[m]?.[selSeu]
            const ep = calcEnpi(h)
            return {
                label: format(parseISO(m + '-01'), 'MM/yy'),
                enpi: ep != null ? +ep.toFixed(6) : null,
                isCurrent: m === currKey,
            }
        })
    }, [allMonths, selSeu, histMap, currKey, prodBase])

    const cfg = SEU_CFG[selSeu]
    const prodLabel = prodBase === 'rcn' ? 'kg RCN' : 'MT CK'
    const ref2025 = avg2025[selSeu]
    const currPct = pct(currData[selSeu].enpi, ref2025)
    const currSaving = saving[selSeu]

    return (
        /* ── PPT container 16:9 ── */
        <div
            className="w-full bg-white rounded-xl overflow-hidden border border-slate-200 shadow-xl"
            style={{ aspectRatio: '16/9', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
        >
            {/* ═══ HEADER ═══════════════════════════════════════════════════════ */}
            <div
                style={{ background: 'linear-gradient(135deg,#0B2545 0%,#1A4A8A 100%)', flexShrink: 0 }}
                className="flex items-center justify-between px-5 py-2"
            >
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/15">
                        <Zap className="h-4 w-4 text-yellow-300" />
                    </div>
                    <div>
                        <div className="text-white font-bold text-sm tracking-wide">PHÂN TÍCH NĂNG LƯỢNG ISO 50001</div>
                        <div className="text-blue-200 text-[10px] tracking-widest uppercase">Energy Performance Monthly Report · {format(currentMonth, 'MM/yyyy')}</div>
                    </div>
                </div>
                {/* Controls */}
                <div className="flex items-center gap-2">
                    {/* Prod base */}
                    <div className="flex rounded-md overflow-hidden border border-white/25 text-[11px]">
                        {(['rcn', 'ck'] as const).map(b => (
                            <button key={b} onClick={() => setProdBase(b)}
                                className={`px-3 py-1 font-semibold transition-colors ${prodBase === b ? 'bg-white text-blue-900' : 'text-white/70 hover:bg-white/10'}`}>
                                {b === 'rcn' ? 'RCN (kg)' : 'CK (MT)'}
                            </button>
                        ))}
                    </div>
                    {/* Badge month */}
                    <div className="px-3 py-1 rounded-md bg-yellow-400 text-blue-900 text-[11px] font-bold">
                        Tháng {format(currentMonth, 'MM/yyyy')}
                    </div>
                </div>
            </div>

            {/* ═══ BODY ═══════════════════════════════════════════════════════ */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── LEFT: SEU KPI cards ──────────────────────────────────── */}
                <div className="flex flex-col gap-1.5 p-2.5 overflow-hidden" style={{ width: '27%', flexShrink: 0, background: '#F8FAFC', borderRight: '1px solid #E2E8F0' }}>
                    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest px-1">SEU Performance</div>
                    {SEU_IDS.map(id => {
                        const c = SEU_CFG[id]
                        const { enpi: ep, actual: act } = currData[id]
                        const sv = saving[id]
                        const delta = pct(ep, avg2025[id])
                        const isSel = selSeu === id
                        const saved = sv != null && sv >= 0
                        return (
                            <button key={id} onClick={() => setSelSeu(id)}
                                className="w-full text-left rounded-lg px-2.5 py-2 transition-all"
                                style={{
                                    background: isSel ? c.bg : 'white',
                                    border: isSel ? `1.5px solid ${c.color}` : `1px solid ${c.border}`,
                                    boxShadow: isSel ? `0 0 0 2px ${c.color}20` : 'none',
                                }}>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: c.bg }}>
                                            <c.Icon className="h-3 w-3" style={{ color: c.color }} />
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-700">{c.short}</span>
                                    </div>
                                    {delta != null && (
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${delta > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {fmtPct(delta)}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-end justify-between">
                                    <div>
                                        <div className="text-[14px] font-bold tabular-nums leading-none" style={{ color: c.color }}>
                                            {act != null ? Math.round(act).toLocaleString('vi-VN') : '—'}
                                        </div>
                                        <div className="text-[8px] text-slate-400 mt-0.5">{c.unit}</div>
                                    </div>
                                    {sv != null && (
                                        <div className={`text-[9px] font-semibold text-right ${saved ? 'text-emerald-600' : 'text-red-500'}`}>
                                            <div>{saved ? '▼ tiết kiệm' : '▲ vượt mức'}</div>
                                            <div className="tabular-nums">{vi(Math.abs(sv), 0)} {c.unit}</div>
                                        </div>
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* ── RIGHT: Chart + Detail ────────────────────────────────── */}
                <div className="flex flex-col flex-1 overflow-hidden">

                    {/* SEU selector pills */}
                    <div className="flex items-center gap-1.5 px-4 pt-2">
                        {SEU_IDS.map(id => {
                            const c = SEU_CFG[id]
                            return (
                                <button key={id} onClick={() => setSelSeu(id)}
                                    className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all"
                                    style={selSeu === id ? { background: c.color, color: 'white' } : { background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                                    {c.short}
                                </button>
                            )
                        })}
                        <div className="ml-auto text-[9px] text-slate-400">
                            EnPI = {cfg.unit} / {prodLabel}
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="flex-1 px-4 pt-1 pb-0" style={{ minHeight: 0 }}>
                        <div className="flex items-start justify-between mb-0.5">
                            <div>
                                <div className="text-[10px] font-bold text-slate-700">
                                    Xu hướng EnPI — {cfg.label}
                                    <span className="ml-1 font-normal text-slate-400">({cfg.unit}/{prodLabel})</span>
                                </div>
                                {ref2025 != null && (
                                    <div className="text-[9px] text-emerald-600 flex items-center gap-1">
                                        <span className="inline-block w-4 border-t-2 border-dashed border-emerald-500" />
                                        Trung bình 2025: {ref2025.toFixed(4)} {cfg.unit}/{prodLabel}
                                    </div>
                                )}
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height="88%">
                            <ComposedChart data={trendData} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                                    tickFormatter={v => typeof v === 'number' ? v.toFixed(3) : v} width={50} />
                                <Tooltip
                                    contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '6px 10px' }}
                                    formatter={(v: any) => [typeof v === 'number' ? v.toFixed(5) : v, `EnPI (${cfg.unit}/${prodLabel})`]}
                                />
                                {ref2025 != null && (
                                    <ReferenceLine y={ref2025} stroke="#10B981" strokeDasharray="5 3" strokeWidth={1.5}
                                        label={{ value: 'TB 2025', fill: '#10B981', fontSize: 9, position: 'insideTopRight' }} />
                                )}
                                <Bar dataKey="enpi" radius={[3, 3, 0, 0]} maxBarSize={36} name={`EnPI`}>
                                    {trendData.map((d, i) => (
                                        <Cell key={i} fill={d.isCurrent ? cfg.color : `${cfg.color}55`} />
                                    ))}
                                </Bar>
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    {/* ── Stats row ─────────────────────────────────────────── */}
                    <div className="grid grid-cols-4 gap-2 px-4 pb-3" style={{ flexShrink: 0 }}>
                        {/* Actual */}
                        <StatCard
                            label="Thực tế tháng này"
                            value={currData[selSeu].actual != null ? Math.round(currData[selSeu].actual!).toLocaleString('vi-VN') : '—'}
                            sub={cfg.unit}
                            bg={cfg.bg} border={cfg.border} color={cfg.color}
                        />
                        {/* EnPI */}
                        <StatCard
                            label={`EnPI (${cfg.unit}/${prodLabel})`}
                            value={currData[selSeu].enpi != null ? currData[selSeu].enpi!.toFixed(4) : '—'}
                            sub={`vs TB 2025: ${ref2025 != null ? ref2025.toFixed(4) : '—'}`}
                            bg="#F8FAFC" border="#E2E8F0" color="#334155"
                        />
                        {/* vs 2025 avg */}
                        <StatCard
                            label="So với TB 2025"
                            value={fmtPct(currPct)}
                            sub={currPct == null ? '—' : currPct > 0 ? '⚠ Tiêu thụ cao hơn' : '✓ Tiêu thụ thấp hơn'}
                            bg={currPct == null ? '#F8FAFC' : currPct > 0 ? '#FEF2F2' : '#F0FDF4'}
                            border={currPct == null ? '#E2E8F0' : currPct > 0 ? '#FECACA' : '#BBF7D0'}
                            color={currPct == null ? '#334155' : currPct > 0 ? '#DC2626' : '#16A34A'}
                        />
                        {/* Saving */}
                        <StatCard
                            label={currSaving == null ? 'Tiết kiệm' : currSaving >= 0 ? '✓ Tiết kiệm được' : '⚠ Vượt mức'}
                            value={currSaving != null ? `${Math.abs(Math.round(currSaving)).toLocaleString('vi-VN')}` : '—'}
                            sub={`${cfg.unit} vs TB 2025`}
                            bg={currSaving == null ? '#F8FAFC' : currSaving >= 0 ? '#F0FDF4' : '#FEF2F2'}
                            border={currSaving == null ? '#E2E8F0' : currSaving >= 0 ? '#BBF7D0' : '#FECACA'}
                            color={currSaving == null ? '#334155' : currSaving >= 0 ? '#16A34A' : '#DC2626'}
                        />
                    </div>
                </div>
            </div>

            {/* ═══ FOOTER ════════════════════════════════════════════════════ */}
            <div className="flex items-center justify-between px-5 py-1.5" style={{ background: '#F1F5F9', borderTop: '1px solid #E2E8F0', flexShrink: 0 }}>
                <div className="text-[8px] text-slate-400">
                    <span className="font-semibold text-slate-600">ISO 50001 EnMS</span> · Intersnack DDS · Xuất: {format(new Date(), 'dd/MM/yyyy')}
                </div>
                {/* Footer savings summary all SEUs */}
                <div className="flex items-center gap-4">
                    {SEU_IDS.map(id => {
                        const sv = saving[id]
                        if (sv == null) return null
                        const c = SEU_CFG[id]
                        const saved = sv >= 0
                        return (
                            <div key={id} className="flex items-center gap-1 text-[9px]">
                                <c.Icon className="h-2.5 w-2.5" style={{ color: c.color }} />
                                <span className="text-slate-500">{c.short}:</span>
                                <span className={`font-bold ${saved ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {saved ? '↓' : '↑'}{Math.abs(Math.round(sv)).toLocaleString('vi-VN')} {c.unit}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// ─── StatCard sub-component ──────────────────────────────────────────────────
function StatCard({ label, value, sub, bg, border, color }: {
    label: string; value: string; sub: string; bg: string; border: string; color: string
}) {
    return (
        <div className="rounded-lg p-2.5" style={{ background: bg, border: `1px solid ${border}` }}>
            <div className="text-[7px] font-bold text-slate-500 uppercase tracking-wide mb-1">{label}</div>
            <div className="text-[16px] font-bold tabular-nums leading-tight" style={{ color }}>{value}</div>
            <div className="text-[8px] text-slate-400 mt-0.5">{sub}</div>
        </div>
    )
}
