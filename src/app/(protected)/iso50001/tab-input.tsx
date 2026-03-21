"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"
import { vi } from "date-fns/locale"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Zap, Flame, Plus, Trash2 } from "lucide-react"
import { SeuMaster, DailyEntry, fmtNum } from "./types"

interface Props {
    seus: SeuMaster[]
    currentMonth: Date
    onSaved: () => void
}

const EMPTY_ROW = { entry_date: '', actual_energy: '', rcn_hap_duoc_kg: '', notes: '' }

export function TabInput({ seus, currentMonth, onSaved }: Props) {
    const [form, setForm] = useState({ ...EMPTY_ROW })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    // Recent entries state
    const [recentEntries, setRecentEntries] = useState<DailyEntry[]>([])
    const [loadingRecent, setLoadingRecent] = useState(false)

    const elecSeu = seus.find(s => s.energy_type === 'electricity')
    const woodSeu = seus.find(s => s.energy_type === 'wood')

    const monthStr = format(currentMonth, 'yyyy-MM')

    const fetchRecent = async () => {
        setLoadingRecent(true)
        const res = await fetch(`/api/iso50001/daily-input?month=${monthStr}`)
        const json = await res.json()
        setRecentEntries(json.data || [])
        setLoadingRecent(false)
    }

    // Toggle show recent on mount effect replacement — called when tab renders
    useState(() => { fetchRecent() })

    const handleSave = async (seuId: number) => {
        if (!form.entry_date || !form.actual_energy || !form.rcn_hap_duoc_kg) {
            setError('Vui lòng điền đầy đủ ngày, năng lượng và RCN hấp được.')
            return
        }
        setSaving(true)
        setError(null)
        setSuccess(false)
        try {
            const res = await fetch('/api/iso50001/daily-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entry_date: form.entry_date,
                    seu_id: seuId,
                    actual_energy: Number(form.actual_energy),
                    rcn_hap_duoc_kg: Number(form.rcn_hap_duoc_kg),
                    notes: form.notes,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setSuccess(true)
            setForm({ ...EMPTY_ROW })
            fetchRecent()
            onSaved()
            setTimeout(() => setSuccess(false), 3000)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Xóa dòng này?')) return
        await fetch(`/api/iso50001/daily-input?id=${id}`, { method: 'DELETE' })
        fetchRecent()
        onSaved()
    }

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                Nhập dữ liệu năng lượng thực tế hàng ngày. Một dữ liệu cho mỗi SEU mỗi ngày.
            </p>

            {/* Input Form */}
            <Card className="shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Nhập dữ liệu mới</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Common Fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs">Ngày *</Label>
                            <Input
                                type="date"
                                value={form.entry_date}
                                onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))}
                                min={format(currentMonth, 'yyyy-MM') + '-01'}
                                max={format(currentMonth, 'yyyy-MM') + '-31'}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">Sản lượng Đầu vào/Đầu ra (kg) *</Label>
                            <Input
                                type="number"
                                placeholder="e.g. 25000"
                                value={form.rcn_hap_duoc_kg}
                                onChange={e => setForm(f => ({ ...f, rcn_hap_duoc_kg: e.target.value }))}
                                className="h-9 text-sm"
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <Label className="text-xs">Ghi chú (tuỳ chọn)</Label>
                        <Input
                            placeholder="Ghi chú..."
                            value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            className="h-9 text-sm"
                        />
                    </div>

                    {/* Error / Success */}
                    {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                    {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">✓ Đã lưu thành công!</p>}

                    {/* Save buttons: one per SEU */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {seus.map(s => {
                            const isElec = s.energy_type === 'electricity'
                            const bg = isElec ? 'bg-blue-50/30 border-blue-100' : 'bg-orange-50/30 border-orange-100'
                            const text = isElec ? 'text-blue-700' : 'text-orange-700'
                            const btnBg = isElec ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'
                            const Icon = isElec ? Zap : Flame

                            return (
                                <div key={s.seu_id} className={`border rounded-lg p-3 space-y-2 ${bg}`}>
                                    <p className={`text-xs font-semibold flex items-center gap-1.5 ${text}`}>
                                        <Icon className="h-3.5 w-3.5" /> {s.name}
                                    </p>
                                    <div>
                                        <Label className="text-xs">Tiêu thụ ({s.unit}) *</Label>
                                        <Input
                                            type="number" placeholder={`e.g. ${isElec ? '12500' : '8000'}`}
                                            value={form.actual_energy}
                                            onChange={e => setForm(f => ({ ...f, actual_energy: e.target.value }))}
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                    <Button size="sm" className={`w-full h-8 text-xs ${btnBg}`}
                                        onClick={() => handleSave(s.seu_id)} disabled={saving}>
                                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" />Lưu dữ liệu</>}
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Recent Entries */}
            <Card className="shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Dữ liệu đã nhập — {format(currentMonth, 'MM/yyyy')}</CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingRecent ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : recentEntries.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">Chưa có dữ liệu</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b text-muted-foreground">
                                        <th className="text-left py-1.5 pr-3">Ngày</th>
                                        <th className="text-left py-1.5 pr-3">SEU</th>
                                        <th className="text-right py-1.5 pr-3">Năng lượng</th>
                                        <th className="text-right py-1.5 pr-3">Sản lượng (kg)</th>
                                        <th className="text-left py-1.5 pr-3">Ghi chú</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentEntries.map(e => (
                                        <tr key={e.id} className="border-b hover:bg-muted/30">
                                            <td className="py-1.5 pr-3 font-mono">{format(parseISO(e.entry_date), 'dd/MM/yyyy')}</td>
                                            <td className="py-1.5 pr-3">{e.seu?.name}</td>
                                            <td className="py-1.5 pr-3 text-right font-mono">
                                                {fmtNum(e.actual_energy)} {e.seu?.unit}
                                            </td>
                                            <td className="py-1.5 pr-3 text-right font-mono">{fmtNum(e.rcn_hap_duoc_kg)}</td>
                                            <td className="py-1.5 pr-3 text-muted-foreground">{e.notes || '—'}</td>
                                            <td className="py-1.5">
                                                <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-600">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
