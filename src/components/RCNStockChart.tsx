"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { format, subDays, addDays, startOfDay } from "date-fns"
import { vi } from "date-fns/locale"
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend, Cell
} from "recharts"
import { ChevronLeft, ChevronRight, BarChart3, TrendingUp } from "lucide-react"

// ── 12 sizes in quality order (high → low) ───────────────────────────────────
const SIZE_ORDER = [
    'A++ (28>)',
    'A+ (26~28)',
    'A1 (25~26)',
    'A2 (24~25)',
    'B1 (23~24)',
    'B2 (22~23)',
    'C1 (21~22)',
    'C2 (20~21)',
    'D1 (19~20)',
    'D2 (18~19)',
    'E (17~18)',
    'E (16)',
] as const

type RcnSize = typeof SIZE_ORDER[number]

interface BarColors { from: string; to: string }

const SIZE_COLORS: Record<RcnSize, BarColors> = {
    'A++ (28>)': { from: '#059669', to: '#047857' },
    'A+ (26~28)': { from: '#10b981', to: '#059669' },
    'A1 (25~26)': { from: '#34d399', to: '#10b981' },
    'A2 (24~25)': { from: '#6ee7b7', to: '#34d399' },
    'B1 (23~24)': { from: '#f59e0b', to: '#d97706' },
    'B2 (22~23)': { from: '#fbbf24', to: '#f59e0b' },
    'C1 (21~22)': { from: '#f97316', to: '#ea580c' },
    'C2 (20~21)': { from: '#fb923c', to: '#f97316' },
    'D1 (19~20)': { from: '#e63121', to: '#b91c1c' },
    'D2 (18~19)': { from: '#f87171', to: '#e63121' },
    'E (17~18)': { from: '#7c3aed', to: '#6d28d9' },
    'E (16)': { from: '#a78bfa', to: '#7c3aed' },
}

const SHORT_LABEL: Record<RcnSize, string> = {
    'A++ (28>)': 'A++',
    'A+ (26~28)': 'A+',
    'A1 (25~26)': 'A1',
    'A2 (24~25)': 'A2',
    'B1 (23~24)': 'B1',
    'B2 (22~23)': 'B2',
    'C1 (21~22)': 'C1',
    'C2 (20~21)': 'C2',
    'D1 (19~20)': 'D1',
    'D2 (18~19)': 'D2',
    'E (17~18)': 'E1',
    'E (16)': 'E2',
}

// ── Animated bar ──────────────────────────────────────────────────────────────
function AnimatedBar({ pct, from, to, delay }: { pct: number; from: string; to: string; delay: number }) {
    const [width, setWidth] = useState(0)
    useEffect(() => {
        const t = setTimeout(() => setWidth(pct), 80 + delay)
        return () => clearTimeout(t)
    }, [pct, delay])
    return (
        <div
            className="h-full rounded-r-full"
            style={{
                width: `${width}%`,
                transition: `width 700ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
                background: `linear-gradient(90deg, ${from}, ${to})`,
                boxShadow: pct > 8 ? `0 1px 5px ${from}60` : 'none',
            }}
        />
    )
}

// ── Custom Tooltip for history chart ─────────────────────────────────────────
function HistoryTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0)
    return (
        <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl p-3 text-[11px] min-w-[160px]">
            <p className="font-bold text-white mb-2 text-xs border-b border-slate-700 pb-1.5">{label}</p>
            <p className="text-slate-300 font-black mb-1.5">
                Tổng: <span className="text-white">{(total * 1000).toLocaleString('vi-VN')} kg</span>
            </p>
            {[...payload].reverse().filter((p: any) => p.value > 0).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-3 py-0.5">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.fill }} />
                        <span className="text-slate-400">{SHORT_LABEL[p.dataKey as RcnSize] ?? p.dataKey}</span>
                    </div>
                    <span className="font-bold text-slate-200 tabular-nums">
                        {(p.value * 1000).toLocaleString('vi-VN')} kg
                    </span>
                </div>
            ))}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────
export function RCNStockChart() {
    const supabase = createClient()
    const today = startOfDay(new Date())

    // ── View mode: "snapshot" | "history"
    const [viewMode, setViewMode] = useState<'snapshot' | 'history'>('snapshot')

    // ── Snapshot state ────────────────────────────────────────────────────────
    const [snapshotDate, setSnapshotDate] = useState<Date>(today)
    const [closingTon, setClosingTon] = useState<Record<RcnSize, number>>(
        () => Object.fromEntries(SIZE_ORDER.map(s => [s, 0])) as Record<RcnSize, number>
    )
    const [lastDate, setLastDate] = useState('')
    const [snapLoading, setSnapLoading] = useState(true)
    const [hovered, setHovered] = useState<RcnSize | null>(null)

    // ── History state ─────────────────────────────────────────────────────────
    const [historyData, setHistoryData] = useState<any[]>([])
    const [histLoading, setHistLoading] = useState(false)
    const [histDays, setHistDays] = useState<7 | 14 | 30>(30)

    // ── Load snapshot for a specific date (walk back up to 7 days) ────────────
    const loadSnapshot = useCallback(async (date: Date) => {
        setSnapLoading(true)
        for (let i = 0; i < 7; i++) {
            const d = format(subDays(date, i), 'yyyy-MM-dd')
            const { data } = await supabase
                .from('v_rcn_inventory')
                .select('size_code, closing_ton')
                .eq('work_date', d)
            if (data && data.length > 0) {
                const map: Record<string, number> = {}
                data.forEach((r: any) => { map[r.size_code] = Number(r.closing_ton || 0) })
                setClosingTon(Object.fromEntries(SIZE_ORDER.map(s => [s, map[s] ?? 0])) as Record<RcnSize, number>)
                setLastDate(d)
                break
            }
        }
        setSnapLoading(false)
    }, [supabase])

    // ── Load history ──────────────────────────────────────────────────────────
    const loadHistory = useCallback(async (days: number) => {
        setHistLoading(true)
        const endStr = format(today, 'yyyy-MM-dd')
        const startStr = format(subDays(today, days - 1), 'yyyy-MM-dd')
        const { data } = await supabase
            .from('v_rcn_inventory')
            .select('work_date, size_code, closing_ton')
            .gte('work_date', startStr)
            .lte('work_date', endStr)
            .order('work_date')

        if (data) {
            // Group by date
            const byDate: Record<string, Record<string, number>> = {}
            data.forEach((r: any) => {
                if (!byDate[r.work_date]) byDate[r.work_date] = {}
                byDate[r.work_date][r.size_code] = Number(r.closing_ton || 0)
            })
            const points = Object.keys(byDate).sort().map(d => {
                const row: any = { date: d, label: format(new Date(d + 'T00:00:00'), 'dd/MM') }
                SIZE_ORDER.forEach(s => { row[s] = byDate[d][s] ?? 0 })
                row._total = SIZE_ORDER.reduce((sum, s) => sum + (row[s] || 0), 0)
                return row
            })
            setHistoryData(points)
        }
        setHistLoading(false)
    }, [supabase, today])

    // Initial load
    useEffect(() => { loadSnapshot(snapshotDate) }, [snapshotDate])
    useEffect(() => { if (viewMode === 'history') loadHistory(histDays) }, [viewMode, histDays])

    // ── Derived snapshot values ───────────────────────────────────────────────
    const rows = SIZE_ORDER.map(s => ({ size: s, ton: closingTon[s] }))
    const totalTon = rows.reduce((sum, r) => sum + r.ton, 0)
    const maxTon = Math.max(...rows.map(r => r.ton), 0.001)
    const sizesInStock = rows.filter(r => r.ton > 0).length
    const topRow = [...rows].sort((a, b) => b.ton - a.ton)[0]
    const fmtTotal = totalTon >= 100 ? `${totalTon.toFixed(1)} T` : `${(totalTon * 1000).toFixed(0)} kg`

    const isToday = format(snapshotDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full w-full select-none">

            {/* ── Top bar: mode toggle + date nav ── */}
            <div className="flex items-center justify-between gap-2 px-3 pb-2 flex-shrink-0">
                {/* View toggle */}
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                    <button
                        onClick={() => setViewMode('snapshot')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all duration-200 ${viewMode === 'snapshot'
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        <BarChart3 className="w-3 h-3" />
                        Tồn Kho
                    </button>
                    <button
                        onClick={() => setViewMode('history')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all duration-200 ${viewMode === 'history'
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        <TrendingUp className="w-3 h-3" />
                        Lịch Sử
                    </button>
                </div>

                {/* Date nav (snapshot mode) or range selector (history mode) */}
                {viewMode === 'snapshot' ? (
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-0.5 shadow-sm">
                        <button
                            onClick={() => setSnapshotDate(d => subDays(d, 1))}
                            className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 transition-colors"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-bold text-slate-700 min-w-[70px] text-center">
                            {isToday ? 'Hôm nay' : format(snapshotDate, 'dd/MM/yyyy')}
                        </span>
                        <button
                            onClick={() => setSnapshotDate(d => { const next = addDays(d, 1); return next > today ? today : next })}
                            disabled={isToday}
                            className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                        {([7, 14, 30] as const).map(d => (
                            <button
                                key={d}
                                onClick={() => setHistDays(d)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-all duration-150 ${histDays === d
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                {d}N
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════ SNAPSHOT VIEW ══════════════════════════════ */}
            {viewMode === 'snapshot' && (
                <>
                    {/* KPI pills */}
                    <div className="grid grid-cols-3 gap-2 px-3 pb-3 flex-shrink-0">
                        {[
                            { label: 'TOTAL STOCK', value: snapLoading ? '—' : fmtTotal, color: '#e63121' },
                            { label: 'TOP SIZE', value: snapLoading ? '—' : (topRow?.ton > 0 ? `${SHORT_LABEL[topRow.size as RcnSize]}: ${topRow.ton.toFixed(1)}T` : '—'), color: '#f59e0b' },
                            { label: 'IN STOCK', value: snapLoading ? '—' : `${sizesInStock}/12`, color: '#10b981' },
                        ].map(k => (
                            <div key={k.label} className="flex flex-col items-center justify-center bg-slate-50/80 rounded-xl border border-slate-200/60 py-2 shadow-sm">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 tracking-widest uppercase mb-0.5">{k.label}</span>
                                <span className="font-black text-sm md:text-lg tabular-nums" style={{ color: k.color }}>{k.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Bar rows */}
                    <div className="flex flex-col gap-1 flex-1 px-3 pb-2 overflow-hidden min-h-0">
                        {snapLoading ? (
                            <div className="flex flex-col gap-1.5 animate-pulse">
                                {SIZE_ORDER.map(s => (
                                    <div key={s} className="flex items-center gap-1.5" style={{ height: 22 }}>
                                        <div className="w-6 h-3 bg-slate-100 rounded" />
                                        <div className="flex-1 h-3 bg-slate-100 rounded-full" />
                                        <div className="w-16 h-3 bg-slate-100 rounded" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            rows.map((row, idx) => {
                                const isEmpty = row.ton <= 0
                                const pct = (row.ton / maxTon) * 100
                                const pctOfTotal = totalTon > 0 ? (row.ton / totalTon) * 100 : 0
                                const col = SIZE_COLORS[row.size as RcnSize]
                                const isHov = hovered === row.size
                                return (
                                    <div
                                        key={row.size}
                                        className="flex items-center gap-2.5 rounded-md transition-all duration-150 cursor-default px-1"
                                        style={{
                                            opacity: isEmpty ? 0.35 : 1,
                                            minHeight: 26,
                                            background: isHov ? `${col.from}15` : 'transparent',
                                        }}
                                        onMouseEnter={() => setHovered(row.size as RcnSize)}
                                        onMouseLeave={() => setHovered(null)}
                                        title={isEmpty ? `${row.size} — Hết hàng` : `${row.size}\nTồn: ${(row.ton * 1000).toLocaleString('vi-VN')} kg\nTỷ trọng: ${pctOfTotal.toFixed(1)}%`}
                                    >
                                        <span
                                            className="font-black tracking-tight text-right shrink-0"
                                            style={{ width: 28, color: isEmpty ? '#94a3b8' : col.from, fontSize: 13 }}
                                        >
                                            {SHORT_LABEL[row.size as RcnSize]}
                                        </span>
                                        <div className="flex-1 bg-slate-100 rounded-full overflow-hidden" style={{ height: 16 }}>
                                            {!isEmpty && <AnimatedBar pct={pct} from={col.from} to={col.to} delay={idx * 45} />}
                                        </div>
                                        <span
                                            className="shrink-0 tabular-nums text-right leading-none flex items-center justify-end gap-1.5"
                                            style={{ width: 95, color: isEmpty ? '#cbd5e1' : '#475569', fontSize: 12, fontWeight: 700 }}
                                        >
                                            {isEmpty
                                                ? <span className="text-slate-300">—</span>
                                                : <><span>{(row.ton * 1000).toLocaleString('vi-VN')}</span><span className="text-[10px] text-slate-400 font-medium w-[24px]">{pctOfTotal.toFixed(0)}%</span></>
                                            }
                                        </span>
                                    </div>
                                )
                            })
                        )}

                        {/* Date watermark */}
                        {lastDate && !snapLoading && (
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200 mt-2 flex-shrink-0">
                                <span className="text-xs text-slate-400 font-medium tracking-wide">
                                    📅 Kì báo cáo: <strong className="text-slate-500">{format(new Date(lastDate + 'T00:00:00'), 'dd/MM/yyyy')}</strong>
                                </span>
                                <span className="text-xs text-slate-500 font-bold tracking-tight">
                                    TỔNG: <span className="text-slate-700">{(totalTon * 1000).toLocaleString('vi-VN')} kg</span>
                                </span>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ══════════════════════════════ HISTORY VIEW ══════════════════════════════ */}
            {viewMode === 'history' && (
                <div className="flex flex-col flex-1 min-h-0 px-2 pb-2 gap-3">

                    {histLoading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                                <span className="text-[11px] text-slate-400 font-medium animate-pulse">Đang tải lịch sử...</span>
                            </div>
                        </div>
                    ) : historyData.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-[12px] text-slate-400 italic">Không có dữ liệu lịch sử trong khoảng này.</p>
                        </div>
                    ) : (
                        <>
                            {/* Total trend bar */}
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5 flex items-center gap-1">
                                    <span className="w-1 h-3 bg-red-500 rounded-full inline-block" />
                                    Xu Hướng Tổng Tồn Kho (Tấn)
                                </p>
                                <div style={{ height: 90 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={historyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#e63121" stopOpacity={0.4} />
                                                    <stop offset="100%" stopColor="#e63121" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                            <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}kT` : `${v}T`} />
                                            <Tooltip
                                                content={({ active, payload, label }) => {
                                                    if (!active || !payload?.length) return null
                                                    const val = payload[0]?.value as number || 0
                                                    return (
                                                        <div className="bg-slate-900/95 border border-slate-700 rounded-lg shadow-xl px-3 py-2 text-[11px]">
                                                            <p className="text-slate-400 mb-0.5">{label}</p>
                                                            <p className="font-black text-white">
                                                                {(val * 1000).toLocaleString('vi-VN')} kg
                                                                <span className="text-slate-400 font-medium ml-1.5">({val.toFixed(1)} T)</span>
                                                            </p>
                                                        </div>
                                                    )
                                                }}
                                            />
                                            <Area type="monotone" dataKey="_total" stroke="#e63121" strokeWidth={2} fill="url(#histGrad)"
                                                dot={false} activeDot={{ r: 4, fill: '#e63121', strokeWidth: 0 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Stacked area by size */}
                            <div className="flex-1 min-h-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5 flex items-center gap-1">
                                    <span className="w-1 h-3 bg-blue-500 rounded-full inline-block" />
                                    Cơ Cấu Tồn Kho Theo Cỡ Hạt
                                </p>
                                <div style={{ height: '100%', minHeight: 140 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={historyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} stackOffset="none">
                                            <defs>
                                                {SIZE_ORDER.map(s => (
                                                    <linearGradient key={s} id={`g_${SHORT_LABEL[s]}`} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor={SIZE_COLORS[s].from} stopOpacity={0.85} />
                                                        <stop offset="100%" stopColor={SIZE_COLORS[s].from} stopOpacity={0.35} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                            <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}T`} />
                                            <Tooltip content={<HistoryTooltip />} />
                                            {/* Render in reverse so A++ is on top */}
                                            {[...SIZE_ORDER].reverse().map(s => (
                                                <Area
                                                    key={s}
                                                    type="monotone"
                                                    dataKey={s}
                                                    stackId="1"
                                                    stroke={SIZE_COLORS[s].from}
                                                    strokeWidth={0.5}
                                                    fill={`url(#g_${SHORT_LABEL[s]})`}
                                                    dot={false}
                                                    activeDot={false}
                                                />
                                            ))}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Legend */}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 flex-shrink-0 pt-1 border-t border-slate-100">
                                {SIZE_ORDER.filter(s => historyData.some(d => d[s] > 0)).map(s => (
                                    <div key={s} className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: SIZE_COLORS[s].from }} />
                                        <span className="text-[9px] font-bold text-slate-500">{SHORT_LABEL[s]}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
