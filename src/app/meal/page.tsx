"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"

interface Dept {
    id: string
    code: string
    name_en: string
}

const SHIFTS = [
    { value: "1", label: "Ca 1 (6h – 14h)" },
    { value: "2", label: "Ca 2 (14h – 22h)" },
    { value: "3", label: "Ca 3 (22h – 6h)" },
]

export default function PublicMealPage() {
    const [depts, setDepts] = useState<Dept[]>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState("")

    // Form state
    const [deptId, setDeptId] = useState("")
    const [shift, setShift] = useState("")
    const [workDate, setWorkDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [officialPresent, setOfficialPresent] = useState("")
    const [seasonalPresent, setSeasonalPresent] = useState("")
    const [officialAbsent, setOfficialAbsent] = useState("")
    const [seasonalAbsent, setSeasonalAbsent] = useState("")
    const [otCount, setOtCount] = useState("")
    const [vegetarian, setVegetarian] = useState("")
    const [otVegetarian, setOtVegetarian] = useState("")
    const [reporterName, setReporterName] = useState("")

    useEffect(() => {
        fetch("/api/public-meal")
            .then(r => r.json())
            .then(d => { setDepts(d.depts || []); setLoading(false) })
            .catch(() => { setError("Không tải được danh sách bộ phận"); setLoading(false) })
    }, [])

    const selectedDept = depts.find(d => d.id === deptId)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!deptId || !shift || !workDate) {
            setError("Vui lòng chọn đầy đủ bộ phận, ca và ngày")
            return
        }
        setSubmitting(true)
        setError("")

        const res = await fetch("/api/public-meal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                department_id: deptId,
                department_name: selectedDept?.name_en ?? "",
                work_date: workDate,
                shift,
                official_present: officialPresent !== "" ? Number(officialPresent) : 0,
                seasonal_present: seasonalPresent !== "" ? Number(seasonalPresent) : 0,
                official_absent: officialAbsent !== "" ? Number(officialAbsent) : 0,
                seasonal_absent: seasonalAbsent !== "" ? Number(seasonalAbsent) : 0,
                ot_count: otCount !== "" ? Number(otCount) : 0,
                vegetarian: vegetarian !== "" ? Number(vegetarian) : 0,
                ot_vegetarian: otVegetarian !== "" ? Number(otVegetarian) : 0,
                reporter_name: reporterName.trim(),
            }),
        })
        const data = await res.json()
        setSubmitting(false)
        if (data.success) {
            setSuccess(true)
        } else {
            setError(data.error || "Có lỗi xảy ra, vui lòng thử lại")
        }
    }

    const handleReset = () => {
        setSuccess(false)
        setError("")
        setOfficialPresent("")
        setSeasonalPresent("")
        setOfficialAbsent("")
        setSeasonalAbsent("")
        setOtCount("")
        setVegetarian("")
        setOtVegetarian("")
    }

    if (loading) return (
        <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff7ed" }}>
            <div style={{ textAlign: "center", color: "#f97316" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
                <div style={{ fontWeight: 600 }}>Đang tải...</div>
            </div>
        </div>
    )

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Inter', sans-serif; background: #fff7ed; }

                .page { min-height: 100dvh; padding: 0 0 40px; }

                .header {
                    background: linear-gradient(135deg, #ea580c 0%, #f97316 50%, #fb923c 100%);
                    padding: 20px 20px 28px;
                    color: #fff;
                    position: relative;
                    overflow: hidden;
                }
                .header::after {
                    content: '';
                    position: absolute;
                    bottom: -20px; left: 0; right: 0;
                    height: 40px;
                    background: #fff7ed;
                    border-radius: 50% 50% 0 0 / 100% 100% 0 0;
                }
                .header-logo { font-size: 32px; margin-bottom: 6px; }
                .header-title { font-size: 22px; font-weight: 800; margin-bottom: 2px; }
                .header-sub { font-size: 13px; opacity: 0.85; font-weight: 500; }

                .form-wrap { padding: 16px 16px 0; max-width: 480px; margin: 0 auto; }

                .section-label {
                    font-size: 11px; font-weight: 700; color: #ea580c;
                    text-transform: uppercase; letter-spacing: 0.08em;
                    margin-bottom: 10px; margin-top: 20px;
                }

                .field { margin-bottom: 14px; }
                .field label {
                    display: block; font-size: 13px; font-weight: 600;
                    color: #374151; margin-bottom: 6px;
                }
                .field label span { color: #ef4444; margin-left: 2px; }

                .field select, .field input[type="date"], .field input[type="number"], .field input[type="text"] {
                    width: 100%; padding: 13px 14px;
                    border: 1.5px solid #fed7aa;
                    border-radius: 12px;
                    font-size: 16px; /* 16px prevents iOS zoom */
                    font-family: inherit;
                    background: #fff;
                    color: #1f2937;
                    outline: none;
                    -webkit-appearance: none;
                    appearance: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .field select:focus, .field input:focus {
                    border-color: #f97316;
                    box-shadow: 0 0 0 3px rgba(249,115,22,0.15);
                }
                .field input[type="number"]::-webkit-inner-spin-button { opacity: 1; }

                .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

                .divider { border: none; border-top: 1px dashed #fed7aa; margin: 20px 0 4px; }

                .reporter-row { display: flex; align-items: center; gap: 10px; }
                .reporter-row .field { flex: 1; margin-bottom: 0; }

                .submit-btn {
                    width: 100%; padding: 16px;
                    background: linear-gradient(135deg, #ea580c, #f97316);
                    color: #fff; border: none; border-radius: 14px;
                    font-size: 17px; font-weight: 700; font-family: inherit;
                    cursor: pointer; margin-top: 24px;
                    box-shadow: 0 4px 16px rgba(249,115,22,0.35);
                    transition: opacity 0.2s, transform 0.1s;
                    letter-spacing: 0.02em;
                    -webkit-tap-highlight-color: transparent;
                }
                .submit-btn:active { transform: scale(0.98); opacity: 0.9; }
                .submit-btn:disabled { background: #d1d5db; box-shadow: none; cursor: not-allowed; color: #9ca3af; }

                .error-box {
                    background: #fef2f2; border: 1px solid #fecaca;
                    border-radius: 10px; padding: 12px 14px;
                    color: #dc2626; font-size: 14px; margin-top: 14px;
                    display: flex; align-items: flex-start; gap: 8px;
                }

                .success-page {
                    min-height: 100dvh;
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    background: #fff7ed; padding: 24px; text-align: center;
                }
                .success-icon { font-size: 72px; margin-bottom: 16px; animation: pop 0.4s ease; }
                @keyframes pop { 0% { transform: scale(0.5); opacity: 0; } 80% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
                .success-title { font-size: 26px; font-weight: 800; color: #16a34a; margin-bottom: 8px; }
                .success-sub { color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 28px; }
                .success-detail {
                    background: #fff; border: 1.5px solid #bbf7d0;
                    border-radius: 14px; padding: 16px 20px; text-align: left;
                    width: 100%; max-width: 340px; margin-bottom: 28px;
                    font-size: 14px; color: #374151; line-height: 2;
                }
                .success-detail strong { color: #15803d; }
                .again-btn {
                    padding: 14px 32px; border-radius: 12px;
                    background: #fff; border: 2px solid #f97316;
                    color: #ea580c; font-size: 16px; font-weight: 700;
                    font-family: inherit; cursor: pointer;
                    -webkit-tap-highlight-color: transparent;
                }

                .info-badge {
                    display: inline-block; background: #ffedd5;
                    color: #c2410c; border-radius: 8px;
                    padding: 3px 10px; font-size: 12px; font-weight: 600;
                    margin-left: 6px; vertical-align: middle;
                }

                @media (prefers-color-scheme: dark) {
                    body { background: #1c1917; }
                    .page { background: #1c1917; }
                    .header::after { background: #1c1917; }
                    .form-wrap { background: #1c1917; }
                    .field select, .field input[type="date"], .field input[type="number"], .field input[type="text"] {
                        background: #292524; border-color: #57534e; color: #f5f5f4;
                    }
                    .field label { color: #e7e5e4; }
                    .section-label { color: #fb923c; }
                    .success-page, .success-detail { background: #1c1917; }
                    .success-detail { border-color: #166534; }
                    .again-btn { background: #1c1917; color: #fb923c; border-color: #f97316; }
                    .divider { border-color: #44403c; }
                    .info-badge { background: #431407; color: #fb923c; }
                }
            `}</style>

            {success ? (
                <div className="success-page">
                    <div className="success-icon">✅</div>
                    <div className="success-title">Đã báo cơm thành công!</div>
                    <p className="success-sub">
                        Số liệu đã được ghi vào hệ thống.<br />
                        Cảm ơn bạn đã báo cơm!
                    </p>
                    <div className="success-detail">
                        <div><strong>Bộ phận:</strong> {selectedDept?.name_en}</div>
                        <div><strong>Ngày:</strong> {format(new Date(workDate + "T00:00:00"), "dd/MM/yyyy")}</div>
                        <div><strong>Ca:</strong> {SHIFTS.find(s => s.value === shift)?.label}</div>
                        {reporterName && <div><strong>Người báo:</strong> {reporterName}</div>}
                    </div>
                    <button className="again-btn" onClick={handleReset}>
                        🔄 Báo thêm ca khác
                    </button>
                </div>
            ) : (
                <div className="page">
                    <div className="header">
                        <div className="header-logo">🍽️</div>
                        <div className="header-title">Báo Cơm Nhà Máy</div>
                        <div className="header-sub">VICC Long An — Intersnack Cashew Vietnam</div>
                    </div>

                    <div className="form-wrap">
                        <form onSubmit={handleSubmit}>

                            {/* ── Thông tin chính ── */}
                            <div className="section-label">📋 Thông tin ca làm việc</div>

                            <div className="field">
                                <label>Bộ phận <span>*</span></label>
                                <select value={deptId} onChange={e => setDeptId(e.target.value)} required>
                                    <option value="">— Chọn bộ phận —</option>
                                    {depts.map(d => (
                                        <option key={d.id} value={d.id}>{d.name_en}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="row2">
                                <div className="field">
                                    <label>Ca làm <span>*</span></label>
                                    <select value={shift} onChange={e => setShift(e.target.value)} required>
                                        <option value="">— Ca —</option>
                                        {SHIFTS.map(s => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Ngày <span>*</span></label>
                                    <input
                                        type="date"
                                        value={workDate}
                                        onChange={e => setWorkDate(e.target.value)}
                                        max={format(new Date(), "yyyy-MM-dd")}
                                        required
                                    />
                                </div>
                            </div>

                            {/* ── Hiện diện ── */}
                            <hr className="divider" />
                            <div className="section-label">👥 Hiện diện</div>

                            <div className="row2">
                                <div className="field">
                                    <label>Chính thức</label>
                                    <input
                                        type="number" min="0" max="999"
                                        placeholder="0"
                                        value={officialPresent}
                                        onChange={e => setOfficialPresent(e.target.value)}
                                    />
                                </div>
                                <div className="field">
                                    <label>Thời vụ</label>
                                    <input
                                        type="number" min="0" max="999"
                                        placeholder="0"
                                        value={seasonalPresent}
                                        onChange={e => setSeasonalPresent(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* ── Vắng ── */}
                            <hr className="divider" />
                            <div className="section-label">❌ Vắng mặt <span className="info-badge">Nếu có</span></div>

                            <div className="row2">
                                <div className="field">
                                    <label>Chính thức vắng</label>
                                    <input
                                        type="number" min="0" max="999"
                                        placeholder="0"
                                        value={officialAbsent}
                                        onChange={e => setOfficialAbsent(e.target.value)}
                                    />
                                </div>
                                <div className="field">
                                    <label>Thời vụ vắng</label>
                                    <input
                                        type="number" min="0" max="999"
                                        placeholder="0"
                                        value={seasonalAbsent}
                                        onChange={e => setSeasonalAbsent(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* ── OT & Chay ── */}
                            <hr className="divider" />
                            <div className="section-label">⏰ Tăng ca (OT) & Ăn chay <span className="info-badge">Nếu có</span></div>

                            <div className="row2">
                                <div className="field">
                                    <label>OT (mặn)</label>
                                    <input
                                        type="number" min="0" max="999"
                                        placeholder="0"
                                        value={otCount}
                                        onChange={e => setOtCount(e.target.value)}
                                    />
                                </div>
                                <div className="field">
                                    <label>OT (chay)</label>
                                    <input
                                        type="number" min="0" max="999"
                                        placeholder="0"
                                        value={otVegetarian}
                                        onChange={e => setOtVegetarian(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="field">
                                <label>🥬 Ăn chay (ca thường)</label>
                                <input
                                    type="number" min="0" max="999"
                                    placeholder="0"
                                    value={vegetarian}
                                    onChange={e => setVegetarian(e.target.value)}
                                />
                            </div>

                            {/* ── Người báo ── */}
                            <hr className="divider" />
                            <div className="section-label">👤 Người báo cơm <span className="info-badge">Tuỳ chọn</span></div>
                            <div className="field">
                                <label>Họ tên / Ký hiệu</label>
                                <input
                                    type="text"
                                    placeholder="VD: Mai, Hùng, Tổ trưởng SHELL..."
                                    value={reporterName}
                                    onChange={e => setReporterName(e.target.value)}
                                    maxLength={60}
                                />
                            </div>

                            {error && (
                                <div className="error-box">
                                    <span>⚠️</span> {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="submit-btn"
                                disabled={submitting || !deptId || !shift}
                            >
                                {submitting ? "⏳ Đang gửi..." : "✅ Gửi báo cơm"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
