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
    "nav.dashboard": { vi: "Dashboard", en: "Dashboard" },
    "nav.input": { vi: "Nhập liệu", en: "Data Entry" },
    "nav.plan": { vi: "Kế hoạch", en: "Planning" },
    "nav.users": { vi: "Nhân viên", en: "Users" },
    "role": { vi: "Quyền", en: "Role" },
    "logout": { vi: "Đăng xuất", en: "Logout" },

    // Dashboard general
    "command_center": { vi: "Command Center", en: "Command Center" },
    "command_desc": { vi: "Theo dõi toàn cảnh tất cả phòng ban", en: "Overview of all production departments" },
    "tab_stations": { vi: "9 Trạm Chế Biến", en: "9 Processing Stations" },
    "tab_regions": { vi: "3 Khu Vực", en: "3 Core Regions" },
    "dropdown_placeholder": { vi: "Bảng Data phía dưới", en: "Select for Data Table" },
    "all_factory": { vi: "Toàn bộ Nhà Máy", en: "All Factory" },
    "all_factory_card": { vi: "CẢ NHÀ MÁY (TỔNG HỢP)", en: "FACTORY (AGGREGATE)" },
    "export_btn": { vi: "Xuất file", en: "Export" },
    "actual_vs_plan": { vi: "Thực tế / Kế hoạch", en: "Actual / Plan" },
    "achv_pct": { vi: "Tỷ lệ (Achv %)", en: "Achievement %" },
    "downtime": { vi: "Downtime (Chạy không)", en: "Downtime" },

    // Regions
    "region_rcn": { vi: "KHO RCN", en: "RCN WH" },
    "region_lca": { vi: "VÙNG LCA (Steaming -> Borma)", en: "LCA REGION (Steaming -> Borma)" },
    "region_hca": { vi: "VÙNG HCA (Peeling MC -> Packing)", en: "HCA REGION (Peeling -> Packing)" },

    // Table 
    "master_data_table": { vi: "Bảng Dữ Liệu Tổng Hợp", en: "Master Data Table" },
    "col_dept": { vi: "Bộ phận / Ngày", en: "Dept / Date" },
    "col_plan": { vi: "Kế hoạch (T)", en: "Plan (T)" },
    "col_actual": { vi: "Thực tế (T)", en: "Actual (T)" },
    "col_achv": { vi: "Đạt (%)", en: "Achv (%)" },
    "col_variance": { vi: "Chênh lệch (T)", en: "Variance (T)" },
    "col_downtime": { vi: "Phút Downtime", en: "Downtime (min)" },
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
