-- Fix RLS Policies for daily_plan to allow dept_user to input plans for their own department

BEGIN;

-- 1. Drop existing admin-only policies on daily_plan
DROP POLICY IF EXISTS "daily_plan_insert" ON public.daily_plan;
DROP POLICY IF EXISTS "daily_plan_update" ON public.daily_plan;

-- 2. Create new policies allowing dept_user to insert/update for their own department
CREATE POLICY "daily_plan_insert" ON public.daily_plan 
FOR INSERT TO authenticated 
WITH CHECK (
    public.get_user_role() = 'admin' OR 
    department_id = public.get_user_department()
);

CREATE POLICY "daily_plan_update" ON public.daily_plan 
FOR UPDATE TO authenticated 
USING (
    public.get_user_role() = 'admin' OR 
    department_id = public.get_user_department()
);

COMMIT;

-- 3. Reload cache just in case
NOTIFY pgrst, 'reload schema';
