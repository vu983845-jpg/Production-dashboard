# Hệ thống Quản lý Sản lượng Nhà máy (Factory KPI Dashboard)

Đây là dự án quản lý định mức sản lượng, báo cáo theo thực tế (Actual vs Plan), Yield, tồn WIP và Downtime dành cho nhà máy. Hệ thống được xây dựng bằng **Next.js (App Router)** và **Supabase** (Postgres + Auth + Row Level Security).

## 1. Yêu cầu hệ thống

- Node.js >= 18.17 (Khuyến khích v20.x lít)
- npm hoặc pnpm
- Một tài khoản [Supabase](https://supabase.com)
- Một tài khoản [Vercel](https://vercel.com) (nếu cần deploy)
- GitHub account

## 2. Hướng dẫn thiết lập Supabase

### Bước 2.1: Tạo Project Supabase
1. Đăng nhập vào [Supabase](https://supabase.com).
2. Tạo một Project mới. Chờ một lát để database khởi tạo.

### Bước 2.2: Lắp đặt Schema
1. Mở file `schema.sql` (được đính kèm sẵn trong tệp dự án hoặc folder cha `c:\Users\Cashew\.gemini\PPE\schema.sql`).
2. Vào trang Dashboard của Supabase > Chọn menu **SQL Editor**.
3. Tạo một truy vấn mới (New Query), dán toàn bộ nội dung file `schema.sql` vào.
4. Bấm **Run** để thiết lập:
   - Các bảng Dữ liệu (departments, profiles, daily_plan, daily_actual, daily_kpi, audit_logs).
   - View tổng hợp (`v_dashboard_base`, `v_dashboard_daily`, `v_dashboard_total_daily`).
   - Trigger tự động lưu thông tin Audit, tự cập nhật updated_at và tự động tạo Profile khi user mới đăng ký.
   - Row Level Security (RLS) để phân quyền tự động theo hệ thống Role.
   - Seed dữ liệu (Các bộ phận trong nhà máy).

### Bước 2.3: Tạo tài khoản Admin mặc định
1. Vào mục **Authentication** trong Supabase > Chọn **Users**.
2. Thêm một User mới qua email (Vd: `admin@yourfactory.com` / `password123`).
3. Mặc định user vừa sinh ra sẽ là role `viewer`. Tiến hành nâng cấp thành admin:
   - Vào **Table Editor** > Bảng `profiles`.
   - Tìm user vừa tạo tương ứng qua Id, sửa cột `role` thành `admin` và `full_name` lại cho hợp lệ. Cột `department_id` có thể để NULL (vì Admin có thể vào tất cả phòng ban).
   
*(Lưu ý: Đối với Dept_User, bạn cũng tạo user tương tự và edit field role thành `dept_user`, field `department_id` là UUID của phòng ban tương ứng trong bảng `departments`)*

## 3. Khởi chạy dự án cục bộ (Local Development)

### Cài đặt thư viện
```bash
npm install
# hoặc 
yarn install
```

### Thiết lập biến môi trường (.env.local)
Tạo tệp `.env.local` ở thư mục gốc của dự án `factory-dashboard` và điền cấu hình API:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```
*(Lấy 2 thông số này trong mục **Project Settings > API** trên Supabase)*

### Chạy development server
```bash
npm run dev
```
Trang web sẽ hiển thị ở [http://localhost:3000](http://localhost:3000). Đăng nhập bằng tài khoản tạo trong bước 2.3.

## 4. Deploy lên Vercel

1. **Đẩy mã nguồn lên GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. **Triển khai trên Vercel**:
   - Đăng nhập [Vercel](https://vercel.com).
   - Chọn **Add New...** > **Project**.
   - Cấp quyền Import cho Repository vừa push lên ở bước 1.
   - Tại trang thiết lập Project Vercel, kéo xuống phần **Environment Variables**.
   - Thêm 2 biến môi trường đã có trong `.env.local` vào:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Nhấn **Deploy**. Quá trình build trên máy chủ Vercel sẽ tự động diễn ra.
   
Sau khi Deploy xong, Vercel sẽ cấp cho bạn một domain `.vercel.app`. Bạn có thể gắn tên miền tùy chỉnh ở menu Domain của Vercel!

---

**Cấu trúc tệp tiêu biểu**:
- `/src/app/login`: Trang đăng nhập
- `/src/app/(protected)/dashboard`: Bảng KPI, Charts báo cáo và Download CSV
- `/src/app/(protected)/input`: Khu vực nhập liêu Ngày/Bộ phận
- `/src/app/(protected)/admin/plan`: Tính năng nhập kế hoạch (Plan)
- `/src/components/ui`: Shadcn/ui Components

**Chúc bạn thành công!** 🚀
