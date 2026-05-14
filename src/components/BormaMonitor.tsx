"use client"

import { useState, useEffect, useCallback, useRef } from "react"

// ── Types ────────────────────────────────────────────────────────────────
interface OvenData {
    id: number
    label: string
    running: boolean
    tempCtr: number               // BM{n}_TEMP_CTR – setpoint/control temp
    temps: { tag: string; value: number }[] // TI4101-{n} through TI4107-{n}, HI4101-{n}
    pid: boolean                  // BM{n}_PID
    lv1: boolean                  // BM{n}_LV1 – loading valve
    sv1: boolean                  // BM{n}_SV1 – steam valve
    lv1VL: number                 // BM{n}_LV1_VL – valve position %
    motors: boolean[]             // BM{n}_M1..M4
    gdTempSV: number              // BM{n}_GD1_TEMP_SV – guide temp setpoint
}

// ── Constants ────────────────────────────────────────────────────────────
const OVEN_COLORS = [
    "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"
]

const TEMP_BAR_COLORS = [
    "#ef4444", "#f59e0b", "#f97316", "#84cc16", "#3b82f6", "#06b6d4", "#8b5cf6", "#ec4899"
]

const SCADA_URL = "https://web.asean.v-iec.com/browse?projectId=10001417&queryId=b587a89300124115a777d6137e095372"

// ── Generate realistic demo data ─────────────────────────────────────────
function generateDemoData(): { ovens: OvenData[], humidity: number } {
    const ovens: OvenData[] = []
    for (let i = 1; i <= 6; i++) {
        const running = [1, 4, 5, 6].includes(i) // BORMA 1,4,5,6 = ON
        const baseTemp = running ? 36 + Math.random() * 6 : 28 + Math.random() * 4
        ovens.push({
            id: i,
            label: `BORMA ${i}`,
            running,
            tempCtr: Number((baseTemp + Math.random() * 2).toFixed(1)),
            temps: [
                { tag: `TI4101-${i}`, value: Number((baseTemp + Math.random() * 3 - 1).toFixed(1)) },
                { tag: `TI4102-${i}`, value: Number((baseTemp + Math.random() * 3 - 1).toFixed(1)) },
                { tag: `TI4103-${i}`, value: Number((baseTemp + Math.random() * 3 - 1).toFixed(1)) },
                { tag: `TI4104-${i}`, value: Number((baseTemp + Math.random() * 3 - 0.5).toFixed(1)) },
                { tag: `TI4105-${i}`, value: Number((baseTemp + Math.random() * 3 - 1).toFixed(1)) },
                { tag: `TI4106-${i}`, value: Number((baseTemp + Math.random() * 3 - 1).toFixed(1)) },
                { tag: `TI4107-${i}`, value: Number((baseTemp + Math.random() * 3 - 1).toFixed(1)) },
                { tag: `HI4101-${i}`, value: Number((baseTemp + Math.random() * 2 - 1).toFixed(1)) },
            ],
            pid: running,
            lv1: running,
            sv1: running,
            lv1VL: running ? Number((Math.random() * 5).toFixed(1)) : 0,
            motors: [running, running, running && Math.random() > 0.3, running && Math.random() > 0.5],
            gdTempSV: running ? Number((80 + Math.random() * 10).toFixed(1)) : 0,
        })
    }
    return { ovens, humidity: Number((90 + Math.random() * 8).toFixed(1)) }
}

// ── Temp Bar component ──────────────────────────────────────────────────
function TempBar({ tag, value, color, maxTemp = 100 }: {
    tag: string; value: number; color: string; maxTemp?: number
}) {
    const pct = Math.min((value / maxTemp) * 100, 100)
    return (
        <div className="borma-temp-bar-wrapper">
            <span className="borma-temp-value">{value}</span>
            <div className="borma-temp-bar-track">
                <div
                    className="borma-temp-bar-fill"
                    style={{
                        height: `${pct}%`,
                        background: `linear-gradient(to top, ${color}88, ${color})`,
                        boxShadow: `0 0 8px ${color}44`,
                    }}
                />
            </div>
            <span className="borma-temp-tag">{tag.replace(/-\d+$/, '')}</span>
        </div>
    )
}

// ── Oven Card ────────────────────────────────────────────────────────────
function OvenCard({ oven, color }: { oven: OvenData; color: string }) {
    const activeMotors = oven.motors.filter(Boolean).length
    return (
        <div className={`borma-card ${oven.running ? 'borma-card-on' : 'borma-card-off'}`}>
            <div
                className="borma-card-glow"
                style={{ background: oven.running ? `${color}22` : 'transparent' }}
            />
            <div className="borma-card-header">
                <div>
                    <h3 className="borma-card-title">{oven.label}</h3>
                    <div className={`borma-status-badge ${oven.running ? 'borma-status-on' : 'borma-status-off'}`}>
                        <span className="borma-status-dot" />
                        {oven.running ? 'RUNNING' : 'STOPPED'}
                    </div>
                </div>
                {/* Temperature setpoint */}
                <div style={{ textAlign: 'right' }}>
                    <div className="borma-metric-value" style={{ fontSize: '1.3rem', color }}>
                        {oven.tempCtr}°C
                    </div>
                    <div className="borma-metric-label">TEMP CTR</div>
                </div>
            </div>

            {/* Temperature Bars */}
            <div className="borma-temps">
                {oven.temps.map((t, i) => (
                    <TempBar
                        key={t.tag}
                        tag={t.tag}
                        value={t.value}
                        color={TEMP_BAR_COLORS[i % TEMP_BAR_COLORS.length]}
                    />
                ))}
            </div>

            {/* Tag Pills */}
            <div className="borma-tags">
                <div className="borma-tag-pill">
                    <span className="borma-tag-name">PID</span>
                    <span className={oven.pid ? 'borma-tag-on' : 'borma-tag-off'}>
                        {oven.pid ? 'ON' : 'OFF'}
                    </span>
                </div>
                <div className="borma-tag-pill">
                    <span className="borma-tag-name">SV1</span>
                    <span className={oven.sv1 ? 'borma-tag-on' : 'borma-tag-off'}>
                        {oven.sv1 ? 'ON' : 'OFF'}
                    </span>
                </div>
                <div className="borma-tag-pill">
                    <span className="borma-tag-name">LV1</span>
                    <span className={oven.lv1 ? 'borma-tag-on' : 'borma-tag-off'}>
                        {oven.lv1 ? 'ON' : 'OFF'}
                    </span>
                </div>
                <div className="borma-tag-pill">
                    <span className="borma-tag-name">VALVE</span>
                    <span className="borma-tag-value">{oven.lv1VL}%</span>
                </div>
                <div className="borma-tag-pill">
                    <span className="borma-tag-name">MTR</span>
                    <span className="borma-tag-value">{activeMotors}/4</span>
                </div>
                {oven.gdTempSV > 0 && (
                    <div className="borma-tag-pill">
                        <span className="borma-tag-name">GD SV</span>
                        <span className="borma-tag-value">{oven.gdTempSV}°C</span>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Main Component ──────────────────────────────────────────────────────
export default function BormaMonitor() {
    const [view, setView] = useState<'dashboard' | 'scada'>('dashboard')
    const [data, setData] = useState<{ ovens: OvenData[]; humidity: number } | null>(null)
    const [lastUpdate, setLastUpdate] = useState<string>('')
    const [isDemo, setIsDemo] = useState(false)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/vnet-scrape?device=borma')
            const json = await res.json()
            if (json.ok && json.data) {
                setData(json.data)
                setIsDemo(!!json.demo)
                setLastUpdate(new Date(json.timestamp).toLocaleTimeString('vi-VN'))
            }
        } catch {
            // Fallback to local demo on network error
            const demoData = generateDemoData()
            setData(demoData)
            setLastUpdate(new Date().toLocaleTimeString('vi-VN'))
            setIsDemo(true)
        }
    }, [])

    useEffect(() => {
        fetchData()
        intervalRef.current = setInterval(fetchData, 30000) // 30s refresh
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [fetchData])

    if (!data) return <div className="borma-loading"><div className="borma-loading-spinner" /><span>Loading...</span></div>

    const runningCount = data.ovens.filter(o => o.running).length
    const avgTemp = data.ovens.length > 0
        ? (data.ovens.reduce((s, o) => s + o.tempCtr, 0) / data.ovens.length).toFixed(1)
        : '0'

    return (
        <div className="borma-root">
            {/* Header */}
            <div className="borma-header">
                <div className="borma-header-left">
                    <h1 className="borma-title">
                        <svg className="borma-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2v4M6.8 15a6 6 0 1 0 10.4 0" />
                            <path d="M12 12v2" />
                            <circle cx="12" cy="12" r="2" />
                        </svg>
                        BORMA Drying Ovens
                    </h1>
                    <span className="borma-device-status borma-online">
                        <span className="borma-status-dot" /> INTERSNACK_LA ONLINE
                    </span>
                    <span className="borma-last-update">Updated {lastUpdate}</span>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div className="borma-header-stats">
                        <div className="borma-stat-box">
                            <span className="borma-stat-value">{runningCount}</span>
                            <span className="borma-stat-label">Running</span>
                        </div>
                        <div className="borma-stat-box">
                            <span className="borma-stat-value">{6 - runningCount}</span>
                            <span className="borma-stat-label">Stopped</span>
                        </div>
                        <div className="borma-stat-box">
                            <span className="borma-stat-value">{avgTemp}°</span>
                            <span className="borma-stat-label">Avg Temp</span>
                        </div>
                        <div className="borma-stat-box">
                            <span className="borma-stat-value" style={{ color: '#3b82f6' }}>{data.humidity}%</span>
                            <span className="borma-stat-label">Humidity</span>
                        </div>
                    </div>

                    <div className="borma-view-toggle">
                        <button
                            className={`borma-view-btn ${view === 'dashboard' ? 'borma-view-btn-active' : ''}`}
                            onClick={() => setView('dashboard')}
                        >
                            Dashboard
                        </button>
                        <button
                            className={`borma-view-btn ${view === 'scada' ? 'borma-view-btn-active' : ''}`}
                            onClick={() => setView('scada')}
                        >
                            Cloud SCADA
                        </button>
                    </div>
                </div>
            </div>

            {/* Data Source Banner */}
            {isDemo && (
                <div className="borma-demo-banner">
                    ⚠️ DỮ LIỆU MÔ PHỎNG — V-NET API chưa cho phép truy cập trực tiếp. Chuyển sang tab Cloud SCADA để xem data thật.
                </div>
            )}
            {!isDemo && (
                <div className="borma-demo-banner" style={{ background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981' }}>
                    ✅ DỮ LIỆU THẬT từ V-NET — {data?.ovens?.length || 0} lò đang được giám sát.
                </div>
            )}

            {/* Dashboard View */}
            {view === 'dashboard' && (
                <div className="borma-grid">
                    {data.ovens.map((oven, i) => (
                        <OvenCard key={oven.id} oven={oven} color={OVEN_COLORS[i]} />
                    ))}
                </div>
            )}

            {/* Cloud SCADA View - iframe */}
            {view === 'scada' && (
                <div className="borma-scada-container">
                    <div className="borma-scada-frame">
                        <div className="borma-scada-header">
                            <div>
                                <h2 className="borma-scada-title">
                                    Cloud SCADA — BORMA Site
                                </h2>
                                <span className="borma-scada-subtitle">
                                    Live V-NET2.0 Dashboard • Project ID: 10001417
                                </span>
                            </div>
                            <a
                                href={SCADA_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="borma-scada-fullscreen-btn"
                            >
                                ↗ Open Fullscreen
                            </a>
                        </div>
                        <iframe
                            src={SCADA_URL}
                            title="BORMA Cloud SCADA"
                            allow="fullscreen"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
