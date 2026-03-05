"use client"

import { useState, useEffect } from "react"
import { format, parseISO } from "date-fns"
import { vi } from "date-fns/locale"
import { CalendarIcon, Save } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"

// Schemas
const actualSchema = z.object({
    actual_ton: z.coerce.number().min(0, "Giá trị phải >= 0"),
    actual_container: z.coerce.number().min(0, "Container >= 0").int(),
    note: z.string().optional(),
})

const kpiSchema = z.object({
    wip_open_ton: z.coerce.number().min(0, "WIP Đầu >= 0"),
    wip_close_ton: z.coerce.number().min(0, "WIP Cuối >= 0"),
    input_ton: z.coerce.number().min(0, "Input >= 0"),
    good_output_ton: z.coerce.number().min(0, "Output >= 0"),
    downtime_min: z.coerce.number().min(0, "Downtime >= 0").max(1440, "Downtime <= 1440").int(),
    note: z.string().optional(),
})

export default function InputPage() {
    const supabase = createClient()
    const [date, setDate] = useState<Date>(new Date())
    const [role, setRole] = useState("")
    const [userId, setUserId] = useState("")
    const [departments, setDepartments] = useState<{ id: string, name_vi: string, code: string }[]>([])
    const [selectedDept, setSelectedDept] = useState<string>("")
    const [isSaving, setIsSaving] = useState(false)

    // Forms
    const formActual = useForm<z.infer<typeof actualSchema>>({
        resolver: zodResolver(actualSchema),
        defaultValues: {
            actual_ton: 0,
            actual_container: 0,
            note: "",
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
                if (profile.department_id) {
                    setSelectedDept(profile.department_id)
                }
            }

            // Load all departments
            const { data: depts } = await supabase.from("departments").select("id, name_vi, code").order("sort_order")
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

            // Fetch Container Actual
            const { data: cData } = await supabase
                .from("daily_containers")
                .select("*")
                .eq("work_date", formattedDate)
                .single()

            if (actualData || cData) {
                formActual.reset({
                    actual_ton: Number(actualData?.actual_ton || 0),
                    actual_container: Number(cData?.actual_container || 0),
                    note: actualData?.note || "",
                })
            } else {
                formActual.reset({ actual_ton: 0, actual_container: 0, note: "" })
            }

            // Fetch KPI
            const { data: kpiData } = await supabase
                .from("daily_kpi")
                .select("*")
                .eq("department_id", selectedDept)
                .eq("work_date", formattedDate)
                .single()

            if (kpiData) {
                formKpi.reset({
                    wip_open_ton: Number(kpiData.wip_open_ton),
                    wip_close_ton: Number(kpiData.wip_close_ton),
                    input_ton: Number(kpiData.input_ton),
                    good_output_ton: Number(kpiData.good_output_ton),
                    downtime_min: Number(kpiData.downtime_min),
                    note: kpiData.note || "",
                })
            } else {
                formKpi.reset({ wip_open_ton: 0, wip_close_ton: 0, input_ton: 0, good_output_ton: 0, downtime_min: 0, note: "" })
            }
        }

        fetchRecords()
    }, [selectedDept, date, formActual, formKpi])

    // Save Actual
    async function onSubmitActual(values: z.infer<typeof actualSchema>) {
        if (!selectedDept) {
            toast.error("Vui lòng chọn bộ phận")
            return
        }
        setIsSaving(true)
        const formattedDate = format(date, "yyyy-MM-dd")
        const selectedDeptCode = departments.find(d => d.id === selectedDept)?.code

        const { error: actualError } = await supabase.from("daily_actual").upsert(
            {
                department_id: selectedDept,
                work_date: formattedDate,
                actual_ton: values.actual_ton,
                note: values.note,
                updated_by: userId,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'department_id,work_date' }
        )

        let cError = null
        if (selectedDeptCode === "PACK" || role === "admin") {
            const { error: containerError } = await supabase.from("daily_containers").upsert(
                {
                    work_date: formattedDate,
                    actual_container: values.actual_container,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'work_date' }
            )
            cError = containerError
        }

        if (actualError || cError) {
            toast.error("Lỗi khi lưu Actual: " + (actualError?.message || cError?.message))
        } else {
            toast.success("Đã lưu Actual thành công")
        }
        setIsSaving(false)
    }

    // Save KPI
    async function onSubmitKpi(values: z.infer<typeof kpiSchema>) {
        if (!selectedDept) {
            toast.error("Vui lòng chọn bộ phận")
            return
        }
        setIsSaving(true)
        const formattedDate = format(date, "yyyy-MM-dd")

        const { error } = await supabase.from("daily_kpi").upsert(
            {
                department_id: selectedDept,
                work_date: formattedDate,
                ...values,
                updated_by: userId,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'department_id,work_date' }
        )

        if (error) {
            toast.error("Lỗi khi lưu KPI: " + error.message)
        } else {
            toast.success("Đã rrư KPI thành công")
        }
        setIsSaving(false)
    }

    return (
        <div className="flex-col md:flex">
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

                <div className="space-y-2 lg:col-span-2">
                    <label className="text-sm font-medium">Bộ phận</label>
                    <Select
                        value={selectedDept}
                        onValueChange={setSelectedDept}
                        disabled={role === "dept_user"} // Lock if normal user
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Chọn bộ phận" />
                        </SelectTrigger>
                        <SelectContent>
                            {departments.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                    {d.name_vi}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                        {(departments.find(d => d.id === selectedDept)?.code === "PACK" || role === "admin") && (
                                            <FormField
                                                control={formActual.control}
                                                name="actual_container"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Sản lượng xuất (Container)</FormLabel>
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

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={formKpi.control}
                                            name="wip_open_ton"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>WIP Tồn đầu ngày (Tấn)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" step="0.001" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={formKpi.control}
                                            name="wip_close_ton"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>WIP Tồn cuối ngày (Tấn)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" step="0.001" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={formKpi.control}
                                            name="input_ton"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Input đầu vào (Tấn)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" step="0.001" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={formKpi.control}
                                            name="good_output_ton"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Good Output đạt (Tấn - Tính Yield)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" step="0.001" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

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
        </div>
    )
}
