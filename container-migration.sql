-- Run this script in your Supabase SQL Editor to migrate Container metrics
-- It extracts container data out of department tables and moves it to a standalone table.

-- 1. Create the singular daily_containers table
CREATE TABLE IF NOT EXISTS public.daily_containers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_date date UNIQUE NOT NULL,
    plan_container integer NOT NULL DEFAULT 0,
    actual_container integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Migrate existing container data (aggregating any accidently scattered data)
INSERT INTO public.daily_containers (work_date, plan_container, actual_container)
SELECT 
    COALESCE(p.work_date, a.work_date) as work_date,
    SUM(COALESCE(p.plan_container, 0)) as plan_container,
    SUM(COALESCE(a.actual_container, 0)) as actual_container
FROM (SELECT work_date, department_id, plan_container FROM public.daily_plan WHERE plan_container > 0) p
FULL OUTER JOIN (SELECT work_date, department_id, actual_container FROM public.daily_actual WHERE actual_container > 0) a
ON p.work_date = a.work_date AND p.department_id = a.department_id
GROUP BY COALESCE(p.work_date, a.work_date)
ON CONFLICT (work_date) DO UPDATE SET 
    plan_container = EXCLUDED.plan_container,
    actual_container = EXCLUDED.actual_container;

-- 3. Drop Views relying on the old columns
DROP VIEW IF EXISTS public.v_dashboard_total_daily;
DROP VIEW IF EXISTS public.v_dashboard_daily;

-- 4. Drop the old columns from department tables
ALTER TABLE public.daily_plan DROP COLUMN IF EXISTS plan_container;
ALTER TABLE public.daily_actual DROP COLUMN IF EXISTS actual_container;

-- 5. Recreate View: v_dashboard_daily (Without Container columns)
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
    COALESCE(k.downtime_min, 0) as downtime_min
FROM public.v_dashboard_base b
JOIN public.departments d ON b.department_id = d.id
LEFT JOIN public.daily_plan p ON p.department_id = b.department_id AND p.work_date = b.work_date
LEFT JOIN public.daily_actual a ON a.department_id = b.department_id AND a.work_date = b.work_date
LEFT JOIN public.daily_kpi k ON k.department_id = b.department_id AND k.work_date = b.work_date;

-- 6. Recreate View: v_dashboard_total_daily (Joining the new standalone container table)
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
    d.total_downtime_min,
    COALESCE(c.plan_container, 0) as total_plan_container,
    COALESCE(c.actual_container, 0) as total_actual_container
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
        SUM(downtime_min) as total_downtime_min
    FROM public.v_dashboard_daily
    GROUP BY work_date
) d
LEFT JOIN public.daily_containers c ON c.work_date = d.work_date;

GRANT SELECT ON public.v_dashboard_daily TO authenticated;
GRANT SELECT ON public.v_dashboard_total_daily TO authenticated;

-- 7. Add Row Level Security ensuring ONLY Packing (PACK) or admins can edit Containers
ALTER TABLE public.daily_containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "containers_select" ON public.daily_containers FOR SELECT TO authenticated USING (true);
CREATE POLICY "containers_insert" ON public.daily_containers FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    (SELECT code FROM public.departments WHERE id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())) = 'PACK'
);
CREATE POLICY "containers_update" ON public.daily_containers FOR UPDATE TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    (SELECT code FROM public.departments WHERE id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())) = 'PACK'
);
