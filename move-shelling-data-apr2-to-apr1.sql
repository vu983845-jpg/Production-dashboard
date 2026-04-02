-- ============================================================
-- DỜI DATA SHELLING từ 2/4/2026 → 1/4/2026
-- Chạy từng STEP một trong Supabase SQL Editor
-- ============================================================

-- ── BƯỚC 0: XEM trước data sẽ bị dời ───────────────────────
-- Chạy bước này trước để kiểm tra đúng data không

-- 0a. shelling_line_daily ngày 2/4
SELECT work_date, line_code, shift_name, actual_ton, run_hours, broken_pct, shift_leader
FROM shelling_line_daily
WHERE work_date IN ('2026-04-01', '2026-04-02')
ORDER BY work_date, line_code, shift_name;

-- 0b. daily_actual ngày 2/4 của bộ phận SHELL
SELECT da.work_date, d.code, da.actual_ton, da.pass1_ton, da.pass2_ton
FROM daily_actual da
JOIN departments d ON d.id = da.department_id
WHERE d.code = 'SHELL'
  AND da.work_date IN ('2026-04-01', '2026-04-02')
ORDER BY da.work_date;

-- 0c. daily_kpi ngày 2/4 của SHELL
SELECT dk.work_date, d.code, dk.electricity_meter_reading, dk.wip_open_ton, dk.wip_close_ton
FROM daily_kpi dk
JOIN departments d ON d.id = dk.department_id
WHERE d.code = 'SHELL'
  AND dk.work_date IN ('2026-04-01', '2026-04-02')
ORDER BY dk.work_date;

-- ============================================================
-- ── BƯỚC 1: DỜI shelling_line_daily ────────────────────────
-- !! Chỉ chạy nếu bước 0 xác nhận data 1/4 CHƯA CÓ hoặc bạn muốn ghi đè !!
-- ============================================================

BEGIN;

-- 1a. Xóa record ngày 1/4 (nếu có) để tránh conflict
DELETE FROM shelling_line_daily
WHERE work_date = '2026-04-01';

-- 1b. Copy data từ 2/4 sang 1/4
INSERT INTO shelling_line_daily (
    work_date, line_code, shift_name, shift_leader,
    actual_ton, run_hours, downtime_min,
    manpower, broken_pct, size, note,
    updated_by, updated_at
)
SELECT
    '2026-04-01'::date,   -- đổi ngày → 1/4
    line_code, shift_name, shift_leader,
    actual_ton, run_hours, downtime_min,
    manpower, broken_pct, size, note,
    updated_by, now()
FROM shelling_line_daily
WHERE work_date = '2026-04-02';

-- 1c. Xóa record gốc ngày 2/4
DELETE FROM shelling_line_daily
WHERE work_date = '2026-04-02';

-- Kiểm tra kết quả trước khi commit
SELECT work_date, line_code, shift_name, actual_ton, run_hours
FROM shelling_line_daily
WHERE work_date IN ('2026-04-01', '2026-04-02')
ORDER BY work_date, line_code, shift_name;

COMMIT;
-- Nếu sai thì dùng ROLLBACK; thay vì COMMIT;

-- ============================================================
-- ── BƯỚC 2: DỜI daily_actual (tổng sản lượng SHELL) ────────
-- ============================================================

BEGIN;

-- Lấy department_id của SHELL
DO $$
DECLARE
    v_shell_dept_id uuid;
BEGIN
    SELECT id INTO v_shell_dept_id FROM departments WHERE code = 'SHELL' LIMIT 1;
    
    -- Xóa record ngày 1/4 của SHELL (nếu có)
    DELETE FROM daily_actual
    WHERE department_id = v_shell_dept_id AND work_date = '2026-04-01';
    
    -- Cập nhật work_date từ 2/4 → 1/4
    UPDATE daily_actual
    SET work_date = '2026-04-01', updated_at = now()
    WHERE department_id = v_shell_dept_id AND work_date = '2026-04-02';
    
    RAISE NOTICE 'daily_actual: Đã dời % rows', ROW_COUNT;
END $$;

COMMIT;

-- ============================================================
-- ── BƯỚC 3: DỜI daily_kpi (điện + KPI của SHELL) ───────────
-- ============================================================

BEGIN;

DO $$
DECLARE
    v_shell_dept_id uuid;
BEGIN
    SELECT id INTO v_shell_dept_id FROM departments WHERE code = 'SHELL' LIMIT 1;
    
    -- Xóa record ngày 1/4 của SHELL trong daily_kpi (nếu có)
    DELETE FROM daily_kpi
    WHERE department_id = v_shell_dept_id AND work_date = '2026-04-01';
    
    -- Cập nhật work_date từ 2/4 → 1/4
    UPDATE daily_kpi
    SET work_date = '2026-04-01', updated_at = now()
    WHERE department_id = v_shell_dept_id AND work_date = '2026-04-02';
    
    RAISE NOTICE 'daily_kpi: Đã dời % rows', ROW_COUNT;
END $$;

COMMIT;

-- ============================================================
-- ── BƯỚC 4: DỜI downtime_events của SHELL (nếu có) ─────────
-- ============================================================

BEGIN;

DO $$
DECLARE
    v_shell_dept_id uuid;
BEGIN
    SELECT id INTO v_shell_dept_id FROM departments WHERE code = 'SHELL' LIMIT 1;

    UPDATE downtime_events
    SET work_date = '2026-04-01', updated_at = now()
    WHERE department_id = v_shell_dept_id AND work_date = '2026-04-02';
    
    RAISE NOTICE 'downtime_events: Đã dời % rows', ROW_COUNT;
END $$;

COMMIT;

-- ============================================================
-- ── BƯỚC 5: XÁC NHẬN kết quả cuối cùng ────────────────────
-- ============================================================

-- shelling_line_daily
SELECT 'shelling_line_daily' as table_name, work_date, line_code, shift_name, actual_ton
FROM shelling_line_daily
WHERE work_date IN ('2026-04-01', '2026-04-02')
ORDER BY work_date, line_code, shift_name;

-- daily_actual
SELECT 'daily_actual' as table_name, da.work_date, d.code, da.actual_ton
FROM daily_actual da
JOIN departments d ON d.id = da.department_id
WHERE d.code = 'SHELL' AND da.work_date IN ('2026-04-01', '2026-04-02');

-- daily_kpi
SELECT 'daily_kpi' as table_name, dk.work_date, d.code, dk.electricity_meter_reading
FROM daily_kpi dk
JOIN departments d ON d.id = dk.department_id
WHERE d.code = 'SHELL' AND dk.work_date IN ('2026-04-01', '2026-04-02');
