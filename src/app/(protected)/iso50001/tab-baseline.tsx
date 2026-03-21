"use client"

import { useState, useMemo, useEffect } from "react"
import { format, parseISO, parse, startOfMonth } from "date-fns"
import { vi } from "date-fns/locale"
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Line, ComposedChart, ReferenceLine
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertTriangle, CheckCircle2, Calculator, Zap, Flame, Trash2 } from "lucide-react"
import { SeuMaster, MonthlyHistorical, BaselineModel, calcLinearRegression, fmtNum } from "./types"

interface Props {
    seus: SeuMaster[]
    historical: MonthlyHistorical[]
    baselines: BaselineModel[]
    onRefresh: () => void
}

type XVar = 'rcn' | 'ck'

export function TabBaseline({ seus, historical, baselines, onRefresh }: Props) {
    const [activeSeu, setActiveSeu] = useState<number>(seus[0]?.seu_id ?? 0)
    const [editRow, setEditRow] = useState<{ month_year: string; rcn: string; energy: string; ck: string }>({ month_year: '', rcn: '', energy: '', ck: '' })
    const [saving, setSaving] = useState(false)
    const [computing, setComputing] = useState(false)
    const [baselineLabel, setBaselineLabel] = useState('Đường cơ sở 2024')
    const [xVar, setXVar] = useState<XVar>('rcn')

    // Period selection for regression
    const [periodFrom, setPeriodFrom] = useState('')
    const [periodTo, setPeriodTo] = useState('')
    const [regression, setRegression] = useState<{ slope: number; intercept: number; r_squared: number; n: number } | null>(null)

    const seu = seus.find(s => s.seu_id === activeSeu)
    const seuHistorical = historical.filter(h => h.seu_id === activeSeu).sort((a, b) => a.month_year.localeCompare(b.month_year))
    const seuBaselines = baselines.filter(b => b.seu_id === activeSeu).sort((a, b) => b.created_at.localeCompare(a.created_at))
    const activeBaseline = seuBaselines.find(b => b.is_active)

    // Compute regression from selected period — using chosen X variable
    const selectedPoints = useMemo(() => {
        if (!periodFrom || !periodTo) return seuHistorical
        return seuHistorical.filter(h => h.month_year >= periodFrom && h.month_year <= periodTo)
    }, [seuHistorical, periodFrom, periodTo])

    const getX = (h: MonthlyHistorical) =>
        xVar === 'ck' ? (h as any).ck_obtained_mt ?? 0 : h.rcn_hap_duoc_kg

    const xLabel = xVar === 'ck' ? 'CK (MT)' : 'Sản lượng (kg)'

    const scatterData = selectedPoints.map(h => ({
        x: getX(h),
        y: h.actual_energy,
        label: format(parseISO(h.month_year), 'MM/yyyy'),
    }))

    // Build regression line points for the chart overlay
    const regressionLineData = useMemo(() => {
        if (!regression || selectedPoints.length < 2) return []
        const xs = selectedPoints.map(p => getX(p))
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        return [
            { x: minX, y_line: regression.slope * minX + regression.intercept },
            { x: maxX, y_line: regression.slope * maxX + regression.intercept },
        ]
    }, [regression, selectedPoints, xVar])

    const handleComputeRegression = () => {
        if (selectedPoints.length < 2) return
        const points = selectedPoints.map(h => ({ x: getX(h), y: h.actual_energy }))
        const result = calcLinearRegression(points)
        setRegression(result)
    }

    const handleSaveHistorical = async () => {
        if (!editRow.month_year || !editRow.energy) return
        setSaving(true)
        await fetch('/api/iso50001/baseline', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'upsert_historical',
                seu_id: activeSeu,
                month_year: editRow.month_year + '-01',
                rcn_hap_duoc_kg: Number(editRow.rcn) || 0,
                actual_energy: Number(editRow.energy),
                ck_obtained_mt: Number(editRow.ck) || null,
            }),
        })
        setSaving(false)
        setEditRow({ month_year: '', rcn: '', energy: '', ck: '' })
        onRefresh()
    }

    const handleSaveBaseline = async () => {
        if (!regression || !baselineLabel) return
        setComputing(true)
        const from = periodFrom || seuHistorical[0]?.month_year || ''
        const to = periodTo || seuHistorical[seuHistorical.length - 1]?.month_year || ''
        await fetch('/api/iso50001/baseline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                seu_id: activeSeu,
                label: baselineLabel.trim() + (xVar === 'ck' ? ' [CK]' : ' [RCN]'),
                period_from: from ? from.slice(0, 7) + '-01' : from,
                period_to: to ? to.slice(0, 7) + '-01' : to,
                slope: regression.slope,
                intercept: regression.intercept,
                r_squared: regression.r_squared,
                n_points: regression.n,
            }),
        })
        setComputing(false)
        setRegression(null)
        onRefresh()
    }

    const handleActivate = async (baselineId: number) => {
        await fetch('/api/iso50001/baseline', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'activate', seu_id: activeSeu, baseline_id: baselineId }),
        })
        onRefresh()
    }

    const handleDeleteHistorical = async (id: number) => {
        if (!confirm('Xóa bản ghi này?')) return
        await fetch(`/api/iso50001/baseline?table=historical&id=${id}`, { method: 'DELETE' })
        onRefresh()
    }

    const r2Color = regression ? (regression.r_squared >= 0.85 ? 'text-emerald-600' : 'text-amber-600') : ''
    const r2Pct = regression ? (regression.r_squared * 100).toFixed(1) : null

    return (
        <div className="space-y-4">
            {/* SEU selector */}
            <div className="flex gap-2">
                {seus.map(s => (
                    <Button
                        key={s.seu_id}
                        variant={activeSeu === s.seu_id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setActiveSeu(s.seu_id); setRegression(null) }}
                        className="text-xs"
                    >
                        {s.energy_type === 'electricity' ? <Zap className="h-3.5 w-3.5 mr-1.5" /> : <Flame className="h-3.5 w-3.5 mr-1.5" />}
                        {s.name}
                    </Button>
                ))}
            </div>

            {/* Active Baseline Banner */}
            {activeBaseline && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                                <CheckCircle2 className="h-4 w-4" /> Đường cơ sở đang kích hoạt
                            </p>
                            <p className="text-lg font-black text-emerald-900 mt-0.5">{activeBaseline.label}</p>
                            <p className="text-sm font-mono text-emerald-800 mt-1">
                                y = {Number(activeBaseline.slope).toFixed(4)}x + {Number(activeBaseline.intercept).toFixed(2)}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-emerald-700">
                                <span>R² = <strong className={activeBaseline.r_squared >= 0.85 ? 'text-emerald-600' : 'text-amber-600'}>
                                    {(activeBaseline.r_squared * 100).toFixed(1)}%
                                </strong> độ tin cậy</span>
                                <span>|</span>
                                <span>n = {activeBaseline.n_points} tháng</span>
                                <span>|</span>
                                <span>{format(parseISO(activeBaseline.period_from), 'MM/yyyy')} → {format(parseISO(activeBaseline.period_to), 'MM/yyyy')}</span>
                            </div>
                        </div>
                        {activeBaseline.r_squared < 0.85 && (
                            <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-xs shrink-0">
                                <AlertTriangle className="h-3.5 w-3.5 mr-1" />R² thấp
                            </Badge>
                        )}
                    </div>
                </div>
            )}

            {/* Step 1: Historical Data Input */}
            <Card className="shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Bước 1 — Dữ liệu lịch sử tháng</CardTitle>
                    <CardDescription className="text-xs">Nhập Sản lượng + Năng lượng thực tế theo từng tháng</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {/* Add row form */}
                    <div className="grid grid-cols-4 gap-2">
                        <div>
                            <Label className="text-xs">Tháng (YYYY-MM)</Label>
                            <Input type="month" value={editRow.month_year}
                                onChange={e => setEditRow(r => ({ ...r, month_year: e.target.value }))}
                                className="h-8 text-xs" />
                        </div>
                        <div>
                            <Label className="text-xs">Sản lượng RCN/Peeling (kg)</Label>
                            <Input type="number" placeholder="25000" value={editRow.rcn}
                                onChange={e => setEditRow(r => ({ ...r, rcn: e.target.value }))}
                                className="h-8 text-xs" />
                        </div>
                        <div>
                            <Label className="text-xs">CK (MT)</Label>
                            <Input type="number" placeholder="400" value={editRow.ck}
                                onChange={e => setEditRow(r => ({ ...r, ck: e.target.value }))}
                                className="h-8 text-xs" />
                        </div>
                        <div>
                            <Label className="text-xs">{seu?.unit === 'kWh' ? 'Điện (kWh)' : 'Củi (kg)'}</Label>
                            <Input type="number" placeholder="12000" value={editRow.energy}
                                onChange={e => setEditRow(r => ({ ...r, energy: e.target.value }))}
                                className="h-8 text-xs" />
                        </div>
                    </div>
                    <Button size="sm" onClick={handleSaveHistorical} disabled={saving} className="h-8 text-xs">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '+ Thêm / Cập nhật'}
                    </Button>

                    {/* Historical table */}
                    {seuHistorical.length > 0 && (
                        <div className="overflow-x-auto mt-2">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b text-muted-foreground">
                                        <th className="text-left py-1.5 pr-3">Tháng</th>
                                        <th className="text-right py-1.5 pr-3">Sản lượng (kg)</th>
                                        <th className="text-right py-1.5 pr-3">CK (MT)</th>
                                        <th className="text-right py-1.5 pr-3">{seu?.unit === 'kWh' ? 'Điện (kWh)' : 'Củi (kg)'}</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {seuHistorical.map(h => (
                                        <tr key={h.id} className={`border-b hover:bg-muted/30 ${
                                            (periodFrom && h.month_year < periodFrom) || (periodTo && h.month_year > periodTo)
                                                ? 'opacity-40' : ''
                                        }`}>
                                            <td className="py-1.5 pr-3 font-mono">{format(parseISO(h.month_year), 'MM/yyyy')}</td>
                                            <td className="py-1.5 pr-3 text-right font-mono">{fmtNum(h.rcn_hap_duoc_kg, 0)}</td>
                                            <td className="py-1.5 pr-3 text-right font-mono">{fmtNum((h as any).ck_obtained_mt, 0)}</td>
                                            <td className="py-1.5 pr-3 text-right font-mono">{fmtNum(h.actual_energy, 0)}</td>
                                            <td className="py-1.5">
                                                <button onClick={() => handleDeleteHistorical(h.id)} className="text-red-400 hover:text-red-600">
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

            {/* Step 2 + 3: Period Selection + Regression */}
            {seuHistorical.length >= 2 && (
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Bước 2 &amp; 3 — Chọn kỳ &amp; Tính hồi quy</CardTitle>
                        <CardDescription className="text-xs">
                            Chọn từ tháng → đến tháng để giới hạn dữ liệu, sau đó bấm "Tính đường cơ sở"
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs">Từ tháng</Label>
                                <Input type="month" value={periodFrom.slice(0, 7)}
                                    onChange={e => setPeriodFrom(e.target.value + '-01')}
                                    className="h-8 text-xs" />
                            </div>
                            <div>
                                <Label className="text-xs">Đến tháng</Label>
                                <Input type="month" value={periodTo.slice(0, 7)}
                                    onChange={e => setPeriodTo(e.target.value + '-01')}
                                    className="h-8 text-xs" />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Đã chọn <strong>{selectedPoints.length}</strong> tháng dữ liệu
                        </p>

                        {/* X variable selector */}
                        <div>
                            <Label className="text-xs">Biến X (trục hoành) — chọn để tính hồi quy</Label>
                            <div className="flex items-center gap-2 mt-1.5">
                                <button
                                    onClick={() => { setXVar('rcn'); setRegression(null) }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                                        xVar === 'rcn' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                    }`}>
                                    Sản lượng RCN / Peeling (kg)
                                </button>
                                <button
                                    onClick={() => { setXVar('ck'); setRegression(null) }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                                        xVar === 'ck' ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                                    }`}>
                                    CK Obtained (MT)
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">X hiện tại: <strong>{xLabel}</strong></p>
                        </div>

                        <Button onClick={handleComputeRegression} disabled={selectedPoints.length < 2} className="h-9 gap-2">
                            <Calculator className="h-4 w-4" />
                            Tính đường cơ sở
                        </Button>

                        {/* Regression Result */}
                        {regression && (
                            <div className="space-y-3 mt-2">
                                <div className="rounded-xl border bg-slate-50 p-4">
                                    <p className="text-xs text-muted-foreground mb-1">Kết quả hồi quy tuyến tính — X = {xLabel}</p>
                                    <p className="text-xl font-black font-mono text-foreground">
                                        y = {regression.slope.toFixed(4)}x + {regression.intercept.toFixed(2)}
                                    </p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className={`text-base font-bold ${r2Color}`}>
                                            R² = {r2Pct}% độ tin cậy
                                        </span>
                                        {regression.r_squared < 0.85 && (
                                            <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-xs">
                                                <AlertTriangle className="h-3 w-3 mr-1" />Thấp (&lt;85%)
                                            </Badge>
                                        )}
                                        {regression.r_squared >= 0.85 && (
                                            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50 text-xs">
                                                <CheckCircle2 className="h-3 w-3 mr-1" />Tốt
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">n = {regression.n} điểm dữ liệu</p>
                                </div>

                                {/* Scatter + regression line chart */}
                                <div className="h-[240px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                            <XAxis dataKey="x" type="number" name={xLabel} domain={['auto', 'auto']}
                                                tick={{ fontSize: 10 }} tickFormatter={v => v.toLocaleString('en-US')}
                                                label={{ value: xLabel, position: 'insideBottom', offset: -8, fontSize: 10 }} />
                                            <YAxis dataKey="y" type="number" name={seu?.unit}
                                                tick={{ fontSize: 10 }} tickFormatter={v => v.toLocaleString('en-US')} width={60}
                                                label={{ value: seu?.unit, angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                            <Tooltip
                                                content={({ active, payload }: any) => {
                                                    if (!active || !payload?.length) return null
                                                    const d = payload[0]?.payload
                                                    return (
                                                        <div className="bg-white border rounded-lg shadow p-2 text-xs">
                                                            {d?.label && <p className="font-semibold">{d.label}</p>}
                                                            <p>X: {Number(d?.x || 0).toLocaleString('vi-VN')} {xLabel === 'CK (MT)' ? 'MT CK' : 'kg Sản lượng'}</p>
                                                            <p>Y: {Number(d?.y || 0).toLocaleString('vi-VN')} {seu?.unit}</p>
                                                        </div>
                                                    )
                                                }}
                                            />
                                            <Scatter data={scatterData} fill="#6366F1" opacity={0.8} name="Dữ liệu thực" />
                                            <Line data={regressionLineData} dataKey="y_line" stroke="#EF4444" strokeWidth={2}
                                                dot={false} name="Đường cơ sở" type="linear" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Step 4: Save */}
                                <div className="space-y-2">
                                    <Label className="text-xs">Tên đường cơ sở</Label>
                                    <Input value={baselineLabel} onChange={e => setBaselineLabel(e.target.value)}
                                        placeholder="Đường cơ sở 2024" className="h-9 text-sm" />
                                    <Button onClick={handleSaveBaseline} disabled={computing || !baselineLabel}
                                        className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                                        {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        Lưu &amp; Kích hoạt — X = {xLabel}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* All saved baselines for this SEU */}
            {seuBaselines.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Các đường cơ sở đã lưu</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {seuBaselines.map(b => (
                                <div key={b.id} className={`rounded-lg border p-3 text-xs flex items-center justify-between gap-3 ${b.is_active ? 'border-emerald-300 bg-emerald-50/60' : 'bg-muted/20'}`}>
                                    <div>
                                        <p className="font-semibold">{b.label} {b.is_active && <Badge className="ml-1 text-[10px] bg-emerald-600">Đang dùng</Badge>}</p>
                                        <p className="font-mono mt-0.5">y = {Number(b.slope).toFixed(4)}x + {Number(b.intercept).toFixed(2)}</p>
                                        <p className={`mt-0.5 ${b.r_squared >= 0.85 ? 'text-emerald-700' : 'text-amber-600'}`}>
                                            R² = {(b.r_squared * 100).toFixed(1)}% | n={b.n_points} | {format(parseISO(b.period_from), 'MM/yyyy')}–{format(parseISO(b.period_to), 'MM/yyyy')}
                                        </p>
                                    </div>
                                    {!b.is_active && (
                                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                                            onClick={() => handleActivate(b.id)}>
                                            Kích hoạt
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
