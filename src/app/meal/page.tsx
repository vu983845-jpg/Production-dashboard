"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"

interface Dept { id: string; code: string; name_en: string }

const MULTI_SHIFT_CODES = new Set(["QC", "BOILER"])

const HPEEL_SUBGROUPS = [
    { key: "HPEEL_LIEN",    label: "Tổ Liên",          dept_name: "Manual Peeling (Liên)" },
    { key: "HPEEL_DUNG",    label: "Tổ Dung",           dept_name: "Manual Peeling (Dung)" },
    { key: "HPEEL_GRADING", label: "Ms Huệ (Grading)",  dept_name: "Manual Grading (Ms Huệ)" },
]

const SHIFTS_NORMAL  = [{ value: "1", label: "Ca 1" }, { value: "2", label: "Ca 2" }, { value: "3", label: "Ca 3" }]
const SHIFTS_WITH_HC = [...SHIFTS_NORMAL, { value: "HC", label: "HC" }]
const MULTI_SHIFTS   = ["1", "2", "3"]

interface ShiftData {
    officialPresent: string; seasonalPresent: string; officialAbsent: string
    seasonalAbsent: string; otCount: string; vegetarian: string; otVegetarian: string
}
const blank = (): ShiftData => ({
    officialPresent: "", seasonalPresent: "", officialAbsent: "",
    seasonalAbsent: "", otCount: "", vegetarian: "", otVegetarian: "",
})

interface ConfirmRow {
    department_id: string; department_name: string; work_date: string; shift: string
    official_present: number; seasonal_present: number; official_absent: number
    seasonal_absent: number; ot_count: number; vegetarian: number; ot_vegetarian: number
    reporter_name: string
}

// ─── OT Edit types ───
interface OTRecord { ot_count: number; ot_vegetarian: number; official_present: number; seasonal_present: number; vegetarian: number }

type PageMode = "report" | "edit-ot"
type OTStep  = "select" | "lookup" | "edit" | "confirm" | "done"

export default function PublicMealPage() {
    const [depts, setDepts]       = useState<Dept[]>([])
    const [loading, setLoading]   = useState(true)
    const [pageMode, setPageMode] = useState<PageMode>("report")

    // ── Report mode state ──
    const [deptId, setDeptId]         = useState("")
    const [hpeelSub, setHpeelSub]     = useState("")
    const [shift, setShift]           = useState("")
    const [workDate, setWorkDate]     = useState(format(new Date(), "yyyy-MM-dd"))
    const [reporterName, setReporterName] = useState("")
    const [singleData, setSingleData] = useState<ShiftData>(blank())
    const [multiData, setMultiData]   = useState<Record<string, ShiftData>>({ "1": blank(), "2": blank(), "3": blank() })
    const [confirmRows, setConfirmRows] = useState<ConfirmRow[]>([])
    const [showConfirm, setShowConfirm] = useState(false)
    const [success, setSuccess]       = useState(false)
    const [error, setError]           = useState("")
    const [submitting, setSubmitting] = useState(false)

    // ── OT Edit mode state ──
    const [otStep, setOtStep]           = useState<OTStep>("select")
    const [otDeptId, setOtDeptId]       = useState("")
    const [otHpeelSub, setOtHpeelSub]   = useState("")
    const [otShift, setOtShift]         = useState("")
    const [otDate, setOtDate]           = useState(format(new Date(), "yyyy-MM-dd"))
    const [otRecord, setOtRecord]       = useState<OTRecord | null>(null)
    const [otNewCount, setOtNewCount]   = useState("")
    const [otNewVeg, setOtNewVeg]       = useState("")
    const [otNotFound, setOtNotFound]   = useState(false)
    const [otLooking, setOtLooking]     = useState(false)
    const [otSubmitting, setOtSubmitting] = useState(false)
    const [otError, setOtError]         = useState("")

    useEffect(() => {
        fetch("/api/public-meal")
            .then(r => r.json())
            .then(d => { setDepts(d.depts || []); setLoading(false) })
            .catch(() => { setLoading(false) })
    }, [])

    // ── Helpers ──
    const selectedDept = depts.find(d => d.id === deptId)
    const isMultiShift = !!(selectedDept && MULTI_SHIFT_CODES.has(selectedDept.code))
    const isHpeel      = selectedDept?.code === "HPEEL"
    const isOffice     = selectedDept?.code === "OFFICE"
    const shifts       = isOffice ? SHIFTS_WITH_HC : SHIFTS_NORMAL

    const otSelectedDept = depts.find(d => d.id === otDeptId)
    const isOtHpeel      = otSelectedDept?.code === "HPEEL"
    const isOtOffice     = otSelectedDept?.code === "OFFICE"
    const otShifts       = isOtOffice ? SHIFTS_WITH_HC : SHIFTS_NORMAL

    const getEffectiveDeptName = (id = deptId, sub = hpeelSub) => {
        const dept = depts.find(d => d.id === id)
        if (dept?.code === "HPEEL" && sub)
            return HPEEL_SUBGROUPS.find(s => s.key === sub)?.dept_name ?? dept.name_en
        return dept?.name_en ?? ""
    }

    const toNum = (s: string) => s.trim() === "" ? 0 : Number(s)

    const buildRow = (data: ShiftData, shiftVal: string): ConfirmRow => ({
        department_id: deptId, department_name: getEffectiveDeptName(),
        work_date: workDate, shift: shiftVal,
        official_present: toNum(data.officialPresent), seasonal_present: toNum(data.seasonalPresent),
        official_absent: toNum(data.officialAbsent),   seasonal_absent: toNum(data.seasonalAbsent),
        ot_count: toNum(data.otCount), vegetarian: toNum(data.vegetarian),
        ot_vegetarian: toNum(data.otVegetarian), reporter_name: reporterName.trim(),
    })

    // ── Report mode handlers ──
    const handlePreview = (e: React.FormEvent) => {
        e.preventDefault(); setError("")
        if (!deptId) { setError("Vui lòng chọn bộ phận"); return }
        if (isHpeel && !hpeelSub) { setError("Vui lòng chọn tổ trưởng Hand Peeling"); return }
        if (!isMultiShift && !shift) { setError("Vui lòng chọn ca làm việc"); return }
        const rows = isMultiShift ? MULTI_SHIFTS.map(s => buildRow(multiData[s], s)) : [buildRow(singleData, shift)]
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
        setSingleData(blank()); setMultiData({ "1": blank(), "2": blank(), "3": blank() })
        setConfirmRows([])
    }

    // ── OT edit handlers ──
    const handleOtLookup = async () => {
        if (!otDeptId || !otShift) { setOtError("Vui lòng chọn bộ phận và ca"); return }
        if (isOtHpeel && !otHpeelSub) { setOtError("Vui lòng chọn tổ trưởng"); return }
        setOtLooking(true); setOtError(""); setOtNotFound(false); setOtRecord(null)
        const deptName = getEffectiveDeptName(otDeptId, otHpeelSub)
        const url = `/api/public-meal?dept_id=${otDeptId}&work_date=${otDate}&shift=${otShift}&dept_name=${encodeURIComponent(deptName)}`
        const res = await fetch(url)
        const data = await res.json()
        setOtLooking(false)
        if (!data.record) { setOtNotFound(true); return }
        setOtRecord(data.record)
        setOtNewCount(String(data.record.ot_count ?? 0))
        setOtNewVeg(String(data.record.ot_vegetarian ?? 0))
        setOtStep("edit")
    }

    const handleOtConfirmStep = () => { setOtError(""); setOtStep("confirm") }

    const handleOtSubmit = async () => {
        setOtSubmitting(true); setOtError("")
        const deptName = getEffectiveDeptName(otDeptId, otHpeelSub)
        const payload = {
            department_id: otDeptId, department_name: deptName,
            work_date: otDate, shift: otShift,
            official_present: otRecord?.official_present ?? 0,
            seasonal_present: otRecord?.seasonal_present ?? 0,
            official_absent: 0, seasonal_absent: 0,
            vegetarian: otRecord?.vegetarian ?? 0,
            ot_count: toNum(otNewCount),
            ot_vegetarian: toNum(otNewVeg),
            reporter_name: "",
        }
        const res = await fetch("/api/public-meal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([payload]) })
        const data = await res.json()
        setOtSubmitting(false)
        if (data.success) { setOtStep("done") }
        else { setOtError(data.error || "Có lỗi, thử lại"); setOtStep("edit") }
    }

    const resetOt = () => {
        setOtStep("select"); setOtDeptId(""); setOtHpeelSub(""); setOtShift("")
        setOtRecord(null); setOtNewCount(""); setOtNewVeg(""); setOtNotFound(false); setOtError("")
    }

    const updateMulti = (shiftKey: string, field: keyof ShiftData, val: string) =>
        setMultiData(prev => ({ ...prev, [shiftKey]: { ...prev[shiftKey], [field]: val } }))
    const updateSingle = (field: keyof ShiftData, val: string) =>
        setSingleData(prev => ({ ...prev, [field]: val }))

    // ── Sub-components ──
    const NumInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
        <div className="field">
            <label>{label}</label>
            <input type="number" min="0" max="999" placeholder="0" value={value} onChange={e => onChange(e.target.value)} />
        </div>
    )

    const ShiftFields = ({ data, update, shiftLabel }: { data: ShiftData; update: (f: keyof ShiftData, v: string) => void; shiftLabel?: string }) => (
        <div className="shift-block">
            {shiftLabel && <div className="shift-block-label">{shiftLabel}</div>}
            <div className="row2">
                <NumInput label="👤 Chính thức" value={data.officialPresent} onChange={v => update("officialPresent", v)} />
                <NumInput label="👥 Thời vụ"    value={data.seasonalPresent} onChange={v => update("seasonalPresent", v)} />
            </div>
            <div className="row2">
                <NumInput label="❌ CT vắng" value={data.officialAbsent} onChange={v => update("officialAbsent", v)} />
                <NumInput label="❌ TV vắng" value={data.seasonalAbsent} onChange={v => update("seasonalAbsent", v)} />
            </div>
            <div className="row3">
                <NumInput label="⏰ OT mặn"  value={data.otCount}       onChange={v => update("otCount", v)} />
                <NumInput label="🥬 OT chay"  value={data.otVegetarian}  onChange={v => update("otVegetarian", v)} />
                <NumInput label="🌿 Ăn chay"  value={data.vegetarian}    onChange={v => update("vegetarian", v)} />
            </div>
        </div>
    )

    const HpeelPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <div className="field hpeel-box">
            <label>Tổ trưởng <span className="required">*</span></label>
            <div className="radio-group">
                {HPEEL_SUBGROUPS.map(sg => (
                    <label key={sg.key} className={`radio-btn ${value === sg.key ? "active" : ""}`}>
                        <input type="radio" name="hpeel_sub" value={sg.key} checked={value === sg.key} onChange={() => onChange(sg.key)} />
                        {sg.label}
                    </label>
                ))}
            </div>
        </div>
    )

    const ShiftPills = ({ value, onChange, shiftsArr }: { value: string; onChange: (v: string) => void; shiftsArr: typeof SHIFTS_NORMAL }) => (
        <div className="shift-pills">
            {shiftsArr.map(s => (
                <button key={s.value} type="button" className={`shift-pill ${value === s.value ? "active" : ""}`} onClick={() => onChange(s.value)}>
                    {s.label}
                </button>
            ))}
        </div>
    )

    if (loading) return (
        <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff7ed" }}>
            <div style={{ textAlign: "center", color: "#f97316" }}>
                <div style={{ fontSize: 48 }}>🍽️</div>
                <div style={{ fontWeight: 600, marginTop: 10 }}>Đang tải...</div>
            </div>
        </div>
    )

    // ─────────────────── OT EDIT SCREENS ───────────────────
    if (pageMode === "edit-ot") {

        // Done
        if (otStep === "done") return (
            <>
                <Style />
                <div className="success-page">
                    <div className="success-icon">✅</div>
                    <div className="success-title">Đã cập nhật OT!</div>
                    <p className="success-sub">
                        OT đã được điều chỉnh thành công.<br />
                        <span style={{ fontSize: 13, color: "#6b7280" }}>Sai sót liên hệ <strong>Ms Chi</strong> nhé!</span>
                    </p>
                    <div className="success-detail">
                        <div><strong>Bộ phận:</strong> {getEffectiveDeptName(otDeptId, otHpeelSub)}</div>
                        <div><strong>Ngày:</strong> {format(new Date(otDate + "T00:00:00"), "dd/MM/yyyy")}</div>
                        <div><strong>Ca:</strong> Ca {otShift}</div>
                        <div><strong>OT mặn mới:</strong> {otNewCount}</div>
                        <div><strong>OT chay mới:</strong> {otNewVeg}</div>
                    </div>
                    <button className="again-btn" onClick={resetOt}>🔄 Sửa OT ca khác</button>
                    <button className="back-btn" style={{ marginTop: 12, maxWidth: 260 }} onClick={() => { resetOt(); setPageMode("report") }}>
                        🏠 Về trang báo cơm
                    </button>
                </div>
            </>
        )

        // Confirm OT
        if (otStep === "confirm") return (
            <>
                <Style />
                <div className="page">
                    <div className="header" style={{ paddingBottom: 32 }}>
                        <div className="header-logo">🔍</div>
                        <div className="header-title">Xác nhận chỉnh sửa OT</div>
                        <div className="header-sub">Kiểm tra trước khi lưu</div>
                    </div>
                    <div className="form-wrap">
                        <div className="confirm-meta">
                            <div><strong>Bộ phận:</strong> {getEffectiveDeptName(otDeptId, otHpeelSub)}</div>
                            <div><strong>Ngày:</strong> {format(new Date(otDate + "T00:00:00"), "dd/MM/yyyy")}</div>
                            <div><strong>Ca:</strong> Ca {otShift}</div>
                        </div>
                        <div className="ot-compare-box">
                            <div className="ot-compare-row">
                                <div className="ot-compare-col">
                                    <div className="ot-col-label">⏰ OT Cũ</div>
                                    <div className="ot-old-val">{otRecord?.ot_count ?? 0} <span>mặn</span></div>
                                    <div className="ot-old-val">{otRecord?.ot_vegetarian ?? 0} <span>chay</span></div>
                                </div>
                                <div className="ot-arrow">→</div>
                                <div className="ot-compare-col">
                                    <div className="ot-col-label">✨ OT Mới</div>
                                    <div className="ot-new-val">{otNewCount || 0} <span>mặn</span></div>
                                    <div className="ot-new-val">{otNewVeg || 0} <span>chay</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="confirm-note">📞 Có sai sót liên hệ <strong>Ms Chi</strong> để điều chỉnh nhé!</div>
                        {otError && <div className="error-box"><span>⚠️</span> {otError}</div>}
                        <button className="submit-btn" onClick={handleOtSubmit} disabled={otSubmitting}>
                            {otSubmitting ? "⏳ Đang lưu..." : "✅ Xác nhận cập nhật OT"}
                        </button>
                        <button className="back-btn" onClick={() => setOtStep("edit")} disabled={otSubmitting}>✏️ Sửa lại</button>
                    </div>
                </div>
            </>
        )

        // Edit OT inputs
        if (otStep === "edit") return (
            <>
                <Style />
                <div className="page">
                    <div className="header" style={{ paddingBottom: 32 }}>
                        <div className="header-logo">⏰</div>
                        <div className="header-title">Chỉnh sửa OT</div>
                        <div className="header-sub">{getEffectiveDeptName(otDeptId, otHpeelSub)} — Ca {otShift} — {format(new Date(otDate + "T00:00:00"), "dd/MM/yyyy")}</div>
                    </div>
                    <div className="form-wrap">
                        {/* Current values */}
                        <div className="ot-current-box">
                            <div className="ot-current-label">📋 OT đã báo</div>
                            <div className="ot-current-row">
                                <div className="ot-current-cell">
                                    <span>OT mặn</span>
                                    <strong>{otRecord?.ot_count ?? 0}</strong>
                                </div>
                                <div className="ot-current-cell">
                                    <span>OT chay</span>
                                    <strong>{otRecord?.ot_vegetarian ?? 0}</strong>
                                </div>
                                <div className="ot-current-cell">
                                    <span>Tổng OT</span>
                                    <strong>{(otRecord?.ot_count ?? 0) + (otRecord?.ot_vegetarian ?? 0)}</strong>
                                </div>
                            </div>
                        </div>

                        <div className="section-label" style={{ marginTop: 20 }}>✏️ Nhập OT mới</div>
                        <div className="row2">
                            <div className="field">
                                <label>OT mặn mới</label>
                                <input type="number" min="0" max="999" placeholder="0" value={otNewCount} onChange={e => setOtNewCount(e.target.value)} />
                            </div>
                            <div className="field">
                                <label>OT chay mới</label>
                                <input type="number" min="0" max="999" placeholder="0" value={otNewVeg} onChange={e => setOtNewVeg(e.target.value)} />
                            </div>
                        </div>
                        <div className="ot-total-preview">
                            Tổng OT mới: <strong>{toNum(otNewCount) + toNum(otNewVeg)} phần</strong>
                        </div>
                        {otError && <div className="error-box"><span>⚠️</span> {otError}</div>}
                        <button className="submit-btn" onClick={handleOtConfirmStep}>🔍 Xem lại & Xác nhận</button>
                        <button className="back-btn" onClick={() => setOtStep("select")}>← Chọn lại ca</button>
                    </div>
                </div>
            </>
        )

        // Lookup / select step
        return (
            <>
                <Style />
                <div className="page">
                    <div className="header" style={{ paddingBottom: 32 }}>
                        <div className="header-logo">⏰</div>
                        <div className="header-title">Chỉnh sửa OT</div>
                        <div className="header-sub">Chọn bộ phận và ca cần sửa OT</div>
                    </div>
                    <div className="form-wrap">
                        <div className="field">
                            <label>Bộ phận <span className="required">*</span></label>
                            <select value={otDeptId} onChange={e => { setOtDeptId(e.target.value); setOtHpeelSub(""); setOtShift("") }}>
                                <option value="">— Chọn bộ phận —</option>
                                {depts.map(d => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                            </select>
                        </div>
                        {isOtHpeel && <HpeelPicker value={otHpeelSub} onChange={setOtHpeelSub} />}
                        <div className="field">
                            <label>Ca <span className="required">*</span></label>
                            <ShiftPills value={otShift} onChange={setOtShift} shiftsArr={otShifts} />
                        </div>
                        <div className="field">
                            <label>Ngày <span className="required">*</span></label>
                            <input type="date" value={otDate} onChange={e => setOtDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} />
                        </div>
                        {otNotFound && (
                            <div className="error-box">⚠️ Không tìm thấy bản ghi báo cơm. Hãy kiểm tra lại bộ phận, ca, ngày.</div>
                        )}
                        {otError && <div className="error-box"><span>⚠️</span> {otError}</div>}
                        <button className="submit-btn" onClick={handleOtLookup} disabled={otLooking || !otDeptId || !otShift}>
                            {otLooking ? "⏳ Đang tìm..." : "🔍 Tìm dữ liệu OT hiện tại"}
                        </button>
                        <button className="back-btn" onClick={() => { setPageMode("report"); resetOt() }}>← Về trang báo cơm</button>
                    </div>
                </div>
            </>
        )
    }

    // ─────────────────── REPORT MODE ───────────────────

    // Confirm screen
    if (showConfirm) return (
        <>
            <Style />
            <div className="page">
                <div className="header" style={{ paddingBottom: 32 }}>
                    <div className="header-logo">🔍</div>
                    <div className="header-title">Xác nhận báo cơm</div>
                    <div className="header-sub">Kiểm tra lại thông tin trước khi gửi</div>
                </div>
                <div className="form-wrap">
                    <div className="confirm-meta">
                        <div><strong>Bộ phận:</strong> {getEffectiveDeptName()}</div>
                        <div><strong>Ngày:</strong> {format(new Date(workDate + "T00:00:00"), "dd/MM/yyyy")}</div>
                        {reporterName && <div><strong>Người báo:</strong> {reporterName}</div>}
                    </div>
                    {confirmRows.map((r, i) => (
                        <div key={i} className="confirm-row">
                            <div className="confirm-shift-label">Ca {r.shift}</div>
                            <div className="confirm-grid">
                                <div className="confirm-cell"><span>CT Hiện diện</span><strong>{r.official_present}</strong></div>
                                <div className="confirm-cell"><span>TV Hiện diện</span><strong>{r.seasonal_present}</strong></div>
                                <div className="confirm-cell"><span>CT Vắng</span><strong>{r.official_absent}</strong></div>
                                <div className="confirm-cell"><span>TV Vắng</span><strong>{r.seasonal_absent}</strong></div>
                                <div className="confirm-cell"><span>OT mặn</span><strong>{r.ot_count}</strong></div>
                                <div className="confirm-cell"><span>OT chay</span><strong>{r.ot_vegetarian}</strong></div>
                                <div className="confirm-cell"><span>Ăn chay</span><strong>{r.vegetarian}</strong></div>
                            </div>
                        </div>
                    ))}
                    {error && <div className="error-box"><span>⚠️</span> {error}</div>}
                    <div className="confirm-note">📞 Có sai sót liên hệ <strong>Ms Chi</strong> để điều chỉnh nhé!</div>
                    <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? "⏳ Đang gửi..." : "✅ Xác nhận & Gửi báo cơm"}
                    </button>
                    <button className="back-btn" onClick={() => setShowConfirm(false)} disabled={submitting}>✏️ Sửa lại</button>
                </div>
            </div>
        </>
    )

    // Success screen
    if (success) return (
        <>
            <Style />
            <div className="success-page">
                <div className="success-icon">✅</div>
                <div className="success-title">Đã báo cơm thành công!</div>
                <p className="success-sub">
                    Cảm ơn bạn đã báo cơm! 🙏<br />
                    <span style={{ fontSize: 13, color: "#6b7280" }}>Sai sót liên hệ <strong>Ms Chi</strong> nhé!</span>
                </p>
                <div className="success-detail">
                    <div><strong>Bộ phận:</strong> {getEffectiveDeptName()}</div>
                    <div><strong>Ngày:</strong> {format(new Date(workDate + "T00:00:00"), "dd/MM/yyyy")}</div>
                    <div><strong>Số ca đã báo:</strong> {confirmRows.length}</div>
                    {reporterName && <div><strong>Người báo:</strong> {reporterName}</div>}
                </div>
                <div className="zalo-note">💬 Nhớ báo <strong>dự trù cơm</strong> trên nhóm Zalo nha mọi người!</div>
                <button className="again-btn" onClick={handleReset}>🔄 Báo thêm ca khác</button>
            </div>
        </>
    )

    // Main form
    return (
        <>
            <Style />
            <div className="page">
                <div className="header">
                    <div className="header-logo">🍽️</div>
                    <div className="header-title">Báo Cơm Nhà Máy</div>
                    <div className="header-sub">VICC Long An — Intersnack Cashew Vietnam</div>
                </div>
                <div className="form-wrap">
                    {/* Mode toggle */}
                    <div className="mode-tabs">
                        <button className={`mode-tab ${pageMode === "report" ? "active" : ""}`} onClick={() => setPageMode("report")}>
                            🍽️ Báo cơm
                        </button>
                        <button className={`mode-tab ${pageMode === "edit-ot" ? "active" : ""}`} onClick={() => { setPageMode("edit-ot"); resetOt() }}>
                            ⏰ Sửa OT
                        </button>
                    </div>

                    <div className="zalo-note-top">
                        💬 Mọi người báo <strong>dự trù cơm</strong> trên nhóm <strong>Zalo</strong> giúp em nha!
                    </div>

                    <form onSubmit={handlePreview}>
                        <div className="section-label">📋 Thông tin ca làm việc</div>
                        <div className="field">
                            <label>Bộ phận <span className="required">*</span></label>
                            <select value={deptId} onChange={e => { setDeptId(e.target.value); setHpeelSub(""); setShift("") }} required>
                                <option value="">— Chọn bộ phận —</option>
                                {depts.map(d => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                            </select>
                        </div>
                        {isHpeel && <HpeelPicker value={hpeelSub} onChange={setHpeelSub} />}

                        {isMultiShift ? (
                            <>
                                <div className="field">
                                    <label>Ngày <span className="required">*</span></label>
                                    <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} required />
                                </div>
                                <div className="multi-shift-note">📌 Điền thông tin cho cả 3 ca bên dưới</div>
                                {MULTI_SHIFTS.map(s => (
                                    <ShiftFields key={s} shiftLabel={`Ca ${s}`} data={multiData[s]} update={(f, v) => updateMulti(s, f, v)} />
                                ))}
                            </>
                        ) : (
                            <>
                                <div className="row2">
                                    <div className="field">
                                        <label>Ca làm <span className="required">*</span></label>
                                        <ShiftPills value={shift} onChange={setShift} shiftsArr={shifts} />
                                    </div>
                                    <div className="field">
                                        <label>Ngày <span className="required">*</span></label>
                                        <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} required />
                                    </div>
                                </div>
                                <ShiftFields data={singleData} update={updateSingle} />
                            </>
                        )}

                        <hr className="divider" />
                        <div className="section-label">👤 Người báo cơm <span className="optional-tag">Tuỳ chọn</span></div>
                        <div className="field">
                            <input type="text" placeholder="VD: Mai, Hùng, Tổ trưởng SHELL..." value={reporterName} onChange={e => setReporterName(e.target.value)} maxLength={60} />
                        </div>

                        {error && <div className="error-box"><span>⚠️</span> {error}</div>}
                        <button type="submit" className="submit-btn" disabled={!deptId || (!isMultiShift && !shift)}>
                            🔍 Xem lại & Xác nhận
                        </button>
                    </form>
                </div>
            </div>
        </>
    )
}

function Style() {
    return (
        <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', sans-serif; background: #fff7ed; }
            .page { min-height: 100dvh; padding-bottom: 48px; }

            .header {
                background: linear-gradient(135deg, #c2410c 0%, #ea580c 50%, #f97316 100%);
                padding: 20px 20px 32px; color: #fff; position: relative; overflow: hidden;
            }
            .header::after {
                content: ''; position: absolute; bottom: -20px; left: 0; right: 0;
                height: 40px; background: #fff7ed; border-radius: 50% 50% 0 0 / 100% 100% 0 0;
            }
            .header-logo { font-size: 32px; margin-bottom: 4px; }
            .header-title { font-size: 22px; font-weight: 800; margin-bottom: 2px; }
            .header-sub { font-size: 13px; opacity: 0.85; font-weight: 500; }

            .form-wrap { padding: 16px 16px 0; max-width: 480px; margin: 0 auto; }

            /* Mode tabs */
            .mode-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
            .mode-tab {
                flex: 1; padding: 12px 8px; border-radius: 12px;
                border: 1.5px solid #fed7aa; background: #fff;
                font-size: 15px; font-weight: 600; font-family: inherit;
                cursor: pointer; transition: all 0.15s; -webkit-tap-highlight-color: transparent;
                color: #6b7280;
            }
            .mode-tab.active { border-color: #f97316; background: #fff7ed; color: #c2410c; box-shadow: 0 0 0 2px rgba(249,115,22,0.2); }

            .zalo-note-top {
                background: #fef3c7; border: 1.5px solid #fcd34d; border-radius: 12px;
                padding: 12px 14px; font-size: 14px; color: #92400e; margin-bottom: 18px; line-height: 1.5;
            }

            .section-label {
                font-size: 11px; font-weight: 700; color: #ea580c;
                text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; margin-top: 20px;
            }

            .field { margin-bottom: 14px; }
            .field > label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
            .required { color: #ef4444; margin-left: 2px; }
            .optional-tag { display: inline-block; background: #f3f4f6; color: #9ca3af; border-radius: 6px; padding: 1px 8px; font-size: 11px; font-weight: 600; margin-left: 6px; text-transform: none; letter-spacing: 0; }

            .field select, .field input[type="date"],
            .field input[type="number"], .field input[type="text"] {
                width: 100%; padding: 13px 14px; border: 1.5px solid #fed7aa; border-radius: 12px;
                font-size: 16px; font-family: inherit; background: #fff; color: #1f2937;
                outline: none; -webkit-appearance: none; appearance: none;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .field select:focus, .field input:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.15); }
            .field input[type="number"]::-webkit-inner-spin-button { opacity: 1; }

            .hpeel-box { background: #fff7ed; border: 1.5px solid #fed7aa; border-radius: 12px; padding: 12px 14px; }
            .radio-group { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
            .radio-btn { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 10px; border: 1.5px solid #fed7aa; background: #fff; cursor: pointer; font-size: 15px; font-weight: 500; color: #374151; transition: all 0.15s; }
            .radio-btn.active { border-color: #f97316; background: #fff7ed; color: #c2410c; font-weight: 700; }
            .radio-btn input { display: none; }

            .shift-pills { display: flex; gap: 8px; flex-wrap: wrap; }
            .shift-pill { flex: 1; min-width: 52px; padding: 12px 6px; border: 1.5px solid #fed7aa; border-radius: 10px; background: #fff; color: #374151; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; -webkit-tap-highlight-color: transparent; text-align: center; }
            .shift-pill.active { border-color: #f97316; background: #fff7ed; color: #c2410c; box-shadow: 0 0 0 2px rgba(249,115,22,0.2); }

            .multi-shift-note { background: #fff; border: 1.5px solid #fed7aa; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #92400e; margin-bottom: 12px; }
            .shift-block { border: 1.5px solid #fed7aa; border-radius: 14px; padding: 14px; margin-bottom: 14px; background: #fff; }
            .shift-block-label { font-size: 15px; font-weight: 800; color: #c2410c; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #fed7aa; }

            .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
            .divider { border: none; border-top: 1px dashed #fed7aa; margin: 20px 0 4px; }

            .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px 14px; color: #dc2626; font-size: 14px; margin-top: 14px; display: flex; align-items: flex-start; gap: 8px; }

            .submit-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #c2410c, #f97316); color: #fff; border: none; border-radius: 14px; font-size: 17px; font-weight: 700; font-family: inherit; cursor: pointer; margin-top: 20px; box-shadow: 0 4px 16px rgba(249,115,22,0.35); transition: opacity 0.2s, transform 0.1s; -webkit-tap-highlight-color: transparent; }
            .submit-btn:active { transform: scale(0.98); opacity: 0.9; }
            .submit-btn:disabled { background: #d1d5db; box-shadow: none; cursor: not-allowed; color: #9ca3af; }
            .back-btn { width: 100%; padding: 14px; background: #fff; color: #6b7280; border: 1.5px solid #d1d5db; border-radius: 14px; font-size: 16px; font-weight: 600; font-family: inherit; cursor: pointer; margin-top: 12px; -webkit-tap-highlight-color: transparent; }

            .confirm-meta { background: #fff; border: 1.5px solid #fed7aa; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; font-size: 15px; line-height: 2; color: #374151; }
            .confirm-row { background: #fff; border: 1.5px solid #fed7aa; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
            .confirm-shift-label { font-size: 16px; font-weight: 800; color: #c2410c; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #fed7aa; }
            .confirm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .confirm-cell { display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #374151; }
            .confirm-cell span { color: #6b7280; }
            .confirm-cell strong { color: #1f2937; font-weight: 700; font-size: 16px; }
            .confirm-note { background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 10px; padding: 12px 14px; font-size: 13px; color: #15803d; margin: 16px 0; }

            /* OT Compare */
            .ot-current-box { background: #fff; border: 1.5px solid #fed7aa; border-radius: 14px; padding: 16px; margin-bottom: 4px; }
            .ot-current-label { font-size: 12px; font-weight: 700; color: #ea580c; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
            .ot-current-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
            .ot-current-cell { text-align: center; }
            .ot-current-cell span { display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px; }
            .ot-current-cell strong { font-size: 28px; font-weight: 800; color: #c2410c; }

            .ot-total-preview { text-align: center; font-size: 15px; color: #374151; margin: 8px 0 4px; }
            .ot-total-preview strong { color: #c2410c; font-size: 18px; }

            .ot-compare-box { background: #fff; border: 1.5px solid #fed7aa; border-radius: 14px; padding: 20px; margin-bottom: 8px; }
            .ot-compare-row { display: flex; align-items: center; justify-content: center; gap: 16px; }
            .ot-compare-col { flex: 1; text-align: center; }
            .ot-col-label { font-size: 12px; font-weight: 700; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; }
            .ot-old-val { font-size: 22px; font-weight: 800; color: #ef4444; line-height: 1.4; }
            .ot-new-val { font-size: 22px; font-weight: 800; color: #16a34a; line-height: 1.4; }
            .ot-old-val span, .ot-new-val span { font-size: 12px; font-weight: 600; color: #6b7280; margin-left: 4px; }
            .ot-arrow { font-size: 28px; color: #f97316; font-weight: 800; }

            /* Success */
            .success-page { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff7ed; padding: 24px; text-align: center; }
            .success-icon { font-size: 72px; margin-bottom: 14px; animation: pop 0.4s ease; }
            @keyframes pop { 0% { transform: scale(0.5); opacity: 0; } 80% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
            .success-title { font-size: 26px; font-weight: 800; color: #16a34a; margin-bottom: 8px; }
            .success-sub { color: #374151; font-size: 15px; line-height: 1.7; margin-bottom: 20px; }
            .success-detail { background: #fff; border: 1.5px solid #bbf7d0; border-radius: 14px; padding: 16px 20px; text-align: left; width: 100%; max-width: 340px; margin-bottom: 16px; font-size: 14px; color: #374151; line-height: 2; }
            .success-detail strong { color: #15803d; }
            .zalo-note { background: #fef3c7; border: 1.5px solid #fcd34d; border-radius: 12px; padding: 12px 16px; font-size: 14px; color: #92400e; width: 100%; max-width: 340px; margin-bottom: 24px; }
            .again-btn { padding: 14px 32px; border-radius: 12px; background: #fff; border: 2px solid #f97316; color: #ea580c; font-size: 16px; font-weight: 700; font-family: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }

            @media (prefers-color-scheme: dark) {
                body, .page, .form-wrap, .success-page { background: #1c1917; }
                .header::after { background: #1c1917; }
                .field select, .field input[type="date"], .field input[type="number"], .field input[type="text"] { background: #292524; border-color: #57534e; color: #f5f5f4; }
                .field > label { color: #e7e5e4; }
                .section-label { color: #fb923c; }
                .shift-block, .confirm-row, .confirm-meta, .ot-current-box, .ot-compare-box { background: #292524; border-color: #57534e; }
                .shift-pill { background: #292524; border-color: #57534e; color: #d6d3d1; }
                .shift-pill.active { background: #431407; color: #fb923c; border-color: #f97316; }
                .radio-btn { background: #292524; border-color: #57534e; color: #d6d3d1; }
                .radio-btn.active { background: #431407; color: #fb923c; border-color: #f97316; }
                .hpeel-box { background: #1c1917; border-color: #57534e; }
                .multi-shift-note { background: #292524; border-color: #57534e; color: #d97706; }
                .confirm-cell span, .ot-current-cell span { color: #a8a29e; }
                .confirm-cell strong { color: #f5f5f4; }
                .mode-tab { background: #292524; border-color: #57534e; color: #a8a29e; }
                .mode-tab.active { background: #431407; color: #fb923c; border-color: #f97316; }
                .success-detail { background: #292524; border-color: #166534; }
                .again-btn { background: #1c1917; color: #fb923c; border-color: #f97316; }
                .divider { border-color: #44403c; }
                .zalo-note-top, .zalo-note { background: #1c0a00; border-color: #92400e; color: #fbbf24; }
                .confirm-note { background: #052e16; border-color: #166534; color: #4ade80; }
                .back-btn { background: #292524; color: #a8a29e; border-color: #57534e; }
                .ot-total-preview { color: #e7e5e4; }
                .ot-compare-row .ot-old-val span, .ot-compare-row .ot-new-val span { color: #a8a29e; }
            }
        `}</style>
    )
}
