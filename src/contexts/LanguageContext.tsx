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
    "nav.dashboard": { vi: "Bảng điều khiển", en: "Production Dashboard" },
    "nav.input": { vi: "Nhập liệu", en: "Data Input" },
    "nav.plan": { vi: "Kế hoạch SX", en: "Production Plan" },
    "nav.users": { vi: "Nhân sự", en: "Personnel" },
    "role": { vi: "Vai trò", en: "Role" },
    "logout": { vi: "Đăng xuất", en: "Logout" },

    // Dashboard general
    "command_center": { vi: "Bảng điều khiển Sản xuất", en: "Production Dashboard" },
    "command_desc": { vi: "Tổng quan hoạt động nhà máy", en: "Overall view of factory operations" },
    "tab_stations": { vi: "9 Biểu đồ", en: "9 Charts" },
    "tab_regions": { vi: "3 Biểu đồ", en: "3 Charts" },
    "dropdown_placeholder": { vi: "Chọn để lọc dữ liệu", en: "Select to Filter Data" },
    "all_factory": { vi: "Toàn nhà máy", en: "Total Factory" },
    "all_factory_card": { vi: "TỔNG SẢN LƯỢNG", en: "TOTAL PRODUCTION" },
    "export_btn": { vi: "Xuất dữ liệu", en: "Export" },
    "actual_vs_plan": { vi: "Thực tế / Kế hoạch (T)", en: "Actual / Plan (T)" },
    "achv_pct": { vi: "Đạt mục tiêu (%)", en: "Target Achieved (%)" },
    "downtime": { vi: "Thời gian dừng", en: "Downtime" },
    "daily_needed": { vi: "Sản lượng cần/ngày", en: "Daily Target Needed" },
    "container": { vi: "Container xuất", en: "Exported Containers" },

    // Chart legends & labels
    "legend.actual": { vi: "Thực tế", en: "Actual" },
    "legend.plan": { vi: "Kế hoạch", en: "Plan" },
    "legend.daily_needed": { vi: "Cần đạt/ngày", en: "Daily Needed" },
    "legend.downtime": { vi: "Dừng máy (phút)", en: "Downtime (min)" },
    "legend.isp_actual": { vi: "ISP thực tế", en: "ISP Actual" },
    "legend.isp_plan": { vi: "ISP kế hoạch", en: "ISP Plan" },
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
    "stat.mtd_plan": { vi: "Lũy kế / KH", en: "MTD / Plan" },
    "stat.actual": { vi: "Thực tế", en: "Actual" },
    "stat.variance": { vi: "Chênh lệch", en: "Variance" },
    "stat.downtime": { vi: "Dừng máy", en: "Downtime" },
    "stat.compressor": { vi: "MÁY NÉN KHÍ", en: "AIR COMP." },
    "stat.broken": { vi: "Tỷ lệ bể (%)", en: "Broken (%)" },
    "stat.unpeel": { vi: "Chưa lột (%)", en: "Unpeel (%)" },
    "stat.yield": { vi: "Hiệu suất (%)", en: "Yield (%)" },
    "stat.isp": { vi: "ISP (%)", en: "ISP (%)" },
    "stat.electric": { vi: "Điện (kWh)", en: "Elec (kWh)" },

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
    "region_rcn": { vi: "KHO RCN", en: "RCN WAREHOUSE" },
    "region_lca": { vi: "LCA", en: "LCA" },
    "region_hca": { vi: "HCA", en: "HCA" },

    // Table
    "master_data_table": { vi: "Bảng dữ liệu Sản xuất", en: "Master Production Data Table" },
    "col_dept": { vi: "BP / Ngày", en: "Dept / Date" },
    "col_plan": { vi: "KH (T)", en: "Plan (T)" },
    "col_actual": { vi: "TT (T)", en: "Actual (T)" },
    "col_achv": { vi: "Đạt (%)", en: "Achv. (%)" },
    "col_variance": { vi: "Chênh lệch (T)", en: "Variance (T)" },
    "col_downtime": { vi: "Dừng máy (Phút)", en: "Downtime (Min)" },

    // Downtime page
    "dt.title": { vi: "Quản lý Sự cố / Downtime", en: "Downtime Management" },
    "dt.desc": { vi: "Ghi nhận và theo dõi sự cố dừng máy theo tiêu chuẩn DDS", en: "Record and track machine downtime events per DDS standard" },
    "dt.tab_entry": { vi: "Ghi nhận", en: "New Entry" },
    "dt.tab_list": { vi: "Danh sách", en: "Event List" },
    "dt.tab_report": { vi: "Báo cáo", en: "Report" },
    "dt.all_dept": { vi: "Tất cả bộ phận", en: "All Departments" },
    "dt.all_status": { vi: "Tất cả trạng thái", en: "All Status" },
    "dt.status_open": { vi: "🔵 Đang mở (Open)", en: "🔵 Open" },
    "dt.status_closed": { vi: "🟢 Đã đóng (Closed)", en: "🟢 Closed" },
    "dt.newest": { vi: "📅 Mới nhất", en: "📅 Newest" },
    "dt.duration_high": { vi: "⬇️ DT nhiều nhất", en: "⬇️ Highest DT" },
    "dt.duration_low": { vi: "⬆️ DT ít nhất", en: "⬆️ Lowest DT" },
    "dt.no_events": { vi: "Không có sự cố nào.", en: "No events found." },
    "dt.loading": { vi: "Đang tải...", en: "Loading..." },
    "dt.close_title": { vi: "⏱ Đóng sự cố", en: "⏱ Close Event" },
    "dt.close_time": { vi: "Thời gian đóng", en: "Close Time" },
    "dt.duration_preview": { vi: "Thời lượng tính được", en: "Calculated Duration" },
    "dt.confirm_close": { vi: "Xác nhận Đóng", en: "Confirm Close" },
    "dt.closing": { vi: "Đang đóng...", en: "Closing..." },
    "dt.cancel": { vi: "Huỷ", en: "Cancel" },
    "dt.edit_title": { vi: "✏️ Chỉnh sửa sự cố", en: "✏️ Edit Event" },
    "dt.reason_code": { vi: "Mã sự cố", en: "Reason Code" },
    "dt.machine_area": { vi: "Khu vực máy", en: "Machine Area" },
    "dt.description": { vi: "Mô tả", en: "Description" },
    "dt.note": { vi: "Ghi chú", en: "Note" },
    "dt.severity": { vi: "Mức độ", en: "Severity" },
    "dt.start_time": { vi: "Bắt đầu", en: "Start" },
    "dt.end_time": { vi: "Kết thúc", en: "End" },
    "dt.duration_mins": { vi: "Thời lượng (phút) — tự tính khi có giờ", en: "Duration (min) — auto-calculated" },
    "dt.exclude_dt": { vi: "⛔ Không tính vào Downtime", en: "⛔ Exclude from Downtime" },
    "dt.save": { vi: "Lưu thay đổi", en: "Save Changes" },
    "dt.saving": { vi: "Đang lưu...", en: "Saving..." },
    "dt.open_alert": { vi: "sự cố đang tính downtime chưa đóng!", en: "open events counting as downtime!" },
    "dt.btn_close": { vi: "Đóng", en: "Close" },
    "dt.btn_edit": { vi: "Sửa", en: "Edit" },
    "dt.ongoing": { vi: "Đang tiếp diễn (chưa xử lý xong)", en: "Ongoing (not resolved yet)" },
    "dt.exclude_check": { vi: "Không tính vào Downtime (chỉ theo dõi)", en: "Exclude from Downtime (tracking only)" },
    "dt.add_btn": { vi: "💾 Ghi nhận sự cố", en: "💾 Record Event" },
    "dt.new_entry": { vi: "Ghi nhận Sự cố Mới", en: "New Downtime Entry" },
    "dt.dept": { vi: "Bộ phận *", en: "Department *" },
    "dt.start_label": { vi: "Thời gian bắt đầu *", en: "Start Time *" },
    "dt.reason_label": { vi: "Mã Lý do *", en: "Reason Code *" },
    "dt.planned": { vi: "🟢 Có kế hoạch", en: "🟢 Planned" },
    "dt.unplanned": { vi: "🔴 Không có kế hoạch", en: "🔴 Unplanned" },
    "dt.machine_placeholder": { vi: "VD: Line A, Máy bóc vỏ...", en: "E.g.: Line A, Peeling Machine..." },
    "dt.desc_placeholder": { vi: "Tóm tắt sự cố...", en: "Brief event summary..." },
    "dt.detail_note": { vi: "Ghi chú chi tiết & Hành động khắc phục", en: "Detail Notes & Corrective Actions" },
    "dt.detail_note_placeholder": { vi: "Nguyên nhân chi tiết, hành động đã thực hiện...", en: "Root cause details, actions taken..." },
    "dt.minutes": { vi: "phút", en: "min" },

    // Input page
    "input.title": { vi: "Nhập liệu Sản xuất", en: "Production Data Input" },
    "input.save": { vi: "Lưu dữ liệu", en: "Save Data" },
    "input.saved": { vi: "Đã lưu!", en: "Saved!" },

    // General
    "general.delete": { vi: "Xoá", en: "Delete" },
    "general.edit": { vi: "Sửa", en: "Edit" },
    "general.close": { vi: "Đóng", en: "Close" },
    "general.export_excel": { vi: "Xuất Excel", en: "Export Excel" },
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
