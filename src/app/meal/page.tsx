"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"

interface Dept { id: string; code: string; name_en: string }

// Departments that report all 3 Ca at once
const MULTI_SHIFT_CODES = new Set(["QC", "BOILER"])

// HPEEL sub-groups: when user selects Hand Peeling, choose team lead
const HPEEL_SUBGROUPS = [
    { key: "HPEEL_LIEN",    label: "Tổ Liên",       dept_name: "Manual Peeling (Liên)" },
    { key: "HPEEL_DUNG",    label: "Tổ Dung",        dept_name: "Manual Peeling (Dung)" },
    { key: "HPEEL_GRADING", label: "Ms Huệ (Grading)", dept_name: "Manual Grading (Ms Huệ)" },
]

const SHIFTS_NORMAL = [
    { value: "1", label: "Ca 1" },
    { value: "2", label: "Ca 2" },
    { value: "3", label: "Ca 3" },
]
// Ca 1 + HC for Office dept
const SHIFTS_WITH_HC = [
    { value: "1", label: "Ca 1" },
    { value: "2", label: "Ca 2" },
    { value: "3", label: "Ca 3" },
    { value: "HC", label: "HC (Hành chính)" },
]
const MULTI_SHIFTS = ["1", "2", "3"]

// ─── blank headcount for one shift ───
interface ShiftData {
    officialPresent: string
    seasonalPresent: string
    officialAbsent: string
    seasonalAbsent: string
    otCount: string
    vegetarian: string
    otVegetarian: string
}
const blank = (): ShiftData => ({
    officialPresent: "", seasonalPresent: "", officialAbsent: "",
    seasonalAbsent: "", otCount: "", vegetarian: "", otVegetarian: "",
})

// ─── Confirmation row ───
interface ConfirmRow {
    department_id: string
    department_name: string
    work_date: string
    shift: string
    official_present: number
    seasonal_present: number
    official_absent: number
    seasonal_absent: number
    ot_count: number
    vegetarian: number
    ot_vegetarian: number
    reporter_name: string
}

export default function PublicMealPage() {
    const [depts, setDepts] = useState<Dept[]>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState("")

    // Form state
    const [deptId, setDeptId] = useState("")
    const [hpeelSub, setHpeelSub] = useState("") // HPEEL sub-group key
    const [shift, setShift] = useState("")
    const [workDate, setWorkDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [reporterName, setReporterName] = useState("")

    // For single-shift or multi-shift modes
    const [singleData, setSingleData] = useState<ShiftData>(blank())
    // multi-shift: indexed by shift "1","2","3"
    const [multiData, setMultiData] = useState<Record<string, ShiftData>>({ "1": blank(), "2": blank(), "3": blank() })

    // Confirmation step
    const [confirmRows, setConfirmRows] = useState<ConfirmRow[]>([])
    const [showConfirm, setShowConfirm] = useState(false)

    useEffect(() => {
        fetch("/api/public-meal")
            .then(r => r.json())
            .then(d => { setDepts(d.depts || []); setLoading(false) })
            .catch(() => { setError("Không tải được danh sách bộ phận"); setLoading(false) })
    }, [])

    const selectedDept = depts.find(d => d.id === deptId)
    const isMultiShift = selectedDept && MULTI_SHIFT_CODES.has(selectedDept.code)
    const isHpeel = selectedDept?.code === "HPEEL"
    const isOffice = selectedDept?.code === "OFFICE"
    const shifts = isOffice ? SHIFTS_WITH_HC : SHIFTS_NORMAL

    // Resolve effective department_name (HPEEL sub or dept.name_en)
    const getEffectiveDeptName = () => {
        if (isHpeel && hpeelSub) {
            return HPEEL_SUBGROUPS.find(s => s.key === hpeelSub)?.dept_name ?? selectedDept?.name_en ?? ""
        }
        return selectedDept?.name_en ?? ""
    }

    const toNum = (s: string) => s.trim() === "" ? 0 : Number(s)

    const buildRow = (data: ShiftData, shiftVal: string): ConfirmRow => ({
        department_id: deptId,
        department_name: getEffectiveDeptName(),
        work_date: workDate,
        shift: shiftVal,
        official_present: toNum(data.officialPresent),
        seasonal_present: toNum(data.seasonalPresent),
        official_absent: toNum(data.officialAbsent),
        seasonal_absent: toNum(data.seasonalAbsent),
        ot_count: toNum(data.otCount),
        vegetarian: toNum(data.vegetarian),
        ot_vegetarian: toNum(data.otVegetarian),
        reporter_name: reporterName.trim(),
    })

    const handlePreview = (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        if (!deptId) { setError("Vui lòng chọn bộ phận"); return }
        if (isHpeel && !hpeelSub) { setError("Vui lòng chọn tổ trưởng Hand Peeling"); return }
        if (!isMultiShift && !shift) { setError("Vui lòng chọn ca làm việc"); return }

        let rows: ConfirmRow[]
        if (isMultiShift) {
            rows = MULTI_SHIFTS.map(s => buildRow(multiData[s], s))
        } else {
            rows = [buildRow(singleData, shift)]
        }
        setConfirmRows(rows)
        setShowConfirm(true)
    }

    const handleSubmit = async () => {
        setSubmitting(true)
        setError("")
        const res = await fetch("/api/public-meal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(confirmRows),
        })
        const data = await res.json()
        setSubmitting(false)
        if (data.success) {
            setSuccess(true)
            setShowConfirm(false)
        } else {
            setError(data.error || "Có lỗi xảy ra, vui lòng thử lại")
            setShowConfirm(false)
        }
    }

    const handleReset = () => {
        setSuccess(false); setShowConfirm(false); setError("")
        setDeptId(""); setHpeelSub(""); setShift("")
        setSingleData(blank()); setMultiData({ "1": blank(), "2": blank(), "3": blank() })
        setConfirmRows([])
    }

    const updateMulti = (shiftKey: string, field: keyof ShiftData, val: string) => {
        setMultiData(prev => ({ ...prev, [shiftKey]: { ...prev[shiftKey], [field]: val } }))
    }
    const updateSingle = (field: keyof ShiftData, val: string) => {
        setSingleData(prev => ({ ...prev, [field]: val }))
    }

    // ── Shared field component ──
    const NumInput = ({ label, value, onChange, emoji }: { label: string; value: string; onChange: (v: string) => void; emoji?: string }) => (
        <div className="field">
            <label>{emoji && <span>{emoji} </span>}{label}</label>
            <input type="number" min="0" max="999" placeholder="0" value={value} onChange={e => onChange(e.target.value)} />
        </div>
    )

    const ShiftFields = ({ data, update, shiftLabel }: {
        data: ShiftData
        update: (field: keyof ShiftData, val: string) => void
        shiftLabel?: string
    }) => (
        <div className="shift-block">
            {shiftLabel && <div className="shift-block-label">{shiftLabel}</div>}
            <div className="row2">
                <NumInput label="Chính thức" value={data.officialPresent} onChange={v => update("officialPresent", v)} emoji="👤" />
                <NumInput label="Thời vụ" value={data.seasonalPresent} onChange={v => update("seasonalPresent", v)} emoji="👥" />
            </div>
            <div className="row2">
                <NumInput label="CT vắng" value={data.officialAbsent} onChange={v => update("officialAbsent", v)} emoji="❌" />
                <NumInput label="TV vắng" value={data.seasonalAbsent} onChange={v => update("seasonalAbsent", v)} emoji="❌" />
            </div>
            <div className="row3">
                <NumInput label="OT mặn" value={data.otCount} onChange={v => update("otCount", v)} emoji="⏰" />
                <NumInput label="OT chay" value={data.otVegetarian} onChange={v => update("otVegetarian", v)} emoji="🥬" />
                <NumInput label="Ăn chay" value={data.vegetarian} onChange={v => update("vegetarian", v)} emoji="🌿" />
            </div>
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

    // ── Confirmation Screen ──
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

                    <div className="confirm-note">
                        📞 Có sai sót liên hệ <strong>Ms Chi</strong> để điều chỉnh nhé!
                    </div>

                    <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? "⏳ Đang gửi..." : "✅ Xác nhận & Gửi báo cơm"}
                    </button>
                    <button className="back-btn" onClick={() => setShowConfirm(false)} disabled={submitting}>
                        ✏️ Sửa lại
                    </button>
                </div>
            </div>
        </>
    )

    // ── Success Screen ──
    if (success) return (
        <>
            <Style />
            <div className="success-page">
                <div className="success-icon">✅</div>
                <div className="success-title">Đã báo cơm thành công!</div>
                <p className="success-sub">
                    Cảm ơn bạn đã báo cơm! 🙏<br />
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                        Nếu sai sót liên hệ <strong>Ms Chi</strong> nhé!
                    </span>
                </p>
                <div className="success-detail">
                    <div><strong>Bộ phận:</strong> {getEffectiveDeptName()}</div>
                    <div><strong>Ngày:</strong> {format(new Date(workDate + "T00:00:00"), "dd/MM/yyyy")}</div>
                    <div><strong>Số ca đã báo:</strong> {confirmRows.length}</div>
                    {reporterName && <div><strong>Người báo:</strong> {reporterName}</div>}
                </div>
                <div className="zalo-note">
                    💬 Nhớ báo <strong>dự trù cơm</strong> trên nhóm Zalo nha mọi người!
                </div>
                <button className="again-btn" onClick={handleReset}>🔄 Báo thêm ca khác</button>
            </div>
        </>
    )

    // ── Main Form ──
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
                    <div className="zalo-note-top">
                        💬 Mọi người báo <strong>dự trù cơm</strong> trên nhóm <strong>Zalo</strong> giúp em nha!
                    </div>

                    <form onSubmit={handlePreview}>
                        {/* ── Thông tin chính ── */}
                        <div className="section-label">📋 Thông tin ca làm việc</div>

                        <div className="field">
                            <label>Bộ phận <span className="required">*</span></label>
                            <select value={deptId} onChange={e => { setDeptId(e.target.value); setHpeelSub(""); setShift("") }} required>
                                <option value="">— Chọn bộ phận —</option>
                                {depts.map(d => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                            </select>
                        </div>

                        {/* HPEEL sub-group selector */}
                        {isHpeel && (
                            <div className="field hpeel-box">
                                <label>Tổ trưởng <span className="required">*</span></label>
                                <div className="radio-group">
                                    {HPEEL_SUBGROUPS.map(sg => (
                                        <label key={sg.key} className={`radio-btn ${hpeelSub === sg.key ? "active" : ""}`}>
                                            <input
                                                type="radio" name="hpeel_sub" value={sg.key}
                                                checked={hpeelSub === sg.key}
                                                onChange={() => setHpeelSub(sg.key)}
                                            />
                                            {sg.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Multi-shift mode (QC & Boiler) */}
                        {isMultiShift ? (
                            <>
                                <div className="field">
                                    <label>Ngày <span className="required">*</span></label>
                                    <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} required />
                                </div>
                                <div className="multi-shift-note">
                                    📌 Điền thông tin cho cả 3 ca bên dưới
                                </div>
                                {MULTI_SHIFTS.map(s => (
                                    <ShiftFields
                                        key={s}
                                        shiftLabel={`Ca ${s}`}
                                        data={multiData[s]}
                                        update={(field, val) => updateMulti(s, field, val)}
                                    />
                                ))}
                            </>
                        ) : (
                            <>
                                <div className="row2">
                                    <div className="field">
                                        <label>Ca làm <span className="required">*</span></label>
                                        <div className="shift-pills">
                                            {shifts.map(s => (
                                                <button
                                                    key={s.value} type="button"
                                                    className={`shift-pill ${shift === s.value ? "active" : ""}`}
                                                    onClick={() => setShift(s.value)}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="field">
                                        <label>Ngày <span className="required">*</span></label>
                                        <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} required />
                                    </div>
                                </div>

                                <ShiftFields data={singleData} update={updateSingle} />
                            </>
                        )}

                        {/* Người báo */}
                        <hr className="divider" />
                        <div className="section-label">👤 Người báo cơm <span className="optional-tag">Tuỳ chọn</span></div>
                        <div className="field">
                            <label>Họ tên / Ký hiệu</label>
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

// ── Isolated CSS component ──
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
                height: 40px; background: #fff7ed;
                border-radius: 50% 50% 0 0 / 100% 100% 0 0;
            }
            .header-logo { font-size: 32px; margin-bottom: 4px; }
            .header-title { font-size: 22px; font-weight: 800; margin-bottom: 2px; }
            .header-sub { font-size: 13px; opacity: 0.85; font-weight: 500; }

            .form-wrap { padding: 16px 16px 0; max-width: 480px; margin: 0 auto; }

            .zalo-note-top {
                background: #fef3c7; border: 1.5px solid #fcd34d;
                border-radius: 12px; padding: 12px 14px;
                font-size: 14px; color: #92400e;
                margin-bottom: 18px; line-height: 1.5;
            }

            .section-label {
                font-size: 11px; font-weight: 700; color: #ea580c;
                text-transform: uppercase; letter-spacing: 0.08em;
                margin-bottom: 10px; margin-top: 20px;
            }

            .field { margin-bottom: 14px; }
            .field > label {
                display: block; font-size: 13px; font-weight: 600;
                color: #374151; margin-bottom: 6px;
            }
            .required { color: #ef4444; margin-left: 2px; }
            .optional-tag {
                display: inline-block; background: #f3f4f6; color: #9ca3af;
                border-radius: 6px; padding: 1px 8px; font-size: 11px;
                font-weight: 600; margin-left: 6px; text-transform: none; letter-spacing: 0;
            }

            .field select, .field input[type="date"],
            .field input[type="number"], .field input[type="text"] {
                width: 100%; padding: 13px 14px;
                border: 1.5px solid #fed7aa; border-radius: 12px;
                font-size: 16px; font-family: inherit;
                background: #fff; color: #1f2937; outline: none;
                -webkit-appearance: none; appearance: none;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .field select:focus, .field input:focus {
                border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.15);
            }
            .field input[type="number"]::-webkit-inner-spin-button { opacity: 1; }

            /* HPEEL box */
            .hpeel-box { background: #fff7ed; border: 1.5px solid #fed7aa; border-radius: 12px; padding: 12px 14px; }
            .radio-group { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
            .radio-btn {
                display: flex; align-items: center; gap: 10px;
                padding: 12px 14px; border-radius: 10px;
                border: 1.5px solid #fed7aa; background: #fff;
                cursor: pointer; font-size: 15px; font-weight: 500; color: #374151;
                transition: all 0.15s;
            }
            .radio-btn.active { border-color: #f97316; background: #fff7ed; color: #c2410c; font-weight: 700; }
            .radio-btn input { display: none; }

            /* Shift pills */
            .shift-pills { display: flex; gap: 8px; flex-wrap: wrap; }
            .shift-pill {
                flex: 1; min-width: 60px; padding: 12px 8px;
                border: 1.5px solid #fed7aa; border-radius: 10px;
                background: #fff; color: #374151;
                font-size: 14px; font-weight: 600; cursor: pointer;
                transition: all 0.15s; -webkit-tap-highlight-color: transparent;
                text-align: center;
            }
            .shift-pill.active { border-color: #f97316; background: #fff7ed; color: #c2410c; box-shadow: 0 0 0 2px rgba(249,115,22,0.2); }

            /* Multi shift */
            .multi-shift-note {
                background: #fff; border: 1.5px solid #fed7aa; border-radius: 10px;
                padding: 10px 14px; font-size: 13px; color: #92400e; margin-bottom: 12px;
            }
            .shift-block { border: 1.5px solid #fed7aa; border-radius: 14px; padding: 14px; margin-bottom: 14px; background: #fff; }
            .shift-block-label {
                font-size: 15px; font-weight: 800; color: #c2410c;
                margin-bottom: 12px; padding-bottom: 8px;
                border-bottom: 1px dashed #fed7aa;
            }

            /* Grid layouts */
            .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

            .divider { border: none; border-top: 1px dashed #fed7aa; margin: 20px 0 4px; }

            /* Error */
            .error-box {
                background: #fef2f2; border: 1px solid #fecaca;
                border-radius: 10px; padding: 12px 14px;
                color: #dc2626; font-size: 14px; margin-top: 14px;
                display: flex; align-items: flex-start; gap: 8px;
            }

            /* Buttons */
            .submit-btn {
                width: 100%; padding: 16px;
                background: linear-gradient(135deg, #c2410c, #f97316);
                color: #fff; border: none; border-radius: 14px;
                font-size: 17px; font-weight: 700; font-family: inherit;
                cursor: pointer; margin-top: 20px;
                box-shadow: 0 4px 16px rgba(249,115,22,0.35);
                transition: opacity 0.2s, transform 0.1s;
                -webkit-tap-highlight-color: transparent;
            }
            .submit-btn:active { transform: scale(0.98); opacity: 0.9; }
            .submit-btn:disabled { background: #d1d5db; box-shadow: none; cursor: not-allowed; color: #9ca3af; }

            .back-btn {
                width: 100%; padding: 14px;
                background: #fff; color: #6b7280;
                border: 1.5px solid #d1d5db; border-radius: 14px;
                font-size: 16px; font-weight: 600; font-family: inherit;
                cursor: pointer; margin-top: 12px;
                -webkit-tap-highlight-color: transparent;
            }

            /* Confirm screen */
            .confirm-meta {
                background: #fff; border: 1.5px solid #fed7aa; border-radius: 12px;
                padding: 14px 16px; margin-bottom: 16px;
                font-size: 15px; line-height: 2; color: #374151;
            }
            .confirm-row {
                background: #fff; border: 1.5px solid #fed7aa; border-radius: 12px;
                padding: 14px 16px; margin-bottom: 12px;
            }
            .confirm-shift-label {
                font-size: 16px; font-weight: 800; color: #c2410c;
                margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #fed7aa;
            }
            .confirm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .confirm-cell { display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #374151; }
            .confirm-cell span { color: #6b7280; }
            .confirm-cell strong { color: #1f2937; font-weight: 700; font-size: 16px; }
            .confirm-note {
                background: #f0fdf4; border: 1.5px solid #bbf7d0;
                border-radius: 10px; padding: 12px 14px;
                font-size: 13px; color: #15803d; margin: 16px 0;
            }

            /* Success screen */
            .success-page {
                min-height: 100dvh; display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                background: #fff7ed; padding: 24px; text-align: center;
            }
            .success-icon { font-size: 72px; margin-bottom: 14px; animation: pop 0.4s ease; }
            @keyframes pop { 0% { transform: scale(0.5); opacity: 0; } 80% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
            .success-title { font-size: 26px; font-weight: 800; color: #16a34a; margin-bottom: 8px; }
            .success-sub { color: #374151; font-size: 15px; line-height: 1.7; margin-bottom: 20px; }
            .success-detail {
                background: #fff; border: 1.5px solid #bbf7d0; border-radius: 14px;
                padding: 16px 20px; text-align: left; width: 100%; max-width: 340px;
                margin-bottom: 16px; font-size: 14px; color: #374151; line-height: 2;
            }
            .success-detail strong { color: #15803d; }
            .zalo-note {
                background: #fef3c7; border: 1.5px solid #fcd34d; border-radius: 12px;
                padding: 12px 16px; font-size: 14px; color: #92400e;
                width: 100%; max-width: 340px; margin-bottom: 24px;
            }
            .again-btn {
                padding: 14px 32px; border-radius: 12px;
                background: #fff; border: 2px solid #f97316;
                color: #ea580c; font-size: 16px; font-weight: 700;
                font-family: inherit; cursor: pointer;
                -webkit-tap-highlight-color: transparent;
            }

            @media (prefers-color-scheme: dark) {
                body, .page, .form-wrap { background: #1c1917; }
                .header::after { background: #1c1917; }
                .field select, .field input[type="date"],
                .field input[type="number"], .field input[type="text"] {
                    background: #292524; border-color: #57534e; color: #f5f5f4;
                }
                .field > label { color: #e7e5e4; }
                .section-label { color: #fb923c; }
                .shift-block, .confirm-me,ta .confirm-row, .confirm-meta { background: #292524; border-color: #57534e; }
                .shift-pill { background: #292524; border-color: #57534e; color: #d6d3d1; }
                .shift-pill.active { background: #431407; color: #fb923c; border-color: #f97316; }
                .radio-btn { background: #292524; border-color: #57534e; color: #d6d3d1; }
                .radio-btn.active { background: #431407; color: #fb923c; border-color: #f97316; }
                .hpeel-box { background: #1c1917; border-color: #57534e; }
                .multi-shift-note { background: #292524; border-color: #57534e; color: #d97706; }
                .confirm-cell span { color: #a8a29e; }
                .confirm-cell strong { color: #f5f5f4; }
                .success-page { background: #1c1917; }
                .success-detail { background: #292524; border-color: #166534; }
                .again-btn { background: #1c1917; color: #fb923c; border-color: #f97316; }
                .divider { border-color: #44403c; }
                .zalo-note-top { background: #1c0a00; border-color: #92400e; color: #fbbf24; }
                .zalo-note { background: #1c0a00; border-color: #92400e; color: #fbbf24; }
                .confirm-note { background: #052e16; border-color: #166534; color: #4ade80; }
                .back-btn { background: #292524; color: #a8a29e; border-color: #57534e; }
            }
        `}</style>
    )
}
