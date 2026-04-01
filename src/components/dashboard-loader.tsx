"use client"

import { useEffect, useState } from "react"

export function DashboardLoader({ isLoading }: { isLoading: boolean }) {
    const [visible, setVisible] = useState(true)
    const [fadeOut, setFadeOut] = useState(false)

    useEffect(() => {
        if (!isLoading) {
            // Start fade-out after data is ready
            setFadeOut(true)
            const t = setTimeout(() => setVisible(false), 600)
            return () => clearTimeout(t)
        }
    }, [isLoading])

    if (!visible) return null

    return (
        <div
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
            style={{
                transition: "opacity 0.6s ease",
                opacity: fadeOut ? 0 : 1,
                pointerEvents: fadeOut ? "none" : "all",
            }}
        >
            {/* Subtle radial glow background */}
            <div
                className="absolute inset-0"
                style={{
                    background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(192,57,43,0.06) 0%, transparent 70%)",
                }}
            />

            {/* Logo + pulse ring */}
            <div className="relative flex items-center justify-center mb-8">
                {/* Outer pulse rings */}
                <span
                    className="absolute rounded-[28px]"
                    style={{
                        width: 120,
                        height: 120,
                        border: "2px solid rgba(192,57,43,0.2)",
                        animation: "pulse-ring 2s ease-out infinite",
                    }}
                />
                <span
                    className="absolute rounded-[28px]"
                    style={{
                        width: 120,
                        height: 120,
                        border: "2px solid rgba(192,57,43,0.12)",
                        animation: "pulse-ring 2s ease-out infinite 0.5s",
                    }}
                />

                {/* Logo box */}
                <div
                    className="relative rounded-[22px] shadow-xl overflow-hidden"
                    style={{
                        width: 96,
                        height: 96,
                        animation: "logo-breathe 2.4s ease-in-out infinite",
                    }}
                >
                    <img
                        src="/assets/intersnack-icon.png"
                        alt="Intersnack"
                        width={96}
                        height={96}
                        style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                    />
                </div>
            </div>

            {/* Brand name */}
            <div className="text-center mb-10">
                <p
                    className="text-2xl font-black tracking-wide"
                    style={{ color: "#5a3825", letterSpacing: "0.04em" }}
                >
                    Intersnack
                </p>
                <p className="text-xs text-slate-400 mt-1 font-medium tracking-widest uppercase">
                    Factory Dashboard
                </p>
            </div>

            {/* Progress bar */}
            <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full"
                    style={{
                        background: "linear-gradient(90deg, #C0392B, #e05a4b)",
                        animation: "progress-fill 1.8s ease-in-out infinite",
                    }}
                />
            </div>

            <p className="text-[11px] text-slate-400 mt-3 font-medium animate-pulse">
                Đang tải dữ liệu...
            </p>

            {/* Keyframe styles */}
            <style>{`
                @keyframes pulse-ring {
                    0%   { transform: scale(1);   opacity: 0.8; }
                    70%  { transform: scale(1.35); opacity: 0; }
                    100% { transform: scale(1.35); opacity: 0; }
                }
                @keyframes logo-breathe {
                    0%, 100% { transform: scale(1);    box-shadow: 0 8px 30px rgba(192,57,43,0.18); }
                    50%       { transform: scale(1.04); box-shadow: 0 12px 40px rgba(192,57,43,0.30); }
                }
                @keyframes progress-fill {
                    0%   { width: 0%; margin-left: 0; }
                    50%  { width: 70%; margin-left: 0; }
                    80%  { width: 70%; margin-left: 30%; }
                    100% { width: 0%;  margin-left: 100%; }
                }
            `}</style>
        </div>
    )
}
