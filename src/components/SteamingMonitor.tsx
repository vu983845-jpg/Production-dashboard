"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
    LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts"

// ── Types ────────────────────────────────────────────────────────────────
interface CookerData {
    id: string
    label: string
    running: boolean
    t1: number
    t2: number
    steamPressure: number
    inputPressure: number
}

interface HistoryPoint {
    time: string
    [key: string]: number | string
}

// ── Constants ────────────────────────────────────────────────────────────
const COOKER_COLORS: Record<string, string> = {
    A: "#3b82f6",
    B: "#10b981",
    C: "#f59e0b",
    D1: "#ef4444",
    D2: "#8b5cf6",
}

const MAX_TEMP = 200
const MAX_PRESSURE = 6

const POLL_INTERVAL = 30_000 // 30s
const MAX_HISTORY = 30 // keep last 30 data points

// ── Circular Gauge component ─────────────────────────────────────────────
function TempGauge({ value, label, color }: { value: number; label: string; color: string }) {
    const pct = Math.min(value / MAX_TEMP, 1)
    const circumference = 2 * Math.PI * 38
    const offset = circumference - pct * circumference
    const isHot = value > 130
    const isWarn = value > 145

    return (
        <div className="steaming-gauge-container">
            <svg width="96" height="96" viewBox="0 0 96 96">
                {/* Glow effect */}
                <defs>
                    <filter id={`glow-${label}`} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={isWarn ? "#f59e0b" : color} />
                        <stop offset="100%" stopColor={isWarn ? "#ef4444" : "#E30613"} />
                    </linearGradient>
                </defs>
                {/* Track */}
                <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"
                    transform="rotate(-90 48 48)" strokeLinecap="round" />
                {/* Active arc */}
                <circle cx="48" cy="48" r="38" fill="none" stroke={`url(#grad-${label})`} strokeWidth="7"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    transform="rotate(-90 48 48)" strokeLinecap="round"
                    filter={isHot ? `url(#glow-${label})` : undefined}
                    className="steaming-gauge-arc" />
            </svg>
            <div className="steaming-gauge-value">
                <span className={`steaming-gauge-num ${isWarn ? 'steaming-warn' : isHot ? 'steaming-hot' : ''}`}>
                    {value.toFixed(1)}
                </span>
                <span className="steaming-gauge-unit">°C</span>
            </div>
            <span className="steaming-gauge-label">{label}</span>
        </div>
    )
}

// ── Pressure bar component ───────────────────────────────────────────────
function PressureBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
    const pct = Math.min((value / max) * 100, 100)
    const isHigh = value > max * 0.8

    return (
        <div className="steaming-pressure-row">
            <span className="steaming-pressure-label">{label}</span>
            <div className="steaming-pressure-track">
                <div
                    className={`steaming-pressure-fill ${isHigh ? 'steaming-pressure-high' : ''}`}
                    style={{ width: `${pct}%`, background: isHigh ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : `linear-gradient(90deg, ${color}, ${color}cc)` }}
                />
            </div>
            <span className="steaming-pressure-value">{value.toFixed(1)} <span className="steaming-pressure-unit">bar</span></span>
        </div>
    )
}

// ── Status badge ─────────────────────────────────────────────────────────
function StatusBadge({ running, t1 }: { running: boolean; t1: number }) {
    const isWarning = running && t1 > 145
    const status = !running ? "STOPPED" : isWarning ? "WARNING" : "RUNNING"
    const cls = !running ? "steaming-status-stopped" : isWarning ? "steaming-status-warning" : "steaming-status-running"

    return (
        <span className={`steaming-status-badge ${cls}`}>
            <span className="steaming-status-dot" />
            {status}
        </span>
    )
}

// ── Main Component ───────────────────────────────────────────────────────
export default function SteamingMonitor() {
    const [cookers, setCookers] = useState<CookerData[]>([])
    const [history, setHistory] = useState<HistoryPoint[]>([])
    const [lastUpdate, setLastUpdate] = useState("")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [deviceOnline, setDeviceOnline] = useState(true)
    const [isDemo, setIsDemo] = useState(false)
    const historyRef = useRef<HistoryPoint[]>([])

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch("/api/vnet-scrape?device=steam")
            const json = await res.json()

            if (!json.ok) {
                setError(json.error || "Failed to fetch")
                return
            }

            setIsDemo(!!json.demo)
            const data: CookerData[] = json.data?.cookers || json.cookers || []
            setCookers(data)
            setLastUpdate(new Date(json.timestamp).toLocaleTimeString("vi-VN"))
            setError(json._error || "")

            // Check if device seems online (at least one temp > 0)
            const anyActive = data.some(c => c.t1 > 30 || c.t2 > 30)
            setDeviceOnline(anyActive || data.some(c => c.running))

            // Parse DB history
            if (json.history && Array.isArray(json.history)) {
                const dbHistory: HistoryPoint[] = json.history.map((h: any) => {
                    const t = new Date(h.timestamp);
                    const pt: HistoryPoint = { 
                        time: t.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) 
                    };
                    const cData: CookerData[] = h.data?.cookers || [];
                    cData.forEach(c => {
                        pt[`${c.id}_T1`] = c.t1;
                        pt[`${c.id}_T2`] = c.t2;
                    });
                    return pt;
                });
                setHistory(dbHistory.slice(-MAX_HISTORY));
            } else {
                // Fallback to local
                const point: HistoryPoint = {
                    time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
                }
                data.forEach(c => {
                    point[`${c.id}_T1`] = c.t1
                    point[`${c.id}_T2`] = c.t2
                })
                const newHistory = [...historyRef.current, point].slice(-MAX_HISTORY)
                historyRef.current = newHistory
                setHistory(newHistory)
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, POLL_INTERVAL)
        return () => clearInterval(interval)
    }, [fetchData])

    const activeCount = cookers.filter(c => c.running).length
    const avgTemp = cookers.length > 0
        ? cookers.reduce((sum, c) => sum + (c.t1 + c.t2) / 2, 0) / cookers.length
        : 0

    if (loading && cookers.length === 0) {
        return (
            <div className="steaming-loading">
                <div className="steaming-loading-spinner" />
                <span>Connecting to V-NET2.0...</span>
            </div>
        )
    }

    return (
        <div className="steaming-root">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className="steaming-header">
                <div className="steaming-header-left">
                    <h1 className="steaming-title">
                        <svg className="steaming-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeOpacity="0.3" />
                            <path d="M8 14s1.5 2 4 2 4-2 4-2" strokeLinecap="round" />
                            <path d="M9 8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5" strokeLinecap="round" fill="none" />
                            <path d="M14 8.5c0-.83-.67-1.5-1.5-1.5" strokeLinecap="round" fill="none" />
                        </svg>
                        STEAMING MONITOR
                    </h1>
                    <span className={`steaming-device-status ${deviceOnline ? 'steaming-online' : 'steaming-offline'}`}>
                        <span className="steaming-status-dot" />
                        {deviceOnline ? "DEVICE ONLINE" : "DEVICE OFFLINE"}
                    </span>
                    {lastUpdate && (
                        <span className="steaming-last-update">
                            Last update: {lastUpdate}
                        </span>
                    )}
                </div>
                <div className="steaming-header-stats">
                    <div className="steaming-stat-box">
                        <span className="steaming-stat-value">{activeCount}</span>
                        <span className="steaming-stat-label">ACTIVE</span>
                    </div>
                    <div className="steaming-stat-box">
                        <span className="steaming-stat-value">{cookers.length - activeCount}</span>
                        <span className="steaming-stat-label">IDLE</span>
                    </div>
                    <div className="steaming-stat-box">
                        <span className="steaming-stat-value">{avgTemp.toFixed(0)}°</span>
                        <span className="steaming-stat-label">AVG TEMP</span>
                    </div>
                </div>
            </header>

            {isDemo && (
                <div className="steaming-demo-banner">
                    ⚠️ DỮ LIỆU MÔ PHỎNG — V-NET API chưa cho phép truy cập trực tiếp. Thiết bị STEAM_LA hiện offline.
                </div>
            )}
            {!isDemo && (
                <div className="steaming-demo-banner" style={{ background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981' }}>
                    ✅ DỮ LIỆU THẬT từ V-NET — {cookers.length} nồi đang được giám sát.
                </div>
            )}

            {error && !isDemo && (
                <div className="steaming-error">
                    ⚠️ {error}
                </div>
            )}

            {/* ── Cooker Cards Grid ──────────────────────────────────────────── */}
            <div className="steaming-grid">
                {cookers.map((cooker) => {
                    const color = COOKER_COLORS[cooker.id] || "#64748b"
                    return (
                        <div
                            key={cooker.id}
                            className={`steaming-card ${cooker.running ? 'steaming-card-active' : 'steaming-card-idle'}`}
                            style={{ '--cooker-color': color } as React.CSSProperties}
                        >
                            {/* Card glow */}
                            {cooker.running && <div className="steaming-card-glow" style={{ background: `${color}15` }} />}

                            {/* Header */}
                            <div className="steaming-card-header">
                                <div>
                                    <h3 className="steaming-card-title">{cooker.label}</h3>
                                    <StatusBadge running={cooker.running} t1={cooker.t1} />
                                </div>
                                <div className="steaming-cooker-icon" style={{ color }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <rect x="4" y="8" width="16" height="12" rx="2" />
                                        <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" />
                                        <path d="M8 14h8" strokeDasharray="2 2" />
                                        {cooker.running && (
                                            <>
                                                <path d="M9 4c0-1 .5-2 1-2" className="steaming-steam" opacity="0.6" />
                                                <path d="M12 4c0-1.5 .5-2.5 1-2.5" className="steaming-steam" opacity="0.4" />
                                                <path d="M15 4c0-1 .5-2 1-2" className="steaming-steam" opacity="0.6" />
                                            </>
                                        )}
                                    </svg>
                                </div>
                            </div>

                            {/* Gauges */}
                            <div className="steaming-gauges">
                                <TempGauge value={cooker.t1} label="T1" color={color} />
                                <TempGauge value={cooker.t2} label="T2" color={color} />
                            </div>

                            {/* Pressures */}
                            <div className="steaming-pressures">
                                <PressureBar value={cooker.steamPressure} max={MAX_PRESSURE} label="STEAM PRESSURE" color="#E30613" />
                                <PressureBar value={cooker.inputPressure} max={MAX_PRESSURE / 3} label="INPUT PRESSURE" color="#0ea5e9" />
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* ── Temperature Trends Chart ───────────────────────────────────── */}
            {history.length > 1 && (
                <div className="steaming-chart-card">
                    <div className="steaming-chart-header">
                        <h3 className="steaming-chart-title">TEMPERATURE TRENDS (T1)</h3>
                        <span className="steaming-chart-subtitle">Real-time telemetry · {history.length} data points</span>
                    </div>
                    <div className="steaming-chart-wrapper">
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={history} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis
                                    dataKey="time"
                                    tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, 180]}
                                    width={35}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "12px",
                                        backdropFilter: "blur(12px)",
                                        fontSize: "12px",
                                        color: "#e2e8f0",
                                    }}
                                />
                                <Legend
                                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                                    iconType="circle"
                                />
                                {Object.entries(COOKER_COLORS).map(([id, clr]) => (
                                    <Line
                                        key={id}
                                        type="monotone"
                                        dataKey={`${id}_T1`}
                                        name={`Cooker ${id}`}
                                        stroke={clr}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, strokeWidth: 2 }}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    )
}
