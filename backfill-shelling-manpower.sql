-- backfill-shelling-manpower.sql
-- Cập nhật nhân sự cố định cho các ngày đã qua trong shelling_line_daily
-- Chỉ update dòng có actual_ton > 0 và manpower = 0 (chưa nhập)
-- Định mức: Line A=2, B=2, C=2, D1=2, D2=3

UPDATE shelling_line_daily
SET
    manpower = CASE
        WHEN line_code = 'A'  THEN 2
        WHEN line_code = 'B'  THEN 2
        WHEN line_code = 'C'  THEN 2
        WHEN line_code = 'D1' THEN 2
        WHEN line_code = 'D2' THEN 3
        ELSE manpower
    END,
    updated_at = NOW()
WHERE
    actual_ton > 0         -- Line đang chạy
    AND (manpower IS NULL OR manpower = 0);  -- Chưa có nhân sự được nhập

-- Kiểm tra kết quả sau khi update
SELECT
    work_date,
    line_code,
    shift_name,
    actual_ton,
    manpower
FROM shelling_line_daily
WHERE actual_ton > 0
ORDER BY work_date DESC, line_code, shift_name
LIMIT 50;
