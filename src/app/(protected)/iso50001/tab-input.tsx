"use client"

import { useState, useEffect, useCallback } from "react"
import {
    format, parseISO, getDaysInMonth, startOfMonth,
    addDays, isToday, isFuture
} from "date-fns"
import { vi as viLocale } from "date-fns/locale"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Zap, Flame, CheckCircle2, XCircle, Pencil, Trash2, X, Save } from "lucide-react"
import { SeuMaster, DailyEntry, fmtNum } from "./types"

interface Props {
    seus: SeuMaster[]
    currentMonth: Date
    onSaved: () => void
}

interface CellData {
    id: number
    actual_energy: number
    rcn_hap_duoc_kg: number
    notes?: string
}

// Map: "yyyy-MM-dd" -> { [seu_id]: CellData }
type GridData = Record<string, Record<number, CellData>>

interface EditState {
    date: string
    seuId: number
    energy: string
    rcn: string
    notes: string
    existingId?: number
}

export function TabInput({ seus, currentMonth, onSaved }: Props) {
    const [gridData, setGridData] = useState<GridData>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [edit, setEdit] = useState<EditState | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [successCell, setSuccessCell] = useState<string | null>(null) // "date|seuId"

    const monthStr = format(currentMonth, 'yyyy-MM')
    const daysInMonth = getDaysInMonth(currentMonth)

    // Build list of days for this month
    const days = Array.from({ length: daysInMonth }, (_, i) => {
        const d = addDays(startOfMonth(currentMonth), i)
        return format(d, 'yyyy-MM-dd')
    })

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/iso50001/daily-input?month=${monthStr}`)
            const json = await res.json()
            const entries: DailyEntry[] = json.data || []
            const grid: GridData = {}
            for (const e of entries) {
                const dk = e.entry_date.slice(0, 10)
                if (!grid[dk]) grid[dk] = {}
                grid[dk][e.seu_id] = {
                    id: e.id,
                    actual_energy: e.actual_energy,
                    rcn_hap_duoc_kg: e.rcn_hap_duoc_kg,
                    notes: e.notes,
                }
            }
            setGridData(grid)
        } finally {
            setLoading(false)
        }
    }, [monthStr])

    useEffect(() => { fetchData() }, [fetchData])

    const openEdit = (date: string, seu: SeuMaster) => {
        const existing = gridData[date]?.[seu.seu_id]
        setEdit({
            date,
            seuId: seu.seu_id,
            energy: existing ? String(existing.actual_energy) : '',
            rcn: existing ? String(existing.rcn_hap_duoc_kg) : '',
            notes: existing?.notes || '',
            existingId: existing?.id,
        })
        setError(null)
    }

    const handleSave = async () => {
        if (!edit) return
        if (!edit.energy || !edit.rcn) {
            setError('Vui lòng nhập đầy đủ Tiêu thụ và Sản lượng')
            return
        }
        setSaving(true)
        setError(null)
        try {
            const res = await fetch('/api/iso50001/daily-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entry_date: edit.date,
                    seu_id: edit.seuId,
                    actual_energy: Number(edit.energy),
                    rcn_hap_duoc_kg: Number(edit.rcn),
                    notes: edit.notes,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const cellKey = `${edit.date}|${edit.seuId}`
            setSuccessCell(cellKey)
            setTimeout(() => setSuccessCell(null), 2000)
            setEdit(null)
            await fetchData()
            onSaved()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (date: string, seuId: number) => {
        const cell = gridData[date]?.[seuId]
        if (!cell) return
        if (!confirm(`Xóa dữ liệu ngày ${date} cho SEU này?`)) return
        await fetch(`/api/iso50001/daily-input?id=${cell.id}`, { method: 'DELETE' })
        await fetchData()
        onSaved()
    }

    // Stats
    const totalCells = days.filter(d => !isFuture(parseISO(d))).length * seus.length
    const filledCells = Object.values(gridData).reduce((a, v) => a + Object.keys(v).length, 0)
    const missingCells = totalCells - filledCells

    const seuColor = (eu: SeuMaster) =>
        eu.energy_type === 'electricity'
            ? { header: 'bg-blue-600', light: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: <Zap className="h-3 w-3 inline mr-0.5" /> }
            : { header: 'bg-orange-600', light: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: <Flame className="h-3 w-3 inline mr-0.5" /> }

    return (
        <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {filledCells} ô đã có data
                </span>
                <span className="flex items-center gap-1.5 text-red-500 font-medium">
                    <XCircle className="h-3.5 w-3.5" />
                    {missingCells} ô còn thiếu
                </span>
                <span className="text-muted-foreground ml-auto">
                    Click ô để nhập / sửa — ô 🟢 đã có, ô 🔴 còn trống
                </span>
            </div>

            <Card className="shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                        <span>Bảng dữ liệu tháng {format(currentMonth, 'MM/yyyy')}</span>
                        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr>
                                    {/* Day column */}
                                    <th className="text-left px-3 py-2 bg-slate-100 border border-slate-200 font-semibold text-slate-600 sticky left-0 z-10 min-w-[80px]">
                                        Ngày
                                    </th>
                                    {seus.map(s => {
                                        const c = seuColor(s)
                                        return (
                                            <th key={s.seu_id} colSpan={2}
                                                className={`text-center px-2 py-2 border border-slate-200 font-semibold text-white ${c.header}`}>
                                                {c.icon}{s.name}
                                            </th>
                                        )
                                    })}
                                </tr>
                                <tr>
                                    <th className="px-3 py-1 bg-slate-50 border border-slate-200 sticky left-0 z-10 text-slate-500"></th>
                                    {seus.map(s => {
                                        const c = seuColor(s)
                                        return (
                                            <>
                                                <th key={`${s.seu_id}-e`}
                                                    className={`text-center px-2 py-1 border border-slate-200 font-medium ${c.text} bg-white`}>
                                                    Tiêu thụ ({s.unit})
                                                </th>
                                                <th key={`${s.seu_id}-r`}
                                                    className="text-center px-2 py-1 border border-slate-200 font-medium text-slate-500 bg-white">
                                                    SL (kg)
                                                </th>
                                            </>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {days.map((dateStr, idx) => {
                                    const dayNum = idx + 1
                                    const dowLabel = format(parseISO(dateStr), 'EEE', { locale: viLocale })
                                    const isWeekend = [0, 6].includes(parseISO(dateStr).getDay())
                                    const isTodayRow = isToday(parseISO(dateStr))
                                    const future = isFuture(parseISO(dateStr))
                                    const rowBg = isTodayRow
                                        ? 'bg-yellow-50'
                                        : isWeekend
                                            ? 'bg-slate-50/70'
                                            : 'bg-white'

                                    return (
                                        <tr key={dateStr}
                                            className={`${rowBg} hover:brightness-95 transition-all`}>
                                            {/* Day label */}
                                            <td className={`px-3 py-1.5 border border-slate-200 sticky left-0 z-10 font-mono ${rowBg} ${isTodayRow ? 'font-bold text-yellow-700' : 'text-slate-600'}`}>
                                                <span className="font-semibold">{String(dayNum).padStart(2, '0')}</span>
                                                <span className={`ml-1 text-[10px] ${isWeekend ? 'text-red-400' : 'text-slate-400'}`}>{dowLabel}</span>
                                            </td>

                                            {seus.map(s => {
                                                const cell = gridData[dateStr]?.[s.seu_id]
                                                const hasData = !!cell
                                                const cellKey = `${dateStr}|${s.seu_id}`
                                                const justSaved = successCell === cellKey
                                                const c = seuColor(s)

                                                if (future) {
                                                    return (
                                                        <>
                                                            <td key={`${cellKey}-e`} className="border border-slate-100 text-center text-slate-300 py-1.5 px-2">—</td>
                                                            <td key={`${cellKey}-r`} className="border border-slate-100 text-center text-slate-300 py-1.5 px-2">—</td>
                                                        </>
                                                    )
                                                }

                                                return (
                                                    <>
                                                        <td key={`${cellKey}-e`}
                                                            onClick={() => openEdit(dateStr, s)}
                                                            className={`border py-1.5 px-2 text-right cursor-pointer transition-all group relative
                                                                ${justSaved ? 'bg-emerald-100 border-emerald-300' : ''}
                                                                ${hasData && !justSaved ? `${c.light} border-slate-200` : ''}
                                                                ${!hasData && !justSaved ? 'border-red-100 bg-red-50/40 hover:bg-red-50' : 'hover:opacity-80'}
                                                            `}>
                                                            {hasData ? (
                                                                <span className={`font-mono font-medium ${c.text}`}>
                                                                    {fmtNum(cell.actual_energy, 0)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-red-300 group-hover:text-red-500 text-[10px] flex items-center justify-end gap-0.5">
                                                                    <Pencil className="h-2.5 w-2.5" /> nhập
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td key={`${cellKey}-r`}
                                                            onClick={() => openEdit(dateStr, s)}
                                                            className={`border py-1.5 px-2 text-right cursor-pointer transition-all group
                                                                ${justSaved ? 'bg-emerald-100 border-emerald-300' : ''}
                                                                ${hasData && !justSaved ? 'bg-white border-slate-200' : ''}
                                                                ${!hasData && !justSaved ? 'border-red-100 bg-red-50/40 hover:bg-red-50' : 'hover:opacity-80'}
                                                            `}>
                                                            {hasData ? (
                                                                <span className="font-mono text-slate-600">
                                                                    {fmtNum(cell.rcn_hap_duoc_kg, 0)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-red-200 text-[10px]">—</span>
                                                            )}
                                                        </td>
                                                    </>
                                                )
                                            })}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Floating Edit Modal */}
            {edit && (() => {
                const seu = seus.find(s => s.seu_id === edit.seuId)!
                const c = seuColor(seu)
                const dayLabel = format(parseISO(edit.date), 'dd/MM/yyyy (EEEE)', { locale: viLocale })
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
                        onClick={e => { if (e.target === e.currentTarget) setEdit(null) }}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
                            {/* Modal Header */}
                            <div className={`${c.header} px-5 py-3 flex items-center justify-between`}>
                                <div>
                                    <p className="text-white font-semibold text-sm flex items-center gap-1.5">
                                        {c.icon}{seu.name}
                                    </p>
                                    <p className="text-white/80 text-xs mt-0.5">{format(parseISO(edit.date), 'dd/MM/yyyy (EEEE)', { locale: viLocale })}</p>
                                </div>
                                <button onClick={() => setEdit(null)}
                                    className="text-white/70 hover:text-white transition-colors">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-5 space-y-3">
                                {error && (
                                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                                        {error}
                                    </p>
                                )}
                                <div>
                                    <Label className="text-xs font-medium">Tiêu thụ ({seu.unit}) *</Label>
                                    <Input
                                        autoFocus
                                        type="number"
                                        placeholder={seu.energy_type === 'electricity' ? 'e.g. 12500' : 'e.g. 8000'}
                                        value={edit.energy}
                                        onChange={e => setEdit(prev => prev ? { ...prev, energy: e.target.value } : null)}
                                        className="h-10 mt-1 font-mono text-sm"
                                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs font-medium">Sản lượng (kg) *</Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 25000"
                                        value={edit.rcn}
                                        onChange={e => setEdit(prev => prev ? { ...prev, rcn: e.target.value } : null)}
                                        className="h-10 mt-1 font-mono text-sm"
                                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs font-medium text-muted-foreground">Ghi chú</Label>
                                    <Input
                                        placeholder="Ghi chú (tuỳ chọn)..."
                                        value={edit.notes}
                                        onChange={e => setEdit(prev => prev ? { ...prev, notes: e.target.value } : null)}
                                        className="h-9 mt-1 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="px-5 pb-5 flex gap-2">
                                {edit.existingId && (
                                    <Button variant="outline" size="sm"
                                        className="text-red-600 border-red-200 hover:bg-red-50 h-9"
                                        onClick={() => { handleDelete(edit.date, edit.seuId); setEdit(null) }}>
                                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa
                                    </Button>
                                )}
                                <Button size="sm" className={`flex-1 h-9 text-white ${c.header} hover:opacity-90`}
                                    onClick={handleSave} disabled={saving}>
                                    {saving
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <><Save className="h-3.5 w-3.5 mr-1.5" />Lưu dữ liệu</>
                                    }
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}
