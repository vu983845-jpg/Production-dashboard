# QUY TRÌNH DEPLOY LÊN VERCEL DỰ ÁN V-NET DASHBOARD

**QUAN TRỌNG:** Tên miền chính thức của web (`www.intersnack.online`) được Vercel tự động liên kết bằng Auto-Deployment thông qua kho chứa (repository) trên **GitHub** (`Production-dashboard`).

Do đó, để đẩy tính năng/sửa lỗi mới lên môi trường thật, **TUYỆT ĐỐI KHÔNG dùng lệnh deploy cục bộ** (`npx vercel --prod`), vì lệnh này chỉ đẩy mã nguồn lên dự án Vercel trung gian (hiện đang ăn vào tên miền bị sai chính tả `intersnack.onlin`).

### CÁC BƯỚC DEPLOY ĐÚNG:
Để cập nhật được tên miền đúng `www.intersnack.online`, chỉ cần commit và đẩy thẳng code lên nhánh `main` của GitHub.

```bash
# B1. Chuyển vào thư mục chứa code website
cd c:\Users\Cashew\.gemini\Dassboard\factory-dashboard

# B2. Lưu các thay đổi
git add .
git commit -m "Mô tả tính năng hoặc lỗi vừa sửa..."

# B3. Đẩy lên nhánh main của GitHub
git push origin main
```

Sau khi chạy xong lệnh `git push`, Vercel sẽ "bắt" được thông báo từ GitHub và tự động chạy quy trình rải code lên server. Quá trình này mất khoảng 1-2 phút cho đến khi `www.intersnack.online` nhận bản mới nhất!

### NOTE THÊM VỀ VẤN ĐỀ CACHE & LỖI "DỮ LIỆU MÔ PHỎNG":
Ghi nhớ nếu sử dụng hàm `fetch()` trong Next.js App Router:
Vercel Edge rất hay lưu bộ nhớ tạm (aggressive caching). Nếu dữ liệu SCADA bị kẹt lại báo **Offline** hay **Dữ liệu mô phỏng**, phải check ngay trong file chức năng `src/app/api/vnet-scrape/route.ts` xem đã cấu hình `cache: "no-store"` chưa! (Tuyệt đối không dùng `next: { revalidate: xxx }` nếu đó là dữ liệu Real-time).
