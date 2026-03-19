-- Thêm cột manpower vào bảng shelling_line_daily để lưu số lượng nhân sự tham gia từng ca
ALTER TABLE public.shelling_line_daily ADD COLUMN IF NOT EXISTS manpower NUMERIC DEFAULT 0;
