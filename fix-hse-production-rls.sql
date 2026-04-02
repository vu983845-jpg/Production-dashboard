-- ============================================================
-- FIX: hse_admin không nhập được data production
-- Problem: RLS policies trên daily_kpi, daily_actual, downtime_events
--          chỉ cho phép role = 'admin', không include 'hse_admin'
-- ============================================================

-- STEP 0: Kiểm tra profile hiện tại của hse_admin
SELECT 
    u.email,
    p.role AS profile_role,
    u.raw_user_meta_data->>'role' AS jwt_role,
    p.department_id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'hse_admin@dds.com';

-- ============================================================
-- STEP 1: FIX daily_kpi policies
-- ============================================================
DROP POLICY IF EXISTS "Allow insert/update for admins on daily_kpi" ON public.daily_kpi;
DROP POLICY IF EXISTS "daily_kpi_insert" ON public.daily_kpi;
DROP POLICY IF EXISTS "daily_kpi_update" ON public.daily_kpi;
DROP POLICY IF EXISTS "daily_kpi_delete" ON public.daily_kpi;
DROP POLICY IF EXISTS "Allow all for admins" ON public.daily_kpi;
DROP POLICY IF EXISTS "Allow write for admins and dept_users" ON public.daily_kpi;

-- Write policy: allow admin, hse_admin, dept_user (own dept only)
CREATE POLICY "daily_kpi_write"
ON public.daily_kpi
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'dept_user'
        AND (
            profiles.department_id = daily_kpi.department_id
            OR profiles.secondary_department_id = daily_kpi.department_id
            OR daily_kpi.department_id = ANY(profiles.allowed_dept_ids)
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'dept_user'
        AND (
            profiles.department_id = daily_kpi.department_id
            OR profiles.secondary_department_id = daily_kpi.department_id
            OR daily_kpi.department_id = ANY(profiles.allowed_dept_ids)
        )
    )
);

-- ============================================================
-- STEP 2: FIX daily_actual policies
-- ============================================================
DROP POLICY IF EXISTS "Allow insert/update for admins on daily_actual" ON public.daily_actual;
DROP POLICY IF EXISTS "daily_actual_insert" ON public.daily_actual;
DROP POLICY IF EXISTS "daily_actual_update" ON public.daily_actual;
DROP POLICY IF EXISTS "daily_actual_delete" ON public.daily_actual;
DROP POLICY IF EXISTS "Allow all for admins" ON public.daily_actual;
DROP POLICY IF EXISTS "Allow write for admins and dept_users" ON public.daily_actual;

CREATE POLICY "daily_actual_write"
ON public.daily_actual
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'dept_user'
        AND (
            profiles.department_id = daily_actual.department_id
            OR profiles.secondary_department_id = daily_actual.department_id
            OR daily_actual.department_id = ANY(profiles.allowed_dept_ids)
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'dept_user'
        AND (
            profiles.department_id = daily_actual.department_id
            OR profiles.secondary_department_id = daily_actual.department_id
            OR daily_actual.department_id = ANY(profiles.allowed_dept_ids)
        )
    )
);

-- ============================================================
-- STEP 3: FIX downtime_events policies  
-- ============================================================
DROP POLICY IF EXISTS "Allow insert/update for admins on downtime_events" ON public.downtime_events;
DROP POLICY IF EXISTS "downtime_events_write" ON public.downtime_events;
DROP POLICY IF EXISTS "Allow all for admins" ON public.downtime_events;

CREATE POLICY "downtime_events_write"
ON public.downtime_events
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'dept_user'
        AND (
            profiles.department_id = downtime_events.department_id
            OR profiles.secondary_department_id = downtime_events.department_id
            OR downtime_events.department_id = ANY(profiles.allowed_dept_ids)
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'dept_user'
        AND (
            profiles.department_id = downtime_events.department_id
            OR profiles.secondary_department_id = downtime_events.department_id
            OR downtime_events.department_id = ANY(profiles.allowed_dept_ids)
        )
    )
);

-- ============================================================
-- STEP 4: FIX daily_energy (cũ chỉ check 'admin', thêm 'hse_admin')
-- ============================================================
DROP POLICY IF EXISTS "daily_energy_insert" ON public.daily_energy;
DROP POLICY IF EXISTS "daily_energy_update" ON public.daily_energy;
DROP POLICY IF EXISTS "daily_energy_delete" ON public.daily_energy;

CREATE POLICY "daily_energy_write"
ON public.daily_energy
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
);

-- ============================================================
-- STEP 5: FIX daily_fgwh policies
-- ============================================================
DROP POLICY IF EXISTS "Allow insert/update for admins on daily_fgwh" ON public.daily_fgwh;
DROP POLICY IF EXISTS "daily_fgwh_write" ON public.daily_fgwh;

CREATE POLICY "daily_fgwh_write"
ON public.daily_fgwh
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'dept_user'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'dept_user'
    )
);

-- ============================================================
-- STEP 6: FIX shelling_line_daily policies
-- ============================================================
DROP POLICY IF EXISTS "shelling_line_daily_write" ON public.shelling_line_daily;
DROP POLICY IF EXISTS "Allow write for admins and dept_users" ON public.shelling_line_daily;

CREATE POLICY "shelling_line_daily_write"
ON public.shelling_line_daily
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.departments d ON d.code = 'SHELL'
        WHERE p.id = auth.uid()
        AND p.role = 'dept_user'
        AND (
            p.department_id = d.id
            OR p.secondary_department_id = d.id
            OR d.id = ANY(p.allowed_dept_ids)
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hse_admin', 'maint', 'HSE')
    )
    OR
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'hse_admin', 'maint', 'HSE')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.departments d ON d.code = 'SHELL'
        WHERE p.id = auth.uid()
        AND p.role = 'dept_user'
        AND (
            p.department_id = d.id
            OR p.secondary_department_id = d.id
            OR d.id = ANY(p.allowed_dept_ids)
        )
    )
);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- STEP 7: Verify - check current policies
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('daily_kpi', 'daily_actual', 'downtime_events', 'daily_energy', 'daily_fgwh', 'shelling_line_daily')
ORDER BY tablename, policyname;
