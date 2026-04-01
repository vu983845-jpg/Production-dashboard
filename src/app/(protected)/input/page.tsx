"use client"

import { useState, useEffect, useRef } from "react"
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, subDays } from "date-fns"
import { vi } from "date-fns/locale"
import { CalendarIcon, Save, Edit2, Trash2, Plus } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { cn } from "@/lib/utils"

export type MonthlyEnergyRecord = {
    work_date: string;
    electricity_kwh: number;
    electricity_peak_kwh?: number;
    electricity_normal_kwh?: number;
    electricity_offpeak_kwh?: number;
    meter_peak?: number;
    meter_normal?: number;
    meter_offpeak?: number;
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


const recalcEnergyData = (data: MonthlyEnergyRecord[], prevMonth: any) => {
    for (let i = 0; i < data.length; i++) {
        const today = data[i];
        const yesterday = i === 0 ? 
            { 
                electricity_meter_reading: prevMonth?.elec, 
                water_meter_reading: prevMonth?.water,
                meter_peak: prevMonth?.peak,
                meter_normal: prevMonth?.normal,
                meter_offpeak: prevMonth?.offpeak
            } 
            : data[i - 1];

        // Total
        if (today.electricity_meter_reading != null && yesterday.electricity_meter_reading != null) {
            today.electricity_kwh = Math.max(0, today.electricity_meter_reading - yesterday.electricity_meter_reading);
        }

        // Peak
        if (today.meter_peak != null && yesterday.meter_peak != null) {
            today.electricity_peak_kwh = Math.max(0, today.meter_peak - yesterday.meter_peak);
        }

        // Normal
        if (today.meter_normal != null && yesterday.meter_normal != null) {
            today.electricity_normal_kwh = Math.max(0, today.meter_normal - yesterday.meter_normal);
        }

        // Offpeak
        if (today.meter_offpeak != null && yesterday.meter_offpeak != null) {
            today.electricity_offpeak_kwh = Math.max(0, today.meter_offpeak - yesterday.meter_offpeak);
        }

        // Water: consumption = today's meter - yesterday's meter
        // yesterday is prevMonth object on day 0 (e.g. March 31 reading used for April 1)
        if (today.water_meter_reading != null && yesterday.water_meter_reading != null) {
            today.water_m3 = Math.max(0, today.water_meter_reading - yesterday.water_meter_reading);
        }

        // Override total if any sub-meters are calculated
        const p = today.electricity_peak_kwh || 0;
        const n = today.electricity_normal_kwh || 0;
        const o = today.electricity_offpeak_kwh || 0;
        
        if (today.meter_peak != null || today.meter_normal != null || today.meter_offpeak != null) {
            today.electricity_kwh = Math.round((p + n + o) * 100) / 100;
        }
    }
    return data;
};

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
import { Label } from "@/components/ui/label"
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
    actual_ton: z.coerce.number().min(0, "GiÃ¡ trá»‹ pháº£i >= 0"),
    pass1_ton: z.coerce.number().min(0, "Pass 1 >= 0").optional().default(0),
    pass2_ton: z.coerce.number().min(0, "Pass 2 >= 0").optional().default(0),
    isp_ton: z.coerce.number().min(0, "GiÃ¡ trá»‹ ISP >= 0").optional().default(0),
    actual_container: z.coerce.number().min(0, "Sá»‘ container >= 0").optional().default(0),
    note: z.string().optional(),
    electricity_meter_reading: z.coerce.number().min(0, "Chá»‰ sá»‘ Ä‘iá»‡n >= 0").optional(),
})

const kpiSchema = z.object({
    wip_open_ton: z.coerce.number().min(0, "WIP Äáº§u >= 0").optional().default(0),
    wip_close_ton: z.coerce.number().min(0, "WIP Cuá»‘i >= 0").optional().default(0),
    input_ton: z.coerce.number().min(0, "Input >= 0").optional().default(0),
    good_output_ton: z.coerce.number().min(0, "Output >= 0").optional().default(0),
    downtime_min: z.coerce.number().min(0, "Downtime >= 0").optional().default(0),
    broken_pct: z.coerce.number().min(0, "Broken >= 0").max(100, "Broken <= 100").optional().default(0),
    unpeel_pct: z.coerce.number().min(0, "Unpeel >= 0").max(100, "Unpeel <= 100").optional().default(0),
    isp_pct: z.coerce.number().min(0, "ISP >= 0").max(100, "ISP <= 100").optional().default(0),
    sw_pct: z.coerce.number().min(0, "SW >= 0").max(100, "SW <= 100").optional().default(0),
    actual_container: z.coerce.number().min(0, "Sá»‘ container >= 0").optional().default(0),
    electricity_meter_reading: z.coerce.number().min(0, "Chá»‰ sá»‘ Ä‘iá»‡n >= 0").optional(),
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
    const [prevMonthLastMeter, setPrevMonthLastMeter] = useState<any>({ elec: null, water: null, peak: null, normal: null, offpeak: null })
    const [prevMeterReading, setPrevMeterReading] = useState<number | null>(null)
    const [prevDayActual, setPrevDayActual] = useState<number | null>(null)
    const [recentRecords, setRecentRecords] = useState<any[]>([])

    // Downtime State
    const [downtimes, setDowntimes] = useState<any[]>([])
    const [dtDuration, setDtDuration] = useState("")
    const [dtCause, setDtCause] = useState("")
    const [dtNote, setDtNote] = useState("")
    const [dtCustomNote, setDtCustomNote] = useState("") // shown when user picks 'Nháº­p lÃ½ do khÃ¡c...'
    const DT_CUSTOM_SENTINEL = "__CUSTOM__"

    // Shelling Monthly Energy State
    const [shellingMonthlyEnergyData, setShellingMonthlyEnergyData] = useState<ShellingMonthlyEnergyRecord[]>([])

    // Compressor Daily Meter State
    type CompressorRecord = { work_date: string; meter1?: number; meter2?: number; meter3?: number; kwh1: number; kwh2: number; kwh3: number; total_kwh: number; };
    const [compressorData, setCompressorData] = useState<CompressorRecord[]>([]);

    // Other Electricity State
    type OtherElecRecord = { 
        work_date: string; 
        cooling_fan?: number; 
        boiler?: number; 
        office?: number; 
        db_ac_hca?: number; 
        eco2?: number; 
        canteen?: number; 
        transformer?: number; 
        maintenance?: number; 
        kwh_cooling_fan: number; 
        kwh_boiler: number; 
        kwh_office: number; 
        kwh_db_ac_hca: number; 
        kwh_eco2: number; 
        kwh_canteen: number; 
        kwh_transformer: number; 
        kwh_maintenance: number; 
    };
    const [otherElecData, setOtherElecData] = useState<OtherElecRecord[]>([]);
    const [woodTotalInput, setWoodTotalInput] = useState<string>(""); // State for wood distribution input

    // Shelling Line Tracking State
    const SHELLING_LINES = ['A', 'B', 'C', 'D1', 'D2'] as const
    type ShellLine = typeof SHELLING_LINES[number]
    type ShellShift = 'Ca 1' | 'Ca 2' | 'Ca 3'
    type ShellLineEntry = { actual_ton: number; run_hours: number; downtime_min?: number;
    manpower?: number;
    broken_pct?: number;
    size?: string;
    note: string; }
    
    // Fixed default staffing (nhÃ¢n sá»± cá»‘ Ä‘á»‹nh) per line when running
    const SHELLING_LINE_MANPOWER: Record<ShellLine, number> = { A: 2, B: 2, C: 2, D1: 2, D2: 3 }
    // Ideal (theoretical) capacity per hour per line in tons/hour
    const SHELLING_IDEAL_RATE: Record<ShellLine, number> = { A: 1.4, B: 1.8, C: 1.5, D1: 1.2, D2: 1.2 }
    const SHELL_PLANNED_HOURS = 8
    // Helper: compute OEE for a line+shift using cross-line active-shift logic
    // If the factory shift is active (any line ran) but THIS line has no output,
    // those 8h count as planned time â†’ Availability drops accordingly.
    const calcOEE = (line: ShellLine, shift: ShellShift) => {
        // Check if ANY line is running this shift (factory active)
        const shiftIsActive = SHELLING_LINES.some(l => {
            const d = shellingLineData[l]?.[shift]
            return (d?.actual_ton || 0) > 0 || (d?.run_hours || 0) > 0
        })
        if (!shiftIsActive) return null
        const d = shellingLineData[line]?.[shift]
        const runH = (d?.run_hours || 0)
        const aTon = (d?.actual_ton || 0)
        const broken = (d?.broken_pct || 0)
        // Availability = actual run hours / planned 8h
        // If line didn't run in an active shift â†’ runH=0 â†’ avail=0 (correct!)
        const avail = runH / SHELL_PLANNED_HOURS
        const idealTon = runH > 0 ? runH * SHELLING_IDEAL_RATE[line] : 0
        const perf = idealTon > 0 ? Math.min(1, aTon / idealTon) : 0
        const qual = 1 - broken / 100
        const oee = avail * perf * qual
        return { avail, perf, qual, oee, hasData: true }
    }
    const initShiftObj = () => ({ 'Ca 1': { actual_ton: 0, run_hours: 0, downtime_min: 0, manpower: 0, broken_pct: 0, size: '', note: '' }, 'Ca 2': { actual_ton: 0, run_hours: 0, downtime_min: 0, manpower: 0, broken_pct: 0, size: '', note: '' }, 'Ca 3': { actual_ton: 0, run_hours: 0, downtime_min: 0, manpower: 0, broken_pct: 0, size: '', note: '' } });
    
    const [shellingLineData, setShellingLineData] = useState<Record<ShellLine, Record<ShellShift, ShellLineEntry>>>({
        A: initShiftObj(),
        B: initShiftObj(),
        C: initShiftObj(),
        D1: initShiftObj(),
        D2: initShiftObj()
    })
    
    const shellingFetchRef = useRef<string>("");
    const SHIFT_LEADERS = ['Mrs. TÃ¢m', 'Ms. Linh', 'Mr. TrÃ­']
    const [shiftLeaders, setShiftLeaders] = useState<Record<ShellShift, string>>({
        'Ca 1': '',
        'Ca 2': '',
        'Ca 3': ''
    })


    // Forms
    const formActual = useForm<z.infer<typeof actualSchema>>({
        resolver: zodResolver(actualSchema),
        defaultValues: {
            actual_ton: 0,
            pass1_ton: 0,
            pass2_ton: 0,
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
                // Support new allowed_dept_ids array (takes union with above)
                if (profile.allowed_dept_ids && profile.allowed_dept_ids.length > 0) {
                    profile.allowed_dept_ids.forEach((id: string) => ids.add(id))
                    // Set first allowed dept as default if no primary set
                    if (!profile.department_id) setSelectedDept(profile.allowed_dept_ids[0])
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
                    pass1_ton: Number(actualData?.pass1_ton || 0),
                    pass2_ton: Number(actualData?.pass2_ton || 0),
                    isp_ton: Number(actualData?.isp_ton || 0),
                    actual_container: Number(actualData?.actual_container || 0),
                    note: actualData?.note || "",
                    electricity_meter_reading: 0,
                })
            } else {
                formActual.reset({ actual_ton: 0, pass1_ton: 0, pass2_ton: 0, isp_ton: 0, actual_container: 0, note: "", electricity_meter_reading: 0 })
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

            // Fetch Downtime
            const { data: dtData } = await supabase
                .from("downtime_events")
                .select("*")
                .eq("department_id", selectedDept)
                .eq("work_date", formattedDate)
                .order("created_at", { ascending: true })
            setDowntimes(dtData || [])

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
        const deptCodeLine = departments.find(d => d.id === selectedDept)?.code
        if (deptCodeLine === 'SHELL') {
            const cacheKey = `${selectedDept}-${format(date, "yyyy-MM-dd")}`;
            if (shellingFetchRef.current !== cacheKey) {
                shellingFetchRef.current = cacheKey;
                fetchShellingLineData();
            }
        }
    }, [selectedDept, date, formActual, formKpi, departments])

    // Auto calculate Shelling Line downtime based on downtimes
    useEffect(() => {
        if (!selectedDept || departments.find(d => d.id === selectedDept)?.code !== 'SHELL') return;

        // Aggregate downtimes by line and shift
        const dtMap: Record<ShellLine, Record<ShellShift, number>> = {
            A: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
            B: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
            C: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
            D1: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
            D2: { 'Ca 1': 0, 'Ca 2': 0, 'Ca 3': 0 },
        };

        downtimes.forEach(dt => {
            if (dt.exclude_downtime) return;
            const machineArea = String(dt.machine_area || '');
            const line = machineArea.replace('Line ', '') as ShellLine;
            if (['A', 'B', 'C', 'D1', 'D2'].includes(line)) {
                // Determine shift from start_time (format usually HH:mm:ss)
                let shift: ShellShift = 'Ca 1'; // Default
                if (dt.start_time) {
                    const h = parseInt(dt.start_time.split(':')[0], 10);
                    if (h >= 6 && h < 14) shift = 'Ca 1';
                    else if (h >= 14 && h < 22) shift = 'Ca 2';
                    else shift = 'Ca 3';
                }
                dtMap[line][shift] += Number(dt.duration_mins || 0);
            }
        });

        // Apply to shellingLineData
        setShellingLineData(prev => {
            const next = { ...prev };
            let changed = false;
            (['A', 'B', 'C', 'D1', 'D2'] as ShellLine[]).forEach(l => {
                (['Ca 1', 'Ca 2', 'Ca 3'] as ShellShift[]).forEach(s => {
                    if (next[l]?.[s] && next[l][s].downtime_min !== dtMap[l][s]) {
                        next[l] = { ...next[l], [s]: { ...next[l][s], downtime_min: dtMap[l][s] } };
                        changed = true;
                    }
                })
            });
            return changed ? next : prev;
        });
    }, [downtimes, selectedDept, departments]);

    // Fetch History
    // Auto-save energy data when it changes (debounced)
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isFirstEnergyLoad = useRef(true)

    useEffect(() => {
        // Skip on initial load (data just fetched from DB)
        if (isFirstEnergyLoad.current) {
            isFirstEnergyLoad.current = false
            return
        }
        if (monthlyEnergyData.length === 0) return
        if (role !== 'admin' && role !== 'HSE' && role !== 'hse_admin') return

        // Debounce: wait 1.5s after last change before saving
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(async () => {
            const payloadToSave = monthlyEnergyData.map(record => ({
                ...record,
                electricity_peak_kwh: record.electricity_peak_kwh ?? null,
                electricity_normal_kwh: record.electricity_normal_kwh ?? null,
                electricity_offpeak_kwh: record.electricity_offpeak_kwh ?? null,
                meter_peak: record.meter_peak ?? null,
                meter_normal: record.meter_normal ?? null,
                meter_offpeak: record.meter_offpeak ?? null,
                updated_at: new Date().toISOString()
            }))
            await supabase.from('daily_energy').upsert(payloadToSave, { onConflict: 'work_date' })
        }, 1500)

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        }
    }, [monthlyEnergyData])

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
            if (!date || (role !== 'admin' && role !== 'HSE' && role !== 'hse_admin' && role !== 'maint')) return;
            isFirstEnergyLoad.current = true // Mark next state update as a DB load (prevent auto-save)
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
                .select('electricity_meter_reading, water_meter_reading, meter_peak, meter_normal, meter_offpeak')
                .eq('work_date', prevDateStr)
                .single();

            const pElec   = pData?.electricity_meter_reading != null ? Number(pData.electricity_meter_reading) : null;
            const pWater  = pData?.water_meter_reading != null         ? Number(pData.water_meter_reading) : null;
            const pPeak   = pData?.meter_peak   != null                ? Number(pData.meter_peak) : null;
            const pNormal = pData?.meter_normal  != null               ? Number(pData.meter_normal) : null;
            const pOffpeak= pData?.meter_offpeak != null               ? Number(pData.meter_offpeak) : null;

            const prevMonthObj = { elec: pElec, water: pWater, peak: pPeak, normal: pNormal, offpeak: pOffpeak };
            setPrevMonthLastMeter(prevMonthObj);

            // Generate an array for every day in the month
            const daysInMonth = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });

            const compiledData: MonthlyEnergyRecord[] = daysInMonth.map(d => {
                const dayStr = format(d, "yyyy-MM-dd");
                const existing = monthData?.find((r: any) => r.work_date === dayStr);
                return {
                    work_date: dayStr,
                    electricity_kwh: Number(existing?.electricity_kwh || 0),
                    electricity_peak_kwh: existing?.electricity_peak_kwh !== null && existing?.electricity_peak_kwh !== undefined ? Number(existing?.electricity_peak_kwh) : undefined,
                    electricity_normal_kwh: existing?.electricity_normal_kwh !== null && existing?.electricity_normal_kwh !== undefined ? Number(existing?.electricity_normal_kwh) : undefined,
                    electricity_offpeak_kwh: existing?.electricity_offpeak_kwh !== null && existing?.electricity_offpeak_kwh !== undefined ? Number(existing?.electricity_offpeak_kwh) : undefined,
                    meter_peak: existing?.meter_peak !== null && existing?.meter_peak !== undefined ? Number(existing?.meter_peak) : undefined,
                    meter_normal: existing?.meter_normal !== null && existing?.meter_normal !== undefined ? Number(existing?.meter_normal) : undefined,
                    meter_offpeak: existing?.meter_offpeak !== null && existing?.meter_offpeak !== undefined ? Number(existing?.meter_offpeak) : undefined,
                    electricity_target_kwh: Number(existing?.electricity_target_kwh || 0),
                    water_m3: Number(existing?.water_m3 || 0),
                    water_target_m3: Number(existing?.water_target_m3 || 0),
                    wood_kg: Number(existing?.wood_kg || 0),
                    wood_target_kg: Number(existing?.wood_target_kg || 0),
                    electricity_meter_reading: existing?.electricity_meter_reading !== null && existing?.electricity_meter_reading !== undefined ? Number(existing?.electricity_meter_reading) : undefined,
                    water_meter_reading: existing?.water_meter_reading !== null && existing?.water_meter_reading !== undefined ? Number(existing?.water_meter_reading) : undefined,
                };
            });

            setMonthlyEnergyData(recalcEnergyData(compiledData, prevMonthObj));
        }
        fetchEnergy();
    }, [date, role])

    // Load Compressor Meter Data
    useEffect(() => {
        async function fetchCompressor() {
            if (!date || (role !== 'admin' && role !== 'HSE' && role !== 'hse_admin' && role !== 'maint')) return;
            const startStr = format(startOfMonth(date), "yyyy-MM-dd");
            const endStr = format(endOfMonth(date), "yyyy-MM-dd");
            const prevDateStr = format(subDays(startOfMonth(date), 1), "yyyy-MM-dd");

            const { data: monthData } = await supabase
                .from('daily_compressor')
                .select('*')
                .gte('work_date', startStr)
                .lte('work_date', endStr)
                .order('work_date');

            const { data: prevData } = await supabase
                .from('daily_compressor')
                .select('meter1, meter2, meter3')
                .eq('work_date', prevDateStr)
                .single();

            const daysInMonth = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });
            const compiled: CompressorRecord[] = daysInMonth.map(d => {
                const dayStr = format(d, "yyyy-MM-dd");
                const ex = monthData?.find((r: any) => r.work_date === dayStr);
                return {
                    work_date: dayStr,
                    meter1: ex?.meter1 !== null && ex?.meter1 !== undefined ? Number(ex.meter1) : undefined,
                    meter2: ex?.meter2 !== null && ex?.meter2 !== undefined ? Number(ex.meter2) : undefined,
                    meter3: ex?.meter3 !== null && ex?.meter3 !== undefined ? Number(ex.meter3) : undefined,
                    kwh1: 0, kwh2: 0, kwh3: 0, total_kwh: 0,
                };
            });

            // Compute daily kWh from meter diff (input is MWh). Day 0 uses prev month's last reading.
            const calcKwh = (curr: number | undefined, prev: number | undefined) =>
                curr !== undefined && prev !== undefined ? Math.max(0, (curr - prev) * 1000) : 0;

            for (let i = 0; i < compiled.length; i++) {
                const prevRec = i === 0 ? prevData : compiled[i - 1];
                compiled[i].kwh1 = calcKwh(compiled[i].meter1, prevRec?.meter1 ?? undefined);
                compiled[i].kwh2 = calcKwh(compiled[i].meter2, prevRec?.meter2 ?? undefined);
                compiled[i].kwh3 = calcKwh(compiled[i].meter3, prevRec?.meter3 ?? undefined);
                compiled[i].total_kwh = compiled[i].kwh1 + compiled[i].kwh2 + compiled[i].kwh3;
            }

            setCompressorData(compiled);
        }
        fetchCompressor();
        
        async function fetchOtherElec() {
            if (role !== 'admin' && role !== 'HSE' && role !== 'hse_admin' && role !== 'maint') return;
            const startStr = format(startOfMonth(date), "yyyy-MM-dd");
            const endStr = format(endOfMonth(date), "yyyy-MM-dd");

            const { data } = await supabase
                .from("daily_electricity_others")
                .select("*")
                .gte("work_date", startStr)
                .lte("work_date", endStr)
                .order('work_date', { ascending: true });

            const daysInMonth = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });
            const compiled: OtherElecRecord[] = daysInMonth.map(d => {
                const dayStr = format(d, "yyyy-MM-dd");
                const existing = data?.find(r => r.work_date === dayStr);
                return {
                    work_date: dayStr,
                    cooling_fan: existing?.cooling_fan !== null && existing?.cooling_fan !== undefined ? Number(existing.cooling_fan) : undefined,
                    boiler: existing?.boiler !== null && existing?.boiler !== undefined ? Number(existing.boiler) : undefined,
                    office: existing?.office !== null && existing?.office !== undefined ? Number(existing.office) : undefined,
                    db_ac_hca: existing?.db_ac_hca !== null && existing?.db_ac_hca !== undefined ? Number(existing.db_ac_hca) : undefined,
                    eco2: existing?.eco2 !== null && existing?.eco2 !== undefined ? Number(existing.eco2) : undefined,
                    canteen: existing?.canteen !== null && existing?.canteen !== undefined ? Number(existing.canteen) : undefined,
                    transformer: existing?.transformer !== null && existing?.transformer !== undefined ? Number(existing.transformer) : undefined,
                    maintenance: existing?.maintenance !== null && existing?.maintenance !== undefined ? Number(existing.maintenance) : undefined,
                    kwh_cooling_fan: 0, kwh_boiler: 0, kwh_office: 0, kwh_db_ac_hca: 0, kwh_eco2: 0, kwh_canteen: 0, kwh_transformer: 0, kwh_maintenance: 0
                };
            });

            // Calculate daily consumption
            const calc = (curr: number|undefined, prev: number|undefined) => {
                if (curr === undefined || prev === undefined) return 0;
                return Math.max(0, curr - prev); // Result directly in kWh
            };

            for (let i = 1; i < compiled.length; i++) {
                const prev = compiled[i - 1];
                compiled[i].kwh_cooling_fan = calc(compiled[i].cooling_fan, prev.cooling_fan);
                compiled[i].kwh_boiler = calc(compiled[i].boiler, prev.boiler);
                compiled[i].kwh_office = calc(compiled[i].office, prev.office);
                compiled[i].kwh_db_ac_hca = calc(compiled[i].db_ac_hca, prev.db_ac_hca);
                compiled[i].kwh_eco2 = calc(compiled[i].eco2, prev.eco2);
                compiled[i].kwh_canteen = calc(compiled[i].canteen, prev.canteen);
                compiled[i].kwh_transformer = calc(compiled[i].transformer, prev.transformer);
                compiled[i].kwh_maintenance = calc(compiled[i].maintenance, prev.maintenance);
            }
            setOtherElecData(compiled);
        }
        fetchOtherElec();

    }, [date, role])

    // Load Shelling Energy
    useEffect(() => {
        async function fetchShellingEnergy() {
            if (!date) return;
            const hasShellAccess = role === 'admin' || role === 'hse_admin' || role === 'maint' || Array.from(allowedDeptIds).some(id => departments.find(d => d.id === id)?.code === 'SHELL');
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
                const existingActual = actualData?.find(r => r.work_date === dayStr);

                return {
                    work_date: dayStr,
                    actual_ton: existingActual?.actual_ton ? Number(existingActual.actual_ton) : 0,
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
            toast.error("Vui lÃ²ng chá»n bá»™ pháº­n")
            return
        }

        // Show confirmation if admin
        if (role === 'admin' || role === 'hse_admin') {
            setConfirmDialog({
                isOpen: true,
                title: "XÃ¡c nháº­n lÆ°u Sáº£n lÆ°á»£ng",
                description: "Báº¡n Ä‘ang lÆ°u báº±ng quyá»n Admin. Dá»¯ liá»‡u sáº½ Ä‘Ã¨ lÃªn bÃ¡o cÃ¡o hiá»‡n táº¡i cá»§a ngÃ y nÃ y. Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n lÆ°u?",
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
                pass1_ton: values.pass1_ton,
                pass2_ton: values.pass2_ton,
                isp_ton: values.isp_ton,
                actual_container: values.actual_container,
                note: values.note,
                updated_by: userId,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'department_id,work_date' }
        )

        if (actualError) {
            toast.error("Lá»—i khi lÆ°u Actual: " + actualError.message)
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

            toast.success("ÄÃ£ lÆ°u Actual thÃ nh cÃ´ng")
            fetchHistory(selectedDept)
            // Auto-save shelling line data when dept is SHELL
            if (departments.find(d => d.id === selectedDept)?.code === 'SHELL') {
                saveShellingLines()
            }
        }
        setIsSaving(false)
    }

    async function handleAddDowntime() {
        if (!selectedDept || !dtDuration || !dtCause) return;
        // Resolve the actual note: if user chose "Nháº­p lÃ½ do khÃ¡c..." use their typed text
        const resolvedNote = dtNote === DT_CUSTOM_SENTINEL ? dtCustomNote.trim() : dtNote;
        if (dtNote === DT_CUSTOM_SENTINEL && !resolvedNote) return; // guard: must type something
        setIsSaving(true);
        const formattedDate = format(date, "yyyy-MM-dd");
        const { data, error } = await supabase.from('downtime_events').insert({
            department_id: selectedDept,
            work_date: formattedDate,
            duration_mins: parseInt(dtDuration),
            root_cause: dtCause,
            note: resolvedNote,
            created_by: userId
        }).select().single();

        if (error) {
            toast.error("Lá»—i khi lÆ°u sá»± cá»‘: " + error.message);
        } else {
            toast.success("ÄÃ£ ghi nháº­n sá»± cá»‘");
            setDowntimes(prev => [...prev, data]);
            setDtDuration("");
            setDtCause("");
            setDtNote("");
            setDtCustomNote("");
            // Update the KPI downtime_min logic if they want to sum it up dynamically
            const newTotal = downtimes.reduce((s, r) => s + Number(r.duration_mins), 0) + data.duration_mins;
            formKpi.setValue("downtime_min", newTotal);
        }
        setIsSaving(false);
    }

    async function handleDeleteDowntime(id: string) {
        if (!window.confirm("Báº¡n cÃ³ cháº¯c muá»‘n xÃ³a sá»± cá»‘ nÃ y?")) return;
        const { error } = await supabase.from('downtime_events').delete().eq('id', id);
        if (error) {
            toast.error("Lá»—i khi xÃ³a: " + error.message);
        } else {
            toast.success("ÄÃ£ xÃ³a sá»± cá»‘");
            setDowntimes(prev => {
                const updated = prev.filter(r => r.id !== id);
                const newTotal = updated.reduce((s, r) => s + Number(r.duration_mins), 0);
                formKpi.setValue("downtime_min", newTotal);
                return updated;
            });
        }
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
            toast.error('Lá»—i khi lÆ°u FGWH: ' + error.message)
        } else {
            toast.success('ÄÃ£ lÆ°u sá»‘ liá»‡u FGWH thÃ nh cÃ´ng')
            fetchHistory(selectedDept)
        }
        setIsSaving(false)
    }
    async function saveOtherElec() {
        setIsSaving(true);
        const payload = otherElecData
            .filter(r => r.cooling_fan !== undefined || r.boiler !== undefined || r.office !== undefined || r.db_ac_hca !== undefined || r.eco2 !== undefined || r.canteen !== undefined || r.transformer !== undefined || r.maintenance !== undefined)
            .map(r => ({
                work_date: r.work_date,
                cooling_fan: r.cooling_fan,
                boiler: r.boiler,
                office: r.office,
                db_ac_hca: r.db_ac_hca,
                eco2: r.eco2,
                canteen: r.canteen,
                transformer: r.transformer,
                maintenance: r.maintenance,
                updated_at: new Date().toISOString()
            }));

        const { error } = await supabase.from('daily_electricity_others').upsert(payload, { onConflict: 'work_date' });

        if (error) {
            toast.error("Lá»—i khi lÆ°u Äiá»‡n KhÃ¡c: " + error.message);
        } else {
            toast.success("ÄÃ£ cáº­p nháº­t sá»‘ liá»‡u Äiá»‡n KhÃ¡c");
        }
        setIsSaving(false);
    }

    async function saveCompressor() {
        setIsSaving(true);
        const payload = compressorData
            .filter(r => r.meter1 !== undefined || r.meter2 !== undefined || r.meter3 !== undefined)
            .map(r => ({
                work_date: r.work_date,
                meter1: r.meter1 ?? null,
                meter2: r.meter2 ?? null,
                meter3: r.meter3 ?? null,
                updated_at: new Date().toISOString(),
            }));
        const { error } = await supabase.from('daily_compressor').upsert(payload, { onConflict: 'work_date' });
        if (error) toast.error('Lá»—i khi lÆ°u MÃ¡y nÃ©n khÃ­: ' + error.message);
        else toast.success('ÄÃ£ lÆ°u dá»¯ liá»‡u MÃ¡y nÃ©n khÃ­ thÃ nh cÃ´ng');
        setIsSaving(false);
    }

    async function saveEnergy() {
        setIsSaving(true)
        const payloadToSave = monthlyEnergyData.map(record => ({
            ...record,
            electricity_peak_kwh: record.electricity_peak_kwh ?? null,
            electricity_normal_kwh: record.electricity_normal_kwh ?? null,
            electricity_offpeak_kwh: record.electricity_offpeak_kwh ?? null,
            meter_peak: record.meter_peak ?? null,
            meter_normal: record.meter_normal ?? null,
            meter_offpeak: record.meter_offpeak ?? null,
            updated_at: new Date().toISOString()
        }))

        const { error } = await supabase.from('daily_energy').upsert(
            payloadToSave,
            { onConflict: 'work_date' }
        )
        if (error) {
            toast.error('Lá»—i khi lÆ°u Äiá»‡n/NÆ°á»›c/Cá»§i: ' + error.message)
        } else {
            toast.success('ÄÃ£ lÆ°u toÃ n bá»™ dá»¯ liá»‡u Äiá»‡n/NÆ°á»›c/Cá»§i cá»§a thÃ¡ng thÃ nh cÃ´ng')
        }
        setIsSaving(false)
    }

    async function fetchShellingLineData() {
        const formattedDate = format(date, "yyyy-MM-dd")
        const currentRef = shellingFetchRef.current;
        const { data } = await supabase
            .from('shelling_line_daily')
            .select('*')
            .eq('work_date', formattedDate)
            
        if (shellingFetchRef.current !== currentRef) return; // Race condition escape

        if (data) {
            const newState = { A: initShiftObj(), B: initShiftObj(), C: initShiftObj(), D1: initShiftObj(), D2: initShiftObj() } as Record<ShellLine, Record<ShellShift, ShellLineEntry>>
            const newLeaders = { 'Ca 1': '', 'Ca 2': '', 'Ca 3': '' } as Record<ShellShift, string>
            data.forEach((r: any) => {
                const shift = (r.shift_name || 'Ca 1') as ShellShift;
                if (r.shift_leader) newLeaders[shift] = r.shift_leader;
                if (SHELLING_LINES.includes(r.line_code)) {
                    const aTon = Number(r.actual_ton || 0);
                    const savedManpower = Number(r.manpower) || 0;
                    // Auto-fill with fixed default if line is running and no manpower was saved
                    const effectiveManpower = (savedManpower === 0 && aTon > 0)
                        ? SHELLING_LINE_MANPOWER[r.line_code as ShellLine]
                        : savedManpower;
                    newState[r.line_code as ShellLine][shift] = { 
                        actual_ton: aTon, 
                        run_hours: Number(r.run_hours || 0), 
                        downtime_min: Number(r.downtime_min || 0),
                        manpower: effectiveManpower,
                        broken_pct: Number(r.broken_pct) || 0,
                        size: r.size || '',
                        note: r.note || '' 
                    }
                }
            })
            setShellingLineData(newState)
            setShiftLeaders(newLeaders)
        } else {
            // No data in db yet, set just downtime
            const newState = { A: initShiftObj(), B: initShiftObj(), C: initShiftObj(), D1: initShiftObj(), D2: initShiftObj() } as Record<ShellLine, Record<ShellShift, ShellLineEntry>>
            setShellingLineData(newState)
        }
    }

    async function saveShellingLines() {
        setIsSaving(true)
        const formattedDate = format(date, "yyyy-MM-dd")
        const payload = SHELLING_LINES.flatMap(line => 
            (['Ca 1', 'Ca 2', 'Ca 3'] as ShellShift[]).map(shift => {
                const sData = shellingLineData[line as ShellLine][shift];
                const aTon = sData.actual_ton || 0;
                const dMin = sData.downtime_min || 0;
                const mp = sData.manpower || 0;
                const brk = sData.broken_pct || 0;
                const runHrs = (aTon > 0) ? Math.max(0, 7 - dMin / 60) : 0;

                return {
                    work_date: formattedDate,
                    line_code: line,
                    shift_name: shift,
                    shift_leader: shiftLeaders[shift] || null,
                    actual_ton: aTon,
                    run_hours: runHrs,
                    downtime_min: dMin,
                    manpower: mp,
                    broken_pct: brk,
                    size: sData.size || null,
                    note: sData.note || null,
                    updated_by: userId,
                    updated_at: new Date().toISOString()
                }
            })
        )
        const { error } = await supabase.from('shelling_line_daily').upsert(payload, { onConflict: 'work_date,line_code,shift_name' })
        if (error) {
            toast.error('Lá»—i khi lÆ°u Shelling Lines: ' + error.message)
        } else {
            toast.success('ÄÃ£ lÆ°u dá»¯ liá»‡u Shelling Lines thÃ nh cÃ´ng')
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
                toast.error('Lá»—i khi lÆ°u Äiá»‡n Shelling: ' + error.message)
            } else {
                toast.success('ÄÃ£ lÆ°u dá»¯ liá»‡u Äiá»‡n Shelling thÃ nh cÃ´ng')
            }
        }
        setIsSaving(false)
    }

    // Save KPI
    async function onSubmitKpi(values: z.infer<typeof kpiSchema>) {
        if (!selectedDept) {
            toast.error("Vui lÃ²ng chá»n bá»™ pháº­n")
            return
        }

        // Show confirmation if admin
        if (role === 'admin' || role === 'hse_admin') {
            setConfirmDialog({
                isOpen: true,
                title: "XÃ¡c nháº­n lÆ°u KPI",
                description: "Báº¡n Ä‘ang lÆ°u KPI báº±ng quyá»n Admin. Dá»¯ liá»‡u nÃ y sáº½ Ä‘Ã¨ lÃªn KPI hiá»‡n táº¡i cá»§a bá»™ pháº­n trong ngÃ y hÃ´m nay. Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n lÆ°u?",
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
            toast.error("Lá»—i khi lÆ°u KPI: " + error.message)
        } else {
            toast.success("ÄÃ£ lÆ°u KPI thÃ nh cÃ´ng")
            fetchHistory(selectedDept)
        }
        setIsSaving(false)
    }

    const handleShellingLineChange = (line: ShellLine, shift: ShellShift, field: keyof ShellLineEntry, value: number | string) => {
        setShellingLineData(prev => {
            const next = {
                ...prev,
                [line]: {
                    ...prev[line],
                    [shift]: {
                        ...prev[line][shift],
                        [field]: value
                    }
                }
            };

            // Recalculate total actual_ton for formActual
            if (field === 'actual_ton') {
                let total = 0;
                SHELLING_LINES.forEach(l => {
                    (['Ca 1', 'Ca 2', 'Ca 3'] as ShellShift[]).forEach(s => total += (next[l]?.[s]?.actual_ton || 0));
                });
                formActual.setValue('actual_ton', total);
            }
            return next;
        });
    };

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
                        <AlertDialogCancel>Huá»· bá»</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                            confirmDialog.onConfirm();
                        }} className="bg-primary hover:bg-primary/90">Äá»“ng Ã½ lÆ°u</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-center justify-between space-y-2 border-b pb-4 mb-4">
                <h2 className="text-3xl font-bold tracking-tight">Nháº­p Liá»‡u BÃ¡o CÃ¡o</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                <div className="space-y-2 lg:col-span-2">
                    <label className="text-sm font-medium">NgÃ y lÃ m viá»‡c</label>
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
                                {date ? format(date, "PPP", { locale: vi }) : <span>Chá»n ngÃ y</span>}
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

            <Tabs defaultValue={role === 'maint' ? 'other-elec' : 'production'} className="space-y-4">
                <TabsList>
                    {role !== 'maint' && <TabsTrigger value="production">Sáº£n Pháº©m & KPI</TabsTrigger>}
                    {(role === 'admin' || role === 'HSE' || role === 'hse_admin' || role === 'maint') && <TabsTrigger value="energy">Äiá»‡n & NÆ°á»›c</TabsTrigger>}
                    {(role === 'admin' || role === 'HSE' || role === 'hse_admin' || role === 'maint' || Array.from(allowedDeptIds).some(id => departments.find(d => d.id === id)?.code === 'SHELL')) && <TabsTrigger value="shelling-energy">Äiá»‡n Shelling (ThÃ¡ng)</TabsTrigger>}
                    {(role === 'admin' || role === 'HSE' || role === 'hse_admin' || role === 'maint') && <TabsTrigger value="compressor">ðŸŒ¬ï¸ MÃ¡y NÃ©n KhÃ­</TabsTrigger>}
                    {(role === 'admin' || role === 'HSE' || role === 'hse_admin' || role === 'maint') && <TabsTrigger value="other-elec">âš¡ Äiá»‡n KhÃ¡c</TabsTrigger>}
                </TabsList>

                <TabsContent value="production" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                        <div className="space-y-2 lg:col-span-2">
                            <label className="text-sm font-medium">Bá»™ pháº­n</label>
                            <Select
                                value={selectedDept}
                                onValueChange={setSelectedDept}
                                disabled={role === "dept_user" && allowedDeptIds.size <= 1}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Chá»n bá»™ pháº­n" />
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
                            <p>Vui lÃ²ng chá»n bá»™ pháº­n á»Ÿ thanh TÃ¹y chá»n Ä‘á»ƒ báº¯t Ä‘áº§u nháº­p liá»‡u.</p>
                        </div>
                    ) : role === 'viewer' ? (
                        <div className="flex flex-col items-center justify-center p-12 mt-8 border rounded-xl border-dashed bg-amber-50 text-amber-700 gap-2">
                            <p className="font-semibold text-lg">ðŸ”’ Cháº¿ Ä‘á»™ Xem</p>
                            <p className="text-sm text-center">TÃ i khoáº£n nÃ y chá»‰ cÃ³ quyá»n xem Dashboard. LiÃªn há»‡ Admin Ä‘á»ƒ Ä‘Æ°á»£c cáº¥p quyá»n nháº­p liá»‡u.</p>
                        </div>
                    ) : departments.find(d => d.id === selectedDept)?.code === 'FGWH' ? (
                        /* FGWH: Direct ISP / Non-ISP form, no tabs needed */
                        <div className="rounded-xl border bg-card text-card-foreground shadow">
                            <div className="p-6 space-y-6 max-w-lg">
                                <h3 className="font-semibold text-base">FGWH â€” Nháº­p Sáº£n lÆ°á»£ng thá»±c táº¿</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">ISP Thá»±c táº¿ (Táº¥n)</label>
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
                                        <label className="text-sm font-medium">Non-ISP Thá»±c táº¿ (Táº¥n)</label>
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
                                    {isSaving ? 'Äang lÆ°u...' : 'LÆ°u FGWH'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <Tabs defaultValue="actual" className="space-y-4">
                                <TabsList>
                                    <TabsTrigger value="actual">Actual (Sáº£n lÆ°á»£ng)</TabsTrigger>
                                    <TabsTrigger value="kpi">KPI (WIP, Äáº§u ra, Thá»i gian)</TabsTrigger>
                                    <TabsTrigger value="downtime">Downtime (Sá»± cá»‘)</TabsTrigger>
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
                                                                    <TableHead className="w-1/2">Chá»‰ tiÃªu</TableHead>
                                                                    <TableHead className="w-1/2"><span>GiÃ¡ trá»‹ nháº­p</span><span className="ml-2 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{format(date, "dd/MM/yyyy")}</span></TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {departments.find(d => d.id === selectedDept)?.code === 'SHELL' ? (
                                                                    <>
                                                                        <TableRow>
                                                                            <TableCell colSpan={2} className="p-0 pb-0">
                                                                                <div className="bg-slate-50/60 border-b px-4 pt-3 pb-2 flex gap-4 overflow-x-auto">
                                                                                    <p className="text-xs font-semibold text-slate-700 whitespace-nowrap self-center mr-2">ðŸ‘¤ Tá»• trÆ°á»Ÿng:</p>
                                                                                    {(['Ca 1', 'Ca 2', 'Ca 3'] as ShellShift[]).map(shift => (
                                                                                        <div key={shift} className="flex flex-col items-start min-w-[120px]">
                                                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                            <select
                                                                                                value={shiftLeaders[shift]}
                                                                                                onChange={e => setShiftLeaders(prev => ({ ...prev, [shift]: e.target.value }))}
                                                                                                className="w-full text-xs p-1.5 rounded border border-slate-300 bg-white focus:outline-none focus:border-primary"
                                                                                            >
                                                                                                <option value="">-- Trá»‘ng --</option>
                                                                                                {SHIFT_LEADERS.map(l => <option key={l} value={l}>{l}</option>)}
                                                                                            </select>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                                <div className="bg-blue-50/60 border-b px-4 pt-3 pb-1">
                                                                                    <p className="text-xs font-semibold text-blue-700 mb-2">ðŸ“Š Sáº£n lÆ°á»£ng theo tá»«ng Line (Táº¥n)</p>
                                                                                    {(['Ca 1', 'Ca 2', 'Ca 3'] as ('Ca 1' | 'Ca 2' | 'Ca 3')[]).map(shift => (
                                                                                        <div key={shift} className="mb-3">
                                                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                            <div className="grid grid-cols-5 gap-2">
                                                                                                {SHELLING_LINES.map(line => {
                                                                                                    const lColors: Record<string, string> = { A: 'border-blue-400', B: 'border-green-400', C: 'border-amber-400', D1: 'border-red-400', D2: 'border-purple-400' }
                                                                                                    return (
                                                                                                        <div key={`${line}-${shift}`} className="flex flex-col items-center flex-1">
                                                                                                            <label className={`text-[10px] font-bold mb-1 ${lColors[line].replace('border-','text-')}`}>{line}</label>
                                                                                                            <input
                                                                                                                type="number" step="0.001" min="0"
                                                                                                                className={`w-full text-right p-1 rounded border-2 ${lColors[line]} bg-white text-sm focus:outline-none`}
                                                                                                                value={shellingLineData[line]?.[shift]?.actual_ton || ''}
                                                                                                                onChange={e => {
                                                                                                                    const val = Number(e.target.value) || 0
                                                                                                                    setShellingLineData(prev => {
                                                                                                                        const currentMp = prev[line]?.[shift]?.manpower || 0;
                                                                                                                        // Auto-fill manpower with fixed default when line starts running and manpower not yet set
                                                                                                                        const newMp = (val > 0 && currentMp === 0) ? SHELLING_LINE_MANPOWER[line] : currentMp;
                                                                                                                        const next = { ...prev, [line]: { ...prev[line], [shift]: { ...prev[line][shift], actual_ton: val, manpower: newMp } } }
                                                                                                                        let total = 0
                                                                                                                        SHELLING_LINES.forEach(l => {
                                                                                                                            (['Ca 1', 'Ca 2', 'Ca 3'] as ('Ca 1' | 'Ca 2' | 'Ca 3')[]).forEach(s => total += (next[l]?.[s]?.actual_ton || 0))
                                                                                                                        })
                                                                                                                        formActual.setValue('actual_ton', total)
                                                                                                                        return next
                                                                                                                    })
                                                                                                                }}
                                                                                                            />
                                                                                                        </div>
                                                                                                    )
                                                                                                })}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                    <p className="text-[10px] font-semibold text-blue-800 text-right">
                                                                                        Tá»•ng 3 ca: <span className="text-base font-black">{SHELLING_LINES.reduce((s, l) => s + (shellingLineData[l]?.['Ca 1']?.actual_ton || 0) + (shellingLineData[l]?.['Ca 2']?.actual_ton || 0) + (shellingLineData[l]?.['Ca 3']?.actual_ton || 0), 0).toFixed(3)}</span> T
                                                                                    </p>
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        <TableRow>
                                                                            <TableCell colSpan={2} className="p-0">
                                                                                <div className="bg-purple-50/40 border-b px-4 pt-2 pb-3">
                                                                                    <p className="text-xs font-semibold text-purple-700 mb-2">ðŸ·ï¸ KÃ­ch cá»¡ (Size)</p>
                                                                                    {(['Ca 1', 'Ca 2', 'Ca 3'] as ('Ca 1' | 'Ca 2' | 'Ca 3')[]).map(shift => (
                                                                                        <div key={shift} className="mb-3">
                                                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                            <div className="grid grid-cols-5 gap-2">
                                                                                                {SHELLING_LINES.map(line => (
                                                                                                    <div key={`${line}-${shift}`} className="flex flex-col items-center">
                                                                                                        <label className="text-[10px] font-bold mb-1 text-gray-500">{line}</label>
                                                                                                        <select
                                                                                                            className="w-full text-center p-1 rounded border-2 border-purple-200 bg-white text-sm focus:outline-none focus:border-purple-500"
                                                                                                            value={shellingLineData[line]?.[shift]?.size || ''}
                                                                                                            onChange={e => setShellingLineData(prev => ({ ...prev, [line]: { ...prev[line], [shift]: { ...prev[line][shift], size: e.target.value } } }))}
                                                                                                        >
                                                                                                            <option value="">--</option>
                                                                                                            {['A+', 'A1', 'A2', 'B', 'B1', 'B2', 'C', 'C1', 'C2', 'D1', 'D2', 'E'].map(s => <option key={s} value={s}>{s}</option>)}
                                                                                                        </select>
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        <TableRow>
                                                                            <TableCell colSpan={2} className="p-0">
                                                                                <div className="bg-green-50/40 border-b px-4 pt-2 pb-3">
                                                                                    <p className="text-xs font-semibold text-green-700 mb-2">â± Thá»i gian cháº¡y mÃ¡y (Giá»)</p>
                                                                                    {(['Ca 1', 'Ca 2', 'Ca 3'] as ('Ca 1' | 'Ca 2' | 'Ca 3')[]).map(shift => (
                                                                                        <div key={shift} className="mb-3">
                                                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                            <div className="grid grid-cols-5 gap-2">
                                                                                                {SHELLING_LINES.map(line => {
                                                                                                    const aTon = shellingLineData[line]?.[shift]?.actual_ton || 0;
                                                                                                    const dMin = shellingLineData[line]?.[shift]?.downtime_min || 0;
                                                                                                    const mp = shellingLineData[line]?.[shift]?.manpower || 0;
                                                                                                    const runHrs = (aTon > 0) ? Math.max(0, 7 - dMin / 60) : 0;
                                                                                                    return (
                                                                                                    <div key={`${line}-${shift}`} className="flex flex-col items-center">
                                                                                                        <label className="text-[10px] font-bold mb-1 text-gray-500">{line}</label>
                                                                                                        <input
                                                                                                            type="number" step="0.1" min="0" max="24" readOnly
                                                                                                            className="w-full text-right p-1 rounded border-2 border-green-300 bg-green-50 text-sm focus:outline-none text-green-800 font-semibold cursor-not-allowed"
                                                                                                            value={runHrs > 0 ? runHrs.toFixed(1) : ''}
                                                                                                            title="Tá»± Ä‘á»™ng tÃ­nh = 7 giá» - Dá»«ng mÃ¡y"
                                                                                                        />
                                                                                                    </div>
                                                                                                )})}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        <TableRow>
                                                                            <TableCell colSpan={2} className="p-0">
                                                                                <div className="bg-red-50/40 border-b px-4 pt-2 pb-3">
                                                                                    <p className="text-xs font-semibold text-red-700 mb-2">â¸ Thá»i gian dá»«ng mÃ¡y - Downtime (PhÃºt)</p>
                                                                                    {(['Ca 1', 'Ca 2', 'Ca 3'] as ('Ca 1' | 'Ca 2' | 'Ca 3')[]).map(shift => (
                                                                                        <div key={shift} className="mb-3">
                                                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                            <div className="grid grid-cols-5 gap-2">
                                                                                                {SHELLING_LINES.map(line => (
                                                                                                    <div key={`${line}-${shift}`} className="flex flex-col items-center">
                                                                                                        <label className="text-[10px] font-bold mb-1 text-gray-500">{line}</label>
                                                                                                        <input
                                                                                                            type="number" step="1" min="0" readOnly
                                                                                                            className="w-full text-right p-1 rounded border-2 border-red-200 bg-red-50 text-sm focus:outline-none text-red-700 font-semibold cursor-not-allowed"
                                                                                                            value={shellingLineData[line]?.[shift]?.downtime_min || ''}
                                                                                                            title="Dá»¯ liá»‡u tá»± Ä‘á»™ng Ä‘á»“ng bá»™ tá»« Há»‡ thá»‘ng Cáº£nh bÃ¡o Sá»± cá»‘"
                                                                                                        />
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        <TableRow>
                                                                            <TableCell colSpan={2} className="p-0">
                                                                                <div className="bg-amber-50/40 border-b px-4 pt-2 pb-3">
                                                                                    <div className="flex items-center gap-2 mb-2">
                                                                                        <p className="text-xs font-semibold text-amber-700">ðŸ§‘â€ðŸ¤â€ðŸ§‘ NhÃ¢n sá»± tham gia (NgÆ°á»i)</p>
                                                                                        <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full font-medium">Äá»‹nh má»©c: A/B/C/D1=2, D2=3</span>
                                                                                    </div>
                                                                                    {(['Ca 1', 'Ca 2', 'Ca 3'] as ('Ca 1' | 'Ca 2' | 'Ca 3')[]).map(shift => (
                                                                                        <div key={shift} className="mb-3">
                                                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                            <div className="grid grid-cols-5 gap-2">
                                                                                                {SHELLING_LINES.map(line => {
                                                                                                    const currentMp = shellingLineData[line]?.[shift]?.manpower || 0;
                                                                                                    const defaultMp = SHELLING_LINE_MANPOWER[line];
                                                                                                    const isRunning = (shellingLineData[line]?.[shift]?.actual_ton || 0) > 0;
                                                                                                    const isOverridden = isRunning && currentMp !== defaultMp && currentMp !== 0;
                                                                                                    return (
                                                                                                    <div key={`${line}-${shift}`} className="flex flex-col items-center">
                                                                                                        <label className="text-[10px] font-bold mb-0.5 text-gray-500">
                                                                                                            {line}
                                                                                                            <span className="text-[9px] text-amber-500 ml-0.5">({defaultMp})</span>
                                                                                                        </label>
                                                                                                        <input
                                                                                                            type="number" step="1" min="0"
                                                                                                            className={`w-full text-right p-1 rounded border-2 text-sm focus:outline-none ${isOverridden ? 'border-orange-400 bg-orange-50 text-orange-800 font-semibold' : 'border-amber-200 bg-white'}`}
                                                                                                            value={currentMp || ''}
                                                                                                            title={isRunning ? `Äá»‹nh má»©c cá»‘ Ä‘á»‹nh: ${defaultMp} ngÆ°á»i` : 'Nháº­p volume trÆ°á»›c Ä‘á»ƒ tá»± Ä‘iá»n'}
                                                                                                            onChange={e => setShellingLineData(prev => ({ ...prev, [line]: { ...prev[line], [shift]: { ...prev[line][shift], manpower: Number(e.target.value) || 0 } } }))}
                                                                                                        />
                                                                                                    </div>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        <TableRow>
                                                                            <TableCell colSpan={2} className="p-0">
                                                                                <div className="bg-red-50/40 border-b px-4 pt-2 pb-3">
                                                                                    <p className="text-xs font-semibold text-red-700 mb-2">ðŸ’” Tá»· lá»‡ Bá»ƒ (% Broken)</p>
                                                                                    {(['Ca 1', 'Ca 2', 'Ca 3'] as ('Ca 1' | 'Ca 2' | 'Ca 3')[]).map(shift => (
                                                                                        <div key={shift} className="mb-3">
                                                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                            <div className="grid grid-cols-5 gap-2">
                                                                                                {SHELLING_LINES.map(line => (
                                                                                                    <div key={`${line}-${shift}`} className="flex flex-col items-center">
                                                                                                        <label className="text-[10px] font-bold mb-1 text-gray-500">{line}</label>
                                                                                                        <input
                                                                                                            type="number" step="0.1" min="0" max="100"
                                                                                                            className="w-full text-right p-1 rounded border-2 border-red-200 bg-white text-sm focus:outline-none focus:border-red-500"
                                                                                                            value={shellingLineData[line]?.[shift]?.broken_pct || ''}
                                                                                                            onChange={e => setShellingLineData(prev => ({ ...prev, [line]: { ...prev[line], [shift]: { ...prev[line][shift], broken_pct: Number(e.target.value) || 0 } } }))}
                                                                                                        />
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>

                                                                        {/* OEE Row */}
                                                                        <TableRow>
                                                                            <TableCell colSpan={2} className="p-0">
                                                                                <div className="bg-indigo-50/60 border-b px-4 pt-2 pb-3">
                                                                                    <div className="flex items-center gap-2 mb-2">
                                                                                        <p className="text-xs font-semibold text-indigo-700">ðŸ“ˆ OEE (Hiá»‡u suáº¥t Tá»•ng thá»ƒ)</p>
                                                                                        <span className="text-[10px] text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded-full">Avail Ã— Perf Ã— Quality</span>
                                                                                    </div>
                                                                                    {/* OEE Explanation Card */}
                                                                                    <div className="mb-3 rounded-lg border border-indigo-200 bg-white/70 p-2.5 text-[10px] text-slate-600 space-y-1.5">
                                                                                        <p className="font-bold text-indigo-800 text-[11px]">ðŸ“– OEE lÃ  gÃ¬?</p>
                                                                                        <p>OEE (<b>Overall Equipment Effectiveness</b>) Ä‘o lÆ°á»ng hiá»‡u quáº£ tá»•ng thá»ƒ cá»§a thiáº¿t bá»‹ qua 3 thÃ nh pháº§n:</p>
                                                                                        <div className="grid grid-cols-1 gap-1 mt-1">
                                                                                            <div className="flex gap-1.5 items-start"><span className="font-bold text-blue-600 shrink-0">TÃ­nh sáºµn sÃ ng (A):</span><span>Run Hours / 8h káº¿ hoáº¡ch. Ca nÃ o cÃ³ line khÃ¡c cháº¡y mÃ  line nÃ y táº¯t â†’ A giáº£m.</span></div>
                                                                                            <div className="flex gap-1.5 items-start"><span className="font-bold text-emerald-600 shrink-0">Hiá»‡u suáº¥t (P):</span><span>Sáº£n lÆ°á»£ng thá»±c / (Run Hours Ã— Tá»‘c Ä‘á»™ thiáº¿t káº¿). P tháº¥p = cháº¡y cháº­m hÆ¡n lÃ½ thuyáº¿t.</span></div>
                                                                                            <div className="flex gap-1.5 items-start"><span className="font-bold text-rose-600 shrink-0">Cháº¥t lÆ°á»£ng (Q):</span><span>1 âˆ’ % Bá»ƒ. Q tháº¥p = nhiá»u háº¡t vá»¡.</span></div>
                                                                                        </div>
                                                                                        <div className="flex gap-3 mt-1.5 pt-1.5 border-t border-indigo-100">
                                                                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span> â‰¥75% Tá»‘t</span>
                                                                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block"></span> 55â€“74% Cáº§n cáº£i thiá»‡n</span>
                                                                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span> &lt;55% KÃ©m</span>
                                                                                        </div>
                                                                                    </div>
                                                                                    {(['Ca 1', 'Ca 2', 'Ca 3'] as ShellShift[]).map(shift => (
                                                                                        <div key={shift} className="mb-3">
                                                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{shift}</span>
                                                                                            <div className="grid grid-cols-5 gap-2">
                                                                                                {SHELLING_LINES.map(line => {
                                                                                                    const oeeData = calcOEE(line, shift)
                                                                                                    const oeeVal = oeeData?.hasData ? oeeData.oee : null
                                                                                                    const oeeColor = oeeVal === null ? 'border-gray-200 bg-gray-50 text-gray-300'
                                                                                                        : oeeVal >= 0.75 ? 'border-green-400 bg-green-50 text-green-800'
                                                                                                        : oeeVal >= 0.55 ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                                                                                                        : 'border-red-400 bg-red-50 text-red-800'
                                                                                                    const tooltip = oeeData?.hasData
                                                                                                        ? `Avail: ${(oeeData.avail * 100).toFixed(1)}% | Perf: ${(oeeData.perf * 100).toFixed(1)}% | Quality: ${(oeeData.qual * 100).toFixed(1)}%`
                                                                                                        : 'ChÆ°a cÃ³ dá»¯ liá»‡u'
                                                                                                    return (
                                                                                                        <div key={`${line}-${shift}`} className="flex flex-col items-center">
                                                                                                            <label className="text-[10px] font-bold mb-1 text-indigo-500">{line}</label>
                                                                                                            <div
                                                                                                                title={tooltip}
                                                                                                                className={`w-full text-right p-1 rounded border-2 text-sm font-bold ${oeeColor}`}
                                                                                                            >
                                                                                                                {oeeVal !== null ? `${(oeeVal * 100).toFixed(1)}%` : 'â€”'}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    )
                                                                                                })}
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>

                                                                        <TableRow className="bg-blue-50">
                                                                            <TableCell className="font-semibold text-blue-800">Tá»•ng sáº£n lÆ°á»£ng Shelling (Táº¥n)</TableCell>
                                                                            <TableCell className="p-2 align-middle">
                                                                                <FormField control={formActual.control} name="actual_ton" render={({ field }) => (
                                                                                    <FormItem><FormControl><Input type="number" step="0.001" {...field} readOnly className="bg-blue-50 border-0 ring-offset-0 focus-visible:ring-1 shadow-none font-bold text-blue-900" /></FormControl></FormItem>
                                                                                )} />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    </>
                                                                ) : departments.find(d => d.id === selectedDept)?.code === 'PEEL_MC' ? (
                                                                    <>
                                                                        <TableRow>
                                                                            <TableCell className="font-medium align-middle text-blue-700">Pass 1 (Táº¥n)</TableCell>
                                                                            <TableCell className="p-2 align-middle">
                                                                                <FormField control={formActual.control} name="pass1_ton" render={({ field }) => (
                                                                                    <FormItem><FormControl><Input type="number" step="0.001"
                                                                                        {...field}
                                                                                        className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none"
                                                                                        onChange={e => {
                                                                                            field.onChange(e)
                                                                                            const p1 = Number(e.target.value) || 0
                                                                                            const p2 = Number(formActual.getValues('pass2_ton')) || 0
                                                                                            formActual.setValue('actual_ton', p1 + p2)
                                                                                        }}
                                                                                    /></FormControl></FormItem>
                                                                                )} />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        <TableRow>
                                                                            <TableCell className="font-medium align-middle text-green-700">Pass 2 (Táº¥n)</TableCell>
                                                                            <TableCell className="p-2 align-middle">
                                                                                <FormField control={formActual.control} name="pass2_ton" render={({ field }) => (
                                                                                    <FormItem><FormControl><Input type="number" step="0.001"
                                                                                        {...field}
                                                                                        className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none"
                                                                                        onChange={e => {
                                                                                            field.onChange(e)
                                                                                            const p2 = Number(e.target.value) || 0
                                                                                            const p1 = Number(formActual.getValues('pass1_ton')) || 0
                                                                                            formActual.setValue('actual_ton', p1 + p2)
                                                                                        }}
                                                                                    /></FormControl></FormItem>
                                                                                )} />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        <TableRow className="bg-blue-50">
                                                                            <TableCell className="font-semibold text-blue-800">Tá»•ng sáº£n lÆ°á»£ng (Táº¥n)</TableCell>
                                                                            <TableCell className="p-2 align-middle">
                                                                                <FormField control={formActual.control} name="actual_ton" render={({ field }) => (
                                                                                    <FormItem><FormControl><Input type="number" step="0.001" {...field} readOnly className="bg-blue-50 border-0 ring-offset-0 shadow-none font-bold text-blue-900 cursor-not-allowed" /></FormControl></FormItem>
                                                                                )} />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    </>
                                                                ) : (
                                                                    <TableRow>
                                                                        <TableCell className="font-medium align-middle">Sáº£n lÆ°á»£ng thá»±c táº¿ (Táº¥n)</TableCell>
                                                                        <TableCell className="p-2 align-middle">
                                                                            <FormField control={formActual.control} name="actual_ton" render={({ field }) => (
                                                                                <FormItem><FormControl><Input type="number" step="0.001" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                            )} />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}
                                                                {['CS', 'HAND'].includes(departments.find(d => d.id === selectedDept)?.code || '') && (
                                                                    <TableRow>
                                                                        <TableCell className="font-medium text-blue-600 align-middle">Sáº£n lÆ°á»£ng ISP (Táº¥n)</TableCell>
                                                                        <TableCell className="p-2 align-middle">
                                                                            <FormField control={formActual.control} name="isp_ton" render={({ field }) => (
                                                                                <FormItem><FormControl><Input type="number" step="0.001" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                            )} />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}
                                                                {departments.find(d => d.id === selectedDept)?.code === "PACK" && (
                                                                    <TableRow>
                                                                        <TableCell className="font-medium align-middle">Sá»‘ Container thá»±c táº¿</TableCell>
                                                                        <TableCell className="p-2 align-middle">
                                                                            <FormField control={formActual.control} name="actual_container" render={({ field }) => (
                                                                                <FormItem><FormControl><Input type="number" step="0.01" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                            )} />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}
                                                                {departments.find(d => d.id === selectedDept)?.code === "SHELL" && (
                                                                    <TableRow>
                                                                        <TableCell className="font-medium text-amber-600 align-middle">Chá»‰ sá»‘ Ä‘iá»‡n Shelling (kWh)</TableCell>
                                                                        <TableCell className="p-2 align-middle">
                                                                            <FormField control={formActual.control} name="electricity_meter_reading" render={({ field }) => (
                                                                                <FormItem><FormControl><Input type="number" step="1" {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                            )} />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )}
                                                                <TableRow>
                                                                    <TableCell className="font-medium align-middle border-b-0">Ghi chÃº (TÃ¹y chá»n)</TableCell>
                                                                    <TableCell className="p-2 align-middle border-b-0">
                                                                        <FormField control={formActual.control} name="note" render={({ field }) => (
                                                                            <FormItem><FormControl><Input {...field} placeholder="Vd: Ca sÃ¡ng nghá»‰ 30p..." className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                        )} />
                                                                    </TableCell>
                                                                </TableRow>
                                                            </TableBody>
                                                        </Table>
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-t pt-4 gap-4">
                                                        <p className="text-sm font-medium text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200 flex-1">
                                                            âš ï¸ <span className="font-bold">LÆ°u Ã½:</span> Báº¡n nhá»› báº¥m nÃºt <strong>LÆ°u Actual</strong> sau khi nháº­p xong nhÃ©!
                                                        </p>
                                                        <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
                                                            <Save className="mr-2 h-4 w-4" />
                                                            {isSaving ? "Äang lÆ°u..." : "LÆ°u Actual"}
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
                                                                    <TableHead className="w-1/2">Chá»‰ tiÃªu KPI</TableHead>
                                                                    <TableHead className="w-1/2">GiÃ¡ trá»‹ nháº­p</TableHead>
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

                                                                    if (role === 'admin' || role === 'hse_admin') {
                                                                        return (
                                                                            <>
                                                                                <Row label="WIP Tá»“n Ä‘áº§u ngÃ y (T)" name="wip_open_ton" step="0.001" />
                                                                                <Row label="WIP Tá»“n cuá»‘i ngÃ y (T)" name="wip_close_ton" step="0.001" />
                                                                                <Row label="Input Ä‘áº§u vÃ o (Táº¥n)" name="input_ton" step="0.001" />
                                                                                <Row label="Good Output Ä‘áº¡t (TÃ­nh Yield)" name="good_output_ton" step="0.001" />
                                                                                <Row label="Downtime (PhÃºt)" name="downtime_min" step="1" />
                                                                                <Row label="Tá»· lá»‡ Bá»ƒ (Broken %)" name="broken_pct" step="0.1" />
                                                                                <Row label="Tá»· lá»‡ SÃ³t lá»¥a (Unpeel %)" name="unpeel_pct" step="0.1" />
                                                                                <Row label="Tá»· lá»‡ thu há»“i (ISP %)" name="isp_pct" step="0.1" />
                                                                                <Row label="Tá»· lá»‡ SW (%)" name="sw_pct" step="0.1" />
                                                                                <Row label="Chá»‰ sá»‘ Ä‘iá»‡n (kWh)" name="electricity_meter_reading" step="1" className="text-amber-600 font-semibold" />
                                                                                {selectedDeptCode === "SHELL" && (
                                                                                    <TableRow>
                                                                                        <TableCell colSpan={2} className="p-0 border-b-0">
                                                                                            <div className="p-4 bg-amber-50">
                                                                                                {(() => {
                                                                                                    const currentMeter = formKpi.watch("electricity_meter_reading") || 0;
                                                                                                    const consumption = prevMeterReading !== null ? currentMeter - prevMeterReading : 0;
                                                                                                    const actualTon = formActual.watch("actual_ton") || 0;
                                                                                                    const intensity = actualTon > 0 ? (consumption / actualTon).toFixed(2) : "0.00";

                                                                                                    if (prevMeterReading === null) return <p className="text-xs text-muted-foreground italic">ChÆ°a cÃ³ chá»‰ sá»‘ ngÃ y hÃ´m trÆ°á»›c Ä‘á»ƒ tÃ­nh tiÃªu thá»¥.</p>;

                                                                                                    return (
                                                                                                        <div className="grid grid-cols-2 gap-4">
                                                                                                            <div>
                                                                                                                <p className="text-xs text-amber-700 font-medium">TiÃªu thá»¥ Shelling hÃ´m nay</p>
                                                                                                                <p className="text-xl font-bold text-amber-900">{consumption.toLocaleString()} <span className="text-sm font-normal">kWh</span></p>
                                                                                                                <p className="text-[10px] text-amber-600">(Sá»‘ má»›i {currentMeter} - Sá»‘ cÅ© {prevMeterReading})</p>
                                                                                                            </div>
                                                                                                            <div>
                                                                                                                <p className="text-xs text-amber-700 font-medium">Chá»‰ sá»‘ kWh / Táº¥n (Shelling)</p>
                                                                                                                <p className="text-xl font-bold text-amber-900">{intensity} <span className="text-sm font-normal">kWh/T</span></p>
                                                                                                                <p className="text-[10px] text-amber-600">(TiÃªu thá»¥ / {actualTon} Táº¥n pháº©m)</p>
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
                                                                                <Row label="Tá»· lá»‡ Bá»ƒ (Broken %)" name="broken_pct" step="0.1" />
                                                                                <Row label="Tá»· lá»‡ SÃ³t lá»¥a (Unpeel %)" name="unpeel_pct" step="0.1" />
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "HAND") {
                                                                        return (
                                                                            <>
                                                                                <Row label="WIP Tá»“n Ä‘áº§u ngÃ y (Táº¥n)" name="wip_open_ton" step="0.001" />
                                                                                <Row label="WIP Tá»“n cuá»‘i ngÃ y (Táº¥n)" name="wip_close_ton" step="0.001" />
                                                                                <Row label="Tá»· lá»‡ thu há»“i (ISP %)" name="isp_pct" step="0.1" />
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "SHELL") {
                                                                        return (
                                                                            <>
                                                                                <Row label="Tá»· lá»‡ Bá»ƒ (Broken %)" name="broken_pct" step="0.1" />
                                                                                <Row label="Chá»‰ sá»‘ Ä‘á»“ng há»“ Ä‘iá»‡n (kWh)" name="electricity_meter_reading" step="1" className="text-amber-600 font-semibold" />
                                                                                <TableRow>
                                                                                    <TableCell colSpan={2} className="p-0 border-b-0">
                                                                                        <div className="p-4 bg-amber-50 rounded-b-md">
                                                                                            {(() => {
                                                                                                const currentMeter = formKpi.watch("electricity_meter_reading") || 0;
                                                                                                const consumption = prevMeterReading !== null ? currentMeter - prevMeterReading : 0;
                                                                                                const targetActualTon = prevDayActual || 0;
                                                                                                const intensity = targetActualTon > 0 ? (consumption / targetActualTon).toFixed(2) : "0.00";

                                                                                                if (prevMeterReading === null) return <p className="text-xs text-muted-foreground italic">ChÆ°a cÃ³ chá»‰ sá»‘ ngÃ y hÃ´m trÆ°á»›c Ä‘á»ƒ tÃ­nh tiÃªu thá»¥.</p>;

                                                                                                return (
                                                                                                    <div className="grid grid-cols-2 gap-4">
                                                                                                        <div>
                                                                                                            <p className="text-xs text-amber-700 font-medium">TiÃªu thá»¥ Ca trÆ°á»›c (Tá»± Ä‘á»™ng tÃ­nh)</p>
                                                                                                            <p className="text-xl font-bold text-amber-900">{consumption.toLocaleString()} <span className="text-sm font-normal">kWh</span></p>
                                                                                                            <p className="text-[10px] text-amber-600">(Má»›i {currentMeter} - CÅ© {prevMeterReading})</p>
                                                                                                        </div>
                                                                                                        <div>
                                                                                                            <p className="text-xs text-amber-700 font-medium">Chá»‰ sá»‘ kWh / Táº¥n (Ca trÆ°á»›c)</p>
                                                                                                            <p className="text-xl font-bold text-amber-900">{intensity} <span className="text-sm font-normal">kWh/T</span></p>
                                                                                                            {targetActualTon > 0
                                                                                                                ? <p className="text-[10px] text-amber-600">(TiÃªu thá»¥ / {targetActualTon} Táº¥n pháº©m ngÃ y trÆ°á»›c)</p>
                                                                                                                : <p className="text-[10px] text-red-500 italic">ChÆ°a cÃ³ sáº£n lÆ°á»£ng ngÃ y hÃ´m trÆ°á»›c</p>
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
                                                                        return <Row label="Tá»· lá»‡ SW (%)" name="sw_pct" step="0.1" />;
                                                                    }

                                                                    if (selectedDeptCode === "STEAM") {
                                                                        return (
                                                                            <>
                                                                                <Row label="Tá»“n kho Ä‘áº§u ngÃ y (Táº¥n)" name="wip_open_ton" step="0.001" />
                                                                                <Row label="Tá»“n kho cuá»‘i ngÃ y (Táº¥n)" name="wip_close_ton" step="0.001" />
                                                                            </>
                                                                        );
                                                                    }

                                                                    // Default
                                                                    return (
                                                                        <>
                                                                            <Row label="WIP Tá»“n Ä‘áº§u ngÃ y (T)" name="wip_open_ton" step="0.001" />
                                                                            <Row label="WIP Tá»“n cuá»‘i ngÃ y (T)" name="wip_close_ton" step="0.001" />
                                                                            <Row label="Input Ä‘áº§u vÃ o (Táº¥n)" name="input_ton" step="0.001" />
                                                                            <Row label="Good Output Ä‘áº¡t (TÃ­nh Yield)" name="good_output_ton" step="0.001" />
                                                                        </>
                                                                    );
                                                                })()}
                                                                
                                                                <TableRow>
                                                                    <TableCell className="font-medium align-middle border-b-0">Ghi chÃº (TÃ¹y chá»n)</TableCell>
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
                                                            âš ï¸ <span className="font-bold">LÆ°u Ã½:</span> Báº¡n nhá»› báº¥m nÃºt <strong>LÆ°u KPI</strong> sau khi nháº­p xong nhÃ©!
                                                        </p>
                                                        <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
                                                            <Save className="mr-2 h-4 w-4" />
                                                            {isSaving ? "Äang lÆ°u..." : "LÆ°u KPI"}
                                                        </Button>
                                                    </div>
                                                </form>
                                            </Form>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="downtime" className="space-y-4">
                                    <div className="rounded-xl border bg-card text-card-foreground shadow p-6 max-w-2xl">
                                        <div className="flex flex-col gap-6">
                                            {/* Data Entry Row */}
                                            {(() => {
                                                const deptCode = departments.find(d => d.id === selectedDept)?.code || '';

                                                // 14 standard downtime codes
                                                const DT_CODES = [
                                                    { code: 'BD', planned: false, label: 'KhÃ´ng káº¿ hoáº¡ch â€“ HÆ° há»ng sá»­a chá»¯a â€“ Breakdown' },
                                                    { code: 'BL', planned: false, label: 'KhÃ´ng káº¿ hoáº¡ch â€“ Bá»‹ cháº·n â€“ Blocked' },
                                                    { code: 'BT', planned: true,  label: 'CÃ³ káº¿ hoáº¡ch â€“ Dá»«ng nghá»‰ â€“ Breaktime' },
                                                    { code: 'CIL', planned: true, label: 'CÃ³ káº¿ hoáº¡ch â€“ Vá»‡ sinh â€“ Cleaning' },
                                                    { code: 'LU', planned: false, label: 'KhÃ´ng káº¿ hoáº¡ch â€“ Thiáº¿u nguá»“n lá»±c â€“ Lack of Utility' },
                                                    { code: 'MP', planned: true,  label: 'CÃ³ káº¿ hoáº¡ch â€“ Báº£o dÆ°á»¡ng â€“ Maintenance Plan' },
                                                    { code: 'MS', planned: false, label: 'KhÃ´ng káº¿ hoáº¡ch â€“ Lá»—i dá»«ng nhá» â€“ Minor Stop' },
                                                    { code: 'PF', planned: false, label: 'KhÃ´ng káº¿ hoáº¡ch â€“ Lá»—i quy trÃ¬nh â€“ Process Failures' },
                                                    { code: 'PT', planned: true,  label: 'CÃ³ káº¿ hoáº¡ch â€“ Pit Stop' },
                                                    { code: 'PW', planned: true,  label: 'CÃ³ káº¿ hoáº¡ch â€“ Thá»±c hiá»‡n dá»± Ã¡n â€“ Project Work' },
                                                    { code: 'SP', planned: false, label: 'KhÃ´ng káº¿ hoáº¡ch â€“ Láº¥y máº«u â€“ Sampling' },
                                                    { code: 'TP', planned: true,  label: 'CÃ³ káº¿ hoáº¡ch â€“ Thá»­ nghiá»‡m â€“ Trial Plan' },
                                                    { code: 'TT', planned: true,  label: 'CÃ³ káº¿ hoáº¡ch â€“ ÄÃ o táº¡o â€“ Training Time' },
                                                    { code: 'WT', planned: false, label: 'KhÃ´ng káº¿ hoáº¡ch â€“ Chá» Ä‘á»£i â€“ Waiting' },
                                                ];

                                                // Sub-causes per dept Ã— code â€” only for codes that have specific sub-items
                                                const subCauseMap: Record<string, Record<string, string[]>> = {
                                                    SHELL: {
                                                        BD: [
                                                            'HÆ° há»ng cáº¥p liá»‡u',
                                                            'HÆ° há»ng Ä‘áº§u cáº¯t',
                                                            'HÆ° há»ng sÃ ng rung',
                                                            'HÆ° há»ng motor sÃ ng rung',
                                                            'HÆ° há»ng motor ly tÃ¢m',
                                                            'HÆ° há»ng gÃ u táº£i',
                                                            'HÆ° há»ng ly tÃ¢m',
                                                            'HÆ° há»ng cá»¥m phÃ¢n trá»¥c',
                                                            'HÆ° há»ng há»‡ quáº¡t thá»•i',
                                                            'Tuá»™t á»‘ng vá»',
                                                        ],
                                                        WT: [
                                                            'Chá» hÃ ng Ä‘áº¡t áº©m',
                                                            'Chá» láº¥y vá» á»Ÿ silo vá»',
                                                        ],
                                                        LU: [
                                                            'KhÃ´ng cÃ³ nguyÃªn liá»‡u',
                                                        ],
                                                    },
                                                    PEEL_MC: {
                                                        BD: [
                                                            'MÃ¡y nÃ©n khÃ­ há»ng',
                                                            'Ãp suáº¥t khÃ­ tháº¥p',
                                                            'LÆ°á»¡i bÃ³c mÃ²n',
                                                            'BÄƒng táº£i há»ng',
                                                            'Bá»™ pháº­n cÆ¡ khÃ­ há»ng',
                                                        ],
                                                        WT: [
                                                            'Chá» háº¡t cáº¯t Ä‘áº§u vÃ o',
                                                        ],
                                                        LU: [
                                                            'Thiáº¿u nhÃ¢n lá»±c',
                                                        ],
                                                    },
                                                };

                                                const subCauses: string[] = (subCauseMap[deptCode] || {})[dtCause] || [];
                                                const hasSubList = subCauses.length > 0;
                                                const isCustomMode = dtNote === DT_CUSTOM_SENTINEL;
                                                const selectedCodeInfo = DT_CODES.find(c => c.code === dtCause);

                                                return (
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start bg-muted/30 p-4 rounded-lg border">
                                                            {/* Col 1: Minutes */}
                                                            <div className="sm:col-span-2 space-y-2">
                                                                <Label>Sá»‘ phÃºt dá»«ng</Label>
                                                                <Input type="number" value={dtDuration} onChange={e => setDtDuration(e.target.value)} placeholder="0" className="bg-white" />
                                                            </div>

                                                            {/* Col 2: Code picker */}
                                                            <div className="sm:col-span-3 space-y-2">
                                                                <Label>MÃ£ downtime</Label>
                                                                <Select value={dtCause} onValueChange={v => { setDtCause(v); setDtNote(''); setDtCustomNote(''); }}>
                                                                    <SelectTrigger className="bg-white font-mono">
                                                                        <SelectValue placeholder="Chá»n mÃ£..." />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">KhÃ´ng káº¿ hoáº¡ch</div>
                                                                        {DT_CODES.filter(c => !c.planned).map(c => (
                                                                            <SelectItem key={c.code} value={c.code}>
                                                                                <span className="font-mono font-bold text-red-600 mr-2">{c.code}</span>
                                                                                <span className="text-xs">{c.code === 'BD' ? 'HÆ° há»ng / Breakdown' : c.code === 'BL' ? 'Bá»‹ cháº·n / Blocked' : c.code === 'LU' ? 'Thiáº¿u nguá»“n lá»±c / Lack Utility' : c.code === 'MS' ? 'Dá»«ng nhá» / Minor Stop' : c.code === 'PF' ? 'Lá»—i quy trÃ¬nh / Process Fail' : c.code === 'SP' ? 'Láº¥y máº«u / Sampling' : c.code === 'WT' ? 'Chá» Ä‘á»£i / Waiting' : c.label}</span>
                                                                            </SelectItem>
                                                                        ))}
                                                                        <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1 border-t">CÃ³ káº¿ hoáº¡ch</div>
                                                                        {DT_CODES.filter(c => c.planned).map(c => (
                                                                            <SelectItem key={c.code} value={c.code}>
                                                                                <span className="font-mono font-bold text-blue-600 mr-2">{c.code}</span>
                                                                                <span className="text-xs">{c.code === 'BT' ? 'Dá»«ng nghá»‰ / Breaktime' : c.code === 'CIL' ? 'Vá»‡ sinh / Cleaning' : c.code === 'MP' ? 'Báº£o dÆ°á»¡ng / Maint Plan' : c.code === 'PT' ? 'Pit Stop' : c.code === 'PW' ? 'Dá»± Ã¡n / Project Work' : c.code === 'TP' ? 'Thá»­ nghiá»‡m / Trial' : c.code === 'TT' ? 'ÄÃ o táº¡o / Training' : c.label}</span>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                {/* Badge show planned/unplanned */}
                                                                {selectedCodeInfo && (
                                                                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${selectedCodeInfo.planned ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                                        {selectedCodeInfo.planned ? 'ðŸ“… CÃ³ káº¿ hoáº¡ch' : 'ðŸš¨ KhÃ´ng káº¿ hoáº¡ch'}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Col 3: Sub-cause (only if this code has one for this dept) */}
                                                            <div className="sm:col-span-4 space-y-2">
                                                                <Label>
                                                                    LÃ½ do chi tiáº¿t
                                                                    {!hasSubList && dtCause && <span className="text-[10px] text-muted-foreground ml-1">(tuá»³ chá»n)</span>}
                                                                </Label>
                                                                {hasSubList ? (
                                                                    <>
                                                                        <Select value={dtNote} onValueChange={v => { setDtNote(v); if (v !== DT_CUSTOM_SENTINEL) setDtCustomNote(''); }} disabled={!dtCause}>
                                                                            <SelectTrigger className="bg-white"><SelectValue placeholder="Chá»n lÃ½ do..." /></SelectTrigger>
                                                                            <SelectContent>
                                                                                {subCauses.map((s: string) => (
                                                                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                                                                ))}
                                                                                <SelectItem value={DT_CUSTOM_SENTINEL}>âœï¸ Nháº­p lÃ½ do má»›i...</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                        {isCustomMode && (
                                                                            <Input autoFocus value={dtCustomNote} onChange={e => setDtCustomNote(e.target.value)} placeholder="Nháº­p lÃ½ do cá»¥ thá»ƒ..." className="bg-amber-50 border-amber-300 mt-1" />
                                                                        )}
                                                                    </>
                                                                ) : (
                                                                    // No sub-list for this code: show optional free text + sentinel option
                                                                    <div className="flex gap-2">
                                                                        <Input
                                                                            value={dtNote === DT_CUSTOM_SENTINEL ? dtCustomNote : dtNote}
                                                                            onChange={e => setDtNote(e.target.value)}
                                                                            placeholder={dtCause ? 'Ghi chÃº thÃªm (khÃ´ng báº¯t buá»™c)...' : 'â€” chá»n mÃ£ trÆ°á»›c â€”'}
                                                                            className="bg-white flex-1"
                                                                            disabled={!dtCause}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Col 4: Submit */}
                                                            <div className="sm:col-span-3 space-y-2 pt-7">
                                                                <Button
                                                                    onClick={handleAddDowntime}
                                                                    disabled={isSaving || !dtDuration || !dtCause || (hasSubList && isCustomMode && !dtCustomNote.trim())}
                                                                    className="bg-red-600 hover:bg-red-700 w-full"
                                                                >
                                                                    <Plus className="h-4 w-4 mr-1" /> ThÃªm sá»± cá»‘
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Data Table */}
                                            <div className="border rounded-md overflow-hidden">
                                                <Table>
                                                    <TableHeader className="bg-red-50 text-red-900">
                                                        <TableRow>
                                                            <TableHead className="w-[100px]">Thá»i gian</TableHead>
                                                            <TableHead className="w-[150px]">NguyÃªn nhÃ¢n</TableHead>
                                                            <TableHead>Ghi chÃº</TableHead>
                                                            <TableHead className="w-[60px] text-center"></TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {downtimes.length === 0 ? (
                                                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground h-20 bg-white">ChÆ°a cÃ³ sá»± cá»‘ nÃ o Ä‘Æ°á»£c ghi nháº­n trong ngÃ y.</TableCell></TableRow>
                                                        ) : (
                                                            downtimes.map((dt) => (
                                                                <TableRow key={dt.id} className="bg-white">
                                                                    <TableCell className="font-semibold text-red-600">{dt.duration_mins} phÃºt</TableCell>
                                                                    <TableCell className="font-medium">{dt.root_cause}</TableCell>
                                                                    <TableCell className="text-muted-foreground text-sm">{dt.note || "-"}</TableCell>
                                                                    <TableCell className="text-center">
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-100" onClick={() => handleDeleteDowntime(dt.id)}>
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            
                                            <div className="flex justify-between items-center px-4 py-3 bg-red-50 rounded-md border border-red-100">
                                                <span className="text-sm font-medium text-red-800">Tá»•ng thá»i gian dá»«ng mÃ¡y:</span>
                                                <span className="text-lg font-black text-red-700">{downtimes.reduce((s, r) => s + Number(r.duration_mins), 0)} phÃºt</span>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>

                            {/* Recent History Table */}
                            <div className="mt-12 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold">Lá»‹ch sá»­ nháº­p liá»‡u gáº§n Ä‘Ã¢y</h3>
                                    <p className="text-sm text-muted-foreground italic">Hiá»ƒn thá»‹ 10 ngÃ y gáº§n nháº¥t cá»§a bá»™ pháº­n</p>
                                </div>
                                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead className="w-[120px]">NgÃ y</TableHead>
                                                <TableHead className="text-right">Sáº£n lÆ°á»£ng (T)</TableHead>
                                                <TableHead className="text-right">Input/Output (T)</TableHead>
                                                <TableHead className="text-right">Downtime</TableHead>
                                                <TableHead>Ghi chÃº</TableHead>
                                                <TableHead className="w-[80px] text-center">Thao tÃ¡c</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {recentRecords.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground whitespace-nowrap">
                                                        ChÆ°a cÃ³ dá»¯ liá»‡u lá»‹ch sá»­ cho bá»™ pháº­n nÃ y.
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

                {(role === 'admin' || role === 'HSE' || role === 'hse_admin') && (
                    <TabsContent value="energy" className="space-y-4">
                        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold text-lg">Báº£ng Ghi Nháº­n NÄƒng LÆ°á»£ng: ThÃ¡ng {format(date, "MM/yyyy")}</h3>
                                    <Button onClick={saveEnergy} disabled={isSaving} size="sm">
                                        <Save className="mr-2 h-4 w-4" />
                                        {isSaving ? 'Äang lÆ°u...' : 'LÆ°u ToÃ n Bá»™ ThÃ¡ng'}
                                    </Button>
                                </div>

                                {/* Quick Wood Distribution */}
                                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="flex-1 min-w-[180px]">
                                            <Label className="text-sm font-bold text-orange-700 mb-1 block">ðŸ”¥ Tá»•ng Cá»§i ThÃ¡ng (kg)</Label>
                                            <p className="text-[11px] text-orange-500 mb-1">Nháº­p tá»•ng kg â†’ há»‡ thá»‘ng chia Ä‘á»u cho cÃ¡c ngÃ y Ä‘áº¿n hÃ´m nay</p>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="number"
                                                    step="1"
                                                    placeholder="VD: 50000"
                                                    value={woodTotalInput}
                                                    className="border-orange-300 focus-visible:ring-orange-400 flex-1"
                                                    onChange={(e) => setWoodTotalInput(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            const total = Number(woodTotalInput);
                                                            if (!total || total <= 0) return;
                                                            const today = new Date();
                                                            const todayStr = format(today, "yyyy-MM-dd");
                                                            const newData = [...monthlyEnergyData];
                                                            const daysUpToToday = newData.filter(d => d.work_date <= todayStr);
                                                            const count = daysUpToToday.length;
                                                            if (count === 0) return;
                                                            const perDay = Math.round(total / count);
                                                            daysUpToToday.forEach((d) => {
                                                                d.wood_kg = perDay;
                                                            });
                                                            setMonthlyEnergyData([...newData]);
                                                            toast.success(`ÄÃ£ chia ${total.toLocaleString()} kg cho ${count} ngÃ y (${perDay.toLocaleString()} kg/ngÃ y)`);
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="border-orange-400 text-orange-700 hover:bg-orange-100 whitespace-nowrap"
                                                    onClick={() => {
                                                        const total = Number(woodTotalInput);
                                                        if (!total || total <= 0) {
                                                            toast.error("Vui lÃ²ng nháº­p tá»•ng kg cá»§i trÆ°á»›c");
                                                            return;
                                                        }
                                                        const today = new Date();
                                                        const todayStr = format(today, "yyyy-MM-dd");
                                                        const newData = [...monthlyEnergyData];
                                                        const daysUpToToday = newData.filter(d => d.work_date <= todayStr);
                                                        const count = daysUpToToday.length;
                                                        if (count === 0) return;
                                                        const perDay = Math.round(total / count);
                                                        daysUpToToday.forEach((d) => {
                                                            d.wood_kg = perDay;
                                                        });
                                                        setMonthlyEnergyData([...newData]);
                                                        toast.success(`ÄÃ£ chia ${total.toLocaleString()} kg cho ${count} ngÃ y (${perDay.toLocaleString()} kg/ngÃ y)`);
                                                    }}
                                                >
                                                    Chia Ä‘á»u
                                                </Button>
                                            </div>
                                            <p className="text-[10px] text-orange-400 mt-1">Nháº­p sá»‘ rá»“i nháº¥n Enter â†µ hoáº·c báº¥m Chia Ä‘á»u</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted">
                                            <TableRow>
                                                <TableHead rowSpan={2} className="border-r w-[80px] text-center">NgÃ y</TableHead>
                                                <TableHead colSpan={5} className="border-r text-center text-amber-600 bg-amber-50/50">âš¡ Äiá»‡n nÄƒng (kWh)</TableHead>
                                                <TableHead colSpan={3} className="border-r text-center text-blue-600 bg-blue-50/50">ðŸ’§ NÆ°á»›c (mÂ³)</TableHead>
                                                <TableHead colSpan={2} className="text-center text-orange-600 bg-orange-50/50">ðŸ”¥ Cá»§i (Táº¥n)</TableHead>
                                            </TableRow>
                                            <TableRow>
                                                {/* Dien */}
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[90px]">C.sá»‘ Cao</TableHead>
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[90px]">C.sá»‘ B.ThÆ°á»ng</TableHead>
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[90px]">C.sá»‘ Tháº¥p</TableHead>
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[100px]">Tá»•ng tiÃªu thá»¥</TableHead>
                                                <TableHead className="text-center bg-amber-50/50 border-r w-[80px]">Target</TableHead>
                                                {/* Nuoc */}
                                                <TableHead className="text-center bg-blue-50/50 border-r w-[120px]">Chá»‰ sá»‘ Ä‘áº§u ngÃ y</TableHead>
                                                <TableHead className="text-center bg-blue-50/50 border-r w-[100px]">TiÃªu thá»¥</TableHead>
                                                <TableHead className="text-center bg-blue-50/50 border-r w-[80px]">Target</TableHead>
                                                {/* Cui */}
                                                <TableHead className="text-center bg-orange-50/50 border-r w-[100px]">Thá»±c táº¿ (kg)</TableHead>
                                                <TableHead className="text-center bg-orange-50/50 w-[80px]">Target</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {monthlyEnergyData.map((row, index) => {
                                                const prevRowElec = index > 0 ? monthlyEnergyData[index - 1].electricity_meter_reading : prevMonthLastMeter?.elec;
                                                const prevRowWater = index > 0 ? monthlyEnergyData[index - 1].water_meter_reading : prevMonthLastMeter?.water;
                                                const nextRowWater = index < monthlyEnergyData.length - 1 ? monthlyEnergyData[index + 1].water_meter_reading : undefined;
                                                const isWaterCalculated = row.water_meter_reading != null && nextRowWater != null;

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
                                                        <TableCell className="border-r p-1 bg-amber-50/10">
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm font-semibold"
                                                                value={row.meter_peak !== undefined ? row.meter_peak : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].meter_peak = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData, prevMonthLastMeter));
                                                                }} />
                                                            
                                                        </TableCell>
                                                        <TableCell className="border-r p-1 bg-amber-50/10">
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm font-semibold"
                                                                value={row.meter_normal !== undefined ? row.meter_normal : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].meter_normal = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData, prevMonthLastMeter));
                                                                }} />
                                                            
                                                        </TableCell>
                                                        <TableCell className="border-r p-1 bg-amber-50/10">
                                                            <input type="number" step="0.01" className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-amber-400 bg-transparent text-sm font-semibold"
                                                                value={row.meter_offpeak !== undefined ? row.meter_offpeak : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                                    const newData = [...monthlyEnergyData];
                                                                    newData[index].meter_offpeak = val;
                                                                    setMonthlyEnergyData(recalcEnergyData(newData, prevMonthLastMeter));
                                                                }} />
                                                            
                                                        </TableCell>
                                                        <TableCell className="border-r p-1 text-right font-semibold text-amber-800 bg-amber-50/40 text-sm">
                                                            {row.electricity_kwh != null ? row.electricity_kwh.toLocaleString('vi-VN', {minimumFractionDigits: 0, maximumFractionDigits: 2}) : '-'}
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
                                                                    const newData = [...monthlyEnergyData];
newData[index].water_meter_reading = val;
setMonthlyEnergyData(recalcEnergyData(newData, prevMonthLastMeter));
                                                                }} />
                                                            {/* Removed misleading tooltip because water is calculated from the next day */}
                                                        </TableCell>
                                                        <TableCell className="border-r p-1">
                                                            <input type="number" step="0.01" className={cn("w-full text-right p-1 rounded font-semibold outline-none text-sm", isWaterCalculated ? "bg-blue-50" : "bg-transparent focus:ring-1 focus:ring-blue-400")}
                                                                readOnly={isWaterCalculated}
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
                                        {isSaving ? 'Äang lÆ°u...' : 'LÆ°u ToÃ n Bá»™ ThÃ¡ng'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                )}

                {(role === 'admin' || role === 'HSE' || role === 'hse_admin') && (
                    <TabsContent value="compressor" className="space-y-4">
                        <div className="rounded-xl border bg-card text-card-foreground shadow">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold text-lg text-purple-800">ðŸŒ¬ï¸ MÃ¡y nÃ©n khÃ­ â€” Chá»‰ sá»‘ Äiá»‡n: ThÃ¡ng {format(date, "MM/yyyy")}</h3>
                                    <Button onClick={saveCompressor} disabled={isSaving} size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                                        <Save className="mr-2 h-4 w-4" />
                                        {isSaving ? 'Äang lÆ°u...' : 'LÆ°u toÃ n bá»™ thÃ¡ng'}
                                    </Button>
                                </div>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted">
                                            <TableRow>
                                                <TableHead rowSpan={2} className="border-r w-[60px] text-center">NgÃ y</TableHead>
                                                <TableHead colSpan={3} className="border-r text-center text-purple-700 bg-purple-50/60">Äá»“ng há»“ (Chá»‰ sá»‘ MWh)</TableHead>
                                                <TableHead colSpan={3} className="border-r text-center text-indigo-700 bg-indigo-50/60">TiÃªu thá»¥ (kWh/ngÃ y)</TableHead>
                                                <TableHead className="text-center bg-rose-50/60 text-rose-700">Tá»•ng kWh</TableHead>
                                            </TableRow>
                                            <TableRow>
                                                <TableHead className="border-r text-center bg-purple-50/40 w-[90px]">ÄH 1</TableHead>
                                                <TableHead className="border-r text-center bg-purple-50/40 w-[90px]">ÄH 2</TableHead>
                                                <TableHead className="border-r text-center bg-purple-50/40 w-[90px]">ÄH 3</TableHead>
                                                <TableHead className="border-r text-center bg-indigo-50/40 w-[80px]">ÄH 1</TableHead>
                                                <TableHead className="border-r text-center bg-indigo-50/40 w-[80px]">ÄH 2</TableHead>
                                                <TableHead className="border-r text-center bg-indigo-50/40 w-[80px]">ÄH 3</TableHead>
                                                <TableHead className="text-center bg-rose-50/40 w-[90px] font-bold">Tá»•ng</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {compressorData.map((row, index) => {
                                                const handleMeterChange = (field: 'meter1' | 'meter2' | 'meter3', val: number | undefined) => {
                                                    const newData = [...compressorData];
                                                    newData[index][field] = val;
                                                    // Recalculate kWh chain (input is MWh)
                                                    const calcKwh = (curr: number | undefined, prev: number | undefined) =>
                                                        curr !== undefined && prev !== undefined ? Math.max(0, (curr - prev) * 1000) : 0;
                                                    for (let i = 0; i < newData.length; i++) {
                                                        const prevRec = i === 0 ? null : newData[i - 1];
                                                        newData[i].kwh1 = calcKwh(newData[i].meter1, prevRec?.meter1);
                                                        newData[i].kwh2 = calcKwh(newData[i].meter2, prevRec?.meter2);
                                                        newData[i].kwh3 = calcKwh(newData[i].meter3, prevRec?.meter3);
                                                        newData[i].total_kwh = newData[i].kwh1 + newData[i].kwh2 + newData[i].kwh3;
                                                    }
                                                    setCompressorData(newData);
                                                };
                                                return (
                                                    <TableRow key={row.work_date} className="hover:bg-purple-50/10">
                                                        <TableCell className="border-r font-medium text-center text-xs">{format(parseISO(row.work_date), "dd/MM")}</TableCell>
                                                        {(['meter1', 'meter2', 'meter3'] as const).map(m => (
                                                            <TableCell key={m} className="border-r p-1">
                                                                <input type="number" step="0.01"
                                                                    className="w-full text-right p-1 rounded border-gray-200 outline-none focus:ring-1 focus:ring-purple-400 bg-transparent text-sm font-semibold"
                                                                    value={row[m] !== undefined ? row[m] : ''}
                                                                    onChange={e => handleMeterChange(m, e.target.value === '' ? undefined : Number(e.target.value))}
                                                                />
                                                            </TableCell>
                                                        ))}
                                                        <TableCell className="border-r p-1 text-right font-bold text-indigo-700 bg-indigo-50/20">{row.kwh1 > 0 ? row.kwh1.toLocaleString('en-US', {maximumFractionDigits: 0}) : 'â€”'}</TableCell>
                                                        <TableCell className="border-r p-1 text-right font-bold text-indigo-700 bg-indigo-50/20">{row.kwh2 > 0 ? row.kwh2.toLocaleString('en-US', {maximumFractionDigits: 0}) : 'â€”'}</TableCell>
                                                        <TableCell className="border-r p-1 text-right font-bold text-indigo-700 bg-indigo-50/20">{row.kwh3 > 0 ? row.kwh3.toLocaleString('en-US', {maximumFractionDigits: 0}) : 'â€”'}</TableCell>
                                                        <TableCell className="p-1 text-right font-black text-rose-700 bg-rose-50/20">{row.total_kwh > 0 ? row.total_kwh.toLocaleString('en-US', {maximumFractionDigits: 0}) : 'â€”'}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
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
                                    <span>âš¡ Nháº­p liá»‡u Chá»‰ sá»‘ Äiá»‡n Shelling (ToÃ n thÃ¡ng)</span>
                                    <span className="text-sm font-normal text-muted-foreground">{date ? format(date, "MM/yyyy") : ''}</span>
                                </h3>

                                <div className="rounded-md border overflow-x-auto min-w-full">
                                    <Table className="min-w-[500px]">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="border-r w-[80px] text-center bg-gray-50 uppercase text-gray-500 font-semibold text-xs">NgÃ y</TableHead>
                                                <TableHead className="border-r text-center w-[120px] bg-amber-50/50 text-amber-700">CÃ´ng tÆ¡ Ä‘iá»‡n</TableHead>
                                                <TableHead className="border-r text-center w-[100px] bg-amber-50/50 text-amber-700 border-r-amber-100">TiÃªu thá»¥ (LÃ¹i)</TableHead>
                                                <TableHead className="border-r text-center w-[120px] bg-gray-50 text-gray-700">Sáº£n lÆ°á»£ng <br /><span className="text-[10px] font-normal leading-none">(NgÃ y trÆ°á»›c)</span></TableHead>
                                                <TableHead className="text-center w-[100px] bg-gray-50 text-gray-700">kWh / Táº¥n</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {shellingMonthlyEnergyData.map((row, index) => {
                                                const prevRowElec = index > 0 ? shellingMonthlyEnergyData[index - 1].electricity_meter_reading : prevMonthLastMeter?.elec;
                                                const intensity = row.actual_ton > 0 ? (row.electricity_kwh / row.actual_ton).toFixed(2) : "0.00";

                                                                                                const handleMeterChange = (val: number | undefined) => {
                                                    const newData = [...shellingMonthlyEnergyData];
                                                    newData[index].electricity_meter_reading = val;
                                                    for (let i = 0; i < newData.length; i++) {
                                                        const meterToday = newData[i].electricity_meter_reading;
                                                        const meterYesterday = i === 0 ? prevMonthLastMeter?.elec : newData[i - 1]?.electricity_meter_reading;
                                                        if (meterToday != null && meterYesterday != null) {
                                                            newData[i].electricity_kwh = Math.max(0, meterToday - meterYesterday);
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
                                                            {prevRowElec != null && <div className="text-[10px] text-amber-600 text-center absolute bottom-0 left-0 right-0 opacity-75">Trá»« tá»« trÆ°á»›c: {prevRowElec}</div>}
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
                                        {isSaving ? 'Äang lÆ°u...' : 'LÆ°u ToÃ n Bá»™ Äiá»‡n Shelling'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                )}

                {/* OTHER ELECTRICITY METER TAB */}
                {(role === 'admin' || role === 'HSE' || role === 'hse_admin' || role === 'maint') && <TabsContent value="other-elec" className="space-y-4">
                    <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden relative">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-semibold text-lg text-emerald-800">âš¡ Äiá»‡n KhÃ¡c (HCA) â€” Nháº­p Chá»‰ sá»‘ KWh: ThÃ¡ng {format(date, "MM/yyyy")}</h3>
                                <Button onClick={saveOtherElec} disabled={isSaving} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                    <Save className="mr-2 h-4 w-4" />
                                    {isSaving ? 'Äang lÆ°u...' : 'LÆ°u toÃ n bá»™ thÃ¡ng'}
                                </Button>
                                <div className="text-xs text-muted-foreground italic mb-2 absolute top-2 right-4">
                                    * Nháº­p CHá»ˆ Sá» kwh trÃªn cÃ¡c Ä‘á»“ng há»“ con. Há»‡ thá»‘ng sáº½ tá»± Ä‘á»™ng trá»« lÃ¹i Ä‘á»ƒ ra má»©c TiÃªu thá»¥.
                                </div>
                            </div>
                            <div className="overflow-x-auto w-full relative h-[650px] custom-scrollbar border bg-slate-50/50 rounded-lg">
                                <Table className="w-full border-collapse">
                                    <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                                        <TableRow className="border-b bg-emerald-50">
                                            <TableHead className="w-24 whitespace-nowrap text-emerald-800 font-bold border-r">NgÃ y</TableHead>
                                            <TableHead className="font-bold border-r min-w-[120px] bg-emerald-100/30 text-emerald-700 text-center text-xs">Cooling Fan</TableHead>
                                            <TableHead className="font-bold border-r min-w-[120px] bg-emerald-100/30 text-emerald-700 text-center text-xs">Boiler</TableHead>
                                            <TableHead className="font-bold border-r min-w-[120px] bg-emerald-100/30 text-emerald-700 text-center text-xs">Office</TableHead>
                                            <TableHead className="font-bold border-r min-w-[120px] bg-emerald-100/30 text-emerald-700 text-center text-xs">DB-AC HCA</TableHead>
                                            <TableHead className="font-bold border-r min-w-[120px] bg-emerald-100/30 text-emerald-700 text-center text-xs">ECO2</TableHead>
                                            <TableHead className="font-bold border-r min-w-[120px] bg-emerald-100/30 text-emerald-700 text-center text-xs">Canteen</TableHead>
                                            <TableHead className="font-bold min-w-[120px] bg-emerald-100/30 text-emerald-700 text-center text-xs">ÄH Maint (HCA+Shell)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {otherElecData.map((row, index) => {
                                            const handleChange = (field: 'cooling_fan' | 'boiler' | 'office' | 'db_ac_hca' | 'eco2' | 'canteen' | 'transformer' | 'maintenance', val: number | undefined) => {
                                                const newData = [...otherElecData];
                                                newData[index][field] = val;
                                                
                                                const calc = (curr: number|undefined, prev: number|undefined) => {
                                                    if (curr === undefined || prev === undefined) return 0;
                                                    return Math.max(0, curr - prev);
                                                };

                                                for (let i = index > 0 ? index : 1; i < newData.length; i++) {
                                                    const prevRec = newData[i - 1];
                                                    newData[i].kwh_cooling_fan = calc(newData[i].cooling_fan, prevRec?.cooling_fan);
                                                    newData[i].kwh_boiler = calc(newData[i].boiler, prevRec?.boiler);
                                                    newData[i].kwh_office = calc(newData[i].office, prevRec?.office);
                                                    newData[i].kwh_db_ac_hca = calc(newData[i].db_ac_hca, prevRec?.db_ac_hca);
                                                    newData[i].kwh_eco2 = calc(newData[i].eco2, prevRec?.eco2);
                                                    newData[i].kwh_canteen = calc(newData[i].canteen, prevRec?.canteen);
                                                    newData[i].kwh_transformer = calc(newData[i].transformer, prevRec?.transformer);
                                                    newData[i].kwh_maintenance = calc(newData[i].maintenance, prevRec?.maintenance);
                                                }
                                                setOtherElecData(newData);
                                            };

                                            const renderInput = (label: string, field: 'cooling_fan' | 'boiler' | 'office' | 'db_ac_hca' | 'eco2' | 'canteen' | 'transformer' | 'maintenance', val: number|undefined, kwh: number) => (
                                                <TableCell className="p-1 border-r bg-white" key={field}>
                                                    <div className="flex flex-col gap-1 items-center">
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            className="h-8 text-[11px] text-center border-emerald-200 focus-visible:ring-emerald-500 w-full hover:bg-emerald-50 focus:bg-emerald-50"
                                                            value={val === undefined ? "" : val}
                                                            onChange={(e) => handleChange(field, e.target.value ? Number(e.target.value) : undefined)}
                                                            placeholder={`${label}`}
                                                        />
                                                        <div className="text-[10px] text-emerald-600/80 font-medium whitespace-nowrap bg-emerald-50/50 px-2 py-0.5 rounded border border-emerald-100/50 min-w-16 text-center shadow-sm">
                                                            {kwh.toLocaleString('en-US', {maximumFractionDigits:1})} kWh
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            );

                                            return (
                                                <TableRow key={row.work_date} className="hover:bg-emerald-50/20">
                                                    <TableCell className="font-medium bg-emerald-50/30 border-r py-3 px-2 text-center text-xs sticky left-0 z-10 backdrop-blur-md">
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-bold text-slate-700">{format(new Date(row.work_date), 'dd/MM/yyyy')}</span>
                                                        </div>
                                                    </TableCell>
                                                    {renderInput("Fan", 'cooling_fan', row.cooling_fan, row.kwh_cooling_fan)}
                                                    {renderInput("Boiler", 'boiler', row.boiler, row.kwh_boiler)}
                                                    {renderInput("Office", 'office', row.office, row.kwh_office)}
                                                    {renderInput("DB-AC", 'db_ac_hca', row.db_ac_hca, row.kwh_db_ac_hca)}
                                                    {renderInput("ECO2", 'eco2', row.eco2, row.kwh_eco2)}
                                                    {renderInput("Canteen", 'canteen', row.canteen, row.kwh_canteen)}
                                                    {renderInput("Transf", 'transformer', row.transformer, row.kwh_transformer)}
                                                    {renderInput("Maint", 'maintenance', row.maintenance, row.kwh_maintenance)}
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                </TabsContent>}

            </Tabs>
        </div>
    );
}



