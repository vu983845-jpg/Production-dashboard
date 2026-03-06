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
                    <DialogTitle className="text-xl">Hướng Dẫn Sử Dụng Hệ Thống</DialogTitle>
                    <DialogDescription>
                        Tham khảo các hướng dẫn cơ bản bên dưới để thao tác trên hệ thống Intersnack.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 text-sm text-foreground">
                    <section>
                        <h3 className="font-semibold text-base mb-2 text-primary">1. Báo cáo Tổng quan (Dashboard)</h3>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Xem các biểu đồ tổng hợp về tiến độ hoàn thành Kế hoạch, Thời gian chết máy và Thống kê theo bộ phận.</li>
                            <li>Sử dụng tính năng <strong>Chọn để Lọc Dữ liệu (Filter)</strong> để xem chi tiết theo từng Region (Vùng) hoặc Station (Trạm).</li>
                            <li>Có thể chọn lọc theo khoảng thời gian tùy thích và <strong>Xuất dữ liệu</strong> ra file CSV/Excel nếu cần.</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="font-semibold text-base mb-2 text-primary">2. Ghi nhận Sản xuất (Data Input)</h3>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Chọn <strong>Bộ phận</strong> và <strong>Ngày tháng</strong> để nhập dữ liệu.</li>
                            <li>Nhập các thông số như Thực tế sản xuất (T), Số lần Chết máy (Logs), và các Vấn đề ảnh hưởng tới bộ phận.</li>
                            <li>Nhấn <strong>Lưu Dữ liệu Trạm</strong> để gửi báo cáo lên hệ thống. Đảm bảo trạng thái hiện lên thông báo "Lưu thành công".</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="font-semibold text-base mb-2 text-primary">3. Quản lý Kế hoạch (Plan Setup)</h3>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Dành riêng cho nhóm điều phối Kế hoạch tổng (Plan Managers / Admins).</li>
                            <li>Nhấn <strong>Tải theo Mẫu</strong> để tải form kế hoạch Excel về và điền thông tin cho từng bộ phận.</li>
                            <li>Nhấn <strong>Import Kế hoạch (Excel)</strong> để đẩy dữ liệu lên lại hệ thống. Kế hoạch này sẽ làm mốc KPI cho màn hình Dashboard.</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="font-semibold text-base mb-2 text-primary">4. Vấn đề thường gặp</h3>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li><strong>Không thể chỉnh sửa dữ liệu của ngày quá hạn?</strong> Vui lòng liên hệ Admin trưởng xưởng để mở khóa (Báo cáo muộn).</li>
                            <li><strong>Thiếu tài khoản nhân sự?</strong> Admin có thể vào trang Nhân sự để thêm mới và phân bổ chức vụ (Role).</li>
                        </ul>
                    </section>

                    <div className="pt-4 border-t text-xs text-muted-foreground text-center">
                        Hệ thống điều hành bởi V.H - Thiết kế riêng cho nhà máy Intersnack Cashew.
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
