-- 1. Add container columns to tables (if not exists)
ALTER TABLE public.daily_plan ADD COLUMN IF NOT EXISTS plan_container integer NOT NULL DEFAULT 0;
ALTER TABLE public.daily_actual ADD COLUMN IF NOT EXISTS actual_container integer NOT NULL DEFAULT 0;

-- 2. Drop the dependent views before recreating them
DROP VIEW IF EXISTS public.v_dashboard_total_daily;
DROP VIEW IF EXISTS public.v_dashboard_daily;

-- 3. Recreate views with container fields
CREATE OR REPLACE VIEW public.v_dashboard_daily AS
SELECT
    b.work_date,
    b.department_id,
    d.code as dept_code,
    d.name_vi as dept_name_vi,
    d.name_en as dept_name_en,
    d.sort_order as dept_sort_order,
    COALESCE(p.plan_ton, 0) as plan_ton,
    COALESCE(p.plan_container, 0) as plan_container,
    COALESCE(a.actual_ton, 0) as actual_ton,
    COALESCE(a.actual_container, 0) as actual_container,
    CASE WHEN COALESCE(p.plan_ton, 0) > 0 THEN (COALESCE(a.actual_ton, 0) / p.plan_ton) * 100 ELSE 0 END as achivement_pct,
    COALESCE(a.actual_ton, 0) - COALESCE(p.plan_ton, 0) as variance_ton,
    COALESCE(k.wip_open_ton, 0) as wip_open_ton,
    COALESCE(k.wip_close_ton, 0) as wip_close_ton,
    COALESCE(k.input_ton, 0) as input_ton,
    COALESCE(k.good_output_ton, 0) as good_output_ton,
    CASE WHEN COALESCE(k.input_ton, 0) > 0 THEN (COALESCE(k.good_output_ton, 0) / k.input_ton) * 100 ELSE NULL END as yield_pct,
    COALESCE(k.downtime_min, 0) as downtime_min
FROM public.v_dashboard_base b
JOIN public.departments d ON b.department_id = d.id
LEFT JOIN public.daily_plan p ON p.department_id = b.department_id AND p.work_date = b.work_date
LEFT JOIN public.daily_actual a ON a.department_id = b.department_id AND a.work_date = b.work_date
LEFT JOIN public.daily_kpi k ON k.department_id = b.department_id AND k.work_date = b.work_date;

CREATE OR REPLACE VIEW public.v_dashboard_total_daily AS
SELECT
    work_date,
    SUM(plan_ton) as total_plan_ton,
    SUM(plan_container) as total_plan_container,
    SUM(actual_ton) as total_actual_ton,
    SUM(actual_container) as total_actual_container,
    CASE WHEN SUM(plan_ton) > 0 THEN (SUM(actual_ton) / SUM(plan_ton)) * 100 ELSE 0 END as total_achivement_pct,
    SUM(variance_ton) as total_variance_ton,
    SUM(wip_open_ton) as total_wip_open_ton,
    SUM(wip_close_ton) as total_wip_close_ton,
    SUM(input_ton) as total_input_ton,
    SUM(good_output_ton) as total_good_output_ton,
    CASE WHEN SUM(input_ton) > 0 THEN (SUM(good_output_ton) / SUM(input_ton)) * 100 ELSE NULL END as total_yield_pct,
    SUM(downtime_min) as total_downtime_min
FROM public.v_dashboard_daily
GROUP BY work_date;

GRANT SELECT ON public.v_dashboard_daily TO authenticated;
GRANT SELECT ON public.v_dashboard_total_daily TO authenticated;
