-- Thêm cột downtime_min vào bảng shelling_line_daily
ALTER TABLE public.shelling_line_daily ADD COLUMN IF NOT EXISTS downtime_min NUMERIC DEFAULT 0;
