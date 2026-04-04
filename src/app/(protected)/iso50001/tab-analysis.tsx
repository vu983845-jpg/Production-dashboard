"use client"

import { useMemo, useState, Component, ReactNode } from "react"
import { format, parseISO } from "date-fns"
import { Zap, Flame, Droplets, Globe, AlertCircle } from "lucide-react"
import { MonthlyHistorical, SeuSummary } from "./types"

// ─── Pure SVG mini bar chart (no Recharts → avoids React error #284) ──
type BarPoint = { label: string; enpi: number | null; ref: number | null; isCurrent: boolean }
function MiniBarChart({
    data, color, refColor, height = 110
}: {
    data: BarPoint[]; color: string; refColor: string; height?: number
}) {
    const [hovered, setHovered] = useState<number | null>(null)
    const PAD_TOP = 18, PAD_BOT = 18
    const W = 280, H = height - PAD_TOP - PAD_BOT
    const vals = data.map(d => d.enpi).filter((v): v is number => v != null)
    const refVal = data.find(d => d.ref != null)?.ref ?? null
    if (!vals.length) return <div style={{ height }} />
    const minV = Math.min(...vals, refVal ?? Infinity) * 0.95
    const maxV = Math.max(...vals, refVal ?? -Infinity) * 1.08
    const range = maxV - minV || 1
    const toY = (v: number) => PAD_TOP + H - ((v - minV) / range) * H
    const bw = Math.max(6, Math.floor(W / data.length) - 5)
    const gap = (W - bw * data.length) / (data.length + 1)
    const refY = refVal != null ? toY(refVal) : null
    const gradId = `grad-${color.replace('#', '')}`

    return (
        <svg
            width="100%" viewBox={`0 0 ${W} ${height}`}
            style={{ display: 'block', overflow: 'visible' }}
        >
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="1" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.5" />
                </linearGradient>
            </defs>

            {/* Reference line */}
            {refY != null && (
                <g>
                    <line x1={0} y1={refY} x2={W - 36} y2={refY}
                        stroke={refColor} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.8} />
                    {/* ref label tag */}
                    <rect x={W - 35} y={refY - 7} width={35} height={13}
                        rx={3} fill={refColor} opacity={0.15} />
                    <text x={W - 17} y={refY + 4} fontSize={6.5} fill={refColor}
                        textAnchor="middle" fontWeight="600">
                        {refVal!.toFixed(3)}
                    </text>
                </g>
            )}

            {/* Bars */}
            {data.map((d, i) => {
                const x = gap + i * (bw + gap)
                const y = d.enpi != null ? toY(d.enpi) : PAD_TOP + H
                const bh = d.enpi != null ? (PAD_TOP + H) - y : 0
                const isHov = hovered === i
                const isCur = d.isCurrent
                return (
                    <g key={i}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ cursor: 'default' }}
                    >
                        {/* glow under current bar */}
                        {isCur && bh > 0 && (
                            <rect x={x - 1} y={y} width={bw + 2} height={bh}
                                rx={2} fill={color} opacity={0.15} />
                        )}
                        {/* bar */}
                        <rect
                            x={x} y={y} width={bw} height={bh}
                            fill={isCur ? `url(#${gradId})` : color + '44'}
                            rx={2}
                            opacity={isHov ? 1 : (isCur ? 1 : 0.7)}
                        />
                        {/* value label above current bar */}
                        {isCur && d.enpi != null && (
                            <text x={x + bw / 2} y={y - 4}
                                fontSize={7.5} fill={color}
                                textAnchor="middle" fontWeight="700">
                                {d.enpi.toFixed(3)}
                            </text>
                        )}
                        {/* hover tooltip box */}
                        {isHov && d.enpi != null && !isCur && (
                            <g>
                                <rect x={x + bw / 2 - 22} y={y - 19} width={44} height={15}
                                    rx={3} fill="#1E293B" opacity={0.9} />
                                <text x={x + bw / 2} y={y - 8}
                                    fontSize={7} fill="#F8FAFC"
                                    textAnchor="middle">
                                    {d.enpi.toFixed(4)}
                                </text>
                            </g>
                        )}
                        {/* x label */}
                        <text x={x + bw / 2} y={PAD_TOP + H + 12}
                            fontSize={6.5} fill={isCur ? '#64748B' : '#94A3B8'}
                            textAnchor="middle" fontWeight={isCur ? '700' : '400'}>
                            {d.label}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}

// ─── Error Boundary ────────────────────────────────────────────────
class AnalysisErrorBoundary extends Component<
    { children: ReactNode },
    { hasError: boolean; error: string }
> {
    constructor(props: { children: ReactNode }) {
        super(props)
        this.state = { hasError: false, error: '' }
    }
    static getDerivedStateFromError(err: Error) {
        return { hasError: true, error: err.message }
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border border-red-200 bg-red-50 text-center">
                    <AlertCircle className="h-8 w-8 text-red-500" />
                    <div>
                        <p className="font-bold text-red-700">Có lỗi khi hiển thị tab Phân Tích</p>
                        <p className="text-xs text-red-500 mt-1 font-mono">{this.state.error}</p>
                    </div>
                    <button
                        onClick={() => this.setState({ hasError: false, error: '' })}
                        className="px-4 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
                    >
                        Thử lại
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}


// ─── i18n ─────────────────────────────────────────────────────────────
type Lang = 'vi' | 'en'
const T = {
    title:     { vi: 'PHÂN TÍCH NĂNG LƯỢNG ISO 50001', en: 'ISO 50001 ENERGY PERFORMANCE ANALYSIS' },
    subtitle:  { vi: 'Báo cáo hiệu suất năng lượng tháng', en: 'Energy Performance Monthly Report' },
    month:     { vi: 'Tháng', en: 'Month' },
    vs_avg:    { vi: 'vs TB 2025', en: 'vs Avg 2025' },
    vs_bl:    { vi: 'vs Baseline', en: 'vs Baseline' },
    avg2025:   { vi: 'TB 2025', en: 'Avg 2025' },
    baseline:  { vi: 'Đường Baseline', en: 'Baseline' },
    saved:     { vi: 'TK', en: 'Saved' },
    over:      { vi: 'VM', en: 'Over' },
    saving_tk: { vi: '↓ Tiết kiệm', en: '↓ Saving' },
    over_vm:   { vi: '↑ Vượt mức', en: '↑ Over budget' },
    kpi_title: { vi: 'TỔNG KẾT THÁNG', en: 'MONTHLY KPI' },
    kpi_sub:   { vi: 'ISO 50001 · Energy KPI', en: 'ISO 50001 · Energy KPI' },
    enpi_unit: { vi: 'unit / kg RCN', en: 'unit / kg RCN' },
    enpi_ck:   { vi: 'unit / MT CK', en: 'unit / MT CK' },
    footer_co: { vi: 'ISO 50001 EnMS', en: 'ISO 50001 EnMS' },
    no_bl:     { vi: 'Chưa có baseline', en: 'No baseline' },
}
const t = (key: keyof typeof T, lang: Lang) => T[key][lang]

// ─── Intersnack Brand Colors ──────────────────────────────────────────
const BRAND = {
    red:      '#E63121',
    darkRed:  '#8E1E19',
    refGreen: '#16A34A',
    refGold:  '#D97706',
    bg:       '#FDF8F8',
}

// ─── SEU Config — Intersnack palette ─────────────────────────────────
const SEU_CFG: Record<number, {
    label: (lang: Lang) => string
    short: string; unit: string
    color: string; bg: string; border: string
    Icon: React.FC<{ className?: string; style?: React.CSSProperties }>
}> = {
    1: {
        label: (l) => l === 'vi' ? 'Điện Toàn NM (EVN)' : 'Total Plant Electricity',
        short: 'EVN', unit: 'kWh',
        color: '#E63121', bg: '#FFF5F4', border: '#FECACA',
        Icon: Zap,
    },
    2: {
        label: (l) => l === 'vi' ? 'Củi – Boiler' : 'Wood – Boiler',
        short: 'Củi', unit: 'kg',
        color: '#8E1E19', bg: '#FFF0EF', border: '#FECACA',
        Icon: Flame,
    },
    3: {
        label: (l) => l === 'vi' ? 'Điện MNK (Peeling)' : 'MNK Electricity (Peeling)',
        short: 'MNK', unit: 'kWh',
        color: '#C0392B', bg: '#FEF2F2', border: '#FCA5A5',
        Icon: Zap,
    },
    4: {
        label: (l) => l === 'vi' ? 'Điện Shelling' : 'Shelling Electricity',
        short: 'Shell', unit: 'kWh',
        color: '#B34A00', bg: '#FFF7ED', border: '#FDBA74',
        Icon: Zap,
    },
    5: {
        label: (l) => l === 'vi' ? 'Nước (Water)' : 'Water Consumption',
        short: 'Nước', unit: 'm³',
        color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD',
        Icon: Droplets,
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
function TabAnalysisInner({ summaries, historical, currentMonth, lang: externalLang }: Props) {
    const [prodBase, setProdBase] = useState<'rcn' | 'ck'>('rcn')
    const [compareMode, setCompareMode] = useState<'avg2025' | 'baseline'>('avg2025')
    const [lang, setLang] = useState<Lang>(externalLang ?? 'vi')

    // Guard: ensure currentMonth is a valid Date
    const safeCurrentMonth = currentMonth instanceof Date && !isNaN(currentMonth.getTime())
        ? currentMonth
        : new Date()
    const currKey = format(safeCurrentMonth, 'yyyy-MM')

    // Index historical by month → seu_id
    const histMap = useMemo<Record<string, Record<number, MonthlyHistorical>>>(() => {
        const m: Record<string, Record<number, MonthlyHistorical>> = {}
        for (const h of (historical ?? [])) {
            // Guard: month_year must be a non-empty string
            if (!h?.month_year || typeof h.month_year !== 'string') continue
            const mo = h.month_year.slice(0, 7)
            if (!mo || mo.length < 7) continue
            if (!m[mo]) m[mo] = {}
            m[mo][h.seu_id] = h
        }
        return m
    }, [historical])

    const allMonths = useMemo(() => Object.keys(histMap).sort(), [histMap])

    // Index summaries by seu_id
    const summaryMap = useMemo(() => {
        const m: Record<number, SeuSummary> = {}
        for (const s of (summaries ?? [])) {
            if (s?.seu_id != null) m[s.seu_id] = s
        }
        return m
    }, [summaries])

    // EnPI = actual_energy / production — uniform for ALL SEUs (water included)
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

    // Baseline EnPI per SEU:
    // - SEU 1–4: regression (slope × prod + intercept) / prod
    // - SEU 5 (Water): no regression → use avg2025 (avg EnPI/RCN from 2025)
    const baselineEnpi = useMemo<Record<number, number | null>>(() => {
        const res: Record<number, number | null> = {}
        for (const id of SEU_IDS) {
            if (id === 5) {
                res[id] = avg2025[id] ?? null
                continue
            }
            const s = summaryMap[id]
            const h = histMap[currKey]?.[id]
            if (!s?.baseline || !h) { res[id] = null; continue }
            const { slope, intercept } = s.baseline
            const prod = prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : ((h.ck_obtained_mt ?? 0) * 1000)
            if (prod <= 0) { res[id] = null; continue }
            res[id] = (slope * prod + intercept) / prod
        }
        return res
    }, [histMap, currKey, summaryMap, prodBase, avg2025])

    const getRef = (id: number): number | null =>
        compareMode === 'avg2025' ? avg2025[id] : baselineEnpi[id]

    // Trend (last 10 months) — uniform for all SEUs
    const trendFor = (seuId: number) => {
        const ref = getRef(seuId)
        return allMonths.slice(-10).map(m => {
            const h = histMap[m]?.[seuId]
            const ep = calcEnpi(h)
            // Safe label: parse 'YYYY-MM' → 'YYYY-MM-01'
            let label = m
            try {
                const parsed = parseISO(m + '-01')
                if (!isNaN(parsed.getTime())) label = format(parsed, 'MM/yy')
            } catch { /* keep raw m as label */ }
            return {
                label,
                enpi: ep != null ? +ep.toFixed(6) : null,
                ref,
                isCurrent: m === currKey,
            }
        })
    }

    const refLabel = (id: number) => {
        const v = compareMode === 'avg2025' ? avg2025[id] : baselineEnpi[id]
        return v != null ? v.toFixed(4) : '—'
    }

    // noRef: baseline mode, no regression for this SEU
    // Water never shows noRef because it always has avg2025 as fallback
    const isNoRef = (id: number) =>
        compareMode === 'baseline' && id !== 5 && !summaryMap[id]?.baseline

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
                    <div className="flex items-center justify-center"
                        style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.15)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)' }}>
                        <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <div className="font-black tracking-widest"
                            style={{ color: '#FFFFFF', fontSize: 13, letterSpacing: '0.08em', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                            {t('title', lang)}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            {t('subtitle', lang)} · {format(safeCurrentMonth, 'MM/yyyy')}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Language toggle */}
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

                    {/* Production base */}
                    <div className="flex rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.3)', fontSize: 10 }}>
                        {(['rcn', 'ck'] as const).map(b => (
                            <button key={b} onClick={() => setProdBase(b)}
                                className="px-2.5 py-1 font-bold transition-colors"
                                style={{
                                    background: prodBase === b ? 'rgba(255,255,255,0.95)' : 'transparent',
                                    color: prodBase === b ? BRAND.darkRed : 'rgba(255,255,255,0.8)',
                                    borderLeft: b === 'ck' ? '1px solid rgba(255,255,255,0.3)' : undefined,
                                }}>
                                {b === 'rcn' ? 'RCN (kg)' : 'CK (MT)'}
                            </button>
                        ))}
                    </div>

                    <div className="px-3 py-1 rounded font-black text-xs"
                        style={{ background: 'rgba(255,255,255,0.95)', color: BRAND.darkRed }}>
                        {t('month', lang)} {format(safeCurrentMonth, 'MM/yyyy')}
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
                    const noRef = isNoRef(id)

                    // Water note for baseline mode
                    const waterBaselineNote = id === 5 && compareMode === 'baseline'

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
                                {noRef ? (
                                    <span style={{ fontSize: 9, color: '#94A3B8' }}>{t('no_bl', lang)}</span>
                                ) : waterBaselineNote ? (
                                    <span style={{ fontSize: 9, color: '#94A3B8', fontStyle: 'italic' }}>≈ TB 2025</span>
                                ) : delta != null ? (
                                    <span className="font-bold rounded-full px-2 py-0.5"
                                        style={{
                                            fontSize: 9,
                                            background: delta > 0 ? '#FEE2E2' : '#D1FAE5',
                                            color: delta > 0 ? '#991B1B' : '#065F46',
                                        }}>
                                        {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% {compareMode === 'avg2025' ? t('vs_avg', lang) : t('vs_bl', lang)}
                                    </span>
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
                                        {cfg.unit} · {format(safeCurrentMonth, lang === 'vi' ? 'MM/yyyy' : 'MMM yyyy')}
                                    </div>
                                </div>
                                <div className="text-right" style={{ fontSize: 9 }}>
                                    <div style={{ color: '#64748B' }}>
                                        EnPI: <span className="font-bold" style={{ color: '#1E293B' }}>{enpi != null ? enpi.toFixed(4) : '—'}</span>
                                    </div>
                                    <div style={{ color: '#94A3B8' }}>
                                        {compareMode === 'avg2025' ? t('avg2025', lang) : (id === 5 ? 'TB 2025' : t('baseline', lang))}: {noRef ? '—' : refLabel(id)}
                                    </div>
                                    {savingAbs != null && !noRef && (
                                        <div className="font-bold" style={{ color: saved ? '#059669' : '#DC2626' }}>
                                            {saved ? t('saving_tk', lang) : t('over_vm', lang)} {Math.abs(Math.round(savingAbs)).toLocaleString('vi-VN')} {cfg.unit}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Mini chart — pure SVG, no Recharts → no React error #284 */}
                            <div style={{ height: 110, minWidth: 0, width: '100%' }}>
                                <MiniBarChart
                                    data={trend}
                                    color={cfg.color}
                                    refColor={compareMode === 'avg2025' ? BRAND.refGreen : BRAND.refGold}
                                    height={110}
                                />
                            </div>
                        </div>
                    )
                })}

                {/* ── Slot 6: KPI Summary Card ─────────────────────────── */}
                <div className="rounded-lg overflow-hidden flex flex-col p-3 gap-2"
                    style={{
                        background: `linear-gradient(160deg, ${BRAND.darkRed} 0%, #1A0A08 100%)`,
                        border: '1.5px solid #4A1C1C',
                        boxShadow: '0 2px 8px rgba(142,30,25,0.3)',
                    }}>
                    <div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            {t('kpi_title', lang)}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.1, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                            {format(safeCurrentMonth, 'MM/yyyy')}
                        </div>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>{t('kpi_sub', lang)}</div>
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
                            const noRef = isNoRef(id)

                            return (
                                <div key={id} className="flex items-center rounded px-2 py-1 gap-1"
                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                    <cfg.Icon className="h-3 w-3 flex-shrink-0"
                                        style={{ color: id === 5 ? '#7DD3FC' : '#FECACA' }} />
                                    <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)', minWidth: 34 }}>{cfg.short}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', flex: 1 }}>
                                        {actual != null ? Math.round(actual).toLocaleString('vi-VN') : '—'}
                                        <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)', marginLeft: 2 }}>{cfg.unit}</span>
                                    </span>
                                    {noRef ? (
                                        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>—</span>
                                    ) : delta != null ? (
                                        <span className="rounded-full px-1.5 py-0.5 font-bold"
                                            style={{
                                                fontSize: 8, minWidth: 50, textAlign: 'center',
                                                background: delta > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)',
                                                color: delta > 0 ? '#FCA5A5' : '#6EE7B7',
                                            }}>
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

                    <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4 }}>
                        EnPI = {prodBase === 'rcn' ? t('enpi_unit', lang) : t('enpi_ck', lang)}
                        &nbsp;·&nbsp;
                        <span style={{ color: compareMode === 'avg2025' ? '#34D399' : BRAND.refGold }}>
                            — — {compareMode === 'avg2025' ? t('avg2025', lang) : t('baseline', lang)}&nbsp;(Nước=TB2025)
                        </span>
                    </div>
                </div>
            </div>

            {/* ══ FOOTER ══════════════════════════════════════════════ */}
            <div className="flex items-center justify-between px-5 py-1"
                style={{ background: BRAND.darkRed, borderTop: '1px solid #4A1C1C', flexShrink: 0 }}>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>
                    <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{t('footer_co', lang)}</span>
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

// ─── Public export: wrapped in Error Boundary ──────────────────────
export function TabAnalysis(props: Props) {
    return (
        <AnalysisErrorBoundary>
            <TabAnalysisInner {...props} />
        </AnalysisErrorBoundary>
    )
}
