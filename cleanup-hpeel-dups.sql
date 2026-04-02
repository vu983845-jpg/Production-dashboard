-- ══════════════════════════════════════════════════════════════════════════════
-- CLEANUP meal_headcount DATA — April 2026
-- Chạy từng bước, đọc kết quả SELECT trước khi DELETE/UPDATE
--
-- Nội dung:
--   Bước 0: Kiểm tra hiện trạng
--   Bước 1: Xóa rows HAND trùng với HPEEL
--   Bước 2: Migrate HAND → HPEEL
--   Bước 3: Gán dept_id cho rows HPEEL null
--   Bước 4: Xóa rows HPEEL generic khi đã có sub-group
--   Bước 5: Xóa rows tên kết thúc dấu phẩy (parsing bug cũ)
--   Bước 6: ADD COLUMN ot_vegetarian (nếu chưa có)
--   Bước 7: Kiểm tra tổng kết
--
-- DEPT IDs:
--   HPEEL = 321918c2-8a35-45b3-9c6c-5f68966776bf  (Hand Peeling - ĐÚNG)
--   HAND  = e584b706-e933-4a28-b091-2b784a845408  (HANDPEELING  - LEGACY)
-- ══════════════════════════════════════════════════════════════════════════════


-- ── BƯỚC 0: KIỂM TRA TRƯỚC ───────────────────────────────────────────────────

-- 0a. Rows 'HPEEL' không có department_id
SELECT COUNT(*) AS hpeel_null_dept FROM meal_headcount
WHERE department_name = 'HPEEL' AND department_id IS NULL;

-- 0b. Rows thuộc dept HAND (legacy)
SELECT COUNT(*) AS hand_rows FROM meal_headcount
WHERE department_id = 'e584b706-e933-4a28-b091-2b784a845408';

-- 0c. Conflict: cùng (work_date, shift, department_name) có ở cả HAND lẫn HPEEL?
SELECT
  h.work_date, h.shift, h.department_name,
  h.official_present AS hand_present,
  p.official_present AS hpeel_present
FROM meal_headcount h
JOIN meal_headcount p
  ON p.work_date       = h.work_date
 AND p.shift           = h.shift
 AND p.department_name = h.department_name
 AND p.department_id   = '321918c2-8a35-45b3-9c6c-5f68966776bf'
WHERE h.department_id = 'e584b706-e933-4a28-b091-2b784a845408'
ORDER BY h.work_date DESC;

-- 0d. Xem sub-group rows sẽ bị ảnh hưởng (HPEEL generic khi đã có sub)
SELECT
  h.id, h.work_date, h.shift, h.department_name, h.official_present,
  COUNT(sub.id) AS subgroup_count
FROM meal_headcount h
JOIN meal_headcount sub
  ON sub.work_date     = h.work_date
 AND sub.shift         = h.shift
 AND sub.department_id = '321918c2-8a35-45b3-9c6c-5f68966776bf'
 AND sub.department_name <> 'HPEEL'
WHERE h.department_name = 'HPEEL'
  AND h.department_id   = '321918c2-8a35-45b3-9c6c-5f68966776bf'
GROUP BY h.id, h.work_date, h.shift, h.department_name, h.official_present
HAVING COUNT(sub.id) > 0
ORDER BY h.work_date DESC;


-- ══════════════════════════════════════════════════════════════════════════════
-- BƯỚC 1: XÓA ROWS HAND TRÙNG VỚI HPEEL
-- (Xóa bản trong dept HAND nếu đã có bản tương đương trong HPEEL)
-- ══════════════════════════════════════════════════════════════════════════════

DELETE FROM meal_headcount
WHERE department_id = 'e584b706-e933-4a28-b091-2b784a845408'
  AND (work_date, shift, department_name) IN (
      SELECT work_date, shift, department_name
      FROM meal_headcount
      WHERE department_id = '321918c2-8a35-45b3-9c6c-5f68966776bf'
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- BƯỚC 2: MIGRATE CÁC ROWS CÒN LẠI HAND → HPEEL
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE meal_headcount
SET department_id = '321918c2-8a35-45b3-9c6c-5f68966776bf'
WHERE department_id = 'e584b706-e933-4a28-b091-2b784a845408';

-- Kiểm tra: phải = 0
SELECT COUNT(*) AS hand_rows_remaining FROM meal_headcount
WHERE department_id = 'e584b706-e933-4a28-b091-2b784a845408';


-- ══════════════════════════════════════════════════════════════════════════════
-- BƯỚC 3: GÁN dept_id CHO ROWS 'HPEEL' ĐANG NULL
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE meal_headcount
SET department_id = '321918c2-8a35-45b3-9c6c-5f68966776bf'
WHERE department_name = 'HPEEL'
  AND department_id IS NULL;

-- Kiểm tra: phải = 0
SELECT COUNT(*) AS null_dept_remaining FROM meal_headcount
WHERE department_name = 'HPEEL' AND department_id IS NULL;


-- ══════════════════════════════════════════════════════════════════════════════
-- BƯỚC 4: XÓA ROWS HPEEL GENERIC KHI ĐÃ CÓ SUB-GROUP CÙNG NGÀY+CA
-- (Tránh double-count: "HPEEL 89 người" + "Liên 45 + Dung 44" = đếm 2 lần)
-- ══════════════════════════════════════════════════════════════════════════════

DELETE FROM meal_headcount
WHERE id IN (
    SELECT h.id
    FROM meal_headcount h
    WHERE h.department_name = 'HPEEL'
      AND h.department_id   = '321918c2-8a35-45b3-9c6c-5f68966776bf'
      AND EXISTS (
          SELECT 1 FROM meal_headcount sub
          WHERE sub.work_date     = h.work_date
            AND sub.shift         = h.shift
            AND sub.department_id = '321918c2-8a35-45b3-9c6c-5f68966776bf'
            AND sub.department_name <> 'HPEEL'
      )
);


-- ══════════════════════════════════════════════════════════════════════════════
-- BƯỚC 5: XÓA ROWS CÓ TÊN KẾT THÚC DẤU PHẨY (lỗi parsing cũ)
-- Ví dụ: "Manual Peeling (Liên),"
-- ══════════════════════════════════════════════════════════════════════════════

-- Xem trước
SELECT id, work_date, shift, department_name
FROM meal_headcount
WHERE department_name ~ ',$'
ORDER BY work_date DESC;

-- Xóa
DELETE FROM meal_headcount
WHERE department_name ~ ',$';


-- ══════════════════════════════════════════════════════════════════════════════
-- BƯỚC 6: THÊM CỘT ot_vegetarian (suất chay OT)
-- Bỏ qua nếu cột đã tồn tại (IF NOT EXISTS an toàn)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE meal_headcount
ADD COLUMN IF NOT EXISTS ot_vegetarian INTEGER NOT NULL DEFAULT 0;

-- Xác nhận cột đã có
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'meal_headcount'
  AND column_name = 'ot_vegetarian';


-- ══════════════════════════════════════════════════════════════════════════════
-- BƯỚC 7: KIỂM TRA TỔNG KẾT
-- ══════════════════════════════════════════════════════════════════════════════

-- 7a. Tất cả records HPEEL/HAND hiện tại
SELECT
  department_id,
  department_name,
  COUNT(*)         AS rows,
  MIN(work_date)   AS first_date,
  MAX(work_date)   AS last_date,
  SUM(official_present + seasonal_present) AS total_pax
FROM meal_headcount
WHERE department_id = '321918c2-8a35-45b3-9c6c-5f68966776bf'
   OR department_name ILIKE '%handpeel%'
   OR department_name ILIKE '%manual peel%'
   OR department_name ILIKE '%grading%'
   OR department_name ILIKE '%hpeel%'
   OR department_name ILIKE '%liên%'
   OR department_name ILIKE '%dung%'
GROUP BY department_id, department_name
ORDER BY department_name;

-- 7b. Rows còn sót với dept HAND (phải = 0)
SELECT COUNT(*) AS hand_legacy_remaining FROM meal_headcount
WHERE department_id = 'e584b706-e933-4a28-b091-2b784a845408';

-- 7c. Kiểm tra duplicate constraint (trùng work_date + department_name + shift)
SELECT work_date, department_name, shift, COUNT(*) AS cnt
FROM meal_headcount
GROUP BY work_date, department_name, shift
HAVING COUNT(*) > 1
ORDER BY work_date DESC
LIMIT 20;
