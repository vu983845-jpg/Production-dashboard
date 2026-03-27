"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { format, endOfMonth, differenceInMinutes, parseISO } from "date-fns"
import { AlertTriangle, Plus, Trash2, BarChart2, ClipboardEdit, Clock, CheckCircle, XCircle, Download } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// ── REASON CODES (matching DDS Meeting exactly) ──────────────────────────────
const REASON_CODES = [
    { code: "BD", label: "BD – Breakdown", planned: false, desc: "Hư hỏng sửa chữa" },
    { code: "BL", label: "BL – Blocked", planned: false, desc: "Bị chặn / tắc nghẽn" },
    { code: "BT", label: "BT – Breaktime", planned: true, desc: "Dừng nghỉ" },
    { code: "CIL", label: "CIL – Cleaning", planned: true, desc: "Vệ sinh thiết bị" },
    { code: "LU", label: "LU – Lack of Utility", planned: false, desc: "Thiếu nguồn lực / điện / hơi" },
    { code: "MP", label: "MP – Maintenance Plan", planned: true, desc: "Bảo dưỡng định kỳ" },
    { code: "MS", label: "MS – Minor Stop", planned: false, desc: "Dừng nhỏ / lỗi vặt" },
    { code: "PF", label: "PF – Process Failures", planned: false, desc: "Lỗi quy trình" },
    { code: "PT", label: "PT – Pit Stop", planned: true, desc: "Pit Stop" },
    { code: "PW", label: "PW – Project Work", planned: true, desc: "Thực hiện dự án" },
    { code: "SP", label: "SP – Sampling", planned: false, desc: "Lấy mẫu" },
    { code: "TP", label: "TP – Trial Plan", planned: true, desc: "Thử nghiệm" },
    { code: "TT", label: "TT – Training Time", planned: true, desc: "Đào tạo" },
    { code: "WT", label: "WT – Waiting", planned: false, desc: "Chờ đợi" },
]

const SEVERITY_LEVELS = [
    { value: "Thấp", label: "🟢 Thấp" },
    { value: "Trung bình", label: "🟡 Trung bình" },
    { value: "Cao", label: "🟠 Cao" },
    { value: "Rất nghiêm trọng", label: "🔴 Rất nghiêm trọng" },
]

const PIE_COLORS = ["#e63121", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#64748b", "#06b6d4", "#84cc16", "#f97316", "#a855f7", "#14b8a6", "#eab308"]

const now = () => format(new Date(), "yyyy-MM-dd'T'HH:mm")
const currentYear = new Date().getFullYear()

const SHELLING_LINES = [
    { value: "Line A", label: "Line A" },
    { value: "Line B", label: "Line B" },
    { value: "Line C", label: "Line C" },
    { value: "Line D1", label: "Line D1" },
    { value: "Line D2", label: "Line D2" },
    { value: "Other", label: "Khác (Other)" },
]

function calcDuration(start: string, end: string): number {
    try {
        const s = parseISO(start)
        const e = parseISO(end)
        return Math.max(0, differenceInMinutes(e, s))
    } catch { return 0 }
}

export default function DowntimePage() {
    const supabase = createClient()

    const [profile, setProfile] = useState<any>(null)
    const [departments, setDepartments] = useState<any[]>([])

    // ── ENTRY FORM ──────────────────────────────────────────────────────────
    const [entryDeptId, setEntryDeptId] = useState("")
    const [machineArea, setMachineArea] = useState("")
    const [machineAreaOther, setMachineAreaOther] = useState("")
    const [severity, setSeverity] = useState("Trung bình")
    const [reasonCode, setReasonCode] = useState("BD")
    const [description, setDescription] = useState("")
    const [startTime, setStartTime] = useState(now())
    const [endTime, setEndTime] = useState("")
    const [isOngoing, setIsOngoing] = useState(false)
    const [excludeDowntime, setExcludeDowntime] = useState(false)
    const [detailNote, setDetailNote] = useState("")
    const [saving, setSaving] = useState(false)
    const [saveMsg, setSaveMsg] = useState("")

    // ── EVENTS LIST ────────────────────────────────────────────────────────
    const [filterDept, setFilterDept] = useState("")
    const [filterStatus, setFilterStatus] = useState("all")
    const [events, setEvents] = useState<any[]>([])
    const [loadingEvents, setLoadingEvents] = useState(false)

    // ── REPORT ──────────────────────────────────────────────────────────────
    const [reportDeptId, setReportDeptId] = useState("")
    const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1)
    const [reportYear, setReportYear] = useState(currentYear)
    const [reportRange, setReportRange] = useState("month")
    const [reportEvents, setReportEvents] = useState<any[]>([])
    const [loadingReport, setLoadingReport] = useState(false)

    // ── CLOSE DIALOG ────────────────────────────────────────────────────────
    const [closingEvent, setClosingEvent] = useState<any>(null)
    const [closeTime, setCloseTime] = useState("")
    const [closing, setClosing] = useState(false)

    // Load profile & depts
    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single()
            setProfile(prof)
            const { data: allDepts } = await supabase.from("departments").select("id, code, name_vi, name_en").order("sort_order")
            if (allDepts) setDepartments(allDepts)
            if (prof?.department_id) {
                setEntryDeptId(prof.department_id)
                setFilterDept(prof.department_id)
                setReportDeptId(prof.department_id)
            }
        }
        load()
    }, [])

    const allowedDeptIds = useMemo(() => {
        if (!profile) return []
        if (["admin", "HSE", "hse", "maint"].includes(profile.role)) return departments.map(d => d.id)
        const ids = []
        if (profile.department_id) ids.push(profile.department_id)
        if (profile.secondary_department_id) ids.push(profile.secondary_department_id)
        return ids
    }, [profile, departments])

    const allowedDepts = useMemo(() => departments.filter(d => allowedDeptIds.includes(d.id)), [departments, allowedDeptIds])

    // Detect if selected dept is Shelling
    const isShelling = useMemo(() => {
        const d = departments.find(d => d.id === entryDeptId)
        return d?.code === "SHELL"
    }, [entryDeptId, departments])

    // Final machine area value
    const finalMachineArea = isShelling && machineArea === "Other" ? machineAreaOther : machineArea

    // ── Fetch events list ─────────────────────────────────────────────────
    const fetchEvents = useCallback(async () => {
        setLoadingEvents(true)
        let q = supabase.from("downtime_events")
            .select("*, departments(id, name_vi, code)")
            .order("start_time", { ascending: false })
            .limit(100)
        if (filterDept) q = q.eq("department_id", filterDept)
        if (filterStatus === "open") q = q.eq("is_ongoing", true)
        if (filterStatus === "closed") q = q.eq("is_ongoing", false)
        const { data } = await q
        setEvents(data || [])
        setLoadingEvents(false)
    }, [filterDept, filterStatus])

    useEffect(() => { fetchEvents() }, [fetchEvents])

    // ── Add event ────────────────────────────────────────────────────────
    const handleAdd = async () => {
        if (!entryDeptId || !startTime) {
            setSaveMsg("❌ Vui lòng chọn bộ phận và thời gian bắt đầu.")
            setTimeout(() => setSaveMsg(""), 3000)
            return
        }
        setSaving(true)
        const { data: { user } } = await supabase.auth.getUser()

        let durationMins = 0
        let status = "Open"
        if (!isOngoing && endTime) {
            durationMins = calcDuration(startTime, endTime)
            status = "Closed"
        }

        const { error } = await supabase.from("downtime_events").insert({
            department_id: entryDeptId,
            work_date: startTime.split("T")[0],
            start_time: startTime,
            end_time: isOngoing ? null : (endTime || null),
            duration_mins: durationMins,
            root_cause: reasonCode,
            machine_area: finalMachineArea || null,
            severity: severity,
            description: description || null,
            note: detailNote || null,
            is_ongoing: isOngoing,
            exclude_downtime: excludeDowntime,
            status: status,
            created_by: user?.id
        })
        setSaving(false)
        if (error) {
            setSaveMsg("❌ Lỗi: " + error.message)
        } else {
            setSaveMsg("✅ Đã ghi nhận sự cố!")
            setMachineArea(""); setMachineAreaOther(""); setDescription(""); setDetailNote(""); setStartTime(now()); setEndTime(""); setIsOngoing(false); setExcludeDowntime(false)
            fetchEvents()
        }
        setTimeout(() => setSaveMsg(""), 3000)
    }

    // ── Close an ongoing event (dialog) ──────────────────────────────────
    const openCloseDialog = (ev: any) => {
        setClosingEvent(ev)
        setCloseTime(now())
    }
    const confirmClose = async () => {
        if (!closingEvent || !closeTime) return
        setClosing(true)
        const mins = calcDuration(closingEvent.start_time, closeTime)
        await supabase.from("downtime_events").update({
            end_time: closeTime,
            duration_mins: mins,
            is_ongoing: false,
            status: "Closed"
        }).eq("id", closingEvent.id)
        setClosingEvent(null)
        setClosing(false)
        fetchEvents()
    }

    const handleDelete = async (id: string) => {
        await supabase.from("downtime_events").delete().eq("id", id)
        fetchEvents()
    }

    // ── Report ────────────────────────────────────────────────────────────
    const fetchReport = useCallback(async () => {
        setLoadingReport(true)
        const start = format(new Date(reportYear, reportMonth - 1, 1), "yyyy-MM-dd")
        const end = format(endOfMonth(new Date(reportYear, reportMonth - 1, 1)), "yyyy-MM-dd")

        let q = supabase.from("downtime_events")
            .select("*, departments(name_vi, code)")
            .gte("work_date", start)
            .lte("work_date", end)
            .order("work_date", { ascending: false })
            .order("start_time", { ascending: false })
            // No exclude_downtime filter: show ALL events, even those not counted as downtime
        if (reportDeptId) q = q.eq("department_id", reportDeptId)
        const { data } = await q
        setReportEvents(data || [])
        setLoadingReport(false)
    }, [reportDeptId, reportMonth, reportYear])

    // Match DDS: calculate duration from start→end (or start→now for open events)
    const calcMins = (e: DowntimeEvent) => {
        if (e.start_time) {
            const end = e.end_time ? new Date(e.end_time) : new Date()
            return Math.max(0, Math.round((end.getTime() - new Date(e.start_time).getTime()) / 60000))
        }
        return e.duration_mins || 0
    }

    // Only count events that should be counted as downtime
    const totMins = useMemo(() => reportEvents.filter(e => !e.exclude_downtime).reduce((s, e) => s + calcMins(e), 0), [reportEvents])
    const openCount = useMemo(() => reportEvents.filter(e => e.is_ongoing).length, [reportEvents])

    // Pie by reason code (only counting events that are real downtime)
    const pieData = useMemo(() => {
        const map: Record<string, number> = {}
        reportEvents.filter(e => !e.exclude_downtime).forEach(e => { map[e.root_cause] = (map[e.root_cause] || 0) + calcMins(e) })
        return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    }, [reportEvents])

    // Bar by dept (only counting real downtime events)
    const deptBarData = useMemo(() => {
        const map: Record<string, number> = {}
        reportEvents.filter(e => !e.exclude_downtime).forEach(e => {
            const d = e.departments?.name_vi || e.departments?.code || "—"
            map[d] = (map[d] || 0) + calcMins(e)
        })
        return Object.entries(map).map(([name, value]) => ({ name, value: +(value / 60).toFixed(2) })).sort((a, b) => b.value - a.value)
    }, [reportEvents])

    const openEvents = events.filter(e => e.is_ongoing)

    // ── Export downtime report to CSV ─────────────────────────────────────
    const handleExportDowntime = () => {
        if (!reportEvents.length) return
        const headers = ["Ngày", "Bộ phận", "Mã", "Mô tả mã", "Khu vực máy", "Mô tả sự cố", "Mức độ", "Bắt đầu", "Kết thúc", "Phút DT", "Tính DT?", "Trạng thái", "Ghi chú"]
        const rows = reportEvents.map(ev => {
            const rc = REASON_CODES.find(r => r.code === ev.root_cause)
            const mins = calcMins(ev)
            const tinhDT = ev.exclude_downtime ? "Không" : "Có"
            const status = ev.is_ongoing ? "Open" : "Closed"
            const startStr = ev.start_time ? format(parseISO(ev.start_time), "HH:mm dd/MM/yyyy") : ev.work_date
            const endStr = ev.end_time ? format(parseISO(ev.end_time), "HH:mm dd/MM/yyyy") : ""
            return [
                ev.work_date,
                `"${ev.departments?.name_vi || ev.departments?.code || ""}",`,
                ev.root_cause,
                `"${rc?.desc || ""}",`,
                `"${ev.machine_area || ""}",`,
                `"${(ev.description || "").replace(/"/g, "'")}",`,
                ev.severity,
                startStr,
                endStr,
                mins,
                tinhDT,
                status,
                `"${(ev.detail_note || "").replace(/"/g, "'")}"`
            ].join(",")
        })
        const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n")
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.setAttribute("download", `Downtime_T${reportMonth}_${reportYear}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <AlertTriangle className="h-7 w-7 text-red-500" />
                <div>
                    <h1 className="text-2xl font-black">Quản lý Sự cố / Downtime</h1>
                    <p className="text-sm text-muted-foreground">Ghi nhận và theo dõi sự cố dừng máy theo tiêu chuẩn DDS</p>
                </div>
            </div>

            {/* ── CLOSE DIALOG MODAL ── */}
            {closingEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border p-6 w-full max-w-sm mx-4">
                        <h2 className="font-black text-lg mb-1">⏹ Đóng sự cố</h2>
                        <p className="text-sm text-muted-foreground mb-4">
                            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{closingEvent.root_cause}</span>
                            {" "}{closingEvent.departments?.name_vi || closingEvent.departments?.code}
                            {closingEvent.machine_area ? ` — ${closingEvent.machine_area}` : ""}
                        </p>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Bắt đầu</label>
                                <p className="text-sm font-medium">{closingEvent.start_time ? format(parseISO(closingEvent.start_time), "HH:mm dd/MM/yyyy") : "—"}</p>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Thời gian đóng *</label>
                                <input
                                    type="datetime-local"
                                    value={closeTime}
                                    onChange={e => setCloseTime(e.target.value)}
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            {closeTime && closingEvent.start_time && (
                                <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-1.5">
                                    ⏱ Thời lượng: <strong>{calcDuration(closingEvent.start_time, closeTime)} phút</strong>
                                    {" "}({(calcDuration(closingEvent.start_time, closeTime) / 60).toFixed(1)}h)
                                </p>
                            )}
                            <div className="flex gap-2 pt-1">
                                <Button onClick={confirmClose} disabled={closing || !closeTime} className="flex-1 gap-1">
                                    <CheckCircle className="h-4 w-4" />{closing ? "Đang lưu..." : "Xác nhận Đóng"}
                                </Button>
                                <Button variant="outline" onClick={() => setClosingEvent(null)} className="flex-1">
                                    Huỷ
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Tabs defaultValue="entry">
                <TabsList className="w-full grid grid-cols-3">
                    <TabsTrigger value="entry" className="gap-1.5"><ClipboardEdit className="h-4 w-4" />Ghi nhận</TabsTrigger>
                    <TabsTrigger value="list" className="gap-1.5 relative">
                        <Clock className="h-4 w-4" />Danh sách
                        {openEvents.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{openEvents.length}</span>}
                    </TabsTrigger>
                    <TabsTrigger value="report" className="gap-1.5"><BarChart2 className="h-4 w-4" />Báo cáo</TabsTrigger>
                </TabsList>

                {/* ── ENTRY TAB ────────────────────────────────────────────── */}
                <TabsContent value="entry" className="mt-4">
                    <Card>
                        <CardHeader className="pb-3 border-b">
                            <CardTitle className="text-sm font-bold">Ghi nhận Sự cố Mới</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Dept */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Bộ phận *</label>
                                    <select value={entryDeptId} onChange={e => setEntryDeptId(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                        <option value="">-- Chọn bộ phận --</option>
                                        {allowedDepts.map(d => <option key={d.id} value={d.id}>{d.name_vi || d.name_en}</option>)}
                                    </select>
                                </div>
                                {/* Machine area: dropdown for Shelling, text for others */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Máy móc / Khu vực</label>
                                    {isShelling ? (
                                        <>
                                            <select value={machineArea} onChange={e => { setMachineArea(e.target.value); if (e.target.value !== "Other") setMachineAreaOther("") }}
                                                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                                <option value="">-- Chọn line bị sự cố --</option>
                                                {SHELLING_LINES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                                            </select>
                                            {machineArea === "Other" && (
                                                <input type="text" value={machineAreaOther} onChange={e => setMachineAreaOther(e.target.value)}
                                                    placeholder="Nhập tên máy / khu vực khác..."
                                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary mt-1" />
                                            )}
                                        </>
                                    ) : (
                                        <input type="text" value={machineArea} onChange={e => setMachineArea(e.target.value)}
                                            placeholder="VD: Line A, Máy bóc vỏ..."
                                            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                                    )}
                                </div>
                                {/* Severity */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Mức độ</label>
                                    <select value={severity} onChange={e => setSeverity(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                        {SEVERITY_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                                {/* Reason code */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Mã Lý do *</label>
                                    <select value={reasonCode} onChange={e => setReasonCode(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                        <optgroup label="🔴 Không có kế hoạch">
                                            {REASON_CODES.filter(r => !r.planned).map(r => (
                                                <option key={r.code} value={r.code}>{r.label} — {r.desc}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="🟢 Có kế hoạch">
                                            {REASON_CODES.filter(r => r.planned).map(r => (
                                                <option key={r.code} value={r.code}>{r.label} — {r.desc}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>
                                {/* Start time */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Bắt đầu *</label>
                                    <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                                </div>
                                {/* End time - hidden if ongoing */}
                                {!isOngoing && (
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-semibold text-muted-foreground uppercase">Kết thúc</label>
                                        <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)}
                                            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                                        {startTime && endTime && (
                                            <span className="text-xs text-muted-foreground">
                                                ≈ <strong>{calcDuration(startTime, endTime)} phút</strong> ({(calcDuration(startTime, endTime) / 60).toFixed(1)}h)
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* Description */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Mô tả ngắn</label>
                                <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                                    placeholder="Tóm tắt sự cố..."
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Ghi chú chi tiết & Hành động khắc phục</label>
                                <textarea value={detailNote} onChange={e => setDetailNote(e.target.value)}
                                    rows={2} placeholder="Nguyên nhân chi tiết, hành động đã thực hiện..."
                                    className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                            </div>
                            {/* Checkboxes */}
                            <div className="flex flex-wrap gap-5">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={isOngoing} onChange={e => setIsOngoing(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary" />
                                    <span>⏳ Đang tiếp diễn (chưa xử lý xong)</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={excludeDowntime} onChange={e => setExcludeDowntime(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary" />
                                    <span>⛔ Không tính vào Downtime (chỉ theo dõi)</span>
                                </label>
                            </div>
                            <div className="flex items-center gap-3 pt-1 border-t">
                                <Button onClick={handleAdd} disabled={saving} className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    {saving ? "Đang lưu..." : "Ghi nhận sự cố"}
                                </Button>
                                {saveMsg && <span className="text-sm font-medium">{saveMsg}</span>}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── LIST TAB ──────────────────────────────────────────────── */}
                <TabsContent value="list" className="mt-4 space-y-4">
                    {/* Open events alert */}
                    {openEvents.filter(e => !e.exclude_downtime).length > 0 && (
                        <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock className="h-5 w-5 text-orange-600 shrink-0" />
                                <p className="font-bold text-orange-800">
                                    ⚠️ Có {openEvents.filter(e => !e.exclude_downtime).length} sự cố đang tính downtime chưa đóng!
                                </p>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                {openEvents.filter(e => !e.exclude_downtime).map(ev => (
                                    <div key={ev.id} className="flex items-center justify-between bg-white/80 rounded-lg px-3 py-2 border border-orange-200">
                                        <div className="flex items-center gap-2 text-sm flex-wrap">
                                            <span className="font-mono text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-bold">{ev.root_cause}</span>
                                            <span className="font-semibold text-slate-700">{ev.departments?.name_vi || ev.departments?.code}</span>
                                            {ev.machine_area && <span className="text-muted-foreground text-xs">— {ev.machine_area}</span>}
                                            <span className="text-xs text-muted-foreground">▶ {ev.start_time ? format(parseISO(ev.start_time), "HH:mm dd/MM") : ev.work_date}</span>
                                        </div>
                                        <Button size="sm" className="h-7 text-xs gap-1 bg-orange-500 hover:bg-orange-600 text-white shrink-0"
                                            onClick={() => openCloseDialog(ev)}>
                                            <CheckCircle className="h-3 w-3" />Đóng
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3">
                        <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                            <option value="">Tất cả bộ phận</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name_vi || d.name_en}</option>)}
                        </select>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                            <option value="all">Tất cả trạng thái</option>
                            <option value="open">🔵 Đang mở (Open)</option>
                            <option value="closed">🟢 Đã đóng (Closed)</option>
                        </select>
                    </div>

                    {loadingEvents ? (
                        <p className="text-sm text-muted-foreground">Đang tải...</p>
                    ) : events.length === 0 ? (
                        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground italic">Không có sự cố nào.</CardContent></Card>
                    ) : (
                        <div className="space-y-2">
                            {events.map(ev => {
                                const rc = REASON_CODES.find(r => r.code === ev.root_cause)
                                return (
                                    <Card key={ev.id} className={`border-l-4 ${ev.is_ongoing ? "border-l-blue-500" : "border-l-green-500"}`}>
                                        <CardContent className="py-3 px-4">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ev.is_ongoing ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                                                            {ev.is_ongoing ? "Open" : "Closed"}
                                                        </span>
                                                        <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{ev.root_cause}</span>
                                                        {rc && <span className="text-xs text-muted-foreground">{rc.desc}</span>}
                                                        {ev.exclude_downtime && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Không tính DT</span>}
                                                    </div>
                                                    <p className="text-sm font-semibold mt-1">{ev.departments?.name_vi || ev.departments?.code} {ev.machine_area ? `— ${ev.machine_area}` : ""}</p>
                                                    {ev.description && <p className="text-sm text-muted-foreground">{ev.description}</p>}
                                                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                                        <span>▶ {ev.start_time ? format(parseISO(ev.start_time), "HH:mm dd/MM/yy") : ev.work_date}</span>
                                                        {!ev.is_ongoing && ev.end_time && <span>⏹ {format(parseISO(ev.end_time), "HH:mm dd/MM/yy")}</span>}
                                                        {!ev.is_ongoing && <span className="text-red-600 font-bold">⏱ {ev.duration_mins} phút ({(ev.duration_mins / 60).toFixed(1)}h)</span>}
                                                        <span>📊 {ev.severity}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1 shrink-0">
                                                    {ev.is_ongoing && (
                                                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                                                            onClick={() => openCloseDialog(ev)}>
                                                            <CheckCircle className="h-3 w-3" />Đóng
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600"
                                                        onClick={() => handleDelete(ev.id)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* ── REPORT TAB ────────────────────────────────────────────── */}
                <TabsContent value="report" className="mt-4 space-y-4">
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Tháng</label>
                                    <select value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Năm</label>
                                    <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                                        {[currentYear - 1, currentYear].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Bộ phận</label>
                                    <select value={reportDeptId} onChange={e => setReportDeptId(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                                        <option value="">Tất cả</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name_vi || d.name_en}</option>)}
                                    </select>
                                </div>
                                <Button onClick={fetchReport} disabled={loadingReport}>{loadingReport ? "Đang tải..." : "Xem báo cáo"}</Button>
                                <Button variant="outline" onClick={handleExportDowntime} disabled={reportEvents.length === 0} className="gap-1.5">
                                    <Download className="h-4 w-4" /> Xuất Excel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {reportEvents.length > 0 && (
                        <>
                            {/* KPI */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Card className="p-4"><span className="text-xs text-muted-foreground uppercase font-semibold">Tổng sự cố</span><p className="text-2xl font-black mt-1">{reportEvents.length}</p></Card>
                                <Card className="p-4"><span className="text-xs text-muted-foreground uppercase font-semibold">Tổng Downtime</span><p className="text-2xl font-black mt-1 text-red-600">{(totMins / 60).toFixed(1)} <span className="text-base">h</span></p></Card>
                                <Card className="p-4"><span className="text-xs text-muted-foreground uppercase font-semibold">Đang mở</span><p className="text-2xl font-black mt-1 text-blue-600">{openCount}</p></Card>
                                <Card className="p-4"><span className="text-xs text-muted-foreground uppercase font-semibold">Tỉ lệ xử lý</span><p className="text-2xl font-black mt-1 text-green-600">{reportEvents.length > 0 ? (((reportEvents.length - openCount) / reportEvents.length) * 100).toFixed(0) : 0}%</p></Card>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Pie by reason code */}
                                <Card>
                                    <CardHeader className="pb-2 border-b"><CardTitle className="text-sm font-bold">Phân bổ theo Mã Lý do (giờ)</CardTitle></CardHeader>
                                    <CardContent className="pt-4">
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={pieData.map(d => ({ ...d, value: +(d.value / 60).toFixed(2) }))}
                                                        dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                                                        label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""}
                                                        labelLine={false}>
                                                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                                    </Pie>
                                                    <Tooltip formatter={(v: any) => [`${v}h`, "Downtime"]} contentStyle={{ fontSize: "12px" }} />
                                                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Bar by dept */}
                                <Card>
                                    <CardHeader className="pb-2 border-b"><CardTitle className="text-sm font-bold">Downtime theo Bộ phận (giờ)</CardTitle></CardHeader>
                                    <CardContent className="pt-4">
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={deptBarData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                                    <XAxis type="number" tick={{ fontSize: 10 }} />
                                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                                                    <Tooltip formatter={(v: any) => [`${v}h`, "Downtime"]} contentStyle={{ fontSize: "12px" }} />
                                                    <Bar dataKey="value" name="Downtime (h)" fill="#e63121" radius={[0, 4, 4, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Detail table */}
                            <Card>
                                <CardHeader className="pb-2 border-b"><CardTitle className="text-sm font-bold">Danh sách chi tiết</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto mt-2">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b bg-muted/40">
                                                    <th className="text-left p-2 font-semibold">Ngày</th>
                                                    <th className="text-left p-2 font-semibold">Bộ phận</th>
                                                    <th className="text-left p-2 font-semibold">Mã</th>
                                                    <th className="text-left p-2 font-semibold">Khu vực</th>
                                                    <th className="text-right p-2 font-semibold">Phút</th>
                                                    <th className="text-left p-2 font-semibold">Trạng thái</th>
                                                    <th className="text-left p-2 font-semibold">Mô tả</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {reportEvents.map(ev => (
                                                    <tr key={ev.id} className="border-b hover:bg-muted/20">
                                                        <td className="p-2 whitespace-nowrap">{ev.work_date}</td>
                                                        <td className="p-2 whitespace-nowrap">{ev.departments?.name_vi || ev.departments?.code}</td>
                                                        <td className="p-2"><span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{ev.root_cause}</span></td>
                                                        <td className="p-2 text-xs text-muted-foreground">{ev.machine_area || "—"}</td>
                                                        <td className="p-2 text-right font-bold text-red-600">{ev.is_ongoing ? "⏳" : ev.duration_mins}</td>
                                                        <td className="p-2">
                                                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${ev.is_ongoing ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                                                                {ev.is_ongoing ? "Open" : "Closed"}
                                                            </span>
                                                        </td>
                                                        <td className="p-2 text-xs text-muted-foreground">{ev.description || "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {/* Reason Code Reference */}
                    <Card>
                        <CardHeader className="pb-2 border-b">
                            <CardTitle className="text-sm font-bold">📋 Danh mục Mã Sự cố</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-[12px]">
                                <div className="font-semibold text-red-600 col-span-full mb-1">🔴 Không có kế hoạch — tính vào Downtime</div>
                                {REASON_CODES.filter(r => !r.planned).map(r => (
                                    <div key={r.code} className="flex gap-2 items-start">
                                        <span className="font-mono font-black text-red-700 w-9 shrink-0 bg-red-50 px-1 rounded text-center">{r.code}</span>
                                        <div>
                                            <span className="font-semibold text-slate-800">{r.label.replace(`${r.code} – `, '')}</span>
                                            <span className="text-slate-500"> — {r.desc}</span>
                                        </div>
                                    </div>
                                ))}
                                <div className="font-semibold text-green-700 col-span-full mt-3 mb-1">🟢 Có kế hoạch — thường không tính Downtime</div>
                                {REASON_CODES.filter(r => r.planned).map(r => (
                                    <div key={r.code} className="flex gap-2 items-start">
                                        <span className="font-mono font-black text-green-700 w-9 shrink-0 bg-green-50 px-1 rounded text-center">{r.code}</span>
                                        <div>
                                            <span className="font-semibold text-slate-800">{r.label.replace(`${r.code} – `, '')}</span>
                                            <span className="text-slate-500"> — {r.desc}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
