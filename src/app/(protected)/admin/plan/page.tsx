"use client"

import { useState, useEffect } from "react"
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, getDaysInMonth } from "date-fns"
import { vi } from "date-fns/locale"
import { Save, Plus, Settings, CalendarDays } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"

export default function AdminPlanPage() {
    const supabase = createClient()
    const [departments, setDepartments] = useState<{ id: string, name_en: string, code: string }[]>([])
    const [selectedDept, setSelectedDept] = useState<string>("")
    const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }))
    const [planData, setPlanData] = useState<any[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const [role, setRole] = useState("")
    const [userId, setUserId] = useState("")

    // Monthly Setup State
    const [selectedMonth, setSelectedMonth] = useState<Date>(startOfMonth(new Date()))
    const [isSavingMonthly, setIsSavingMonthly] = useState(false)
    const [monthlyPlanTon, setMonthlyPlanTon] = useState<number>(0)
    const [targetBroken, setTargetBroken] = useState<number>(0)
    const [targetUnpeel, setTargetUnpeel] = useState<number>(0)
    const [targetSw, setTargetSw] = useState<number>(0)
    const [targetIsp, setTargetIsp] = useState<number>(0)
    const [targetYield, setTargetYield] = useState<number>(0)

    // Load Departments and User Profile
    useEffect(() => {
        async function loadData() {
            // Load User Profile first
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setUserId(user.id)
                const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()
                if (profile) {
                    setRole(profile.role)
                    if (profile.department_id) {
                        setSelectedDept(profile.department_id)
                    }
                }
            }

            // Load Departments
            const { data } = await supabase.from("departments").select("id, name_en, code").order("sort_order")
            if (data) {
                setDepartments(data)
            }
        }
        loadData()
    }, [])

    // Load weekly plan data for the selected department
    useEffect(() => {
        async function fetchPlan() {
            if (!selectedDept || !weekStart) return

            const start = format(weekStart, "yyyy-MM-dd")
            const end = format(endOfWeek(weekStart, { weekStartsOn: 1 }), "yyyy-MM-dd")

            const { data } = await supabase
                .from("daily_plan")
                .select("*")
                .eq("department_id", selectedDept)
                .gte("work_date", start)
                .lte("work_date", end)

            const { data: fgwhData } = await supabase
                .from("daily_fgwh")
                .select("*")
                .gte("work_date", start)
                .lte("work_date", end)

            // Generate skeleton for 7 days
            const weeklySkeleton = Array.from({ length: 7 }).map((_, idx) => {
                const d = addDays(weekStart, idx)
                const dStr = format(d, "yyyy-MM-dd")
                const existing = data?.find(row => row.work_date === dStr)
                const existingF = fgwhData?.find(row => row.work_date === dStr)

                return {
                    work_date: dStr,
                    display_date: format(d, "EEEE, dd/MM", { locale: vi }),
                    plan_ton: existing ? Number(existing.plan_ton) : 0,
                    plan_isp_ton: existingF ? Number(existingF.plan_isp_ton || 0) : 0,
                    plan_non_isp_ton: existingF ? Number(existingF.plan_non_isp_ton || 0) : 0,
                    id: existing ? existing.id : undefined
                }
            })

            setPlanData(weeklySkeleton)
        }
        fetchPlan()
    }, [selectedDept, weekStart])

    // Handle Input change
    const handlePlanChange = (index: number, field: "plan_ton" | "plan_isp_ton" | "plan_non_isp_ton", value: string) => {
        const newData = [...planData]
        newData[index][field] = value === "" ? 0 : Number(value)
        setPlanData(newData)
    }

    // Save the weekly plan
    const handleSave = async () => {
        if (!selectedDept) {
            toast.error("Vui lòng chọn bộ phận")
            return
        }
        setIsSaving(true)

        // Prepare upsert payload for plan
        const payload = planData.map(d => ({
            department_id: selectedDept,
            work_date: d.work_date,
            plan_ton: d.plan_ton,
            updated_at: new Date().toISOString()
        }))

        const { error } = await supabase
            .from("daily_plan")
            .upsert(payload, { onConflict: 'department_id,work_date' })

        // Prepare upsert payload for FGWH ISP/Non-ISP plan
        const fgwhPayload = planData.map(d => ({
            work_date: d.work_date,
            plan_isp_ton: d.plan_isp_ton,
            plan_non_isp_ton: d.plan_non_isp_ton,
            updated_at: new Date().toISOString()
        }))
        const { error: fgwhError } = await supabase
            .from("daily_fgwh")
            .upsert(fgwhPayload, { onConflict: 'work_date' })

        if (error || fgwhError) {
            toast.error("Lỗi khi lưu kế hoạch: " + (error?.message || fgwhError?.message))
        } else {
            toast.success("Lưu kế hoạch tuần thành công")
        }
        setIsSaving(false)
    }

    // Quick Action
    const handleCopyPrevWeek = async () => {
        // Optional: logic to fetch last week and overwrite input boxes.
        toast.info("Tính năng Copy từ tuần trước đang phát triển")
    }

    // Monthly Save Logic
    const handleMonthlySave = async () => {
        if (!selectedDept || !selectedMonth) {
            toast.error("Vui lòng chọn bộ phận và tháng");
            return;
        }

        setIsSavingMonthly(true);

        const start = startOfMonth(selectedMonth);
        const end = endOfMonth(selectedMonth);
        let current = start;
        const workingDays = [];

        while (current <= end) {
            if (current.getDay() !== 0) { // 0 is Sunday
                workingDays.push(format(current, "yyyy-MM-dd"));
            }
            current = addDays(current, 1);
        }

        if (workingDays.length === 0) {
            toast.error("Không có ngày làm việc nào trong tháng này");
            setIsSavingMonthly(false);
            return;
        }

        const dailyPlanTon = Number((monthlyPlanTon / workingDays.length).toFixed(3));

        const payload = workingDays.map(dateStr => ({
            department_id: selectedDept,
            work_date: dateStr,
            plan_ton: dailyPlanTon,
            target_broken_pct: targetBroken,
            target_unpeel_pct: targetUnpeel,
            target_sw_pct: targetSw,
            target_isp_pct: targetIsp,
            target_yield_pct: targetYield,
            updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .from("daily_plan")
            .upsert(payload, { onConflict: 'department_id,work_date' });

        if (error) {
            toast.error("Lỗi khi lưu kế hoạch tháng: " + error.message);
        } else {
            toast.success(`Đã chia đều ${monthlyPlanTon} tấn qua ${workingDays.length} ngày thành công!`);
            // Trigger a re-render/refetch of the weekly plan by simply re-evaluating the current weekStart
            setWeekStart(new Date(weekStart.getTime()));
        }

        setIsSavingMonthly(false);
    }

    return (
        <div className="flex-col md:flex">
            <div className="flex items-center justify-between space-y-2 border-b pb-4 mb-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Kế Hoạch Khấu Hao (Plan)</h2>
                    <p className="text-muted-foreground">Quản lý định mức plan chạy máy theo từng bộ phận</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="w-full sm:w-1/3 space-y-2">
                    <label className="text-sm font-medium">Bộ phận</label>
                    <Select
                        value={selectedDept}
                        onValueChange={setSelectedDept}
                        disabled={role === "dept_user"}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Chọn bộ phận" />
                        </SelectTrigger>
                        <SelectContent>
                            {departments.map(d => (
                                <SelectItem key={d.id} value={d.id}>{d.name_en}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-full sm:w-1/3 space-y-2">
                    {/* Date Picker stripped out for simpler text navigation but kept explicit for week selection via buttons */}
                    <label className="text-sm font-medium flex-1">Tuần làm việc</label>
                    <div className="flex justify-between items-center border rounded-md px-3 py-2 bg-background">
                        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>&lt; Tuần trước</Button>
                        <span className="font-semibold text-sm">
                            Tuần {format(weekStart, "ww")} nay ({format(weekStart, "dd/MM")})
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Tuần tới &gt;</Button>
                    </div>
                </div>
            </div>

            {selectedDept && (
                <div className="bg-card border rounded-xl shadow overflow-hidden mb-6 p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b pb-3">
                        <CalendarDays className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">Chia Đều Kế Hoạch Tháng ({format(selectedMonth, "MM/yyyy")})</h3>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Chọn Tháng</label>
                            <Input type="month" value={format(selectedMonth, "yyyy-MM")} onChange={(e) => setSelectedMonth(new Date(e.target.value))} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Tổng Sản Lượng (Tấn)</label>
                            <Input type="number" step="1" min="0" value={monthlyPlanTon || ""} onChange={(e) => setMonthlyPlanTon(Number(e.target.value))} placeholder="VD: 1500" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm border-b border-primary/20 block pb-1 text-muted-foreground">Target Yield (%)</label>
                            <Input type="number" step="0.1" min="0" max="100" value={targetYield || ""} onChange={(e) => setTargetYield(Number(e.target.value))} placeholder="%" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm border-b border-primary/20 block pb-1 text-muted-foreground">Target Broken (%)</label>
                            <Input type="number" step="0.1" min="0" max="100" value={targetBroken || ""} onChange={(e) => setTargetBroken(Number(e.target.value))} placeholder="%" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm border-b border-primary/20 block pb-1 text-muted-foreground">Target Unpeel (%)</label>
                            <Input type="number" step="0.1" min="0" max="100" value={targetUnpeel || ""} onChange={(e) => setTargetUnpeel(Number(e.target.value))} placeholder="%" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm border-b border-primary/20 block pb-1 text-muted-foreground">Target SW (%)</label>
                            <Input type="number" step="0.1" min="0" max="100" value={targetSw || ""} onChange={(e) => setTargetSw(Number(e.target.value))} placeholder="%" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm border-b border-primary/20 block pb-1 text-muted-foreground">Target ISP (%)</label>
                            <Input type="number" step="0.1" min="0" max="100" value={targetIsp || ""} onChange={(e) => setTargetIsp(Number(e.target.value))} placeholder="%" />
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button onClick={handleMonthlySave} disabled={isSavingMonthly} className="bg-primary/90 hover:bg-primary">
                            <Settings className="h-4 w-4 mr-2" />
                            {isSavingMonthly ? "Đang xử lý..." : "Lưu & Chia Đều Theo Tháng"}
                        </Button>
                    </div>
                </div>
            )}

            {!selectedDept ? (
                <div className="flex flex-col items-center justify-center p-12 mt-8 border rounded-xl border-dashed bg-card/50 text-muted-foreground">
                    <p>Vui lòng chọn bộ phận phía trên để bắt đầu lập kế hoạch.</p>
                </div>
            ) : (
                <div className="bg-card border rounded-xl shadow overflow-hidden mb-6">
                    <div className="flex items-center justify-between p-4 border-b">
                        <h3 className="font-semibold">Bảng Plan Nhập liệu - {departments.find(d => d.id === selectedDept)?.name_en}</h3>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleCopyPrevWeek}>
                                Copy tuần trước
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving}>
                                <Save className="h-4 w-4 mr-2" />
                                {isSaving ? "Đang lưu..." : "Lưu Plan"}
                            </Button>
                        </div>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[200px]">Ngày</TableHead>
                                <TableHead>Kế hoạch (Tấn)</TableHead>
                                {departments.find(d => d.id === selectedDept)?.code === "FGWH" && (
                                    <>
                                        <TableHead>KH ISP (Tấn)</TableHead>
                                        <TableHead>KH Non-ISP (Tấn)</TableHead>
                                    </>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {planData.map((row, idx) => (
                                <TableRow key={row.work_date}>
                                    <TableCell className="font-medium capitalize">{row.display_date}</TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            className="max-w-[150px]"
                                            value={row.plan_ton}
                                            onChange={(e) => handlePlanChange(idx, "plan_ton", e.target.value)}
                                        />
                                    </TableCell>
                                    {departments.find(d => d.id === selectedDept)?.code === "FGWH" && (
                                        <>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    className="max-w-[150px]"
                                                    value={row.plan_isp_ton}
                                                    onChange={(e) => handlePlanChange(idx, "plan_isp_ton", e.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    className="max-w-[150px]"
                                                    value={row.plan_non_isp_ton}
                                                    onChange={(e) => handlePlanChange(idx, "plan_non_isp_ton", e.target.value)}
                                                />
                                            </TableCell>
                                        </>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

        </div>
    )
}
