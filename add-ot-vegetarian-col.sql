-- Thêm column ot_vegetarian vào bảng meal_headcount
ALTER TABLE meal_headcount
ADD COLUMN IF NOT EXISTS ot_vegetarian integer NOT NULL DEFAULT 0;

-- Xác nhận đã thêm thành công
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'meal_headcount'
  AND column_name = 'ot_vegetarian';
