"use client"

import { useEffect, useState, useRef } from "react"


// ── Personalized greetings per dept code ────────────────────────────────────
const DEPT_GREETINGS: Record<string, { salute: string; emoji: string }> = {
    CS:      { salute: "Chào chị Kiều!",       emoji: "👸" },
    PEEL_MC: { salute: "Chào Mr. Triều!",       emoji: "💪" },
    SHELL:   { salute: "Chào Mr. Song Duy!",    emoji: "🤝" },
    STEAM:   { salute: "Chào Mr. Thần Nổ Hủ!", emoji: "💥" },
    PACK:    { salute: "Chào Anh Shipper!",     emoji: "📦" },
    FGWH:    { salute: "Chào Tú!",              emoji: "📫" },
    RCN:     { salute: "Chào Thánh Nổ Hủ!",    emoji: "🔥" },
}

export function DashboardLoader({
    isLoading,
    deptCode,
    userName,
}: {
    isLoading: boolean
    deptCode?: string
    userName?: string
}) {
    const [visible, setVisible] = useState(true)
    const [fadeOut, setFadeOut] = useState(false)
    const isFirstLoad = useRef(true)


    useEffect(() => {
        if (isLoading) {
            setVisible(true)
            setFadeOut(false)
        } else {
            setFadeOut(true)
            const t = setTimeout(() => {
                setVisible(false)
                isFirstLoad.current = false
            }, 600)
            return () => clearTimeout(t)
        }
    }, [isLoading])

    if (!visible) return null

    const isRefresh = !isFirstLoad.current
    const greeting = deptCode ? DEPT_GREETINGS[deptCode] : null


    return (
        <div
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
            style={{
                background: isRefresh
                    ? "rgba(255,255,255,0.82)"
                    : "rgba(255,255,255,1)",
                backdropFilter: isRefresh ? "blur(6px)" : "none",
                WebkitBackdropFilter: isRefresh ? "blur(6px)" : "none",
                transition: "opacity 0.5s ease",
                opacity: fadeOut ? 0 : 1,
                pointerEvents: fadeOut ? "none" : "all",
            }}
        >
            {/* Radial glow — only on first load */}
            {!isRefresh && (
                <div
                    className="absolute inset-0"
                    style={{
                        background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(192,57,43,0.05) 0%, transparent 70%)",
                    }}
                />
            )}

            {/* Logo + pulse rings */}
            <div className="relative flex items-center justify-center mb-6">
                <span
                    className="absolute rounded-[28px]"
                    style={{
                        width: 148,
                        height: 148,
                        border: "2px solid rgba(192,57,43,0.2)",
                        animation: "pulse-ring 2s ease-out infinite",
                    }}
                />
                <span
                    className="absolute rounded-[28px]"
                    style={{
                        width: 148,
                        height: 148,
                        border: "2px solid rgba(192,57,43,0.1)",
                        animation: "pulse-ring 2s ease-out infinite 0.6s",
                    }}
                />
                <div
                    className="relative rounded-[24px] overflow-hidden bg-white"
                    style={{
                        width: 120,
                        height: 120,
                        animation: "logo-breathe 2.4s ease-in-out infinite",
                        boxShadow: "0 8px 32px rgba(192,57,43,0.2)",
                    }}
                >
                    <img
                        src="/assets/intersnack-custom.jpg"
                        alt="Intersnack"
                        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    />
                </div>
            </div>

            {/* Brand text */}
            <div className="text-center mb-5">
                <p className="text-2xl font-black tracking-wide" style={{ color: "#5a3825", letterSpacing: "0.04em" }}>
                    Intersnack
                </p>
                <p className="text-xs text-slate-400 mt-1 font-medium tracking-widest uppercase">
                    {isRefresh ? "Đang cập nhật..." : "Factory Dashboard"}
                </p>
            </div>

            {/* ── Personalized greeting (first load only) ── */}
            {!isRefresh && greeting && (
                <div
                    className="mb-5 px-6 py-2.5 rounded-2xl text-center"
                    style={{
                        background: "linear-gradient(135deg, rgba(192,57,43,0.06) 0%, rgba(192,57,43,0.02) 100%)",
                        border: "1px solid rgba(192,57,43,0.12)",
                        animation: "slide-up 0.5s ease 0.3s both",
                    }}
                >
                    <p className="text-base font-bold" style={{ color: "#C0392B" }}>
                        {greeting.emoji} {greeting.salute}
                    </p>
                </div>
            )}

            {/* Progress bar */}
            <div className="w-48 h-[3px] bg-slate-100 rounded-full overflow-hidden">
                <div
                    style={{
                        height: "100%",
                        borderRadius: "9999px",
                        background: "linear-gradient(90deg, #C0392B, #e05a4b)",
                        animation: "progress-fill 1.8s ease-in-out infinite",
                    }}
                />
            </div>
            <p className="text-[11px] text-slate-400 mt-3 font-medium animate-pulse">
                Đang tải dữ liệu...
            </p>

            <style>{`
                @keyframes pulse-ring {
                    0%   { transform: scale(1);    opacity: 0.8; }
                    70%  { transform: scale(1.38); opacity: 0; }
                    100% { transform: scale(1.38); opacity: 0; }
                }
                @keyframes logo-breathe {
                    0%, 100% { transform: scale(1);    box-shadow: 0 8px 32px rgba(192,57,43,0.18); }
                    50%       { transform: scale(1.04); box-shadow: 0 14px 44px rgba(192,57,43,0.30); }
                }
                @keyframes progress-fill {
                    0%   { width: 0%;   margin-left: 0; }
                    50%  { width: 70%;  margin-left: 0; }
                    80%  { width: 70%;  margin-left: 30%; }
                    100% { width: 0%;   margin-left: 100%; }
                }
                @keyframes slide-up {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
