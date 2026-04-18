"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { IntersnackLogo } from "@/components/intersnack-logo"

interface Dept { id: string; code: string; name_en: string }

const MULTI_SHIFT_CODES = new Set(["QC", "BOILER", "CLEAN", "MAINT_HCA"])

const HPEEL_SUBGROUPS = [
    { key: "HPEEL_LIEN", label: "Tổ Liên", dept_name: "Hand Peeling (Liên)" },
    { key: "HPEEL_DUNG", label: "Tổ Dung", dept_name: "Hand Peeling (Dung)" },
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

interface OTRecord { ot_count: number; ot_vegetarian: number; official_present: number; seasonal_present: number; vegetarian: number; official_absent?: number; seasonal_absent?: number; department_name?: string; note?: string }

// Extract OT meal time from note field (e.g. "Báo bởi: Tên | Giờ ăn OT: 14:00")
const extractOtTimeFromNote = (note?: string | null): string | null => {
    if (!note) return null
    const m = note.match(/Giờ ăn OT:\s*([0-9]{2}:[0-9]{2})/i)
    return m ? m[1] : null
}
interface SummaryRow { department_name: string; shift: string; official_present: number; seasonal_present: number; official_absent: number; seasonal_absent: number; ot_count: number; vegetarian: number; ot_vegetarian: number; note?: string }
type PageMode = "report" | "edit-ot" | "summary"
type OTStep = "select" | "edit" | "confirm" | "done"

const VN_DAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]

// Departments that report per-shift (Ca 1, 2, 3)
const ALL_SHIFTS = ["1", "2", "3"]
// Departments where only Ca 1+2 are expected for meal report
const CLEAN_SHIFTS = ["1", "2"]

// ── helpers ──
const n = (s: string) => { const v = parseInt(s); return isNaN(v) || v < 0 ? 0 : v }
const calcMalan = (total: string, chay: string) => Math.max(0, n(total) - n(chay))
const totalPresent = (d: ShiftData) => n(d.officialPresent) + n(d.seasonalPresent)

const getLockStatus = (shiftVal: string | undefined, workDateStr: string) => {
    if (!shiftVal || !workDateStr) return false;
    const vnDateString = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    const vnNow = new Date(vnDateString)
    const todayStr = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, "0")}-${String(vnNow.getDate()).padStart(2, "0")}`

    const vnYesterday = new Date(vnNow)
    vnYesterday.setDate(vnYesterday.getDate() - 1)
    const yesterdayStr = `${vnYesterday.getFullYear()}-${String(vnYesterday.getMonth() + 1).padStart(2, "0")}-${String(vnYesterday.getDate()).padStart(2, "0")}`

    const currentMins = vnNow.getHours() * 60 + vnNow.getMinutes();

    if (workDateStr < todayStr) {
        if (shiftVal === "3" && workDateStr === yesterdayStr && currentMins < 12 * 60) {
            return false;
        }
        return true;
    }
    if (workDateStr > todayStr) return false;

    if (shiftVal === "1") return currentMins >= 10 * 60; // 10:00
    if (shiftVal === "2") return currentMins >= 15 * 60 + 30; // 15:30
    return false;
}

// Returns true if OT is completely locked for this date (2+ days ago)
const getOTLockStatus = (workDateStr: string) => {
    if (!workDateStr) return false;
    const vnDateString = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    const vnNow = new Date(vnDateString)
    const vnYesterday = new Date(vnNow)
    vnYesterday.setDate(vnYesterday.getDate() - 1)
    const yesterdayStr = `${vnYesterday.getFullYear()}-${String(vnYesterday.getMonth() + 1).padStart(2, "0")}-${String(vnYesterday.getDate()).padStart(2, "0")}`
    return workDateStr < yesterdayStr; // strictly before yesterday == 2+ days ago
}

// Returns the minimum selectable date (yesterday)
const getMinDate = () => {
    const vnNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }))
    const vnYesterday = new Date(vnNow)
    vnYesterday.setDate(vnYesterday.getDate() - 1)
    return `${vnYesterday.getFullYear()}-${String(vnYesterday.getMonth() + 1).padStart(2, "0")}-${String(vnYesterday.getDate()).padStart(2, "0")}`
}

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
const ShiftFields = ({ data, update, shiftLabel, shiftVal, workDateStr, hideSeasonal, hideAbsent }: {
    data: ShiftData; update: (f: keyof ShiftData, v: any) => void
    shiftLabel?: string; shiftVal?: string; workDateStr: string
    hideSeasonal?: boolean; hideAbsent?: boolean
}) => {
    const isLocked = getLockStatus(shiftVal, workDateStr)
    const isOTLocked = getOTLockStatus(workDateStr)

    const total = totalPresent(data)
    const chay = n(data.vegCount)
    const malan = Math.max(0, total - chay)
    const hasTotal = total > 0
    const otTotalN = n(data.otTotal)
    const otChayN = n(data.otVeg)
    const otMalanN = calcMalan(data.otTotal, data.otVeg)
    const hasOT = otTotalN > 0

    return (
        <div className={`shift-block ${isLocked ? "locked" : ""}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {shiftLabel && <div className="shift-block-label">📅 {shiftLabel}</div>}
                {isOTLocked
                    ? <div className="locked-badge">🔒 Đã khóa hoàn toàn</div>
                    : isLocked && <div className="locked-badge">🔒 Đã khóa (chỉ được báo OT)</div>}
            </div>

            {/* Present */}
            <div className="subsection-label">👥 Hiện diện {isLocked && <span className="opt-tag">Bị khóa</span>}</div>
            <div className="row2">
                <div className="field-sm" style={{ flex: hideSeasonal ? "none" : 1, width: hideSeasonal ? "100%" : "auto" }}>
                    <label>Chính thức</label>
                    <input type="number" min="0" max="999" placeholder="0" disabled={isLocked} value={data.officialPresent} onChange={e => update("officialPresent", e.target.value)} />
                </div>
                {!hideSeasonal && (
                    <div className="field-sm">
                        <label>Thời vụ</label>
                        <input type="number" min="0" max="999" placeholder="0" disabled={isLocked} value={data.seasonalPresent} onChange={e => update("seasonalPresent", e.target.value)} />
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
                            <span>🥬 Chay {isLocked && "🔒"}</span>
                            <input
                                type="number" min="0" max={total} placeholder="0"
                                disabled={isLocked}
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
                    <div className="subsection-label" style={{ marginTop: 8 }}>❌ Vắng mặt {isLocked ? <span className="opt-tag">Bị khóa</span> : <span className="opt-tag">nếu có</span>}</div>
                    <div className="row2">
                        <div className="field-sm" style={{ flex: hideSeasonal ? "none" : 1, width: hideSeasonal ? "100%" : "auto" }}>
                            <label>Chính thức</label>
                            <input type="number" min="0" max="999" placeholder="0" disabled={isLocked} value={data.officialAbsent} onChange={e => update("officialAbsent", e.target.value)} />
                        </div>
                        {!hideSeasonal && (
                            <div className="field-sm">
                                <label>Thời vụ</label>
                                <input type="number" min="0" max="999" placeholder="0" disabled={isLocked} value={data.seasonalAbsent} onChange={e => update("seasonalAbsent", e.target.value)} />
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* OT */}
            {isOTLocked ? (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>🔒 OT đã bị khóa (quá 1 ngày)</div>
            ) : !data.showOT ? (
                <button type="button" className="ghost-btn" style={{ marginTop: 8, padding: "8px", width: "100%", border: "1.5px dashed #f97316", background: "#fff7ed", color: "#c2410c" }} onClick={() => update("showOT", true)}>
                    + Thêm báo cơm Tăng ca (OT)
                </button>
            ) : (
                <>
                    <div className="subsection-label" style={{ marginTop: 8 }}>⏰ Tăng ca (OT) <span className="opt-tag">nếu có</span></div>
                    <div className="row2">
                        <div className="field-sm" style={{ flex: 1, width: "100%" }}>
                            <label>Tổng phần OT</label>
                            <input type="number" min="0" max="999" placeholder="0" value={data.otTotal} onChange={e => update("otTotal", e.target.value)} />
                        </div>
                    </div>
                    {hasOT && (
                        <div className="breakdown-box" style={{ marginTop: 12 }}>
                            <div className="breakdown-total">Tổng OT: <strong>{otTotalN} phần</strong></div>
                            <div className="breakdown-row">
                                <div className="breakdown-item man">
                                    <span>🍖 Mặn</span>
                                    <strong>{otMalanN}</strong>
                                </div>
                                <div className="breakdown-sep">+</div>
                                <div className="breakdown-item chay">
                                    <span>🥬 Chay</span>
                                    <input
                                        type="number" min="0" max={otTotalN} placeholder="0"
                                        value={data.otVeg}
                                        onChange={e => update("otVeg", e.target.value)}
                                        className="chay-input"
                                    />
                                </div>
                                <div className="breakdown-sep">= {otTotalN}</div>
                            </div>
                            {otChayN > otTotalN && <div className="breakdown-warn">⚠️ Số chay không thể lớn hơn tổng!</div>}

                            <div className="ot-time-row" style={{ marginTop: 12, borderTop: "1px dashed #e2e8f0", paddingTop: 12 }}>
                                <span>🕐 Giờ ăn OT:</span>
                                <input
                                    type="time"
                                    value={data.otTime || (OT_DEFAULT_TIME[shiftVal ?? ""] ?? "")}
                                    onChange={e => update("otTime", e.target.value)}
                                    className="time-input"
                                />
                            </div>
                        </div>
                    )}
                    <button type="button" className="ghost-btn" style={{ marginTop: 6, padding: "8px", fontSize: 13, color: "#ef4444", border: "1px solid #fee2e2", background: "#fef2f2" }} onClick={() => { update("showOT", false); update("otTotal", ""); update("otVeg", ""); }}>
                        ❌ Hủy báo OT ca này
                    </button>
                </>
            )}
        </div>
    )
}

const FullScreenLoader = ({ text }: { text: string }) => (
    <div className="pro-loader-wrapper">
        <style>{`
            .pro-loader-wrapper {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: #fafafa;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                z-index: 99999;
                font-family: var(--font-sans), sans-serif;
            }
            .pro-spin-container {
                position: relative;
                width: 90px; height: 90px;
                display: flex; align-items: center; justify-content: center;
                margin-bottom: 24px;
            }
            .pro-pulse-ring {
                position: absolute; width: 100%; height: 100%;
                border-radius: 28px;
                background: linear-gradient(135deg, #e30613 0%, #f97316 100%);
                opacity: 0.15;
                animation: pulseGlowPro 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }
            .pro-pulse-ring-2 {
                position: absolute; width: 100%; height: 100%;
                border-radius: 28px;
                border: 2px solid transparent;
                background: linear-gradient(135deg, #e30613, #f97316) border-box;
                -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
                -webkit-mask-composite: destination-out;
                mask-composite: exclude;
                animation: spinSoft 3s linear infinite;
            }
            .pro-logo-box {
                position: relative; z-index: 2;
                width: 64px; height: 64px;
                background: white;
                border-radius: 18px;
                box-shadow: 0 8px 24px rgba(227, 6, 19, 0.12);
                display: flex; align-items: center; justify-content: center;
                animation: floatLogo 4s ease-in-out infinite;
            }
            .pro-text {
                font-size: 15px; font-weight: 600;
                color: #64748b;
                letter-spacing: 0.5px;
                animation: fadeInOutText 2s ease-in-out infinite;
            }
            .pro-progress-bar {
                position: absolute; bottom: 0; left: 0; width: 100%; height: 4px;
                background: #f1f5f9;
            }
            .pro-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #e30613, #f97316);
                width: 30%;
                border-radius: 0 4px 4px 0;
                animation: loadingSlide 2s ease-in-out infinite alternate;
            }
            @keyframes pulseGlowPro { 0%, 100% { transform: scale(1); opacity: 0.15; } 50% { transform: scale(1.3); opacity: 0; } }
            @keyframes spinSoft { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            @keyframes floatLogo { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
            @keyframes fadeInOutText { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
            @keyframes loadingSlide { 0% { width: 10%; transform: translateX(-10%); } 100% { width: 60%; transform: translateX(180%); } }
        `}</style>

        <div className="pro-spin-container">
            <div className="pro-pulse-ring" />
            <div className="pro-pulse-ring-2" />
            <div className="pro-logo-box">
                <IntersnackLogo className="w-10 h-10" />
            </div>
        </div>

        <div className="pro-text">{text}</div>

        <div className="pro-progress-bar">
            <div className="pro-progress-fill" />
        </div>
    </div>
)


const CountdownWidget = ({ now }: { now: Date | null }) => {
    if (!now) return null;

    const vnDateString = now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    const vnNow = new Date(vnDateString)
    const currentMins = vnNow.getHours() * 60 + vnNow.getMinutes();

    let targetMins = 0;
    let targetLabel = "";

    if (currentMins < 10 * 60) {
        targetMins = 10 * 60;
        targetLabel = "Ca 1";
    } else if (currentMins < 15 * 60 + 30) {
        targetMins = 15 * 60 + 30;
        targetLabel = "Ca 2";
    } else {
        return (
            <div className="countdown-widget done">
                <div className="cw-icon">✅</div>
                <div>
                    <div className="cw-title">Đã qua giờ khóa Ca 1 & Ca 2</div>
                    <div className="cw-sub">Ca 3 và OT vẫn cập nhật bình thường.</div>
                </div>
            </div>
        )
    }

    const diffMinsTotal = targetMins - currentMins - 1;
    const diffSecs = 59 - vnNow.getSeconds();
    const h = Math.floor(diffMinsTotal / 60);
    const m = diffMinsTotal % 60;
    const s = diffSecs;

    const isUrgent = diffMinsTotal < 30;

    return (
        <div className={`countdown-widget ${isUrgent ? "urgent" : "active"}`}>
            <div className="cw-icon">{isUrgent ? "⏳" : "⏱️"}</div>
            <div className="cw-content">
                <div className="cw-title">Sắp khóa báo cơm <strong>{targetLabel}</strong></div>
                <div className="cw-timer">
                    Còn <span>{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>
                </div>
            </div>
        </div>
    )
}


export default function PublicMealPage() {
    const [depts, setDepts] = useState<Dept[]>([])
    const [loading, setLoading] = useState(true)
    const [pageMode, setPageMode] = useState<PageMode>("report")
    const [showRecruit, setShowRecruit] = useState(false)

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

    // Existing record state for pre-fill / update detection
    const [existingRecord, setExistingRecord] = useState<Record<string, any> | null>(null)
    const [existingLoading, setExistingLoading] = useState(false)
    const [isUpdate, setIsUpdate] = useState(false)

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
        // Normalize department name: Title Case with special handling for known variants
        const normalizeDeptName = (name: string): string => {
            if (name.includes("Loan")) return "Manual Grading (Ms Huệ)"
            // Title Case: capitalize first letter of each word, lowercase the rest
            return name
                .toLowerCase()
                .replace(/\b\w/g, c => c.toUpperCase())
        }

        const mergedMap = new Map<string, SummaryRow>()
        const rawRows: SummaryRow[] = data.summary ?? []
        for (const r of rawRows) {
            const deptName = normalizeDeptName(r.department_name)
            const shift = r.shift === "HC" ? "1" : r.shift
            const key = `${deptName.toLowerCase()}|${shift}`
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

    // Timer for countdown
    const [now, setNow] = useState<Date | null>(null)
    useEffect(() => {
        setNow(new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })))
        const timer = setInterval(() => {
            setNow(new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })))
        }, 1000)
        return () => clearInterval(timer)
    }, [])

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
    const hideSeasonal = !!(selectedDept && ["BOILER", "QC", "OFFICE", "MAINT_SHELL", "MAINT_HCA", "CLEAN"].includes(selectedDept.code))
    const hideAbsent = selectedDept?.code === "BOILER"

    const otSelectedDept = depts.find(d => d.id === otDeptId)
    const isOtHpeel = otSelectedDept?.code === "HPEEL" || otSelectedDept?.code === "HAND"
    const isOtOffice = otSelectedDept?.code === "OFFICE"
    const otShifts = (isOtOffice || isOtHpeel) ? SHIFTS_WITH_HC : SHIFTS_NORMAL
    const activeMultiShifts = selectedDept?.code === "CLEAN" ? ["1", "2"] : MULTI_SHIFTS

    const isStep1Complete = !!deptId && (!isHpeel || !!hpeelSub);
    const isStep2Complete = isStep1Complete && (isMultiShift ? !!workDate : (!!shift && !!workDate));
    const isOtStep1Complete = !!otDeptId && (!isOtHpeel || !!otHpeelSub);

    const getEffectiveDeptName = (id = deptId, sub = hpeelSub) => {
        const dept = depts.find(d => d.id === id)
        if ((dept?.code === "HPEEL" || dept?.code === "HAND") && sub) return HPEEL_SUBGROUPS.find(s => s.key === sub)?.dept_name ?? dept.name_en
        return dept?.name_en ?? ""
    }

    const buildRow = (data: ShiftData, shiftVal: string): ConfirmRow => {
        const otMalan = calcMalan(data.otTotal, data.otVeg)
        const timeNote = (n(data.otTotal) > 0 && data.otTime) ? `Giờ ăn OT: ${data.otTime}` : ""
        const name = reporterName.trim()
        // Build reporter_name cleanly: "Tên | Giờ ăn OT: HH:MM" or just one of them
        const parts = [name, timeNote].filter(Boolean)
        return {
            department_id: deptId, department_name: getEffectiveDeptName(),
            work_date: workDate, shift: shiftVal,
            official_present: n(data.officialPresent), seasonal_present: n(data.seasonalPresent),
            official_absent: n(data.officialAbsent), seasonal_absent: n(data.seasonalAbsent),
            ot_count: otMalan,
            vegetarian: n(data.vegCount),
            ot_vegetarian: n(data.otVeg),
            reporter_name: parts.join(" | "),
        }
    }

    // Auto-fetch existing record when dept + shift + date are selected
    const fetchExistingRecord = async (depId: string, sh: string, dt: string, sub: string) => {
        if (!depId || !sh || !dt) return
        setExistingLoading(true)
        try {
            const dName = getEffectiveDeptName(depId, sub)
            const url = `/api/public-meal?dept_id=${depId}&work_date=${dt}&shift=${sh}&dept_name=${encodeURIComponent(dName)}`
            const res = await fetch(url)
            const data = await res.json()
            if (data.record) {
                setExistingRecord(data.record)
                setIsUpdate(true)
                // Pre-fill form with existing data
                const rec = data.record
                // Restore OT time from saved note, fallback to shift default
                const savedOtTime = extractOtTimeFromNote(rec.note) ?? OT_DEFAULT_TIME[sh] ?? ""
                setSingleData({
                    officialPresent: String(rec.official_present ?? 0),
                    seasonalPresent: String(rec.seasonal_present ?? 0),
                    officialAbsent: String(rec.official_absent ?? 0),
                    seasonalAbsent: String(rec.seasonal_absent ?? 0),
                    vegCount: String(rec.vegetarian ?? 0),
                    otTotal: String((rec.ot_count ?? 0) + (rec.ot_vegetarian ?? 0)),
                    otVeg: String(rec.ot_vegetarian ?? 0),
                    otTime: savedOtTime,
                    showOT: ((rec.ot_count ?? 0) + (rec.ot_vegetarian ?? 0)) > 0,
                })
            } else {
                setExistingRecord(null)
                setIsUpdate(false)
            }
        } catch { /* ignore */ }
        setExistingLoading(false)
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
        // Attach old_data to each row if updating
        const payload = confirmRows.map(r => ({
            ...r,
            old_data: isUpdate && existingRecord ? {
                official_present: existingRecord.official_present ?? 0,
                seasonal_present: existingRecord.seasonal_present ?? 0,
                vegetarian: existingRecord.vegetarian ?? 0,
                ot_count: existingRecord.ot_count ?? 0,
                ot_vegetarian: existingRecord.ot_vegetarian ?? 0,
            } : null,
        }))
        const res = await fetch("/api/public-meal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        const data = await res.json()
        setSubmitting(false)
        if (data.success) { setSuccess(true); setShowConfirm(false) }
        else { setError(data.error || "Có lỗi xảy ra"); setShowConfirm(false) }
    }

    const handleReset = () => {
        setSuccess(false); setShowConfirm(false); setError("")
        setDeptId(""); setHpeelSub(""); setShift("")
        setSingleData(blank()); setMultiData({ "1": blank("1"), "2": blank("2"), "3": blank("3") })
        setConfirmRows([]); setExistingRecord(null); setIsUpdate(false)
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
        // Restore saved OT time from note, fallback to shift default
        const savedTime = extractOtTimeFromNote(rec.note) ?? OT_DEFAULT_TIME[otShift] ?? ""
        setOtNewTime(savedTime)
        setOtStep("edit")  // department_name stored in rec.department_name for exact upsert matching
    }

    const handleOtSubmit = async () => {
        setOtSubmitting(true); setOtError("")
        // Use DB department_name from the found record to ensure upsert targets the right row.
        // Fallback to UI-generated name only if no existing record was found.
        const deptName = otRecord?.department_name ?? getEffectiveDeptName(otDeptId, otHpeelSub)
        const otMalan = calcMalan(otNewTotal, otNewVeg)
        // Build reporter_name with OT time only (no pipe prefix)
        const timeNote = otNewTime ? `Giờ ăn OT: ${otNewTime}` : ""
        const payload = {
            department_id: otDeptId, department_name: deptName,
            work_date: otDate, shift: otShift,
            official_present: otRecord?.official_present ?? 0,
            seasonal_present: otRecord?.seasonal_present ?? 0,
            official_absent: otRecord?.official_absent ?? 0,
            seasonal_absent: otRecord?.seasonal_absent ?? 0,
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

    if (loading) return <FullScreenLoader text="Đang tải dữ liệu..." />

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

        // Group reported rows by shift
        const byShift: Record<string, SummaryRow[]> = { "1": [], "2": [], "3": [] }
        for (const r of sumRows) {
            const s = r.shift === "HC" ? "1" : r.shift
            if (byShift[s]) byShift[s].push(r)
        }

        // Compute missing depts per shift (depts that haven't reported)
        const reportedDeptsByShift: Record<string, Set<string>> = {
            "1": new Set(byShift["1"].map(r => r.department_name)),
            "2": new Set(byShift["2"].map(r => r.department_name)),
            "3": new Set(byShift["3"].map(r => r.department_name)),
        }
        // We expect all non-maintenance, non-boiler departments to report; OFFICE only Ca 1
        const expectedDepts = depts.filter(d => !["BOILER", "RCN"].includes(d.code))
        const getMissing = (shift: string) => {
            const expected = (shift === "3"
                ? expectedDepts.filter(d => d.code !== "CLEAN")
                : expectedDepts
            ).filter(d => !(["OFFICE", "MAINT_HCA", "MAINT_SHELL"].includes(d.code) && shift !== "1"))
            return expected.filter(d => {
                const reportedSet = reportedDeptsByShift[shift] ?? new Set()
                // Direct match by name (case-insensitive)
                if ([...reportedSet].some(rn => rn.toLowerCase() === d.name_en.toLowerCase())) return false
                // PEEL reports as "Peeling" or "Peeling MC"
                if (d.code === "PEEL") {
                    return ![...reportedSet].some(rn => rn.toLowerCase().includes("peeling"))
                }
                // HPEEL reports as subgroup names containing "hand", "manual" or "grading"
                if (d.code === "HPEEL") {
                    return ![...reportedSet].some(rn =>
                        rn.toLowerCase().includes("manual") || rn.toLowerCase().includes("grading") || rn.toLowerCase().includes("hand")
                    )
                }
                return true
            })
        }

        const sumDateDisplay = sumLoaded ? (() => {
            const d = new Date(sumDate + "T00:00:00")
            return `${VN_DAYS[d.getDay()]}, ${format(d, "dd/MM/yyyy")}`
        })() : "Chọn ngày để xem"

        return (
            <PageShell header={{ icon: "📊", title: "Tổng hợp báo cơm", sub: sumDateDisplay }}>
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

                {sumLoaded && (
                    <>
                        {/* KPI cards */}
                        {sumRows.length > 0 && (
                            <div className="kpi-row">
                                <div className="kpi-card orange">
                                    <div className="kpi-val">{totalRow.present}</div>
                                    <div className="kpi-label">👥 Tổng HD</div>
                                </div>
                                <div className="kpi-card blue">
                                    <div className="kpi-val">{totalRow.malan + totalRow.chay}</div>
                                    <div className="kpi-label">🍽️ Tổng suất</div>
                                </div>
                                <div className="kpi-card green">
                                    <div className="kpi-val">{totalRow.otMalan + totalRow.otChay}</div>
                                    <div className="kpi-label">⏰ Tổng OT</div>
                                </div>
                            </div>
                        )}

                        {/* Per-shift breakdown */}
                        {ALL_SHIFTS.map(shiftNum => {
                            const rows = byShift[shiftNum]
                            const missing = getMissing(shiftNum)
                            if (rows.length === 0 && missing.length === 0) return null
                            const shiftTotal = rows.reduce((acc, r) => acc + r.official_present + r.seasonal_present, 0)
                            const shiftMalan = rows.reduce((acc, r) => acc + Math.max(0, r.official_present + r.seasonal_present - r.vegetarian), 0)
                            const shiftChay = rows.reduce((acc, r) => acc + r.vegetarian, 0)
                            const shiftOT = rows.reduce((acc, r) => acc + r.ot_count + r.ot_vegetarian, 0)
                            const shiftOTMalan = rows.reduce((acc, r) => acc + r.ot_count, 0)
                            const shiftOTChay = rows.reduce((acc, r) => acc + r.ot_vegetarian, 0)
                            return (
                                <div key={shiftNum} style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <div style={{ fontWeight: 800, fontSize: 14, color: '#c2410c' }}>Ca {shiftNum}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textAlign: 'right', lineHeight: 1.7 }}>
                                            <div>HD: {shiftTotal} · 🍖 {shiftMalan} · 🥬 {shiftChay}</div>
                                            {shiftOT > 0 && <div style={{ color: '#7c3aed' }}>OT: {shiftOT} · 🍖 {shiftOTMalan} · 🥬 {shiftOTChay}</div>}
                                        </div>
                                    </div>
                                    {rows.length > 0 && (
                                        <div className="sum-table-wrap">
                                            <table className="sum-table">
                                                <thead>
                                                    <tr>
                                                        <th>Bộ phận</th>
                                                        <th>🍖</th>
                                                        <th>🥬</th>
                                                        <th>OT🍖</th>
                                                        <th>OT🥬</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {rows.map((r, i) => {
                                                        const malan = Math.max(0, r.official_present + r.seasonal_present - r.vegetarian)
                                                        return (
                                                            <tr key={i}>
                                                                <td className="td-dept">{r.department_name}</td>
                                                                <td className="td-malan">{malan}</td>
                                                                <td className="td-chay">{r.vegetarian}</td>
                                                                <td className="td-ot">{r.ot_count}</td>
                                                                <td className="td-ot">{r.ot_vegetarian}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    {missing.length > 0 && (
                                        <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '10px 12px', marginTop: rows.length > 0 ? 8 : 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 4 }}>⚠️ Chưa báo cơm Ca {shiftNum}:</div>
                                            <div style={{ fontSize: 12, color: '#a16207', lineHeight: 1.7 }}>
                                                {missing.map(d => d.name_en).join(' · ')}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        <div className="sum-note">📞 Dữ liệu do các bộ phận tự báo. Sai sót liên hệ <a href="https://zalo.me/84393984738" target="_blank" style={{ color: "#0284c7", fontWeight: "bold", textDecoration: "underline" }} rel="noreferrer">Zalo Ms. Chi</a>.</div>
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
                    <p className="success-sub">Sai sót liên hệ <a href="https://zalo.me/84393984738" target="_blank" style={{ color: "#0284c7", fontWeight: "bold", textDecoration: "underline" }} rel="noreferrer">Zalo Ms. Chi</a> nhé!</p>
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
                <div className="contact-note">📞 Có sai sót liên hệ <a href="https://zalo.me/84393984738" target="_blank" style={{ color: "#0284c7", fontWeight: "bold", textDecoration: "underline" }} rel="noreferrer">Zalo Ms. Chi</a> nhé!</div>
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
                    <div className="field-sm" style={{ flex: 1, width: "100%" }}>
                        <label>Tổng phần OT</label>
                        <input type="number" min="0" max="999" placeholder="0" value={otNewTotal} onChange={e => setOtNewTotal(e.target.value)} />
                    </div>
                </div>
                {n(otNewTotal) > 0 && (
                    <div className="breakdown-box" style={{ marginTop: 12 }}>
                        <div className="breakdown-total">Tổng OT mới: <strong>{otNewTotal} phần</strong></div>
                        <div className="breakdown-row">
                            <div className="breakdown-item man">
                                <span>🍖 Mặn</span>
                                <strong>{calcMalan(otNewTotal, otNewVeg)}</strong>
                            </div>
                            <div className="breakdown-sep">+</div>
                            <div className="breakdown-item chay">
                                <span>🥬 Chay</span>
                                <input
                                    type="number" min="0" max={n(otNewTotal)} placeholder="0"
                                    value={otNewVeg}
                                    onChange={e => setOtNewVeg(e.target.value)}
                                    className="chay-input"
                                />
                            </div>
                            <div className="breakdown-sep">= {otNewTotal}</div>
                        </div>
                        {n(otNewVeg) > n(otNewTotal) && <div className="breakdown-warn">⚠️ Số chay không thể lớn hơn tổng!</div>}

                        <div className="ot-time-row" style={{ marginTop: 12, borderTop: "1px dashed #e2e8f0", paddingTop: 12 }}>
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
                <div style={{ padding: "16px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "16px" }}>
                    <div className="section-label">1️⃣ Chọn bộ phận</div>
                    <div className="field-sm">
                        <label>Bộ phận <span className="req">*</span></label>
                        <select value={otDeptId} onChange={e => { setOtDeptId(e.target.value); setOtHpeelSub(""); setOtShift("") }}>
                            <option value="">— Chọn bộ phận —</option>
                            {depts.map((d, idx) => <option key={d.id} value={d.id}>{idx + 1}. {d.name_en}</option>)}
                        </select>
                    </div>
                    {isOtHpeel && (
                        <div className="field-sm" style={{ marginTop: 12 }}>
                            <label>Tổ trưởng <span className="req">*</span></label>
                            <HpeelPicker value={otHpeelSub} onChange={v => {
                                setOtHpeelSub(v);
                                if (v === "HPEEL_LOAN") setOtShift("HC");
                            }} />
                        </div>
                    )}
                </div>

                {isOtStep1Complete && (
                    <div style={{ padding: "16px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "16px", animation: "fadeIn 0.3s ease-in-out" }}>
                        <div className="section-label">2️⃣ Chọn ca & ngày</div>
                        <div className="field-sm"><label>Ca <span className="req">*</span></label><ShiftPills value={otShift} onChange={s => { setOtShift(s) }} arr={otShifts} /></div>
                        <div className="field-sm"><label>Ngày <span className="req">*</span></label>
                            <input type="date" value={otDate} onChange={e => setOtDate(e.target.value)} min={format(new Date(), "yyyy-MM-dd")} max={format(new Date(), "yyyy-MM-dd")} />
                        </div>
                        {otNotFound && <div className="err-box">⚠️ Không tìm thấy bản ghi. Kiểm tra lại bộ phận / ca / ngày.</div>}
                        {otError && <div className="err-box">⚠️ {otError}</div>}
                        <button className="primary-btn" onClick={handleOtLookup} disabled={otLooking || !otDeptId || !otShift}>
                            {otLooking ? "⏳ Đang tìm..." : "🔍 Xem OT đã báo"}
                        </button>
                    </div>
                )}
                <button className="ghost-btn" style={{ marginTop: 16 }} onClick={() => { setPageMode("report"); resetOt() }}>← Về báo cơm</button>
            </PageShell>
        )
    }

    // ─────── REPORT MODE ───────
    if (showConfirm) return (
        <PageShell header={{ icon: "🔍", title: isUpdate ? "⚠️ Xác nhận THAY ĐỔI báo cơm" : "Xác nhận báo cơm", sub: "Kiểm tra trước khi gửi" }}>
            {isUpdate && existingRecord && (
                <div className="update-warning-box">
                    <div className="update-warning-title">⚠️ BẠN ĐANG THAY ĐỔI DỮ LIỆU ĐÃ BÁO!</div>
                    <div className="update-warning-sub">Dữ liệu cũ sẽ bị ghi đè. Vui lòng kiểm tra kỹ.</div>
                    <div className="compare-card" style={{ marginTop: 10 }}>
                        <div className="compare-col old">
                            <div className="compare-label">📋 Cũ</div>
                            <div className="compare-sub">BCT: {existingRecord.official_present ?? 0} · TV: {existingRecord.seasonal_present ?? 0}</div>
                            <div className="compare-sub">Chay: {existingRecord.vegetarian ?? 0}</div>
                            <div className="compare-sub">OT: {(existingRecord.ot_count ?? 0) + (existingRecord.ot_vegetarian ?? 0)}</div>
                        </div>
                        <div className="compare-arrow">→</div>
                        <div className="compare-col new">
                            <div className="compare-label">✏️ Mới</div>
                            <div className="compare-sub">BCT: {confirmRows[0]?.official_present ?? 0} · TV: {confirmRows[0]?.seasonal_present ?? 0}</div>
                            <div className="compare-sub">Chay: {confirmRows[0]?.vegetarian ?? 0}</div>
                            <div className="compare-sub">OT: {(confirmRows[0]?.ot_count ?? 0) + (confirmRows[0]?.ot_vegetarian ?? 0)}</div>
                        </div>
                    </div>
                </div>
            )}
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
            <div className="contact-note">📞 Sai sót liên hệ <a href="https://zalo.me/84393984738" target="_blank" style={{ color: "#0284c7", fontWeight: "bold", textDecoration: "underline" }} rel="noreferrer">Zalo Ms. Chi (+84393984738)</a> để điều chỉnh nhé!</div>
            <button className="primary-btn" onClick={handleSubmit} disabled={submitting} style={isUpdate ? { background: "#dc2626" } : {}}>
                {submitting ? "⏳ Đang gửi..." : isUpdate ? "⚠️ Xác nhận THAY ĐỔI" : "✅ Xác nhận & Gửi báo cơm"}
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
                <p className="success-sub">Cảm ơn bạn đã báo cơm! 🙏<br /><small>Sai sót liên hệ <a href="https://zalo.me/84393984738" target="_blank" style={{ color: "#0284c7", fontWeight: "bold", textDecoration: "underline" }} rel="noreferrer">Zalo Ms. Chi (+84393984738)</a> nhé!</small></p>
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
            {(submitting || sumLoading || existingLoading || otLooking || otSubmitting) && (
                <FullScreenLoader text={
                    submitting ? "Đang gửi báo cáo..." :
                        sumLoading ? "Đang lấy tổng hợp..." :
                            existingLoading ? "Đang kiểm tra lịch sử..." :
                                otSubmitting ? "Đang cập nhật OT..." :
                                    otLooking ? "Đang tìm dữ liệu OT..." : "Đang xử lý..."
                } />
            )}

            <div className="app-header">
                <div className="bg-white rounded-lg shadow-sm w-[44px] h-[44px] overflow-hidden flex items-center justify-center shrink-0 border border-slate-100">
                    <IntersnackLogo className="w-9 h-9" />
                </div>
                <div style={{ flex: 1 }}>
                    <div className="app-title">Báo Cơm Nhà Máy</div>
                    <div className="app-sub">VICC Long An · Intersnack Cashew Vietnam</div>
                </div>
                {now && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: '#c2410c' }}>{VN_DAYS[now.getDay()]}</div>
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{format(now, 'dd/MM/yyyy')}</div>
                    </div>
                )}
            </div>

            <div className="mode-tabs">
                <button type="button" className={`mode-tab ${pageMode === "report" ? "active" : ""}`} onClick={() => setPageMode("report")}>🍽️ Báo cơm</button>
                <button type="button" className={`mode-tab ${(pageMode as string) === "edit-ot" ? "active" : ""}`} onClick={() => { setPageMode("edit-ot"); resetOt() }}>⏰ Sửa OT</button>
                <button type="button" className={`mode-tab ${(pageMode as string) === "summary" ? "active" : ""}`} onClick={() => { setPageMode("summary" as PageMode); if (!sumLoaded) loadSummary(sumDate) }}>📊 Tổng hợp</button>
            </div>

            {pageMode === "report" && (
                <>
                    <CountdownWidget now={now} />
                </>
            )}

            <form onSubmit={handlePreview}>
                <div style={{ padding: "16px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                    <div className="section-label">1️⃣ Chọn bộ phận</div>
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
                            {depts.map((d, idx) => <option key={d.id} value={d.id}>{idx + 1}. {d.name_en}</option>)}
                        </select>
                    </div>
                    {isHpeel && (
                        <div className="field-sm" style={{ marginTop: 12 }}>
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
                </div>

                {isStep1Complete && (
                    <div style={{ padding: "16px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "16px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", animation: "fadeIn 0.3s ease-in-out" }}>
                        <div className="section-label">2️⃣ Chọn ca & ngày</div>
                        {isMultiShift ? (
                            <div className="field-sm">
                                <label>Ngày <span className="req">*</span></label>
                                <input type="date" value={workDate} onChange={e => {
                                    setWorkDate(e.target.value);
                                    if (deptId && e.target.value) {
                                        setExistingRecord(null); setIsUpdate(false);
                                        // For multi-shift departments, we're not pre-filling existing records yet in this UI.
                                    }
                                }} min={getMinDate()} max={format(new Date(), "yyyy-MM-dd")} required />
                            </div>
                        ) : (
                            <div className="row2" style={{ marginBottom: 14 }}>
                                <div className="field-sm">
                                    <label>Ca làm <span className="req">*</span></label>
                                    <ShiftPills value={shift} onChange={v => {
                                        setShift(v); updateSingle("otTime", OT_DEFAULT_TIME[v] ?? "")
                                        if (deptId && v && workDate) {
                                            setExistingRecord(null); setIsUpdate(false)
                                            fetchExistingRecord(deptId, v, workDate, hpeelSub)
                                        }
                                    }} arr={shifts} />
                                </div>
                                <div className="field-sm">
                                    <label>Ngày <span className="req">*</span></label>
                                    <input type="date" value={workDate} onChange={e => {
                                        const dt = e.target.value;
                                        setWorkDate(dt);
                                        if (deptId && shift && dt) {
                                            setExistingRecord(null); setIsUpdate(false)
                                            fetchExistingRecord(deptId, shift, dt, hpeelSub)
                                        }
                                    }} min={getMinDate()} max={format(new Date(), "yyyy-MM-dd")} required />
                                </div>
                            </div>
                        )}
                        {existingLoading && <div className="info-banner" style={{ marginTop: 8 }}>⏳ Đang kiểm tra dữ liệu đã báo...</div>}
                        {isUpdate && existingRecord && (
                            <div className="update-warning-box" style={{ marginTop: 8 }}>
                                <div className="update-warning-title">⚠️ Ca này đã được báo cơm rồi!</div>
                                <div className="update-warning-sub">Dữ liệu cũ đã được điền sẵn bên dưới. Bạn có thể chỉnh sửa rồi gửi lại để cập nhật.</div>
                                <div style={{ fontSize: 12, marginTop: 6, color: "#92400e" }}>
                                    BCT: {existingRecord.official_present ?? 0} · TV: {existingRecord.seasonal_present ?? 0} · Chay: {existingRecord.vegetarian ?? 0} · OT: {(existingRecord.ot_count ?? 0) + (existingRecord.ot_vegetarian ?? 0)}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {isStep2Complete && (
                    <div style={{ padding: "16px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "16px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", animation: "fadeIn 0.3s ease-in-out" }}>
                        <div className="section-label">3️⃣ Khai báo số lượng</div>
                        {isMultiShift ? (
                            <>
                                <div className="info-banner" style={{ marginBottom: 16 }}>📌 Điền thông tin cho cả {activeMultiShifts.length} ca bên dưới</div>
                                {activeMultiShifts.map(s => (
                                    <ShiftFields key={s} shiftLabel={`Ca ${s}`} shiftVal={s} data={multiData[s]} update={(f, v) => updateMulti(s, f, v)} workDateStr={workDate} hideSeasonal={hideSeasonal} hideAbsent={hideAbsent} />
                                ))}
                            </>
                        ) : (
                            <ShiftFields data={singleData} update={updateSingle} shiftVal={shift} workDateStr={workDate} hideSeasonal={hideSeasonal} hideAbsent={hideAbsent} />
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
                    </div>
                )}
            </form>

            <div style={{ margin: "16px 0 0 0", display: 'flex', justifyContent: 'center' }}>
                <button
                    type="button"
                    onClick={() => setShowRecruit(true)}
                    style={{
                        background: 'linear-gradient(to right, #059669, #10b981)',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '20px',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                    }}>
                    📢 Thông tin tuyển dụng
                </button>
            </div>

            {showRecruit && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
                }}>
                    <div style={{
                        background: 'white', borderRadius: 16, padding: '24px 20px',
                        width: '100%', maxWidth: 400, position: 'relative',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
                    }}>
                        <button
                            type="button"
                            onClick={() => setShowRecruit(false)}
                            style={{
                                position: 'absolute', top: 12, right: 12,
                                background: '#f1f5f9', border: 'none', borderRadius: '50%',
                                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#475569', fontWeight: 'bold', cursor: 'pointer'
                            }}>
                            ✕
                        </button>
                        <h3 style={{ color: '#059669', fontSize: 18, fontWeight: 800, marginTop: 0, marginBottom: 8, textAlign: 'center' }}>
                            📢 TUYỂN DỤNG NHÂN VIÊN QC
                        </h3>
                        <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
                            <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 12, textAlign: 'center' }}>🏢 CÔNG TY TNHH ĐIỀU INTERSNACK VIỆT NAM</p>

                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <li><strong>👨‍🏭 Số lượng:</strong> 04 Nhân viên QC</li>
                                <li><strong>🎓 Yêu cầu:</strong> Tốt nghiệp ngành Công nghệ Thực phẩm</li>
                                <li>
                                    <strong>⏰ Thời gian làm việc:</strong><br />
                                    <span style={{ paddingLeft: 12, display: 'inline-block' }}>• Thứ 2 – Thứ 7</span><br />
                                    <span style={{ paddingLeft: 12, display: 'inline-block' }}>• Làm việc theo 3 ca (xoay ca hàng tuần)</span>
                                </li>
                                <li><strong>💰 Thu nhập:</strong> Thỏa thuận</li>
                                <li><strong>⚡ Phỏng vấn – nhận việc ngay</strong></li>
                            </ul>

                            <div style={{ marginTop: 16, padding: '10px 12px', background: '#fef2f2', border: '1px dashed #fecaca', borderRadius: 8, color: '#dc2626', fontWeight: 600, textAlign: 'center', fontSize: 13, boxShadow: '0 1px 2px rgba(220, 38, 38, 0.05)' }}>
                                🎁 Thưởng nóng 500.000 VNĐ nếu giới thiệu thành công ứng viên!
                            </div>

                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #cbd5e1', textAlign: 'center' }}>
                                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>📞 Liên hệ (Zalo)</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>0906 724 716</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0ea5e9' }}>Chị Quế Anh (Phòng Nhân sự)</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {pageMode === "report" && (
                <div className="info-banner" style={{ marginTop: 16, background: "#f0fdfa", color: "#0f766e", border: "1px solid #ccfbf1", borderRadius: 8, padding: 12 }}>
                    <strong>📌 Quy định báo cơm:</strong>
                    <ul style={{ marginLeft: 20, marginTop: 4, listStyleType: "disc", lineHeight: "1.5" }}>
                        <li><strong>Ca 1:</strong> Khóa lúc 10:00</li>
                        <li><strong>Ca 2:</strong> Khóa lúc 15:30</li>
                        <li><strong>Ca 3:</strong> Cập nhật bình thường</li>
                        <li><strong>OT (Tăng ca):</strong> Luôn cập nhật bình thường (chọn "Sửa OT").</li>
                    </ul>
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #99f6e4", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 16 }}>📞</span>
                        <span>Sai sót/Trễ giờ, liên hệ <a href="https://zalo.me/84393984738" target="_blank" style={{ color: "#0284c7", fontWeight: "bold", textDecoration: "underline" }} rel="noreferrer">Zalo Ms. Chi (+84393984738)</a></span>
                    </div>
                </div>
            )}
        </PageShell >
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

            /* Update warning */
            .update-warning-box {
                background: #fef3c7; border: 2px solid #f59e0b; border-radius: 12px;
                padding: 14px 16px; margin-bottom: 14px;
                animation: shake 0.4s ease;
            }
            @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
            .update-warning-title {
                font-size: 14px; font-weight: 800; color: #92400e;
                margin-bottom: 4px;
            }
            .update-warning-sub {
                font-size: 13px; color: #a16207; line-height: 1.5;
            }

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

            /* Full Screen Loader */
            .full-screen-loader {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(8px);
                z-index: 9999; display: flex; align-items: center; justify-content: center;
            }
            .loader-card {
                background: white; border: 1.5px solid #e2e8f0; border-radius: 20px;
                padding: 24px 32px; display: flex; flex-direction: column; align-items: center;
                box-shadow: 0 10px 40px rgba(0,0,0,0.08);
            }
            .loader-logo-spin { width: 64px; height: 64px; border-radius: 16px; border: 1px solid #f1f5f9; background: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05); animation: spinLogo 1.5s cubic-bezier(0.5, 0, 0.5, 1) infinite; margin-bottom: 16px; }
            @keyframes spinLogo { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(360deg); } }
            .loader-text { font-size: 15px; font-weight: 700; color: #ea580c; margin-bottom: 8px; }
            .loader-dots { display: flex; gap: 6px; }
            .ldot { width: 8px; height: 8px; border-radius: 50%; background: #fb923c; animation: bounce 1.4s infinite ease-in-out both; }
            @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

            /* Countdown Widget */
            .countdown-widget { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
            .countdown-widget.active { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1.5px solid #bbf7d0; }
            .countdown-widget.urgent { background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 1.5px solid #fecaca; animation: pulseGlow 2s infinite; }
            .countdown-widget.done { background: #f8fafc; border: 1.5px solid #e2e8f0; }
            @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
            .cw-icon { font-size: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
            .cw-title { font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 2px; }
            .cw-title strong { color: #1e293b; font-weight: 800; }
            .cw-timer { font-size: 13px; color: #64748b; font-weight: 600; }
            .cw-timer span { font-size: 18px; font-weight: 800; color: #16a34a; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
            .countdown-widget.urgent .cw-timer span { color: #dc2626; }
            .countdown-widget.done .cw-title { color: #1e293b; }
            .countdown-widget.done .cw-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
            
            /* Locked state */
            .shift-block.locked { opacity: 0.8; background: #f1f5f9; border-color: #cbd5e1; }
            .locked-badge { font-size: 11px; background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-weight: 700; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1); }

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

