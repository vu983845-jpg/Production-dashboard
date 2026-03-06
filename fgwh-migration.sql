-- FGWH Migration Script
-- Run this in your Supabase SQL Editor

BEGIN;

-- 1. Rename the existing table to track FGWH instead of Containers
ALTER TABLE public.daily_containers RENAME TO daily_fgwh;

-- 2. Rename existing columns to track ISP and change data type to numeric (since it's tons)
ALTER TABLE public.daily_fgwh RENAME COLUMN plan_container TO plan_isp_ton;
ALTER TABLE public.daily_fgwh RENAME COLUMN actual_container TO actual_isp_ton;

ALTER TABLE public.daily_fgwh ALTER COLUMN plan_isp_ton TYPE numeric USING plan_isp_ton::numeric;
ALTER TABLE public.daily_fgwh ALTER COLUMN actual_isp_ton TYPE numeric USING actual_isp_ton::numeric;

-- 3. Add columns for Non-ISP
ALTER TABLE public.daily_fgwh ADD COLUMN IF NOT EXISTS plan_non_isp_ton numeric NOT NULL DEFAULT 0;
ALTER TABLE public.daily_fgwh ADD COLUMN IF NOT EXISTS actual_non_isp_ton numeric NOT NULL DEFAULT 0;

-- 4. Update the departments with the requested English-only names (Using your requested names for both vi and en)
UPDATE public.departments SET name_vi = 'RCN', name_en = 'RCN' WHERE code = 'RCN';
UPDATE public.departments SET name_vi = 'STEAMING', name_en = 'STEAMING' WHERE code = 'STEAM';
UPDATE public.departments SET name_vi = 'SHELLING', name_en = 'SHELLING' WHERE code = 'SHELL';
UPDATE public.departments SET name_vi = 'BORMA', name_en = 'BORMA' WHERE code = 'BORMA';
UPDATE public.departments SET name_vi = 'PEELING MC', name_en = 'PEELING MC' WHERE code = 'PEEL_MC';
UPDATE public.departments SET name_vi = 'COLORSORTER', name_en = 'COLORSORTER' WHERE code = 'CS';
UPDATE public.departments SET name_vi = 'HANDPEELING', name_en = 'HANDPEELING' WHERE code = 'HAND';
UPDATE public.departments SET name_vi = 'PACKING', name_en = 'PACKING' WHERE code = 'PACK';

-- 5. Insert FGWH into departments
INSERT INTO public.departments (code, name_vi, name_en, sort_order)
VALUES ('FGWH', 'FGWH', 'FGWH', 9)
ON CONFLICT (code) DO UPDATE SET name_vi = EXCLUDED.name_vi, name_en = EXCLUDED.name_en;

-- 6. Rebuild Views
DROP VIEW IF EXISTS public.v_dashboard_total_daily CASCADE;
DROP VIEW IF EXISTS public.v_dashboard_daily CASCADE;

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

CREATE OR REPLACE VIEW public.v_dashboard_total_daily AS
SELECT
    d.work_date,
    d.total_plan_ton,
    d.total_actual_ton,
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

-- 7. Update FGWH RLS
DROP POLICY IF EXISTS "containers_select" ON public.daily_fgwh;
DROP POLICY IF EXISTS "containers_insert" ON public.daily_fgwh;
DROP POLICY IF EXISTS "containers_update" ON public.daily_fgwh;

CREATE POLICY "fgwh_select" ON public.daily_fgwh FOR SELECT TO authenticated USING (true);
CREATE POLICY "fgwh_insert" ON public.daily_fgwh FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    (SELECT code FROM public.departments WHERE id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())) = 'FGWH'
);
CREATE POLICY "fgwh_update" ON public.daily_fgwh FOR UPDATE TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    (SELECT code FROM public.departments WHERE id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())) = 'FGWH'
);

NOTIFY pgrst, 'reload schema';

COMMIT;
