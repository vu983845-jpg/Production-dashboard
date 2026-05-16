# Quy trình deploy Production Dashboard

## Project production đúng

- Domain thật: https://la.icc.info.vn
- Vercel project: `production-dashboard`
- Vercel account/team trên dashboard: `hyunhphuongvu-6144s-projects`
- GitHub repo: `git@github.com:vu983845-jpg/Production-dashboard.git`
- Branch deploy: `main`
- Cách deploy đúng: commit và push lên `main`; Vercel tự động build/deploy lên `la.icc.info.vn`.

## Không deploy nhầm project cũ

Không dùng link/project local cũ `factory-dashboard` / `factory-dashboard-tau.vercel.app` cho production.
File `.vercel` local đã được xóa vì nó trỏ sang sai Vercel project, dễ làm deploy nhầm URL.

Nếu cần dùng Vercel CLI tại máy này, phải link lại đúng project trước:

```bash
vercel link
# Chọn account/team: hyunhphuongvu-6144s-projects
# Chọn project: production-dashboard
```

Chỉ chạy deploy CLI sau khi xác nhận project đang link là `production-dashboard`.

## Các bước deploy khuyến nghị

```bash
git status
git add <files>
git commit -m "Mô tả thay đổi"
git push origin main
```

Sau khi push, vào Vercel project `production-dashboard` để xem deployment mới. Khi trạng thái `Ready`, domain `https://la.icc.info.vn` sẽ nhận bản mới.

## Note cache / dữ liệu realtime

Nếu dữ liệu SCADA/V-NET bị kẹt, báo offline hoặc dữ liệu mô phỏng, kiểm tra `src/app/api/vnet-scrape/route.ts` và các API realtime liên quan có dùng `cache: "no-store"` chưa. Tránh dùng `next: { revalidate: ... }` cho dữ liệu realtime.
