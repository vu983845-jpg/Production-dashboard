-- 1. Thêm các cột KPI target vào bảng daily_plan
ALTER TABLE public.daily_plan ADD COLUMN IF NOT EXISTS target_broken_pct numeric;
ALTER TABLE public.daily_plan ADD COLUMN IF NOT EXISTS target_unpeel_pct numeric;
ALTER TABLE public.daily_plan ADD COLUMN IF NOT EXISTS target_sw_pct numeric;
ALTER TABLE public.daily_plan ADD COLUMN IF NOT EXISTS target_isp_pct numeric;
ALTER TABLE public.daily_plan ADD COLUMN IF NOT EXISTS target_yield_pct numeric;

-- 2. Thêm các cột KPI thực tế vào bảng daily_kpi
ALTER TABLE public.daily_kpi ADD COLUMN IF NOT EXISTS isp_pct numeric NOT NULL DEFAULT 0;
ALTER TABLE public.daily_kpi ADD COLUMN IF NOT EXISTS sw_pct numeric NOT NULL DEFAULT 0;

-- 3. Xóa View cũ nếu có rồi tạo mới để tránh lỗi 42P16
DROP VIEW IF EXISTS public.v_dashboard_total_daily CASCADE;
DROP VIEW IF EXISTS public.v_dashboard_daily CASCADE;

-- 4. Cập nhật View v_dashboard_daily
CREATE OR REPLACE VIEW public.v_dashboard_daily AS
SELECT
    b.work_date,
    b.department_id,
    d.code as dept_code,
    d.name_vi as dept_name_vi,
    d.name_en as dept_name_en,
    d.sort_order as dept_sort_order,
    COALESCE(p.plan_ton, 0) as plan_ton,
    COALESCE(a.actual_ton, 0) as actual_ton,
    CASE WHEN COALESCE(p.plan_ton, 0) > 0 THEN (COALESCE(a.actual_ton, 0) / p.plan_ton) * 100 ELSE 0 END as achivement_pct,
    COALESCE(a.actual_ton, 0) - COALESCE(p.plan_ton, 0) as variance_ton,
    COALESCE(k.wip_open_ton, 0) as wip_open_ton,
    COALESCE(k.wip_close_ton, 0) as wip_close_ton,
    COALESCE(k.input_ton, 0) as input_ton,
    COALESCE(k.good_output_ton, 0) as good_output_ton,
    CASE WHEN COALESCE(k.input_ton, 0) > 0 THEN (COALESCE(k.good_output_ton, 0) / k.input_ton) * 100 ELSE NULL END as yield_pct,
    COALESCE(k.broken_pct, 0) as broken_pct,
    COALESCE(k.unpeel_pct, 0) as unpeel_pct,
    COALESCE(k.isp_pct, 0) as isp_pct,
    COALESCE(k.sw_pct, 0) as sw_pct,
    p.target_broken_pct,
    p.target_unpeel_pct,
    p.target_sw_pct,
    p.target_isp_pct,
    p.target_yield_pct,
    COALESCE(k.downtime_min, 0) as downtime_min
FROM public.v_dashboard_base b
JOIN public.departments d ON b.department_id = d.id
LEFT JOIN public.daily_plan p ON p.department_id = b.department_id AND p.work_date = b.work_date
LEFT JOIN public.daily_actual a ON a.department_id = b.department_id AND a.work_date = b.work_date
LEFT JOIN public.daily_kpi k ON k.department_id = b.department_id AND k.work_date = b.work_date;

-- 5. Cập nhật View v_dashboard_total_daily
CREATE OR REPLACE VIEW public.v_dashboard_total_daily AS
SELECT
    work_date,
    SUM(plan_ton) as total_plan_ton,
    SUM(actual_ton) as total_actual_ton,
    CASE WHEN SUM(plan_ton) > 0 THEN (SUM(actual_ton) / SUM(plan_ton)) * 100 ELSE 0 END as total_achivement_pct,
    SUM(variance_ton) as total_variance_ton,
    SUM(wip_open_ton) as total_wip_open_ton,
    SUM(wip_close_ton) as total_wip_close_ton,
    SUM(input_ton) as total_input_ton,
    SUM(good_output_ton) as total_good_output_ton,
    CASE WHEN SUM(input_ton) > 0 THEN (SUM(good_output_ton) / SUM(input_ton)) * 100 ELSE NULL END as total_yield_pct,
    AVG(NULLIF(broken_pct, 0)) as avg_broken_pct,
    AVG(NULLIF(unpeel_pct, 0)) as avg_unpeel_pct,
    AVG(NULLIF(isp_pct, 0)) as avg_isp_pct,
    AVG(NULLIF(sw_pct, 0)) as avg_sw_pct,
    SUM(downtime_min) as total_downtime_min
FROM public.v_dashboard_daily
GROUP BY work_date;

-- 6. Cấp lại quyền cho View mới thay thế
GRANT SELECT ON public.v_dashboard_daily TO authenticated;
GRANT SELECT ON public.v_dashboard_total_daily TO authenticated;
GRANT SELECT ON public.v_dashboard_daily TO anon;
GRANT SELECT ON public.v_dashboard_total_daily TO anon;
