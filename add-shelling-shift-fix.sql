-- Bước 1: Thêm cột `shift_name` vào bảng `shelling_line_daily` (nếu chưa có)
ALTER TABLE public.shelling_line_daily ADD COLUMN IF NOT EXISTS shift_name VARCHAR(50);

-- Bước 2: Điền giá trị mặc định cho dữ liệu cũ để tránh lỗi khi tạo Unique Constraint mới
UPDATE public.shelling_line_daily SET shift_name = 'Ca 1' WHERE shift_name IS NULL;

-- Bước 3: Xóa Unique Constraint cũ (Gồm 2 key work_date và line_code)
ALTER TABLE public.shelling_line_daily DROP CONSTRAINT IF EXISTS shelling_line_daily_work_date_line_code_key;

-- Bước 4: Tạo Unique Constraint mới (Gồm 3 key để cho phép lưu nhiều ca trong 1 ngày)
ALTER TABLE public.shelling_line_daily ADD CONSTRAINT shelling_line_daily_work_date_line_code_shift_key UNIQUE (work_date, line_code, shift_name);
