-- Xem các bản ghi HANDPEELING trùng ngày 28/3/2026 ca 2
-- để biết cần xóa cái nào
SELECT id, work_date, department_name, department_id, shift, official_present, created_at
FROM meal_headcount
WHERE work_date = '2026-03-28'
  AND shift = '2'
  AND (
    department_name ILIKE '%handpeel%'
    OR department_name ILIKE '%hand peel%'
    OR department_name ILIKE '%manual peel%'
    OR department_name ILIKE '%grading%'
    OR department_name ILIKE '%hpeel%'
  )
ORDER BY created_at;


-- Sau khi xem, xóa các bản ghi có department_name bị sai/trùng
-- Ví dụ: Giữ lại bản ghi có department_id đúng (HPEEL_DUNG),
--        Xóa các bản ghi "HANDPEELING" và "Handpeeling (Dung)," (có dấu phẩy thừa)

-- XÓA các bản ghi có department_name kết thúc bằng dấu phẩy (lỗi parsing cũ):
DELETE FROM meal_headcount
WHERE department_name ~ ',$'
  AND work_date >= '2026-03-01';

-- XÓA bản ghi với tên "HANDPEELING" (generic, không có sub-group) nếu đã có bản ghi sub-group:
-- (Chạy SELECT xem trước, rồi mới DELETE)
