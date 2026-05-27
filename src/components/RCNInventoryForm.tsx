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
    closing_ton: number
    note: string
}

const emptyRow = (): RcnRow => ({ opening_ton: 0, closing_ton: 0, note: '' })

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

            // Lấy Closing chốt số từ ngày hôm qua để làm Opening
            const { data: prevData } = await supabase
                .from('rcn_inventory')
                .select('size_code, opening_ton, ton_received, ton_dispatched')
                .eq('work_date', yStr)

            const prevClosing: Record<string, number> = {}
            prevData?.forEach((r: any) => {
                const closing = Number(r.opening_ton) + Number(r.ton_received) - Number(r.ton_dispatched);
                prevClosing[r.size_code] = closing;
            })

            // Lấy Tồn của Ngày Hiện Tại (đã nhập)
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
                            closing_ton: opening + received - dispatched,
                            note: r.note || ''
                        }
                    }
                })
            } else {
                RCN_SIZES.forEach(s => {
                    newRows[s].opening_ton = prevClosing[s] || 0
                    newRows[s].closing_ton = prevClosing[s] || 0 // Mặc định nếu chưa nhập thì Tồn kho hôm nay = hôm qua
                })
            }

            setRows(newRows)
            setLoading(false)
        }
        load()
    }, [formattedDate])

    const handlePaste = () => {
        if (!pasteData.trim()) return;

        // Tách dòng, lọc rỗng
        const lines = pasteData.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Tìm dòng nào có nhiều dấu tab nhất (chính là dòng chứa data 13 cột)
        const dataRow = lines.sort((a, b) => b.split('\t').length - a.split('\t').length)[0];

        if (dataRow) {
            const parts = dataRow.split('\t').map(s => {
                const clean = s.replace(/,/g, '').trim();
                if (clean === '-' || clean === '') return 0;
                return parseFloat(clean) || 0;
            });

            // Nếu người ta copy dính luôn cả cột rỗng thì độ dài sẽ >= 13
            if (parts.length >= 12) {
                const updates: Record<string, number> = {};

                // Bản đồ Map giữa Index Cột của Excel ra Type của React
                // Chú ý: Cột 0 thường là Total Stock. Các cột Size từ 1 đến 12.
                // Để cực kỳ vững chắc, nếu họ vô tình KHÔNG QUÉT CỘT 0 (chỉ quét đủ 12 cột số)
                // Thì parts.length == 12. Nếu quét cột Total thì parts.length >= 13.
                // Ta lấy ngược từ cuối!

                const exactMap = [
                    'A+ (26~28)', 'A1 (25~26)', 'A2 (24~25)',
                    'B1 (23~24)', 'B2 (22~23)', 'C1 (21~22)',
                    'C2 (20~21)', 'D1 (19~20)', 'D2 (18~19)',
                    'E (17~18)', 'A++ (28>)', 'E (16)'
                ];

                let valIndexOffset = parts.length > 12 ? 1 : 0; // Nếu có Total, size bắt đầu từ 1. Nếu k có Total, size bắt đầu từ 0.

                exactMap.forEach((sizeName, iterIdx) => {
                    const actualIdx = iterIdx + valIndexOffset;
                    const closingKg = parts[actualIdx] || 0;
                    const closingTon = Number((closingKg / 1000).toFixed(3)); // đổi ra Tấn !
                    updates[sizeName] = closingTon;
                });

                // Cập nhật State
                setRows(prev => {
                    const next = { ...prev };
                    Object.keys(updates).forEach(size => {
                        const s = size as RcnSize;
                        if (next[s]) {
                            next[s].closing_ton = updates[size] || 0;
                            next[s].note = "Từ Excel";
                        }
                    });
                    return next;
                });
                toast.success("✅ Đã khớp 12 kích cỡ thành công!");
                setPasteData("");
            } else {
                toast.error(`Excel thiếu cột số liệu! (Tìm thấy ${parts.length} cột, cần tối thiểu 12 cột)`);
            }
        } else {
            toast.error("Không tìm thấy hàng dữ liệu nào có định dạng Copy từ Excel!");
        }
    }

    const updateRow = (size: RcnSize, field: keyof RcnRow, value: number | string) => {
        setRows(prev => ({
            ...prev,
            [size]: { ...prev[size], [field]: value }
        }))
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const payload = RCN_SIZES.map(size => {
                const opening = rows[size].opening_ton;
                const closing = rows[size].closing_ton;
                let received = 0;
                let dispatched = 0;

                // Toán học: Closing = Opening + Received - Dispatched
                // Mọi chênh lệch âm/dương sẽ được coi là Received / Dispatched
                if (closing >= opening) {
                    received = Number((closing - opening).toFixed(3));
                } else {
                    dispatched = Number((opening - closing).toFixed(3));
                }

                return {
                    work_date: formattedDate,
                    size_code: size,
                    opening_ton: opening,
                    ton_received: received,
                    ton_dispatched: dispatched,
                    note: rows[size].note || null,
                    updated_by: userId,
                    updated_at: new Date().toISOString()
                }
            })

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

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="absolute -top-10 -right-10 opacity-[0.03] pointer-events-none transform rotate-12">
                    <ClipboardList className="w-56 h-56" />
                </div>

                <div className="flex flex-col gap-3 relative z-10">
                    <label className="text-base font-black text-slate-800 flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-primary" />
                        CẬP NHẬT TỒN KHO TỪ EXCEL (TỰ ĐỘNG)
                    </label>

                    <div className="bg-white border border-amber-200/60 bg-amber-50/40 rounded-lg p-3.5 text-sm text-slate-700 shadow-sm">
                        <div className="font-bold text-amber-800 mb-2.5 flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200/80 text-amber-800 text-[10px]">💡</span>
                            Hướng dẫn nhập nhanh:
                        </div>
                        <ol className="list-decimal list-inside space-y-2 text-xs md:text-sm text-slate-600 font-medium">
                            <li>Mở file báo cáo tồn kho RCN hàng ngày trên phần mềm Excel.</li>
                            <li>Bôi đen và Copy (<kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 font-sans text-xs">Ctrl + C</kbd>) <b>DUY NHẤT 1 DÒNG CHỨA SỐ KHỐI LƯỢNG KÝ (Kg)</b> (gồm 13 cột từ <i>Total Stock</i> đến <i>E 16</i>).</li>
                            <li>Dán (<kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-200 font-sans text-xs">Ctrl + V</kbd>) vào ô trống bên dưới và bấm <strong className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">Dịch & Khớp Số</strong>.</li>
                        </ol>
                        <div className="mt-3 text-[11px] text-slate-500 italic bg-white px-2.5 py-2 rounded-md border border-slate-100 border-l-[3px] border-l-amber-400">
                            Hệ thống sẽ tự động lược bỏ các ký tự trống, đổi đơn vị từ <b>Kg ➔ Tấn</b>, và thay thế vào cột <b>Tồn Cuối</b> để bạn tiết kiệm thời gian gõ từng số.
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch gap-2.5 mt-1">
                        <input
                            title="Dán dòng số liệu Excel vào đây"
                            className="flex-1 bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-slate-400 font-mono shadow-inner"
                            placeholder="Dán dữ liệu (ví dụ: 207,297.00   44,208.00   18,013.00   -  ...)"
                            value={pasteData}
                            onChange={e => setPasteData(e.target.value)}
                        />
                        <button
                            onClick={handlePaste}
                            disabled={!pasteData.trim()}
                            className="bg-primary hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all shadow-md whitespace-nowrap inline-flex items-center justify-center gap-1.5"
                        >
                            Dịch & Khớp Số
                        </button>
                    </div>
                </div>
            </div>

            {/* BẢNG TỒN KHO - TINH GIẢN CHỈ CÒN ĐÚNG CỘT TỒN KHO */}
            <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-800 text-slate-300 border-b border-slate-700 text-[10px] tracking-wider uppercase">
                                <th className="text-left px-4 py-3 w-32 border-r border-slate-700 font-semibold">CỠ HẠT</th>
                                <th className="text-right px-4 py-3 w-32 text-slate-400">Tồn Hôm Qua (Tấn)</th>
                                <th className="text-right px-4 py-3 min-w-[140px] text-white font-bold bg-slate-700/50 border-l border-slate-600">📌 TỒN CUỐI (TẤN)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {RCN_SIZES.map(size => {
                                const row = rows[size]
                                return (
                                    <tr key={size} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-2.5 border-r border-slate-100 bg-slate-50/30">
                                            <span className="font-bold text-sm text-slate-700 whitespace-nowrap">{size}</span>
                                        </td>

                                        {/* Read only Opening */}
                                        <td className="px-4 py-2.5 text-right text-slate-400 font-mono text-xs">
                                            {row.opening_ton?.toFixed(3) || '0.000'}
                                        </td>

                                        {/* EDITABLE CLOSING */}
                                        <td className="px-3 py-2 text-right bg-blue-50/30 border-l border-blue-50">
                                            <input
                                                title="Tồn Kho Thực Tế (Tấn)"
                                                type="number" min="0" step="0.001"
                                                inputMode="decimal"
                                                value={row.closing_ton}
                                                onChange={e => updateRow(size, 'closing_ton', Number(e.target.value) || 0)}
                                                className="w-full text-right bg-white border border-blue-200 text-blue-700 font-bold rounded-md px-2 py-1.5 text-base focus:ring-2 focus:ring-blue-400 outline-none shadow-sm transition-all"
                                            />
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 text-sm font-semibold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                        <><span className="animate-spin">⏳</span> Đang lưu...</>
                    ) : (
                        <><span>💾</span> CHỐT SỔ RCN WAREHOUSE</>
                    )}
                </button>
            </div>
        </div>
    )
}
