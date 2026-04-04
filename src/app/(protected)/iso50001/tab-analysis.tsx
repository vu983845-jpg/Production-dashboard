"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { format, parseISO } from "date-fns"
import { Zap, Flame, Droplets, Globe } from "lucide-react"
import {
    ComposedChart, Bar, ReferenceLine, XAxis, YAxis,
    ResponsiveContainer, CartesianGrid, Cell, Tooltip,
} from "recharts"

// Guard: only render Recharts once the tab has mounted and has valid layout
function SafeChart({ children, height = 95 }: { children: React.ReactNode; height?: number }) {
    const [ready, setReady] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (ref.current && ref.current.offsetWidth > 0) setReady(true)
        }, 50)
        return () => clearTimeout(timer)
    }, [])
    return (
        <div ref={ref} style={{ height, minWidth: 0, width: '100%' }}>
            {ready ? children : null}
        </div>
    )
}

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
    water_bl:   { vi: 'TB m³/ngày 2025', en: 'Avg m³/day 2025' },
}
const t = (key: keyof typeof T, lang: Lang) => T[key][lang]

// ─── Intersnack Brand Colors ──────────────────────────────────────────
// Primary: #E63121 (Alizarin Crimson), Dark: #8E1E19 (Old Brick)
const BRAND = {
    red:      '#E63121',
    darkRed:  '#8E1E19',
    navy:     '#1A0A08',      // ultra-dark warm navy for header
    navyMid:  '#2D1010',      // mid-dark for KPI card
    navyBdr:  '#4A1C1C',      // border on dark bg
    gold:     '#F5A623',      // accent gold for month badge
    bg:       '#FDF8F8',      // warm off-white background
    refGreen: '#16A34A',      // reference line green (saving)
    refGold:  '#D97706',      // reference line amber (baseline)
}

// ─── SEU Config — Intersnack palette ─────────────────────────────────
const SEU_CFG: Record<number, {
    label: (lang: Lang) => string
    short: string; unit: string
    color: string; bg: string; border: string; muted: string
    Icon: React.FC<{ className?: string; style?: React.CSSProperties }>
}> = {
    1: {
        label: (l) => l === 'vi' ? 'Điện Toàn NM (EVN)' : 'Total Plant Electricity',
        short: 'EVN', unit: 'kWh',
        color: '#E63121', bg: '#FFF5F4', border: '#FECACA', muted: '#E6312115',
        Icon: Zap
    },
    2: {
        label: (l) => l === 'vi' ? 'Củi – Boiler' : 'Wood – Boiler',
        short: 'Củi', unit: 'kg',
        color: '#8E1E19', bg: '#FFF0EF', border: '#FECACA', muted: '#8E1E1915',
        Icon: Flame
    },
    3: {
        label: (l) => l === 'vi' ? 'Điện MNK (Peeling)' : 'MNK Electricity (Peeling)',
        short: 'MNK', unit: 'kWh',
        color: '#C0392B', bg: '#FEF2F2', border: '#FCA5A5', muted: '#C0392B15',
        Icon: Zap
    },
    4: {
        label: (l) => l === 'vi' ? 'Điện Shelling' : 'Shelling Electricity',
        short: 'Shell', unit: 'kWh',
        color: '#B34A00', bg: '#FFF7ED', border: '#FDBA74', muted: '#B34A0015',
        Icon: Zap
    },
    5: {
        label: (l) => l === 'vi' ? 'Nước (Water)' : 'Water Consumption',
        short: 'Nước', unit: 'm³',
        color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD', muted: '#0369A115',
        Icon: Droplets
    },
}
const SEU_IDS = [1, 2, 3, 4, 5]
// SEU 5 (Nước): baseline = avg m³/ngày from 2025, NOT regression
const WATER_SEU_ID = 5

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

    // EnPI calc: for Water (SEU 5) always use volume/day ratio (m³/day), NOT per-RCN
    // For other SEUs: energy / production
    const calcEnpi = (h: MonthlyHistorical | undefined, seuId?: number): number | null => {
        if (!h) return null
        // Water: EnPI = total m³ for that month (absolute, compared directly)
        // We track actual_energy as m³ for water — return as-is for trend display
        if (seuId === WATER_SEU_ID) {
            // For water we use m³ per month directly as the KPI value
            return h.actual_energy > 0 ? h.actual_energy : null
        }
        const prod = prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : ((h.ck_obtained_mt ?? 0) * 1000)
        return prod > 0 ? h.actual_energy / prod : null
    }

    // 2025 avg EnPI per SEU
    const avg2025 = useMemo<Record<number, number | null>>(() => {
        const res: Record<number, number | null> = {}
        for (const id of SEU_IDS) {
            const vals = allMonths
                .filter(m => m.startsWith('2025'))
                .map(m => calcEnpi(histMap[m]?.[id], id))
                .filter((v): v is number => v != null)
            res[id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        }
        return res
    }, [histMap, allMonths, prodBase])

    // Baseline forecast for current month
    // - SEU 5 (Water): baseline = avg m³/tháng from 2025 (avg2025[5] when based on absolute)
    // - Other SEUs: regression-based EnPI
    const baselineEnpi = useMemo<Record<number, number | null>>(() => {
        const res: Record<number, number | null> = {}
        for (const id of SEU_IDS) {
            if (id === WATER_SEU_ID) {
                // Water baseline = avg monthly m³ from 2025 historical data
                const waterVals = allMonths
                    .filter(m => m.startsWith('2025'))
                    .map(m => histMap[m]?.[id]?.actual_energy)
                    .filter((v): v is number => v != null && v > 0)
                res[id] = waterVals.length ? waterVals.reduce((a, b) => a + b, 0) / waterVals.length : null
                continue
            }
            const s = summaryMap[id]
            const h = histMap[currKey]?.[id]
            if (!s?.baseline || !h) { res[id] = null; continue }
            const { slope, intercept } = s.baseline
            const prod = prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : ((h.ck_obtained_mt ?? 0) * 1000)
            if (prod <= 0) { res[id] = null; continue }
            const blEnergy = slope * prod + intercept
            res[id] = blEnergy / prod   // EnPI from baseline regression
        }
        return res
    }, [histMap, currKey, summaryMap, prodBase, allMonths])

    const getRef = (id: number): number | null =>
        compareMode === 'avg2025' ? avg2025[id] : baselineEnpi[id]

    // Trend (last 10 months) for each SEU
    const trendFor = (seuId: number) => {
        const ref = getRef(seuId)
        return allMonths.slice(-10).map(m => {
            const h = histMap[m]?.[seuId]
            const ep = calcEnpi(h, seuId)
            return {
                label: format(parseISO(m + '-01'), 'MM/yy'),
                enpi: ep != null ? +ep.toFixed(seuId === WATER_SEU_ID ? 0 : 6) : null,
                ref,
                isCurrent: m === currKey,
            }
        })
    }

    const refLabel = (id: number) => {
        if (compareMode === 'avg2025') {
            const v = avg2025[id]
            if (v == null) return '—'
            return id === WATER_SEU_ID ? Math.round(v).toLocaleString('vi-VN') + ' m³' : v.toFixed(4)
        } else {
            const v = baselineEnpi[id]
            if (v == null) return '—'
            return id === WATER_SEU_ID ? Math.round(v).toLocaleString('vi-VN') + ' m³' : v.toFixed(4)
        }
    }

    // For water: saving = baseline_m3 - actual_m3 (absolute)
    // For others: (ref_enpi - actual_enpi) * production
    const calcSaving = (id: number, enpi: number | null, ref: number | null, prod: number | null, actual: number | null) => {
        if (enpi == null || ref == null) return null
        if (id === WATER_SEU_ID) {
            // actual = m³, ref = avg m³/month
            return actual != null ? ref - actual : null
        }
        if (prod == null) return null
        return (ref - enpi) * prod
    }

    return (
        <div
            className="w-full rounded-xl overflow-hidden shadow-2xl"
            style={{
                aspectRatio: '16/9',
                fontFamily: "'Inter',system-ui,sans-serif",
                display: 'flex', flexDirection: 'column',
                maxHeight: '85vh',
                background: BRAND.bg,
                border: `1px solid ${BRAND.darkRed}30`,
            }}
        >
            {/* ══ HEADER ══════════════════════════════════════════════ */}
            <div
                style={{ background: `linear-gradient(135deg, ${BRAND.darkRed} 0%, ${BRAND.red} 100%)`, flexShrink: 0 }}
                className="flex items-center justify-between px-5 py-2"
            >
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center" style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.15)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)' }}>
                        <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <div className="font-black tracking-widest" style={{ color: '#FFFFFF', fontSize: 13, letterSpacing: '0.08em', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                            {t('title', lang)}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            {t('subtitle', lang)} · {format(currentMonth, 'MM/yyyy')}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Language */}
                    <button onClick={() => setLang(l => l === 'vi' ? 'en' : 'vi')}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors"
                        style={{ border: '1px solid rgba(255,255,255,0.35)', color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.1)' }}>
                        <Globe className="h-3 w-3" /> {lang.toUpperCase()}
                    </button>

                    {/* Compare mode */}
                    <div className="flex rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.3)', fontSize: 10 }}>
                        <button onClick={() => setCompareMode('avg2025')}
                            className="px-2.5 py-1 font-bold transition-colors"
                            style={{ background: compareMode === 'avg2025' ? 'rgba(255,255,255,0.95)' : 'transparent', color: compareMode === 'avg2025' ? BRAND.darkRed : 'rgba(255,255,255,0.8)' }}>
                            {t('vs_avg', lang)}
                        </button>
                        <button onClick={() => setCompareMode('baseline')}
                            className="px-2.5 py-1 font-bold transition-colors"
                            style={{ background: compareMode === 'baseline' ? 'rgba(255,255,255,0.95)' : 'transparent', color: compareMode === 'baseline' ? BRAND.darkRed : 'rgba(255,255,255,0.8)', borderLeft: '1px solid rgba(255,255,255,0.3)' }}>
                            {t('vs_bl', lang)}
                        </button>
                    </div>

                    {/* Production base (hidden for water-only view — still useful for other SEUs) */}
                    <div className="flex rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.3)', fontSize: 10 }}>
                        {(['rcn', 'ck'] as const).map(b => (
                            <button key={b} onClick={() => setProdBase(b)}
                                className="px-2.5 py-1 font-bold transition-colors"
                                style={{
                                    background: prodBase === b ? 'rgba(255,255,255,0.95)' : 'transparent',
                                    color: prodBase === b ? BRAND.darkRed : 'rgba(255,255,255,0.8)',
                                    borderLeft: b === 'ck' ? '1px solid rgba(255,255,255,0.3)' : undefined
                                }}>
                                {b === 'rcn' ? 'RCN (kg)' : 'CK (MT)'}
                            </button>
                        ))}
                    </div>

                    <div className="px-3 py-1 rounded font-black text-xs" style={{ background: 'rgba(255,255,255,0.95)', color: BRAND.darkRed }}>
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
                    const enpi = calcEnpi(h, id)
                    const ref = getRef(id)
                    const delta = pctChange(enpi, ref)
                    const prod = (id !== WATER_SEU_ID && h) ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
                    const savingAbs = calcSaving(id, enpi, ref, prod, actual)
                    const saved = savingAbs != null && savingAbs >= 0
                    const trend = trendFor(id)
                    const noRef = compareMode === 'baseline' && id !== WATER_SEU_ID && !summaryMap[id]?.baseline

                    return (
                        <div key={id} className="rounded-lg overflow-hidden flex flex-col"
                            style={{
                                background: '#FFFFFF',
                                border: `1.5px solid ${cfg.border}`,
                                boxShadow: '0 1px 4px rgba(142,30,25,0.08)',
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
                                        {actual != null ? (id === WATER_SEU_ID ? actual.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : Math.round(actual).toLocaleString('vi-VN')) : '—'}
                                    </div>
                                    <div style={{ fontSize: 8, color: '#94A3B8', marginTop: 1 }}>
                                        {cfg.unit} · {format(currentMonth, lang === 'vi' ? 'MM/yyyy' : 'MMM yyyy')}
                                    </div>
                                </div>
                                <div className="text-right" style={{ fontSize: 9 }}>
                                    {id === WATER_SEU_ID ? (
                                        // Water: show absolute m³ EnPI label
                                        <div style={{ color: '#64748B' }}>
                                            Tiêu thụ: <span className="font-bold" style={{ color: '#1E293B' }}>{actual != null ? actual.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : '—'} m³</span>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#64748B' }}>
                                            EnPI: <span className="font-bold" style={{ color: '#1E293B' }}>{enpi != null ? enpi.toFixed(4) : '—'}</span>
                                        </div>
                                    )}
                                    <div style={{ color: '#94A3B8' }}>
                                        {id === WATER_SEU_ID
                                            ? (compareMode === 'avg2025' ? t('avg2025', lang) : t('water_bl', lang))
                                            : (compareMode === 'avg2025' ? t('avg2025', lang) : t('baseline', lang))
                                        }: {noRef ? '—' : refLabel(id)}
                                    </div>
                                    {savingAbs != null && !noRef && (
                                        <div className="font-bold" style={{ color: saved ? '#059669' : '#DC2626' }}>
                                            {saved ? t('saving_tk', lang) : t('over_vm', lang)} {Math.abs(id === WATER_SEU_ID ? Math.round(savingAbs) : Math.round(savingAbs)).toLocaleString('vi-VN')} {cfg.unit}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Mini chart */}
                            <SafeChart height={95}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={trend} margin={{ top: 2, right: 6, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 2" stroke="#F1F5F9" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval={1} />
                                        <YAxis hide domain={['auto', 'auto']} />
                                        <Tooltip
                                            contentStyle={{ fontSize: '10px', borderRadius: '6px', padding: '4px 8px', border: `1px solid ${cfg.border}` }}
                                            formatter={(v: any) => [
                                                typeof v === 'number'
                                                    ? (id === WATER_SEU_ID ? Math.round(v).toLocaleString('vi-VN') + ' m³' : v.toFixed(4))
                                                    : v,
                                                id === WATER_SEU_ID ? 'm³/tháng' : 'EnPI'
                                            ]}
                                        />
                                        {!noRef && trend[0]?.ref != null && (
                                            <ReferenceLine y={trend[0].ref} stroke={compareMode === 'avg2025' ? BRAND.refGreen : BRAND.refGold}
                                                strokeDasharray="5 3" strokeWidth={1.5} />
                                        )}
                                        <Bar dataKey="enpi" radius={[2, 2, 0, 0]} maxBarSize={24}>
                                            {trend.map((d, i) => (
                                                <Cell key={i} fill={d.isCurrent ? cfg.color : cfg.color + '40'} />
                                            ))}
                                        </Bar>
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </SafeChart>
                        </div>
                    )
                })}

                {/* ── Slot 6: KPI Summary Card ─────────────────────────── */}
                <div className="rounded-lg overflow-hidden flex flex-col p-3 gap-2"
                    style={{ background: `linear-gradient(160deg, ${BRAND.darkRed} 0%, ${BRAND.navy} 100%)`, border: `1.5px solid ${BRAND.navyBdr}`, boxShadow: '0 2px 8px rgba(142,30,25,0.3)' }}>
                    <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            {t('kpi_title', lang)}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.1, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                            {format(currentMonth, 'MM/yyyy')}
                        </div>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>{t('kpi_sub', lang)}</div>
                    </div>

                    <div className="flex flex-col gap-1 flex-1">
                        {SEU_IDS.map(id => {
                            const cfg = SEU_CFG[id]
                            const h = histMap[currKey]?.[id]
                            const actual = h?.actual_energy ?? null
                            const enpi = calcEnpi(h, id)
                            const ref = getRef(id)
                            const delta = pctChange(enpi, ref)
                            const prod = (id !== WATER_SEU_ID && h) ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
                            const sv = calcSaving(id, enpi, ref, prod, actual)
                            const saved = sv != null && sv >= 0
                            const noRef = compareMode === 'baseline' && id !== WATER_SEU_ID && !summaryMap[id]?.baseline

                            return (
                                <div key={id} className="flex items-center rounded px-2 py-1 gap-1"
                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                    <cfg.Icon className="h-3 w-3 flex-shrink-0" style={{ color: id === WATER_SEU_ID ? '#7DD3FC' : '#FECACA' }} />
                                    <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)', minWidth: 34 }}>{cfg.short}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', flex: 1 }}>
                                        {actual != null ? (id === WATER_SEU_ID ? actual.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : Math.round(actual).toLocaleString('vi-VN')) : '—'}
                                        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)', marginLeft: 2 }}>{cfg.unit}</span>
                                    </span>
                                    {noRef ? (
                                        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>—</span>
                                    ) : delta != null ? (
                                        <span className="rounded-full px-1.5 py-0.5 font-bold"
                                            style={{ fontSize: 8, minWidth: 50, textAlign: 'center', background: delta > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)', color: delta > 0 ? '#FCA5A5' : '#6EE7B7' }}>
                                            {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                                        </span>
                                    ) : null}
                                    {sv != null && !noRef && (
                                        <span style={{ fontSize: 8, fontWeight: 600, minWidth: 56, textAlign: 'right', color: saved ? '#34D399' : '#F87171' }}>
                                            {saved ? t('saved', lang) : t('over', lang)} {Math.abs(id === WATER_SEU_ID ? Math.round(sv) : Math.round(sv)).toLocaleString('vi-VN')}
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4 }}>
                        EnPI (1-4) = {prodBase === 'rcn' ? t('enpi_unit', lang) : t('enpi_ck', lang)}
                        &nbsp;·&nbsp;
                        Nước = m³/tháng
                        &nbsp;·&nbsp;
                        <span style={{ color: compareMode === 'avg2025' ? '#34D399' : BRAND.refGold }}>
                            — — {compareMode === 'avg2025' ? t('avg2025', lang) : t('baseline', lang)}
                        </span>
                    </div>
                </div>
            </div>

            {/* ══ FOOTER ══════════════════════════════════════════════ */}
            <div className="flex items-center justify-between px-5 py-1"
                style={{ background: BRAND.darkRed, borderTop: `1px solid ${BRAND.navyBdr}`, flexShrink: 0 }}>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>
                    <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{t('footer_co', lang)}</span>
                    &nbsp;· Intersnack DDS ·&nbsp;{format(new Date(), 'dd/MM/yyyy')}
                </span>
                <div className="flex items-center gap-4">
                    {SEU_IDS.map(id => {
                        const cfg = SEU_CFG[id]
                        const h = histMap[currKey]?.[id]
                        const actual = h?.actual_energy ?? null
                        const enpi = calcEnpi(h, id)
                        const ref = getRef(id)
                        const prod = (id !== WATER_SEU_ID && h) ? (prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : (h.ck_obtained_mt ?? 0) * 1000) : null
                        const sv = calcSaving(id, enpi, ref, prod, actual)
                        if (sv == null) return null
                        return (
                            <div key={id} className="flex items-center gap-1">
                                <cfg.Icon className="h-2.5 w-2.5" style={{ color: 'rgba(255,255,255,0.6)' }} />
                                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>{cfg.short}:</span>
                                <span style={{ fontSize: 8, fontWeight: 700, color: sv >= 0 ? '#86EFAC' : '#FCA5A5' }}>
                                    {sv >= 0 ? '↓' : '↑'}{Math.abs(Math.round(sv)).toLocaleString('vi-VN')} {cfg.unit}
                                </span>
                            </div>
                        )
                    })}
                    <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
                        <span style={{ color: compareMode === 'avg2025' ? '#86EFAC' : BRAND.refGold }}>— — </span>
                        {compareMode === 'avg2025' ? t('avg2025', lang) : t('baseline', lang)}
                    </div>
                </div>
            </div>
        </div>
    )
}
