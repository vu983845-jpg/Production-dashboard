-- Thêm cột shift_leader vào bảng shelling_line_daily để theo dõi Tổ Trưởng phụ trách Ca
ALTER TABLE public.shelling_line_daily ADD COLUMN IF NOT EXISTS shift_leader VARCHAR(100);

-- Vừa tạo xong cột mới, nên cẩn thận reset lại bộ đệm API của PostgREST ngay lập tức!
NOTIFY pgrst, 'reload schema';
