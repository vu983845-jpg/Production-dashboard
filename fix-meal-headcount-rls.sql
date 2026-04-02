-- Fix RLS for meal_headcount table
-- Allow hr_admin, hse_admin, admin to UPDATE and DELETE records

-- Step 1: Check current policies (info only)
-- SELECT policyname, cmd, roles, qual FROM pg_policies WHERE tablename = 'meal_headcount';

-- Step 2: Drop existing update/delete policies if any
DROP POLICY IF EXISTS "meal_headcount_update" ON public.meal_headcount;
DROP POLICY IF EXISTS "meal_headcount_delete" ON public.meal_headcount;
DROP POLICY IF EXISTS "Allow update for admins" ON public.meal_headcount;
DROP POLICY IF EXISTS "Allow delete for admins" ON public.meal_headcount;
DROP POLICY IF EXISTS "meal_update_admin" ON public.meal_headcount;
DROP POLICY IF EXISTS "meal_delete_admin" ON public.meal_headcount;

-- Step 3: Create new update policy for admin roles
CREATE POLICY "meal_update_admin"
ON public.meal_headcount
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hr_admin', 'hse_admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hr_admin', 'hse_admin')
    )
);

-- Step 4: Create new delete policy for admin roles
CREATE POLICY "meal_delete_admin"
ON public.meal_headcount
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hr_admin', 'hse_admin')
    )
);

-- Step 5: Also ensure INSERT policy exists
DROP POLICY IF EXISTS "meal_insert_admin" ON public.meal_headcount;
CREATE POLICY "meal_insert_admin"
ON public.meal_headcount
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'hr_admin', 'hse_admin')
    )
);

-- Step 6: Ensure SELECT is still open
DROP POLICY IF EXISTS "meal_select_all" ON public.meal_headcount;
CREATE POLICY "meal_select_all"
ON public.meal_headcount
FOR SELECT
USING (auth.role() = 'authenticated');

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
