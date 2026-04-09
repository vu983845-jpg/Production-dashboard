"use client"

import { useState, useRef, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Bot, Send, Loader2, Check, AlertCircle, Sparkles, RotateCcw, RefreshCw } from "lucide-react"
import { format } from "date-fns"

interface MealRow {
    date: string
    dept_code: string
    dept_lookup?: string   // For HPEEL sub-codes: the real dept code to look up
    dept_display: string
    shift: string
    official_present: number | null
    seasonal_present: number | null
    official_absent: number | null
    seasonal_absent: number | null
    ot_count: number | null
    vegetarian: number | null
    ot_vegetarian: number | null
    ot_only?: boolean      // True when message only reports OT headcount
}

interface DiffRow {
    row: MealRow
    existing: Record<string, number>
    deptId: string
}

interface Message {
    role: "user" | "assistant"
    content: string
    rows?: MealRow[]
    confirmed?: boolean
    // For update-confirm messages
    diffRows?: DiffRow[]
    updateConfirmed?: boolean
}

interface Props {
    deptList: { id: string; code: string; name_en: string }[]
    onSaveSuccess?: () => void
}

const SUGGESTIONS = [
    "Ca 1 hôm nay: SHELL 45, STEAM 30, PEEL 20",
    "Ca 2 ngày hôm qua: QC 12 chính thức 5 thời vụ",
    "Ca 3: BORMA 8, PACK 15, CS 10",
    "Tổng hợp ca 1 hôm nay toàn nhà máy",
]

const INITIAL_MSG: Message = {
    role: "assistant",
    content: "Xin chào! Nhập báo cơm bằng ngôn ngữ tự nhiên — tôi sẽ parse và hiển thị bảng để bạn xác nhận trước khi lưu.\n\nVí dụ: *Ca 1 hôm nay: SHELL 45, STEAM 30, PEEL 20 chính thức*",
}

const NUM_FIELDS = ["official_present", "seasonal_present", "official_absent", "seasonal_absent", "ot_count", "vegetarian", "ot_vegetarian"] as const

function isSameData(row: MealRow, existing: Record<string, number>) {
    return NUM_FIELDS.every(f => (row[f] ?? 0) === (existing[f] ?? 0))
}

// Validation helpers
function isFutureDate(dateStr: string): boolean {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const d = new Date(dateStr)
    d.setHours(0, 0, 0, 0)
    return d > today
}

function getShiftWarning(row: MealRow): string | null {
    const code = (row.dept_lookup ?? row.dept_code).toUpperCase()
    const shift = row.shift
    if (code === 'OFFICE' && shift !== '1')
        return `⚠️ Office chỉ làm Ca 1 — Ca ${shift} có vẻ sai`
    if (code === 'FGWH' && shift !== '1' && shift !== 'OT')
        return `⚠️ FGWH chỉ Ca 1 (hoặc OT) — Ca ${shift} có vẻ sai`
    return null
}

export function MealAiChat({ deptList, onSaveSuccess }: Props) {
    const supabase = createClient()
    const [input, setInput] = useState("")
    const [messages, setMessages] = useState<Message[]>([INITIAL_MSG])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState<string | null>(null)
    const [saveResults, setSaveResults] = useState<Record<string, "ok" | "err">>({})
    const endRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    const findDeptId = (row: MealRow) => {
        // HPEEL sub-groups (HPEEL_LIEN, HPEEL_DUNG, HPEEL_GRADING) use HPEEL dept_id
        const lookupCode = row.dept_lookup ?? row.dept_code
        return deptList.find(d => d.code === lookupCode)?.id ?? null
    }

    const buildPayload = (row: MealRow, deptId: string) => ({
        work_date: row.date,
        department_id: deptId,
        department_name: row.dept_display,
        shift: row.shift,
        official_present: row.official_present ?? 0,
        official_absent: row.official_absent ?? 0,
        seasonal_present: row.seasonal_present ?? 0,
        seasonal_absent: row.seasonal_absent ?? 0,
        ot_count: row.ot_count ?? 0,
        vegetarian: row.vegetarian ?? 0,
        ot_vegetarian: row.ot_vegetarian ?? 0,
    })

    const doInsert = async (row: MealRow, deptId: string) =>
        supabase.from("meal_headcount").upsert(buildPayload(row, deptId), {
            onConflict: "work_date,department_name,shift",
            ignoreDuplicates: false,
        })

    const doUpdate = async (row: MealRow, deptId: string) =>
        supabase.from("meal_headcount")
            .update(buildPayload(row, deptId))
            .eq("work_date", row.date)
            .eq("department_id", deptId)
            .eq("shift", row.shift)
            .eq("department_name", row.dept_display)

    const sendMessage = async (overrideInput?: string) => {
        const text = (overrideInput ?? input).trim()
        if (!text || loading) return
        setInput("")

        const newMessages: Message[] = [...messages, { role: "user", content: text }]
        setMessages(newMessages)
        setLoading(true)

        try {
            const history = newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
            const res = await fetch("/api/ai-meal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text, history }),
            })
            const data = await res.json()
            setMessages(prev => [...prev, {
                role: "assistant",
                content: data.message || "Đã xử lý.",
                rows: data.rows ?? undefined,
            }])
        } catch {
            setMessages(prev => [...prev, { role: "assistant", content: "❌ Lỗi kết nối. Thử lại!" }])
        } finally {
            setLoading(false)
        }
    }

    // Main confirm: check existing before saving
    const handleConfirm = async (msgIdx: number, rows: MealRow[]) => {
        const key = `msg-${msgIdx}`
        setSaving(key)

        const toInsert: { row: MealRow; deptId: string }[] = []
        const toUpdate: DiffRow[] = []
        const alreadySame: string[] = []
        const notFound: string[] = []

        for (const row of rows) {
            const deptId = findDeptId(row)
            if (!deptId) { notFound.push(row.dept_code); continue }

            // Check existing record
            const { data: existing } = await supabase
                .from("meal_headcount")
                .select("official_present,seasonal_present,official_absent,seasonal_absent,ot_count,vegetarian,ot_vegetarian")
                .eq("work_date", row.date)
                .eq("department_id", deptId)
                .eq("shift", row.shift)
                .eq("department_name", row.dept_display)
                .maybeSingle()

            if (!existing) {
                // For new insert, any null becomes 0
                const insertRow = {
                    ...row,
                    official_present: row.official_present ?? 0,
                    seasonal_present: row.seasonal_present ?? 0,
                    official_absent: row.official_absent ?? 0,
                    seasonal_absent: row.seasonal_absent ?? 0,
                    ot_count: row.ot_count ?? 0,
                    vegetarian: row.vegetarian ?? 0,
                    ot_vegetarian: row.ot_vegetarian ?? 0,
                }
                toInsert.push({ row: insertRow, deptId })
            } else if (row.ot_only) {
                // OT-only update: keep all non-OT fields from existing, ACCUMULATE OT fields
                const existingOtCount = (existing as Record<string, number>).ot_count ?? 0
                const existingOtVeg = (existing as Record<string, number>).ot_vegetarian ?? 0
                const merged: MealRow = {
                    ...row,
                    official_present: (existing as Record<string, number>).official_present ?? 0,
                    seasonal_present: (existing as Record<string, number>).seasonal_present ?? 0,
                    official_absent: (existing as Record<string, number>).official_absent ?? 0,
                    seasonal_absent: (existing as Record<string, number>).seasonal_absent ?? 0,
                    vegetarian: (existing as Record<string, number>).vegetarian ?? 0,
                    // Accumulate OT fields instead of overwriting
                    ot_count: existingOtCount + (row.ot_count ?? 0),
                    ot_vegetarian: existingOtVeg + (row.ot_vegetarian ?? 0),
                }
                if (isSameData(merged, existing as Record<string, number>)) {
                    alreadySame.push(`${row.dept_display} Ca${row.shift}`)
                } else {
                    toUpdate.push({ row: merged, existing: existing as Record<string, number>, deptId })
                }
            } else {
                // Smart merge: if row field is null, KEEP existing field value
                const merged: MealRow = {
                    ...row,
                    official_present: row.official_present ?? (existing as Record<string, number>).official_present ?? 0,
                    seasonal_present: row.seasonal_present ?? (existing as Record<string, number>).seasonal_present ?? 0,
                    official_absent: row.official_absent ?? (existing as Record<string, number>).official_absent ?? 0,
                    seasonal_absent: row.seasonal_absent ?? (existing as Record<string, number>).seasonal_absent ?? 0,
                    ot_count: row.ot_count ?? (existing as Record<string, number>).ot_count ?? 0,
                    vegetarian: row.vegetarian ?? (existing as Record<string, number>).vegetarian ?? 0,
                    ot_vegetarian: row.ot_vegetarian ?? (existing as Record<string, number>).ot_vegetarian ?? 0,
                }

                if (isSameData(merged, existing as Record<string, number>)) {
                    alreadySame.push(`${row.dept_display} Ca${row.shift}`)
                } else {
                    toUpdate.push({ row: merged, existing: existing as Record<string, number>, deptId })
                }
            }
        }

        // Save new records immediately
        const errors: string[] = []
        for (const { row, deptId } of toInsert) {
            const { error } = await doInsert(row, deptId)
            if (error) errors.push(`${row.dept_display} Ca${row.shift}: ${error.message}`)
        }

        setSaving(null)
        setMessages(prev => prev.map((m, i) => i === msgIdx ? { ...m, confirmed: true } : m))
        setSaveResults(prev => ({ ...prev, [key]: errors.length === 0 ? "ok" : "err" }))

        // Build summary message
        const lines: string[] = []
        if (toInsert.length > 0 && errors.length === 0)
            lines.push(`✅ Đã lưu mới: ${toInsert.map(x => `${x.row.dept_display} Ca${x.row.shift}`).join(", ")}`)
        if (errors.length > 0)
            lines.push(`❌ Lỗi khi lưu:\n${errors.join("\n")}`)
        if (alreadySame.length > 0)
            lines.push(`ℹ️ Đã có dữ liệu giống hệt, bỏ qua: ${alreadySame.join(", ")}`)
        if (notFound.length > 0)
            lines.push(`⚠️ Không tìm thấy bộ phận: ${notFound.join(", ")}`)

        if (toUpdate.length > 0) {
            lines.push(`🔄 ${toUpdate.length} dòng có số liệu khác — xem bên dưới để xác nhận cập nhật.`)
        }

        setMessages(prev => [...prev, {
            role: "assistant",
            content: lines.join("\n") || "Đã xử lý.",
            diffRows: toUpdate.length > 0 ? toUpdate : undefined,
        }])

        if (toInsert.length > 0 || alreadySame.length > 0) onSaveSuccess?.()
    }

    // Confirm update for diffRows
    const handleConfirmUpdate = async (msgIdx: number, diffRows: DiffRow[]) => {
        const key = `update-${msgIdx}`
        setSaving(key)
        const errors: string[] = []
        for (const { row, deptId } of diffRows) {
            const { error } = await doUpdate(row, deptId)
            if (error) errors.push(`${row.dept_display} Ca${row.shift}: ${error.message}`)
        }
        setSaving(null)
        setMessages(prev => prev.map((m, i) => i === msgIdx ? { ...m, updateConfirmed: true } : m))
        setMessages(prev => [...prev, {
            role: "assistant",
            content: errors.length === 0
                ? `✅ Đã cập nhật ${diffRows.length} dòng thành công!`
                : `❌ Lỗi:\n${errors.join("\n")}`,
        }])
        onSaveSuccess?.()
    }

    const handleRejectUpdate = (msgIdx: number) => {
        setMessages(prev => prev.map((m, i) => i === msgIdx ? { ...m, updateConfirmed: true } : m))
        setMessages(prev => [...prev, { role: "assistant", content: "↩️ Đã bỏ qua cập nhật. Số liệu cũ được giữ nguyên." }])
    }

    const handleReject = (msgIdx: number) => {
        setMessages(prev => [
            ...prev.map((m, i) => i === msgIdx ? { ...m, confirmed: true } : m),
            { role: "assistant", content: "❌ Đã huỷ. Nhập lại hoặc điều chỉnh thông tin." },
        ])
    }

    const handleReset = () => {
        setMessages([INITIAL_MSG])
        setSaveResults({})
        setInput("")
    }

    return (
        <div className="rounded-2xl border border-orange-200/70 bg-white shadow-xl shadow-orange-100/40 overflow-hidden flex flex-col" style={{ minHeight: 560 }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 text-white">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
                        <Bot className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="font-bold text-base flex items-center gap-2">
                            AI Nhập Báo Cơm
                            <Sparkles className="h-4 w-4 opacity-80" />
                        </p>
                        <p className="text-white/75 text-xs">Nhập bằng ngôn ngữ tự nhiên · Xem bảng preview · Xác nhận lưu</p>
                    </div>
                </div>
                <button
                    onClick={handleReset}
                    title="Bắt đầu lại"
                    className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/15 transition-colors border border-white/20"
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                </button>
            </div>

            {/* Quick suggestions */}
            <div className="px-4 py-2.5 border-b border-orange-100/80 bg-orange-50/40 flex items-center gap-2 overflow-x-auto shrink-0">
                <span className="text-xs text-orange-500 font-bold shrink-0">Gợi ý:</span>
                {SUGGESTIONS.map(s => (
                    <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        disabled={loading}
                        className="shrink-0 text-xs px-3 py-1.5 bg-white text-orange-600 rounded-full border border-orange-200 hover:bg-orange-100 hover:border-orange-400 transition-all font-medium shadow-sm disabled:opacity-50"
                    >
                        {s.length > 40 ? s.slice(0, 40) + "…" : s}
                    </button>
                ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-orange-50/20 to-white/60">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.role === "assistant" && (
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                <Bot className="h-4 w-4 text-white" />
                            </div>
                        )}

                        <div className={`max-w-[90%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                            {/* Bubble */}
                            <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                                msg.role === "user"
                                    ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-tr-sm shadow-md shadow-orange-200"
                                    : "bg-white border border-slate-200/80 text-slate-800 rounded-tl-sm shadow-sm"
                            }`}>
                                {msg.content.split(/(\*[^*]+\*)/g).map((part, i) =>
                                    part.startsWith("*") && part.endsWith("*")
                                        ? <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>
                                        : part
                                )}
                            </div>

                            {/* Preview Table (new records) */}
                            {msg.rows && msg.rows.length > 0 && !msg.confirmed && (
                                <div className="w-full bg-white border border-orange-200/80 rounded-xl overflow-hidden shadow-md">
                                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-2.5 border-b border-orange-100 flex items-center justify-between">
                                        <p className="text-sm font-bold text-orange-700">📋 Preview — {msg.rows.length} dòng chờ xác nhận</p>
                                        <p className="text-xs text-orange-500">Kiểm tra trước khi lưu</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        {msg.rows.some(r => isFutureDate(r.date)) && (
                                            <div className="mx-4 mt-3 mb-1 flex items-start gap-2 bg-red-50 border border-red-300 rounded-xl px-4 py-2.5 text-sm text-red-700 font-semibold">
                                                <span className="text-lg">🚨</span>
                                                <div>
                                                    <div>Phát hiện ngày trong tương lai!</div>
                                                    <div className="font-normal text-xs text-red-500 mt-0.5">Bạn không bao giờ báo trước 1 ngày — hãy kiểm tra lại ngày tháng.</div>
                                                </div>
                                            </div>
                                        )}
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50/80 text-slate-500 text-xs font-bold uppercase tracking-wide">
                                                    <th className="px-4 py-2.5 text-left">Ngày</th>
                                                    <th className="px-4 py-2.5 text-left">Bộ phận</th>
                                                    <th className="px-4 py-2.5 text-center">Ca</th>
                                                    <th className="px-4 py-2.5 text-center">Chính thức</th>
                                                    <th className="px-4 py-2.5 text-center">Thời vụ</th>
                                                    <th className="px-4 py-2.5 text-center">OT</th>
                                                    <th className="px-4 py-2.5 text-center">🥬 Chay</th>
                                                    <th className="px-4 py-2.5 text-center">🥬 Chay OT</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {msg.rows.map((r, ri) => {
                                                    const futureDate = isFutureDate(r.date)
                                                    const shiftWarn = getShiftWarning(r)
                                                    const rowBg = futureDate
                                                        ? 'bg-red-50 border-l-4 border-red-400'
                                                        : shiftWarn
                                                        ? 'bg-amber-50 border-l-4 border-amber-400'
                                                        : ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                                                    return (
                                                    <tr key={ri} className={`border-t border-slate-100 ${rowBg} hover:opacity-90`}>
                                                        <td className={`px-4 py-3 font-mono font-medium ${futureDate ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                                                            {format(new Date(r.date), "dd/MM/yyyy")}
                                                            {futureDate && <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">TƯƠNG LAI ⚠️</span>}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="font-semibold text-slate-800">{r.dept_display}</span>
                                                            <span className="ml-2 text-xs text-slate-400 font-mono">({r.dept_code})</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className={`rounded-lg px-2.5 py-1 font-bold text-xs ${shiftWarn ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                Ca {r.shift}
                                                            </span>
                                                            {shiftWarn && <div className="text-[10px] text-amber-600 mt-0.5">{shiftWarn}</div>}
                                                        </td>
                                                        <td className="px-4 py-3 text-center font-bold text-slate-800 text-base">{r.official_present ?? <span className="text-slate-300">-</span>}</td>
                                                        <td className="px-4 py-3 text-center text-slate-600">{r.seasonal_present ?? <span className="text-slate-300">-</span>}</td>
                                                        <td className="px-4 py-3 text-center text-slate-600">
                                                            {r.ot_count == null && r.ot_vegetarian == null ? <span className="text-slate-300">-</span> : (r.ot_count ?? 0) + (r.ot_vegetarian ?? 0)}
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-green-600 font-medium">{r.vegetarian ?? <span className="text-slate-300">-</span>}</td>
                                                        <td className="px-4 py-3 text-center text-emerald-700 font-medium">
                                                             {r.ot_vegetarian ?? <span className="text-slate-300">-</span>}
                                                             {r.ot_only && <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold align-middle">OT only</span>}
                                                         </td>
                                                    </tr>
                                                    )
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="border-t-2 border-orange-200 bg-orange-50/80">
                                                    <td colSpan={3} className="px-4 py-2 text-xs font-bold text-orange-700">TỔNG</td>
                                                    <td className="px-4 py-2 text-center font-bold text-orange-800">{msg.rows.reduce((s, r) => s + (r.official_present ?? 0), 0)}</td>
                                                    <td className="px-4 py-2 text-center font-bold text-orange-800">{msg.rows.reduce((s, r) => s + (r.seasonal_present ?? 0), 0)}</td>
                                                    <td className="px-4 py-2 text-center font-bold text-orange-800">{msg.rows.reduce((s, r) => s + (r.ot_count ?? 0) + (r.ot_vegetarian ?? 0), 0)}</td>
                                                    <td className="px-4 py-2 text-center font-bold text-green-700">{msg.rows.reduce((s, r) => s + (r.vegetarian ?? 0), 0)}</td>
                                                    <td className="px-4 py-2 text-center font-bold text-emerald-700">{msg.rows.reduce((s, r) => s + (r.ot_vegetarian ?? 0), 0)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    <div className="flex gap-3 p-4 border-t border-orange-100 bg-orange-50/50">
                                        <button
                                            onClick={() => handleConfirm(idx, msg.rows!)}
                                            disabled={saving === `msg-${idx}`}
                                            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 shadow-md shadow-orange-200 text-sm"
                                        >
                                            {saving === `msg-${idx}` ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</>
                                            ) : (
                                                <><Check className="h-4 w-4" /> Xác nhận lưu {msg.rows.length} dòng</>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleReject(idx)}
                                            disabled={saving === `msg-${idx}`}
                                            className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-red-500 border border-slate-200 hover:border-red-200 rounded-xl transition-colors bg-white"
                                        >
                                            Huỷ
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Diff Table (update confirmation) */}
                            {msg.diffRows && msg.diffRows.length > 0 && !msg.updateConfirmed && (
                                <div className="w-full bg-white border border-amber-300 rounded-xl overflow-hidden shadow-md">
                                    <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-200 flex items-center gap-2">
                                        <RefreshCw className="h-4 w-4 text-amber-600" />
                                        <p className="text-sm font-bold text-amber-700">Số liệu khác — có muốn cập nhật?</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50/80 text-slate-500 text-xs font-bold uppercase">
                                                    <th className="px-3 py-2 text-left">Bộ phận / Ca</th>
                                                    <th className="px-3 py-2 text-center">Chính thức</th>
                                                    <th className="px-3 py-2 text-center">Thời vụ</th>
                                                    <th className="px-3 py-2 text-center">OT</th>
                                                    <th className="px-3 py-2 text-center">Chay</th>
                                                    <th className="px-3 py-2 text-center">Chay OT</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {msg.diffRows.map((d, di) => (
                                                    <tr key={di} className="border-t border-slate-100">
                                                        <td className="px-3 py-2">
                                                            <span className="font-semibold">{d.row.dept_display}</span>
                                                            <span className="ml-1 text-xs bg-orange-100 text-orange-700 rounded px-1.5 py-0.5">Ca {d.row.shift}</span>
                                                            <div className="text-xs text-slate-400">{format(new Date(d.row.date), "dd/MM/yyyy")}</div>
                                                        </td>
                                                        {/* Chính thức */}
                                                        {(() => { const o = d.existing.official_present ?? 0; const n = d.row.official_present ?? 0; const c = o !== n; return (<td className="px-3 py-2 text-center">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{n}</span></div> : <span className="text-slate-500">{n}</span>}</td>) })()}
                                                        {/* Thời vụ */}
                                                        {(() => { const o = d.existing.seasonal_present ?? 0; const n = d.row.seasonal_present ?? 0; const c = o !== n; return (<td className="px-3 py-2 text-center">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{n}</span></div> : <span className="text-slate-500">{n}</span>}</td>) })()}
                                                        {/* OT = total (ot_count + ot_vegetarian) */}
                                                        {(() => { const o = (d.existing.ot_count ?? 0) + (d.existing.ot_vegetarian ?? 0); const n = (d.row.ot_count ?? 0) + (d.row.ot_vegetarian ?? 0); const c = o !== n; return (<td className="px-3 py-2 text-center">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{n}</span></div> : <span className="text-slate-500">{n}</span>}</td>) })()}
                                                        {/* Chay */}
                                                        {(() => { const o = d.existing.vegetarian ?? 0; const n = d.row.vegetarian ?? 0; const c = o !== n; return (<td className="px-3 py-2 text-center">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-amber-700 bg-amber-50 rounded px-1.5">{n}</span></div> : <span className="text-slate-500">{n}</span>}</td>) })()}
                                                        {/* Chay OT */}
                                                        {(() => { const o = d.existing.ot_vegetarian ?? 0; const n = d.row.ot_vegetarian ?? 0; const c = o !== n; return (<td className="px-3 py-2 text-center text-emerald-700">{c ? <div className="flex flex-col items-center gap-0.5"><span className="line-through text-slate-400 text-xs">{o}</span><span className="font-bold text-emerald-700 bg-emerald-50 rounded px-1.5">{n}</span></div> : <span>{n}</span>}</td>) })()}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="flex gap-3 p-4 border-t border-amber-100 bg-amber-50/40">
                                        <button
                                            onClick={() => handleConfirmUpdate(idx, msg.diffRows!)}
                                            disabled={saving === `update-${idx}`}
                                            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-60 shadow-sm text-sm"
                                        >
                                            {saving === `update-${idx}` ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" /> Đang cập nhật...</>
                                            ) : (
                                                <><RefreshCw className="h-4 w-4" /> Cập nhật {msg.diffRows.length} dòng</>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleRejectUpdate(idx)}
                                            disabled={saving === `update-${idx}`}
                                            className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl bg-white"
                                        >
                                            Giữ nguyên
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Confirmed badge */}
                            {msg.rows && msg.confirmed && (
                                <div className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full ${
                                    saveResults[`msg-${idx}`] === "ok"
                                        ? "bg-green-50 text-green-600 border border-green-200"
                                        : "bg-slate-100 text-slate-500"
                                }`}>
                                    {saveResults[`msg-${idx}`] === "ok"
                                        ? <><Check className="h-3 w-3" /> Đã xử lý</>
                                        : <><AlertCircle className="h-3 w-3" /> Đã xử lý</>
                                    }
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                    <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0 shadow-sm">
                            <Bot className="h-4 w-4 text-white" />
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-5 py-3 shadow-sm">
                            <div className="flex gap-1.5 items-center h-5">
                                {[0, 150, 300].map(delay => (
                                    <div key={delay} className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-orange-100 p-4 bg-white shrink-0">
                <div className="flex gap-3 items-end">
                    <div className="flex-1 relative">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    sendMessage()
                                }
                            }}
                            placeholder='Nhập báo cơm... VD: "Ca 1 hôm nay: SHELL 45, STEAM 30, PEEL 20 chính thức, 10 thời vụ"'
                            rows={2}
                            className="w-full text-sm px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-400 focus:ring-3 focus:ring-orange-100 outline-none transition-all bg-slate-50/50 resize-none leading-relaxed placeholder:text-slate-400"
                        />
                        <p className="absolute bottom-2 right-3 text-[10px] text-slate-400">Enter để gửi · Shift+Enter xuống dòng</p>
                    </div>
                    <button
                        onClick={() => sendMessage()}
                        disabled={!input.trim() || loading}
                        className="h-[72px] w-14 flex items-center justify-center bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-xl hover:opacity-90 transition-all disabled:opacity-40 shadow-md shadow-orange-200 hover:scale-105 active:scale-95"
                    >
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    </button>
                </div>
            </div>
        </div>
    )
}


