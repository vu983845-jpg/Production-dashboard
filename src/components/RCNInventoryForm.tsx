"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { ClipboardList } from "lucide-react"

export const RCN_SIZES = [
    'A++ (28>)', 'A+ (26~28)', 'A1 (25~26)', 'A2 (24~25)',
    'B1 (23~24)', 'B2 (22~23)', 'C1 (21~22)', 'C2 (20~21)',
    'D1 (19~20)', 'D2 (18~19)', 'E (17~18)', 'E (16)'
] as const
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
    const [pasteData, setPasteData] = useState("")

    useEffect(() => {
        const load = async () => {
            setLoading(true)

            const yesterday = new Date(date)
            yesterday.setDate(yesterday.getDate() - 1)
            const yStr = format(yesterday, 'yyyy-MM-dd')

            // Fetch yesterday's closing stock 
            const { data: prevData } = await supabase
                .from('rcn_inventory')
                .select('size_code, opening_ton, ton_received, ton_dispatched')
                .eq('work_date', yStr)

            const prevClosing: Record<string, number> = {}
            prevData?.forEach((r: any) => {
                const closing = Number(r.opening_ton) + Number(r.ton_received) - Number(r.ton_dispatched);
                prevClosing[r.size_code] = closing;
            })

            const { data: todayData } = await supabase
                .from('rcn_inventory')
                .select('*')
                .eq('work_date', formattedDate)

            const newRows: Record<RcnSize, RcnRow> = Object.fromEntries(
                RCN_SIZES.map(s => [s, emptyRow()])
            ) as Record<RcnSize, RcnRow>

            if (todayData && todayData.length > 0) {
                todayData.forEach((r: any) => {
                    if (RCN_SIZES.includes(r.size_code as RcnSize)) {
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

    const handlePaste = () => {
        if (!pasteData.trim()) return;

        const lines = pasteData.split('\n').filter(l => l.trim().length > 0);
        let dataRow = lines.find(l => /^[\d,.\s\-]+$/.test(l.replace(/\t/g, ' ')));
        if (!dataRow && lines.length > 0) dataRow = lines[0];

        if (dataRow) {
            const parts = dataRow.split('\t').map(s => {
                const clean = s.replace(/,/g, '').trim();
                if (clean === '-' || clean === '') return 0;
                return parseFloat(clean) || 0;
            });

            if (parts.length >= 13) {
                const updates: Record<string, number> = {};
                const excelMap: Record<number, string> = {
                    1: 'A+ (26~28)', 2: 'A1 (25~26)', 3: 'A2 (24~25)',
                    4: 'B1 (23~24)', 5: 'B2 (22~23)', 6: 'C1 (21~22)',
                    7: 'C2 (20~21)', 8: 'D1 (19~20)', 9: 'D2 (18~19)',
                    10: 'E (17~18)', 11: 'A++ (28>)', 12: 'E (16)'
                };

                Object.keys(excelMap).forEach(k => {
                    const idx = Number(k)
                    const sizeName = excelMap[idx];
                    const closingKg = parts[idx];
                    const closingTon = Number((closingKg / 1000).toFixed(3));
                    updates[sizeName] = closingTon;
                });

                setRows(prev => {
                    const next = { ...prev };
                    Object.keys(updates).forEach(size => {
                        const s = size as RcnSize;
                        if (next[s]) {
                            const opening = next[s].opening_ton;
                            const targetClosing = updates[size];

                            let received = 0;
                            let dispatched = 0;
                            if (targetClosing >= opening) {
                                received = targetClosing - opening;
                            } else {
                                dispatched = opening - targetClosing;
                            }

                            next[s] = {
                                ...next[s],
                                ton_received: Number(received.toFixed(3)),
                                ton_dispatched: Number(dispatched.toFixed(3)),
                                closing_ton: targetClosing,
                                note: "Data from Excel"
                            };
                        }
                    });
                    return next;
                });
                toast.success("✅ Đã trích xuất số liệu tồn cuối thành công!");
                setPasteData("");
            } else {
                toast.error(`Dữ liệu không đủ 13 cột! (Tìm thấy ${parts.length} cột)`);
            }
        } else {
            toast.error("Không tìm thấy dữ liệu số hợp lệ!");
        }
    }

    const updateRow = (size: RcnSize, field: keyof RcnRow, value: number | string) => {
        setRows(prev => {
            const updated = { ...prev[size], [field]: value }
            if (field !== 'note') {
                updated.closing_ton = Number((updated.opening_ton + updated.ton_received - updated.ton_dispatched).toFixed(3))
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

    if (loading) {
        return (
            <div className="flex items-center justify-center p-16 text-muted-foreground">
                <div className="animate-pulse text-sm">Đang tải dữ liệu kho RCN...</div>
            </div>
        )
    }

    return (
        <div className="space-y-4">

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                        <ClipboardList className="w-4 h-4 text-primary" />
                        Dán Nhanh Tồn Kho Cối Ngày TỪ EXCEL (Kg)
                    </label>
                    <p className="text-[11px] text-slate-500 mb-1 leading-tight">Copy dòng chứa số kg từ báo cáo Excel và dán vào đây (13 cột theo thứ tự chuẩn). Hệ thống tự đổi qua Tấn và so sánh với tồn đầu để ra lượt nhập/xuất tự động.</p>
                    <div className="flex items-stretch gap-2">
                        <input
                            title="Paste copied excel row here"
                            className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-slate-400 font-mono"
                            placeholder="Ví dụ: 207,297.00   44,208.00   18,013.00   -   ..."
                            value={pasteData}
                            onChange={e => setPasteData(e.target.value)}
                        />
                        <button
                            onClick={handlePaste}
                            className="bg-primary hover:bg-emerald-600 text-white px-5 rounded-lg font-bold text-sm transition-colors shadow-sm whitespace-nowrap inline-flex items-center gap-1.5"
                        >
                            Dịch & Khớp Số
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: 'Tồn Đầu', value: totalOpening, color: 'text-slate-600', bg: 'bg-slate-50' },
                    { label: 'Tổng Nhập', value: totalReceived, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Tổng Xuất', value: totalDispatched, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { label: 'Tồn Cuối', value: totalClosing, color: 'text-blue-700 font-bold', bg: 'bg-blue-50' },
                ].map(item => (
                    <div key={item.label} className={`rounded-xl border p-2 text-center shadow-sm ${item.bg}`}>
                        <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide mb-1">{item.label}</div>
                        <div className={`text-base sm:text-lg font-bold ${item.color}`}>{item.value.toFixed(3)}</div>
                        <div className="text-[10px] text-muted-foreground">Tấn</div>
                    </div>
                ))}
            </div>

            <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-800 text-slate-300 border-b border-slate-700 text-[10px] tracking-wider uppercase">
                                <th className="text-left px-3 py-2.5 w-24 border-r border-slate-700 font-semibold">CỠ HẠT</th>
                                <th className="text-right px-3 py-2.5 w-20">T.Đầu (T)</th>
                                <th className="text-right px-3 py-2.5 w-20">Nhập (T)</th>
                                <th className="text-right px-3 py-2.5 w-20">Xuất (T)</th>
                                <th className="text-right px-3 py-2.5 w-24 text-white font-bold bg-slate-700/50">T.Cuối (T)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {RCN_SIZES.map(size => {
                                const row = rows[size]
                                const closing = row.closing_ton
                                const isNegative = closing < 0
                                return (
                                    <tr key={size} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-3 py-2 border-r border-slate-100 bg-slate-50/30">
                                            <span className="font-bold text-xs text-slate-700 whitespace-nowrap">{size}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-600">
                                            {row.opening_ton?.toFixed(3) || '0.000'}
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            <input
                                                title="Input Received"
                                                type="number" min="0" step="0.001"
                                                value={row.ton_received || ''}
                                                onChange={e => updateRow(size, 'ton_received', Number(e.target.value) || 0)}
                                                className="w-16 text-right bg-transparent border-b border-dashed border-emerald-300 text-emerald-700 px-1 py-1 text-xs focus:bg-emerald-50 outline-none"
                                            />
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            <input
                                                title="Input Dispatched"
                                                type="number" min="0" step="0.001"
                                                value={row.ton_dispatched || ''}
                                                onChange={e => updateRow(size, 'ton_dispatched', Number(e.target.value) || 0)}
                                                className="w-16 text-right bg-transparent border-b border-dashed border-orange-300 text-orange-700 px-1 py-1 text-xs focus:bg-orange-50 outline-none"
                                            />
                                        </td>
                                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${isNegative ? 'text-red-600 bg-red-50' : 'text-blue-700 bg-blue-50/30'}`}>
                                            {closing.toFixed(3)}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 text-slate-800 text-xs font-bold border-t-2 border-slate-200">
                                <td className="px-3 py-3 border-r border-slate-200">TỔNG</td>
                                <td className="px-3 py-3 text-right">{totalOpening.toFixed(3)}</td>
                                <td className="px-3 py-3 text-right text-emerald-700">{totalReceived.toFixed(3)}</td>
                                <td className="px-3 py-3 text-right text-orange-700">{totalDispatched.toFixed(3)}</td>
                                <td className="px-3 py-3 text-right text-blue-700 bg-blue-100/50">{totalClosing.toFixed(3)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 text-sm font-semibold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                        <><span className="animate-spin">⏳</span> Đang lưu...</>
                    ) : (
                        <><span>💾</span> CẬP NHẬT TỒN KHO RCN</>
                    )}
                </button>
            </div>
        </div>
    )
}
