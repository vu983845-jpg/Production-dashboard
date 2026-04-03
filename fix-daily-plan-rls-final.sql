-- ============================================================
-- FINAL FIX: daily_plan RLS - Drop tất cả, tạo lại sạch
-- Lỗi: shelling không lưu được kế hoạch Borma với cutoff < 30
-- ============================================================

-- STEP 0: Xem tất cả policy hiện tại trên daily_plan (để debug)
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'daily_plan';

-- STEP 1: Drop TẤT CẢ policies trên daily_plan (không quan tâm tên gì)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'daily_plan' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.daily_plan';
        RAISE NOTICE 'Dropped policy: %', r.policyname;
    END LOOP;
END $$;

-- STEP 2: Tắt RLS tạm thời rồi bật lại để clear cache
ALTER TABLE public.daily_plan DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plan ENABLE ROW LEVEL SECURITY;

-- STEP 3: Tạo policy SELECT (read) - tất cả authenticated đều đọc được
CREATE POLICY "daily_plan_select"
ON public.daily_plan
FOR SELECT TO authenticated
USING (true);

-- STEP 4: Tạo policy INSERT - hỗ trợ multi-dept
CREATE POLICY "daily_plan_insert"
ON public.daily_plan
FOR INSERT TO authenticated
WITH CHECK (
    -- Admin/hse_admin/maint đều được
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    -- dept_user: department chính, phụ, hoặc trong allowed_dept_ids
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'dept_user'
        AND (
            p.department_id = daily_plan.department_id
            OR p.secondary_department_id = daily_plan.department_id
            OR daily_plan.department_id = ANY(p.allowed_dept_ids)
        )
    )
);

-- STEP 5: Tạo policy UPDATE - hỗ trợ multi-dept
CREATE POLICY "daily_plan_update"
ON public.daily_plan
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'dept_user'
        AND (
            p.department_id = daily_plan.department_id
            OR p.secondary_department_id = daily_plan.department_id
            OR daily_plan.department_id = ANY(p.allowed_dept_ids)
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'dept_user'
        AND (
            p.department_id = daily_plan.department_id
            OR p.secondary_department_id = daily_plan.department_id
            OR daily_plan.department_id = ANY(p.allowed_dept_ids)
        )
    )
);

-- STEP 6: Tạo policy DELETE (chỉ admin)
CREATE POLICY "daily_plan_delete"
ON public.daily_plan
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'hse_admin')
    )
);

-- STEP 7: Reload PostgREST
NOTIFY pgrst, 'reload schema';

-- STEP 8: Xác nhận shelling có Borma trong profile
SELECT 
    u.email,
    p.role,
    p.department_id,
    (SELECT code FROM departments WHERE id = p.department_id) AS dept_code,
    p.allowed_dept_ids,
    ARRAY(SELECT d.name_en FROM departments d WHERE d.id = ANY(p.allowed_dept_ids)) AS allowed_dept_names
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'shelling@dds.com';

-- STEP 9: Xác nhận policies mới
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'daily_plan'
ORDER BY policyname;
