"use client"

import { useState, useEffect } from "react"
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, subDays } from "date-fns"
import { vi } from "date-fns/locale"
import { CalendarIcon, Save, Edit2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { cn } from "@/lib/utils"

export type MonthlyEnergyRecord = {
    work_date: string;
    electricity_kwh: number;
    electricity_target_kwh: number;
    water_m3: number;
    water_target_m3: number;
    wood_kg: number;
    wood_target_kg: number;
    electricity_meter_reading?: number;
    water_meter_reading?: number;
}

export type ShellingMonthlyEnergyRecord = {
    work_date: string;
    actual_ton: number;
    electricity_meter_reading?: number;
    electricity_kwh: number;
    electricity_target_kwh: number;
}

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
    isp_ton: z.coerce.number().min(0, "Giá trị ISP >= 0").optional().default(0),
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
    const [monthlyEnergyData, setMonthlyEnergyData] = useState<MonthlyEnergyRecord[]>([])
    const [prevMonthLastMeter, setPrevMonthLastMeter] = useState<{ elec: number | null, water: number | null }>({ elec: null, water: null })
    const [prevMeterReading, setPrevMeterReading] = useState<number | null>(null)
    const [prevDayActual, setPrevDayActual] = useState<number | null>(null)
    const [recentRecords, setRecentRecords] = useState<any[]>([])

    // Shelling Monthly Energy State
    const [shellingMonthlyEnergyData, setShellingMonthlyEnergyData] = useState<ShellingMonthlyEnergyRecord[]>([])

    // Forms
    const formActual = useForm<z.infer<typeof actualSchema>>({
        resolver: zodResolver(actualSchema),
        defaultValues: {
            actual_ton: 0,
            isp_ton: 0,
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
                    isp_ton: Number(actualData?.isp_ton || 0),
                    actual_container: Number(actualData?.actual_container || 0),
                    note: actualData?.note || "",
                    electricity_meter_reading: 0,
                })
            } else {
                formActual.reset({ actual_ton: 0, isp_ton: 0, actual_container: 0, note: "", electricity_meter_reading: 0 })
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

            // Fetch Previous Day's Meter Reading & Actual Ton for Shelling
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

                const { data: prevActual } = await supabase
                    .from("daily_actual")
                    .select("actual_ton")
                    .eq("department_id", selectedDept)
                    .eq("work_date", formattedPrevDate)
                    .single()

                setPrevMeterReading(prevKpi ? Number(prevKpi.electricity_meter_reading) : null)
                setPrevDayActual(prevActual ? Number(prevActual.actual_ton) : null)
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
            const startStr = format(startOfMonth(date), "yyyy-MM-dd");
            const endStr = format(endOfMonth(date), "yyyy-MM-dd");
            const prevDateObj = subDays(startOfMonth(date), 1);
            const prevDateStr = format(prevDateObj, "yyyy-MM-dd");

            // Fetch the whole month's records
            const { data: monthData } = await supabase
                .from('daily_energy')
                .select('*')
                .gte('work_date', startStr)
                .lte('work_date', endStr)
                .order('work_date');

            // Fetch the last day of the previous month for the initial subtraction
            const { data: pData } = await supabase
                .from('daily_energy')
                .select('electricity_meter_reading, water_meter_reading')
                .eq('work_date', prevDateStr)
                .single();

            const pElec = pData?.electricity_meter_reading !== null && pData?.electricity_meter_reading !== undefined ? Number(pData.electricity_meter_reading) : null;
            const pWater = pData?.water_meter_reading !== null && pData?.water_meter_reading !== undefined ? Number(pData.water_meter_reading) : null;

            setPrevMonthLastMeter({ elec: pElec, water: pWater });

            // Generate an array for every day in the month
            const daysInMonth = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });

            const compiledData: MonthlyEnergyRecord[] = daysInMonth.map(d => {
                const dayStr = format(d, "yyyy-MM-dd");
                const existing = monthData?.find((r: any) => r.work_date === dayStr);
                return {
                    work_date: dayStr,
                    electricity_kwh: Number(existing?.electricity_kwh || 0),
                    electricity_target_kwh: Number(existing?.electricity_target_kwh || 0),
                    water_m3: Number(existing?.water_m3 || 0),
                    water_target_m3: Number(existing?.water_target_m3 || 0),
                    wood_kg: Number(existing?.wood_kg || 0),
                    wood_target_kg: Number(existing?.wood_target_kg || 0),
                    electricity_meter_reading: existing?.electricity_meter_reading !== null && existing?.electricity_meter_reading !== undefined ? Number(existing?.electricity_meter_reading) : undefined,
                    water_meter_reading: existing?.water_meter_reading !== null && existing?.water_meter_reading !== undefined ? Number(existing?.water_meter_reading) : undefined,
                };
            });

            setMonthlyEnergyData(compiledData);
        }
        fetchEnergy();
    }, [date, role])

    // Load Shelling Energy
    useEffect(() => {
        async function fetchShellingEnergy() {
            if (!date) return;
            const hasShellAccess = role === 'admin' || Array.from(allowedDeptIds).some(id => departments.find(d => d.id === id)?.code === 'SHELL');
            if (!hasShellAccess) return;

            const shellDept = departments.find(d => d.code === 'SHELL');
            if (!shellDept) return;

            const startStr = format(startOfMonth(date), "yyyy-MM-dd");
            const endStr = format(endOfMonth(date), "yyyy-MM-dd");

            // Fetch KPIs (for electricity_meter_reading)
            const { data: kpiData } = await supabase
                .from('daily_kpi')
                .select('work_date, electricity_meter_reading')
                .eq('department_id', shellDept.id)
                .gte('work_date', startStr)
                .lte('work_date', endStr)
                .order('work_date');

            // Fetch Actuals (for actual_ton of previous day)
            // Need from prevMonthLastDay to endOfMonth
            const prevMonthLastDay = format(subDays(startOfMonth(date), 1), "yyyy-MM-dd");
            const { data: actualData } = await supabase
                .from('daily_actual')
                .select('work_date, actual_ton')
                .eq('department_id', shellDept.id)
                .gte('work_date', prevMonthLastDay)
                .lte('work_date', endStr)
                .order('work_date');

            // Compute compiled data
            const daysInMonth = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });
            const compiledData: ShellingMonthlyEnergyRecord[] = daysInMonth.map(d => {
                const dayStr = format(d, "yyyy-MM-dd");
                const prevDayStr = format(subDays(d, 1), "yyyy-MM-dd");

                const existingKpi = kpiData?.find(r => r.work_date === dayStr);
                const prevActual = actualData?.find(r => r.work_date === prevDayStr);

                return {
                    work_date: dayStr,
                    actual_ton: prevActual?.actual_ton ? Number(prevActual.actual_ton) : 0,
                    electricity_meter_reading: existingKpi?.electricity_meter_reading !== null && existingKpi?.electricity_meter_reading !== undefined ? Number(existingKpi.electricity_meter_reading) : undefined,
                    electricity_kwh: 0,
                    electricity_target_kwh: 0,
                };
            });

            // Calculate kWh
            for (let i = 0; i < compiledData.length - 1; i++) {
                const meterToday = compiledData[i].electricity_meter_reading;
                const meterTomorrow = compiledData[i + 1].electricity_meter_reading;
                if (meterToday != null && meterTomorrow != null) {
                    compiledData[i].electricity_kwh = Math.max(0, meterTomorrow - meterToday);
                }
            }

            setShellingMonthlyEnergyData(compiledData);
        }
        fetchShellingEnergy();
    }, [date, role, allowedDeptIds, departments])

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
                isp_ton: values.isp_ton,
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
        const payloadToSave = monthlyEnergyData.map(record => ({
            ...record,
            updated_at: new Date().toISOString()
        }))

        const { error } = await supabase.from('daily_energy').upsert(
            payloadToSave,
            { onConflict: 'work_date' }
        )
        if (error) {
            toast.error('Lỗi khi lưu Điện/Nước/Củi: ' + error.message)
        } else {
            toast.success('Đã lưu toàn bộ dữ liệu Điện/Nước/Củi của tháng thành công')
        }
        setIsSaving(false)
    }

    async function saveShellingEnergy() {
        setIsSaving(true)
        const shellDept = departments.find(d => d.code === 'SHELL');
        if (!shellDept) {
            setIsSaving(false);
            return;
        }

        const payloadToSave = shellingMonthlyEnergyData
            .filter(record => record.electricity_meter_reading !== undefined)
            .map(record => ({
                work_date: record.work_date,
                department_id: shellDept.id,
                electricity_meter_reading: record.electricity_meter_reading,
                updated_at: new Date().toISOString()
            }))

        if (payloadToSave.length > 0) {
            const { error } = await supabase.from('daily_kpi').upsert(
                payloadToSave,
                { onConflict: 'work_date,department_id' }
            )
            if (error) {
                toast.error('Lỗi khi lưu Điện Shelling: ' + error.message)
            } else {
                toast.success('Đã lưu dữ liệu Điện Shelling thành công')
            }
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
                    {(role === 'admin' || Array.from(allowedDeptIds).some(id => departments.find(d => d.id === id)?.code === 'SHELL')) && <TabsTrigger value="shelling-energy">Điện Shelling (Tháng)</TabsTrigger>}
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
                                                <form onSubmit={formActual.handleSubmit(onSubmitActual)} className="space-y-6 max-w-2xl">
                                                    <div className="rounded-md border overflow-hidden">
                                                        <Table>
                                                            <TableHeader className="bg-muted/50">
                                                                <TableRow>
                                                                    <TableHead className="w-1/2">Chỉ tiêu</TableHead>
                                                                    <TableHead className="w-1/2">Giá trị nhập</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                <TableRow>
                                                                    <TableCell className="font-medium align-middle">Sản lượng thực tế (Tấn)</TableCell>
                                                                    <TableCell className="p-2 align-middle">
                                                                        <FormField control={formActual.control} name="actual_ton" render={({ field }) => (
                                                                            <FormItem><FormControl><Input type="number" step="0.001" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                        )} />
                                                                    </TableCell>
                                                                </TableRow>
                                                                {departments.find(d => d.id === selectedDept)?.code === "CS" && (
                                                                    <TableRow>
                                                                        <TableCell className="font-medium text-blue-600 align-middle">Sản lượng ISP (Tấn)</TableCell>
                                                                        <TableCell className="p-2 align-middle">
                                                                            <FormField control={formActual.control} name="isp_ton" render={({ field }) => (
                                                                                <FormItem><FormControl><Input type="number" step="0.001" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                            )} />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}
                                                                {departments.find(d => d.id === selectedDept)?.code === "PACK" && (
                                                                    <TableRow>
                                                                        <TableCell className="font-medium align-middle">Số Container thực tế</TableCell>
                                                                        <TableCell className="p-2 align-middle">
                                                                            <FormField control={formActual.control} name="actual_container" render={({ field }) => (
                                                                                <FormItem><FormControl><Input type="number" step="0.01" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                            )} />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}
                                                                {departments.find(d => d.id === selectedDept)?.code === "SHELL" && (
                                                                    <TableRow>
                                                                        <TableCell className="font-medium text-amber-600 align-middle">Chỉ số điện Shelling (kWh)</TableCell>
                                                                        <TableCell className="p-2 align-middle">
                                                                            <FormField control={formActual.control} name="electricity_meter_reading" render={({ field }) => (
                                                                                <FormItem><FormControl><Input type="number" step="1" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                            )} />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}
                                                                <TableRow>
                                                                    <TableCell className="font-medium align-middle border-b-0">Ghi chú (Tùy chọn)</TableCell>
                                                                    <TableCell className="p-2 align-middle border-b-0">
                                                                        <FormField control={formActual.control} name="note" render={({ field }) => (
                                                                            <FormItem><FormControl><Input {...field} placeholder="Vd: Ca sáng nghỉ 30p..." className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                        )} />
                                                                    </TableCell>
                                                                </TableRow>
                                                            </TableBody>
                                                        </Table>
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-t pt-4 gap-4">
                                                        <p className="text-sm font-medium text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200 flex-1">
                                                            ⚠️ <span className="font-bold">Lưu ý:</span> Bạn nhớ bấm nút <strong>Lưu Actual</strong> sau khi nhập xong nhé!
                                                        </p>
                                                        <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
                                                            <Save className="mr-2 h-4 w-4" />
                                                            {isSaving ? "Đang lưu..." : "Lưu Actual"}
                                                        </Button>
                                                    </div>
                                                </form>
                                            </Form>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="kpi" className="space-y-4">
                                    <div className="rounded-xl border bg-card text-card-foreground shadow">
                                        <div className="p-6">
                                            <Form {...formKpi}>
                                                <form onSubmit={formKpi.handleSubmit(onSubmitKpi)} className="space-y-6 max-w-2xl">
                                                    <div className="rounded-md border overflow-hidden">
                                                        <Table>
                                                            <TableHeader className="bg-muted/50">
                                                                <TableRow>
                                                                    <TableHead className="w-1/2">Chỉ tiêu KPI</TableHead>
                                                                    <TableHead className="w-1/2">Giá trị nhập</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {(() => {
                                                                    const selectedDeptCode = departments.find(d => d.id === selectedDept)?.code;
                                                                    const Row = ({ label, name, step, className = "" }: { label: string, name: any, step: string, className?: string }) => (
                                                                        <TableRow>
                                                                            <TableCell className={"font-medium align-middle " + className}>{label}</TableCell>
                                                                            <TableCell className="p-2 align-middle">
                                                                                <FormField control={formKpi.control} name={name} render={({ field }) => (
                                                                                    <FormItem><FormControl><Input type="number" step={step} {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                                )} />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    );

                                                                    if (role === 'admin') {
                                                                        return (
                                                                            <>
                                                                                <Row label="WIP Tồn đầu ngày (T)" name="wip_open_ton" step="0.001" />
                                                                                <Row label="WIP Tồn cuối ngày (T)" name="wip_close_ton" step="0.001" />
                                                                                <Row label="Input đầu vào (Tấn)" name="input_ton" step="0.001" />
                                                                                <Row label="Good Output đạt (Tính Yield)" name="good_output_ton" step="0.001" />
                                                                                <Row label="Downtime (Phút)" name="downtime_min" step="1" />
                                                                                <Row label="Tỷ lệ Bể (Broken %)" name="broken_pct" step="0.1" />
                                                                                <Row label="Tỷ lệ Sót lụa (Unpeel %)" name="unpeel_pct" step="0.1" />
                                                                                <Row label="Tỷ lệ thu hồi (ISP %)" name="isp_pct" step="0.1" />
                                                                                <Row label="Tỷ lệ SW (%)" name="sw_pct" step="0.1" />
                                                                                <Row label="Chỉ số điện (kWh)" name="electricity_meter_reading" step="1" className="text-amber-600 font-semibold" />
                                                                                {selectedDeptCode === "SHELL" && (
                                                                                    <TableRow>
                                                                                        <TableCell colSpan={2} className="p-0 border-b-0">
                                                                                            <div className="p-4 bg-amber-50">
                                                                                                {(() => {
                                                                                                    const currentMeter = formKpi.watch("electricity_meter_reading") || 0;
                                                                                                    const consumption = prevMeterReading !== null ? currentMeter - prevMeterReading : 0;
                                                                                                    const actualTon = formActual.watch("actual_ton") || 0;
                                                                                                    const intensity = actualTon > 0 ? (consumption / actualTon).toFixed(2) : "0.00";

                                                                                                    if (prevMeterReading === null) return <p className="text-xs text-muted-foreground italic">Chưa có chỉ số ngày hôm trước để tính tiêu thụ.</p>;

                                                                                                    return (
                                                                                                        <div className="grid grid-cols-2 gap-4">
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
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                )}
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "PEEL_MC") {
                                                                        return (
                                                                            <>
                                                                                <Row label="Tỷ lệ Bể (Broken %)" name="broken_pct" step="0.1" />
                                                                                <Row label="Tỷ lệ Sót lụa (Unpeel %)" name="unpeel_pct" step="0.1" />
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "HAND") {
                                                                        return (
                                                                            <>
                                                                                <Row label="WIP Tồn đầu ngày (Tấn)" name="wip_open_ton" step="0.001" />
                                                                                <Row label="WIP Tồn cuối ngày (Tấn)" name="wip_close_ton" step="0.001" />
                                                                                <Row label="Tỷ lệ thu hồi (ISP %)" name="isp_pct" step="0.1" />
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "SHELL") {
                                                                        return (
                                                                            <>
                                                                                <Row label="Tỷ lệ Bể (Broken %)" name="broken_pct" step="0.1" />
                                                                                <Row label="Chỉ số đồng hồ điện (kWh)" name="electricity_meter_reading" step="1" className="text-amber-600 font-semibold" />
                                                                                <TableRow>
                                                                                    <TableCell colSpan={2} className="p-0 border-b-0">
                                                                                        <div className="p-4 bg-amber-50 rounded-b-md">
                                                                                            {(() => {
                                                                                                const currentMeter = formKpi.watch("electricity_meter_reading") || 0;
                                                                                                const consumption = prevMeterReading !== null ? currentMeter - prevMeterReading : 0;
                                                                                                const targetActualTon = prevDayActual || 0;
                                                                                                const intensity = targetActualTon > 0 ? (consumption / targetActualTon).toFixed(2) : "0.00";

                                                                                                if (prevMeterReading === null) return <p className="text-xs text-muted-foreground italic">Chưa có chỉ số ngày hôm trước để tính tiêu thụ.</p>;

                                                                                                return (
                                                                                                    <div className="grid grid-cols-2 gap-4">
                                                                                                        <div>
                                                                                                            <p className="text-xs text-amber-700 font-medium">Tiêu thụ Ca trước (Tự động tính)</p>
                                                                                                            <p className="text-xl font-bold text-amber-900">{consumption.toLocaleString()} <span className="text-sm font-normal">kWh</span></p>
                                                                                                            <p className="text-[10px] text-amber-600">(Mới {currentMeter} - Cũ {prevMeterReading})</p>
                                                                                                        </div>
                                                                                                        <div>
                                                                                                            <p className="text-xs text-amber-700 font-medium">Chỉ số kWh / Tấn (Ca trước)</p>
                                                                                                            <p className="text-xl font-bold text-amber-900">{intensity} <span className="text-sm font-normal">kWh/T</span></p>
                                                                                                            {targetActualTon > 0
                                                                                                                ? <p className="text-[10px] text-amber-600">(Tiêu thụ / {targetActualTon} Tấn phẩm ngày trước)</p>
                                                                                                                : <p className="text-[10px] text-red-500 italic">Chưa có sản lượng ngày hôm trước</p>
                                                                                                            }
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })()}
                                                                                        </div>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "BORMA") {
                                                                        return <Row label="Tỷ lệ SW (%)" name="sw_pct" step="0.1" />;
                                                                    }

                                                                    if (selectedDeptCode === "STEAM") {
                                                                        return (
                                                                            <>
                                                                                <Row label="Tồn kho đầu ngày (Tấn)" name="wip_open_ton" step="0.001" />
                                                                                <Row label="Tồn kho cuối ngày (Tấn)" name="wip_close_ton" step="0.001" />
                                                                            </>
                                                                        );
                                                                    }

                                                                    // Default
                                                                    return (
                                                                        <>
                                                                            <Row label="WIP Tồn đầu ngày (T)" name="wip_open_ton" step="0.001" />
                                                                            <Row label="WIP Tồn cuối ngày (T)" name="wip_close_ton" step="0.001" />
                                                                            <Row label="Input đầu vào (Tấn)" name="input_ton" step="0.001" />
                                                                            <Row label="Good Output đạt (Tính Yield)" name="good_output_ton" step="0.001" />
                                                                        </>
                                                                    );
                                                                })()}
                                                                
                                                                <TableRow>
                                                                    <TableCell className="font-medium align-middle border-b-0">Ghi chú (Tùy chọn)</TableCell>
                                                                    <TableCell className="p-2 align-middle border-b-0">
                                                                        <FormField control={formKpi.control} name="note" render={({ field }) => (
                                                                            <FormItem><FormControl><Input {...field} placeholder="Vd: ... " className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                        )} />
                                                                    </TableCell>
                                                                </TableRow>
                                                            </TableBody>
                                                        </Table>
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-t pt-4 gap-4">
                                                        <p className="text-sm font-medium text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200 flex-1">
                                                            ⚠️ <span className="font-bold">Lưu ý:</span> Bạn nhớ bấm nút <strong>Lưu KPI</strong> sau khi nhập xong nhé!
                                                        </p>
                                                        <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
                                                            <Save className="mr-2 h-4 w-4" />
                                                            {isSaving ? "Đang lưu..." : "Lưu KPI"}
                                                        </Button>
                                                    </div>
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
                        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold text-lg">Bảng Ghi Nhận Năng Lượng: Tháng {format(date, "MM/yyyy")}</h3>
                                    <Button onClick={saveEnergy} disabled={isSaving} size="sm">
                                        <Save className="mr-2 h-4 w-4" />
                                        {isSaving ? 'Đang lưu...' : 'Lưu Toàn Bộ Tháng'}
                                    </Button>
                                </div>

                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted">
                                            <TableRow>
                                                <TableHead rowSpan={2} className="border-r w-[80px] text-center">Ngày</TableHead>
                                                <TableHead colSpan={3} className="border-r text-center text-amber-600 bg-amber-50/50">⚡ Điện năng (kWh)</TableHead>
                                                <TableHead colSpan={3} className="border-r text-center text-blue-600 bg-blue-50/50">💧 Nước (m³)</TableHead>
                                                <TableHead colSpan={2} className="text-center text-orange-600 bg-orange-50/50">🔥 Củi (Tấn)</TableHead>
                                            </TableRow>
                                            <TableRow>
                                                {/* Dien */}
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[120px]">Chỉ số đầu ngày</TableHead>
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[100px]">Tiêu thụ</TableHead>
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[80px]">Target</TableHead>
                                                {/* Nuoc */}
                                                <TableHead className="text-center bg-blue-50/50 border-r w-[120px]">Chỉ số đầu ngày</TableHead>
                                                <TableHead className="text-center bg-blue-50/50 border-r w-[100px]">Tiêu thụ</TableHead>
                                                <TableHead className="text-center bg-blue-50/50 border-r w-[80px]">Target</TableHead>
                                                {/* Cui */}
                                                <TableHead className="text-center bg-orange-50/50 border-r w-[100px]">Thực tế (kg)</TableHead>
                                                <TableHead className="text-center bg-orange-50/50 w-[80px]">Target</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {monthlyEnergyData.map((row, index) => {
                                                const nextRowElec = index < monthlyEnergyData.length - 1 ? monthlyEnergyData[index + 1].electricity_meter_reading : undefined;
                                                const nextRowWater = index < monthlyEnergyData.length - 1 ? monthlyEnergyData[index + 1].water_meter_reading : undefined;

                                                const handleMeterChange = (type: 'electric' | 'water', val: number | undefined) => {
                                                    const newData = [...monthlyEnergyData];
                                                    if (type === 'electric') {
                                                        newData[index].electricity_meter_reading = val;
                                                        for (let i = 0; i < newData.length - 1; i++) {
                                                            const meterToday = newData[i].electricity_meter_reading;
                                                            const meterTomorrow = newData[i + 1].electricity_meter_reading;
                                                            if (meterToday != null && meterTomorrow != null) {
                                                                newData[i].electricity_kwh = Math.max(0, meterTomorrow - meterToday);
                                                            }
                                                        }
                                                    } else {
                                                        newData[index].water_meter_reading = val;
                                                        for (let i = 0; i < newData.length - 1; i++) {
                                                            const meterToday = newData[i].water_meter_reading;
                                                            const meterTomorrow = newData[i + 1].water_meter_reading;
                                                            if (meterToday != null && meterTomorrow != null) {
                                                                newData[i].water_m3 = Math.max(0, meterTomorrow - meterToday);
                                                            }
                                                        }
                                                    }
                                                    setMonthlyEnergyData(newData);
                                                };

                                                return (
                                                    <TableRow key={row.work_date}>
                                                        <TableCell className="border-r font-medium text-center">{format(parseISO(row.work_date), "dd/MM")}</TableCell>

                                                        {/* Dien */}
                                                        <TableCell className="border-r p-1 relative">
                                                            <input type="number" step="1" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"
                                                                value={row.electricity_meter_reading !== undefined ? row.electricity_meter_reading : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    handleMeterChange('electric', val);
                                                                }} />
                                                            {nextRowElec != null && <div className="text-[9px] text-amber-600 text-center absolute bottom-0 left-0 right-0">Trừ từ sau: {nextRowElec}</div>}
                                                        </TableCell>
                                                        <TableCell className="border-r p-1">
                                                            <input type="number" step="0.01" className={cn("w-full text-right p-1 rounded font-semibold outline-none text-sm", nextRowElec != null ? "bg-amber-50" : "bg-transparent focus:ring-1 focus:ring-amber-400")}
                                                                readOnly={nextRowElec != null}
                                                                value={row.electricity_kwh || ''}
                                                                onChange={(e) => {
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].electricity_kwh = Number(e.target.value);
                                                                    setMonthlyEnergyData(newData);
                                                                }} />
                                                        </TableCell>
                                                        <TableCell className="border-r p-1 bg-amber-50/30">
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm"
                                                                value={row.electricity_target_kwh || ''}
                                                                onChange={(e) => {
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].electricity_target_kwh = Number(e.target.value);
                                                                    setMonthlyEnergyData(newData);
                                                                }} />
                                                        </TableCell>

                                                        {/* Nuoc */}
                                                        <TableCell className="border-r p-1 relative">
                                                            <input type="number" step="1" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-blue-400 bg-transparent text-sm"
                                                                value={row.water_meter_reading !== undefined ? row.water_meter_reading : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    handleMeterChange('water', val);
                                                                }} />
                                                            {nextRowWater != null && <div className="text-[9px] text-blue-600 text-center absolute bottom-0 left-0 right-0">Trừ từ sau: {nextRowWater}</div>}
                                                        </TableCell>
                                                        <TableCell className="border-r p-1">
                                                            <input type="number" step="0.01" className={cn("w-full text-right p-1 rounded font-semibold outline-none text-sm", nextRowWater != null ? "bg-blue-50" : "bg-transparent focus:ring-1 focus:ring-blue-400")}
                                                                readOnly={nextRowWater != null}
                                                                value={row.water_m3 || ''}
                                                                onChange={(e) => {
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].water_m3 = Number(e.target.value);
                                                                    setMonthlyEnergyData(newData);
                                                                }} />
                                                        </TableCell>
                                                        <TableCell className="border-r p-1 bg-blue-50/30">
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-blue-400 bg-transparent text-sm"
                                                                value={row.water_target_m3 || ''}
                                                                onChange={(e) => {
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].water_target_m3 = Number(e.target.value);
                                                                    setMonthlyEnergyData(newData);
                                                                }} />
                                                        </TableCell>

                                                        {/* Cui */}
                                                        <TableCell className="border-r p-1">
                                                            <input type="number" step="1" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-orange-400 bg-transparent text-sm font-semibold"
                                                                value={row.wood_kg || ''}
                                                                onChange={(e) => {
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].wood_kg = Number(e.target.value);
                                                                    setMonthlyEnergyData(newData);
                                                                }} />
                                                        </TableCell>
                                                        <TableCell className="p-1 bg-orange-50/30">
                                                            <input type="number" step="1" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-orange-400 bg-transparent text-sm"
                                                                value={row.wood_target_kg || ''}
                                                                onChange={(e) => {
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].wood_target_kg = Number(e.target.value);
                                                                    setMonthlyEnergyData(newData);
                                                                }} />
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="mt-6 flex justify-end">
                                    <Button onClick={saveEnergy} disabled={isSaving}>
                                        <Save className="mr-2 h-4 w-4" />
                                        {isSaving ? 'Đang lưu...' : 'Lưu Toàn Bộ Tháng'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                )}

                {(role === 'admin' || Array.from(allowedDeptIds).some(id => departments.find(d => d.id === id)?.code === 'SHELL')) && (
                    <TabsContent value="shelling-energy" className="space-y-4">
                        <div className="rounded-xl border bg-card text-card-foreground shadow">
                            <div className="p-6">
                                <h3 className="text-lg font-semibold mb-6 flex justify-between items-center text-amber-800">
                                    <span>⚡ Nhập liệu Chỉ số Điện Shelling (Toàn tháng)</span>
                                    <span className="text-sm font-normal text-muted-foreground">{date ? format(date, "MM/yyyy") : ''}</span>
                                </h3>

                                <div className="rounded-md border overflow-x-auto min-w-full">
                                    <Table className="min-w-[500px]">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="border-r w-[80px] text-center bg-gray-50 uppercase text-gray-500 font-semibold text-xs">Ngày</TableHead>
                                                <TableHead className="border-r text-center w-[120px] bg-amber-50/50 text-amber-700">Công tơ điện</TableHead>
                                                <TableHead className="border-r text-center w-[100px] bg-amber-50/50 text-amber-700 border-r-amber-100">Tiêu thụ (Lùi)</TableHead>
                                                <TableHead className="border-r text-center w-[120px] bg-gray-50 text-gray-700">Sản lượng <br /><span className="text-[10px] font-normal leading-none">(Ngày trước)</span></TableHead>
                                                <TableHead className="text-center w-[100px] bg-gray-50 text-gray-700">kWh / Tấn</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {shellingMonthlyEnergyData.map((row, index) => {
                                                const nextRowElec = index < shellingMonthlyEnergyData.length - 1 ? shellingMonthlyEnergyData[index + 1].electricity_meter_reading : undefined;
                                                const intensity = row.actual_ton > 0 ? (row.electricity_kwh / row.actual_ton).toFixed(2) : "0.00";

                                                const handleMeterChange = (val: number | undefined) => {
                                                    const newData = [...shellingMonthlyEnergyData];
                                                    newData[index].electricity_meter_reading = val;
                                                    for (let i = 0; i < newData.length - 1; i++) {
                                                        const meterToday = newData[i].electricity_meter_reading;
                                                        const meterTomorrow = newData[i + 1].electricity_meter_reading;
                                                        if (meterToday != null && meterTomorrow != null) {
                                                            newData[i].electricity_kwh = Math.max(0, meterTomorrow - meterToday);
                                                        }
                                                    }
                                                    setShellingMonthlyEnergyData(newData);
                                                };

                                                return (
                                                    <TableRow key={row.work_date}>
                                                        <TableCell className="border-r font-medium text-center">{format(parseISO(row.work_date), "dd/MM")}</TableCell>
                                                        <TableCell className="border-r p-1 relative bg-transparent">
                                                            <input type="number" step="1" className="w-full text-right p-2 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent font-semibold shadow-inner"
                                                                value={row.electricity_meter_reading !== undefined ? row.electricity_meter_reading : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    handleMeterChange(val);
                                                                }} />
                                                            {nextRowElec != null && <div className="text-[10px] text-amber-600 text-center absolute bottom-0 left-0 right-0 opacity-75">Từ mùng {format(parseISO(shellingMonthlyEnergyData[index + 1].work_date), "d")}: {nextRowElec}</div>}
                                                        </TableCell>
                                                        <TableCell className="border-r border-r-amber-100 p-1 text-right bg-amber-50 font-bold text-amber-800 align-middle">
                                                            {row.electricity_kwh.toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="border-r p-1 text-center bg-gray-50 text-gray-700 font-semibold align-middle">
                                                            {row.actual_ton > 0 ? row.actual_ton : "-"}
                                                        </TableCell>
                                                        <TableCell className={cn("p-1 text-right font-bold align-middle bg-gray-50", Number(intensity) > 0 ? "text-indigo-700" : "text-gray-400")}>
                                                            {intensity}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="mt-6 flex justify-end">
                                    <Button onClick={saveShellingEnergy} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700 text-white">
                                        <Save className="mr-2 h-4 w-4" />
                                        {isSaving ? 'Đang lưu...' : 'Lưu Toàn Bộ Điện Shelling'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
