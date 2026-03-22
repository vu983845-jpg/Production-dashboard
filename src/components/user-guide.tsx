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
                    <DialogTitle className="text-2xl font-black text-primary">Cẩm Nang Sống Còn Bếp VICC LA 📖✨</DialogTitle>
                    <DialogDescription className="text-md mt-1">
                        Chào ae! Bản gốc thì lề lối quá, nên VH tóm tắt lại "sương sương" những tính năng ruột của App cho mọi người dễ xài nhé.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 text-sm text-foreground mt-4">
                    <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h3 className="font-bold text-lg mb-2 text-slate-800 flex items-center gap-2">📊 1. Command Center (Dashboard Tâm Linh)</h3>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600">
                            <li><strong>MTD & Phần Trăm Đạt:</strong> Cứ xanh lá là ngon, vàng là cảnh báo, còn đỏ là... tự hiểu kpi tới đâu nhé!</li>
                            <li><strong>Chế độ linh hoạt:</strong> Bấm vào các bộ phận (Bóc Vỏ, Lụa, Color Sorter...) là xem được Biểu đồ hoặc Chi tiết (xem Tỷ lệ bể, Sót lụa, SW, ISP). Riêng Color Sorter nay có cả Biểu đồ cột ISP xịn xò rồi!</li>
                            <li><strong>Điện - Nước - Củi & CO2e:</strong> Liếc qua là biết hôm nay đốt bao nhiêu tiền, quạt bao nhiêu khói so với Kế Hoạch.</li>
                            <li><strong>Nút Export thần thánh:</strong> Cần số để báo cáo gấp? Góc trên cùng bên phải, nhét nút <kbd className="bg-white px-1 py-0.5 rounded border text-[11px] shadow-sm font-mono">Export CSV</kbd> tải tắt cái rẹt.</li>
                        </ul>
                    </section>

                    <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h3 className="font-bold text-lg mb-2 text-slate-800 flex items-center gap-2">✍️ 2. Nộp số liệu (Data Input)</h3>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600">
                            <li>Thánh địa của các anh chị Ca trưởng/Tổ phó. Nhập Sản lượng, Cont, Wip...</li>
                            <li>Khu vực <strong>Shelling (Bóc Vỏ)</strong> thì tha hồ mà chọn Ca Trưởng (Tâm/Linh/Trí), nhập tỷ lệ bể, theo dõi số giờ chạy cực kì chi tiết luôn.</li>
                            <li>Nhập xong nhớ ấn nút <strong>Lưu</strong>, đừng quên nha. Lưu thành công là nó báo cái "Bíp" xanh lẹ kìa!</li>
                        </ul>
                    </section>

                    <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h3 className="font-bold text-lg mb-2 text-slate-800 flex items-center gap-2">📈 3. Kế Hoạch (Phòng Admin) & Báo Cáo (Report)</h3>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600">
                            <li><strong>Setup Plan:</strong> Admin chỉ việc Tải Mẫu Excel ⟶ Điền Số ⟶ Ném vào lại (Import). Thế là Dashboard có trò để hiển thị vạch mục tiêu ngay!</li>
                            <li><strong>Báo Cáo (Report Tab):</strong> Chỗ gom mọi thể loại số theo Tháng/Bộ Phận. Có sẵn nút rớt mồ hôi <strong>Xuất Excel</strong> 2 sheets (Tóm tắt + Chit tiết theo ngày). Cuối tháng báo số sướng tê người.</li>
                        </ul>
                    </section>

                    <section className="bg-red-50 p-4 rounded-xl border border-red-100">
                        <h3 className="font-bold text-lg mb-2 text-red-800 flex items-center gap-2">🤖 4. Hỏi - Đáp Nhanh Nhạy</h3>
                        <ul className="list-disc pl-5 space-y-2 text-red-700">
                            <li><strong>Downtime (Thời gian chết máy):</strong> Dashboard giờ hiển thị theo đơn vị "Giờ" (h) rồi nha. Số liệu lấy trực tiếp và Auto-sync từ thần y <strong>DDS Meeting App</strong> hằng ngày!</li>
                            <li><strong>Thấy số ảo, lỗi tè le?</strong> Inb gấp cho <strong className="bg-red-200 px-1 rounded">Vũ Huỳnh (V.H)</strong> xử lý nóng trong vòng 1 nốt nhạc. Bị khóa mõm (nhầm, thiếu quyền) cũng pm luôn!</li>
                        </ul>
                    </section>

                    <section className="bg-gradient-to-br from-indigo-50 to-white p-4 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2"><span className="text-[10px] font-mono bg-indigo-100 text-indigo-700 px-2 py-1 rounded shadow-sm font-bold uppercase tracking-widest">Mới Nhất Mới Nhất!!</span></div>
                        <h3 className="font-bold text-lg mb-3 text-indigo-900 flex items-center gap-2">✨ 5. Trạm Cập Nhật (Changelog)</h3>
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
                        <p>Làm vì đam mê, hệ thống được chắp vá và build bằng tình thương mến thương <strong className="font-mono text-primary">v1.1.0</strong>. 🧡</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
