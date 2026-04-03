-- Fix RLS Policies for daily_plan to support multi-department access (allowed_dept_ids)
-- Lỗi: shelling@dds.com không thể lưu kế hoạch cho Borma vì RLS chỉ check department_id đơn

BEGIN;

-- 1. Drop existing policies
DROP POLICY IF EXISTS "daily_plan_insert" ON public.daily_plan;
DROP POLICY IF EXISTS "daily_plan_update" ON public.daily_plan;

-- 2. Tạo lại policy INSERT hỗ trợ cả allowed_dept_ids
CREATE POLICY "daily_plan_insert" ON public.daily_plan
FOR INSERT TO authenticated
WITH CHECK (
    -- Admin được phép tất cả
    public.get_user_role() = 'admin'
    OR
    -- dept_user chỉ được phép cho department của họ
    department_id = public.get_user_department()
    OR
    -- dept_user với nhiều dept (allowed_dept_ids): kiểm tra department_id nằm trong mảng
    department_id = ANY(
        SELECT unnest(allowed_dept_ids)
        FROM public.profiles
        WHERE id = auth.uid()
    )
);

-- 3. Tạo lại policy UPDATE hỗ trợ cả allowed_dept_ids
CREATE POLICY "daily_plan_update" ON public.daily_plan
FOR UPDATE TO authenticated
USING (
    -- Admin được phép tất cả
    public.get_user_role() = 'admin'
    OR
    -- dept_user chỉ được phép cho department của họ
    department_id = public.get_user_department()
    OR
    -- dept_user với nhiều dept (allowed_dept_ids): kiểm tra department_id nằm trong mảng
    department_id = ANY(
        SELECT unnest(allowed_dept_ids)
        FROM public.profiles
        WHERE id = auth.uid()
    )
);

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 4. Kiểm tra shelling có access Borma không
-- (Chạy với tư cách shelling@dds.com để test, hoặc kiểm tra profile)
SELECT 
    p.id,
    u.email,
    p.role,
    p.department_id,
    p.allowed_dept_ids,
    ARRAY(SELECT d.name_en FROM public.departments d WHERE d.id = ANY(p.allowed_dept_ids)) AS allowed_dept_names
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email IN ('shelling@dds.com', 'borma@dds.com');
