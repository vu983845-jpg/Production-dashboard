"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { BookOpen } from "lucide-react"

const SECTIONS = ["Tổng quan", "Báo Cơm", "Sản xuất", "Changelog"] as const
type Section = typeof SECTIONS[number]

export function UserGuide() {
    const [tab, setTab] = useState<Section>("Tổng quan")

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="link" className="text-muted-foreground hover:text-primary gap-2 px-0 h-auto font-normal text-xs flex items-center">
                    <BookOpen className="h-4 w-4" />
                    Hướng dẫn sử dụng
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black text-primary">VICC LA Dashboard Handbook 📖</DialogTitle>
                </DialogHeader>

                {/* Tab bar */}
                <div className="flex gap-1 border-b pb-2 mt-1 flex-wrap">
                    {SECTIONS.map(s => (
                        <button
                            key={s}
                            onClick={() => setTab(s)}
                            className={`px-3 py-1.5 rounded-t text-xs font-semibold transition-colors ${
                                tab === s
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>

                <div className="space-y-4 text-sm text-foreground mt-2">

                    {/* ── TAB: TỔNG QUAN ── */}
                    {tab === "Tổng quan" && (
                        <>
                            <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <h3 className="font-bold text-base mb-2 text-slate-800 flex items-center gap-2">📊 Command Center (Dashboard)</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>MTD & Phần Trăm Đạt:</strong> Xanh = đạt KPI · Vàng = cảnh báo · Đỏ = chưa đạt.</li>
                                    <li><strong>Bộ phận chi tiết:</strong> Shelling, Peeling, Color Sorter… với Tỷ lệ bể, Sót lụa, SW, ISP.</li>
                                    <li><strong>Năng lượng:</strong> Điện · Nước · Củi theo thời gian thực so với Target.</li>
                                    <li><strong>Export CSV:</strong> Nút góc trên màn hình — xuất toàn bộ database ra file.</li>
                                </ul>
                            </section>

                            <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <h3 className="font-bold text-base mb-2 text-slate-800 flex items-center gap-2">✍️ Nhập số liệu (Data Input)</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li>Dành cho Shift Leaders — nhập Sản lượng, Cont, WIP theo ca.</li>
                                    <li>Shelling hỗ trợ gán ID Ca Trực, lưu Tỷ lệ bể và Run Hours.</li>
                                    <li>Nhấn <strong>Lưu</strong> để đồng bộ. Toast xanh = thành công.</li>
                                </ul>
                            </section>

                            <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <h3 className="font-bold text-base mb-2 text-slate-800 flex items-center gap-2">📈 Planning & Reporting</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>Setup Plan:</strong> Import KPI qua Template Excel. Biểu đồ tự sinh tracking line mục tiêu.</li>
                                    <li><strong>Report:</strong> Tổng hợp theo Tháng/Phân xưởng. Xuất Excel gồm General + Daily Tracking sheet.</li>
                                </ul>
                            </section>

                            <section className="bg-red-50 p-4 rounded-xl border border-red-100">
                                <h3 className="font-bold text-base mb-2 text-red-800 flex items-center gap-2">🛠 Support</h3>
                                <ul className="list-disc pl-5 space-y-2 text-red-700">
                                    <li><strong>Downtime:</strong> Auto-sync từ DDS Meeting App hằng ngày. Đơn vị: Giờ.</li>
                                    <li><strong>Lỗi / Phân quyền:</strong> Liên hệ <strong className="bg-red-200 px-1 rounded">Vũ Huỳnh (V.H)</strong>.</li>
                                </ul>
                            </section>
                        </>
                    )}

                    {/* ── TAB: BÁO CƠM ── */}
                    {tab === "Báo Cơm" && (
                        <>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs">
                                📍 Module <strong>Báo Cơm</strong> nằm trong menu trái — chỉ Quản lý và người có quyền mới thấy nút <strong>Lưu / Confirm</strong>.
                            </div>

                            {/* BƯỚC 1 */}
                            <section className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <h3 className="font-bold text-base mb-3 text-blue-900 flex items-center gap-2">
                                    <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-black">1</span>
                                    Tab "Báo Cơm" — Paste &amp; Phân tích Zalo
                                </h3>
                                <ol className="list-decimal pl-5 space-y-2 text-blue-800 text-[13px]">
                                    <li>Mở Zalo Web / App → Copy toàn bộ các tin nhắn báo cơm trong nhóm.</li>
                                    <li>Paste vào ô text lớn màu xám ở tab <strong>Báo Cơm</strong>.</li>
                                    <li>
                                        Chọn hình thức phân tích:
                                        <ul className="list-disc pl-5 mt-1 space-y-1">
                                            <li><kbd className="bg-white px-1.5 py-0.5 rounded border text-[11px] shadow-sm font-mono">⚡ Phân tích thủ công</kbd> — Nhanh, dùng rule cứng, phù hợp format chuẩn.</li>
                                            <li><kbd className="bg-white px-1.5 py-0.5 rounded border text-[11px] shadow-sm font-mono">🤖 AI phân tích</kbd> — Dùng Groq AI (LLaMA), xử lý được format viết tắt, lộn xộn, chữ sai chính tả.</li>
                                        </ul>
                                    </li>
                                </ol>

                                <div className="mt-3 bg-white rounded-lg border border-blue-200 p-3 text-[12px] text-blue-700 space-y-1">
                                    <p className="font-semibold">💡 Khi nào dùng AI?</p>
                                    <p>Khi tin nhắn viết kiểu: <em>&quot;Chuẩn mc Ca:1:8(5chay)0T&quot;</em> hay trộn nhiều bộ phận cùng block → AI xử lý tốt hơn rule thủ công.</p>
                                </div>
                            </section>

                            {/* BƯỚC 2 */}
                            <section className="bg-green-50 p-4 rounded-xl border border-green-100">
                                <h3 className="font-bold text-base mb-3 text-green-900 flex items-center gap-2">
                                    <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-black">2</span>
                                    Kiểm tra &amp; Sửa kết quả
                                </h3>
                                <ul className="list-disc pl-5 space-y-2 text-green-800 text-[13px]">
                                    <li>
                                        <strong>Cột NGUỒN:</strong> Bấm <kbd className="bg-white px-1.5 py-0.5 rounded border text-[11px] shadow-sm font-mono">▼ Xem</kbd> để xem đoạn Zalo gốc tương ứng.
                                        Dùng để đối chiếu khi nghi AI đọc sai.
                                    </li>
                                    <li>
                                        <strong>Cột KHU VỰC:</strong> Nếu sai, bấm vào tên → dropdown xuất hiện → chọn đúng bộ phận.
                                        Hệ thống sẽ dùng tên đã chỉnh khi lưu DB.
                                    </li>
                                    <li>
                                        <strong>Cột DB LINK:</strong> Hiện 🟢 nếu khu vực đã map được vào DB · 🔴 nếu chưa map (cần chỉnh bằng dropdown).
                                    </li>
                                    <li>
                                        <strong>OT:</strong> Hiển thị số người OT. Nếu có dạng <em>&quot;Dự trù&quot;</em> xuất hiện trong OT → AI đọc nhầm, sửa lại = 0 hoặc số thực.
                                    </li>
                                </ul>
                            </section>

                            {/* BƯỚC 3 */}
                            <section className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                <h3 className="font-bold text-base mb-3 text-emerald-900 flex items-center gap-2">
                                    <span className="bg-emerald-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-black">3</span>
                                    Lưu vào Database
                                </h3>
                                <ul className="list-disc pl-5 space-y-2 text-emerald-800 text-[13px]">
                                    <li>
                                        <strong>Confirm từng dòng:</strong> Bấm <kbd className="bg-white px-1.5 py-0.5 rounded border text-[11px] shadow-sm">✓ Lưu</kbd> ở từng row.
                                        Dùng khi muốn kiểm tra kỹ từng bộ phận trước khi lưu.
                                    </li>
                                    <li>
                                        <strong>Lưu tất cả:</strong> Bấm <kbd className="bg-white px-1.5 py-0.5 rounded border text-[11px] shadow-sm">💾 Lưu N bản ghi vào DB</kbd> ở thanh trên để lưu nhanh tất cả.
                                    </li>
                                    <li>Dữ liệu được lưu theo ngày + bộ phận + ca. Nếu cùng key → tự động <strong>ghi đè</strong> (upsert).</li>
                                    <li>
                                        <strong>Xuất Excel:</strong> Bấm <kbd className="bg-white px-1.5 py-0.5 rounded border text-[11px] shadow-sm">Xuất Excel (.csv)</kbd>
                                        để tải file CSV của kết quả hiện tại về máy.
                                    </li>
                                </ul>
                            </section>

                            {/* CÁC TAB KHÁC */}
                            <section className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                                <h3 className="font-bold text-base mb-3 text-purple-900 flex items-center gap-2">📑 Các tab khác</h3>
                                <div className="space-y-3 text-[13px] text-purple-800">
                                    <div className="flex gap-2 items-start">
                                        <span className="shrink-0 font-bold mt-0.5">🕐 Lịch sử</span>
                                        <span>Xem lại tất cả bản ghi đã lưu theo khoảng ngày. Có thể <strong>Sửa</strong> hoặc <strong>Xóa</strong> từng dòng nếu nhập sai.</span>
                                    </div>
                                    <div className="flex gap-2 items-start">
                                        <span className="shrink-0 font-bold mt-0.5">🍽 Nhà ăn</span>
                                        <span>Tổng hợp bữa ăn theo ngày &amp; ca — dành cho bếp biết cần nấu bao nhiêu suất. Lọc được theo ca và ngày cụ thể.</span>
                                    </div>
                                    <div className="flex gap-2 items-start">
                                        <span className="shrink-0 font-bold mt-0.5">📅 Theo tháng</span>
                                        <span>Bảng pivot: từng bộ phận × từng ngày trong tháng. Dùng để đối chiếu với file Excel &quot;Báo Cơm 2026&quot;.</span>
                                    </div>
                                </div>
                            </section>

                            {/* CÁC FORMAT ZALo ĐƯỢC HỖ TRỢ */}
                            <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <h3 className="font-bold text-base mb-3 text-slate-800 flex items-center gap-2">📋 Format Zalo được AI hỗ trợ</h3>
                                <div className="space-y-2 text-[12px] font-mono text-slate-600">
                                    {[
                                        ["Format chuẩn", "Date: 30/03/2026\nKhu vực : Shelling\nCa: 1\nChính thức hiện diện: 19(6p chay)\nOT: 0"],
                                        ["Có Thời vụ", "Khu vực : Packing\nCa: 2\nChính thức hiện diện:13(9chay)\nThời vụ hiện diện: 0\nOT:"],
                                        ["Boiler Ca 1.2.3", "Khu vực : Boiler\nCa: 1.2.3\nChính thức hiện diện: 3\n(Chia đều mỗi ca = 1 người)"],
                                        ["Compact nhiều ca", "QC\nCa1: 11 (2 chay) OT: 7\nCa2: 2\nCa3: 8 (1 chay)"],
                                        ["OT bổ sung riêng", "Shelling OT 5p (2 chay) ăn 14h"],
                                    ].map(([label, ex]) => (
                                        <div key={label} className="bg-white rounded-lg border p-2">
                                            <p className="text-[10px] font-sans font-semibold text-slate-500 mb-1">{label}</p>
                                            <pre className="whitespace-pre-wrap text-slate-700">{ex}</pre>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* NOTE VỀ AI */}
                            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-orange-800 text-[12px] space-y-1">
                                <p className="font-semibold">⚠️ Lưu ý về AI (LLaMA 3.1 8B · Groq)</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>AI có thể đọc nhầm khu vực nếu tin nhắn rất bất quy tắc — luôn kiểm tra cột <strong>KHU VỰC</strong> và <strong>DB LINK</strong> trước khi lưu.</li>
                                    <li>Các phần <em>&quot;Dự trù&quot;</em> sẽ bị bỏ qua — nếu vẫn xuất hiện trong OT thì sửa = 0.</li>
                                    <li>Khi gặp lỗi AI liên tục → chọn <strong>Phân tích thủ công</strong> để fallback.</li>
                                </ul>
                            </div>
                        </>
                    )}

                    {/* ── TAB: SẢN XUẤT ── */}
                    {tab === "Sản xuất" && (
                        <>
                            <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <h3 className="font-bold text-base mb-2 text-slate-800">⚙️ Shelling Report</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li>Section 1 — <strong>Overall:</strong> Cross-line speed, OEE, Leader comparison, Downtime, và <strong>Tỷ lệ bể tổng thể tất cả line theo ngày</strong> (đường đỏ + ngưỡng 4.5%).</li>
                                    <li>Section 2 — <strong>Correlations:</strong> Speed vs Quality, Energy Intensity, Size Performance.</li>
                                    <li>Section 3 — <strong>Deep-dive:</strong> Chọn &quot;Theo Line&quot; hoặc &quot;Theo Leader&quot; để drill-down từng máy.</li>
                                </ul>
                            </section>

                            <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <h3 className="font-bold text-base mb-2 text-slate-800">📉 Downtime Reporting</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li>Nhập downtime qua 2 bước: <strong>Root Cause Code</strong> → <strong>Sub-cause</strong> chi tiết (14 mã chuẩn).</li>
                                    <li>Nếu chưa có trong danh sách → chọn <em>&quot;Khác&quot;</em> để nhập tự do.</li>
                                    <li>Downtime tự động sync từ DDS Meeting App hằng ngày.</li>
                                </ul>
                            </section>

                            <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <h3 className="font-bold text-base mb-2 text-slate-800">📦 Báo Cáo Theo Tháng</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li>Chọn bộ phận từ menu dropdown để lọc dữ liệu.</li>
                                    <li>Chart Tỷ lệ bể: đường nét đứt đỏ = ngưỡng cảnh báo 4.5% — ngày vượt ngưỡng hiện chấm to.</li>
                                    <li>Export Excel đầy đủ General + Daily Tracking sheet.</li>
                                </ul>
                            </section>
                        </>
                    )}

                    {/* ── TAB: CHANGELOG ── */}
                    {tab === "Changelog" && (
                        <section className="space-y-4">
                            {[
                                {
                                    version: "v1.3.0",
                                    date: "30/03/2026",
                                    color: "indigo",
                                    items: [
                                        "Báo Cơm: AI parse giờ hiện đủ cột NGUỒN (raw text) cho mọi kết quả AI.",
                                        "Fix AI nhầm Packing → HANDPEELING (update example training trong prompt).",
                                        "Report Shelling: thêm chart Tỷ lệ bể tổng thể (all lines combined, weighted avg) theo ngày.",
                                        "Bỏ tính năng Dạy AI (ít dùng thực tế, tối ưu prompt trực tiếp từ developer).",
                                    ]
                                },
                                {
                                    version: "v1.2.0",
                                    date: "29/03/2026",
                                    color: "violet",
                                    items: [
                                        "Báo Cơm: Edit & Delete bản ghi lịch sử, Monthly Statistics pivot table.",
                                        "Localization: hỗ trợ song ngữ VI/EN trên toàn bộ dashboard.",
                                        "Downtime: hệ thống 14 mã Root Cause + Sub-cause chuẩn hóa.",
                                        "Fix encoding UTF-16 LE → UTF-8 cho file báo cơm.",
                                    ]
                                },
                                {
                                    version: "v1.1.0",
                                    date: "22/03/2026",
                                    color: "rose",
                                    items: [
                                        "Nâng cấp theme sang Đỏ Intersnack (Alizarin Crimson) + glassmorphism.",
                                        "Logic KPI tự động đổi màu Xanh/Đỏ theo target.",
                                        "Custom Tooltip hiệu ứng glassmorphism cho 15+ phòng ban.",
                                    ]
                                },
                            ].map(({ version, date, color, items }) => (
                                <div key={version} className={`border-l-2 pl-4 border-${color}-400`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`text-xs font-mono bg-${color}-50 text-${color}-700 px-2 py-0.5 rounded border border-${color}-200 font-bold`}>{version}</span>
                                        <span className="text-xs text-muted-foreground">{date}</span>
                                    </div>
                                    <ul className="list-disc pl-5 space-y-1 text-[13px] text-slate-700">
                                        {items.map((item, i) => <li key={i}>{item}</li>)}
                                    </ul>
                                </div>
                            ))}
                        </section>
                    )}

                    <div className="pt-2 text-xs text-muted-foreground text-center border-t">
                        VICC LA Factory Dashboard <strong className="font-mono text-primary">v1.3.0</strong> · Phát triển & hỗ trợ: Vũ Huỳnh 🧡
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
