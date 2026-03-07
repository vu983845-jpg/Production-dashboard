-- 1. Cập nhật chính sách cho daily_actual
DROP POLICY IF EXISTS "daily_actual_select" ON public.daily_actual;
CREATE POLICY "daily_actual_select" ON public.daily_actual FOR SELECT TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid()) OR
    department_id = (SELECT secondary_department_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "daily_actual_insert" ON public.daily_actual;
CREATE POLICY "daily_actual_insert" ON public.daily_actual FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid()) OR
    department_id = (SELECT secondary_department_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "daily_actual_update" ON public.daily_actual;
CREATE POLICY "daily_actual_update" ON public.daily_actual FOR UPDATE TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid()) OR
    department_id = (SELECT secondary_department_id FROM public.profiles WHERE id = auth.uid())
);

-- 2. Cập nhật chính sách cho daily_kpi
DROP POLICY IF EXISTS "daily_kpi_select" ON public.daily_kpi;
CREATE POLICY "daily_kpi_select" ON public.daily_kpi FOR SELECT TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid()) OR
    department_id = (SELECT secondary_department_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "daily_kpi_insert" ON public.daily_kpi;
CREATE POLICY "daily_kpi_insert" ON public.daily_kpi FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid()) OR
    department_id = (SELECT secondary_department_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "daily_kpi_update" ON public.daily_kpi;
CREATE POLICY "daily_kpi_update" ON public.daily_kpi FOR UPDATE TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
    department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid()) OR
    department_id = (SELECT secondary_department_id FROM public.profiles WHERE id = auth.uid())
);
