"use client"

import { useState, useEffect } from "react"
import { format, startOfWeek, endOfWeek, addDays, startOfMonth } from "date-fns"
import { vi } from "date-fns/locale"
import { Save, Plus, Settings } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"

export default function AdminPlanPage() {
    const supabase = createClient()
    const [departments, setDepartments] = useState<{ id: string, name_vi: string }[]>([])
    const [selectedDept, setSelectedDept] = useState<string>("")
    const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }))
    const [planData, setPlanData] = useState<any[]>([])
    const [isSaving, setIsSaving] = useState(false)

    // Load Departments
    useEffect(() => {
        async function loadDepts() {
            const { data } = await supabase.from("departments").select("id, name_vi").order("sort_order")
            if (data) {
                setDepartments(data)
                if (data.length > 0) setSelectedDept(data[0].id)
            }
        }
        loadDepts()
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

            // Generate skeleton for 7 days
            const weeklySkeleton = Array.from({ length: 7 }).map((_, idx) => {
                const d = addDays(weekStart, idx)
                const dStr = format(d, "yyyy-MM-dd")
                const existing = data?.find(row => row.work_date === dStr)

                return {
                    work_date: dStr,
                    display_date: format(d, "EEEE, dd/MM", { locale: vi }),
                    plan_ton: existing ? Number(existing.plan_ton) : 0,
                    plan_container: existing ? Number(existing.plan_container || 0) : 0,
                    id: existing ? existing.id : undefined
                }
            })

            setPlanData(weeklySkeleton)
        }
        fetchPlan()
    }, [selectedDept, weekStart])

    // Handle Input change
    const handlePlanChange = (index: number, field: "plan_ton" | "plan_container", value: string) => {
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

        // Prepare upsert payload
        const payload = planData.map(d => ({
            department_id: selectedDept,
            work_date: d.work_date,
            plan_ton: d.plan_ton,
            plan_container: d.plan_container,
            updated_at: new Date().toISOString()
        }))

        const { error } = await supabase
            .from("daily_plan")
            .upsert(payload, { onConflict: 'department_id,work_date' })

        if (error) {
            toast.error("Lỗi khi lưu kế hoạch: " + error.message)
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
                    <Select value={selectedDept} onValueChange={setSelectedDept}>
                        <SelectTrigger>
                            <SelectValue placeholder="Chọn bộ phận" />
                        </SelectTrigger>
                        <SelectContent>
                            {departments.map(d => (
                                <SelectItem key={d.id} value={d.id}>{d.name_vi}</SelectItem>
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

            <div className="bg-card border rounded-xl shadow overflow-hidden mb-6">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold">Bảng Plan Nhập liệu - {departments.find(d => d.id === selectedDept)?.name_vi}</h3>
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
                            <TableHead>Kế hoạch (Container)</TableHead>
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
                                <TableCell>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="0"
                                        className="max-w-[150px]"
                                        value={row.plan_container}
                                        onChange={(e) => handlePlanChange(idx, "plan_container", e.target.value)}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

        </div>
    )
}
