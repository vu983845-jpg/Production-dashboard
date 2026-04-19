"use client"

import dynamic from "next/dynamic"
import "./steaming.css"

const SteamingMonitor = dynamic(() => import("@/components/SteamingMonitor"), {
    ssr: false,
    loading: () => (
        <div className="steaming-loading">
            <div className="steaming-loading-spinner" />
            <span>Loading Steaming Monitor...</span>
        </div>
    ),
})

export default function SteamingPage() {
    return <SteamingMonitor />
}
