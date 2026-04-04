"use client"

import { useState, useMemo, useRef } from "react"
import { format, parseISO } from "date-fns"
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Line, ComposedChart
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertTriangle, CheckCircle2, Calculator, Zap, Flame, Trash2, Save, RefreshCw } from "lucide-react"
import { SeuMaster, MonthlyHistorical, BaselineModel, calcLinearRegression, fmtNum } from "./types"

interface Props {
    seus: SeuMaster[]
    historical: MonthlyHistorical[]
    baselines: BaselineModel[]
    onRefresh: () => void
}

type XVar = 'rcn' | 'ck'

// ─── Các SEU cố định (id đã biết) ────────────────────────────────
const SEU_EVN = 1       // Điện toàn nhà máy — rcn = RCN hấp
const SEU_BOILER = 2    // Củi — rcn = RCN hấp
const SEU_MNK = 3       // Máy nén khí / Peeling — rcn = SL Peeling
const SEU_SHELLING = 4  // Shelling — rcn = SL Shelling
const SEU_WATER = 5     // Nước — rcn = RCN hấp (hoặc CK)

// ─── Inline editable cell ────────────────────────────────────────
function EditCell({
    value, onSave, placeholder = ''
}: {
    value: number | null | undefined
    onSave: (val: string) => void
    placeholder?: string
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const ref = useRef<HTMLInputElement>(null)

    const start = () => {
        setDraft(value != null ? String(value) : '')
        setEditing(true)
        setTimeout(() => ref.current?.select(), 0)
    }
    const commit = () => { setEditing(false); onSave(draft) }

    if (editing) return (
        <input ref={ref} type="number" value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
            className="w-full h-7 px-1 text-xs text-right border border-blue-400 rounded bg-blue-50 focus:outline-none font-mono"
            autoFocus
        />
    )

    return (
        <div onClick={start}
            title="Click để sửa"
            className="text-right font-mono text-xs px-1 py-1 rounded cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors min-h-[28px] flex items-center justify-end"
        >
            {value != null && value !== 0
                ? value.toLocaleString('vi-VN')
                : <span className="text-muted-foreground/40">—</span>
            }
        </div>
    )
}

// ─── Pivot: group historical by month_year ───────────────────────
interface MonthRow {
    month_year: string // 'YYYY-MM-DD'
    // ids for delete/update
    id_evn?: number; id_boiler?: number; id_mnk?: number; id_shelling?: number; id_water?: number
    // shared
    rcn_hap?: number   // SEU 1 & 2
    ck?: number        // all
    // per-SEU
    kwh_evn?: number
    kg_boiler?: number
    sl_peeling?: number; kwh_mnk?: number
    sl_shelling?: number; kwh_shelling?: number
    // water
    m3_water?: number  // actual water consumption
    sl_water?: number  // production (rcn or ck) for water
}

function pivotHistorical(historical: MonthlyHistorical[]): MonthRow[] {
    const map: Record<string, MonthRow> = {}
    for (const h of historical) {
        const m = h.month_year.slice(0, 7) + '-01' // normalize
        if (!map[m]) map[m] = { month_year: m }
        const r = map[m]
        if (h.seu_id === SEU_EVN) {
            r.id_evn = h.id; r.kwh_evn = h.actual_energy
            r.rcn_hap = h.rcn_hap_duoc_kg; r.ck = (h as any).ck_obtained_mt ?? r.ck
        }
        if (h.seu_id === SEU_BOILER) {
            r.id_boiler = h.id; r.kg_boiler = h.actual_energy
            if (!r.rcn_hap) r.rcn_hap = h.rcn_hap_duoc_kg
            if (!r.ck) r.ck = (h as any).ck_obtained_mt
        }
        if (h.seu_id === SEU_MNK) {
            r.id_mnk = h.id; r.kwh_mnk = h.actual_energy; r.sl_peeling = h.rcn_hap_duoc_kg
            if (!r.ck) r.ck = (h as any).ck_obtained_mt
        }
        if (h.seu_id === SEU_SHELLING) {
            r.id_shelling = h.id; r.kwh_shelling = h.actual_energy; r.sl_shelling = h.rcn_hap_duoc_kg
            if (!r.ck) r.ck = (h as any).ck_obtained_mt
        }
        if (h.seu_id === SEU_WATER) {
            r.id_water = h.id; r.m3_water = h.actual_energy; r.sl_water = h.rcn_hap_duoc_kg
            if (!r.ck) r.ck = (h as any).ck_obtained_mt
        }
    }
    return Object.values(map).sort((a, b) => a.month_year.localeCompare(b.month_year))
}

export function TabBaseline({ seus, historical, baselines, onRefresh }: Props) {
    // ── Regression / baseline section still lets you pick SEU ──
    const [activeSeu, setActiveSeu] = useState<number>(seus[0]?.seu_id ?? 0)
    const [computing, setComputing] = useState(false)
    const [baselineLabel, setBaselineLabel] = useState('Đường cơ sở 2024')
    const [xVar, setXVar] = useState<XVar>('rcn')
    const [periodFrom, setPeriodFrom] = useState('')
    const [periodTo, setPeriodTo] = useState('')
    const [regression, setRegression] = useState<{ slope: number; intercept: number; r_squared: number; n: number } | null>(null)

    // ── Saving state: key = "month_year|seu_id" or 'new' ──
    const [saving, setSaving] = useState<string | null>(null)

    // ── Sync ──
    const [syncMonth, setSyncMonth] = useState(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })
    const [syncing, setSyncing] = useState(false)
    const [syncResult, setSyncResult] = useState<string | null>(null)

    // ── New row ──
    const emptyNew = () => ({
        month_year: '', rcn_hap: '', ck: '',
        kwh_evn: '', kg_boiler: '',
        sl_peeling: '', kwh_mnk: '',
        sl_shelling: '', kwh_shelling: '',
        sl_water: '', m3_water: '',
    })
    const [newRow, setNewRow] = useState(emptyNew())

    // ── Derived ──
    const rows = useMemo(() => pivotHistorical(historical), [historical])
    const seu = seus.find(s => s.seu_id === activeSeu)
    const seuHistorical = historical.filter(h => h.seu_id === activeSeu).sort((a, b) => a.month_year.localeCompare(b.month_year))
    const seuBaselines = baselines.filter(b => b.seu_id === activeSeu).sort((a, b) => b.created_at.localeCompare(a.created_at))
    const activeBaseline = seuBaselines.find(b => b.is_active)

    const selectedPoints = useMemo(() => {
        if (!periodFrom || !periodTo) return seuHistorical
        return seuHistorical.filter(h => h.month_year >= periodFrom && h.month_year <= periodTo)
    }, [seuHistorical, periodFrom, periodTo])

    const getX = (h: MonthlyHistorical) => xVar === 'ck' ? (h as any).ck_obtained_mt ?? 0 : h.rcn_hap_duoc_kg
    const xLabel = xVar === 'ck' ? 'CK (MT)' : 'Sản lượng (kg)'
    const scatterData = selectedPoints.map(h => ({ x: getX(h), y: h.actual_energy, label: format(parseISO(h.month_year), 'MM/yyyy') }))

    const regressionLineData = useMemo(() => {
        if (!regression || selectedPoints.length < 2) return []
        const xs = selectedPoints.map(p => getX(p))
        const minX = Math.min(...xs), maxX = Math.max(...xs)
        return [{ x: minX, y_line: regression.slope * minX + regression.intercept }, { x: maxX, y_line: regression.slope * maxX + regression.intercept }]
    }, [regression, selectedPoints, xVar])

    // ── Upsert one SEU cell ──
    const upsert = async (key: string, seu_id: number, month_year: string, actual_energy: number, rcn: number, ck?: number | null) => {
        setSaving(key)
        await fetch('/api/iso50001/baseline', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'upsert_historical',
                seu_id, month_year,
                actual_energy, rcn_hap_duoc_kg: rcn,
                ck_obtained_mt: ck ?? null,
            }),
        })
        setSaving(null)
        onRefresh()
    }

    // ── Helpers to get current values of a row for missing fields ──
    const rowVal = (row: MonthRow, field: keyof MonthRow) => Number((row as any)[field]) || 0
    const rowValNull = (row: MonthRow, field: keyof MonthRow) => (row as any)[field] != null ? Number((row as any)[field]) : null

    // ── Cell save handler – knows which SEU to update ──
    const handleCellSave = (row: MonthRow, field: string, val: string) => {
        const n = val ? Number(val) : 0
        const m = row.month_year
        const ck = rowValNull(row, 'ck')

        if (field === 'rcn_hap') {
            // Update SEU1 and SEU2 with new rcn
            if (row.kwh_evn != null || row.kwh_evn === undefined)
                upsert(`${m}|1|rcn`, 1, m, rowVal(row, 'kwh_evn'), n, ck)
            if (row.kg_boiler != null || row.kg_boiler === undefined)
                upsert(`${m}|2|rcn`, 2, m, rowVal(row, 'kg_boiler'), n, ck)
        }
        if (field === 'ck') {
            // Update all SEUs with new CK
            upsert(`${m}|1|ck`, 1, m, rowVal(row, 'kwh_evn'), rowVal(row, 'rcn_hap'), n)
            upsert(`${m}|2|ck`, 2, m, rowVal(row, 'kg_boiler'), rowVal(row, 'rcn_hap'), n)
            upsert(`${m}|3|ck`, 3, m, rowVal(row, 'kwh_mnk'), rowVal(row, 'sl_peeling'), n)
            upsert(`${m}|4|ck`, 4, m, rowVal(row, 'kwh_shelling'), rowVal(row, 'sl_shelling'), n)
            upsert(`${m}|5|ck`, 5, m, rowVal(row, 'm3_water'), rowVal(row, 'sl_water'), n)
        }
        if (field === 'kwh_evn') upsert(`${m}|1`, 1, m, n, rowVal(row, 'rcn_hap'), ck)
        if (field === 'kg_boiler') upsert(`${m}|2`, 2, m, n, rowVal(row, 'rcn_hap'), ck)
        if (field === 'sl_peeling') upsert(`${m}|3|rcn`, 3, m, rowVal(row, 'kwh_mnk'), n, ck)
        if (field === 'kwh_mnk') upsert(`${m}|3`, 3, m, n, rowVal(row, 'sl_peeling'), ck)
        if (field === 'sl_shelling') upsert(`${m}|4|rcn`, 4, m, rowVal(row, 'kwh_shelling'), n, ck)
        if (field === 'kwh_shelling') upsert(`${m}|4`, 4, m, n, rowVal(row, 'sl_shelling'), ck)
        if (field === 'sl_water') upsert(`${m}|5|rcn`, 5, m, rowVal(row, 'm3_water'), n, ck)
        if (field === 'm3_water') upsert(`${m}|5`, 5, m, n, rowVal(row, 'sl_water'), ck)
    }

    // ── Save new full row ──
    const handleSaveNewRow = async () => {
        if (!newRow.month_year) return
        setSaving('new')
        const m = newRow.month_year + '-01'
        const ck = newRow.ck ? Number(newRow.ck) : null
        const rcn = Number(newRow.rcn_hap) || 0
        const saves = []
        if (newRow.kwh_evn) saves.push(upsert('new|1', 1, m, Number(newRow.kwh_evn), rcn, ck))
        if (newRow.kg_boiler) saves.push(upsert('new|2', 2, m, Number(newRow.kg_boiler), rcn, ck))
        if (newRow.kwh_mnk) saves.push(upsert('new|3', 3, m, Number(newRow.kwh_mnk), Number(newRow.sl_peeling) || 0, ck))
        if (newRow.kwh_shelling) saves.push(upsert('new|4', 4, m, Number(newRow.kwh_shelling), Number(newRow.sl_shelling) || 0, ck))
        if (newRow.m3_water) saves.push(upsert('new|5', 5, m, Number(newRow.m3_water), Number(newRow.sl_water) || 0, ck))
        await Promise.all(saves)
        setSaving(null)
        setNewRow(emptyNew())
        onRefresh()
    }

    // ── Delete all SEUs for a month ──
    const handleDeleteMonth = async (row: MonthRow) => {
        if (!confirm(`Xóa toàn bộ data tháng ${format(parseISO(row.month_year), 'MM/yyyy')}?`)) return
        const ids = [row.id_evn, row.id_boiler, row.id_mnk, row.id_shelling, row.id_water].filter(Boolean)
        await Promise.all(ids.map(id =>
            fetch(`/api/iso50001/baseline?table=historical&id=${id}`, { method: 'DELETE' })
        ))
        onRefresh()
    }

    // ── Sync from daily ──
    const handleSync = async () => {
        setSyncing(true); setSyncResult(null)
        try {
            const res = await fetch('/api/iso50001/baseline', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync_from_daily', month: syncMonth }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setSyncResult(json.synced === 0
                ? `⚠️ ${json.message || 'Không tìm thấy data trong tháng này'}`
                : `✅ Đã đồng bộ ${json.synced} SEU cho tháng ${syncMonth}`)
            if (json.synced > 0) onRefresh()
        } catch (e: any) { setSyncResult(`❌ Lỗi: ${e.message}`) }
        finally { setSyncing(false) }
    }

    // ── Regression ──
    const handleComputeRegression = () => {
        if (selectedPoints.length < 2) return
        const result = calcLinearRegression(selectedPoints.map(h => ({ x: getX(h), y: h.actual_energy })))
        setRegression(result)
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
                seu_id: activeSeu, label: baselineLabel.trim() + (xVar === 'ck' ? ' [CK]' : ' [RCN]'),
                period_from: from ? from.slice(0, 7) + '-01' : from,
                period_to: to ? to.slice(0, 7) + '-01' : to,
                slope: regression.slope, intercept: regression.intercept,
                r_squared: regression.r_squared, n_points: regression.n,
            }),
        })
        setComputing(false); setRegression(null); onRefresh()
    }

    const handleActivate = async (baselineId: number) => {
        await fetch('/api/iso50001/baseline', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'activate', seu_id: activeSeu, baseline_id: baselineId }),
        })
        onRefresh()
    }

    const r2Color = regression ? (regression.r_squared >= 0.85 ? 'text-emerald-600' : 'text-amber-600') : ''

    // ── Column header groups ──
    const thBase = "text-center text-[10px] font-semibold py-2 px-2 border border-slate-200 bg-muted/40 text-muted-foreground"
    const thGroup = (cls: string) => `text-center text-[10px] font-bold py-1.5 px-2 border border-slate-200 text-white ${cls}`

    return (
        <div className="space-y-4">

            {/* ── Sync panel ── */}
            <Card className="shadow-sm border-blue-100 bg-blue-50/40">
                <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <RefreshCw className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="text-xs font-semibold text-blue-800">Đồng bộ từ Data Input</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="month" value={syncMonth}
                                onChange={e => { setSyncMonth(e.target.value); setSyncResult(null) }}
                                className="h-8 px-2 text-xs border border-blue-200 rounded bg-white focus:outline-none focus:border-blue-500 font-mono" />
                            <Button size="sm" onClick={handleSync} disabled={syncing || !syncMonth}
                                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                Đồng bộ tháng {syncMonth}
                            </Button>
                        </div>
                        {syncResult && (
                            <span className="text-xs text-blue-700 bg-blue-100 border border-blue-200 rounded px-2 py-1">{syncResult}</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto hidden sm:block">
                            Tự tính SUM từ các ngày đã nhập → điền vào bảng bên dưới
                        </span>
                    </div>
                </CardContent>
            </Card>

            {/* ── Unified data table ── */}
            <Card className="shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Bảng dữ liệu lịch sử — tất cả SEU</CardTitle>
                    <CardDescription className="text-xs">
                        Mỗi hàng = 1 tháng · Click ô để sửa · Hàng trống cuối để thêm tháng mới
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[1100px]">
                        <thead>
                            {/* Group headers */}
                            <tr>
                                <th className={`${thBase} w-24`} rowSpan={2}>Tháng</th>
                                <th colSpan={2} className={thGroup('bg-slate-500')}>Chung</th>
                                <th colSpan={2} className={thGroup('bg-blue-600')}>⚡ Toàn nhà máy (EVN)</th>
                                <th colSpan={1} className={thGroup('bg-orange-600')}>🔥 Boiler (Củi)</th>
                                <th colSpan={2} className={thGroup('bg-violet-600')}>⚡ MNK (Máy nén khí)</th>
                                <th colSpan={2} className={thGroup('bg-cyan-700')}>⚡ Shelling</th>
                                <th colSpan={2} className={thGroup('bg-teal-600')}>💧 Nước</th>
                                <th className={`${thBase} w-8`} rowSpan={2}></th>
                            </tr>
                            <tr>
                                {/* Chung */}
                                <th className={thBase}>RCN Hấp (kg)</th>
                                <th className={thBase}>CK (MT)</th>
                                {/* EVN */}
                                <th className={thBase}></th>
                                <th className={`${thBase} text-blue-700 font-bold`}>Điện EVN (kWh)</th>
                                {/* Boiler */}
                                <th className={`${thBase} text-orange-700 font-bold`}>Củi (kg)</th>
                                {/* MNK */}
                                <th className={thBase}>SL Peeling (kg)</th>
                                <th className={`${thBase} text-violet-700 font-bold`}>Điện MNK (kWh)</th>
                                {/* Shelling */}
                                <th className={thBase}>SL Shelling (kg)</th>
                                <th className={`${thBase} text-cyan-700 font-bold`}>Điện Shelling (kWh)</th>
                                {/* Water */}
                                <th className={thBase}>SL (kg)</th>
                                <th className={`${thBase} text-teal-700 font-bold`}>Nước (m³)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => {
                                const isSaving = saving?.startsWith(row.month_year)
                                return (
                                    <tr key={row.month_year}
                                        className={`border-b hover:bg-muted/10 transition-colors ${isSaving ? 'bg-blue-50/60' : ''}`}
                                    >
                                        <td className="px-3 py-1 font-mono text-muted-foreground whitespace-nowrap border-r border-slate-100">
                                            {format(parseISO(row.month_year), 'MM/yyyy')}
                                        </td>
                                        {/* Chung */}
                                        <td className="px-1 py-0.5 border-r border-slate-100">
                                            <EditCell value={row.rcn_hap} onSave={v => handleCellSave(row, 'rcn_hap', v)} />
                                        </td>
                                        <td className="px-1 py-0.5 border-r border-slate-100">
                                            <EditCell value={row.ck} onSave={v => handleCellSave(row, 'ck', v)} />
                                        </td>
                                        {/* EVN */}
                                        <td className="px-1 py-0.5 border-r border-slate-100 bg-blue-50/20">
                                            {/* empty — rcn shared */}
                                        </td>
                                        <td className="px-1 py-0.5 border-r border-slate-100 bg-blue-50/20">
                                            <EditCell value={row.kwh_evn} onSave={v => handleCellSave(row, 'kwh_evn', v)} />
                                        </td>
                                        {/* Boiler */}
                                        <td className="px-1 py-0.5 border-r border-slate-100 bg-orange-50/20">
                                            <EditCell value={row.kg_boiler} onSave={v => handleCellSave(row, 'kg_boiler', v)} />
                                        </td>
                                        {/* MNK */}
                                        <td className="px-1 py-0.5 border-r border-slate-100 bg-violet-50/20">
                                            <EditCell value={row.sl_peeling} onSave={v => handleCellSave(row, 'sl_peeling', v)} />
                                        </td>
                                        <td className="px-1 py-0.5 border-r border-slate-100 bg-violet-50/20">
                                            <EditCell value={row.kwh_mnk} onSave={v => handleCellSave(row, 'kwh_mnk', v)} />
                                        </td>
                                        {/* Shelling */}
                                        <td className="px-1 py-0.5 border-r border-slate-100 bg-cyan-50/20">
                                            <EditCell value={row.sl_shelling} onSave={v => handleCellSave(row, 'sl_shelling', v)} />
                                        </td>
                                        <td className="px-1 py-0.5 border-r border-slate-100 bg-cyan-50/20">
                                            <EditCell value={row.kwh_shelling} onSave={v => handleCellSave(row, 'kwh_shelling', v)} />
                                        </td>
                                        {/* Water */}
                                        <td className="px-1 py-0.5 border-r border-slate-100 bg-teal-50/20">
                                            <EditCell value={row.sl_water} onSave={v => handleCellSave(row, 'sl_water', v)} />
                                        </td>
                                        <td className="px-1 py-0.5 border-r border-slate-100 bg-teal-50/20">
                                            <EditCell value={row.m3_water} onSave={v => handleCellSave(row, 'm3_water', v)} />
                                        </td>
                                        <td className="px-2 py-1 text-center">
                                            {isSaving
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 inline" />
                                                : (
                                                    <button onClick={() => handleDeleteMonth(row)}
                                                        className="text-red-200 hover:text-red-500 transition-colors">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                        </td>
                                    </tr>
                                )
                            })}

                            {/* ── New row ── */}
                            <tr className="border-b bg-slate-50/60 hover:bg-blue-50/20">
                                <td className="px-2 py-1 border-r border-slate-100">
                                    <input type="month" value={newRow.month_year}
                                        onChange={e => setNewRow(r => ({ ...r, month_year: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs border border-dashed border-blue-300 rounded bg-white focus:outline-none focus:border-blue-500 font-mono" />
                                </td>
                                {/* Chung */}
                                <td className="px-1 py-1 border-r border-slate-100">
                                    <input type="number" placeholder="RCN (kg)" value={newRow.rcn_hap}
                                        onChange={e => setNewRow(r => ({ ...r, rcn_hap: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-blue-200 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                <td className="px-1 py-1 border-r border-slate-100">
                                    <input type="number" placeholder="CK (MT)" value={newRow.ck}
                                        onChange={e => setNewRow(r => ({ ...r, ck: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-blue-200 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                {/* EVN */}
                                <td className="px-1 py-1 border-r border-slate-100 bg-blue-50/30"></td>
                                <td className="px-1 py-1 border-r border-slate-100 bg-blue-50/30">
                                    <input type="number" placeholder="kWh EVN" value={newRow.kwh_evn}
                                        onChange={e => setNewRow(r => ({ ...r, kwh_evn: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-blue-300 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                {/* Boiler */}
                                <td className="px-1 py-1 border-r border-slate-100 bg-orange-50/30">
                                    <input type="number" placeholder="Củi (kg)" value={newRow.kg_boiler}
                                        onChange={e => setNewRow(r => ({ ...r, kg_boiler: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-orange-300 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                {/* MNK */}
                                <td className="px-1 py-1 border-r border-slate-100 bg-violet-50/30">
                                    <input type="number" placeholder="SL Peeling (kg)" value={newRow.sl_peeling}
                                        onChange={e => setNewRow(r => ({ ...r, sl_peeling: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-violet-200 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                <td className="px-1 py-1 border-r border-slate-100 bg-violet-50/30">
                                    <input type="number" placeholder="kWh MNK" value={newRow.kwh_mnk}
                                        onChange={e => setNewRow(r => ({ ...r, kwh_mnk: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-violet-300 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                {/* Shelling */}
                                <td className="px-1 py-1 border-r border-slate-100 bg-cyan-50/30">
                                    <input type="number" placeholder="SL Shelling (kg)" value={newRow.sl_shelling}
                                        onChange={e => setNewRow(r => ({ ...r, sl_shelling: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-cyan-200 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                <td className="px-1 py-1 border-r border-slate-100 bg-cyan-50/30">
                                    <input type="number" placeholder="kWh Shelling" value={newRow.kwh_shelling}
                                        onChange={e => setNewRow(r => ({ ...r, kwh_shelling: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-cyan-300 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                {/* Water */}
                                <td className="px-1 py-1 border-r border-slate-100 bg-teal-50/30">
                                    <input type="number" placeholder="SL (kg)" value={newRow.sl_water}
                                        onChange={e => setNewRow(r => ({ ...r, sl_water: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-teal-200 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                <td className="px-1 py-1 border-r border-slate-100 bg-teal-50/30">
                                    <input type="number" placeholder="m³ Nước" value={newRow.m3_water}
                                        onChange={e => setNewRow(r => ({ ...r, m3_water: e.target.value }))}
                                        className="w-full h-7 px-1 text-xs text-right border border-dashed border-teal-300 rounded bg-white focus:outline-none font-mono" />
                                </td>
                                <td className="px-2 py-1 text-center">
                                    {saving === 'new'
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 inline" />
                                        : (
                                            <button onClick={handleSaveNewRow}
                                                disabled={!newRow.month_year}
                                                className={`transition-colors ${newRow.month_year ? 'text-blue-500 hover:text-blue-700' : 'text-slate-300 cursor-not-allowed'}`}
                                                title="Lưu hàng mới">
                                                <Save className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    {rows.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-6">
                            Chưa có dữ liệu — dùng nút Đồng bộ hoặc nhập thủ công vào hàng trống bên trên
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* ── Regression section with SEU selector ── */}
            {seuHistorical.length >= 2 && (
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Tính hồi quy — Đường cơ sở</CardTitle>
                        <CardDescription className="text-xs">Chọn SEU cần tính, chọn kỳ dữ liệu, rồi bấm Tính</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* SEU selector */}
                        <div className="flex gap-2 flex-wrap">
                            {seus.map(s => (
                                <Button key={s.seu_id}
                                    variant={activeSeu === s.seu_id ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => { setActiveSeu(s.seu_id); setRegression(null) }}
                                    className="text-xs h-8">
                                    {s.energy_type === 'electricity' ? <Zap className="h-3.5 w-3.5 mr-1" /> : <Flame className="h-3.5 w-3.5 mr-1" />}
                                    {s.name}
                                </Button>
                            ))}
                        </div>

                        {/* Active Baseline */}
                        {(() => {
                            const ab = baselines.filter(b => b.seu_id === activeSeu).find(b => b.is_active)
                            if (!ab) return null
                            return (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                    <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                                        <CheckCircle2 className="h-4 w-4" /> Đường cơ sở đang kích hoạt
                                    </p>
                                    <p className="text-lg font-black text-emerald-900 mt-0.5">{ab.label}</p>
                                    <p className="text-sm font-mono text-emerald-800 mt-1">
                                        y = {Number(ab.slope).toFixed(4)}x + {Number(ab.intercept).toFixed(2)}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1.5 text-xs text-emerald-700">
                                        <span>R² = <strong className={ab.r_squared >= 0.85 ? 'text-emerald-600' : 'text-amber-600'}>
                                            {(ab.r_squared * 100).toFixed(1)}%
                                        </strong></span>
                                        <span>| n = {ab.n_points} tháng</span>
                                        <span>| {format(parseISO(ab.period_from), 'MM/yyyy')} → {format(parseISO(ab.period_to), 'MM/yyyy')}</span>
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Period */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs">Từ tháng</Label>
                                <Input type="month" value={periodFrom.slice(0, 7)}
                                    onChange={e => setPeriodFrom(e.target.value + '-01')} className="h-8 text-xs" />
                            </div>
                            <div>
                                <Label className="text-xs">Đến tháng</Label>
                                <Input type="month" value={periodTo.slice(0, 7)}
                                    onChange={e => setPeriodTo(e.target.value + '-01')} className="h-8 text-xs" />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">Đã chọn <strong>{selectedPoints.length}</strong> tháng</p>

                        {/* X variable */}
                        <div>
                            <Label className="text-xs">Biến X (trục hoành)</Label>
                            <div className="flex gap-2 mt-1.5 flex-wrap">
                                {['rcn', 'ck'].map(v => (
                                    <button key={v} onClick={() => { setXVar(v as XVar); setRegression(null) }}
                                        className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${xVar === v
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                                        {v === 'rcn' ? 'Sản lượng (kg)' : 'CK Obtained (MT)'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button onClick={handleComputeRegression} disabled={selectedPoints.length < 2} className="h-9 gap-2">
                            <Calculator className="h-4 w-4" /> Tính đường cơ sở
                        </Button>

                        {regression && (
                            <div className="space-y-3 mt-2">
                                <div className="rounded-xl border bg-slate-50 p-4">
                                    <p className="text-xs text-muted-foreground mb-1">Kết quả — X = {xLabel}</p>
                                    <p className="text-xl font-black font-mono">y = {regression.slope.toFixed(4)}x + {regression.intercept.toFixed(2)}</p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className={`text-base font-bold ${r2Color}`}>R² = {(regression.r_squared * 100).toFixed(1)}%</span>
                                        <Badge variant="outline" className={regression.r_squared >= 0.85
                                            ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                            : 'border-amber-300 text-amber-700 bg-amber-50'}>
                                            {regression.r_squared >= 0.85 ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                                            {regression.r_squared >= 0.85 ? 'Tốt' : 'Thấp'}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">n={regression.n}</span>
                                    </div>
                                </div>

                                <div className="h-[240px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                            <XAxis dataKey="x" type="number" domain={['auto', 'auto']}
                                                tick={{ fontSize: 10 }} tickFormatter={v => v.toLocaleString('en-US')}
                                                label={{ value: xLabel, position: 'insideBottom', offset: -8, fontSize: 10 }} />
                                            <YAxis dataKey="y" type="number" tick={{ fontSize: 10 }}
                                                tickFormatter={v => v.toLocaleString('en-US')} width={60}
                                                label={{ value: seu?.unit, angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                            <Tooltip content={({ active, payload }: any) => {
                                                if (!active || !payload?.length) return null
                                                const d = payload[0]?.payload
                                                return <div className="bg-white border rounded-lg shadow p-2 text-xs">
                                                    {d?.label && <p className="font-semibold">{d.label}</p>}
                                                    <p>X: {Number(d?.x || 0).toLocaleString('vi-VN')}</p>
                                                    <p>Y: {Number(d?.y || 0).toLocaleString('vi-VN')} {seu?.unit}</p>
                                                </div>
                                            }} />
                                            <Scatter data={scatterData} fill="#6366F1" opacity={0.8} />
                                            <Line data={regressionLineData} dataKey="y_line" stroke="#EF4444" strokeWidth={2} dot={false} type="linear" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs">Tên đường cơ sở</Label>
                                    <Input value={baselineLabel} onChange={e => setBaselineLabel(e.target.value)} className="h-9 text-sm" />
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

            {/* ── Saved baselines ── */}
            {seuBaselines.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Các đường cơ sở đã lưu — {seu?.name}</CardTitle>
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
                                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => handleActivate(b.id)}>
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
