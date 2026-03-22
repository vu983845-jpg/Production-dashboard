"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { BookOpen } from "lucide-react"

export function UserGuide() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="link" className="text-muted-foreground hover:text-primary gap-2 px-0 h-auto font-normal text-xs flex items-center">
                    <BookOpen className="h-4 w-4" />
                    Hướng dẫn sử dụng
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black text-primary">VICC LA Dashboard Handbook 📖✨</DialogTitle>
                    <DialogDescription className="text-md mt-1">
                        Chào ae! Đây là tóm tắt nhanh các tính năng cốt lõi của hệ thống để Operation Team dễ dàng nắm bắt và tối ưu vận hành.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 text-sm text-foreground mt-4">
                    <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h3 className="font-bold text-lg mb-2 text-slate-800 flex items-center gap-2">📊 1. Command Center (Performance Dashboard)</h3>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600">
                            <li><strong>MTD & Phần Trăm Đạt:</strong> Đạt KPI hiển thị màu Xanh, mức độ Cảnh báo màu Vàng, chưa đạt hiển thị Đỏ.</li>
                            <li><strong>Chế độ chi tiết:</strong> Tracking từng bộ phận (Bóc Vỏ, Lụa, Color Sorter...) với các metric chuyên sâu như Tỷ lệ bể, Sót lụa, SW, ISP...</li>
                            <li><strong>Điện - Nước - Củi & CO2e:</strong> Theo dõi Metrics năng lượng và phát thải thời gian thực so với Target đề ra.</li>
                            <li><strong>Tính năng Export Data:</strong> Có thể trích xuất Database ra CSV với nút <kbd className="bg-white px-1 py-0.5 rounded border text-[11px] shadow-sm font-mono">Export CSV</kbd> ở góc trên màn hình.</li>
                        </ul>
                    </section>

                    <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h3 className="font-bold text-lg mb-2 text-slate-800 flex items-center gap-2">✍️ 2. Nhập số liệu (Data Input)</h3>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600">
                            <li>Khu vực update số liệu theo thời gian thực dành riêng cho Shift Leaders. Nhập Sản lượng, Cont, Wip...</li>
                            <li>Khu vực <strong>Shelling (Bóc Vỏ)</strong> hỗ trợ gán ID Ca Trực tương ứng, lưu lại tracking Tỷ lệ bể và Run Hours.</li>
                            <li>Sau khi nhập liệu, hệ thống yêu cầu nhấn <strong>Lưu</strong> để confirm. Toast thông báo sẽ hiển thị khi data đã được đồng bộ.</li>
                        </ul>
                    </section>

                    <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h3 className="font-bold text-lg mb-2 text-slate-800 flex items-center gap-2">📈 3. Planning & Reporting</h3>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600">
                            <li><strong>Setup Plan:</strong> Sử dụng Template Excel để import chỉ tiêu KPI vào hệ thống. Các biểu đồ sẽ tự động sinh tracking line mục tiêu.</li>
                            <li><strong>Báo Cáo (Report Tab):</strong> Tổng hợp toàn bộ Metrics theo Tháng/Phân xưởng. Tích hợp tính năng <strong>Xuất Excel</strong> (bao gồm Sheet General và Sheet Daily Tracking).</li>
                        </ul>
                    </section>

                    <section className="bg-red-50 p-4 rounded-xl border border-red-100">
                        <h3 className="font-bold text-lg mb-2 text-red-800 flex items-center gap-2">🤖 4. Support & Troubleshooting</h3>
                        <ul className="list-disc pl-5 space-y-2 text-red-700">
                            <li><strong>Downtime Data:</strong> Dashboard tracking tự động đơn vị "Giờ" (Hours). API lấy trực tiếp và Auto-sync từ hệ thống <strong>DDS Meeting App</strong> hằng ngày.</li>
                            <li><strong>Hỗ trợ kỹ thuật:</strong> Gặp sự cố về data hiển thị, bug hoặc cần cấp phép phân quyền, vui lòng liên hệ admin <strong className="bg-red-200 px-1 rounded">Vũ Huỳnh (V.H)</strong> để được support kỹ thuật ngay lập tức.</li>
                        </ul>
                    </section>

                    <section className="bg-gradient-to-br from-indigo-50 to-white p-4 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2"><span className="text-[10px] font-mono bg-indigo-100 text-indigo-700 px-2 py-1 rounded shadow-sm font-bold uppercase tracking-widest">Mới Nhất Mới Nhất!!</span></div>
                        <h3 className="font-bold text-lg mb-3 text-indigo-900 flex items-center gap-2">✨ 5. Changelog Hub</h3>
                        <div className="space-y-3">
                            <div className="border-l-2 border-indigo-400 pl-3">
                                <h4 className="font-bold text-indigo-800 text-sm flex items-center gap-2">🚀 Phiên bản <span className="text-xs font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200 shadow-sm">v1.1.0</span> <span className="text-xs font-normal text-slate-500 italic">22/03/2026</span></h4>
                                <ul className="list-disc pl-5 mt-1.5 space-y-1.5 text-slate-700 text-[13px]">
                                    <li><strong>Thay áo Doanh nghiệp:</strong> Nâng cấp toàn diện màu sắc sang theme <strong>Đỏ Intersnack (Alizarin Crimson)</strong> & phong cách kính mờ cực sang trọng.</li>
                                    <li><strong>Logic Cột thông minh:</strong> Dashboard tự động nhận diện KPI: <strong>Đạt Kế Hoạch ⟶ Đổi màu Xanh Lá 🟢</strong>, Khuyết Kế Hoạch ⟶ Đi màu Đỏ 🔴.</li>
                                    <li>Hệ thống <strong>Custom Tooltip</strong> hiệu ứng nổi bọt khí (glassmorphism) cho toàn bộ 15 phòng ban.</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <div className="pt-4 mt-2 text-xs text-muted-foreground text-center">
                        <p>Hệ thống được phát triển và tối ưu liên tục cập nhật <strong className="font-mono text-primary">v1.1.0</strong>. 🧡</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
