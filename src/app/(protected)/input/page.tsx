"use client"

import { useState, useEffect } from "react"
import { format, parseISO } from "date-fns"
import { vi } from "date-fns/locale"
import { CalendarIcon, Save, Edit2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"

// Schemas
const actualSchema = z.object({
    actual_ton: z.coerce.number().min(0, "Giá trị phải >= 0"),
    actual_container: z.coerce.number().min(0, "Số container >= 0").optional().default(0),
    note: z.string().optional(),
    electricity_meter_reading: z.coerce.number().min(0, "Chỉ số điện >= 0").optional(),
})

const kpiSchema = z.object({
    wip_open_ton: z.coerce.number().min(0, "WIP Đầu >= 0").optional().default(0),
    wip_close_ton: z.coerce.number().min(0, "WIP Cuối >= 0").optional().default(0),
    input_ton: z.coerce.number().min(0, "Input >= 0").optional().default(0),
    good_output_ton: z.coerce.number().min(0, "Output >= 0").optional().default(0),
    downtime_min: z.coerce.number().min(0, "Downtime >= 0").optional().default(0),
    broken_pct: z.coerce.number().min(0, "Broken >= 0").max(100, "Broken <= 100").optional().default(0),
    unpeel_pct: z.coerce.number().min(0, "Unpeel >= 0").max(100, "Unpeel <= 100").optional().default(0),
    isp_pct: z.coerce.number().min(0, "ISP >= 0").max(100, "ISP <= 100").optional().default(0),
    sw_pct: z.coerce.number().min(0, "SW >= 0").max(100, "SW <= 100").optional().default(0),
    actual_container: z.coerce.number().min(0, "Số container >= 0").optional().default(0),
    electricity_meter_reading: z.coerce.number().min(0, "Chỉ số điện >= 0").optional(),
    note: z.string().optional(),
})

export default function InputPage() {
    const supabase = createClient()
    const [date, setDate] = useState<Date>(new Date())
    const [role, setRole] = useState("")
    const [userId, setUserId] = useState("")
    const [departments, setDepartments] = useState<{ id: string, name_en: string, code: string }[]>([])
    const [selectedDept, setSelectedDept] = useState<string>("")
    const [isSaving, setIsSaving] = useState(false)
    const [allowedDeptIds, setAllowedDeptIds] = useState<Set<string>>(new Set())
    const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, description: string, onConfirm: () => void }>({
        isOpen: false,
        title: "",
        description: "",
        onConfirm: () => { }
    })
    const [fgwhData, setFgwhData] = useState({ actual_isp_ton: 0, actual_non_isp_ton: 0 })
    const [energyData, setEnergyData] = useState({ electricity_kwh: 0, electricity_target_kwh: 0, water_m3: 0, water_target_m3: 0, wood_kg: 0, wood_target_kg: 0 })
    const [prevMeterReading, setPrevMeterReading] = useState<number | null>(null)
    const [recentRecords, setRecentRecords] = useState<any[]>([])

    // Forms
    const formActual = useForm<z.infer<typeof actualSchema>>({
        resolver: zodResolver(actualSchema),
        defaultValues: {
            actual_ton: 0,
            actual_container: 0,
            note: "",
            electricity_meter_reading: 0,
        },
    })

    const formKpi = useForm<z.infer<typeof kpiSchema>>({
        resolver: zodResolver(kpiSchema),
        defaultValues: {
            wip_open_ton: 0,
            wip_close_ton: 0,
            input_ton: 0,
            good_output_ton: 0,
            downtime_min: 0,
            broken_pct: 0,
            unpeel_pct: 0,
            isp_pct: 0,
            sw_pct: 0,
            actual_container: 0,
            electricity_meter_reading: 0,
            note: "",
        },
    })

    // Load User Info
    useEffect(() => {
        async function loadUser() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            setUserId(user.id)

            const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()
            if (profile) {
                setRole(profile.role)
                const ids = new Set<string>()
                if (profile.department_id) {
                    ids.add(profile.department_id)
                    setSelectedDept(profile.department_id)
                }
                if (profile.secondary_department_id) {
                    ids.add(profile.secondary_department_id)
                }
                setAllowedDeptIds(ids)
            }

            // Load all departments
            const { data: depts } = await supabase.from("departments").select("id, name_en, code").order("sort_order")
            if (depts) setDepartments(depts)
        }
        loadUser()
    }, [])

    // Load Record when date or dept changes
    useEffect(() => {
        async function fetchRecords() {
            if (!selectedDept || !date) return

            const formattedDate = format(date, "yyyy-MM-dd")

            // Fetch Actual
            const { data: actualData } = await supabase
                .from("daily_actual")
                .select("*")
                .eq("department_id", selectedDept)
                .eq("work_date", formattedDate)
                .single()

            if (actualData) {
                // Initial reset without electricity, will be updated after KPI fetch
                formActual.reset({
                    actual_ton: Number(actualData?.actual_ton || 0),
                    actual_container: Number(actualData?.actual_container || 0),
                    note: actualData?.note || "",
                    electricity_meter_reading: 0,
                })
            } else {
                formActual.reset({ actual_ton: 0, actual_container: 0, note: "", electricity_meter_reading: 0 })
            }

            // Fetch FGWH data if dept is FGWH
            const deptCode = departments.find(d => d.id === selectedDept)?.code
            if (deptCode === 'FGWH') {
                const { data: fData } = await supabase
                    .from('daily_fgwh')
                    .select('*')
                    .eq('work_date', formattedDate)
                    .single()
                setFgwhData({
                    actual_isp_ton: Number(fData?.actual_isp_ton || 0),
                    actual_non_isp_ton: Number(fData?.actual_non_isp_ton || 0)
                })
            }

            // Fetch KPI
            const { data: kpiData } = await supabase
                .from("daily_kpi")
                .select("*")
                .eq("department_id", selectedDept)
                .eq("work_date", formattedDate)
                .single()

            if (kpiData) {
                formActual.setValue("electricity_meter_reading", Number(kpiData.electricity_meter_reading || 0))
                formKpi.reset({
                    wip_open_ton: Number(kpiData.wip_open_ton),
                    wip_close_ton: Number(kpiData.wip_close_ton),
                    input_ton: Number(kpiData.input_ton),
                    good_output_ton: Number(kpiData.good_output_ton),
                    actual_container: Number(actualData?.actual_container || 0),
                    downtime_min: Number(kpiData.downtime_min),
                    broken_pct: Number(kpiData.broken_pct || 0),
                    unpeel_pct: Number(kpiData.unpeel_pct || 0),
                    isp_pct: Number(kpiData.isp_pct || 0),
                    sw_pct: Number(kpiData.sw_pct || 0),
                    electricity_meter_reading: Number(kpiData.electricity_meter_reading || 0),
                    note: kpiData.note || "",
                })
            } else {
                formKpi.reset({ wip_open_ton: 0, wip_close_ton: 0, input_ton: 0, good_output_ton: 0, actual_container: Number(actualData?.actual_container || 0), downtime_min: 0, broken_pct: 0, unpeel_pct: 0, isp_pct: 0, sw_pct: 0, electricity_meter_reading: 0, note: "" })
            }

            // Fetch Previous Day's Meter Reading for Shelling
            const currentDeptCode = departments.find(d => d.id === selectedDept)?.code
            if (currentDeptCode === 'SHELL') {
                const prevDate = new Date(date)
                prevDate.setDate(prevDate.getDate() - 1)
                const formattedPrevDate = format(prevDate, "yyyy-MM-dd")

                const { data: prevKpi } = await supabase
                    .from("daily_kpi")
                    .select("electricity_meter_reading")
                    .eq("department_id", selectedDept)
                    .eq("work_date", formattedPrevDate)
                    .single()

                setPrevMeterReading(prevKpi ? Number(prevKpi.electricity_meter_reading) : null)
            }
        }

        fetchRecords()
        if (selectedDept) fetchHistory(selectedDept)
    }, [selectedDept, date, formActual, formKpi])

    // Fetch History
    async function fetchHistory(deptId: string) {
        if (!deptId) return

        // Get last 10 days of actuals
        const { data: actuals } = await supabase
            .from("daily_actual")
            .select("*")
            .eq("department_id", deptId)
            .order("work_date", { ascending: false })
            .limit(10)

        // Get last 15 days of KPIs
        const { data: kpis } = await supabase
            .from("daily_kpi")
            .select("*")
            .eq("department_id", deptId)
            .order("work_date", { ascending: false })
            .limit(15)

        // Merge by date
        const history = (actuals || []).map(a => {
            const k = kpis?.find(x => x.work_date === a.work_date)
            return {
                ...a,
                kpi: k || null
            }
        })

        setRecentRecords(history)
    }

    // Load Energy when date changes
    useEffect(() => {
        async function fetchEnergy() {
            if (!date || role !== 'admin') return;
            const formattedDate = format(date, "yyyy-MM-dd");
            const { data: eData } = await supabase
                .from('daily_energy')
                .select('*')
                .eq('work_date', formattedDate)
                .single();

            if (eData) {
                setEnergyData({
                    electricity_kwh: Number(eData.electricity_kwh || 0),
                    electricity_target_kwh: Number(eData.electricity_target_kwh || 0),
                    water_m3: Number(eData.water_m3 || 0),
                    water_target_m3: Number(eData.water_target_m3 || 0),
                    wood_kg: Number(eData.wood_kg || 0),
                    wood_target_kg: Number(eData.wood_target_kg || 0)
                });
            } else {
                setEnergyData({ electricity_kwh: 0, electricity_target_kwh: 0, water_m3: 0, water_target_m3: 0, wood_kg: 0, wood_target_kg: 0 });
            }
        }
        fetchEnergy();
    }, [date, role])

    // Save Actual
    async function onSubmitActual(values: z.infer<typeof actualSchema>) {
        if (!selectedDept) {
            toast.error("Vui lòng chọn bộ phận")
            return
        }

        // Show confirmation if admin
        if (role === 'admin') {
            setConfirmDialog({
                isOpen: true,
                title: "Xác nhận lưu Sản lượng",
                description: "Bạn đang lưu bằng quyền Admin. Dữ liệu sẽ đè lên báo cáo hiện tại của ngày này. Bạn có chắc chắn muốn lưu?",
                onConfirm: () => executeSaveActual(values)
            })
        } else {
            executeSaveActual(values)
        }
    }

    async function executeSaveActual(values: z.infer<typeof actualSchema>) {
        setIsSaving(true)
        const formattedDate = format(date, "yyyy-MM-dd")

        const { error: actualError } = await supabase.from("daily_actual").upsert(
            {
                department_id: selectedDept,
                work_date: formattedDate,
                actual_ton: values.actual_ton,
                actual_container: values.actual_container,
                note: values.note,
                updated_by: userId,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'department_id,work_date' }
        )

        if (actualError) {
            toast.error("Lỗi khi lưu Actual: " + actualError.message)
        } else {
            // If Shelling, also save electricity to daily_kpi
            const deptCode = departments.find(d => d.id === selectedDept)?.code
            if (deptCode === 'SHELL' && values.electricity_meter_reading !== undefined) {
                const { error: kpiError } = await supabase
                    .from("daily_kpi")
                    .upsert({
                        work_date: formattedDate,
                        department_id: selectedDept,
                        electricity_meter_reading: values.electricity_meter_reading,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'work_date,department_id' })

                if (kpiError) throw kpiError
            }

            toast.success("Đã lưu Actual thành công")
            fetchHistory(selectedDept)
        }
        setIsSaving(false)
    }

    async function saveFgwh() {
        setIsSaving(true)
        const formattedDate = format(date, "yyyy-MM-dd")
        const { error } = await supabase.from('daily_fgwh').upsert(
            {
                work_date: formattedDate,
                actual_isp_ton: fgwhData.actual_isp_ton,
                actual_non_isp_ton: fgwhData.actual_non_isp_ton,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'work_date' }
        )
        if (error) {
            toast.error('Lỗi khi lưu FGWH: ' + error.message)
        } else {
            toast.success('Đã lưu số liệu FGWH thành công')
            fetchHistory(selectedDept)
        }
        setIsSaving(false)
    }

    async function saveEnergy() {
        setIsSaving(true)
        const formattedDate = format(date, "yyyy-MM-dd")
        const { error } = await supabase.from('daily_energy').upsert(
            {
                work_date: formattedDate,
                electricity_kwh: energyData.electricity_kwh,
                electricity_target_kwh: energyData.electricity_target_kwh,
                water_m3: energyData.water_m3,
                water_target_m3: energyData.water_target_m3,
                wood_kg: energyData.wood_kg,
                wood_target_kg: energyData.wood_target_kg,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'work_date' }
        )
        if (error) {
            toast.error('Lỗi khi lưu Điện/Nước: ' + error.message)
        } else {
            toast.success('Đã lưu dữ liệu Điện/Nước thành công')
        }
        setIsSaving(false)
    }

    // Save KPI
    async function onSubmitKpi(values: z.infer<typeof kpiSchema>) {
        if (!selectedDept) {
            toast.error("Vui lòng chọn bộ phận")
            return
        }

        // Show confirmation if admin
        if (role === 'admin') {
            setConfirmDialog({
                isOpen: true,
                title: "Xác nhận lưu KPI",
                description: "Bạn đang lưu KPI bằng quyền Admin. Dữ liệu này sẽ đè lên KPI hiện tại của bộ phận trong ngày hôm nay. Bạn có chắc chắn muốn lưu?",
                onConfirm: () => executeSaveKpi(values)
            })
        } else {
            executeSaveKpi(values)
        }
    }

    async function executeSaveKpi(values: z.infer<typeof kpiSchema>) {
        setIsSaving(true)
        const formattedDate = format(date, "yyyy-MM-dd")
        const { actual_container, ...restValues } = values

        const { error } = await supabase.from("daily_kpi").upsert(
            {
                department_id: selectedDept,
                work_date: formattedDate,
                ...restValues,
                updated_by: userId,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'department_id,work_date' }
        )

        // Also update actual_container in daily_actual if present
        if (values.actual_container !== undefined) {
            await supabase.from("daily_actual").upsert({
                department_id: selectedDept,
                work_date: formattedDate,
                actual_container: values.actual_container,
                updated_at: new Date().toISOString()
            }, { onConflict: 'department_id,work_date' })
        }

        if (error) {
            toast.error("Lỗi khi lưu KPI: " + error.message)
        } else {
            toast.success("Đã lưu KPI thành công")
            fetchHistory(selectedDept)
        }
        setIsSaving(false)
    }

    return (
        <div className="flex-col md:flex">
            <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDialog.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                            confirmDialog.onConfirm();
                        }} className="bg-primary hover:bg-primary/90">Đồng ý lưu</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-center justify-between space-y-2 border-b pb-4 mb-4">
                <h2 className="text-3xl font-bold tracking-tight">Nhập Liệu Báo Cáo</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                <div className="space-y-2 lg:col-span-2">
                    <label className="text-sm font-medium">Ngày làm việc</label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? format(date, "PPP", { locale: vi }) : <span>Chọn ngày</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={(d) => d && setDate(d)}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <Tabs defaultValue="production" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="production">Sản Phẩm & KPI</TabsTrigger>
                    {role === 'admin' && <TabsTrigger value="energy">Điện & Nước</TabsTrigger>}
                </TabsList>

                <TabsContent value="production" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                        <div className="space-y-2 lg:col-span-2">
                            <label className="text-sm font-medium">Bộ phận</label>
                            <Select
                                value={selectedDept}
                                onValueChange={setSelectedDept}
                                disabled={role === "dept_user" && allowedDeptIds.size <= 1}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Chọn bộ phận" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(role === "dept_user" ? departments.filter(d => allowedDeptIds.has(d.id)) : departments).map((d) => (
                                        <SelectItem key={d.id} value={d.id}>
                                            {d.name_en}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {!selectedDept ? (
                        <div className="flex flex-col items-center justify-center p-12 mt-8 border rounded-xl border-dashed bg-card/50 text-muted-foreground">
                            <p>Vui lòng chọn bộ phận ở thanh Tùy chọn để bắt đầu nhập liệu.</p>
                        </div>
                    ) : role === 'viewer' ? (
                        <div className="flex flex-col items-center justify-center p-12 mt-8 border rounded-xl border-dashed bg-amber-50 text-amber-700 gap-2">
                            <p className="font-semibold text-lg">🔒 Chế độ Xem</p>
                            <p className="text-sm text-center">Tài khoản này chỉ có quyền xem Dashboard. Liên hệ Admin để được cấp quyền nhập liệu.</p>
                        </div>
                    ) : departments.find(d => d.id === selectedDept)?.code === 'FGWH' ? (
                        /* FGWH: Direct ISP / Non-ISP form, no tabs needed */
                        <div className="rounded-xl border bg-card text-card-foreground shadow">
                            <div className="p-6 space-y-6 max-w-lg">
                                <h3 className="font-semibold text-base">FGWH — Nhập Sản lượng thực tế</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">ISP Thực tế (Tấn)</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            min="0"
                                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            value={fgwhData.actual_isp_ton}
                                            onChange={e => setFgwhData(prev => ({ ...prev, actual_isp_ton: Number(e.target.value) }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Non-ISP Thực tế (Tấn)</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            min="0"
                                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            value={fgwhData.actual_non_isp_ton}
                                            onChange={e => setFgwhData(prev => ({ ...prev, actual_non_isp_ton: Number(e.target.value) }))}
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={saveFgwh}
                                    disabled={isSaving}
                                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {isSaving ? 'Đang lưu...' : 'Lưu FGWH'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <Tabs defaultValue="actual" className="space-y-4">
                                <TabsList>
                                    <TabsTrigger value="actual">Actual (Sản lượng)</TabsTrigger>
                                    <TabsTrigger value="kpi">KPI (WIP, Đầu ra, Thời gian)</TabsTrigger>
                                </TabsList>

                                <TabsContent value="actual" className="space-y-4">
                                    <div className="rounded-xl border bg-card text-card-foreground shadow">
                                        <div className="p-6">
                                            <Form {...formActual}>
                                                <form onSubmit={formActual.handleSubmit(onSubmitActual)} className="space-y-6 max-w-lg">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <FormField
                                                            control={formActual.control}
                                                            name="actual_ton"
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Sản lượng thực tế (Tấn)</FormLabel>
                                                                    <FormControl>
                                                                        <Input type="number" step="0.001" {...field} />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                        {departments.find(d => d.id === selectedDept)?.code === "PACK" && (
                                                            <FormField
                                                                control={formActual.control}
                                                                name="actual_container"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Số Container thực tế</FormLabel>
                                                                        <FormControl>
                                                                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        )}
                                                        {departments.find(d => d.id === selectedDept)?.code === "SHELL" && (
                                                            <FormField
                                                                control={formActual.control}
                                                                name="electricity_meter_reading"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel className="text-amber-600 font-semibold">Chỉ số điện Shelling (kWh)</FormLabel>
                                                                        <FormControl>
                                                                            <Input type="number" step="1" {...field} />
                                                                        </FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        )}
                                                    </div>
                                                    <FormField
                                                        control={formActual.control}
                                                        name="note"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Ghi chú (Tùy chọn)</FormLabel>
                                                                <FormControl>
                                                                    <Input {...field} placeholder="Vd: Ca sáng nghỉ 30p do mất điện" />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <Button type="submit" disabled={isSaving}>
                                                        <Save className="mr-2 h-4 w-4" />
                                                        {isSaving ? "Đang lưu..." : "Lưu Actual"}
                                                    </Button>
                                                </form>
                                            </Form>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="kpi" className="space-y-4">
                                    <div className="rounded-xl border bg-card text-card-foreground shadow">
                                        <div className="p-6">
                                            <Form {...formKpi}>
                                                <form onSubmit={formKpi.handleSubmit(onSubmitKpi)} className="space-y-6">

                                                    {(() => {
                                                        const selectedDeptCode = departments.find(d => d.id === selectedDept)?.code;

                                                        // Admin sees FULL form exactly requested
                                                        if (role === 'admin') {
                                                            return (
                                                                <div className="space-y-6">
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                                                                        <FormField control={formKpi.control} name="wip_open_ton" render={({ field }) => (
                                                                            <FormItem><FormLabel>WIP Tồn đầu ngày (T)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="wip_close_ton" render={({ field }) => (
                                                                            <FormItem><FormLabel>WIP Tồn cuối ngày (T)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="input_ton" render={({ field }) => (
                                                                            <FormItem><FormLabel>Input đầu vào (Tấn)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="good_output_ton" render={({ field }) => (
                                                                            <FormItem><FormLabel>Good Output đạt (Tính Yield)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="downtime_min" render={({ field }) => (
                                                                            <FormItem><FormLabel>Downtime (Phút)</FormLabel><FormControl><Input type="number" step="1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="broken_pct" render={({ field }) => (
                                                                            <FormItem><FormLabel>Tỷ lệ Bể (Broken %)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="unpeel_pct" render={({ field }) => (
                                                                            <FormItem><FormLabel>Tỷ lệ Sót lụa (Unpeel %)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="isp_pct" render={({ field }) => (
                                                                            <FormItem><FormLabel>Tỷ lệ thu hồi (ISP %)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="sw_pct" render={({ field }) => (
                                                                            <FormItem><FormLabel>Tỷ lệ SW (%)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="electricity_meter_reading" render={({ field }) => (
                                                                            <FormItem><FormLabel className="text-amber-600 font-semibold">Chỉ số điện (kWh)</FormLabel><FormControl><Input type="number" step="1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                    </div>

                                                                    {selectedDeptCode === "SHELL" && (
                                                                        <div className="mt-6 border-t pt-6">
                                                                            {(() => {
                                                                                const currentMeter = formKpi.watch("electricity_meter_reading") || 0;
                                                                                const consumption = prevMeterReading !== null ? currentMeter - prevMeterReading : 0;
                                                                                const actualTon = formActual.watch("actual_ton") || 0;
                                                                                const intensity = actualTon > 0 ? (consumption / actualTon).toFixed(2) : "0.00";

                                                                                if (prevMeterReading === null) return <p className="text-xs text-muted-foreground italic">Chưa có chỉ số ngày hôm trước để tính tiêu thụ.</p>;

                                                                                return (
                                                                                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 grid grid-cols-2 gap-4 max-w-2xl">
                                                                                        <div>
                                                                                            <p className="text-xs text-amber-700 font-medium">Tiêu thụ Shelling hôm nay</p>
                                                                                            <p className="text-xl font-bold text-amber-900">{consumption.toLocaleString()} <span className="text-sm font-normal">kWh</span></p>
                                                                                            <p className="text-[10px] text-amber-600">(Số mới {currentMeter} - Số cũ {prevMeterReading})</p>
                                                                                        </div>
                                                                                        <div>
                                                                                            <p className="text-xs text-amber-700 font-medium">Chỉ số kWh / Tấn (Shelling)</p>
                                                                                            <p className="text-xl font-bold text-amber-900">{intensity} <span className="text-sm font-normal">kWh/T</span></p>
                                                                                            <p className="text-[10px] text-amber-600">(Tiêu thụ / {actualTon} Tấn phẩm)</p>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        // Normal User Form Flows (Restricted by Department)
                                                        if (selectedDeptCode === "PEEL_MC") {
                                                            return (
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <FormField control={formKpi.control} name="broken_pct" render={({ field }) => (
                                                                        <FormItem><FormLabel>Tỷ lệ Bể (Broken %)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                    <FormField control={formKpi.control} name="unpeel_pct" render={({ field }) => (
                                                                        <FormItem><FormLabel>Tỷ lệ Sót lụa (Unpeel %)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                </div>
                                                            );
                                                        }

                                                        if (selectedDeptCode === "HAND") {
                                                            return (
                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                                    <FormField control={formKpi.control} name="wip_open_ton" render={({ field }) => (
                                                                        <FormItem><FormLabel>WIP Tồn đầu ngày (Tấn)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                    <FormField control={formKpi.control} name="wip_close_ton" render={({ field }) => (
                                                                        <FormItem><FormLabel>WIP Tồn cuối ngày (Tấn)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                    <FormField control={formKpi.control} name="isp_pct" render={({ field }) => (
                                                                        <FormItem><FormLabel>Tỷ lệ thu hồi (ISP %)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                </div>
                                                            );
                                                        }

                                                        if (selectedDeptCode === "SHELL") {
                                                            return (
                                                                <div className="space-y-6">
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                        <FormField control={formKpi.control} name="broken_pct" render={({ field }) => (
                                                                            <FormItem><FormLabel>Tỷ lệ Bể (Broken %)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                        )} />
                                                                        <FormField control={formKpi.control} name="electricity_meter_reading" render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel className="text-amber-600 font-semibold">Chỉ số đồng hồ điện (kWh)</FormLabel>
                                                                                <FormControl><Input type="number" step="1" {...field} /></FormControl>
                                                                                <FormMessage />
                                                                            </FormItem>
                                                                        )} />
                                                                    </div>
                                                                    {(() => {
                                                                        const currentMeter = formKpi.watch("electricity_meter_reading") || 0;
                                                                        const consumption = prevMeterReading !== null ? currentMeter - prevMeterReading : 0;
                                                                        const actualTon = formActual.watch("actual_ton") || 0;
                                                                        const intensity = actualTon > 0 ? (consumption / actualTon).toFixed(2) : "0.00";

                                                                        if (prevMeterReading === null) return <p className="text-xs text-muted-foreground italic">Chưa có chỉ số ngày hôm trước để tính tiêu thụ.</p>;

                                                                        return (
                                                                            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 grid grid-cols-2 gap-4">
                                                                                <div>
                                                                                    <p className="text-xs text-amber-700 font-medium">Tiêu thụ hôm nay</p>
                                                                                    <p className="text-xl font-bold text-amber-900">{consumption.toLocaleString()} <span className="text-sm font-normal">kWh</span></p>
                                                                                    <p className="text-[10px] text-amber-600">(Số mới {currentMeter} - Số cũ {prevMeterReading})</p>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-xs text-amber-700 font-medium">Chỉ số kWh / Tấn</p>
                                                                                    <p className="text-xl font-bold text-amber-900">{intensity} <span className="text-sm font-normal">kWh/T</span></p>
                                                                                    <p className="text-[10px] text-amber-600">(Tiêu thụ / {actualTon} Tấn phẩm)</p>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            );
                                                        }

                                                        if (selectedDeptCode === "BORMA") {
                                                            return (
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <FormField control={formKpi.control} name="sw_pct" render={({ field }) => (
                                                                        <FormItem><FormLabel>Tỷ lệ SW (%)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                </div>
                                                            );
                                                        }

                                                        if (selectedDeptCode === "STEAM") {
                                                            return (
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <FormField control={formKpi.control} name="wip_open_ton" render={({ field }) => (
                                                                        <FormItem><FormLabel>Tồn kho đầu ngày (Tấn)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                    <FormField control={formKpi.control} name="wip_close_ton" render={({ field }) => (
                                                                        <FormItem><FormLabel>Tồn kho cuối ngày (Tấn)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                </div>
                                                            );
                                                        }

                                                        // Default forms for RCN, Color Sorter, and PACK (Packing)
                                                        return (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                                                                <FormField control={formKpi.control} name="wip_open_ton" render={({ field }) => (
                                                                    <FormItem><FormLabel>WIP Tồn đầu ngày (T)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                )} />
                                                                <FormField control={formKpi.control} name="wip_close_ton" render={({ field }) => (
                                                                    <FormItem><FormLabel>WIP Tồn cuối ngày (T)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                )} />
                                                                <FormField control={formKpi.control} name="input_ton" render={({ field }) => (
                                                                    <FormItem><FormLabel>Input đầu vào (Tấn)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                )} />
                                                                <FormField control={formKpi.control} name="good_output_ton" render={({ field }) => (
                                                                    <FormItem><FormLabel>Good Output đạt (Tính Yield)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                                                )} />
                                                            </div>
                                                        );
                                                    })()}

                                                    <FormField
                                                        control={formKpi.control}
                                                        name="note"
                                                        render={({ field }) => (
                                                            <FormItem className="max-w-lg">
                                                                <FormLabel>Ghi chú (Tùy chọn)</FormLabel>
                                                                <FormControl>
                                                                    <Input {...field} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <Button type="submit" disabled={isSaving}>
                                                        <Save className="mr-2 h-4 w-4" />
                                                        {isSaving ? "Đang lưu..." : "Lưu KPI"}
                                                    </Button>
                                                </form>
                                            </Form>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>

                            {/* Recent History Table */}
                            <div className="mt-12 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold">Lịch sử nhập liệu gần đây</h3>
                                    <p className="text-sm text-muted-foreground italic">Hiển thị 10 ngày gần nhất của bộ phận</p>
                                </div>
                                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead className="w-[120px]">Ngày</TableHead>
                                                <TableHead className="text-right">Sản lượng (T)</TableHead>
                                                <TableHead className="text-right">Input/Output (T)</TableHead>
                                                <TableHead className="text-right">Downtime</TableHead>
                                                <TableHead>Ghi chú</TableHead>
                                                <TableHead className="w-[80px] text-center">Thao tác</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {recentRecords.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground whitespace-nowrap">
                                                        Chưa có dữ liệu lịch sử cho bộ phận này.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                recentRecords.map((r) => (
                                                    <TableRow key={r.work_date} className={format(date, "yyyy-MM-dd") === r.work_date ? "bg-primary/5 font-medium" : ""}>
                                                        <TableCell className="font-medium whitespace-nowrap">
                                                            {format(parseISO(r.work_date), "dd/MM/yyyy")}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="font-bold text-primary">{Number(r.actual_ton).toFixed(2)} T</div>
                                                            {departments.find(d => d.id === selectedDept)?.code === "PACK" && (
                                                                <div className="text-[10px] text-muted-foreground">{Number(r.actual_container || 0).toFixed(2)} Cont</div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right text-muted-foreground">
                                                            {r.kpi ? `${Number(r.kpi.input_ton).toFixed(1)} / ${Number(r.kpi.good_output_ton).toFixed(1)}` : "-"}
                                                        </TableCell>
                                                        <TableCell className="text-right whitespace-nowrap">
                                                            {r.kpi ? `${r.kpi.downtime_min}p` : "-"}
                                                        </TableCell>
                                                        <TableCell className="max-w-[200px] truncate" title={r.note || (r.kpi?.note)}>
                                                            {r.note || r.kpi?.note || "-"}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                                onClick={() => {
                                                                    const recordDate = parseISO(r.work_date)
                                                                    setDate(recordDate)
                                                                    window.scrollTo({ top: 0, behavior: 'smooth' })
                                                                }}
                                                            >
                                                                <Edit2 className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>

                {role === 'admin' && (
                    <TabsContent value="energy" className="space-y-4">
                        <div className="rounded-xl border bg-card text-card-foreground shadow">
                            <div className="p-6 space-y-6 max-w-2xl">
                                <h3 className="font-semibold text-base">Nhập liệu Năng lượng (Toàn nhà máy)</h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                                    <div className="space-y-4 border-r pr-4">
                                        <h4 className="font-medium text-amber-600">⚡ Điện năng (kWh)</h4>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-muted-foreground">Mục tiêu / Target</label>
                                            <input
                                                type="number" step="0.01" min="0" placeholder="0"
                                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                value={energyData.electricity_target_kwh || ''}
                                                onChange={e => setEnergyData(prev => ({ ...prev, electricity_target_kwh: Number(e.target.value) }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-muted-foreground">Thực tế / Actual</label>
                                            <input
                                                type="number" step="0.01" min="0" placeholder="0"
                                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                                                value={energyData.electricity_kwh || ''}
                                                onChange={e => setEnergyData(prev => ({ ...prev, electricity_kwh: Number(e.target.value) }))}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4 pl-4 border-r pr-4">
                                        <h4 className="font-medium text-blue-600">💧 Nước (m³)</h4>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-muted-foreground">Mục tiêu / Target</label>
                                            <input
                                                type="number" step="0.01" min="0" placeholder="0"
                                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                value={energyData.water_target_m3 || ''}
                                                onChange={e => setEnergyData(prev => ({ ...prev, water_target_m3: Number(e.target.value) }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-muted-foreground">Thực tế / Actual</label>
                                            <input
                                                type="number" step="0.01" min="0" placeholder="0"
                                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                value={energyData.water_m3 || ''}
                                                onChange={e => setEnergyData(prev => ({ ...prev, water_m3: Number(e.target.value) }))}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4 pl-4">
                                        <h4 className="font-medium text-orange-600">🔥 Củi (Tấn)</h4>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-muted-foreground">Mục tiêu / Target</label>
                                            <input
                                                type="number" step="1" min="0" placeholder="0"
                                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                value={energyData.wood_target_kg || ''}
                                                onChange={e => setEnergyData(prev => ({ ...prev, wood_target_kg: Number(e.target.value) }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-muted-foreground">Thực tế / Actual</label>
                                            <input
                                                type="number" step="1" min="0" placeholder="0"
                                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                                                value={energyData.wood_kg || ''}
                                                onChange={e => setEnergyData(prev => ({ ...prev, wood_kg: Number(e.target.value) }))}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <Button onClick={saveEnergy} disabled={isSaving} className="mt-4">
                                    <Save className="mr-2 h-4 w-4" />
                                    {isSaving ? 'Đang lưu...' : 'Lưu Dữ liệu Điện & Nước'}
                                </Button>
                            </div>
                        </div>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
