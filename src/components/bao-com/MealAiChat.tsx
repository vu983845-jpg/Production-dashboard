"use client"

import { useState, useRef, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Bot, Send, X, ChevronDown, Loader2, Check, AlertCircle, Sparkles, UtensilsCrossed } from "lucide-react"
import { format } from "date-fns"

interface MealRow {
    date: string
    dept_code: string
    dept_display: string
    shift: string
    official_present: number
    seasonal_present: number
    official_absent: number
    seasonal_absent: number
    ot_count: number
    vegetarian: number
}

interface Message {
    role: "user" | "assistant"
    content: string
    rows?: MealRow[]
    confirmed?: boolean
}

interface Props {
    deptList: { id: string; code: string; name_en: string }[]
    onSaveSuccess?: () => void
}

export function MealAiChat({ deptList, onSaveSuccess }: Props) {
    const supabase = createClient()
    const [open, setOpen] = useState(false)
    const [input, setInput] = useState("")
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: "Xin chào! Tôi có thể giúp bạn nhập báo cơm nhanh hơn.\n\nVí dụ: *\"Ca 1 hôm nay: SHELL 45 người, STEAM 30 người, PEEL 20 người\"*\n\nHoặc: *\"Ca 2 ngày 02/04: QC 12 chính thức, 5 thời vụ\"*",
        },
    ])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState<string | null>(null)
    const [saveResults, setSaveResults] = useState<Record<string, "ok" | "err">>({})
    const endRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (open) {
            endRef.current?.scrollIntoView({ behavior: "smooth" })
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [messages, open])

    const findDeptId = (code: string): string | null => {
        return deptList.find(d => d.code === code)?.id ?? null
    }

    const sendMessage = async () => {
        if (!input.trim() || loading) return
        const userMsg = input.trim()
        setInput("")

        const newMessages: Message[] = [...messages, { role: "user", content: userMsg }]
        setMessages(newMessages)
        setLoading(true)

        try {
            const history = newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
            const res = await fetch("/api/ai-meal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMsg, history }),
            })
            const data = await res.json()

            setMessages(prev => [...prev, {
                role: "assistant",
                content: data.message || "Đã xử lý.",
                rows: data.rows ?? undefined,
            }])
        } catch {
            setMessages(prev => [...prev, { role: "assistant", content: "❌ Lỗi kết nối. Thử lại nhé!" }])
        } finally {
            setLoading(false)
        }
    }

    const handleConfirm = async (msgIdx: number, rows: MealRow[]) => {
        const key = `msg-${msgIdx}`
        setSaving(key)
        const errors: string[] = []

        for (const row of rows) {
            const deptId = findDeptId(row.dept_code)
            if (!deptId) { errors.push(`Không tìm thấy bộ phận: ${row.dept_code}`); continue }

            const { error } = await supabase.from("meal_headcount").upsert({
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
            }, { onConflict: "work_date,department_id,shift" })

            if (error) errors.push(`${row.dept_display} Ca${row.shift}: ${error.message}`)
        }

        setSaving(null)
        setSaveResults(prev => ({ ...prev, [key]: errors.length === 0 ? "ok" : "err" }))

        setMessages(prev => prev.map((m, i) =>
            i === msgIdx ? { ...m, confirmed: true } : m
        ))

        const resultMsg = errors.length === 0
            ? `✅ Đã lưu ${rows.length} dòng báo cơm thành công!`
            : `⚠️ Lưu xong nhưng có lỗi:\n${errors.join("\n")}`

        setMessages(prev => [...prev, { role: "assistant", content: resultMsg }])
        onSaveSuccess?.()
    }

    const handleReject = (msgIdx: number) => {
        setMessages(prev => [
            ...prev,
            {
                role: "assistant",
                content: "❌ Đã huỷ. Bạn có thể nhập lại hoặc điều chỉnh thông tin.",
            }
        ])
        // Mark as confirmed to hide buttons
        setMessages(prev => prev.map((m, i) => i === msgIdx ? { ...m, confirmed: true } : m))
    }

    return (
        <>
            {/* FAB Button */}
            <button
                onClick={() => setOpen(o => !o)}
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-3 rounded-2xl shadow-2xl shadow-orange-500/40 hover:shadow-orange-500/60 hover:scale-105 transition-all duration-300 font-bold text-sm"
            >
                <UtensilsCrossed className="h-4 w-4" />
                <span>AI Báo Cơm</span>
                <Sparkles className="h-3.5 w-3.5 opacity-80" />
            </button>

            {/* Chat Panel */}
            {open && (
                <div className="fixed bottom-20 right-6 z-50 w-[380px] max-h-[70vh] flex flex-col rounded-2xl shadow-2xl border border-orange-200/50 overflow-hidden bg-white animate-in slide-in-from-bottom-4 fade-in duration-300">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white">
                            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                                <Bot className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="font-bold text-sm">AI Nhập Báo Cơm</p>
                                <p className="text-white/70 text-xs">Nhập bằng ngôn ngữ tự nhiên</p>
                            </div>
                        </div>
                        <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-orange-50/30 min-h-0">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[92%] ${msg.role === "user" ? "order-1" : ""}`}>
                                    {/* Message bubble */}
                                    <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                                        msg.role === "user"
                                            ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-tr-sm"
                                            : "bg-white border border-slate-200/80 text-slate-800 rounded-tl-sm shadow-sm"
                                    }`}>
                                        {msg.content.split(/(\*[^*]+\*)/g).map((part, i) =>
                                            part.startsWith("*") && part.endsWith("*")
                                                ? <em key={i} className="not-italic font-semibold">{part.slice(1, -1)}</em>
                                                : part
                                        )}
                                    </div>

                                    {/* Preview table */}
                                    {msg.rows && msg.rows.length > 0 && !msg.confirmed && (
                                        <div className="mt-2 bg-white border border-orange-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-orange-50 px-3 py-2 border-b border-orange-100">
                                                <p className="text-xs font-bold text-orange-700">📋 Preview — {msg.rows.length} dòng</p>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="bg-slate-50 text-slate-500 font-semibold">
                                                            <th className="px-2 py-1.5 text-left">Ngày</th>
                                                            <th className="px-2 py-1.5 text-left">Bộ phận</th>
                                                            <th className="px-2 py-1.5 text-center">Ca</th>
                                                            <th className="px-2 py-1.5 text-center">CT</th>
                                                            <th className="px-2 py-1.5 text-center">TV</th>
                                                            <th className="px-2 py-1.5 text-center">OT</th>
                                                            <th className="px-2 py-1.5 text-center">🥬</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {msg.rows.map((r, ri) => (
                                                            <tr key={ri} className="border-t border-slate-100 hover:bg-orange-50/50 transition-colors">
                                                                <td className="px-2 py-1.5 font-mono text-slate-600">{format(new Date(r.date), "dd/MM")}</td>
                                                                <td className="px-2 py-1.5 font-semibold text-slate-800 max-w-[80px] truncate">{r.dept_display}</td>
                                                                <td className="px-2 py-1.5 text-center">
                                                                    <span className="bg-orange-100 text-orange-700 rounded-md px-1.5 py-0.5 font-bold">{r.shift}</span>
                                                                </td>
                                                                <td className="px-2 py-1.5 text-center font-bold text-slate-800">{r.official_present ?? 0}</td>
                                                                <td className="px-2 py-1.5 text-center text-slate-600">{r.seasonal_present ?? 0}</td>
                                                                <td className="px-2 py-1.5 text-center text-slate-600">{r.ot_count ?? 0}</td>
                                                                <td className="px-2 py-1.5 text-center text-green-600">{r.vegetarian ?? 0}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {/* Confirm buttons */}
                                            <div className="flex gap-2 p-2 border-t border-orange-100 bg-orange-50/50">
                                                <button
                                                    onClick={() => handleConfirm(idx, msg.rows!)}
                                                    disabled={saving === `msg-${idx}`}
                                                    className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
                                                >
                                                    {saving === `msg-${idx}` ? (
                                                        <><Loader2 className="h-3 w-3 animate-spin" /> Đang lưu...</>
                                                    ) : (
                                                        <><Check className="h-3 w-3" /> Xác nhận lưu</>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleReject(idx)}
                                                    disabled={saving === `msg-${idx}`}
                                                    className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-red-500 border border-slate-200 rounded-lg hover:border-red-200 transition-colors"
                                                >
                                                    Huỷ
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Already confirmed badge */}
                                    {msg.rows && msg.confirmed && (
                                        <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                                            {saveResults[`msg-${idx}`] === "ok"
                                                ? <><Check className="h-3 w-3 text-green-500" /> Đã lưu</>
                                                : <><AlertCircle className="h-3 w-3 text-red-400" /> Đã xử lý</>
                                            }
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm">
                                    <div className="flex gap-1 items-center">
                                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    {/* Quick suggestions */}
                    <div className="px-3 pt-2 pb-1 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto">
                        {[
                            "Ca 1 hôm nay:",
                            "Ca 2 ngày hôm qua:",
                            "Ca 3:",
                        ].map(s => (
                            <button
                                key={s}
                                onClick={() => setInput(s)}
                                className="shrink-0 text-xs px-2.5 py-1 bg-orange-50 text-orange-600 rounded-full border border-orange-200 hover:bg-orange-100 transition-colors font-medium"
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    {/* Input */}
                    <div className="px-3 pb-3 pt-1.5 bg-white flex gap-2">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                            placeholder='VD: "Ca 1: SHELL 45, STEAM 30"'
                            className="flex-1 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all bg-slate-50/50"
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || loading}
                            className="w-9 h-9 flex items-center justify-center bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 shadow-sm"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
