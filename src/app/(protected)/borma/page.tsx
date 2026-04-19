"use client"

import dynamic from "next/dynamic"
import "./borma.css"

const BormaMonitor = dynamic(() => import("@/components/BormaMonitor"), {
    ssr: false,
    loading: () => (
        <div className="borma-loading">
            <div className="borma-loading-spinner" />
            <span>Loading BORMA Oven Monitor...</span>
        </div>
    ),
})

export default function BormaPage() {
    return <BormaMonitor />
}
