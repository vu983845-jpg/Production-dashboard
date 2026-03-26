"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { format, startOfMonth, endOfMonth } from "date-fns"
import { AlertTriangle, Plus, Trash2, BarChart2, ClipboardEdit } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const ROOT_CAUSES = [
    "Lỗi Máy Móc (Hardware)",
    "Lỗi Điện / Mất điện",
    "Đợi Vật Tư / Nguyên liệu",
    "Lỗi Chất lượng / Thay đổi Quy Cách",
    "Bảo trì Định kỳ (PM)",
    "Tai nạn / Sự cố An toàn",
    "Khác",
]

const PIE_COLORS = ["#e63121", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#94a3b8"]

const currentYear = new Date().getFullYear()

export default function DowntimePage() {
    const supabase = createClient()

    // Profile
    const [profile, setProfile] = useState<any>(null)
    const [departments, setDepartments] = useState<any[]>([])

    // Entry tab state
    const [entryDeptId, setEntryDeptId] = useState("")
    const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [entryDuration, setEntryDuration] = useState("")
    const [entryRootCause, setEntryRootCause] = useState(ROOT_CAUSES[0])
    const [entryNote, setEntryNote] = useState("")
    const [saving, setSaving] = useState(false)
    const [saveMsg, setSaveMsg] = useState("")

    // Events list for entry tab
    const [events, setEvents] = useState<any[]>([])
    const [loadingEvents, setLoadingEvents] = useState(false)

    // Report tab state
    const [reportDeptId, setReportDeptId] = useState("")
    const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1)
    const [reportYear, setReportYear] = useState(currentYear)
    const [reportEvents, setReportEvents] = useState<any[]>([])
    const [loadingReport, setLoadingReport] = useState(false)

    // Load profile & depts
    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: prof } = await supabase.from("profiles").select("*, departments(id, code, name_vi, name_en)").eq("id", user.id).single()
            setProfile(prof)

            const { data: allDepts } = await supabase.from("departments").select("id, code, name_vi, name_en").order("sort_order")
            if (allDepts) setDepartments(allDepts)

            // Default to user's dept
            if (prof?.department_id) {
                setEntryDeptId(prof.department_id)
                setReportDeptId(prof.department_id)
            }
        }
        load()
    }, [])

    // Determine allowed departments for input
    const allowedDeptIds = useMemo(() => {
        if (!profile) return []
        const role = profile.role
        if (["admin", "HSE", "maint"].includes(role)) {
            return departments.map(d => d.id) // all departments
        }
        const ids = []
        if (profile.department_id) ids.push(profile.department_id)
        if (profile.secondary_department_id) ids.push(profile.secondary_department_id)
        return ids
    }, [profile, departments])

    const allowedDepts = useMemo(() => departments.filter(d => allowedDeptIds.includes(d.id)), [departments, allowedDeptIds])

    // Fetch events for entry tab
    const fetchEvents = useCallback(async () => {
        if (!entryDeptId || !entryDate) return
        setLoadingEvents(true)
        const { data } = await supabase
            .from("downtime_events")
            .select("*")
            .eq("department_id", entryDeptId)
            .eq("work_date", entryDate)
            .order("created_at")
        setEvents(data || [])
        setLoadingEvents(false)
    }, [entryDeptId, entryDate])

    useEffect(() => { fetchEvents() }, [fetchEvents])

    const handleAdd = async () => {
        if (!entryDeptId || !entryDate || !entryDuration || !entryRootCause) {
            setSaveMsg("❌ Vui lòng điền đầy đủ thông tin.")
            setTimeout(() => setSaveMsg(""), 3000)
            return
        }
        setSaving(true)
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase.from("downtime_events").insert({
            department_id: entryDeptId,
            work_date: entryDate,
            duration_mins: parseInt(entryDuration),
            root_cause: entryRootCause,
            note: entryNote || null,
            created_by: user?.id
        })
        setSaving(false)
        if (error) {
            setSaveMsg("❌ Lỗi: " + error.message)
        } else {
            setSaveMsg("✅ Đã thêm sự cố!")
            setEntryDuration("")
            setEntryNote("")
            fetchEvents()
        }
        setTimeout(() => setSaveMsg(""), 3000)
    }

    const handleDelete = async (id: string) => {
        await supabase.from("downtime_events").delete().eq("id", id)
        fetchEvents()
    }

    const totalMins = events.reduce((s, e) => s + e.duration_mins, 0)

    // Fetch report
    const fetchReport = useCallback(async () => {
        setLoadingReport(true)
        const start = format(new Date(reportYear, reportMonth - 1, 1), "yyyy-MM-dd")
        const end = format(endOfMonth(new Date(reportYear, reportMonth - 1, 1)), "yyyy-MM-dd")

        let query = supabase.from("downtime_events").select("*, departments(name_vi, code)").gte("work_date", start).lte("work_date", end)
        if (reportDeptId) query = query.eq("department_id", reportDeptId)
        const { data } = await query
        setReportEvents(data || [])
        setLoadingReport(false)
    }, [reportDeptId, reportMonth, reportYear])

    // Pie chart: by root cause
    const pieData = useMemo(() => {
        const map: Record<string, number> = {}
        reportEvents.forEach(e => {
            map[e.root_cause] = (map[e.root_cause] || 0) + e.duration_mins
        })
        return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    }, [reportEvents])

    // Bar chart: by date
    const barData = useMemo(() => {
        const map: Record<string, number> = {}
        reportEvents.forEach(e => {
            const d = format(new Date(e.work_date), "dd/MM")
            map[d] = (map[d] || 0) + e.duration_mins
        })
        return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([name, value]) => ({ name, value }))
    }, [reportEvents])

    const totalReportMins = reportEvents.reduce((s, e) => s + e.duration_mins, 0)

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <AlertTriangle className="h-7 w-7 text-red-500" />
                <div>
                    <h1 className="text-2xl font-black">Quản lý Sự cố / Downtime</h1>
                    <p className="text-sm text-muted-foreground">Nhập và theo dõi thời gian dừng máy theo bộ phận</p>
                </div>
            </div>

            <Tabs defaultValue="entry">
                <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="entry" className="gap-2"><ClipboardEdit className="h-4 w-4" />Nhập Sự cố</TabsTrigger>
                    <TabsTrigger value="report" className="gap-2"><BarChart2 className="h-4 w-4" />Báo cáo</TabsTrigger>
                </TabsList>

                {/* ── ENTRY TAB ── */}
                <TabsContent value="entry" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-bold">Thêm sự cố mới</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Bộ phận</label>
                                    <select value={entryDeptId} onChange={e => setEntryDeptId(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                        <option value="">-- Chọn bộ phận --</option>
                                        {allowedDepts.map(d => <option key={d.id} value={d.id}>{d.name_vi || d.name_en}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Ngày</label>
                                    <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Thời gian dừng (phút)</label>
                                    <input type="number" min="1" value={entryDuration} onChange={e => setEntryDuration(e.target.value)}
                                        placeholder="VD: 30"
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Nguyên nhân</label>
                                    <select value={entryRootCause} onChange={e => setEntryRootCause(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                        {ROOT_CAUSES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Ghi chú (tuỳ chọn)</label>
                                <input type="text" value={entryNote} onChange={e => setEntryNote(e.target.value)}
                                    placeholder="Mô tả thêm..."
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                            <div className="flex items-center gap-3">
                                <Button onClick={handleAdd} disabled={saving} className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    {saving ? "Đang lưu..." : "Thêm sự cố"}
                                </Button>
                                {saveMsg && <span className="text-sm font-medium">{saveMsg}</span>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Events list for selected date/dept */}
                    {entryDeptId && entryDate && (
                        <Card>
                            <CardHeader className="pb-2 border-b">
                                <div className="flex justify-between items-center">
                                    <CardTitle className="text-sm font-bold">
                                        Sự cố ngày {format(new Date(entryDate), "dd/MM/yyyy")}
                                    </CardTitle>
                                    <span className="text-sm font-bold text-red-600">
                                        Tổng: {totalMins} phút ({(totalMins / 60).toFixed(1)} h)
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-3">
                                {loadingEvents ? (
                                    <p className="text-sm text-muted-foreground">Đang tải...</p>
                                ) : events.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic">Chưa có sự cố nào được ghi nhận.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {events.map(ev => (
                                            <div key={ev.id} className="flex items-start justify-between gap-2 p-2 rounded-lg border bg-muted/30 text-sm">
                                                <div>
                                                    <span className="font-bold text-red-600">{ev.duration_mins} phút</span>
                                                    <span className="mx-2 text-muted-foreground">—</span>
                                                    <span className="font-semibold">{ev.root_cause}</span>
                                                    {ev.note && <p className="text-xs text-muted-foreground mt-0.5">{ev.note}</p>}
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                                                    onClick={() => handleDelete(ev.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* ── REPORT TAB ── */}
                <TabsContent value="report" className="space-y-4 mt-4">
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Tháng</label>
                                    <select value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
                                            <option key={m} value={m}>Tháng {m}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Năm</label>
                                    <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                        {[currentYear - 1, currentYear].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Bộ phận</label>
                                    <select value={reportDeptId} onChange={e => setReportDeptId(e.target.value)}
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                        <option value="">Tất cả</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name_vi || d.name_en}</option>)}
                                    </select>
                                </div>
                                <Button onClick={fetchReport} disabled={loadingReport} className="gap-2">
                                    {loadingReport ? "Đang tải..." : "Xem báo cáo"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {reportEvents.length > 0 && (
                        <>
                            {/* KPI summary */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <Card className="p-4 flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground uppercase font-semibold">Tổng sự cố</span>
                                    <span className="text-2xl font-black text-red-600">{reportEvents.length}</span>
                                </Card>
                                <Card className="p-4 flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground uppercase font-semibold">Tổng thời gian dừng</span>
                                    <span className="text-2xl font-black text-red-600">{totalReportMins} phút</span>
                                    <span className="text-xs text-muted-foreground">≈ {(totalReportMins / 60).toFixed(1)} giờ</span>
                                </Card>
                                <Card className="p-4 flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground uppercase font-semibold">TB / Sự cố</span>
                                    <span className="text-2xl font-black">{(totalReportMins / reportEvents.length).toFixed(0)} phút</span>
                                </Card>
                            </div>

                            {/* Charts */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Pie */}
                                <Card>
                                    <CardHeader className="pb-2 border-b">
                                        <CardTitle className="text-sm font-bold">Phân bổ theo Nguyên nhân</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-4">
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                                                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                                                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                                    </Pie>
                                                    <Tooltip formatter={(v: any) => [`${v} phút`, "Downtime"]} contentStyle={{ fontSize: "12px" }} />
                                                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Bar by date */}
                                <Card>
                                    <CardHeader className="pb-2 border-b">
                                        <CardTitle className="text-sm font-bold">Downtime theo Ngày (phút)</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-4">
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={barData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                                    <YAxis tick={{ fontSize: 10 }} />
                                                    <Tooltip formatter={(v: any) => [`${v} phút`, "Downtime"]} contentStyle={{ fontSize: "12px" }} />
                                                    <Bar dataKey="value" name="Downtime (phút)" fill="#e63121" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Detail table */}
                            <Card>
                                <CardHeader className="pb-2 border-b">
                                    <CardTitle className="text-sm font-bold">Danh sách chi tiết</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto mt-2">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b bg-muted/40">
                                                    <th className="text-left p-2 font-semibold">Ngày</th>
                                                    <th className="text-left p-2 font-semibold">Bộ phận</th>
                                                    <th className="text-right p-2 font-semibold">Phút</th>
                                                    <th className="text-left p-2 font-semibold">Nguyên nhân</th>
                                                    <th className="text-left p-2 font-semibold">Ghi chú</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {reportEvents.map(ev => (
                                                    <tr key={ev.id} className="border-b hover:bg-muted/20">
                                                        <td className="p-2 whitespace-nowrap">{format(new Date(ev.work_date), "dd/MM/yyyy")}</td>
                                                        <td className="p-2 whitespace-nowrap">{ev.departments?.name_vi || ev.departments?.code || "—"}</td>
                                                        <td className="p-2 text-right font-bold text-red-600">{ev.duration_mins}</td>
                                                        <td className="p-2">{ev.root_cause}</td>
                                                        <td className="p-2 text-muted-foreground text-xs">{ev.note || "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
