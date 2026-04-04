"use client"

import { useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { Zap, Flame, Droplets, Globe } from "lucide-react"
import {
    ComposedChart, Bar, ReferenceLine, XAxis, YAxis,
    ResponsiveContainer, CartesianGrid, Cell, Tooltip,
} from "recharts"
import { MonthlyHistorical, SeuSummary } from "./types"

// ─── i18n ─────────────────────────────────────────────────────────────
type Lang = 'vi' | 'en'
const T = {
    title:      { vi: 'PHÂN TÍCH NĂNG LƯỢNG ISO 50001', en: 'ISO 50001 ENERGY PERFORMANCE ANALYSIS' },
    subtitle:   { vi: 'Báo cáo hiệu suất năng lượng tháng', en: 'Energy Performance Monthly Report' },
    month:      { vi: 'Tháng', en: 'Month' },
    vs_avg:     { vi: 'vs TB 2025', en: 'vs Avg 2025' },
    vs_bl:      { vi: 'vs Baseline', en: 'vs Baseline' },
    avg2025:    { vi: 'TB 2025', en: 'Avg 2025' },
    baseline:   { vi: 'Đường Baseline', en: 'Baseline' },
    saved:      { vi: 'TK', en: 'Saved' },
    over:       { vi: 'VM', en: 'Over' },
    saving_tk:  { vi: '↓ Tiết kiệm', en: '↓ Saving' },
    over_vm:    { vi: '↑ Vượt mức', en: '↑ Over budget' },
    enpi:       { vi: 'EnPI', en: 'EnPI' },
    kpi_title:  { vi: 'TỔNG KẾT THÁNG', en: 'MONTHLY KPI' },
    kpi_sub:    { vi: 'ISO 50001 · Energy KPI', en: 'ISO 50001 · Energy KPI' },
    enpi_unit:  { vi: 'unit / kg RCN', en: 'unit / kg RCN' },
    enpi_ck:    { vi: 'unit / MT CK', en: 'unit / MT CK' },
    footer_co:  { vi: 'ISO 50001 EnMS', en: 'ISO 50001 EnMS' },
    no_bl:      { vi: 'Chưa có baseline', en: 'No baseline' },
}
const t = (key: keyof typeof T, lang: Lang) => T[key][lang]

// ─── SEU Config ───────────────────────────────────────────────────────
const SEU_CFG: Record<number, {
    label: (lang: Lang) => string
    short: string; unit: string
    color: string; bg: string; border: string; muted: string
    Icon: React.FC<{ className?: string; style?: React.CSSProperties }>
}> = {
    1: {
        label: (l) => l === 'vi' ? 'Điện Toàn NM (EVN)' : 'Total Plant Electricity',
        short: 'EVN', unit: 'kWh',
        color: '#1D4ED8', bg: '#F0F4FF', border: '#C7D7FD', muted: '#1D4ED815',
        Icon: Zap
    },
    2: {
        label: (l) => l === 'vi' ? 'Củi – Boiler' : 'Wood – Boiler',
        short: 'Củi', unit: 'kg',
        color: '#B45309', bg: '#FFFBF0', border: '#FDE68A', muted: '#B4530915',
        Icon: Flame
    },
    3: {
        label: (l) => l === 'vi' ? 'Điện MNK (Peeling)' : 'MNK Electricity (Peeling)',
        short: 'MNK', unit: 'kWh',
        color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', muted: '#6D28D915',
        Icon: Zap
    },
    4: {
        label: (l) => l === 'vi' ? 'Điện Shelling' : 'Shelling Electricity',
        short: 'Shell', unit: 'kWh',
        color: '#0E7490', bg: '#ECFEFF', border: '#A5F3FC', muted: '#0E749015',
        Icon: Zap
    },
    5: {
        label: (l) => l === 'vi' ? 'Nước (Water)' : 'Water Consumption',
        short: 'Nước', unit: 'm³',
        color: '#0F766E', bg: '#F0FDFA', border: '#99F6E4', muted: '#0F766E15',
        Icon: Droplets
    },
}
const SEU_IDS = [1, 2, 3, 4, 5]

// ─── Helpers ──────────────────────────────────────────────────────────
const pctChange = (a: number | null, b: number | null) =>
    a == null || b == null || b === 0 ? null : ((a - b) / b) * 100

// ─── Props ────────────────────────────────────────────────────────────
interface Props {
    summaries: SeuSummary[]
    historical: MonthlyHistorical[]
    currentMonth: Date
    lang?: Lang
}

// ─── Main Component ───────────────────────────────────────────────────
export function TabAnalysis({ summaries, historical, currentMonth, lang: externalLang }: Props) {
    const [prodBase, setProdBase] = useState<'rcn' | 'ck'>('rcn')
    const [compareMode, setCompareMode] = useState<'avg2025' | 'baseline'>('avg2025')
    const [lang, setLang] = useState<Lang>(externalLang ?? 'vi')
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

    // Index summaries by seu_id
    const summaryMap = useMemo(() => {
        const m: Record<number, SeuSummary> = {}
        for (const s of summaries) m[s.seu_id] = s
        return m
    }, [summaries])

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

    // Baseline forecast for current month (EnPI based)
    const baselineEnpi = useMemo<Record<number, number | null>>(() => {
        const res: Record<number, number | null> = {}
        for (const id of SEU_IDS) {
            const s = summaryMap[id]
            const h = histMap[currKey]?.[id]
            if (!s?.baseline || !h) { res[id] = null; continue }
            const { slope, intercept } = s.baseline
            const prod = prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : ((h.ck_obtained_mt ?? 0) * 1000)
            if (prod <= 0) { res[id] = null; continue }
            const blEnergy = slope * prod + intercept
            res[id] = blEnergy / prod   // EnPI from baseline
        }
        return res
    }, [histMap, currKey, summaryMap, prodBase])

    const getRef = (id: number): number | null =>
        compareMode === 'avg2025' ? avg2025[id] : baselineEnpi[id]

    // Trend (last 10 months) for each SEU
    const trendFor = (seuId: number) => {
        const ref = getRef(seuId)
        return allMonths.slice(-10).map(m => {
            const h = histMap[m]?.[seuId]
            const ep = calcEnpi(h)
            return {
                label: format(parseISO(m + '-01'), 'MM/yy'),
                enpi: ep != null ? +ep.toFixed(6) : null,
                ref,
                isCurrent: m === currKey,
            }
        })
    }

    const refLabel = (id: number) => {
        if (compareMode === 'avg2025') {
            const v = avg2025[id]; return v != null ? v.toFixed(4) : '—'
        } else {
            const v = baselineEnpi[id]; return v != null ? v.toFixed(4) : '—'
        }
    }

    return (
        <div
            className="w-full rounded-xl overflow-hidden shadow-2xl"
            style={{
                aspectRatio: '16/9',
                fontFamily: "'Inter',system-ui,sans-serif",
                display: 'flex', flexDirection: 'column',
                maxHeight: '85vh',
                background: '#F8FAFC',
                border: '1px solid #CBD5E1',
            }}
        >
            {/* ══ HEADER ══════════════════════════════════════════════ */}
            <div
                style={{ background: '#0F2140', flexShrink: 0 }}
                className="flex items-center justify-between px-5 py-2"
            >
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center" style={{ width: 36, height: 36, background: '#D4A017', borderRadius: 8 }}>
                        <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <div className="font-black tracking-widest" style={{ color: '#FFFFFF', fontSize: 13, letterSpacing: '0.08em' }}>
                            {t('title', lang)}
                        </div>
                        <div style={{ color: '#94A3B8', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            {t('subtitle', lang)} · {format(currentMonth, 'MM/yyyy')}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Language */}
                    <button onClick={() => setLang(l => l === 'vi' ? 'en' : 'vi')}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border border-white/20 text-white/70 hover:bg-white/10 transition-colors">
                        <Globe className="h-3 w-3" /> {lang.toUpperCase()}
                    </button>

                    {/* Compare mode */}
                    <div className="flex rounded overflow-hidden" style={{ border: '1px solid #334155', fontSize: 10 }}>
                        <button onClick={() => setCompareMode('avg2025')}
                            className="px-2.5 py-1 font-bold transition-colors"
                            style={{ background: compareMode === 'avg2025' ? '#D4A017' : 'transparent', color: compareMode === 'avg2025' ? '#0F2140' : '#94A3B8' }}>
                            {t('vs_avg', lang)}
                        </button>
                        <button onClick={() => setCompareMode('baseline')}
                            className="px-2.5 py-1 font-bold transition-colors"
                            style={{ background: compareMode === 'baseline' ? '#D4A017' : 'transparent', color: compareMode === 'baseline' ? '#0F2140' : '#94A3B8', borderLeft: '1px solid #334155' }}>
                            {t('vs_bl', lang)}
                        </button>
                    </div>

                    {/* Production base */}
                    <div className="flex rounded overflow-hidden" style={{ border: '1px solid #334155', fontSize: 10 }}>
                        {(['rcn', 'ck'] as const).map(b => (
                            <button key={b} onClick={() => setProdBase(b)}
                                className="px-2.5 py-1 font-bold transition-colors"
                                style={{
                                    background: prodBase === b ? '#FFFFFF' : 'transparent',
                                    color: prodBase === b ? '#0F2140' : '#94A3B8',
                                    borderLeft: b === 'ck' ? '1px solid #334155' : undefined
                                }}>
                                {b === 'rcn' ? 'RCN (kg)' : 'CK (MT)'}
                            </button>
                        ))}
                    </div>

                    <div className="px-3 py-1 rounded font-black text-xs" style={{ background: '#D4A017', color: '#0F2140' }}>
                        {t('month', lang)} {format(currentMonth, 'MM/yyyy')}
                    </div>
                </div>
            </div>

            {/* ══ BODY: 3×2 grid ══════════════════════════════════════ */}
            <div className="flex-1 grid overflow-hidden p-2 gap-2"
                style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }}>
                {SEU_IDS.map((id) => {
                    const cfg = SEU_CFG[id]
                    const h = histMap[currKey]?.[id]
                    const actual = h?.actual_energy ?? null
                    const enpi = calcEnpi(h)
                    const ref = getRef(id)
                    const delta = pctChange(enpi, ref)
                    const prod = h ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
                    const savingAbs = (enpi != null && ref != null && prod != null) ? (ref - enpi) * prod : null
                    const saved = savingAbs != null && savingAbs >= 0
                    const trend = trendFor(id)
                    const noRef = compareMode === 'baseline' && !summaryMap[id]?.baseline

                    return (
                        <div key={id} className="rounded-lg overflow-hidden flex flex-col"
                            style={{
                                background: '#FFFFFF',
                                border: `1.5px solid ${cfg.border}`,
                                boxShadow: '0 1px 4px rgba(15,33,64,0.06)',
                            }}>
                            {/* Panel header */}
                            <div className="flex items-center justify-between px-3 pt-2 pb-1"
                                style={{ borderBottom: `2px solid ${cfg.color}20` }}>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center justify-center rounded"
                                        style={{ width: 22, height: 22, background: cfg.color + '18' }}>
                                        <cfg.Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                                    </div>
                                    <span className="font-bold text-slate-800" style={{ fontSize: 13 }}>
                                        {cfg.label(lang)}
                                    </span>
                                </div>
                                {delta != null && !noRef ? (
                                    <span className="font-bold rounded-full px-2 py-0.5"
                                        style={{
                                            fontSize: 9,
                                            background: delta > 0 ? '#FEE2E2' : '#D1FAE5',
                                            color: delta > 0 ? '#991B1B' : '#065F46'
                                        }}>
                                        {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% {compareMode === 'avg2025' ? t('vs_avg', lang) : t('vs_bl', lang)}
                                    </span>
                                ) : noRef ? (
                                    <span style={{ fontSize: 9, color: '#94A3B8' }}>{t('no_bl', lang)}</span>
                                ) : null}
                            </div>

                            {/* KPI Numbers */}
                            <div className="flex items-start justify-between px-3 pt-1 pb-0.5">
                                <div>
                                    <div className="font-black tabular-nums leading-none"
                                        style={{ fontSize: 22, color: cfg.color }}>
                                        {actual != null ? Math.round(actual).toLocaleString('vi-VN') : '—'}
                                    </div>
                                    <div style={{ fontSize: 8, color: '#94A3B8', marginTop: 1 }}>
                                        {cfg.unit} · {format(currentMonth, lang === 'vi' ? 'MM/yyyy' : 'MMM yyyy')}
                                    </div>
                                </div>
                                <div className="text-right" style={{ fontSize: 9 }}>
                                    <div style={{ color: '#64748B' }}>
                                        EnPI: <span className="font-bold" style={{ color: '#1E293B' }}>{enpi != null ? enpi.toFixed(4) : '—'}</span>
                                    </div>
                                    <div style={{ color: '#94A3B8' }}>
                                        {compareMode === 'avg2025' ? t('avg2025', lang) : t('baseline', lang)}: {noRef ? '—' : refLabel(id)}
                                    </div>
                                    {savingAbs != null && !noRef && (
                                        <div className="font-bold" style={{ color: saved ? '#059669' : '#DC2626' }}>
                                            {saved ? t('saving_tk', lang) : t('over_vm', lang)} {Math.abs(Math.round(savingAbs)).toLocaleString('vi-VN')} {cfg.unit}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Mini chart */}
                            <div style={{ height: 95 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={trend} margin={{ top: 2, right: 6, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 2" stroke="#F1F5F9" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval={1} />
                                        <YAxis hide domain={['auto', 'auto']} />
                                        <Tooltip
                                            contentStyle={{ fontSize: '10px', borderRadius: '6px', padding: '4px 8px', border: `1px solid ${cfg.border}` }}
                                            formatter={(v: any) => [typeof v === 'number' ? v.toFixed(4) : v, 'EnPI']}
                                        />
                                        {!noRef && trend[0]?.ref != null && (
                                            <ReferenceLine y={trend[0].ref} stroke={compareMode === 'avg2025' ? '#10B981' : '#D4A017'}
                                                strokeDasharray="5 3" strokeWidth={1.5} />
                                        )}
                                        <Bar dataKey="enpi" radius={[2, 2, 0, 0]} maxBarSize={24}>
                                            {trend.map((d, i) => (
                                                <Cell key={i} fill={d.isCurrent ? cfg.color : cfg.color + '40'} />
                                            ))}
                                        </Bar>
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )
                })}

                {/* ── Slot 6: KPI Summary Card ─────────────────────────── */}
                <div className="rounded-lg overflow-hidden flex flex-col p-3 gap-2"
                    style={{ background: '#0F2140', border: '1.5px solid #1E3A5F', boxShadow: '0 1px 4px rgba(15,33,64,0.15)' }}>
                    <div>
                        <div style={{ fontSize: 9, color: '#D4A017', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            {t('kpi_title', lang)}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#D4A017', lineHeight: 1.1 }}>
                            {format(currentMonth, 'MM/yyyy')}
                        </div>
                        <div style={{ fontSize: 8, color: '#64748B' }}>{t('kpi_sub', lang)}</div>
                    </div>

                    <div className="flex flex-col gap-1 flex-1">
                        {SEU_IDS.map(id => {
                            const cfg = SEU_CFG[id]
                            const h = histMap[currKey]?.[id]
                            const actual = h?.actual_energy ?? null
                            const enpi = calcEnpi(h)
                            const ref = getRef(id)
                            const delta = pctChange(enpi, ref)
                            const prod = h ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
                            const sv = (enpi != null && ref != null && prod != null) ? (ref - enpi) * prod : null
                            const saved = sv != null && sv >= 0
                            const noRef = compareMode === 'baseline' && !summaryMap[id]?.baseline

                            return (
                                <div key={id} className="flex items-center rounded px-2 py-1 gap-1"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <cfg.Icon className="h-3 w-3 flex-shrink-0" style={{ color: cfg.color }} />
                                    <span style={{ fontSize: 10, fontWeight: 600, color: '#CBD5E1', minWidth: 34 }}>{cfg.short}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#F8FAFC', fontVariantNumeric: 'tabular-nums', flex: 1 }}>
                                        {actual != null ? Math.round(actual).toLocaleString('vi-VN') : '—'}
                                        <span style={{ fontSize: 7, color: '#64748B', marginLeft: 2 }}>{cfg.unit}</span>
                                    </span>
                                    {noRef ? (
                                        <span style={{ fontSize: 8, color: '#475569' }}>—</span>
                                    ) : delta != null ? (
                                        <span className="rounded-full px-1.5 py-0.5 font-bold"
                                            style={{ fontSize: 8, minWidth: 50, textAlign: 'center', background: delta > 0 ? '#7F1D1D40' : '#064E3B40', color: delta > 0 ? '#FCA5A5' : '#6EE7B7' }}>
                                            {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                                        </span>
                                    ) : null}
                                    {sv != null && !noRef && (
                                        <span style={{ fontSize: 8, fontWeight: 600, minWidth: 56, textAlign: 'right', color: saved ? '#34D399' : '#F87171' }}>
                                            {saved ? t('saved', lang) : t('over', lang)} {Math.abs(Math.round(sv)).toLocaleString('vi-VN')}
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    <div style={{ fontSize: 7, color: '#334155', textAlign: 'center', borderTop: '1px solid #1E3A5F', paddingTop: 4 }}>
                        EnPI = {prodBase === 'rcn' ? t('enpi_unit', lang) : t('enpi_ck', lang)}
                        &nbsp;·&nbsp;
                        <span style={{ color: compareMode === 'avg2025' ? '#10B981' : '#D4A017' }}>
                            — — {compareMode === 'avg2025' ? t('avg2025', lang) : t('baseline', lang)}
                        </span>
                    </div>
                </div>
            </div>

            {/* ══ FOOTER ══════════════════════════════════════════════ */}
            <div className="flex items-center justify-between px-5 py-1"
                style={{ background: '#0F2140', borderTop: '1px solid #1E3A5F', flexShrink: 0 }}>
                <span style={{ fontSize: 8, color: '#64748B' }}>
                    <span style={{ fontWeight: 700, color: '#94A3B8' }}>{t('footer_co', lang)}</span>
                    &nbsp;· Intersnack DDS ·&nbsp;{format(new Date(), 'dd/MM/yyyy')}
                </span>
                <div className="flex items-center gap-4">
                    {SEU_IDS.map(id => {
                        const cfg = SEU_CFG[id]
                        const h = histMap[currKey]?.[id]
                        const enpi = calcEnpi(h)
                        const ref = getRef(id)
                        const prod = h ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
                        const sv = (enpi != null && ref != null && prod != null) ? (ref - enpi) * prod : null
                        if (sv == null) return null
                        return (
                            <div key={id} className="flex items-center gap-1">
                                <cfg.Icon className="h-2.5 w-2.5" style={{ color: cfg.color }} />
                                <span style={{ fontSize: 8, color: '#64748B' }}>{cfg.short}:</span>
                                <span style={{ fontSize: 8, fontWeight: 700, color: sv >= 0 ? '#34D399' : '#F87171' }}>
                                    {sv >= 0 ? '↓' : '↑'}{Math.abs(Math.round(sv)).toLocaleString('vi-VN')} {cfg.unit}
                                </span>
                            </div>
                        )
                    })}
                    <div style={{ fontSize: 7, color: '#475569', paddingLeft: 8, borderLeft: '1px solid #1E3A5F' }}>
                        <span style={{ color: compareMode === 'avg2025' ? '#10B981' : '#D4A017' }}>— — </span>
                        {compareMode === 'avg2025' ? t('avg2025', lang) : t('baseline', lang)}
                    </div>
                </div>
            </div>
        </div>
    )
}
