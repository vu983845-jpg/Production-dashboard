"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { IntersnackLogo } from "@/components/intersnack-logo"

interface Dept { id: string; code: string; name_en: string }

const MULTI_SHIFT_CODES = new Set(["QC", "BOILER", "CLEAN", "MAINT_HCA"])

const HPEEL_SUBGROUPS = [
    { key: "HPEEL_LIEN", label: "Tổ Liên", dept_name: "Manual Peeling (Liên)" },
    { key: "HPEEL_DUNG", label: "Tổ Dung", dept_name: "Manual Peeling (Dung)" },
    { key: "HPEEL_GRADING", label: "Ms Huệ (Grading)", dept_name: "Manual Grading (Ms Huệ)" },
    { key: "HPEEL_LOAN", label: "Ms Loan", dept_name: "Manual Grading (Ms Huệ)" },
]

const SHIFTS_NORMAL = [{ value: "1", label: "Ca 1" }, { value: "2", label: "Ca 2" }, { value: "3", label: "Ca 3" }]
const SHIFTS_WITH_HC = [...SHIFTS_NORMAL, { value: "HC", label: "HC" }]
const MULTI_SHIFTS = ["1", "2", "3"]

// OT default meal time per shift
const OT_DEFAULT_TIME: Record<string, string> = { "1": "14:00", "2": "18:00", "3": "06:00", "HC": "17:00" }

interface ShiftData {
    officialPresent: string
    seasonalPresent: string
    officialAbsent: string
    seasonalAbsent: string
    vegCount: string      // chay trong ca thường (not OT)
    otTotal: string       // tổng OT (mặn + chay)
    otVeg: string         // OT chay
    otTime: string        // giờ ăn OT
    showOT: boolean
}
const blank = (shiftVal = ""): ShiftData => ({
    officialPresent: "", seasonalPresent: "",
    officialAbsent: "", seasonalAbsent: "",
    vegCount: "",
    otTotal: "", otVeg: "",
    otTime: OT_DEFAULT_TIME[shiftVal] ?? "",
    showOT: false,
})

interface ConfirmRow {
    department_id: string; department_name: string; work_date: string; shift: string
    official_present: number; seasonal_present: number; official_absent: number; seasonal_absent: number
    ot_count: number; vegetarian: number; ot_vegetarian: number; reporter_name: string
}

interface OTRecord { ot_count: number; ot_vegetarian: number; official_present: number; seasonal_present: number; vegetarian: number }
interface SummaryRow { department_name: string; shift: string; official_present: number; seasonal_present: number; official_absent: number; seasonal_absent: number; ot_count: number; vegetarian: number; ot_vegetarian: number; note?: string }
type PageMode = "report" | "edit-ot" | "summary"
type OTStep = "select" | "edit" | "confirm" | "done"

// ── helpers ──
const n = (s: string) => { const v = parseInt(s); return isNaN(v) || v < 0 ? 0 : v }
const calcMalan = (total: string, chay: string) => Math.max(0, n(total) - n(chay))
const totalPresent = (d: ShiftData) => n(d.officialPresent) + n(d.seasonalPresent)

export default function PublicMealPage() {
    const [depts, setDepts] = useState<Dept[]>([])
    const [loading, setLoading] = useState(true)
    const [pageMode, setPageMode] = useState<PageMode>("report")

    // Report state
    const [deptId, setDeptId] = useState("")
    const [hpeelSub, setHpeelSub] = useState("")
    const [shift, setShift] = useState("")
    const [workDate, setWorkDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [reporterName, setReporterName] = useState("")
    const [singleData, setSingleData] = useState<ShiftData>(blank())
    const [multiData, setMultiData] = useState<Record<string, ShiftData>>({ "1": blank("1"), "2": blank("2"), "3": blank("3") })
    const [confirmRows, setConfirmRows] = useState<ConfirmRow[]>([])
    const [showConfirm, setShowConfirm] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState("")
    const [submitting, setSubmitting] = useState(false)

    // OT edit state
    const [otStep, setOtStep] = useState<OTStep>("select")
    const [otDeptId, setOtDeptId] = useState("")
    const [otHpeelSub, setOtHpeelSub] = useState("")
    const [otShift, setOtShift] = useState("")
    const [otDate, setOtDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [otRecord, setOtRecord] = useState<OTRecord | null>(null)
    const [otNewTotal, setOtNewTotal] = useState("")
    const [otNewVeg, setOtNewVeg] = useState("")
    const [otNewTime, setOtNewTime] = useState("")
    const [otNotFound, setOtNotFound] = useState(false)
    const [otLooking, setOtLooking] = useState(false)
    const [otSubmitting, setOtSubmitting] = useState(false)
    const [otError, setOtError] = useState("")

    // Summary state
    const [sumDate, setSumDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [sumRows, setSumRows] = useState<SummaryRow[]>([])
    const [sumLoading, setSumLoading] = useState(false)
    const [sumError, setSumError] = useState("")
    const [sumLoaded, setSumLoaded] = useState(false)

    const loadSummary = async (date: string) => {
        setSumLoading(true); setSumError(""); setSumLoaded(false)
        const res = await fetch(`/api/public-meal?summary_date=${date}`)
        const data = await res.json()
        setSumLoading(false)
        if (data.error) { setSumError(data.error); return }
        const mergedMap = new Map<string, SummaryRow>()
        const rawRows: SummaryRow[] = data.summary ?? []
        for (const r of rawRows) {
            let deptName = r.department_name
            if (deptName.includes("Loan")) deptName = "Manual Grading (Ms Huệ)"
            const shift = r.shift === "HC" ? "1" : r.shift
            const key = `${deptName}|${shift}`
            const existing = mergedMap.get(key)
            if (existing) {
                existing.official_present += r.official_present
                existing.seasonal_present += r.seasonal_present
                existing.official_absent += r.official_absent
                existing.seasonal_absent += r.seasonal_absent
                existing.ot_count += r.ot_count
                existing.vegetarian += r.vegetarian
                existing.ot_vegetarian += r.ot_vegetarian
                if (r.note) existing.note = existing.note ? `${existing.note} & ${r.note}` : r.note
            } else {
                mergedMap.set(key, { ...r, department_name: deptName, shift })
            }
        }

        const mergedRows = Array.from(mergedMap.values()).sort((a, b) => {
            if (a.department_name !== b.department_name) return a.department_name.localeCompare(b.department_name)
            return a.shift.localeCompare(b.shift)
        })

        setSumRows(mergedRows)
        setSumLoaded(true)
    }

    useEffect(() => {
        fetch("/api/public-meal")
            .then(r => r.json())
            .then(d => {
                const sorted = (d.depts || []).sort((a: Dept, b: Dept) => a.name_en.localeCompare(b.name_en))
                setDepts(sorted)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [])

    const selectedDept = depts.find(d => d.id === deptId)
    const isMultiShift = !!(selectedDept && MULTI_SHIFT_CODES.has(selectedDept.code))
    const isHpeel = selectedDept?.code === "HPEEL" || selectedDept?.code === "HAND"
    const isOffice = selectedDept?.code === "OFFICE"
    const shifts = (isOffice || isHpeel) ? SHIFTS_WITH_HC : SHIFTS_NORMAL
    const hideSeasonal = !!(selectedDept && ["BOILER", "QC", "OFFICE", "MAINT_SHELL", "MAINT_HCA"].includes(selectedDept.code))
    const hideAbsent = selectedDept?.code === "BOILER"

    const otSelectedDept = depts.find(d => d.id === otDeptId)
    const isOtHpeel = otSelectedDept?.code === "HPEEL" || otSelectedDept?.code === "HAND"
    const isOtOffice = otSelectedDept?.code === "OFFICE"
    const otShifts = (isOtOffice || isOtHpeel) ? SHIFTS_WITH_HC : SHIFTS_NORMAL
    const activeMultiShifts = selectedDept?.code === "CLEAN" ? ["1", "2"] : MULTI_SHIFTS

    const getEffectiveDeptName = (id = deptId, sub = hpeelSub) => {
        const dept = depts.find(d => d.id === id)
        if ((dept?.code === "HPEEL" || dept?.code === "HAND") && sub) return HPEEL_SUBGROUPS.find(s => s.key === sub)?.dept_name ?? dept.name_en
        return dept?.name_en ?? ""
    }

    const buildRow = (data: ShiftData, shiftVal: string): ConfirmRow => {
        const otMalan = calcMalan(data.otTotal, data.otVeg)
        const timeNote = (n(data.otTotal) > 0 && data.otTime) ? ` | Giờ ăn OT: ${data.otTime}` : ""
        return {
            department_id: deptId, department_name: getEffectiveDeptName(),
            work_date: workDate, shift: shiftVal,
            official_present: n(data.officialPresent), seasonal_present: n(data.seasonalPresent),
            official_absent: n(data.officialAbsent), seasonal_absent: n(data.seasonalAbsent),
            ot_count: otMalan,
            vegetarian: n(data.vegCount),
            ot_vegetarian: n(data.otVeg),
            reporter_name: (reporterName.trim() + timeNote).trim(),
        }
    }

    const handlePreview = (e: React.FormEvent) => {
        e.preventDefault(); setError("")
        if (!deptId) { setError("Vui lòng chọn bộ phận"); return }
        if (isHpeel && !hpeelSub) { setError("Vui lòng chọn tổ trưởng"); return }
        if (!isMultiShift && !shift) { setError("Vui lòng chọn ca làm việc"); return }
        const rows = isMultiShift ? activeMultiShifts.map(s => buildRow(multiData[s], s)) : [buildRow(singleData, shift)]
        setConfirmRows(rows); setShowConfirm(true)
    }

    const handleSubmit = async () => {
        setSubmitting(true); setError("")
        const res = await fetch("/api/public-meal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(confirmRows) })
        const data = await res.json()
        setSubmitting(false)
        if (data.success) { setSuccess(true); setShowConfirm(false) }
        else { setError(data.error || "Có lỗi xảy ra"); setShowConfirm(false) }
    }

    const handleReset = () => {
        setSuccess(false); setShowConfirm(false); setError("")
        setDeptId(""); setHpeelSub(""); setShift("")
        setSingleData(blank()); setMultiData({ "1": blank("1"), "2": blank("2"), "3": blank("3") })
        setConfirmRows([])
    }

    // OT edit
    const handleOtLookup = async () => {
        if (!otDeptId || !otShift) { setOtError("Vui lòng chọn bộ phận và ca"); return }
        if (isOtHpeel && !otHpeelSub) { setOtError("Vui lòng chọn tổ trưởng"); return }
        setOtLooking(true); setOtError(""); setOtNotFound(false)
        const deptName = getEffectiveDeptName(otDeptId, otHpeelSub)
        const url = `/api/public-meal?dept_id=${otDeptId}&work_date=${otDate}&shift=${otShift}&dept_name=${encodeURIComponent(deptName)}`
        const res = await fetch(url); const data = await res.json()
        setOtLooking(false)
        if (!data.record) {
            // create default 0 record if not found
            setOtRecord({ ot_count: 0, ot_vegetarian: 0, official_present: 0, seasonal_present: 0, vegetarian: 0 })
            setOtNewTotal("0")
            setOtNewVeg("0")
            setOtNewTime(OT_DEFAULT_TIME[otShift] ?? "")
            setOtStep("edit")
            return
        }
        const rec = data.record as OTRecord
        setOtRecord(rec)
        const oldTotal = (rec.ot_count ?? 0) + (rec.ot_vegetarian ?? 0)
        setOtNewTotal(String(oldTotal))
        setOtNewVeg(String(rec.ot_vegetarian ?? 0))
        setOtNewTime(OT_DEFAULT_TIME[otShift] ?? "")
        setOtStep("edit")
    }

    const handleOtSubmit = async () => {
        setOtSubmitting(true); setOtError("")
        const deptName = getEffectiveDeptName(otDeptId, otHpeelSub)
        const otMalan = calcMalan(otNewTotal, otNewVeg)
        const timeNote = otNewTime ? `Giờ ăn OT: ${otNewTime}` : ""
        const payload = {
            department_id: otDeptId, department_name: deptName,
            work_date: otDate, shift: otShift,
            official_present: otRecord?.official_present ?? 0,
            seasonal_present: otRecord?.seasonal_present ?? 0,
            official_absent: 0, seasonal_absent: 0,
            vegetarian: otRecord?.vegetarian ?? 0,
            ot_count: otMalan, ot_vegetarian: n(otNewVeg),
            reporter_name: timeNote,
        }
        const res = await fetch("/api/public-meal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([payload]) })
        const data = await res.json()
        setOtSubmitting(false)
        if (data.success) setOtStep("done")
        else { setOtError(data.error || "Có lỗi, thử lại"); setOtStep("edit") }
    }

    const resetOt = () => { setOtStep("select"); setOtDeptId(""); setOtHpeelSub(""); setOtShift(""); setOtRecord(null); setOtNewTotal(""); setOtNewVeg(""); setOtNotFound(false); setOtError("") }

    const updateMulti = (shiftKey: string, field: keyof ShiftData, val: any) =>
        setMultiData(prev => ({ ...prev, [shiftKey]: { ...prev[shiftKey], [field]: val } }))
    const updateSingle = (field: keyof ShiftData, val: any) =>
        setSingleData(prev => ({ ...prev, [field]: val }))

    // ── Sub-components ──
    const HpeelPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <div className="radio-group">
            {HPEEL_SUBGROUPS.map(sg => (
                <label key={sg.key} className={`radio-btn ${value === sg.key ? "active" : ""}`}>
                    <input type="radio" name="hpeel_sub" value={sg.key} checked={value === sg.key} onChange={() => onChange(sg.key)} />
                    {sg.label}
                </label>
            ))}
        </div>
    )

    const ShiftPills = ({ value, onChange, arr }: { value: string; onChange: (v: string) => void; arr: typeof SHIFTS_NORMAL }) => (
        <div className="shift-pills">
            {arr.map(s => (
                <button key={s.value} type="button" className={`shift-pill ${value === s.value ? "active" : ""}`} onClick={() => onChange(s.value)}>
                    {s.label}
                </button>
            ))}
        </div>
    )

    // Main meal fields component
    const ShiftFields = ({ data, update, shiftLabel, shiftVal }: {
        data: ShiftData; update: (f: keyof ShiftData, v: any) => void
        shiftLabel?: string; shiftVal?: string
    }) => {
        const total = totalPresent(data)
        const chay = n(data.vegCount)
        const malan = Math.max(0, total - chay)
        const hasTotal = total > 0
        const otTotalN = n(data.otTotal)
        const otChayN = n(data.otVeg)
        const otMalanN = calcMalan(data.otTotal, data.otVeg)
        const hasOT = otTotalN > 0

        return (
            <div className="shift-block">
                {shiftLabel && <div className="shift-block-label">📅 {shiftLabel}</div>}

                {/* Present */}
                <div className="subsection-label">👥 Hiện diện</div>
                <div className="row2">
                    <div className="field-sm" style={{ flex: hideSeasonal ? "none" : 1, width: hideSeasonal ? "100%" : "auto" }}>
                        <label>Chính thức</label>
                        <input type="number" min="0" max="999" placeholder="0" value={data.officialPresent} onChange={e => update("officialPresent", e.target.value)} />
                    </div>
                    {!hideSeasonal && (
                        <div className="field-sm">
                            <label>Thời vụ</label>
                            <input type="number" min="0" max="999" placeholder="0" value={data.seasonalPresent} onChange={e => update("seasonalPresent", e.target.value)} />
                        </div>
                    )}
                </div>

                {/* Vegetarian breakdown — shows after entering total */}
                {hasTotal && (
                    <div className="breakdown-box">
                        <div className="breakdown-total">Tổng: <strong>{total} phần</strong></div>
                        <div className="breakdown-row">
                            <div className="breakdown-item man">
                                <span>🍖 Mặn</span>
                                <strong>{malan}</strong>
                            </div>
                            <div className="breakdown-sep">+</div>
                            <div className="breakdown-item chay">
                                <span>🥬 Chay</span>
                                <input
                                    type="number" min="0" max={total} placeholder="0"
                                    value={data.vegCount}
                                    onChange={e => update("vegCount", e.target.value)}
                                    className="chay-input"
                                />
                            </div>
                            <div className="breakdown-sep">= {total}</div>
                        </div>
                        {chay > total && <div className="breakdown-warn">⚠️ Số chay không thể lớn hơn tổng!</div>}
                    </div>
                )}

                {/* Absent */}
                {!hideAbsent && (
                    <>
                        <div className="subsection-label" style={{ marginTop: 8 }}>❌ Vắng mặt <span className="opt-tag">nếu có</span></div>
                        <div className="row2">
                            <div className="field-sm" style={{ flex: hideSeasonal ? "none" : 1, width: hideSeasonal ? "100%" : "auto" }}>
                                <label>Chính thức</label>
                                <input type="number" min="0" max="999" placeholder="0" value={data.officialAbsent} onChange={e => update("officialAbsent", e.target.value)} />
                            </div>
                            {!hideSeasonal && (
                                <div className="field-sm">
                                    <label>Thời vụ</label>
                                    <input type="number" min="0" max="999" placeholder="0" value={data.seasonalAbsent} onChange={e => update("seasonalAbsent", e.target.value)} />
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* OT */}
                {!data.showOT ? (
                    <button type="button" className="ghost-btn" style={{ marginTop: 8, padding: "8px", width: "100%", border: "1.5px dashed #f97316", background: "#fff7ed", color: "#c2410c" }} onClick={() => update("showOT", true)}>
                        + Thêm báo cơm Tăng ca (OT)
                    </button>
                ) : (
                    <>
                        <div className="subsection-label" style={{ marginTop: 8 }}>⏰ Tăng ca (OT) <span className="opt-tag">nếu có</span></div>
                        <div className="row2">
                            <div className="field-sm">
                                <label>Tổng phần OT</label>
                                <input type="number" min="0" max="999" placeholder="0" value={data.otTotal} onChange={e => update("otTotal", e.target.value)} />
                            </div>
                            <div className="field-sm">
                                <label>Trong đó chay</label>
                                <input type="number" min="0" max={otTotalN || 999} placeholder="0" value={data.otVeg} onChange={e => update("otVeg", e.target.value)} />
                            </div>
                        </div>
                        {hasOT && (
                            <div className="ot-breakdown">
                                <span>Mặn OT: <strong>{otMalanN}</strong></span>
                                <span className="dot">·</span>
                                <span>Chay OT: <strong>{otChayN}</strong></span>
                                <div className="ot-time-row">
                                    <span>🕐 Giờ ăn OT:</span>
                                    <input
                                        type="time"
                                        value={data.otTime || (OT_DEFAULT_TIME[shiftVal ?? shift] ?? "")}
                                        onChange={e => update("otTime", e.target.value)}
                                        className="time-input"
                                    />
                                </div>
                            </div>
                        )}
                        <button type="button" className="ghost-btn" style={{ marginTop: 6, padding: "8px", fontSize: 13, color: "#ef4444", border: "1px solid #fee2e2", background: "#fef2f2" }} onClick={() => { update("showOT", false); update("otTotal", ""); update("otVeg", ""); }}>
                            ❌ Hủy phần OT ca này
                        </button>
                    </>
                )}
            </div>
        )
    }

    if (loading) return (
        <div className="loading-screen">
            <div className="bg-white rounded-2xl shadow-md w-16 h-16 overflow-hidden flex items-center justify-center border border-slate-100 logo-spin mb-4">
                <IntersnackLogo className="w-12 h-12" />
            </div>
            <div className="loading-text">Đang tải...</div>
        </div>
    )

    // ─────── SUMMARY MODE ───────
    if ((pageMode as string) === "summary") {
        const totalRow = sumRows.reduce((acc, r) => ({
            present: acc.present + r.official_present + r.seasonal_present,
            absent: acc.absent + r.official_absent + r.seasonal_absent,
            malan: acc.malan + (r.official_present + r.seasonal_present - r.vegetarian),
            chay: acc.chay + r.vegetarian,
            otMalan: acc.otMalan + r.ot_count,
            otChay: acc.otChay + r.ot_vegetarian,
        }), { present: 0, absent: 0, malan: 0, chay: 0, otMalan: 0, otChay: 0 })

        return (
            <PageShell header={{ icon: "📊", title: "Tổng hợp báo cơm", sub: sumLoaded ? format(new Date(sumDate + "T00:00:00"), "dd/MM/yyyy") : "Chọn ngày để xem" }}>
                <div className="mode-tabs">
                    <button className="mode-tab" onClick={() => setPageMode("report")}>🍽️ Báo cơm</button>
                    <button className="mode-tab" onClick={() => { setPageMode("edit-ot"); resetOt() }}>⏰ Sửa OT</button>
                    <button className="mode-tab active">📊 Tổng hợp</button>
                </div>

                <div className="sum-date-row">
                    <div className="field-sm" style={{ flex: 1 }}>
                        <label>Chọn ngày xem</label>
                        <input type="date" value={sumDate} onChange={e => setSumDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} />
                    </div>
                    <button className="load-btn" onClick={() => loadSummary(sumDate)} disabled={sumLoading}>
                        {sumLoading ? "⏳" : "🔍 Xem"}
                    </button>
                </div>

                {sumError && <div className="err-box">⚠️ {sumError}</div>}

                {sumLoaded && sumRows.length === 0 && (
                    <div className="sum-empty">📭 Chưa có dữ liệu báo cơm cho ngày này.</div>
                )}

                {sumLoaded && sumRows.length > 0 && (
                    <>
                        {/* KPI cards */}
                        <div className="kpi-row">
                            <div className="kpi-card orange">
                                <div className="kpi-val">{totalRow.present}</div>
                                <div className="kpi-label">👥 Tổng HD</div>
                            </div>
                            <div className="kpi-card blue">
                                <div className="kpi-val">{totalRow.malan + totalRow.chay}</div>
                                <div className="kpi-label">🍽️ Mặn+Chay</div>
                            </div>
                            <div className="kpi-card green">
                                <div className="kpi-val">{totalRow.otMalan + totalRow.otChay}</div>
                                <div className="kpi-label">⏰ Tổng OT</div>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="sum-table-wrap">
                            <table className="sum-table">
                                <thead>
                                    <tr>
                                        <th>Bộ phận</th>
                                        <th>Ca</th>
                                        <th>Chính thức</th>
                                        <th>Thời vụ</th>
                                        <th>🍖</th>
                                        <th>🥬</th>
                                        <th>OT🍖</th>
                                        <th>OT🥬</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sumRows.map((r, i) => {
                                        const malan = Math.max(0, r.official_present + r.seasonal_present - r.vegetarian)
                                        return (
                                            <tr key={i}>
                                                <td className="td-dept">{r.department_name}</td>
                                                <td className="td-ca">{r.shift === "HC" ? "HC" : `Ca ${r.shift}`}</td>
                                                <td>{r.official_present}</td>
                                                <td>{r.seasonal_present}</td>
                                                <td className="td-malan">{malan}</td>
                                                <td className="td-chay">{r.vegetarian}</td>
                                                <td className="td-ot">{r.ot_count}</td>
                                                <td className="td-ot">{r.ot_vegetarian}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="sum-total-row">
                                        <td colSpan={2}>Tổng</td>
                                        <td colSpan={2}>{totalRow.present}</td>
                                        <td className="td-malan">{totalRow.malan}</td>
                                        <td className="td-chay">{totalRow.chay}</td>
                                        <td className="td-ot">{totalRow.otMalan}</td>
                                        <td className="td-ot">{totalRow.otChay}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <div className="sum-note">📞 Dữ liệu do các bộ phận tự báo. Sai sót liên hệ <strong>Ms Chi</strong>.</div>
                    </>
                )}
            </PageShell>
        )
    }

    // ─────── OT EDIT MODE ───────
    if ((pageMode as string) === "edit-ot") {
        if (otStep === "done") return (
            <PageShell>
                <div className="success-page">
                    <div className="bg-white rounded-xl shadow-sm w-16 h-16 overflow-hidden flex items-center justify-center border border-slate-100 mb-4">
                        <IntersnackLogo className="w-12 h-12" />
                    </div>
                    <div className="success-icon">✅</div>
                    <div className="success-title">OT đã được cập nhật!</div>
                    <p className="success-sub">Sai sót liên hệ <strong>Ms Chi</strong> nhé!</p>
                    <div className="success-card">
                        <div><span>Bộ phận</span><strong>{getEffectiveDeptName(otDeptId, otHpeelSub)}</strong></div>
                        <div><span>Ngày</span><strong>{format(new Date(otDate + "T00:00:00"), "dd/MM/yyyy")}</strong></div>
                        <div><span>Ca</span><strong>Ca {otShift}</strong></div>
                        <div><span>OT mặn mới</span><strong>{calcMalan(otNewTotal, otNewVeg)}</strong></div>
                        <div><span>OT chay mới</span><strong>{n(otNewVeg)}</strong></div>
                        {otNewTime && <div><span>Giờ ăn OT</span><strong>{otNewTime}</strong></div>}
                    </div>
                    <button className="outline-btn" onClick={resetOt}>🔄 Sửa OT ca khác</button>
                    <button className="ghost-btn" style={{ marginTop: 10 }} onClick={() => { resetOt(); setPageMode("report") }}>🏠 Về trang báo cơm</button>
                </div>
            </PageShell>
        )

        if (otStep === "confirm") return (
            <PageShell header={{ icon: "🔍", title: "Xác nhận sửa OT", sub: `${getEffectiveDeptName(otDeptId, otHpeelSub)} · Ca ${otShift} · ${format(new Date(otDate + "T00:00:00"), "dd/MM/yyyy")}` }}>
                <div className="compare-card">
                    <div className="compare-col old">
                        <div className="compare-label">OT Cũ</div>
                        <div className="compare-val">{(otRecord?.ot_count ?? 0) + (otRecord?.ot_vegetarian ?? 0)}<small> tổng</small></div>
                        <div className="compare-sub">🍖 {otRecord?.ot_count ?? 0} mặn · 🥬 {otRecord?.ot_vegetarian ?? 0} chay</div>
                    </div>
                    <div className="compare-arrow">→</div>
                    <div className="compare-col new">
                        <div className="compare-label">OT Mới</div>
                        <div className="compare-val">{n(otNewTotal)}<small> tổng</small></div>
                        <div className="compare-sub">🍖 {calcMalan(otNewTotal, otNewVeg)} mặn · 🥬 {n(otNewVeg)} chay</div>
                    </div>
                </div>
                {otNewTime && <div className="info-row">🕐 Giờ ăn OT: <strong>{otNewTime}</strong></div>}
                <div className="contact-note">📞 Có sai sót liên hệ <strong>Ms Chi</strong> nhé!</div>
                {otError && <div className="err-box">⚠️ {otError}</div>}
                <button className="primary-btn" onClick={handleOtSubmit} disabled={otSubmitting}>
                    {otSubmitting ? "⏳ Đang lưu..." : "✅ Xác nhận cập nhật OT"}
                </button>
                <button className="ghost-btn" onClick={() => setOtStep("edit")} disabled={otSubmitting}>✏️ Sửa lại</button>
            </PageShell>
        )

        if (otStep === "edit") return (
            <PageShell header={{ icon: "⏰", title: "Chỉnh sửa OT", sub: `${getEffectiveDeptName(otDeptId, otHpeelSub)} · Ca ${otShift} · ${format(new Date(otDate + "T00:00:00"), "dd/MM/yyyy")}` }}>
                {/* Current values */}
                <div className="current-ot-card">
                    <div className="current-ot-title">📋 OT hiện tại trong hệ thống</div>
                    <div className="ot-stat-row">
                        <div className="ot-stat"><span>Tổng OT</span><strong>{(otRecord?.ot_count ?? 0) + (otRecord?.ot_vegetarian ?? 0)}</strong></div>
                        <div className="ot-stat"><span>🍖 Mặn</span><strong>{otRecord?.ot_count ?? 0}</strong></div>
                        <div className="ot-stat"><span>🥬 Chay</span><strong>{otRecord?.ot_vegetarian ?? 0}</strong></div>
                    </div>
                </div>

                <div className="section-label">✏️ Nhập số OT mới</div>
                <div className="row2">
                    <div className="field-sm">
                        <label>Tổng phần OT</label>
                        <input type="number" min="0" max="999" placeholder="0" value={otNewTotal} onChange={e => setOtNewTotal(e.target.value)} />
                    </div>
                    <div className="field-sm">
                        <label>Trong đó chay</label>
                        <input type="number" min="0" max={n(otNewTotal) || 999} placeholder="0" value={otNewVeg} onChange={e => setOtNewVeg(e.target.value)} />
                    </div>
                </div>
                {n(otNewTotal) > 0 && (
                    <div className="ot-breakdown">
                        <span>🍖 Mặn: <strong>{calcMalan(otNewTotal, otNewVeg)}</strong></span>
                        <span className="dot">·</span>
                        <span>🥬 Chay: <strong>{n(otNewVeg)}</strong></span>
                        <div className="ot-time-row">
                            <span>🕐 Giờ ăn OT:</span>
                            <input type="time" value={otNewTime} onChange={e => setOtNewTime(e.target.value)} className="time-input" />
                        </div>
                    </div>
                )}
                {otError && <div className="err-box">⚠️ {otError}</div>}
                <button className="primary-btn" onClick={() => setOtStep("confirm")}>🔍 Xem lại & Xác nhận</button>
                <button className="ghost-btn" onClick={() => setOtStep("select")}>← Chọn lại ca</button>
            </PageShell>
        )

        // Select step
        return (
            <PageShell header={{ icon: "⏰", title: "Chỉnh sửa OT", sub: "Chọn bộ phận và ca cần điều chỉnh" }}>
                <div className="mode-tabs">
                    <button className="mode-tab" onClick={() => { setPageMode("report"); resetOt() }}>🍽️ Báo cơm</button>
                    <button className="mode-tab active">⏰ Sửa OT</button>
                </div>
                <div className="field-sm" style={{ marginTop: 16 }}>
                    <label>Bộ phận <span className="req">*</span></label>
                    <select value={otDeptId} onChange={e => { setOtDeptId(e.target.value); setOtHpeelSub(""); setOtShift("") }}>
                        <option value="">— Chọn bộ phận —</option>
                        {depts.map(d => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                    </select>
                </div>
                {isOtHpeel && (
                    <div className="field-sm"><label>Tổ trưởng <span className="req">*</span></label><HpeelPicker value={otHpeelSub} onChange={v => {
                        setOtHpeelSub(v);
                        if (v === "HPEEL_LOAN") setOtShift("HC");
                    }} /></div>
                )}
                <div className="field-sm"><label>Ca <span className="req">*</span></label><ShiftPills value={otShift} onChange={s => { setOtShift(s) }} arr={otShifts} /></div>
                <div className="field-sm"><label>Ngày <span className="req">*</span></label>
                    <input type="date" value={otDate} onChange={e => setOtDate(e.target.value)} min={format(new Date(), "yyyy-MM-dd")} max={format(new Date(), "yyyy-MM-dd")} />
                </div>
                {otNotFound && <div className="err-box">⚠️ Không tìm thấy bản ghi. Kiểm tra lại bộ phận / ca / ngày.</div>}
                {otError && <div className="err-box">⚠️ {otError}</div>}
                <button className="primary-btn" onClick={handleOtLookup} disabled={otLooking || !otDeptId || !otShift}>
                    {otLooking ? "⏳ Đang tìm..." : "🔍 Xem OT đã báo"}
                </button>
                <button className="ghost-btn" onClick={() => { setPageMode("report"); resetOt() }}>← Về báo cơm</button>
            </PageShell>
        )
    }

    // ─────── REPORT MODE ───────
    if (showConfirm) return (
        <PageShell header={{ icon: "🔍", title: "Xác nhận báo cơm", sub: "Kiểm tra trước khi gửi" }}>
            <div className="confirm-meta-card">
                <div><span>Bộ phận</span><strong>{getEffectiveDeptName()}</strong></div>
                <div><span>Ngày</span><strong>{format(new Date(workDate + "T00:00:00"), "dd/MM/yyyy")}</strong></div>
                {reporterName && <div><span>Người báo</span><strong>{reporterName}</strong></div>}
            </div>
            {confirmRows.map((r, i) => (
                <div key={i} className="confirm-shift-card">
                    <div className="confirm-shift-title">Ca {r.shift}</div>
                    <div className="confirm-grid">
                        <div className="cg-item"><span>Chính thức hiện diện</span><b>{r.official_present}</b></div>
                        <div className="cg-item"><span>Thời vụ hiện diện</span><b>{r.seasonal_present}</b></div>
                        <div className="cg-item"><span>Chính thức vắng</span><b>{r.official_absent}</b></div>
                        <div className="cg-item"><span>Thời vụ vắng</span><b>{r.seasonal_absent}</b></div>
                        <div className="cg-item"><span>🍖 Mặn ca</span><b>{r.official_present + r.seasonal_present - r.vegetarian}</b></div>
                        <div className="cg-item"><span>🥬 Chay ca</span><b>{r.vegetarian}</b></div>
                        <div className="cg-item"><span>⏰ OT mặn</span><b>{r.ot_count}</b></div>
                        <div className="cg-item"><span>🥬 OT chay</span><b>{r.ot_vegetarian}</b></div>
                    </div>
                </div>
            ))}
            {error && <div className="err-box">⚠️ {error}</div>}
            <div className="contact-note">📞 Sai sót liên hệ <strong>Ms Chi</strong> để điều chỉnh nhé!</div>
            <button className="primary-btn" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "⏳ Đang gửi..." : "✅ Xác nhận & Gửi báo cơm"}
            </button>
            <button className="ghost-btn" onClick={() => setShowConfirm(false)} disabled={submitting}>✏️ Sửa lại</button>
        </PageShell>
    )

    if (success) return (
        <PageShell>
            <div className="success-page">
                <div className="bg-white rounded-xl shadow-sm w-16 h-16 overflow-hidden flex items-center justify-center border border-slate-100 mb-4">
                    <IntersnackLogo className="w-12 h-12" />
                </div>
                <div className="success-icon">✅</div>
                <div className="success-title">Đã báo cơm thành công!</div>
                <p className="success-sub">Cảm ơn bạn đã báo cơm! 🙏<br /><small>Sai sót liên hệ <strong>Ms Chi</strong> nhé!</small></p>
                <div className="success-card">
                    <div><span>Bộ phận</span><strong>{getEffectiveDeptName()}</strong></div>
                    <div><span>Ngày</span><strong>{format(new Date(workDate + "T00:00:00"), "dd/MM/yyyy")}</strong></div>
                    <div><span>Số ca đã báo</span><strong>{confirmRows.length}</strong></div>
                    {reporterName && <div><span>Người báo</span><strong>{reporterName}</strong></div>}
                </div>
                <button className="outline-btn" onClick={handleReset}>🔄 Báo thêm ca khác</button>
            </div>
        </PageShell>
    )

    return (
        <PageShell>
            {/* Header with logo */}
            <div className="app-header">
                <div className="bg-white rounded-lg shadow-sm w-[44px] h-[44px] overflow-hidden flex items-center justify-center shrink-0 border border-slate-100">
                    <IntersnackLogo className="w-9 h-9" />
                </div>
                <div>
                    <div className="app-title">Báo Cơm Nhà Máy</div>
                    <div className="app-sub">VICC Long An · Intersnack Cashew Vietnam</div>
                </div>
            </div>

            <div className="mode-tabs">
                <button className={`mode-tab ${pageMode === "report" ? "active" : ""}`} onClick={() => setPageMode("report")}>🍽️ Báo cơm</button>
                <button className={`mode-tab ${(pageMode as string) === "edit-ot" ? "active" : ""}`} onClick={() => { setPageMode("edit-ot"); resetOt() }}>⏰ Sửa OT</button>
                <button className={`mode-tab ${(pageMode as string) === "summary" ? "active" : ""}`} onClick={() => { setPageMode("summary" as PageMode); if (!sumLoaded) loadSummary(sumDate) }}>📊 Tổng hợp</button>
            </div>

            <form onSubmit={handlePreview}>
                <div className="section-label">📋 Thông tin ca làm việc</div>
                <div className="field-sm">
                    <label>Bộ phận <span className="req">*</span></label>
                    <select value={deptId} onChange={e => {
                        const newId = e.target.value
                        const newDept = depts.find(d => d.id === newId)
                        setDeptId(newId); setHpeelSub(""); setShift("")
                        if (newDept?.code === "BOILER") {
                            setMultiData({
                                "1": { ...blank("1"), officialPresent: "1" },
                                "2": { ...blank("2"), officialPresent: "1" },
                                "3": { ...blank("3"), officialPresent: "1" }
                            })
                        } else {
                            setMultiData({ "1": blank("1"), "2": blank("2"), "3": blank("3") })
                            setSingleData(blank())
                        }
                    }} required>
                        <option value="">— Chọn bộ phận —</option>
                        {depts.map(d => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                    </select>
                </div>
                {isHpeel && (
                    <div className="field-sm">
                        <label>Tổ trưởng <span className="req">*</span></label>
                        <HpeelPicker value={hpeelSub} onChange={v => {
                            setHpeelSub(v);
                            if (v === "HPEEL_LOAN") {
                                setShift("HC");
                                updateSingle("otTime", OT_DEFAULT_TIME["HC"] ?? "");
                            }
                        }} />
                    </div>
                )}
                {isMultiShift ? (
                    <>
                        <div className="field-sm">
                            <label>Ngày <span className="req">*</span></label>
                            <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} required />
                        </div>
                        <div className="info-banner">📌 Điền thông tin cho cả {activeMultiShifts.length} ca bên dưới</div>
                        {activeMultiShifts.map(s => (
                            <ShiftFields key={s} shiftLabel={`Ca ${s}`} shiftVal={s} data={multiData[s]} update={(f, v) => updateMulti(s, f, v)} />
                        ))}
                    </>
                ) : (
                    <>
                        <div className="row2" style={{ marginBottom: 14 }}>
                            <div className="field-sm">
                                <label>Ca làm <span className="req">*</span></label>
                                <ShiftPills value={shift} onChange={v => { setShift(v); updateSingle("otTime", OT_DEFAULT_TIME[v] ?? "") }} arr={shifts} />
                            </div>
                            <div className="field-sm">
                                <label>Ngày <span className="req">*</span></label>
                                <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} required />
                            </div>
                        </div>
                        <ShiftFields data={singleData} update={updateSingle} shiftVal={shift} />
                    </>
                )}

                <hr className="divider" />
                <div className="field-sm">
                    <label style={{ color: "#6b7280", fontSize: 13 }}>👤 Người báo <span className="opt-tag">tuỳ chọn</span></label>
                    <input type="text" placeholder="VD: Mai, Hùng, Tổ trưởng SHELL..." value={reporterName} onChange={e => setReporterName(e.target.value)} maxLength={60} />
                </div>

                {error && <div className="err-box">⚠️ {error}</div>}
                <button type="submit" className="primary-btn" disabled={!deptId || (!isMultiShift && !shift)}>
                    🔍 Xem lại & Xác nhận
                </button>
            </form>
        </PageShell>
    )
}

// ── Layout shells ──
function PageShell({ children, header }: { children: React.ReactNode; header?: { icon: string; title: string; sub: string } }) {
    return (
        <>
            <Style />
            <div className="page">
                {header && (
                    <div className="page-header">
                        <div className="page-header-icon">{header.icon}</div>
                        <div>
                            <div className="page-header-title">{header.title}</div>
                            <div className="page-header-sub">{header.sub}</div>
                        </div>
                    </div>
                )}
                <div className="content">{children}</div>
            </div>
        </>
    )
}

function Style() {
    return (
        <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            html, body { font-family: 'Inter', sans-serif; background: #f8fafc; color: #1e293b; }

            .page { min-height: 100dvh; padding-bottom: 48px; }
            .content { max-width: 480px; margin: 0 auto; padding: 16px; }

            /* App header with logo */
            .app-header {
                background: white; border-bottom: 1px solid #e2e8f0;
                padding: 16px; display: flex; align-items: center; gap: 14px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            }
            .header-logo-img { width: 44px; height: 44px; object-fit: contain; border-radius: 10px; }
            .app-title { font-size: 18px; font-weight: 800; color: #ea580c; }
            .app-sub { font-size: 12px; color: #64748b; font-weight: 500; }

            /* Page header (sub-pages) */
            .page-header {
                background: linear-gradient(135deg, #c2410c, #ea580c);
                padding: 18px 16px 20px; display: flex; align-items: flex-start; gap: 12px;
                color: white;
            }
            .page-header-icon { font-size: 28px; flex-shrink: 0; }
            .page-header-title { font-size: 20px; font-weight: 800; margin-bottom: 2px; }
            .page-header-sub { font-size: 13px; opacity: 0.85; }

            /* Mode tabs */
            .mode-tabs { display: flex; gap: 8px; margin: 16px 0 12px; }
            .mode-tab {
                flex: 1; padding: 11px 8px; border-radius: 10px;
                border: 1.5px solid #e2e8f0; background: white;
                font-size: 14px; font-weight: 600; font-family: inherit;
                cursor: pointer; color: #64748b;
                transition: all 0.15s; -webkit-tap-highlight-color: transparent;
            }
            .mode-tab.active { border-color: #f97316; background: #fff7ed; color: #c2410c; }

            /* Banners */
            .zalo-banner {
                background: #fffbeb; border: 1.5px solid #fde68a;
                border-radius: 10px; padding: 11px 14px;
                font-size: 14px; color: #92400e; line-height: 1.5; margin-bottom: 16px;
            }
            .info-banner {
                background: #eff6ff; border: 1.5px solid #bfdbfe;
                border-radius: 10px; padding: 10px 14px;
                font-size: 13px; color: #1d4ed8; margin-bottom: 12px;
            }

            /* Labels */
            .section-label {
                font-size: 11px; font-weight: 700; color: #ea580c;
                text-transform: uppercase; letter-spacing: 0.08em;
                margin: 18px 0 10px;
            }
            .subsection-label {
                font-size: 12px; font-weight: 700; color: #475569;
                margin-bottom: 8px; margin-top: 4px;
            }
            .req { color: #ef4444; margin-left: 2px; }
            .opt-tag { background: #f1f5f9; color: #94a3b8; border-radius: 5px; padding: 1px 6px; font-size: 11px; font-weight: 600; margin-left: 6px; }

            /* Fields */
            .field-sm { margin-bottom: 12px; }
            .field-sm > label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 5px; }
            .field-sm select, .field-sm input[type="date"],
            .field-sm input[type="number"], .field-sm input[type="text"] {
                width: 100%; padding: 12px 14px;
                border: 1.5px solid #e2e8f0; border-radius: 10px;
                font-size: 16px; font-family: inherit;
                background: white; color: #1e293b; outline: none;
                -webkit-appearance: none; appearance: none;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .field-sm select:focus, .field-sm input:focus {
                border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.12);
            }
            .field-sm input[type="number"]::-webkit-inner-spin-button { opacity: 1; }

            .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

            /* Shift pills */
            .shift-pills { display: flex; gap: 8px; flex-wrap: wrap; }
            .shift-pill { flex: 1; min-width: 52px; padding: 11px 6px; border: 1.5px solid #e2e8f0; border-radius: 10px; background: white; color: #374151; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; -webkit-tap-highlight-color: transparent; text-align: center; }
            .shift-pill.active { border-color: #f97316; background: #fff7ed; color: #c2410c; }

            /* HPEEL radio */
            .radio-group { display: flex; flex-direction: column; gap: 8px; }
            .radio-btn { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 10px; border: 1.5px solid #e2e8f0; background: white; cursor: pointer; font-size: 14px; font-weight: 500; color: #374151; transition: all 0.15s; }
            .radio-btn.active { border-color: #f97316; background: #fff7ed; color: #c2410c; font-weight: 700; }
            .radio-btn input { display: none; }

            /* Shift block */
            .shift-block { background: #f8fafc; padding: 10px; border-radius: 10px; margin-bottom: 10px; border: 1px solid #e2e8f0; }
            .shift-block-label { font-weight: 700; color: #1e293b; margin-bottom: 8px; font-size: 14px; }

            /* Vegetarian breakdown */
            .breakdown-box { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px; margin: 8px 0 4px; }
            .breakdown-total { font-size: 13px; color: #475569; margin-bottom: 8px; }
            .breakdown-total strong { color: #1e293b; font-size: 15px; }
            .breakdown-row { display: flex; align-items: center; gap: 8px; }
            .breakdown-item { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
            .breakdown-item span { font-size: 12px; color: #64748b; font-weight: 600; }
            .breakdown-item.man strong { font-size: 28px; font-weight: 800; color: #dc2626; }
            .breakdown-item.chay strong { font-size: 14px; font-weight: 700; color: #16a34a; }
            .chay-input { width: 72px !important; padding: 8px 10px !important; font-size: 16px !important; text-align: center; border: 1.5px solid #86efac !important; border-radius: 8px !important; background: white !important; }
            .chay-input:focus { border-color: #16a34a !important; box-shadow: 0 0 0 3px rgba(22,163,74,0.12) !important; }
            .breakdown-sep { color: #94a3b8; font-weight: 700; font-size: 18px; }
            .breakdown-warn { color: #dc2626; font-size: 12px; margin-top: 6px; }

            /* OT breakdown */
            .ot-breakdown { background: #fff7ed; border: 1.5px solid #fed7aa; border-radius: 10px; padding: 10px 12px; margin: 4px 0 8px; font-size: 14px; color: #374151; }
            .ot-breakdown strong { color: #c2410c; }
            .dot { margin: 0 6px; color: #94a3b8; }
            .ot-time-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; }
            .time-input { width: 110px !important; padding: 7px 10px !important; font-size: 15px !important; border: 1.5px solid #fed7aa !important; border-radius: 8px !important; }

            .divider { border: none; border-top: 1px dashed #e2e8f0; margin: 18px 0 12px; }

            /* Buttons */
            .primary-btn { width: 100%; padding: 15px; background: linear-gradient(135deg, #c2410c, #f97316); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; font-family: inherit; cursor: pointer; margin-top: 16px; box-shadow: 0 3px 12px rgba(249,115,22,0.3); transition: opacity 0.2s, transform 0.1s; -webkit-tap-highlight-color: transparent; }
            .primary-btn:active { transform: scale(0.98); }
            .primary-btn:disabled { background: #cbd5e1; box-shadow: none; cursor: not-allowed; color: #94a3b8; }
            .ghost-btn { width: 100%; padding: 13px; background: white; color: #64748b; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer; margin-top: 10px; -webkit-tap-highlight-color: transparent; }
            .outline-btn { padding: 13px 28px; border-radius: 12px; background: white; border: 2px solid #f97316; color: #ea580c; font-size: 15px; font-weight: 700; font-family: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }

            /* Error */
            .err-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 11px 14px; color: #dc2626; font-size: 14px; margin-top: 12px; }

            /* Confirm */
            .confirm-meta-card { background: white; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
            .confirm-meta-card > div { display: flex; justify-content: space-between; align-items: center; font-size: 14px; padding: 5px 0; border-bottom: 1px solid #f8fafc; }
            .confirm-meta-card > div:last-child { border-bottom: none; }
            .confirm-meta-card span { color: #64748b; }
            .confirm-meta-card strong { color: #1e293b; font-weight: 700; }
            .confirm-shift-card { background: white; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 10px; }
            .confirm-shift-title { font-size: 15px; font-weight: 800; color: #c2410c; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1.5px solid #f1f5f9; }
            .confirm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .cg-item { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
            .cg-item span { color: #64748b; }
            .cg-item b { color: #1e293b; font-size: 16px; }
            .contact-note { background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 10px; padding: 11px 14px; font-size: 13px; color: #15803d; margin: 14px 0 4px; }
            .info-row { font-size: 14px; color: #374151; background: #f8fafc; border-radius: 8px; padding: 10px 12px; margin: 8px 0; }

            /* OT compare */
            .current-ot-card { background: white; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 8px; }
            .current-ot-title { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
            .ot-stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
            .ot-stat { text-align: center; }
            .ot-stat span { display: block; font-size: 12px; color: #64748b; margin-bottom: 4px; }
            .ot-stat strong { font-size: 28px; font-weight: 800; color: #c2410c; }
            .compare-card { background: white; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 12px; }
            .compare-col { flex: 1; text-align: center; }
            .compare-col.old .compare-val { color: #dc2626; }
            .compare-col.new .compare-val { color: #16a34a; }
            .compare-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; }
            .compare-arrow { font-size: 24px; color: #f97316; font-weight: 800; padding: 0 8px; }
            .compare-val { font-size: 32px; font-weight: 800; line-height: 1.2; }
            .compare-val small { font-size: 13px; font-weight: 600; color: #94a3b8; }
            .compare-sub { font-size: 13px; color: #475569; margin-top: 4px; }
            .compare-col { display: flex; flex-direction: column; align-items: center; }
            .compare-card { display: flex; align-items: center; justify-content: space-around; }

            /* Success */
            .success-page { display: flex; flex-direction: column; align-items: center; padding: 32px 16px 48px; text-align: center; }
            .page-logo { width: 56px; height: 56px; object-fit: contain; margin-bottom: 16px; border-radius: 12px; }
            .success-icon { font-size: 64px; margin-bottom: 12px; animation: pop 0.4s ease; }
            @keyframes pop { 0% { transform: scale(0.5); opacity: 0; } 80% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
            .success-title { font-size: 24px; font-weight: 800; color: #16a34a; margin-bottom: 8px; }
            .success-sub { color: #475569; font-size: 15px; line-height: 1.7; margin-bottom: 20px; }
            .success-card { background: white; border: 1.5px solid #bbf7d0; border-radius: 14px; padding: 16px 20px; text-align: left; width: 100%; max-width: 340px; margin-bottom: 16px; }
            .success-card > div { display: flex; justify-content: space-between; align-items: center; font-size: 14px; padding: 5px 0; border-bottom: 1px solid #f8fafc; }
            .success-card > div:last-child { border-bottom: none; }
            .success-card span { color: #64748b; }
            .success-card strong { color: #15803d; font-weight: 700; }
            .zalo-banner { background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 11px 14px; font-size: 14px; color: #92400e; width: 100%; max-width: 340px; margin-bottom: 20px; }

            /* Loading */
            .loading-screen { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8fafc; gap: 16px; }
            .logo-spin { width: 56px; height: 56px; object-fit: contain; animation: spin 1.2s linear infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
            .loading-text { font-size: 15px; font-weight: 600; color: #64748b; }

            /* Summary */
            .sum-date-row { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 16px; }
            .load-btn { padding: 12px 18px; background: linear-gradient(135deg, #c2410c, #f97316); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; font-family: inherit; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
            .load-btn:disabled { background: #cbd5e1; cursor: not-allowed; }
            .sum-empty { text-align: center; padding: 32px 16px; color: #94a3b8; font-size: 15px; background: white; border-radius: 12px; border: 1.5px dashed #e2e8f0; }
            .kpi-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 16px; }
            .kpi-card { background: white; border-radius: 12px; padding: 14px 10px; text-align: center; border: 1.5px solid #e2e8f0; }
            .kpi-card.orange { border-color: #fed7aa; background: #fff7ed; }
            .kpi-card.blue   { border-color: #bfdbfe; background: #eff6ff; }
            .kpi-card.green  { border-color: #bbf7d0; background: #f0fdf4; }
            .kpi-val { font-size: 30px; font-weight: 800; color: #1e293b; line-height: 1.1; }
            .kpi-card.orange .kpi-val { color: #c2410c; }
            .kpi-card.blue   .kpi-val { color: #1d4ed8; }
            .kpi-card.green  .kpi-val { color: #15803d; }
            .kpi-label { font-size: 12px; font-weight: 600; color: #64748b; margin-top: 4px; }
            .sum-table-wrap { overflow-x: auto; border-radius: 12px; border: 1.5px solid #e2e8f0; margin-bottom: 14px; }
            .sum-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .sum-table thead tr { background: #f1f5f9; }
            .sum-table th { padding: 10px 8px; font-weight: 700; color: #475569; text-align: center; border-bottom: 1.5px solid #e2e8f0; white-space: nowrap; }
            .sum-table th:first-child { text-align: left; padding-left: 12px; }
            .sum-table td { padding: 9px 8px; text-align: center; border-bottom: 1px solid #f1f5f9; color: #374151; }
            .sum-table tbody tr:last-child td { border-bottom: none; }
            .sum-table tbody tr:hover { background: #f8fafc; }
            .td-dept { text-align: left !important; padding-left: 12px !important; font-weight: 600; color: #1e293b !important; font-size: 12px; max-width: 100px; }
            .td-ca { font-weight: 700; color: #ea580c !important; }
            .td-malan { color: #dc2626 !important; font-weight: 700; }
            .td-chay  { color: #16a34a !important; font-weight: 700; }
            .td-ot { color: #7c3aed !important; font-weight: 700; }
            .sum-total-row td { background: #f1f5f9; font-weight: 800; font-size: 13px; padding: 10px 8px; color: #1e293b; }
            .sum-total-row td:first-child { padding-left: 12px; }
            .sum-note { font-size: 13px; color: #64748b; text-align: center; margin-top: 8px; }
        `}</style>
    )
}
