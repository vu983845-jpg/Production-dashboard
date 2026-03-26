-- Thêm các cột còn thiếu vào bảng downtime_events (tương thích DDS Meeting)
ALTER TABLE public.downtime_events
    ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS end_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS machine_area TEXT,
    ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'Trung bình',
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_ongoing BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS exclude_downtime BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Closed';

-- Cập nhật các bản ghi hiện có: đặt start_time từ work_date, status = 'Closed'
UPDATE public.downtime_events
SET 
    start_time = (work_date::TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'),
    status = 'Closed',
    is_ongoing = false,
    exclude_downtime = false
WHERE start_time IS NULL;
