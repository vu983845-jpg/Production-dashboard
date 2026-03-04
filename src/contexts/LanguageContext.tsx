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
    "nav.dashboard": { vi: "Tổng quan Sản xuất", en: "Production Dashboard" },
    "nav.input": { vi: "Ghi nhận Trạm", en: "Station Input" },
    "nav.plan": { vi: "Kế hoạch Sản xuất", en: "Production Plan" },
    "nav.users": { vi: "Nhân Sự", en: "Personnel" },
    "role": { vi: "Quyền", en: "Role" },
    "logout": { vi: "Đăng xuất", en: "Logout" },

    // Dashboard general
    "command_center": { vi: "Phòng Điều hành Trung tâm", en: "Central Control Room" },
    "command_desc": { vi: "Theo dõi toàn cảnh tiến độ của nhà máy", en: "Overall view of factory operations" },
    "tab_stations": { vi: "9 Trạm Sản Xuất", en: "9 Workstations" },
    "tab_regions": { vi: "3 Phân Khu Cốt Lõi", en: "3 Core Regions" },
    "dropdown_placeholder": { vi: "Chọn để Lọc Dữ liệu", en: "Select to Filter Data" },
    "all_factory": { vi: "Tổng Hợp Toàn Nhà Máy", en: "Total Factory Aggregate" },
    "all_factory_card": { vi: "CẢ NHÀ MÁY (TỔNG HỢP)", en: "FACTORY (AGGREGATE)" },
    "export_btn": { vi: "Xuất file", en: "Export" },
    "actual_vs_plan": { vi: "Thực tế / Kế hoạch (T)", en: "Actual / Plan (T)" },
    "achv_pct": { vi: "Mức đạt (%)", en: "Target Achieved (%)" },
    "downtime": { vi: "Thời gian Chết máy", en: "Machine Downtime" },

    // Regions
    "region_rcn": { vi: "KHO ĐIỀU THÔ (RCN)", en: "RCN WAREHOUSE" },
    "region_lca": { vi: "PHÂN KHU LCA (Hấp -> Borma)", en: "LCA REGION (Steaming -> Borma)" },
    "region_hca": { vi: "PHÂN KHU HCA (Tách -> Đóng gói)", en: "HCA REGION (Peeling -> Packing)" },

    // Table 
    "master_data_table": { vi: "Bảng Dữ liệu Sản lượng Tổng hợp", en: "Master Production Data Table" },
    "col_dept": { vi: "Trạm / Ngày", en: "Station / Date" },
    "col_plan": { vi: "Kế hoạch (T)", en: "Plan (T)" },
    "col_actual": { vi: "Thực tế (T)", en: "Actual (T)" },
    "col_achv": { vi: "Mức đạt (%)", en: "Achv. (%)" },
    "col_variance": { vi: "Chênh lệch (T)", en: "Variance (T)" },
    "col_downtime": { vi: "Chết máy (Phút)", en: "Downtime (Min)" },
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
