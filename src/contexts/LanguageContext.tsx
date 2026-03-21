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
    "nav.dashboard": { vi: "Tổng quan Sản xuất", en: "Dashboard" },
    "nav.input": { vi: "Nhập Dữ liệu", en: "Data Input" },
    "nav.plan": { vi: "Kế hoạch Sản xuất", en: "Plan Setup" },
    "nav.users": { vi: "Nhân Sự", en: "Personnel" },
    "role": { vi: "Quyền", en: "Role" },
    "logout": { vi: "Đăng xuất", en: "Logout" },

    // Dashboard general
    "command_center": { vi: "Production Dashboard", en: "Production Dashboard" },
    "command_desc": { vi: "Theo dõi toàn cảnh tiến độ của nhà máy", en: "Overall view of factory operations" },
    "tab_stations": { vi: "9 Charts", en: "9 Charts" },
    "tab_regions": { vi: "3 Charts", en: "3 Charts" },
    "dropdown_placeholder": { vi: "Chọn để Lọc Dữ liệu", en: "Select to Filter Data" },
    "all_factory": { vi: "Tổng Hợp Toàn Nhà Máy", en: "Total Factory" },
    "all_factory_card": { vi: "TỔNG SẢN LƯỢNG / TOTAL PRODUCTION", en: "TOTAL PRODUCTION" },
    "export_btn": { vi: "Xuất file", en: "Export" },
    "actual_vs_plan": { vi: "Thực tế / Kế hoạch (T)", en: "Actual / Plan (T)" },
    "achv_pct": { vi: "Mức đạt (%)", en: "Target Achieved (%)" },
    "downtime": { vi: "Downtime", en: "Downtime" },
    "daily_needed": { vi: "Cần đạt / Ngày (T)", en: "Daily Target Needed" },
    "container": { vi: "Số Lượng Xuất (Container)", en: "Exported Containers" },

    // Chart legends & labels
    "legend.actual": { vi: "Thực tế", en: "Actual" },
    "legend.plan": { vi: "Kế hoạch", en: "Plan" },
    "legend.daily_needed": { vi: "Cần làm/Ngày", en: "Daily Needed" },
    "legend.downtime": { vi: "Downtime (phút)", en: "Downtime (min)" },
    "legend.isp_actual": { vi: "ISP Thực tế", en: "ISP Actual" },
    "legend.isp_plan": { vi: "ISP Kế hoạch", en: "ISP Plan" },
    "legend.non_isp": { vi: "Non-ISP", en: "Non-ISP" },
    "legend.emission": { vi: "Phát thải (T CO₂e)", en: "Emissions (T CO₂e)" },
    "legend.target": { vi: "Mục tiêu", en: "Target" },
    "legend.intensity": { vi: "kWh/T", en: "kWh/T" },

    // Card view toggles
    "toggle.chart": { vi: "Biểu đồ", en: "Chart" },
    "toggle.details": { vi: "Chi tiết", en: "Details" },
    "toggle.lines": { vi: "Theo Line", en: "By Line" },
    "toggle.isp": { vi: "ISP", en: "ISP" },

    // Card stat labels
    "stat.mtd_plan": { vi: "MTD / KH", en: "MTD / Plan" },
    "stat.actual": { vi: "Thực hiện", en: "Actual" },
    "stat.variance": { vi: "Chênh lệch", en: "Variance" },
    "stat.downtime": { vi: "Downtime", en: "Downtime" },
    "stat.compressor": { vi: "Đ. NÉN KHÍ", en: "AIR COMP." },
    "stat.broken": { vi: "Tỷ lệ Bể (%)", en: "Broken (%)" },
    "stat.unpeel": { vi: "Sót lụa (%)", en: "Unpeel (%)" },
    "stat.yield": { vi: "Yield (%)", en: "Yield (%)" },
    "stat.isp": { vi: "ISP (%)", en: "ISP (%)" },
    "stat.electric": { vi: "Điện (kWh)", en: "Elec (kWh)" },

    // Regions
    "region_rcn": { vi: "KHO ĐIỀU THÔ (RCN)", en: "RCN WAREHOUSE" },
    "region_lca": { vi: "LCA", en: "LCA" },
    "region_hca": { vi: "HCA", en: "HCA" },

    // Table
    "master_data_table": { vi: "Bảng Dữ liệu Sản lượng Tổng hợp", en: "Master Production Data Table" },
    "col_dept": { vi: "Bộ phận / Ngày", en: "Dept / Date" },
    "col_plan": { vi: "Kế hoạch (T)", en: "Plan (T)" },
    "col_actual": { vi: "Thực tế (T)", en: "Actual (T)" },
    "col_achv": { vi: "Mức đạt (%)", en: "Achv. (%)" },
    "col_variance": { vi: "Chênh lệch (T)", en: "Variance (T)" },
    "col_downtime": { vi: "Downtime (Phút)", en: "Downtime (Min)" },
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<Language>("vi")

    // Optional: Load saved language preference from localStorage on mount
    useEffect(() => {
        const savedLang = localStorage.getItem("app_lang") as Language
        if (savedLang && (savedLang === "vi" || savedLang === "en")) {
            setLanguage(savedLang)
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
