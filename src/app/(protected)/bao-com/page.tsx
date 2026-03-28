"use client"

import { useState, useCallback, useEffect } from "react"
import {
    ClipboardPaste,
    TableIcon,
    Download,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    UtensilsCrossed,
    Sparkles,
    Copy,
    Save,
    History,
    CalendarDays,
    Database,
    FileSpreadsheet,
    BarChart3,
    Bell,
    MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns"

// Ca → giờ bắt đầu (cho OT hint)
const SHIFT_HOUR: Record<string, string> = { "1": "6h", "2": "14h", "3": "22h" }

// Dỳ kiến các bộ phận cần báo cơm (lowercase name_en or Zalo name)
const EXPECTED_DEPTS = [
    "PEEL", "GRAD", "CS", "STEAM", "PACK", "BORMA", "SHELL", "BOILER", "QC", "FGWH", "HPEEL", "MAINT_SHELL"
]

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface HeadcountRecord {
    senderHint: string
    date: string
    area: string
    shift: string
    officialPresent: number | null
    officialPresentNote: string
    officialAbsent: number | null
    seasonalPresent: number | null
    seasonalAbsent: number | null
    ot: string
    vegetarian: number | null
    raw: string
}

interface SavedRecord {
    id: string
    work_date: string
    department_name: string
    department_id: string | null
    shift: string
    official_present: number
    official_absent: number
    seasonal_present: number
    seasonal_absent: number
    ot_count: number
    vegetarian: number
    note: string | null
    created_at: string
}

// Department mapping: Zalo name → DB department code
const DEPT_MAP: Record<string, string> = {
    "peeling": "PEEL",
    "peeling mc": "PEEL",
    "mc peeling": "PEEL",
    "grading": "GRAD",
    "color sorter": "CS",
    "steaming": "STEAM",
    "packing": "PACK",
    "borma": "BORMA",
    "shelling": "SHELL",
    "boiler": "BOILER",
    "qc": "QC",
    "warehouse": "FGWH",
    "handpeeling": "HPEEL",
    "maint shelling": "MAINT_SHELL",
    "maint - shelling": "MAINT_SHELL",
    "maintenance shelling": "MAINT_SHELL",
    "bảo trì shelling": "MAINT_SHELL",
    "bao tri shelling": "MAINT_SHELL",
    "bảo trì máy cắt": "MAINT_SHELL",
    "bao tri may cat": "MAINT_SHELL",
    "bảo trì may cắt": "MAINT_SHELL",
    "bao tri máy cắt": "MAINT_SHELL",
}

// ─────────────────────────────────────────────
// Parse helpers
// ─────────────────────────────────────────────

function extractNumber(raw: string): { total: number | null; vegetarian: number | null; note: string } {
    if (!raw || raw.trim() === "" || raw.trim() === ":") return { total: null, vegetarian: null, note: "" }
    const cleaned = raw.trim()
    let vegetarian: number | null = null
    let note = ""
    const vegetarianMatch = cleaned.match(/[+(]?\s*(\d+)\s*chay/i)
    if (vegetarianMatch) {
        vegetarian = parseInt(vegetarianMatch[1])
        note = `(${vegetarian} chay)`
    }
    const sumEqualMatch = cleaned.match(/(\d+)\s*[+]\s*\d+\s*chay\s*=\s*(\d+)/i)
    if (sumEqualMatch) return { total: parseInt(sumEqualMatch[2]), vegetarian, note }
    const plusChayMatch = cleaned.match(/^(\d+)\s*[+]\s*\d+\s*chay/i)
    if (plusChayMatch) return { total: parseInt(plusChayMatch[1]), vegetarian, note }
    const leadingNum = cleaned.match(/^(\d+)/)
    if (leadingNum) return { total: parseInt(leadingNum[1]), vegetarian, note }
    return { total: null, vegetarian: null, note: cleaned }
}

function normalizeDate(raw: string): string {
    if (!raw) return ""
    const m = raw.trim().match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/)
    if (m) {
        const d = m[1].padStart(2, "0")
        const mo = m[2].padStart(2, "0")
        const y = m[3].length === 2 ? `20${m[3]}` : m[3]
        return `${d}/${mo}/${y}`
    }
    return raw.trim()
}

function getField(text: string, labels: string[]): string {
    for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const regex = new RegExp(escaped + "\\s*:?\\s*([^\\n]*)", "i")
        const match = text.match(regex)
        if (match && match[1] !== undefined) return match[1].trim()
    }
    return ""
}

function parseBlock(block: string): HeadcountRecord | null {
    const text = block.trim()
    if (text.length < 10) return null

    const dateRaw = getField(text, ["date", "ngày", "deate", "ngay"])
    let dateVal = normalizeDate(dateRaw)
    if (!dateVal) {
        const inlineDate = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
        if (inlineDate) dateVal = normalizeDate(inlineDate[0])
    }

    const hasKeyword = /khu\s*v[ựu]c|chính\s*th[ứu]c\s*hi[eệ]n\s*di[eệ]n|ca\s*:/i.test(text)
    if (!dateVal && !hasKeyword) return null

    let area = getField(text, ["khu vực", "khu vuc", "bộ phận", "bo phan", "bộphận"])
    area = area.replace(/\s*ca\s*:\s*\w+.*/i, "").trim()
    // Strip trailing parenthetical hints like "(Dung)", "(Linh)", etc.
    area = area.replace(/\s*\([^)]*\)\s*$/, "").trim()
    // Strip trailing comma or punctuation
    area = area.replace(/[,;.]+$/, "").trim()

    let shift = getField(text, ["ca"])
    const inlineShift = getField(text, ["khu vực", "khu vuc"]).match(/ca\s*:\s*(\S+)/i)
    if (inlineShift) shift = inlineShift[1]
    shift = shift.replace(/\./g, ", ").trim()

    // Fuzzy match: ch[íi]nh th[ứu]c hi[eệ]n di[eệ]n (any diacritic mix)
    const offPresentFuzzy = text.match(/ch[íi]nh\s+th[ứu]c\s+hi[eệ]n\s+di[eệ]n\s*:?\s*([^\n]*)/i)
    const offPresentRaw = offPresentFuzzy ? offPresentFuzzy[1].trim() : getField(text, [
        "chính thức hiện diện", "chính thuc hiện diện", "chinh thuc hien dien",
    ])
    const { total: officialPresent, vegetarian, note: offNote } = extractNumber(offPresentRaw)

    const offAbsentRaw = getField(text, ["chính thức vắng", "chinh thuc vang"])
    const { total: officialAbsent } = extractNumber(offAbsentRaw)

    const seasPresentRaw = getField(text, ["thời vụ hiện diện", "2thời vụ hiện diện", "thoi vu hien dien"])
    const { total: seasonalPresent } = extractNumber(seasPresentRaw)

    const seasAbsentRaw = getField(text, ["thời vụ vắng", "thoi vu vang"])
    const { total: seasonalAbsent } = extractNumber(seasAbsentRaw)

    // OT: grab only the leading number/token (stop before any next keyword or whitespace-separated text)
    let otRaw = getField(text, ["ot"])
    // Trim away anything after the first number + optional symbol (e.g. "0 Dự trù ngày ...")
    const otNumMatch = otRaw.match(/^(\d+[h]?(?:\.\d+)?(?:\s*giờ|\s*h)?)/i)
    let ot = otNumMatch ? otNumMatch[1].trim() : (otRaw.split(/\s{2,}|(?=d[ựu]\s*tr[ùu])|(?=ca\s*:)/i)[0] || otRaw).trim()
    // Dự trù (forecast) is intentionally ignored — trailing info after OT is skipped

    let vegTotal = vegetarian
    const vegInOT = ot.match(/(\d+)\s*[p]?\s*[(\[]?\s*(\d+)\s*chay/i)
    if (!vegTotal && vegInOT) vegTotal = parseInt(vegInOT[2])
    const otVegMatch = ot.match(/(\d+)\s*chay/i)
    if (!vegTotal && otVegMatch) vegTotal = parseInt(otVegMatch[1])

    const lines = text.split("\n")
    let senderHint = ""
    for (const line of lines) {
        const l = line.trim()
        if (l && !/khu\s*v[ựu]c|ca\s*:|chính|thời|date|ngày|deate|ot:|dự/i.test(l)) {
            if (!/^\d{1,2}[./]/.test(l) && l.length < 60) {
                senderHint = l
                break
            }
        }
    }

    return {
        senderHint,
        date: dateVal,
        area: area || "—",
        shift: shift || "—",
        officialPresent,
        officialPresentNote: offNote,
        officialAbsent,
        seasonalPresent,
        seasonalAbsent,
        ot: ot || "0",
        vegetarian: vegTotal,

        raw: text,
    }
}

function splitIntoBlocks(rawText: string): string[] {
    const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const doubleNewlineSections = text.split(/\n{2,}/)
    const blocks: string[] = []
    for (const section of doubleNewlineSections) {
        const trimmed = section.trim()
        if (!trimmed) continue
        const hasDate = /\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/.test(trimmed)
        const hasArea = /khu\s*v[ựu]c/i.test(trimmed)
        if (hasDate || hasArea) blocks.push(trimmed)
    }
    if (blocks.length === 0) {
        let current: string[] = []
        for (const line of text.split("\n")) {
            const isDateLine = /^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(line.trim())
            const hasDateKeyword = /date\s*:/i.test(line)
            if ((isDateLine || hasDateKeyword) && current.length > 2) {
                blocks.push(current.join("\n"))
                current = [line]
            } else {
                current.push(line)
            }
        }
        if (current.length > 0) blocks.push(current.join("\n"))
    }
    return blocks.filter((b) => b.length > 5)
}

function parseZaloText(rawText: string): HeadcountRecord[] {
    const blocks = splitIntoBlocks(rawText)
    const records: HeadcountRecord[] = []
    for (const block of blocks) {
        const record = parseBlock(block)
        if (record && (record.date || record.area !== "—")) records.push(record)
    }
    return records
}

// ─────────────────────────────────────────────
// CSV Export
// ─────────────────────────────────────────────
function exportCSV(records: HeadcountRecord[]) {
    const headers = ["Ngày", "Khu vực", "Ca", "CT Hiện diện", "CT Vắng", "TV Hiện diện", "TV Vắng", "OT", "Chay"]
    const rows = records.map((r) => [
        r.date, r.area, r.shift,
        r.officialPresent ?? "", r.officialAbsent ?? "",
        r.seasonalPresent ?? "", r.seasonalAbsent ?? "",
        r.ot, r.vegetarian ?? "",
    ])
    const csvContent =
        "\uFEFF" +
        [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const today = new Date().toISOString().slice(0, 10)
    link.download = `bao-com-${today}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

function exportHistoryCSV(records: SavedRecord[]) {
    const headers = ["Ngày", "Bộ phận", "Ca", "CT Hiện diện", "CT Vắng", "TV Hiện diện", "TV Vắng", "OT", "Chay", "Ghi chú"]
    const rows = records.map((r) => [
        r.work_date, r.department_name, `Ca ${r.shift}`,
        r.official_present, r.official_absent,
        r.seasonal_present, r.seasonal_absent,
        r.ot_count, r.vegetarian, r.note || "",
    ])
    const csvContent =
        "\uFEFF" +
        [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `headcount-history-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

// Convert DD/MM/YYYY → YYYY-MM-DD for DB
function dateToISO(ddmmyyyy: string): string {
    const parts = ddmmyyyy.split("/")
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return ddmmyyyy
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function BaoCom() {
    const supabase = createClient()
    const [rawText, setRawText] = useState("")
    const [records, setRecords] = useState<HeadcountRecord[]>([])
    const [parsed, setParsed] = useState(false)
    const [copied, setCopied] = useState(false)
    const [activeTab, setActiveTab] = useState<"parse" | "history" | "kitchen">("parse")

    const [areaOverrides, setAreaOverrides] = useState<Record<number, string>>({})
    const [showSummary, setShowSummary] = useState(false)
    const [copiedSummary, setCopiedSummary] = useState(false)

    // Helper: get effective area (overridden or parsed)
    const getEffectiveArea = (r: HeadcountRecord, i: number) => areaOverrides[i] ?? r.area
    const getEffectiveDeptId = (r: HeadcountRecord, i: number) => findDeptId(getEffectiveArea(r, i))
    const [saving, setSaving] = useState(false)
    const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
    const [deptList, setDeptList] = useState<{ id: string; code: string; name_en: string }[]>([])
    const [userRole, setUserRole] = useState("")

    // History state
    const [historyRecords, setHistoryRecords] = useState<SavedRecord[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyFrom, setHistoryFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
    const [historyTo, setHistoryTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))

    // Load departments + user role on mount
    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
                if (profile) setUserRole(profile.role)
            }
            const { data: depts } = await supabase.from("departments").select("id, code, name_en").order("sort_order")
            if (depts) setDeptList(depts)
        }
        init()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const canSave = ["admin", "hr", "HSE", "hse", "hse_admin"].includes(userRole)

    // ─── Build summary text for kitchen ───
    const buildSummaryText = (): string => {
        // Group by date+shift
        const groups = new Map<string, HeadcountRecord[]>()
        records.forEach((r, i) => {
            const area = getEffectiveArea(r, i)
            const key = `${r.date}|||${r.shift}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push({ ...r, area })
        })
        const lines: string[] = []
        groups.forEach((recs, key) => {
            const [date, shift] = key.split("|||")
            const totalPresent = recs.reduce((s, r) => s + (r.officialPresent ?? 0) + (r.seasonalPresent ?? 0), 0)
            const totalVeg = recs.reduce((s, r) => s + (r.vegetarian ?? 0), 0)
            const totalOT = recs.reduce((s, r) => s + (parseInt(r.ot) || 0), 0)
            const man = totalPresent - totalVeg
            const shiftHour = SHIFT_HOUR[shift] ?? ""
            let block = `Ngày ${date}\nCa ${shift}: tổng cộng ${man} phần mặn (chay: ${totalVeg} phần)`
            if (totalOT > 0) block += `\n${totalOT} OT lúc ${shiftHour}`
            lines.push(block)
        })
        return lines.join("\n\n")
    }

    // ─── Check if area has a DEPT_MAP rule ───
    const hasDeptRule = (area: string): boolean => {
        const key = area.toLowerCase().trim()
        return Object.prototype.hasOwnProperty.call(DEPT_MAP, key)
    }

    // ─── DB-based summary state ───
    const [summaryDate, setSummaryDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
    const [summaryShift, setSummaryShift] = useState<string>("2")
    const [summaryLoading, setSummaryLoading] = useState(false)
    const [summaryData, setSummaryData] = useState<SavedRecord[] | null>(null)
    const [summaryError, setSummaryError] = useState<string | null>(null)

    const fetchSummaryFromDB = async () => {
        setSummaryLoading(true)
        setSummaryError(null)
        setSummaryData(null)
        try {
            const { data, error } = await supabase
                .from("headcount_zalo")
                .select("*, departments(code, name_en)")
                .eq("work_date", summaryDate)
                .eq("shift", summaryShift)
                .order("department_name")
            if (error) throw error
            setSummaryData(data ?? [])
        } catch (e: unknown) {
            setSummaryError(e instanceof Error ? e.message : "Lỗi kết nối DB")
        } finally {
            setSummaryLoading(false)
        }
    }

    const buildDBSummaryText = (rows: SavedRecord[]): string => {
        const totalPresent = rows.reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)
        const totalVeg = rows.reduce((s, r) => s + (r.vegetarian ?? 0), 0)
        const totalOT = rows.reduce((s, r) => s + (r.ot_count ?? 0), 0)
        const man = totalPresent - totalVeg
        const dateDisplay = format(parseISO(summaryDate), "d/M/yyyy")
        const shiftHour = SHIFT_HOUR[summaryShift] ?? ""
        let msg = `Ngày ${dateDisplay}\nCa ${summaryShift}: tổng cộng ${man} phần mặn (chay: ${totalVeg} phần)`
        if (totalOT > 0) msg += `\n${totalOT} OT lúc ${shiftHour}`
        return msg
    }

    const getDBMissingDepts = (rows: SavedRecord[]): string[] => {
        const reported = new Set(rows.map(r =>
            r.department_id
                ? (deptList.find(d => d.id === r.department_id)?.code ?? r.department_name.toUpperCase())
                : r.department_name.toUpperCase()
        ))
        return EXPECTED_DEPTS.filter(d => !reported.has(d))
    }

    // ─── Parse handlers ───
    const handleParse = useCallback(() => {
        if (!rawText.trim()) return
        const result = parseZaloText(rawText)
        setRecords(result)
        setParsed(true)
        setSaveMsg(null)
    }, [rawText])

    const handleReset = () => {
        setRawText("")
        setRecords([])
        setParsed(false)
        setSaveMsg(null)
    }

    const handleCopyTable = () => {
        if (records.length === 0) return
        const headers = ["Ngày", "Khu vực", "Ca", "CT Hiện diện", "CT Vắng", "TV Hiện diện", "TV Vắng", "OT", "Chay"]
        const rows = records.map((r) =>
            [r.date, r.area, r.shift, r.officialPresent ?? "", r.officialAbsent ?? "", r.seasonalPresent ?? "", r.seasonalAbsent ?? "", r.ot, r.vegetarian ?? ""].join("\t")
        )
        navigator.clipboard.writeText([headers.join("\t"), ...rows].join("\n"))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // ─── Save to DB ───
    const findDeptId = (areaName: string): string | null => {
        const lower = areaName.toLowerCase().trim()
        const code = DEPT_MAP[lower]
        if (!code) return null
        const dept = deptList.find((d) => d.code === code)
        return dept?.id || null
    }

    const handleSaveToDB = async () => {
        if (!canSave || records.length === 0) return
        setSaving(true)
        setSaveMsg(null)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            const payload = records.map((r, i) => ({
                work_date: dateToISO(r.date),
                department_name: getEffectiveArea(r, i),
                department_id: getEffectiveDeptId(r, i),
                shift: r.shift.replace(/[^1-3]/g, "") || "1",
                official_present: r.officialPresent ?? 0,
                official_absent: r.officialAbsent ?? 0,
                seasonal_present: r.seasonalPresent ?? 0,
                seasonal_absent: r.seasonalAbsent ?? 0,
                ot_count: parseInt(r.ot) || 0,
                vegetarian: r.vegetarian ?? 0,
                note: null,
                created_by: user?.id,
                updated_at: new Date().toISOString(),
            }))

            const { error } = await supabase.from("meal_headcount").upsert(payload, {
                onConflict: "work_date,department_name,shift",
            })

            if (error) throw error
            setSaveMsg({ type: "ok", text: `✅ Đã lưu ${payload.length} bản ghi thành công!` })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Lỗi không xác định"
            setSaveMsg({ type: "err", text: `❌ Lỗi: ${message}` })
        } finally {
            setSaving(false)
        }
    }

    // ─── History ───
    const fetchHistory = async () => {
        setHistoryLoading(true)
        const { data, error } = await supabase
            .from("meal_headcount")
            .select("*")
            .gte("work_date", historyFrom)
            .lte("work_date", historyTo)
            .order("work_date", { ascending: false })
            .order("department_name")
            .order("shift")
            .limit(500)

        if (!error && data) setHistoryRecords(data)
        setHistoryLoading(false)
    }

    useEffect(() => {
        if (activeTab === "history") fetchHistory()
    }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

    // Summary stats from parsed records
    const summary = records.reduce(
        (acc, r) => {
            acc.totalOfficial += r.officialPresent ?? 0
            acc.totalAbsent += r.officialAbsent ?? 0
            acc.totalSeasonal += r.seasonalPresent ?? 0
            acc.totalVeg += r.vegetarian ?? 0
            return acc
        },
        { totalOfficial: 0, totalAbsent: 0, totalSeasonal: 0, totalVeg: 0 }
    )

    // History summary
    const historySummary = historyRecords.reduce(
        (acc, r) => {
            acc.totalPresent += r.official_present + r.seasonal_present
            acc.totalAbsent += r.official_absent + r.seasonal_absent
            acc.totalVeg += r.vegetarian
            return acc
        },
        { totalPresent: 0, totalAbsent: 0, totalVeg: 0 }
    )

    const uniqueDates = [...new Set(records.map((r) => r.date).filter(Boolean))]

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-orange-100 border border-orange-200">
                        <UtensilsCrossed className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Báo Cơm — Headcount Tracker</h1>
                        <p className="text-sm text-muted-foreground">
                            Paste Zalo → Phân tích → Lưu DB → Xem lịch sử
                        </p>
                    </div>
                </div>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b">
                <button
                    onClick={() => setActiveTab("parse")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === "parse"
                            ? "border-orange-500 text-orange-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <ClipboardPaste className="h-4 w-4" />
                    Nhập & Phân tích
                </button>
                <button
                    onClick={() => setActiveTab("history")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === "history"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <History className="h-4 w-4" />
                    Lịch sử đã lưu
                </button>
                <button
                    onClick={() => { setActiveTab("kitchen"); if (summaryData === null) fetchSummaryFromDB() }}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === "kitchen"
                            ? "border-green-500 text-green-600"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <MessageSquare className="h-4 w-4" />
                    🍳 Báo cơm nhà ăn
                </button>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* TAB 3: KITCHEN / BÁO CƠM NHÀ ĂN               */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === "kitchen" && (
                <div className="space-y-5">
                    <div className="flex items-center gap-2 font-semibold text-green-700 text-lg">
                        <MessageSquare className="h-5 w-5" />
                        Tổng hợp báo cơm nhà ăn
                    </div>

                    {/* Date + Shift selectors */}
                    <div className="flex flex-wrap items-end gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-green-700">Ngày</label>
                            <input
                                type="date"
                                value={summaryDate}
                                onChange={e => setSummaryDate(e.target.value)}
                                className="border border-green-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-green-700">Ca</label>
                            <div className="flex gap-1">
                                {["1", "2", "3"].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setSummaryShift(s)}
                                        className={`px-4 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                                            summaryShift === s
                                                ? "bg-green-500 text-white border-green-500"
                                                : "bg-white text-green-700 border-green-300 hover:bg-green-100"
                                        }`}
                                    >{s}</button>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={fetchSummaryFromDB}
                            disabled={summaryLoading}
                            className="flex items-center gap-2 px-5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
                        >
                            <BarChart3 className="h-4 w-4" />
                            {summaryLoading ? "Đang tải..." : "Tổng hợp"}
                        </button>
                    </div>

                    {summaryError && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{summaryError}</div>
                    )}

                    {summaryData !== null && (() => {
                        if (summaryData.length === 0) return (
                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                ⚠️ Không có dữ liệu cho ngày này — có thể chưa lưu hoặc chưa báo đủ.
                            </div>
                        )
                        const msgText = buildDBSummaryText(summaryData)
                        const missingDepts = getDBMissingDepts(summaryData)
                        return (
                            <div className="space-y-4">
                                {/* Kitchen message box */}
                                <div className="bg-white rounded-xl border-2 border-green-200 shadow-sm p-4">
                                    <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Tin nhắn gửi nhà ăn</div>
                                    <pre className="font-mono text-sm whitespace-pre-wrap text-gray-800 leading-relaxed">{msgText}</pre>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(msgText)
                                            setCopiedSummary(true)
                                            setTimeout(() => setCopiedSummary(false), 2000)
                                        }}
                                        className={`mt-3 flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                            copiedSummary ? "bg-green-600 text-white" : "bg-green-100 hover:bg-green-200 text-green-700"
                                        }`}
                                    >
                                        {copiedSummary ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        {copiedSummary ? "Đã copy!" : "Copy tin nhắn"}
                                    </button>
                                </div>

                                {/* Per-dept breakdown */}
                                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                    <div className="px-4 py-2.5 bg-muted/40 border-b text-sm font-semibold">Chi tiết từng bộ phận</div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide text-left">
                                                    <th className="px-4 py-2 font-semibold">Bộ phận</th>
                                                    <th className="px-4 py-2 font-semibold text-right">CT HĐ</th>
                                                    <th className="px-4 py-2 font-semibold text-right">TV HĐ</th>
                                                    <th className="px-4 py-2 font-semibold text-right">Tổng</th>
                                                    <th className="px-4 py-2 font-semibold text-right text-emerald-600">🥦 Chay</th>
                                                    <th className="px-4 py-2 font-semibold text-right">OT</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {summaryData.map(r => (
                                                    <tr key={r.id} className="hover:bg-muted/30">
                                                        <td className="px-4 py-2 font-medium">
                                                            {r.department_id
                                                                ? (deptList.find(d => d.id === r.department_id)?.name_en ?? r.department_name)
                                                                : r.department_name}
                                                        </td>
                                                        <td className="px-4 py-2 text-right font-semibold text-green-700">{r.official_present ?? 0}</td>
                                                        <td className="px-4 py-2 text-right">{r.seasonal_present ?? 0}</td>
                                                        <td className="px-4 py-2 text-right font-bold">{(r.official_present ?? 0) + (r.seasonal_present ?? 0)}</td>
                                                        <td className="px-4 py-2 text-right text-emerald-600 font-semibold">{r.vegetarian ?? 0}</td>
                                                        <td className="px-4 py-2 text-right">{r.ot_count ?? 0}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-muted/60 font-bold border-t-2 text-sm">
                                                    <td className="px-4 py-2">TỔNG</td>
                                                    <td className="px-4 py-2 text-right text-green-700">{summaryData.reduce((s, r) => s + (r.official_present ?? 0), 0)}</td>
                                                    <td className="px-4 py-2 text-right">{summaryData.reduce((s, r) => s + (r.seasonal_present ?? 0), 0)}</td>
                                                    <td className="px-4 py-2 text-right">{summaryData.reduce((s, r) => s + (r.official_present ?? 0) + (r.seasonal_present ?? 0), 0)}</td>
                                                    <td className="px-4 py-2 text-right text-emerald-600">{summaryData.reduce((s, r) => s + (r.vegetarian ?? 0), 0)}</td>
                                                    <td className="px-4 py-2 text-right">{summaryData.reduce((s, r) => s + (r.ot_count ?? 0), 0)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>

                                {/* Missing depts */}
                                {missingDepts.length > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                                        <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                                            <Bell className="h-4 w-4" />
                                            Chưa có dữ liệu từ:
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {missingDepts.map(d => (
                                                <span key={d} className="inline-block bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2.5 py-1 rounded-full font-medium">{d}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })()}
                </div>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* TAB 1: PARSE & SAVE                        */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === "parse" && (
                <>
                    {/* Paste area */}
                    {!parsed && (
                        <div className="bg-card rounded-xl border shadow-sm p-4 space-y-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <ClipboardPaste className="h-4 w-4" />
                                Paste nội dung chat Zalo vào đây (copy tất cả các tin nhắn báo cơm của ngày)
                            </div>
                            <textarea
                                id="zalo-paste-area"
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                placeholder={`Ví dụ:\n28.3.2026\nKhu vực : Boiler\nCa: 1.2.3\nChính thức hiện diện: 3\nChính thức vắng: 0\n2Thời vụ hiện diện:0\nThời vụ vắng :0\nOT:\n\nDate: 28/03/2026\nKhu vực : Peeling mc\nCa: 1\nChính thức hiện diện: 7\n...`}
                                rows={16}
                                className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 resize-y"
                                style={{ minHeight: "260px" }}
                            />
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                    💡 Không cần xóa tên người gửi hay timestamp — hệ thống tự bỏ qua.
                                </p>
                                <Button
                                    id="parse-btn"
                                    onClick={handleParse}
                                    disabled={!rawText.trim()}
                                    className="gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6"
                                >
                                    <Sparkles className="h-4 w-4" />
                                    Phân tích ngay
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    {parsed && (
                        <>
                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={handleCopyTable} className="gap-2">
                                    {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                    {copied ? "Đã copy!" : "Copy bảng"}
                                </Button>
                                <Button size="sm" onClick={() => exportCSV(records)} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                                    <Download className="h-4 w-4" />
                                    Xuất Excel (.csv)
                                </Button>
                                {canSave && records.length > 0 && (
                                    <Button
                                        size="sm"
                                        onClick={handleSaveToDB}
                                        disabled={saving}
                                        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        <Save className="h-4 w-4" />
                                        {saving ? "Đang lưu..." : `💾 Lưu ${records.length} bản ghi vào DB`}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    onClick={() => setShowSummary(s => !s)}
                                    className={`gap-2 ${showSummary ? "bg-orange-600 hover:bg-orange-700" : "bg-orange-500 hover:bg-orange-600"} text-white`}
                                >
                                    <BarChart3 className="h-4 w-4" />
                                    Tổng hợp báo cơm
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
                                    <RefreshCw className="h-4 w-4" />
                                    Làm mới
                                </Button>
                            </div>

                            {/* Summary panel */}
                            {showSummary && (
                                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-4">
                                    <div className="flex items-center gap-2 font-semibold text-orange-700">
                                        <MessageSquare className="h-4 w-4" />
                                        Tổng hợp báo cơm nhà ăn
                                    </div>

                                    {/* Date + Shift selectors */}
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs font-medium text-orange-700">Ngày</label>
                                            <input
                                                type="date"
                                                value={summaryDate}
                                                onChange={e => setSummaryDate(e.target.value)}
                                                className="border border-orange-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs font-medium text-orange-700">Ca</label>
                                            <div className="flex gap-1">
                                                {["1", "2", "3"].map(s => (
                                                    <button
                                                        key={s}
                                                        onClick={() => setSummaryShift(s)}
                                                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                                                            summaryShift === s
                                                                ? "bg-orange-500 text-white border-orange-500"
                                                                : "bg-white text-orange-700 border-orange-300 hover:bg-orange-100"
                                                        }`}
                                                    >{s}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <button
                                            onClick={fetchSummaryFromDB}
                                            disabled={summaryLoading}
                                            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                                        >
                                            <BarChart3 className="h-4 w-4" />
                                            {summaryLoading ? "Đang tải..." : "Tổng hợp"}
                                        </button>
                                    </div>

                                    {summaryError && (
                                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{summaryError}</div>
                                    )}

                                    {summaryData !== null && (() => {
                                        if (summaryData.length === 0) return (
                                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                                Không có dữ liệu cho ngày này — có thể chưa lưu hoặc chưa báo đủ.
                                            </div>
                                        )
                                        const msgText = buildDBSummaryText(summaryData)
                                        const missingDepts = getDBMissingDepts(summaryData)
                                        return (
                                            <div className="space-y-3">
                                                {/* Kitchen message */}
                                                <div className="bg-white rounded-lg border border-orange-100 p-3 font-mono text-sm whitespace-pre-wrap text-gray-800">
                                                    {msgText}
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(msgText)
                                                        setCopiedSummary(true)
                                                        setTimeout(() => setCopiedSummary(false), 2000)
                                                    }}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                                        copiedSummary ? "bg-green-600 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"
                                                    }`}
                                                >
                                                    {copiedSummary ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                    {copiedSummary ? "Đã copy!" : "Copy tin nhắn"}
                                                </button>

                                                {/* Per-dept breakdown */}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs border rounded-lg overflow-hidden">
                                                        <thead>
                                                            <tr className="bg-orange-100 text-orange-700 text-left">
                                                                <th className="px-2 py-1.5 font-semibold">Bộ phận</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">CT HĐ</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">TV HĐ</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">Chay</th>
                                                                <th className="px-2 py-1.5 font-semibold text-right">OT</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {summaryData.map(r => (
                                                                <tr key={r.id} className="hover:bg-orange-50">
                                                                    <td className="px-2 py-1 font-medium">
                                                                        {r.department_id
                                                                            ? (deptList.find(d => d.id === r.department_id)?.name_en ?? r.department_name)
                                                                            : r.department_name}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-right text-green-700 font-semibold">{r.official_present ?? 0}</td>
                                                                    <td className="px-2 py-1 text-right">{r.seasonal_present ?? 0}</td>
                                                                    <td className="px-2 py-1 text-right text-emerald-600">{r.vegetarian ?? 0}</td>
                                                                    <td className="px-2 py-1 text-right">{r.ot_count ?? 0}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Missing depts */}
                                                {missingDepts.length > 0 && (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                                                            <Bell className="h-4 w-4" />
                                                            Chưa có dữ liệu từ các bộ phận:
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {missingDepts.map(d => (
                                                                <span key={d} className="inline-block bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2 py-0.5 rounded-full font-medium">{d}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}

                            {/* Save message */}
                            {saveMsg && (
                                <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                                    saveMsg.type === "ok"
                                        ? "bg-green-50 text-green-700 border border-green-200"
                                        : "bg-red-50 text-red-700 border border-red-200"
                                }`}>
                                    {saveMsg.text}
                                </div>
                            )}

                            {/* Summary cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                {[
                                    { label: "Bộ phận", value: records.length, unit: "KV", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
                                    { label: "CT Hiện diện", value: summary.totalOfficial, unit: "người", bg: "bg-green-50", text: "text-green-600", border: "border-green-200" },
                                    { label: "CT Vắng", value: summary.totalAbsent, unit: "người", bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
                                    { label: "TV Hiện diện", value: summary.totalSeasonal, unit: "người", bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200" },
                                    { label: "Chay hôm nay", value: summary.totalVeg || "—", unit: summary.totalVeg ? "suất" : "", bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
                                ].map((s) => (
                                    <div key={s.label} className={`rounded-xl border p-4 shadow-sm ${s.bg} ${s.border}`}>
                                        <p className="text-xs text-muted-foreground">{s.label}</p>
                                        <p className={`text-3xl font-bold ${s.text} mt-1`}>{s.value}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{s.unit}</p>
                                    </div>
                                ))}
                            </div>

                            {records.length === 0 ? (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center space-y-2">
                                    <AlertCircle className="h-8 w-8 text-yellow-500 mx-auto" />
                                    <p className="font-semibold text-yellow-800">Không tìm thấy dữ liệu hợp lệ</p>
                                    <p className="text-sm text-yellow-700">
                                        Hệ thống cần tìm thấy các từ khóa như &quot;Khu vực&quot;, &quot;Chính thức hiện diện&quot;, cùng với ngày tháng.
                                    </p>
                                    <Button variant="outline" size="sm" onClick={handleReset} className="mt-2 gap-2">
                                        <RefreshCw className="h-4 w-4" /> Thử lại
                                    </Button>
                                </div>
                            ) : (
                                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/40">
                                        <div className="flex items-center gap-2">
                                            <TableIcon className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-semibold text-sm">
                                                Kết quả — {uniqueDates.join(", ")} &nbsp;|&nbsp; {records.length} khu vực
                                            </span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            CT = Chính thức &nbsp;·&nbsp; TV = Thời vụ
                                        </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/60 text-left text-xs text-muted-foreground uppercase tracking-wide">
                                                    <th className="px-3 py-2.5 font-semibold">#</th>
                                                    <th className="px-3 py-2.5 font-semibold">Ngày</th>
                                                    <th className="px-3 py-2.5 font-semibold">Khu vực</th>
                                                    <th className="px-3 py-2.5 font-semibold">Ca</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">CT HĐ</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">CT Vắng</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">TV HĐ</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">TV Vắng</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">OT</th>
                                                    <th className="px-3 py-2.5 font-semibold text-right">🥦 Chay</th>
                                                    <th className="px-3 py-2.5 font-semibold">DB Link</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {records.map((r, i) => {
                                                    const effArea = getEffectiveArea(r, i)
                                                    const deptId = getEffectiveDeptId(r, i)
                                                    const linked = deptList.find((d) => d.id === deptId)
                                                    const isUnknown = !linked && !hasDeptRule(effArea)
                                                    return (
                                                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                                                            <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                                                            <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                                                                {r.date || <span className="text-yellow-500">?</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 font-medium whitespace-nowrap">{effArea}</td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                                    Ca {r.shift}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.officialPresent != null ? (
                                                                    <span className="font-bold text-green-700">
                                                                        {r.officialPresent}
                                                                        {r.officialPresentNote && (
                                                                            <span className="text-xs font-normal text-muted-foreground ml-1">{r.officialPresentNote}</span>
                                                                        )}
                                                                    </span>
                                                                ) : <span className="text-muted-foreground">—</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.officialAbsent != null ? (
                                                                    <span className={r.officialAbsent > 0 ? "font-bold text-red-600" : "text-muted-foreground"}>
                                                                        {r.officialAbsent}
                                                                    </span>
                                                                ) : <span className="text-muted-foreground">—</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.seasonalPresent != null ? r.seasonalPresent : <span className="text-muted-foreground">—</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.seasonalAbsent != null ? r.seasonalAbsent : <span className="text-muted-foreground">—</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right text-xs">{r.ot || "0"}</td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                {r.vegetarian != null && r.vegetarian > 0 ? (
                                                                    <span className="font-semibold text-emerald-600">{r.vegetarian}</span>
                                                                ) : <span className="text-muted-foreground">—</span>}
                                                            </td>
                                                            <td className="px-3 py-2.5">
                                                                {linked ? (
                                                                    <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                                                        <Database className="h-3 w-3" />
                                                                        {linked.name_en}
                                                                    </span>
                                                                ) : isUnknown ? (
                                                                    <div className="flex flex-col gap-1 min-w-[150px]">
                                                                        <span className="text-xs text-amber-600 font-semibold">⚠ Không rõ: &quot;{effArea}&quot;</span>
                                                                         <select
                                                                             className="text-xs border border-amber-300 rounded px-1 py-0.5 bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                                                             value={areaOverrides[i] ?? ""}
                                                                             onChange={(e) => setAreaOverrides(prev => ({ ...prev, [i]: e.target.value }))}
                                                                         >
                                                                             <option value="">-- Chọn bộ phận --</option>
                                                                             {deptList.map(d => (
                                                                                 <option key={d.id} value={d.name_en}>{d.name_en}</option>
                                                                             ))}
                                                                         </select>
                                                                     </div>
                                                                 ) : (
                                                                     <span className="text-xs text-muted-foreground">—</span>
                                                                 )}
                                                             </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-muted/60 font-bold border-t-2 text-sm">
                                                    <td className="px-3 py-2.5" colSpan={4}>
                                                        TỔNG ({records.length} khu vực)
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-green-700">{summary.totalOfficial}</td>
                                                    <td className="px-3 py-2.5 text-right text-red-600">{summary.totalAbsent}</td>
                                                    <td className="px-3 py-2.5 text-right">{summary.totalSeasonal}</td>
                                                    <td className="px-3 py-2.5 text-right">—</td>
                                                    <td className="px-3 py-2.5 text-right">—</td>
                                                    <td className="px-3 py-2.5 text-right text-emerald-600">
                                                        {summary.totalVeg > 0 ? summary.totalVeg : "—"}
                                                    </td>
                                                    <td />
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Back button */}
                            <div className="flex justify-start">
                                <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2 text-muted-foreground">
                                    <RefreshCw className="h-3 w-3" /> Paste dữ liệu mới
                                </Button>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* TAB 2: HISTORY                              */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === "history" && (
                <div className="space-y-4">
                    {/* Date range filter */}
                    <div className="bg-card rounded-xl border shadow-sm p-4">
                        <div className="flex flex-wrap items-end gap-4">
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground block mb-1">Từ ngày</label>
                                <input
                                    type="date"
                                    value={historyFrom}
                                    onChange={(e) => setHistoryFrom(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground block mb-1">Đến ngày</label>
                                <input
                                    type="date"
                                    value={historyTo}
                                    onChange={(e) => setHistoryTo(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <Button onClick={fetchHistory} disabled={historyLoading} className="gap-2">
                                <CalendarDays className="h-4 w-4" />
                                {historyLoading ? "Đang tải..." : "Xem dữ liệu"}
                            </Button>
                            {historyRecords.length > 0 && (
                                <Button
                                    variant="outline"
                                    onClick={() => exportHistoryCSV(historyRecords)}
                                    className="gap-2 text-green-700 border-green-300 hover:bg-green-50"
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    Xuất Excel ({historyRecords.length} dòng)
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Summary */}
                    {historyRecords.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-xl border p-4 shadow-sm bg-blue-50 border-blue-200">
                                <p className="text-xs text-muted-foreground">Tổng bản ghi</p>
                                <p className="text-3xl font-bold text-blue-600 mt-1">{historyRecords.length}</p>
                            </div>
                            <div className="rounded-xl border p-4 shadow-sm bg-green-50 border-green-200">
                                <p className="text-xs text-muted-foreground">Tổng hiện diện</p>
                                <p className="text-3xl font-bold text-green-600 mt-1">{historySummary.totalPresent}</p>
                            </div>
                            <div className="rounded-xl border p-4 shadow-sm bg-red-50 border-red-200">
                                <p className="text-xs text-muted-foreground">Tổng vắng</p>
                                <p className="text-3xl font-bold text-red-600 mt-1">{historySummary.totalAbsent}</p>
                            </div>
                            <div className="rounded-xl border p-4 shadow-sm bg-orange-50 border-orange-200">
                                <p className="text-xs text-muted-foreground">Tổng suất chay</p>
                                <p className="text-3xl font-bold text-orange-600 mt-1">{historySummary.totalVeg}</p>
                            </div>
                        </div>
                    )}

                    {/* History table */}
                    {historyLoading ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3" />
                            Đang tải dữ liệu...
                        </div>
                    ) : historyRecords.length === 0 ? (
                        <div className="bg-muted/30 rounded-xl border p-8 text-center text-muted-foreground">
                            <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">Chưa có dữ liệu trong khoảng thời gian này</p>
                            <p className="text-sm mt-1">Paste dữ liệu Zalo ở tab &quot;Nhập &amp; Phân tích&quot; rồi bấm Lưu vào DB</p>
                        </div>
                    ) : (
                        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
                                <History className="h-4 w-4 text-muted-foreground" />
                                <span className="font-semibold text-sm">
                                    Lịch sử Headcount — {historyRecords.length} bản ghi
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-muted/60 text-left text-xs text-muted-foreground uppercase tracking-wide">
                                            <th className="px-3 py-2.5 font-semibold">#</th>
                                            <th className="px-3 py-2.5 font-semibold">Ngày</th>
                                            <th className="px-3 py-2.5 font-semibold">Bộ phận</th>
                                            <th className="px-3 py-2.5 font-semibold">Ca</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">CT HĐ</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">CT Vắng</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">TV HĐ</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">TV Vắng</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">OT</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">🥦 Chay</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {historyRecords.map((r, i) => (
                                            <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                                                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                                                    {format(parseISO(r.work_date), "dd/MM/yyyy")}
                                                </td>
                                                <td className="px-3 py-2 font-medium whitespace-nowrap">
                                                    {r.department_id
                                                        ? (deptList.find(d => d.id === r.department_id)?.name_en ?? r.department_name)
                                                        : r.department_name}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                        Ca {r.shift}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold text-green-700">{r.official_present || "—"}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <span className={r.official_absent > 0 ? "font-bold text-red-600" : "text-muted-foreground"}>
                                                        {r.official_absent || "—"}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right">{r.seasonal_present || "—"}</td>
                                                <td className="px-3 py-2 text-right">{r.seasonal_absent || "—"}</td>
                                                <td className="px-3 py-2 text-right text-xs">{r.ot_count || "—"}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {r.vegetarian > 0 ? (
                                                        <span className="font-semibold text-emerald-600">{r.vegetarian}</span>
                                                    ) : <span className="text-muted-foreground">—</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-muted/60 font-bold border-t-2 text-sm">
                                            <td colSpan={4} className="px-3 py-2.5">TỔNG</td>
                                            <td className="px-3 py-2.5 text-right text-green-700">
                                                {historyRecords.reduce((s, r) => s + r.official_present, 0)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-red-600">
                                                {historyRecords.reduce((s, r) => s + r.official_absent, 0)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                {historyRecords.reduce((s, r) => s + r.seasonal_present, 0)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                {historyRecords.reduce((s, r) => s + r.seasonal_absent, 0)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                {historyRecords.reduce((s, r) => s + r.ot_count, 0)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-emerald-600">
                                                {historyRecords.reduce((s, r) => s + r.vegetarian, 0) || "—"}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
