"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, X, Send, Loader2, CheckCircle2, ChevronDown, Maximize2, Minimize2 } from "lucide-react"

interface Message {
    role: "user" | "model"
    text: string
    isAction?: boolean
    actionSuccess?: boolean
}

interface UserContext {
    deptId: string
    deptCode: string
    deptName: string
    role: string
    fullName: string
}

interface AIChatWidgetProps {
    userContext: UserContext
}

// ── Quick action chips per dept ──────────────────────────────────────────────
const QUICK_ACTIONS: Record<string, string[]> = {
    SHELL: ["📊 Tóm tắt tháng này", "📋 Nhập kế hoạch tháng", "⚠️ Báo downtime hôm nay"],
    STEAM: ["📊 Tóm tắt tháng này", "📋 Nhập kế hoạch tháng", "⚠️ Báo downtime"],
    PEEL_MC: ["📊 Tóm tắt tháng này", "📋 Nhập kế hoạch", "⚠️ Báo downtime máy"],
    CS: ["📊 Tóm tắt tháng này", "📋 Nhập kế hoạch ISP tháng", "⚠️ Báo downtime"],
    HAND: ["📊 Tóm tắt tháng này", "📋 Nhập kế hoạch tháng", "⚠️ Báo downtime"],
    PACK: ["📊 Tóm tắt tháng này", "📋 Nhập kế hoạch tháng", "⚠️ Báo downtime"],
    BORMA: ["📊 Tóm tắt tháng này", "📋 Nhập kế hoạch", "⚠️ Báo downtime"],
    FGWH: ["📊 Tóm tắt tháng này", "📋 Nhập kế hoạch ISP/Non-ISP"],
    admin: ["📊 Tổng quan nhà máy", "📋 Nhập kế hoạch bộ phận", "⚠️ Xem downtime hôm nay"],
}

const DEPT_LABELS: Record<string, string> = {
    SHELL: "Shelling", STEAM: "Steaming", PEEL_MC: "Peeling", CS: "Color Sorting",
    HAND: "Hand Peeling", PACK: "Packing", BORMA: "Borma", FGWH: "Warehouse",
}

function buildGreeting(ctx: UserContext): Message {
    const deptLabel = DEPT_LABELS[ctx.deptCode] || ctx.deptName
    const isAdmin = ctx.role === "admin"
    const greeting = isAdmin
        ? `Xin chào **${ctx.fullName}**! 🛠️\n\nBạn đang đăng nhập với quyền **Admin**. Tôi có thể giúp bạn:\n- 📋 Nhập kế hoạch cho bất kỳ bộ phận nào\n- 📊 Xem tóm tắt sản xuất\n- ⚠️ Ghi downtime\n\nBạn muốn làm gì hôm nay?`
        : `Xin chào **${ctx.fullName}**! 👋\n\nTôi là trợ lý AI của bộ phận **${deptLabel}**. Tôi có thể giúp bạn:\n- 📋 Nhập kế hoạch sản xuất tháng\n- 📊 Cập nhật sản lượng thực tế\n- ⚠️ Báo cáo downtime\n- 📈 Xem tóm tắt sản xuất\n\nBạn muốn làm gì hôm nay?`
    return { role: "model", text: greeting }
}

// ── Simple markdown renderer ─────────────────────────────────────────────────
function renderMarkdown(text: string) {
    return text
        // Escape HTML entities first to prevent XSS
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        // Then apply markdown (safe tags inserted after escaping)
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br/>")
}

export function AIChatWidget({ userContext }: AIChatWidgetProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [hasNewMessage, setHasNewMessage] = useState(false)
    const [isGreeted, setIsGreeted] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Build history for Gemini (keep all messages, clean ACTION tags)
    const getHistory = () =>
        messages
            .map((m) => ({
                role: m.role,
                // Strip <ACTION>...</ACTION> block so Gemini history stays clean
                text: m.text.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, "").trim(),
            }))
            .filter((m) => m.text.length > 0) // skip empty entries after stripping
            .slice(-20) // last 20 turns for full context

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    useEffect(() => {
        // Show greeting when chat opens AND we have a valid userContext
        if (isOpen && !isGreeted && userContext.fullName) {
            setIsGreeted(true)
            setMessages([buildGreeting(userContext)])
        }
    }, [isOpen, userContext.fullName])

    const sendMessage = async (text?: string) => {
        const userText = (text || input).trim()
        if (!userText || isLoading) return
        setInput("")

        const userMsg: Message = { role: "user", text: userText }
        setMessages((prev) => [...prev, userMsg])
        setIsLoading(true)

        try {
            const res = await fetch("/api/ai-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userText,
                    history: getHistory(),
                    userContext,
                }),
            })
            const data = await res.json()
            if (data.error) {
                setMessages((prev) => [...prev, { role: "model", text: `❌ Lỗi: ${data.error}` }])
            } else {
                const botMsg: Message = {
                    role: "model",
                    text: data.text,
                    isAction: !!data.actionType,
                    actionSuccess: data.actionResult?.success,
                }
                setMessages((prev) => [...prev, botMsg])
                if (!isOpen) setHasNewMessage(true)
            }
        } catch {
            setMessages((prev) => [...prev, { role: "model", text: "❌ Không thể kết nối. Vui lòng thử lại." }])
        } finally {
            setIsLoading(false)
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const quickActions = QUICK_ACTIONS[userContext.deptCode] || QUICK_ACTIONS["admin"]
    const panelW = isExpanded ? "w-[420px]" : "w-[340px]"
    const panelH = isExpanded ? "h-[600px]" : "h-[480px]"

    return (
        <>
            {/* ── Floating chat panel ── */}
            <div
                className={`fixed bottom-20 right-4 ${panelW} ${panelH} z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/20 transition-all duration-300 ${isOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-6 pointer-events-none"
                    }`}
                style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)" }}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: "linear-gradient(135deg, #C0392B 0%, #8B1A1A 100%)" }}>
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm leading-none">Trợ Lý Operations</p>
                        <p className="text-white/60 text-[10px] mt-0.5 truncate">{DEPT_LABELS[userContext.deptCode] || userContext.deptName}</p>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setIsExpanded(!isExpanded)} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                            {isExpanded ? <Minimize2 className="w-3.5 h-3.5 text-white" /> : <Maximize2 className="w-3.5 h-3.5 text-white" />}
                        </button>
                        <button onClick={() => setIsOpen(false)} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                            <X className="w-3.5 h-3.5 text-white" />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            {msg.role === "model" && (
                                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                                    {msg.isAction && msg.actionSuccess ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                    ) : (
                                        <Bot className="w-3.5 h-3.5 text-red-700" />
                                    )}
                                </div>
                            )}
                            <div
                                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.role === "user"
                                    ? "bg-red-600 text-white rounded-br-sm"
                                    : msg.isAction && msg.actionSuccess
                                        ? "bg-green-50 border border-green-200 text-green-900 rounded-bl-sm"
                                        : msg.isAction && !msg.actionSuccess
                                            ? "bg-red-50 border border-red-200 text-red-900 rounded-bl-sm"
                                            : "bg-slate-100 text-slate-800 rounded-bl-sm"
                                    }`}
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                            />
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center mr-2 mt-0.5">
                                <Bot className="w-3.5 h-3.5 text-red-700" />
                            </div>
                            <div className="bg-slate-100 px-4 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                                <span className="text-xs text-slate-400">Đang xử lý...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Quick actions (show only on first open or no messages > 1) */}
                {messages.length <= 1 && (
                    <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
                        {quickActions.map((action, i) => (
                            <button
                                key={i}
                                onClick={() => sendMessage(action.replace(/^[^\s]+ /, ""))}
                                className="text-[11px] px-2.5 py-1 rounded-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors whitespace-nowrap font-medium"
                            >
                                {action}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input */}
                <div className="flex-shrink-0 px-3 pb-3 pt-1 border-t border-slate-100">
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Nhập tin nhắn... (Enter để gửi)"
                            rows={1}
                            className="flex-1 resize-none text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent bg-white placeholder-slate-400 text-slate-800 leading-relaxed"
                            style={{ minHeight: 40, maxHeight: 100 }}
                            disabled={isLoading}
                        />
                        <button
                            onClick={() => sendMessage()}
                            disabled={isLoading || !input.trim()}
                            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: "linear-gradient(135deg, #C0392B, #8B1A1A)" }}
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 text-white animate-spin" />
                            ) : (
                                <Send className="w-4 h-4 text-white" />
                            )}
                        </button>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1 text-center">AI trợ lý · Dữ liệu chỉ dành cho bộ phận của bạn</p>
                </div>
            </div>

            {/* ── Floating button ── */}
            <button
                onClick={() => { setIsOpen(!isOpen); setHasNewMessage(false) }}
                className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
                style={{ background: isOpen ? "#8B1A1A" : "linear-gradient(135deg, #C0392B 0%, #8B1A1A 100%)" }}
            >
                {isOpen ? (
                    <ChevronDown className="w-6 h-6 text-white" />
                ) : (
                    <>
                        <Bot className="w-6 h-6 text-white" />
                        {hasNewMessage && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full border-2 border-white animate-pulse" />
                        )}
                    </>
                )}
            </button>

            {/* ── Pulse ring on button (when closed) ── */}
            {!isOpen && (
                <div
                    className="fixed bottom-4 right-4 z-40 w-14 h-14 rounded-2xl pointer-events-none"
                    style={{
                        boxShadow: "0 0 0 0 rgba(192,57,43,0.4)",
                        animation: "chat-pulse 3s ease-out infinite",
                    }}
                />
            )}

            <style>{`
                @keyframes chat-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(192,57,43,0.4); }
                    50% { box-shadow: 0 0 0 14px rgba(192,57,43,0); }
                    100% { box-shadow: 0 0 0 0 rgba(192,57,43,0); }
                }
                .scrollbar-thin::-webkit-scrollbar { width: 4px; }
                .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
                .scrollbar-thumb-slate-200::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 9999px; }
            `}</style>
        </>
    )
}
