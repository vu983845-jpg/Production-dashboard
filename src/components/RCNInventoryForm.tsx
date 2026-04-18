"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

const RCN_SIZES = ['A+', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'] as const
type RcnSize = typeof RCN_SIZES[number]

interface RcnRow {
    opening_ton: number
    ton_received: number
    ton_dispatched: number
    closing_ton: number
    note: string
}

const emptyRow = (): RcnRow => ({ opening_ton: 0, ton_received: 0, ton_dispatched: 0, closing_ton: 0, note: '' })

interface Props {
    date: Date
    selectedDept: string
    userId: string
    isSaving: boolean
    setIsSaving: (v: boolean) => void
}

export default function RCNInventoryForm({ date, selectedDept, userId, isSaving, setIsSaving }: Props) {
    const supabase = createClient()
    const formattedDate = format(date, 'yyyy-MM-dd')

    const [rows, setRows] = useState<Record<RcnSize, RcnRow>>(() =>
        Object.fromEntries(RCN_SIZES.map(s => [s, emptyRow()])) as Record<RcnSize, RcnRow>
    )
    const [loading, setLoading] = useState(false)
    const [prevDateRows, setPrevDateRows] = useState<Record<RcnSize, number>>({} as any)

    // Load existing data for selected date + yesterday's closing as opening
    useEffect(() => {
        const load = async () => {
            setLoading(true)

            // Get yesterday's closing to use as today's opening
            const yesterday = new Date(date)
            yesterday.setDate(yesterday.getDate() - 1)
            const yStr = format(yesterday, 'yyyy-MM-dd')

            const { data: prevData } = await supabase
                .from('v_rcn_inventory')
                .select('size_code, closing_ton')
                .eq('work_date', yStr)

            const prevClosing: Record<string, number> = {}
            prevData?.forEach((r: any) => { prevClosing[r.size_code] = Number(r.closing_ton || 0) })
            setPrevDateRows(prevClosing as any)

            // Get today's existing data
            const { data: todayData } = await supabase
                .from('rcn_inventory')
                .select('*')
                .eq('work_date', formattedDate)

            const newRows: Record<RcnSize, RcnRow> = Object.fromEntries(
                RCN_SIZES.map(s => [s, emptyRow()])
            ) as Record<RcnSize, RcnRow>

            if (todayData && todayData.length > 0) {
                todayData.forEach((r: any) => {
                    if (RCN_SIZES.includes(r.size_code)) {
                        const opening = Number(r.opening_ton || 0)
                        const received = Number(r.ton_received || 0)
                        const dispatched = Number(r.ton_dispatched || 0)
                        newRows[r.size_code as RcnSize] = {
                            opening_ton: opening,
                            ton_received: received,
                            ton_dispatched: dispatched,
                            closing_ton: opening + received - dispatched,
                            note: r.note || ''
                        }
                    }
                })
            } else {
                // Pre-fill opening from yesterday closing
                RCN_SIZES.forEach(s => {
                    newRows[s].opening_ton = prevClosing[s] || 0
                    newRows[s].closing_ton = prevClosing[s] || 0
                })
            }

            setRows(newRows)
            setLoading(false)
        }
        load()
    }, [formattedDate])

    const updateRow = (size: RcnSize, field: keyof RcnRow, value: number | string) => {
        setRows(prev => {
            const updated = { ...prev[size], [field]: value }
            if (field !== 'note') {
                updated.closing_ton = updated.opening_ton + updated.ton_received - updated.ton_dispatched
            }
            return { ...prev, [size]: updated }
        })
    }

    const totalReceived = RCN_SIZES.reduce((s, k) => s + (rows[k].ton_received || 0), 0)
    const totalDispatched = RCN_SIZES.reduce((s, k) => s + (rows[k].ton_dispatched || 0), 0)
    const totalClosing = RCN_SIZES.reduce((s, k) => s + (rows[k].closing_ton || 0), 0)
    const totalOpening = RCN_SIZES.reduce((s, k) => s + (rows[k].opening_ton || 0), 0)

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const payload = RCN_SIZES.map(size => ({
                work_date: formattedDate,
                size_code: size,
                opening_ton: rows[size].opening_ton,
                ton_received: rows[size].ton_received,
                ton_dispatched: rows[size].ton_dispatched,
                note: rows[size].note || null,
                updated_by: userId,
                updated_at: new Date().toISOString()
            }))

            const { error } = await supabase
                .from('rcn_inventory')
                .upsert(payload, { onConflict: 'work_date,size_code' })

            if (error) throw error
            toast.success(`✅ Đã lưu tồn kho RCN ngày ${format(date, 'dd/MM/yyyy')}`)
        } catch (err: any) {
            toast.error('Lỗi khi lưu: ' + err.message)
        } finally {
            setIsSaving(false)
        }
    }

    const sizeColors: Record<RcnSize, string> = {
        'A+': 'bg-yellow-50 border-yellow-300 text-yellow-800',
        'A1': 'bg-amber-50 border-amber-300 text-amber-800',
        'A2': 'bg-orange-50 border-orange-300 text-orange-800',
        'B1': 'bg-blue-50 border-blue-300 text-blue-800',
        'B2': 'bg-indigo-50 border-indigo-300 text-indigo-800',
        'C1': 'bg-green-50 border-green-300 text-green-800',
        'C2': 'bg-teal-50 border-teal-300 text-teal-800',
        'D1': 'bg-purple-50 border-purple-300 text-purple-800',
        'D2': 'bg-pink-50 border-pink-300 text-pink-800',
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-16 text-muted-foreground">
                <div className="animate-pulse text-sm">Đang tải dữ liệu kho RCN...</div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Header summary */}
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'Tồn Đầu', value: totalOpening, color: 'text-slate-600', bg: 'bg-slate-50' },
                    { label: 'Tổng Nhập', value: totalReceived, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Tổng Xuất', value: totalDispatched, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { label: 'Tồn Cuối', value: totalClosing, color: 'text-blue-700 font-bold', bg: 'bg-blue-50' },
                ].map(item => (
                    <div key={item.label} className={`rounded-xl border p-3 text-center ${item.bg}`}>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{item.label}</div>
                        <div className={`text-lg font-bold ${item.color}`}>{item.value.toFixed(2)}</div>
                        <div className="text-[10px] text-muted-foreground">tấn</div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                <div className="bg-slate-800 text-white px-4 py-3 flex items-center gap-2">
                    <span className="text-lg">📦</span>
                    <div>
                        <div className="font-semibold text-sm">Kho RCN — Tồn Kho Theo Size</div>
                        <div className="text-xs text-slate-300">Ngày {format(date, 'dd/MM/yyyy')}</div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                <th className="text-left px-4 py-2.5 w-20">Size</th>
                                <th className="text-right px-3 py-2.5">Tồn Đầu (T)</th>
                                <th className="text-right px-3 py-2.5 text-emerald-600">Nhập Kho (T)</th>
                                <th className="text-right px-3 py-2.5 text-orange-600">Xuất Hấp (T)</th>
                                <th className="text-right px-3 py-2.5 text-blue-700 font-bold">Tồn Cuối (T)</th>
                                <th className="text-left px-3 py-2.5">Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {RCN_SIZES.map(size => {
                                const row = rows[size]
                                const closing = row.closing_ton
                                const isLow = closing < 10 && closing >= 0
                                const isNegative = closing < 0
                                return (
                                    <tr key={size} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-2">
                                            <span className={`inline-flex items-center justify-center w-10 h-7 rounded-md border text-xs font-bold ${sizeColors[size]}`}>
                                                {size}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <input
                                                type="number" min="0" step="0.001"
                                                value={row.opening_ton || ''}
                                                onChange={e => updateRow(size, 'opening_ton', Number(e.target.value) || 0)}
                                                className="w-24 text-right bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-slate-300 outline-none"
                                                placeholder="0.000"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <input
                                                type="number" min="0" step="0.001"
                                                value={row.ton_received || ''}
                                                onChange={e => updateRow(size, 'ton_received', Number(e.target.value) || 0)}
                                                className="w-24 text-right bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-emerald-300 outline-none"
                                                placeholder="0.000"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <input
                                                type="number" min="0" step="0.001"
                                                value={row.ton_dispatched || ''}
                                                onChange={e => updateRow(size, 'ton_dispatched', Number(e.target.value) || 0)}
                                                className="w-24 text-right bg-orange-50 border border-orange-200 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                                                placeholder="0.000"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <div className={`inline-flex items-center justify-end gap-1 w-24 font-bold text-sm px-2 py-1 rounded-md ${isNegative ? 'text-red-600 bg-red-50' : isLow ? 'text-amber-600 bg-amber-50' : 'text-blue-700 bg-blue-50'}`}>
                                                {isNegative && <span title="Xuất vượt tồn!">⚠️</span>}
                                                {isLow && !isNegative && <span title="Tồn thấp">🟡</span>}
                                                {closing.toFixed(3)}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={row.note}
                                                onChange={e => updateRow(size, 'note', e.target.value)}
                                                className="w-full bg-transparent border border-slate-200 rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-slate-300 outline-none placeholder:text-slate-300"
                                                placeholder="ghi chú..."
                                            />
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-800 text-white text-sm font-bold">
                                <td className="px-4 py-2.5">TỔNG</td>
                                <td className="px-3 py-2.5 text-right">{totalOpening.toFixed(3)}</td>
                                <td className="px-3 py-2.5 text-right text-emerald-300">{totalReceived.toFixed(3)}</td>
                                <td className="px-3 py-2.5 text-right text-orange-300">{totalDispatched.toFixed(3)}</td>
                                <td className="px-3 py-2.5 text-right text-blue-200">{totalClosing.toFixed(3)}</td>
                                <td className="px-3 py-2.5 text-xs text-slate-400">đơn vị: tấn</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Note about opening stock */}
            {Object.values(prevDateRows).every(v => v === 0) && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                    💡 <strong>Lần đầu nhập:</strong> Điền số tồn đầu ngày vào cột "Tồn Đầu" cho từng size.
                    Từ ngày mai, hệ thống sẽ tự lấy tồn cuối hôm nay làm tồn đầu.
                </div>
            )}

            {/* Save button */}
            <div className="flex justify-end pt-2">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 text-sm font-semibold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                        <><span className="animate-spin">⏳</span> Đang lưu...</>
                    ) : (
                        <><span>💾</span> Lưu Tồn Kho RCN</>
                    )}
                </button>
            </div>
        </div>
    )
}
