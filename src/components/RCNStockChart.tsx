"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { format, subDays } from "date-fns"

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

interface BarColors {
    from: string
    to: string
}

// Grade-based colour palette
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

// Short display labels to save space in the card
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

// ── Animated bar inner ────────────────────────────────────────────────────────
function AnimatedBar({ pct, from, to, delay }: { pct: number; from: string; to: string; delay: number }) {
    const [width, setWidth] = useState(0)
    useEffect(() => {
        const t = setTimeout(() => setWidth(pct), 120 + delay)
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

// ── Main component ────────────────────────────────────────────────────────────
export function RCNStockChart() {
    const supabase = createClient()
    const [closingTon, setClosingTon] = useState<Record<RcnSize, number>>(
        () => Object.fromEntries(SIZE_ORDER.map(s => [s, 0])) as Record<RcnSize, number>
    )
    const [lastDate, setLastDate] = useState('')
    const [loading, setLoading] = useState(true)
    const [hovered, setHovered] = useState<RcnSize | null>(null)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            // Walk back up to 7 days to find the most recent record
            for (let i = 0; i < 7; i++) {
                const d = format(subDays(new Date(), i), 'yyyy-MM-dd')
                const { data } = await supabase
                    .from('v_rcn_inventory')
                    .select('size_code, closing_ton')
                    .eq('work_date', d)

                if (data && data.length > 0) {
                    const map: Record<string, number> = {}
                    data.forEach((r: any) => { map[r.size_code] = Number(r.closing_ton || 0) })
                    setClosingTon(
                        Object.fromEntries(SIZE_ORDER.map(s => [s, map[s] ?? 0])) as Record<RcnSize, number>
                    )
                    setLastDate(d)
                    break
                }
            }
            setLoading(false)
        }
        load()
    }, [])

    // ── Derived values ─────────────────────────────────────────────────────────
    const rows = SIZE_ORDER.map(s => ({ size: s, ton: closingTon[s] }))
    const totalTon = rows.reduce((sum, r) => sum + r.ton, 0)
    const maxTon = Math.max(...rows.map(r => r.ton), 0.001)
    const sizesInStock = rows.filter(r => r.ton > 0).length
    const topRow = [...rows].sort((a, b) => b.ton - a.ton)[0]

    const fmtTotal = totalTon >= 100
        ? `${totalTon.toFixed(1)} T`
        : `${(totalTon * 1000).toFixed(0)} kg`

    // ── Skeleton ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col gap-1.5 px-2 py-2 animate-pulse">
                <div className="grid grid-cols-3 gap-1 mb-1">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-8 bg-slate-100 rounded-lg" />
                    ))}
                </div>
                {SIZE_ORDER.map(s => (
                    <div key={s} className="flex items-center gap-1.5" style={{ height: 17 }}>
                        <div className="w-6 h-3 bg-slate-100 rounded" />
                        <div className="flex-1 h-3 bg-slate-100 rounded-full" />
                        <div className="w-16 h-3 bg-slate-100 rounded" />
                    </div>
                ))}
            </div>
        )
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full w-full select-none">

            {/* ── KPI pill row ── */}
            <div className="grid grid-cols-3 gap-2 px-3 pb-3 flex-shrink-0">
                {[
                    { label: 'TOTAL STOCK', value: fmtTotal, color: '#e63121' },
                    { label: 'TOP SIZE', value: topRow?.ton > 0 ? `${SHORT_LABEL[topRow.size as RcnSize]}: ${topRow.ton.toFixed(1)}T` : '—', color: '#f59e0b' },
                    { label: 'IN STOCK', value: `${sizesInStock}/12`, color: '#10b981' },
                ].map(k => (
                    <div key={k.label} className="flex flex-col items-center justify-center bg-slate-50/80 rounded-xl border border-slate-200/60 py-2 shadow-sm">
                        <span className="text-[10px] md:text-xs font-bold text-slate-500 tracking-widest uppercase mb-0.5">{k.label}</span>
                        <span className="font-black text-sm md:text-lg tabular-nums" style={{ color: k.color }}>{k.value}</span>
                    </div>
                ))}
            </div>

            {/* ── Bar chart ── */}
            <div className="flex flex-col gap-1 flex-1 px-3 pb-2 overflow-hidden min-h-0">
                {rows.map((row, idx) => {
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
                            title={isEmpty
                                ? `${row.size} — Hết hàng`
                                : `${row.size}\nTồn: ${(row.ton * 1000).toLocaleString('vi-VN')} kg (${row.ton.toFixed(3)} T)\nTỷ trọng: ${pctOfTotal.toFixed(1)}%`
                            }
                        >
                            {/* Short size label */}
                            <span
                                className="font-black tracking-tight text-right shrink-0"
                                style={{ width: 28, color: isEmpty ? '#94a3b8' : col.from, fontSize: 13 }}
                            >
                                {SHORT_LABEL[row.size as RcnSize]}
                            </span>

                            {/* Bar track */}
                            <div className="flex-1 bg-slate-100 rounded-full overflow-hidden" style={{ height: 16 }}>
                                {!isEmpty && (
                                    <AnimatedBar pct={pct} from={col.from} to={col.to} delay={idx * 45} />
                                )}
                            </div>

                            {/* Value text */}
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
                })}

                {/* Date watermark */}
                {lastDate && (
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200 mt-2">
                        <span className="text-xs text-slate-400 font-medium tracking-wide">
                            📅 Kì báo cáo: <strong className="text-slate-500">{format(new Date(lastDate + 'T00:00:00'), 'dd/MM/yyyy')}</strong>
                        </span>
                        <span className="text-xs text-slate-500 font-bold tracking-tight">
                            TỔNG: <span className="text-slate-700">{(totalTon * 1000).toLocaleString('vi-VN')} kg</span>
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
