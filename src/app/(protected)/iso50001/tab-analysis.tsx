"use client"

import { useMemo, useState, Component, ReactNode } from "react"
import { format, parseISO } from "date-fns"
import { Zap, Flame, Droplets, Globe, AlertCircle } from "lucide-react"
import { MonthlyHistorical, SeuSummary } from "./types"

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
    big_chart_title: { vi: 'EnPI Tháng — Điện Tổng · Củi · Nước', en: 'Monthly EnPI — Total Elec · Wood · Water' },
    kpi_section: { vi: 'KPI TRACKING — SEU PHỤ TRỢ', en: 'KPI TRACKING — AUXILIARY SEUs' },
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

// SEUs shown in big chart (top)
const BIG_CHART_IDS = [1, 2, 5]
// SEUs shown as KPI cards (bottom)
const KPI_CARD_IDS  = [3, 4]
const ALL_SEU_IDS   = [1, 2, 3, 4, 5]

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

// ══════════════════════════════════════════════════════════════════════
// BIG GROUPED BAR CHART — EVN · Củi · Nước  (EnPI trend, last 10 months)
// Each month shows 3 adjacent bars + individual dashed reference lines
// ══════════════════════════════════════════════════════════════════════
type BigBarSeries = {
    seuId: number
    color: string
    label: string
    short: string
    unit: string
    points: { label: string; enpi: number | null; ref: number | null; isCurrent: boolean }[]
}

function BigGroupedChart({
    series,
    refColor,
    height = 240,
}: {
    series: BigBarSeries[]
    refColor: string
    height?: number
}) {
    const [hov, setHov] = useState<{ m: number; s: number } | null>(null)

    const PAD_L = 38, PAD_R = 20, PAD_TOP = 28, PAD_BOT = 26
    const TOTAL_W = 620
    const W = TOTAL_W - PAD_L - PAD_R
    const H = height - PAD_TOP - PAD_BOT

    const nMonths = series[0]?.points.length ?? 0
    const nSeries = series.length
    const GROUP_GAP = 6
    const BAR_GAP   = 2
    const groupW = nMonths > 0 ? (W - GROUP_GAP * (nMonths - 1)) / nMonths : 0
    const barW   = nSeries > 0 ? (groupW - BAR_GAP * (nSeries - 1)) / nSeries : 0

    // Normalize: each series has its own scale painted on separate y-axes
    // But we want them all on one chart visually → normalize 0-based % of max
    // Actually: show normalized 0–max per series, but label axes differently.
    // Simplest approach: normalize each series to its own [0,1] range and scale to H.
    type SeriesBounds = { min: number; max: number; range: number }
    const bounds: SeriesBounds[] = series.map(s => {
        const vals = s.points.map(p => p.enpi).filter((v): v is number => v != null)
        const refVals = s.points.map(p => p.ref).filter((v): v is number => v != null)
        const allVals = [...vals, ...refVals]
        const min = allVals.length ? Math.min(...allVals) * 0.93 : 0
        const max = allVals.length ? Math.max(...allVals) * 1.07 : 1
        return { min, max, range: max - min || 1 }
    })

    const toY = (v: number, b: SeriesBounds) =>
        PAD_TOP + H - ((v - b.min) / b.range) * H

    // Y-axis ticks (shared scale: series[0] primary)
    const primaryB = bounds[0] ?? { min: 0, max: 1, range: 1 }
    const TICKS = 4
    const tickStep = primaryB.range / TICKS
    const yTicks = Array.from({ length: TICKS + 1 }, (_, i) => primaryB.min + i * tickStep)

    if (nMonths === 0) return <div style={{ height }} />

    const gradIds = series.map(s => `biggrad-${s.color.replace('#', '')}`)

    return (
        <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${TOTAL_W} ${height}`}
            style={{ display: 'block' }}
        >
            <defs>
                {series.map((s, si) => (
                    <linearGradient key={si} id={gradIds[si]} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={s.color} stopOpacity="1" />
                        <stop offset="100%" stopColor={s.color} stopOpacity="0.55" />
                    </linearGradient>
                ))}
            </defs>

            {/* Grid lines */}
            {yTicks.map((v, i) => {
                const y = toY(v, primaryB)
                return (
                    <g key={i}>
                        <line x1={PAD_L} y1={y} x2={TOTAL_W - PAD_R} y2={y}
                            stroke="#E2E8F0" strokeWidth={0.8} />
                        <text x={PAD_L - 3} y={y + 3} fontSize={6.5} fill="#94A3B8"
                            textAnchor="end">{v.toFixed(3)}</text>
                    </g>
                )
            })}

            {/* Reference lines (dashed) per series */}
            {series.map((s, si) => {
                const ref = s.points.find(p => p.ref != null)?.ref ?? null
                if (ref == null) return null
                const y = toY(ref, bounds[si])
                const dashColor = refColor
                return (
                    <g key={`ref-${si}`}>
                        <line
                            x1={PAD_L} y1={y} x2={TOTAL_W - PAD_R - 30} y2={y}
                            stroke={dashColor} strokeWidth={1.2} strokeDasharray="5 3"
                            opacity={0.65}
                        />
                        <rect x={TOTAL_W - PAD_R - 29} y={y - 7} width={29} height={13}
                            rx={3} fill={dashColor} opacity={0.12} />
                        <text x={TOTAL_W - PAD_R - 14} y={y + 4}
                            fontSize={6} fill={dashColor} textAnchor="middle" fontWeight="700">
                            {s.short ?? ''} {ref.toFixed(3)}
                        </text>
                    </g>
                )
            })}

            {/* Bars */}
            {series[0].points.map((_, mi) => {
                const groupX = PAD_L + mi * (groupW + GROUP_GAP)
                const isCurrMonth = series[0].points[mi].isCurrent
                const label = series[0].points[mi].label

                return (
                    <g key={mi}>
                        {/* Month label */}
                        <text
                            x={groupX + groupW / 2} y={PAD_TOP + H + 14}
                            fontSize={7} fill={isCurrMonth ? '#334155' : '#94A3B8'}
                            textAnchor="middle" fontWeight={isCurrMonth ? '700' : '400'}
                        >{label}</text>

                        {/* Current month highlight */}
                        {isCurrMonth && (
                            <rect
                                x={groupX - 2} y={PAD_TOP}
                                width={groupW + 4} height={H}
                                fill="#F1F5F9" rx={3} opacity={0.6}
                            />
                        )}

                        {/* Each series bar in this group */}
                        {series.map((s, si) => {
                            const pt = s.points[mi]
                            if (pt.enpi == null) return null
                            const b = bounds[si]
                            const barX = groupX + si * (barW + BAR_GAP)
                            const barY = toY(pt.enpi, b)
                            const barH = (PAD_TOP + H) - barY
                            const isHov = hov?.m === mi && hov?.s === si

                            return (
                                <g key={si}
                                    onMouseEnter={() => setHov({ m: mi, s: si })}
                                    onMouseLeave={() => setHov(null)}
                                    style={{ cursor: 'default' }}
                                >
                                    <rect
                                        x={barX} y={barY} width={barW} height={barH}
                                        fill={isCurrMonth ? `url(#${gradIds[si]})` : s.color + '55'}
                                        rx={2}
                                        opacity={isHov ? 1 : 0.9}
                                    />
                                    {/* Value label on current month bars */}
                                    {isCurrMonth && (
                                        <text x={barX + barW / 2} y={barY - 4}
                                            fontSize={6.5} fill={s.color}
                                            textAnchor="middle" fontWeight="800">
                                            {pt.enpi.toFixed(3)}
                                        </text>
                                    )}
                                    {/* Hover tooltip */}
                                    {isHov && !isCurrMonth && (
                                        <g>
                                            <rect x={barX + barW / 2 - 24} y={barY - 20} width={48} height={16}
                                                rx={3} fill="#1E293B" opacity={0.92} />
                                            <text x={barX + barW / 2} y={barY - 9}
                                                fontSize={6.5} fill="#F8FAFC" textAnchor="middle" fontWeight="600">
                                                {pt.enpi.toFixed(4)} {s.unit}
                                            </text>
                                        </g>
                                    )}
                                </g>
                            )
                        })}
                    </g>
                )
            })}
        </svg>
    )
}

// ─── Small KPI tracking card (MNK, Shelling) ─────────────────────────
type BarPoint = { label: string; enpi: number | null; ref: number | null; isCurrent: boolean }
function MiniBarChart({
    data, color, refColor, height = 100
}: {
    data: BarPoint[]; color: string; refColor: string; height?: number
}) {
    const [hovered, setHovered] = useState<number | null>(null)
    const PAD_TOP = 20, PAD_BOT = 18
    const W = 260, H = height - PAD_TOP - PAD_BOT
    const vals = data.map(d => d.enpi).filter((v): v is number => v != null)
    const refVal = data.find(d => d.ref != null)?.ref ?? null
    if (!vals.length) return <div style={{ height }} />
    const minV = Math.min(...vals, refVal ?? Infinity) * 0.95
    const maxV = Math.max(...vals, refVal ?? -Infinity) * 1.05
    const range = maxV - minV || 1
    const toY = (v: number) => PAD_TOP + H - ((v - minV) / range) * H
    const bw = Math.max(8, Math.floor(W / data.length) - 5)
    const gap = (W - bw * data.length) / (data.length + 1)
    const refY = refVal != null ? toY(refVal) : null
    const gradId = `grad-${color.replace('#', '')}`

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${height}`} style={{ display: 'block' }}>
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={color} stopOpacity="1" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.5" />
                </linearGradient>
            </defs>

            {refY != null && (
                <g>
                    <line x1={0} y1={refY} x2={W - 36} y2={refY}
                        stroke={refColor} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.8} />
                    <rect x={W - 35} y={refY - 7} width={35} height={13}
                        rx={3} fill={refColor} opacity={0.15} />
                    <text x={W - 17} y={refY + 4} fontSize={6.5} fill={refColor}
                        textAnchor="middle" fontWeight="600">
                        {refVal!.toFixed(3)}
                    </text>
                </g>
            )}

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
                        {isCur && bh > 0 && (
                            <rect x={x - 1} y={y} width={bw + 2} height={bh}
                                rx={2} fill={color} opacity={0.15} />
                        )}
                        <rect
                            x={x} y={y} width={bw} height={bh}
                            fill={isCur ? `url(#${gradId})` : color + '44'}
                            rx={2} opacity={isHov ? 1 : (isCur ? 1 : 0.7)}
                        />
                        {isCur && d.enpi != null && (
                            <text x={x + bw / 2} y={y - 4}
                                fontSize={7.5} fill={color}
                                textAnchor="middle" fontWeight="700">
                                {d.enpi.toFixed(3)}
                            </text>
                        )}
                        {isHov && d.enpi != null && !isCur && (
                            <g>
                                <rect x={x + bw / 2 - 22} y={y - 19} width={44} height={15}
                                    rx={3} fill="#1E293B" opacity={0.9} />
                                <text x={x + bw / 2} y={y - 8}
                                    fontSize={7} fill="#F8FAFC" textAnchor="middle">
                                    {d.enpi.toFixed(4)}
                                </text>
                            </g>
                        )}
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

// ─── Main Component ───────────────────────────────────────────────────
function TabAnalysisInner({ summaries, historical, currentMonth, lang: externalLang }: Props) {
    const [prodBase, setProdBase] = useState<'rcn' | 'ck'>('rcn')
    const [compareMode, setCompareMode] = useState<'avg2025' | 'baseline'>('avg2025')
    const [lang, setLang] = useState<Lang>(externalLang ?? 'vi')

    const safeCurrentMonth = currentMonth instanceof Date && !isNaN(currentMonth.getTime())
        ? currentMonth
        : new Date()
    const currKey = format(safeCurrentMonth, 'yyyy-MM')

    const histMap = useMemo<Record<string, Record<number, MonthlyHistorical>>>(() => {
        const m: Record<string, Record<number, MonthlyHistorical>> = {}
        for (const h of (historical ?? [])) {
            if (!h?.month_year || typeof h.month_year !== 'string') continue
            const mo = h.month_year.slice(0, 7)
            if (!mo || mo.length < 7) continue
            if (!m[mo]) m[mo] = {}
            m[mo][h.seu_id] = h
        }
        return m
    }, [historical])

    const allMonths = useMemo(() => Object.keys(histMap).sort(), [histMap])

    const summaryMap = useMemo(() => {
        const m: Record<number, SeuSummary> = {}
        for (const s of (summaries ?? [])) {
            if (s?.seu_id != null) m[s.seu_id] = s
        }
        return m
    }, [summaries])

    // MNK (3) always per kg RCN peeled; Shelling (4) always per kg RCN; others follow toggle
    const getProd = (h: MonthlyHistorical, id?: number): number => {
        if (id === 3 || id === 4) return h.rcn_hap_duoc_kg ?? 0
        return prodBase === 'rcn' ? (h.rcn_hap_duoc_kg ?? 0) : ((h.ck_obtained_mt ?? 0) * 1000)
    }

    const calcEnpi = (h: MonthlyHistorical | undefined, id?: number): number | null => {
        if (!h) return null
        const prod = getProd(h, id)
        return prod > 0 ? h.actual_energy / prod : null
    }

    const avg2025 = useMemo<Record<number, number | null>>(() => {
        const res: Record<number, number | null> = {}
        for (const id of ALL_SEU_IDS) {
            const vals = allMonths
                .filter(m => m.startsWith('2025'))
                .map(m => calcEnpi(histMap[m]?.[id], id))
                .filter((v): v is number => v != null)
            res[id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        }
        return res
    }, [histMap, allMonths, prodBase])

    const baselineEnpi = useMemo<Record<number, number | null>>(() => {
        const res: Record<number, number | null> = {}
        for (const id of ALL_SEU_IDS) {
            if (id === 5) { res[id] = avg2025[id] ?? null; continue }
            const s = summaryMap[id]
            const h = histMap[currKey]?.[id]
            if (!s?.baseline || !h) { res[id] = null; continue }
            const { slope, intercept } = s.baseline
            const prod = getProd(h, id)
            if (prod <= 0) { res[id] = null; continue }
            res[id] = (slope * prod + intercept) / prod
        }
        return res
    }, [histMap, currKey, summaryMap, prodBase, avg2025])

    const getRef = (id: number): number | null =>
        compareMode === 'avg2025' ? avg2025[id] : baselineEnpi[id]

    const trendFor = (seuId: number) => {
        const ref = getRef(seuId)
        return allMonths.slice(-10).map(m => {
            const h = histMap[m]?.[seuId]
            const ep = calcEnpi(h, seuId)
            let label = m
            try {
                const parsed = parseISO(m + '-01')
                if (!isNaN(parsed.getTime())) label = format(parsed, 'MM/yy')
            } catch { /* keep raw */ }
            return { label, enpi: ep != null ? +ep.toFixed(6) : null, ref, isCurrent: m === currKey }
        })
    }

    const isNoRef = (id: number) =>
        compareMode === 'baseline' && id !== 5 && !summaryMap[id]?.baseline

    // Build big chart series for EVN (1), Củi (2), Nước (5)
    const bigSeries: BigBarSeries[] = BIG_CHART_IDS.map(id => ({
        seuId: id,
        color: SEU_CFG[id].color,
        label: SEU_CFG[id].label(lang),
        short: SEU_CFG[id].short,
        unit:  SEU_CFG[id].unit,
        points: trendFor(id),
    }))

    const refColorForBig = compareMode === 'avg2025' ? BRAND.refGreen : BRAND.refGold

    return (
        <div
            className="w-full rounded-xl shadow-2xl overflow-hidden"
            style={{
                fontFamily: "'Inter',system-ui,sans-serif",
                display: 'flex', flexDirection: 'column',
                background: BRAND.bg,
                border: `1px solid ${BRAND.darkRed}30`,
                aspectRatio: '16 / 9',
                minHeight: 540,
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

            {/* ══ BODY ═════════════════════════════════════════════════ */}
            <div className="flex flex-col gap-3 p-3" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>

                {/* ── BIG CHART: EVN · Củi · Nước ─────────────────────── */}
                <div className="rounded-xl"
                    style={{
                        background: '#FFFFFF',
                        border: `1.5px solid #FECACA`,
                        boxShadow: '0 2px 8px rgba(142,30,25,0.08)',
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                    {/* Chart header */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-2"
                        style={{ flexShrink: 0, borderBottom: '1.5px solid #FEF2F2' }}>
                        <div className="flex items-center gap-2">
                            <span className="font-black text-slate-800" style={{ fontSize: 13 }}>
                                {t('big_chart_title', lang)}
                            </span>
                            <span style={{ fontSize: 9, color: '#94A3B8', fontWeight: 500 }}>
                                — EnPI / {prodBase === 'rcn' ? 'kg RCN' : 'MT CK'} · 10 tháng gần nhất
                            </span>
                        </div>
                        {/* Legend */}
                        <div className="flex items-center gap-4">
                            {BIG_CHART_IDS.map(id => {
                                const cfg = SEU_CFG[id]
                                const h = histMap[currKey]?.[id]
                                const actual = h?.actual_energy ?? null
                                const enpi = calcEnpi(h)
                                const ref = getRef(id)
                                const delta = pctChange(enpi, ref)
                                return (
                                    <div key={id} className="flex items-center gap-1.5">
                                        <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.color }} />
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#334155' }}>{cfg.short}</span>
                                        {actual != null && (
                                            <span style={{ fontSize: 10, fontWeight: 800, color: cfg.color }}>
                                                {Math.round(actual).toLocaleString('vi-VN')}
                                                <span style={{ fontSize: 8, color: '#94A3B8', marginLeft: 2 }}>{cfg.unit}</span>
                                            </span>
                                        )}
                                        {delta != null && (
                                            <span className="rounded-full px-1.5 py-0.5 font-bold"
                                                style={{
                                                    fontSize: 8,
                                                    background: delta > 0 ? '#FEE2E2' : '#D1FAE5',
                                                    color: delta > 0 ? '#991B1B' : '#065F46',
                                                }}>
                                                {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                            {/* Reference line legend */}
                            <div className="flex items-center gap-1" style={{ paddingLeft: 8, borderLeft: '1px solid #E2E8F0' }}>
                                <svg width="22" height="8">
                                    <line x1="0" y1="4" x2="22" y2="4"
                                        stroke={refColorForBig} strokeWidth="1.5" strokeDasharray="4 2" />
                                </svg>
                                <span style={{ fontSize: 8, color: '#64748B', fontWeight: 600 }}>
                                    {compareMode === 'avg2025' ? t('avg2025', lang) : t('baseline', lang)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Chart canvas */}
                    <div style={{ flex: 1, minHeight: 0, padding: '4px 8px 2px' }}>
                        <BigGroupedChart
                            series={bigSeries}
                            refColor={refColorForBig}
                            height={220}
                        />
                    </div>

                    {/* Savings summary row */}
                    <div className="flex items-center gap-6 px-4 py-2"
                        style={{ borderTop: '1px solid #F1F5F9', background: '#FAFAFA', flexShrink: 0 }}>
                        {BIG_CHART_IDS.map(id => {
                            const cfg = SEU_CFG[id]
                            const h = histMap[currKey]?.[id]
                            const enpi = calcEnpi(h, id)
                            const ref = getRef(id)
                            const prod = h ? getProd(h, id) : null
                            const sv = (enpi != null && ref != null && prod != null) ? (ref - enpi) * prod : null
                            if (sv == null) return null
                            const saved = sv >= 0
                            return (
                                <div key={id} className="flex items-center gap-1.5">
                                    <cfg.Icon className="h-3 w-3" style={{ color: cfg.color }} />
                                    <span style={{ fontSize: 9, color: '#64748B', fontWeight: 600 }}>{cfg.short}:</span>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: saved ? '#059669' : '#DC2626' }}>
                                        {saved ? t('saving_tk', lang) : t('over_vm', lang)} {Math.abs(Math.round(sv)).toLocaleString('vi-VN')} {cfg.unit}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* ── BOTTOM: Compact 5-SEU strip ─────────────────────── */}
                <div style={{ flexShrink: 0 }}>
                    {/* Section header */}
                    <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                            <div style={{ width: 3, height: 14, background: BRAND.red, borderRadius: 2 }} />
                            <span style={{ fontSize: 10, fontWeight: 800, color: BRAND.darkRed, letterSpacing: '0.08em' }}>
                                {t('kpi_section', lang)}
                            </span>
                        </div>
                        {/* Overall badge */}
                        {(() => {
                            const deltas = ALL_SEU_IDS.map(id => pctChange(calcEnpi(histMap[currKey]?.[id], id), getRef(id))).filter((d): d is number => d != null)
                            if (!deltas.length) return null
                            const avgD = deltas.reduce((a, b) => a + b, 0) / deltas.length
                            const overCount = deltas.filter(d => d > 0).length
                            const [bg, fg, icon, label] = overCount === 0
                                ? ['#D1FAE5', '#065F46', '✓', lang === 'vi' ? 'TIẾT KIỆM' : 'SAVING']
                                : overCount <= 2 && avgD < 5
                                    ? ['#FEF3C7', '#92400E', '△', lang === 'vi' ? 'CHÚ Ý' : 'AT RISK']
                                    : ['#FEE2E2', '#991B1B', '✕', lang === 'vi' ? 'VƯỢT MỨC' : 'OVER']
                            return (
                                <div className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
                                    style={{ background: bg, border: `1px solid ${fg}30` }}>
                                    <span style={{ fontSize: 10, color: fg }}>{icon}</span>
                                    <span style={{ fontSize: 9, fontWeight: 800, color: fg }}>{label}</span>
                                    <span style={{ fontSize: 10, fontWeight: 900, color: fg }}>
                                        {avgD > 0 ? '+' : ''}{avgD.toFixed(1)}%
                                    </span>
                                </div>
                            )
                        })()}
                    </div>

                    {/* 5-column SEU grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                        {ALL_SEU_IDS.map(id => {
                            const cfg = SEU_CFG[id]
                            const h = histMap[currKey]?.[id]
                            const actual = h?.actual_energy ?? null
                            const enpi = calcEnpi(h, id)
                            const ref = getRef(id)
                            const delta = pctChange(enpi, ref)
                            const prod = h ? getProd(h, id) : null
                            const sv = (enpi != null && ref != null && prod != null) ? (ref - enpi) * prod : null
                            const saved = sv != null && sv >= 0
                            const noRef = isNoRef(id)
                            const trend = trendFor(id)
                            const clampedAbs = delta != null ? Math.min(Math.abs(delta), 25) : 0
                            const barW = (clampedAbs / 25) * 100

                            return (
                                <div key={id} className="rounded-lg flex flex-col overflow-hidden"
                                    style={{
                                        background: '#FFFFFF',
                                        border: `1.5px solid ${cfg.border}`,
                                        boxShadow: '0 1px 3px rgba(142,30,25,0.07)',
                                    }}>
                                    {/* Card top: icon + name + deviation badge */}
                                    <div className="flex items-center justify-between px-2 pt-1.5 pb-1"
                                        style={{ borderBottom: `1.5px solid ${cfg.color}18` }}>
                                        <div className="flex items-center gap-1.5">
                                            <div style={{ width: 18, height: 18, borderRadius: 5, background: cfg.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <cfg.Icon className="h-2.5 w-2.5" style={{ color: cfg.color }} />
                                            </div>
                                            <span style={{ fontSize: 10, fontWeight: 800, color: '#1E293B' }}>{cfg.short}</span>
                                        </div>
                                        {noRef ? (
                                            <span style={{ fontSize: 7.5, color: '#94A3B8' }}>N/A</span>
                                        ) : delta != null ? (
                                            <span style={{
                                                fontSize: 8.5, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                                                background: delta > 0 ? '#FEE2E2' : '#D1FAE5',
                                                color: delta > 0 ? '#991B1B' : '#065F46',
                                            }}>
                                                {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                                            </span>
                                        ) : null}
                                    </div>

                                    {/* Actual value + EnPI */}
                                    <div className="px-2 pt-1">
                                        <div style={{ fontSize: 15, fontWeight: 900, color: cfg.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                            {actual != null ? Math.round(actual).toLocaleString('vi-VN') : '—'}
                                        </div>
                                        <div style={{ fontSize: 7, color: '#94A3B8', marginTop: 1 }}>{cfg.unit}</div>
                                    </div>

                                    <div className="px-2 pb-1">
                                        <div className="flex items-center justify-between" style={{ fontSize: 7.5, marginTop: 2 }}>
                                            <span style={{ color: '#64748B' }}>
                                                EnPI <span style={{ fontWeight: 700, color: '#334155' }}>{enpi != null ? enpi.toFixed(3) : '—'}</span>
                                            </span>
                                            {!noRef && ref != null && (
                                                <span style={{ color: '#94A3B8' }}>ref {ref.toFixed(3)}</span>
                                            )}
                                        </div>
                                        {/* deviation bar */}
                                        {!noRef && delta != null && (
                                            <div style={{ height: 2.5, background: '#F1F5F9', borderRadius: 2, marginTop: 3 }}>
                                                <div style={{ height: '100%', width: `${barW}%`, borderRadius: 2, background: delta > 0 ? '#EF4444' : '#10B981' }} />
                                            </div>
                                        )}
                                        {/* saving */}
                                        {sv != null && !noRef && (
                                            <div style={{ fontSize: 7, fontWeight: 700, color: saved ? '#059669' : '#DC2626', marginTop: 2 }}>
                                                {saved ? '↓ ' : '↑ '} {Math.abs(Math.round(sv)).toLocaleString('vi-VN')} {cfg.unit}
                                            </div>
                                        )}
                                    </div>

                                    {/* Mini sparkline – flex:1 fills remaining height */}
                                    <div style={{ flex: 1, minHeight: 60, maxHeight: 80 }}>
                                        <MiniBarChart
                                            data={trend}
                                            color={cfg.color}
                                            refColor={compareMode === 'avg2025' ? BRAND.refGreen : BRAND.refGold}
                                            height={70}
                                        />
                                    </div>
                                </div>
                            )
                        })}
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
                    {ALL_SEU_IDS.map(id => {
                        const cfg = SEU_CFG[id]
                        const h = histMap[currKey]?.[id]
                        const enpi = calcEnpi(h, id)
                        const ref = getRef(id)
                        const prod = h ? getProd(h, id) : null
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
