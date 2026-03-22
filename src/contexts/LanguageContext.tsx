"use client"

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react"

export type Language = "vi" | "en"

interface LanguageContextProps {
    language: Language
    setLanguage: (lang: Language) => void
    t: (key: string) => string
}

const translations: Record<string, Record<Language, string>> = {
    // Layout
    "nav.dashboard": { vi: "Production Dashboard", en: "Production Dashboard" },
    "nav.input": { vi: "Data Input", en: "Data Input" },
    "nav.plan": { vi: "Production Plan", en: "Production Plan" },
    "nav.users": { vi: "Personnel", en: "Personnel" },
    "role": { vi: "Role", en: "Role" },
    "logout": { vi: "Logout", en: "Logout" },

    // Dashboard general
    "command_center": { vi: "Production Dashboard", en: "Production Dashboard" },
    "command_desc": { vi: "Overall view of factory operations", en: "Overall view of factory operations" },
    "tab_stations": { vi: "9 Charts", en: "9 Charts" },
    "tab_regions": { vi: "3 Charts", en: "3 Charts" },
    "dropdown_placeholder": { vi: "Select to Filter Data", en: "Select to Filter Data" },
    "all_factory": { vi: "Total Factory", en: "Total Factory" },
    "all_factory_card": { vi: "TOTAL PRODUCTION", en: "TOTAL PRODUCTION" },
    "export_btn": { vi: "Export", en: "Export" },
    "actual_vs_plan": { vi: "Actual / Plan (T)", en: "Actual / Plan (T)" },
    "achv_pct": { vi: "Target Achieved (%)", en: "Target Achieved (%)" },
    "downtime": { vi: "Downtime", en: "Downtime" },
    "daily_needed": { vi: "Daily Target Needed", en: "Daily Target Needed" },
    "container": { vi: "Exported Containers", en: "Exported Containers" },

    // Chart legends & labels
    "legend.actual": { vi: "Actual", en: "Actual" },
    "legend.plan": { vi: "Plan", en: "Plan" },
    "legend.daily_needed": { vi: "Daily Needed", en: "Daily Needed" },
    "legend.downtime": { vi: "Downtime (min)", en: "Downtime (min)" },
    "legend.isp_actual": { vi: "ISP Actual", en: "ISP Actual" },
    "legend.isp_plan": { vi: "ISP Plan", en: "ISP Plan" },
    "legend.non_isp": { vi: "Non-ISP", en: "Non-ISP" },
    "legend.emission": { vi: "Emissions (T CO₂e)", en: "Emissions (T CO₂e)" },
    "legend.target": { vi: "Target", en: "Target" },
    "legend.intensity": { vi: "kWh/T", en: "kWh/T" },

    // Card view toggles
    "toggle.chart": { vi: "Chart", en: "Chart" },
    "toggle.details": { vi: "Details", en: "Details" },
    "toggle.lines": { vi: "By Line", en: "By Line" },
    "toggle.isp": { vi: "ISP", en: "ISP" },

    // Card stat labels
    "stat.mtd_plan": { vi: "MTD / Plan", en: "MTD / Plan" },
    "stat.actual": { vi: "Actual", en: "Actual" },
    "stat.variance": { vi: "Variance", en: "Variance" },
    "stat.downtime": { vi: "Downtime", en: "Downtime" },
    "stat.compressor": { vi: "AIR COMP.", en: "AIR COMP." },
    "stat.broken": { vi: "Broken (%)", en: "Broken (%)" },
    "stat.unpeel": { vi: "Unpeel (%)", en: "Unpeel (%)" },
    "stat.yield": { vi: "Yield (%)", en: "Yield (%)" },
    "stat.isp": { vi: "ISP (%)", en: "ISP (%)" },
    "stat.electric": { vi: "Elec (kWh)", en: "Elec (kWh)" },

    // Regions
    "region_rcn": { vi: "RCN WAREHOUSE", en: "RCN WAREHOUSE" },
    "region_lca": { vi: "LCA", en: "LCA" },
    "region_hca": { vi: "HCA", en: "HCA" },

    // Table
    "master_data_table": { vi: "Master Production Data Table", en: "Master Production Data Table" },
    "col_dept": { vi: "Dept / Date", en: "Dept / Date" },
    "col_plan": { vi: "Plan (T)", en: "Plan (T)" },
    "col_actual": { vi: "Actual (T)", en: "Actual (T)" },
    "col_achv": { vi: "Achv. (%)", en: "Achv. (%)" },
    "col_variance": { vi: "Variance (T)", en: "Variance (T)" },
    "col_downtime": { vi: "Downtime (Min)", en: "Downtime (Min)" },
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<Language>("en") // Default to English now

    // Optional: Load saved language preference from localStorage on mount
    useEffect(() => {
        const savedLang = localStorage.getItem("app_lang") as Language
        if (savedLang && (savedLang === "vi" || savedLang === "en")) {
            setLanguage(savedLang)
        } else {
            setLanguage("en") // Default to English if no preference
        }
    }, [])

    const handleSetLanguage = (lang: Language) => {
        setLanguage(lang)
        localStorage.setItem("app_lang", lang)
    }

    const t = (key: string): string => {
        if (translations[key] && translations[key][language]) {
            return translations[key][language]
        }
        return key // Fallback to key if not found
    }

    return (
        <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    )
}

export function useLanguage() {
    const context = useContext(LanguageContext)
    if (context === undefined) {
        throw new Error("useLanguage must be used within a LanguageProvider")
    }
    return context
}
