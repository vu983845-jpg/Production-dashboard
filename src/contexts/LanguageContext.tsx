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
    // Report - Shelling Analytics
    "report.shelling.insights": { vi: "Phân tích Nâng cao", en: "Optimized Insights" },
    "report.shelling.crossLine.title": { vi: "So sánh Hiệu suất chéo các Line (T/h)", en: "Cross-Line Efficiency Comparison (T/h)" },
    "report.shelling.crossLine.desc": { vi: "Phân tích so sánh hiệu suất hoạt động giữa tất cả các máy.", en: "Comparative analysis of operating efficiency across all lines." },
    "report.shelling.speedQuality.title": { vi: "Tương quan Tốc độ & Chất lượng", en: "Speed vs Quality Correlation" },
    "report.shelling.speedQuality.desc": { vi: "Đánh giá sự ảnh hưởng giữa tốc độ chạy máy và tỷ lệ bể xuất hiện.", en: "Evaluating if higher speed correlates to higher broken kernels." },
    "report.shelling.speedQuality.x": { vi: "Tốc độ (T/h)", en: "Speed (T/h)" },
    "report.shelling.speedQuality.y": { vi: "Tỷ lệ bể (%)", en: "Broken %" },
    "report.shelling.speedQuality.scatter": { vi: "Các ca sản xuất", en: "Shifts" },
    "report.shelling.energy.title": { vi: "Định mức điện năng (kWh/Tấn)", en: "Energy Intensity (kWh/Ton)" },
    "report.shelling.energy.desc": { vi: "Theo dõi lượng điện năng tiêu thụ trên mỗi tấn sản phẩm hàng ngày.", en: "Tracking electricity usage against daily shelling production." },
    "report.shelling.energy.prod": { vi: "Sản lượng (T)", en: "Production (T)" },
    "report.shelling.energy.intens": { vi: "Định mức (kWh/T)", en: "Intensity (kWh/T)" },
    
    // Smart Insights
    "insight.good.title": { vi: "Tốt", en: "Good" },
    "insight.warning.title": { vi: "Chú ý", en: "Warning" },
    "insight.danger.title": { vi: "Báo động", en: "Critical" },
    "insight.info.title": { vi: "Phân tích", en: "Insight" },
    
    // Cross Line
    "insight.crossLine.best": { vi: "Line có hiệu suất cao nhất là", en: "Best performing line is" },
    "insight.crossLine.worst": { vi: "Line đang chạy thấp hơn 10% trung bình là", en: "Lines operating >10% below average:" },
    "insight.crossLine.normal": { vi: "Hiệu suất các Line tương đối đồng đều quanh mức", en: "All lines are operating consistently around" },
    
    // Speed vs Broken
    "insight.speed.danger": { vi: "Phát hiện ca chạy có tỷ lệ Bể vượt mức cảnh báo (>{0}%). Vui lòng kiểm tra cài đặt dao cắt của: {1}.", en: "Detected shifts with critical broken rate (>{0}%). Please inspect cutter settings for: {1}." },
    "insight.speed.normal": { vi: "Chất lượng ổn định. Không có ca nào vượt ngưỡng bể {0}%.", en: "Quality is stable. No shifts exceeded the {0}% broken threshold." },
    
    // Size Broken
    "insight.size.danger": { vi: "Cỡ hạt có tỷ lệ bể trung bình cao nhất là {0} ({1}%).", en: "The size with the highest average broken rate is {0} ({1}%)." },
    "insight.lineDeep.danger": { vi: "Ca {0} bị bể nhiều nhất ({1}%), cao hơn hẳn mức trung bình máy.", en: "Shift {0} has the highest broken rate ({1}%), significantly above the line average." },
    "insight.lineDeep.normal": { vi: "Tỷ lệ bể giữa các ca làm việc khá đồng đều.", en: "Broken rates across shifts are relatively consistent." },


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
