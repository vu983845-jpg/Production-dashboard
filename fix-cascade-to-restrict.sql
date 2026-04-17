-- Đổi ON DELETE CASCADE → ON DELETE RESTRICT cho tất cả bảng liên kết departments
-- Chạy file này 1 lần trên Supabase SQL Editor
-- Không mất data, không ảnh hưởng hoạt động hệ thống

BEGIN;

-- 1. daily_actual
ALTER TABLE public.daily_actual
    DROP CONSTRAINT IF EXISTS daily_actual_department_id_fkey;
ALTER TABLE public.daily_actual
    ADD CONSTRAINT daily_actual_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES public.departments(id)
    ON DELETE RESTRICT;

-- 2. daily_plan
ALTER TABLE public.daily_plan
    DROP CONSTRAINT IF EXISTS daily_plan_department_id_fkey;
ALTER TABLE public.daily_plan
    ADD CONSTRAINT daily_plan_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES public.departments(id)
    ON DELETE RESTRICT;

-- 3. daily_kpi
ALTER TABLE public.daily_kpi
    DROP CONSTRAINT IF EXISTS daily_kpi_department_id_fkey;
ALTER TABLE public.daily_kpi
    ADD CONSTRAINT daily_kpi_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES public.departments(id)
    ON DELETE RESTRICT;

-- 4. downtime_events
ALTER TABLE public.downtime_events
    DROP CONSTRAINT IF EXISTS downtime_events_department_id_fkey;
ALTER TABLE public.downtime_events
    ADD CONSTRAINT downtime_events_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES public.departments(id)
    ON DELETE RESTRICT;

-- 5. peeling_line_daily
ALTER TABLE public.peeling_line_daily
    DROP CONSTRAINT IF EXISTS peeling_line_daily_department_id_fkey;
ALTER TABLE public.peeling_line_daily
    ADD CONSTRAINT peeling_line_daily_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES public.departments(id)
    ON DELETE RESTRICT;

-- 6. shelling_line_daily (nếu có FK)
ALTER TABLE public.shelling_line_daily
    DROP CONSTRAINT IF EXISTS shelling_line_daily_department_id_fkey;
ALTER TABLE public.shelling_line_daily
    ADD CONSTRAINT shelling_line_daily_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES public.departments(id)
    ON DELETE RESTRICT;

-- 7. cs_shift_daily
ALTER TABLE public.cs_shift_daily
    DROP CONSTRAINT IF EXISTS cs_shift_daily_department_id_fkey;
ALTER TABLE public.cs_shift_daily
    ADD CONSTRAINT cs_shift_daily_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES public.departments(id)
    ON DELETE RESTRICT;

COMMIT;

-- Xác nhận kết quả
SELECT
    tc.table_name,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE kcu.column_name = 'department_id'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;
