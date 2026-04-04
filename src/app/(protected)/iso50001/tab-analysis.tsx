"use client"

import { useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { Zap, Flame, Droplets } from "lucide-react"
import {
    ComposedChart, Bar, ReferenceLine, XAxis, YAxis,
    ResponsiveContainer, CartesianGrid, Cell, Tooltip,
} from "recharts"
import { MonthlyHistorical, SeuSummary } from "./types"

// ─── SEU Config ───────────────────────────────────────────────────────
const SEU_CFG: Record<number, {
    label: string; short: string; unit: string
    color: string; bg: string; border: string
    Icon: React.FC<{ className?: string; style?: React.CSSProperties }>
}> = {
    1: { label: 'Điện Toàn NM (EVN)', short: 'EVN', unit: 'kWh', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', Icon: Zap },
    2: { label: 'Củi – Boiler', short: 'Củi', unit: 'kg', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', Icon: Flame },
    3: { label: 'Điện MNK (Peeling)', short: 'MNK', unit: 'kWh', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', Icon: Zap },
    4: { label: 'Điện Shelling', short: 'Shell', unit: 'kWh', color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', Icon: Zap },
    5: { label: 'Nước (Water)', short: 'Nước', unit: 'm³', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4', Icon: Droplets },
}
const SEU_IDS = [1, 2, 3, 4, 5]

// ─── Helpers ──────────────────────────────────────────────────────────
const fmtPct = (v: number | null) => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
const pctChange = (a: number | null, b: number | null) =>
    a == null || b == null || b === 0 ? null : ((a - b) / b) * 100

// ─── Props ────────────────────────────────────────────────────────────
interface Props {
    summaries: SeuSummary[]
    historical: MonthlyHistorical[]
    currentMonth: Date
}

// ─── Main Component ───────────────────────────────────────────────────
export function TabAnalysis({ summaries, historical, currentMonth }: Props) {
    const [prodBase, setProdBase] = useState<'rcn' | 'ck'>('rcn')
    const currKey = format(currentMonth, 'yyyy-MM')

    // Index by month → seu_id
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

    const calcEnpi = (h: MonthlyHistorical | undefined): number | null => {
        if (!h) return null
        const prod = prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : ((h.ck_obtained_mt ?? 0) * 1000)
        return prod > 0 ? h.actual_energy / prod : null
    }

    // 2025 avg EnPI per SEU
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

    // Trend (last 10 months) for each SEU
    const trendFor = (seuId: number) => {
        return allMonths.slice(-10).map(m => {
            const h = histMap[m]?.[seuId]
            const ep = calcEnpi(h)
            return {
                label: format(parseISO(m + '-01'), 'MM/yy'),
                enpi: ep != null ? +ep.toFixed(6) : null,
                isCurrent: m === currKey,
            }
        })
    }

    const prodLabel = prodBase === 'rcn' ? 'kg RCN' : 'MT CK'

    return (
        /* PPT 16:9 container */
        <div
            className="w-full bg-white rounded-xl overflow-hidden border border-slate-200 shadow-xl"
            style={{ aspectRatio: '16/9', fontFamily: "'Inter',system-ui,sans-serif", display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
        >
            {/* ══ HEADER ══════════════════════════════════════════════ */}
            <div
                style={{ background: 'linear-gradient(135deg,#0B2545 0%,#1A4A8A 100%)', flexShrink: 0 }}
                className="flex items-center justify-between px-5 py-2"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                        <Zap className="h-4 w-4 text-yellow-300" />
                    </div>
                    <div>
                        <div className="text-white font-bold text-sm tracking-wide">PHÂN TÍCH NĂNG LƯỢNG ISO 50001</div>
                        <div className="text-blue-200 text-[10px] tracking-widest uppercase">Energy Performance Monthly Report</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-md overflow-hidden border border-white/25 text-[11px]">
                        {(['rcn', 'ck'] as const).map(b => (
                            <button key={b} onClick={() => setProdBase(b)}
                                className={`px-3 py-1 font-semibold transition-colors ${prodBase === b ? 'bg-white text-blue-900' : 'text-white/70 hover:bg-white/10'}`}>
                                {b === 'rcn' ? 'RCN (kg)' : 'CK (MT)'}
                            </button>
                        ))}
                    </div>
                    <div className="px-3 py-1 rounded-md bg-yellow-400 text-blue-900 text-[12px] font-bold">
                        Tháng {format(currentMonth, 'MM/yyyy')}
                    </div>
                </div>
            </div>

            {/* ══ BODY: 5 SEU Panels ══════════════════════════════════ */}
            <div className="flex-1 grid overflow-hidden p-2 gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }}>
                {SEU_IDS.map((id, idx) => {
                    const cfg = SEU_CFG[id]
                    const h = histMap[currKey]?.[id]
                    const actual = h?.actual_energy ?? null
                    const enpi = calcEnpi(h)
                    const avg = avg2025[id]
                    const delta = pctChange(enpi, avg)
                    const prod = h ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
                    const savingAbs = (enpi != null && avg != null && prod != null) ? (avg - enpi) * prod : null
                    const saved = savingAbs != null && savingAbs >= 0
                    const trend = trendFor(id)

                    return (
                        <div
                            key={id}
                            className="rounded-xl overflow-hidden flex flex-col"
                            style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, gridColumn: idx === 4 ? 'span 1' : undefined }}
                        >
                            {/* Card header */}
                            <div className="flex items-center justify-between px-3 pt-2 pb-1">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-6 h-6 rounded-md flex items-center justify-center bg-white/60">
                                        <cfg.Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                                    </div>
                                    <span className="text-[13px] font-bold text-slate-700">{cfg.label}</span>
                                </div>
                                {delta != null && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${delta > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {fmtPct(delta)} vs TB 2025
                                    </span>
                                )}
                            </div>

                            {/* KPI row */}
                            <div className="flex items-end gap-4 px-3 pb-1">
                                <div>
                                    <div className="text-[18px] font-bold tabular-nums leading-none" style={{ color: cfg.color }}>
                                        {actual != null ? Math.round(actual).toLocaleString('vi-VN') : '—'}
                                    </div>
                                    <div className="text-[8px] text-slate-500 mt-0.5">{cfg.unit} · tháng {format(currentMonth, 'MM/yyyy')}</div>
                                </div>
                                <div className="text-right ml-auto">
                                    <div className="text-[9px] text-slate-500">EnPI: <span className="font-bold text-slate-700">{enpi != null ? enpi.toFixed(4) : '—'}</span></div>
                                    <div className="text-[9px] text-slate-400">TB 2025: {avg != null ? avg.toFixed(4) : '—'}</div>
                                    {savingAbs != null && (
                                        <div className={`text-[9px] font-bold ${saved ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {saved ? '↓ TK' : '↑ VM'} {Math.abs(Math.round(savingAbs)).toLocaleString('vi-VN')} {cfg.unit}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Mini bar chart */}
                            <div className="flex-1" style={{ minHeight: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={trend} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 2" stroke="#ffffff80" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval={1} />
                                        <YAxis hide domain={['auto', 'auto']} />
                                        <Tooltip
                                            contentStyle={{ fontSize: '10px', borderRadius: '6px', padding: '4px 8px' }}
                                            formatter={(v: any) => [typeof v === 'number' ? v.toFixed(4) : v, 'EnPI']}
                                        />
                                        {avg != null && (
                                            <ReferenceLine y={avg} stroke="#10B981" strokeDasharray="4 2" strokeWidth={1.5} />
                                        )}
                                        <Bar dataKey="enpi" radius={[2, 2, 0, 0]} maxBarSize={28}>
                                            {trend.map((d, i) => (
                                                <Cell key={i} fill={d.isCurrent ? cfg.color : `${cfg.color}50`} />
                                            ))}
                                        </Bar>
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )
                })}

                {/* ── Slot 6: KPI Summary Card ────────────────────── */}
                <div className="rounded-xl overflow-hidden flex flex-col p-3 gap-2"
                    style={{ background: 'linear-gradient(145deg,#0B2545 0%,#1A4A8A 100%)', border: '1.5px solid #1E3A5F' }}>
                    {/* Title */}
                    <div>
                        <div className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">Tổng kết tháng</div>
                        <div className="text-[22px] font-black text-yellow-400 leading-tight">{format(currentMonth, 'MM/yyyy')}</div>
                        <div className="text-[9px] text-blue-300">ISO 50001 · Energy KPI</div>
                    </div>
                    {/* Per-SEU KPI rows */}
                    <div className="flex flex-col gap-1 flex-1">
                        {SEU_IDS.map(id => {
                            const cfg = SEU_CFG[id]
                            const h = histMap[currKey]?.[id]
                            const actual = h?.actual_energy ?? null
                            const enpi = calcEnpi(h)
                            const avg = avg2025[id]
                            const delta = pctChange(enpi, avg)
                            const prod = h ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
                            const sv = (enpi != null && avg != null && prod != null) ? (avg - enpi) * prod : null
                            const saved = sv != null && sv >= 0
                            return (
                                <div key={id} className="flex items-center justify-between rounded-md px-2 py-1"
                                    style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <div className="flex items-center gap-1.5">
                                        <cfg.Icon className="h-3 w-3" style={{ color: cfg.color }} />
                                        <span className="text-[10px] font-semibold text-white/80">{cfg.short}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[11px] font-bold text-white tabular-nums">
                                            {actual != null ? Math.round(actual).toLocaleString('vi-VN') : '—'}
                                        </span>
                                        <span className="text-[8px] text-blue-300 ml-1">{cfg.unit}</span>
                                    </div>
                                    {delta != null && (
                                        <span className={`text-[9px] font-bold ml-2 px-1.5 py-0.5 rounded-full min-w-[52px] text-center ${delta > 0 ? 'bg-red-500/30 text-red-300' : 'bg-emerald-500/30 text-emerald-300'}`}>
                                            {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                                        </span>
                                    )}
                                    {sv != null && (
                                        <span className={`text-[8px] font-semibold ml-1 min-w-[60px] text-right ${saved ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {saved ? 'TK' : 'VM'} {Math.abs(Math.round(sv)).toLocaleString('vi-VN')}
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <div className="text-[8px] text-blue-300/60 text-center pt-1 border-t border-white/10">
                        EnPI = {prodBase === 'rcn' ? 'unit / kg RCN' : 'unit / MT CK'}
                    </div>
                </div>
            </div>

            {/* ══ FOOTER ══════════════════════════════════════════════ */}
            <div className="flex items-center justify-between px-5 py-1.5" style={{ background: '#F1F5F9', borderTop: '1px solid #E2E8F0', flexShrink: 0 }}>
                <span className="text-[8px] text-slate-400">
                    <span className="font-semibold text-slate-600">ISO 50001 EnMS</span> · Intersnack DDS · {format(new Date(), 'dd/MM/yyyy')}
                </span>
                <div className="flex items-center gap-5 text-[9px]">
                    {SEU_IDS.map(id => {
                        const cfg = SEU_CFG[id]
                        const h = histMap[currKey]?.[id]
                        const enpi = calcEnpi(h)
                        const avg = avg2025[id]
                        const prod = h ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
                        const sv = (enpi != null && avg != null && prod != null) ? (avg - enpi) * prod : null
                        if (sv == null) return null
                        return (
                            <div key={id} className="flex items-center gap-1">
                                <cfg.Icon className="h-2.5 w-2.5" style={{ color: cfg.color }} />
                                <span className="text-slate-500">{cfg.short}:</span>
                                <span className={`font-bold ${sv >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {sv >= 0 ? '↓' : '↑'}{Math.abs(Math.round(sv)).toLocaleString('vi-VN')} {cfg.unit}
                                </span>
                            </div>
                        )
                    })}
                    <div className="text-slate-400 pl-2 border-l border-slate-300">
                        EnPI = {prodBase === 'rcn' ? 'unit/kg RCN' : 'unit/MT CK'} &nbsp;|&nbsp; <span className="inline-block w-5 border-t border-dashed border-emerald-500 align-middle" /> TB 2025
                    </div>
                </div>
            </div>
        </div>
    )
}
