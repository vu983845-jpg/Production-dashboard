-- 1. Thêm cột plan_isp_ton vào bảng daily_plan
ALTER TABLE public.daily_plan ADD COLUMN IF NOT EXISTS plan_isp_ton numeric(10,3) DEFAULT 0;

-- 2. Drop views
DROP VIEW IF EXISTS public.v_dashboard_total_daily CASCADE;
DROP VIEW IF EXISTS public.v_dashboard_daily CASCADE;

-- 3. Tạo lại v_dashboard_daily với cột plan_isp_ton
CREATE OR REPLACE VIEW public.v_dashboard_daily AS
WITH kpi_with_prev AS (
    SELECT 
        *,
        LAG(electricity_meter_reading) OVER (PARTITION BY department_id ORDER BY work_date) as prev_electricity_meter_reading,
        LEAD(electricity_meter_reading) OVER (PARTITION BY department_id ORDER BY work_date) as next_electricity_meter_reading
    FROM public.daily_kpi
)
SELECT
    b.work_date,
    b.department_id,
    d.code as dept_code,
    d.name_vi as dept_name_vi,
    d.name_en as dept_name_en,
    d.sort_order as dept_sort_order,
    COALESCE(p.plan_ton, 0) as plan_ton,
    COALESCE(p.plan_isp_ton, 0) as plan_isp_ton,
    COALESCE(a.actual_ton, 0) as actual_ton,
    COALESCE(p.plan_container, 0) as plan_container,
    COALESCE(a.actual_container, 0) as actual_container,
    COALESCE(a.isp_ton, 0) as isp_ton,
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
    COALESCE(k.electricity_meter_reading, 0) as electricity_meter_reading,
    COALESCE(k.next_electricity_meter_reading - k.electricity_meter_reading, 0) as electricity_consumption_kwh,
    p.target_broken_pct,
    p.target_unpeel_pct,
    p.target_sw_pct,
    p.target_isp_pct,
    p.target_yield_pct,
    COALESCE(p.target_electricity_kwh, 0) as target_electricity_kwh,
    COALESCE(k.downtime_min, 0) as downtime_min
FROM public.v_dashboard_base b
JOIN public.departments d ON b.department_id = d.id
LEFT JOIN public.daily_plan p ON p.department_id = b.department_id AND p.work_date = b.work_date
LEFT JOIN public.daily_actual a ON a.department_id = b.department_id AND a.work_date = b.work_date
LEFT JOIN kpi_with_prev k ON k.department_id = b.department_id AND k.work_date = b.work_date;

-- 4. Tạo lại v_dashboard_total_daily
CREATE OR REPLACE VIEW public.v_dashboard_total_daily AS
SELECT
    d.work_date,
    d.total_plan_ton,
    d.total_actual_ton,
    d.total_plan_container,
    d.total_actual_container,
    d.total_achivement_pct,
    d.total_variance_ton,
    d.total_wip_open_ton,
    d.total_wip_close_ton,
    d.total_input_ton,
    d.total_good_output_ton,
    d.total_yield_pct,
    d.avg_broken_pct,
    d.avg_unpeel_pct,
    d.avg_isp_pct,
    d.avg_sw_pct,
    d.total_downtime_min,
    COALESCE(f.plan_isp_ton, 0) as total_plan_isp_ton,
    COALESCE(f.actual_isp_ton, 0) as total_actual_isp_ton,
    COALESCE(f.plan_non_isp_ton, 0) as total_plan_non_isp_ton,
    COALESCE(f.actual_non_isp_ton, 0) as total_actual_non_isp_ton
FROM (
    SELECT
        work_date,
        SUM(plan_ton) as total_plan_ton,
        SUM(actual_ton) as total_actual_ton,
        SUM(plan_container) as total_plan_container,
        SUM(actual_container) as total_actual_container,
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
    GROUP BY work_date
) d
LEFT JOIN public.daily_fgwh f ON f.work_date = d.work_date;

GRANT SELECT ON public.v_dashboard_daily TO authenticated;
GRANT SELECT ON public.v_dashboard_total_daily TO authenticated;
GRANT SELECT ON public.v_dashboard_daily TO anon;
GRANT SELECT ON public.v_dashboard_total_daily TO anon;

NOTIFY pgrst, 'reload schema';
